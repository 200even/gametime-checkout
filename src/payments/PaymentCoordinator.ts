import type { PaymentAPI } from './PaymentAPI';
import { PaymentError } from './types';
import type {
  Authorization, CheckoutState, CheckoutStatus, PaymentIntent, PaymentMethod, RecoveryRecord, RecoveryStore,
} from './types';

export class PaymentCoordinator {
  private state: CheckoutState = { status: 'idle', intent: null, message: null };
  private readonly listeners = new Set<(state: CheckoutState) => void>();
  private inFlight: Promise<CheckoutState> | null = null;

  constructor(
    private readonly api: PaymentAPI,
    private readonly recovery: RecoveryStore,
    private readonly newKey: () => string,
  ) {}

  getState(): CheckoutState { return this.state; }

  subscribe(listener: (state: CheckoutState) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  submit(orderId: string, method: PaymentMethod, authorize: () => Promise<Authorization>): Promise<CheckoutState> {
    return this.exclusive(() => this.performSubmit(orderId, method, authorize));
  }

  reconcile(orderId: string): Promise<CheckoutState> {
    return this.exclusive(() => this.recover(orderId));
  }

  private exclusive(operation: () => Promise<CheckoutState>): Promise<CheckoutState> {
    if (this.inFlight) return this.inFlight;
    const running = operation().finally(() => { this.inFlight = null; });
    this.inFlight = running;
    return running;
  }

  private async performSubmit(
    orderId: string, method: PaymentMethod, authorize: () => Promise<Authorization>,
  ): Promise<CheckoutState> {
    let record: RecoveryRecord | null = null;
    let requestMayHaveStarted = false;
    try {
      const pending = await this.recovery.read();
      if (pending) return await this.recover(pending.orderId);
      const snapshot = await this.api.getOrder(orderId);
      if (snapshot.activeIntent) return await this.resolve(snapshot.activeIntent);

      record = { orderId, attemptKey: this.newKey(), confirmationKey: this.newKey(), intentId: null, phase: 'creating' };
      // Persist before create: a response can be lost after the backend has committed the intent.
      await this.recovery.write(record);
      requestMayHaveStarted = true;
      const intent = await this.api.createIntent(orderId, record.attemptKey);
      record = { ...record, intentId: intent.id, phase: 'authorizing' };
      await this.recovery.write(record);
      if (intent.status !== 'requires_action') return await this.resolve(intent);
      this.update('authorizing', intent);
      const authorization = await authorize();
      if (authorization.kind !== 'authorized') {
        const result = await this.api.cancelIntent(intent.id);
        await this.resolve(result);
        if (result.status === 'cancelled' && authorization.kind === 'error') {
          return this.update('error', result, authorization.message);
        }
        return this.state;
      }
      record = { ...record, phase: 'confirming' };
      await this.recovery.write(record);
      this.update('processing', intent);
      const confirmed = await this.api.confirmIntent(intent.id, {
        method, providerToken: authorization.providerToken,
      }, record.confirmationKey);
      return await this.resolve(confirmed);
    } catch (error: unknown) {
      if (error instanceof PaymentError && error.code === 'ORDER_CHANGED' && record?.intentId) {
        try {
          const cancelled = await this.api.cancelIntent(record.intentId);
          await this.resolve(cancelled);
          if (cancelled.status === 'cancelled') return this.update('order_changed', cancelled, 'Order changed. Review the updated total.');
          return this.state;
        } catch {
          return this.update('checking', this.state.intent, 'Could not verify payment. Check status before trying again.');
        }
      }
      if (!requestMayHaveStarted) {
        return this.update('error', null, 'Could not load or save checkout. No payment was submitted.');
      }
      // A rejected request is an unknown outcome; recover instead of issuing another confirmation.
      this.update('checking', this.state.intent, 'Checking payment status.');
      return await this.recover(orderId);
    }
  }

  private async recover(orderId: string): Promise<CheckoutState> {
    this.update('checking', this.state.intent, 'Checking payment status.');
    try {
      const record = await this.recovery.read();
      if (record && record.orderId !== orderId) {
        return this.update('checking', null, 'Another order has an unresolved payment.');
      }
      if (record?.intentId) return await this.resolve(await this.api.getIntent(record.intentId));
      // Lookup also recovers an active or paid order after client-only storage reset.
      const snapshot = await this.api.getOrder(orderId);
      if (snapshot.activeIntent) return await this.resolve(snapshot.activeIntent);
      if (record) return await this.resolve(await this.api.createIntent(orderId, record.attemptKey));
      return this.update('idle', null);
    } catch {
      return this.update('checking', this.state.intent, 'Could not verify payment. Check status before trying again.');
    }
  }

  private async resolve(intent: PaymentIntent): Promise<CheckoutState> {
    if (intent.status === 'requires_action') {
      // Mock authorization cannot finish outside this process. Atomic cancellation cannot undo a committed confirm.
      return await this.resolve(await this.api.cancelIntent(intent.id));
    }
    if (intent.status === 'processing') return this.update('processing', intent);
    const status = intent.status === 'failed' ? 'declined' : intent.status;
    this.update(status, intent);
    try {
      await this.recovery.clear();
    } catch {
      // Authoritative success stays success even if local cleanup fails. Next launch repeats the lookup.
      return this.update(status, intent, 'Payment status verified; local recovery cleanup will retry on next check.');
    }
    return this.state;
  }

  private update(status: CheckoutStatus, intent: PaymentIntent | null, message: string | null = null): CheckoutState {
    this.state = { status, intent, message };
    for (const listener of this.listeners) listener(this.state);
    return this.state;
  }
}
