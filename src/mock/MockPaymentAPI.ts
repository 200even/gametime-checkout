import type { PaymentAPI } from '../payments/PaymentAPI';
import { PaymentError } from '../payments/types';
import type { Confirmation, Order, OrderSnapshot, PaymentIntent, Settlement } from '../payments/types';
import type { Database, MockBackendStore, StoredIntent } from './MockBackendStore';

export interface MockScenario {
  settlement: Settlement;
  processingMs: number;
  loseCreateResponse?: boolean;
  loseConfirmResponse?: boolean;
  statusTimeoutsAfterConfirm?: number;
}

export class ResponseLostError extends Error {
  constructor() { super('Simulated network timeout after backend commit'); }
}

function view(intent: StoredIntent): PaymentIntent {
  return {
    id: intent.id, orderId: intent.orderId, orderVersion: intent.orderVersion,
    amountCents: intent.amountCents, currency: intent.currency, status: intent.status,
  };
}
function findOrder(db: Database, id: string): Order {
  const order = db.orders.find(item => item.id === id);
  if (!order) throw new PaymentError('NOT_FOUND');
  return order;
}
function findIntent(db: Database, id: string): StoredIntent {
  const intent = db.intents.find(item => item.id === id);
  if (!intent) throw new PaymentError('NOT_FOUND');
  return intent;
}
function active(intent: StoredIntent): boolean {
  return intent.status === 'requires_action' || intent.status === 'processing' || intent.status === 'succeeded';
}

export class MockPaymentAPI implements PaymentAPI {
  private statusTimeouts = 0;
  constructor(
    private readonly store: MockBackendStore,
    private readonly now: () => number,
    private readonly newId: () => string,
    private readonly scenario: MockScenario = { settlement: 'succeeded', processingMs: 0 },
  ) {}

  getReviewOrderId(): Promise<string> {
    return this.store.transact(db => {
      const latest = db.orders.at(-1);
      if (!latest) throw new PaymentError('NOT_FOUND');
      return latest.id;
    });
  }

  async seedOrder(id: string, amountCents: number): Promise<void> {
    this.validateAmount(amountCents);
    await this.store.transact(db => {
      if (!db.orders.some(order => order.id === id)) {
        db.orders.push({ id, amountCents, version: 1, currency: 'USD', paidIntentId: null });
      }
    });
  }

  async changeOrderAmount(id: string, amountCents: number): Promise<void> {
    this.validateAmount(amountCents);
    await this.store.transact(db => {
      this.settle(db);
      const order = findOrder(db, id);
      if (order.paidIntentId) throw new PaymentError('ORDER_PAID');
      if (db.intents.some(intent => intent.orderId === id && intent.status === 'processing')) {
        throw new PaymentError('ACTIVE_ATTEMPT');
      }
      order.amountCents = amountCents;
      order.version += 1;
    });
  }

  getOrder(orderId: string): Promise<OrderSnapshot> {
    if (this.consumeStatusTimeout()) return Promise.reject(new Error('Simulated status request timeout'));
    return this.store.transact(db => {
      this.settle(db);
      const order = findOrder(db, orderId);
      const intent = db.intents.find(item => item.orderId === orderId && active(item));
      return { order: { ...order }, activeIntent: intent ? view(intent) : null,
        chargeCount: db.charges.filter(charge => charge.orderId === orderId).length };
    });
  }

  async createIntent(orderId: string, attemptKey: string): Promise<PaymentIntent> {
    if (!attemptKey) throw new PaymentError('INVALID_REQUEST');
    const result = await this.store.transact(db => {
      this.settle(db);
      const previous = db.intents.find(intent => intent.attemptKey === attemptKey);
      if (previous) {
        if (previous.orderId !== orderId) throw new PaymentError('KEY_CONFLICT');
        return view(previous);
      }
      const order = findOrder(db, orderId);
      if (order.paidIntentId) throw new PaymentError('ORDER_PAID');
      if (db.intents.some(intent => intent.orderId === orderId && active(intent))) {
        throw new PaymentError('ACTIVE_ATTEMPT');
      }
      const intent: StoredIntent = {
        id: this.newId(), orderId, orderVersion: order.version, amountCents: order.amountCents,
        currency: order.currency, status: 'requires_action', attemptKey, confirmation: null,
        processingUntil: null, settlement: 'succeeded',
      };
      db.intents.push(intent);
      return view(intent);
    });
    // Fault injection is deliberately after the durable write, never before it.
    if (this.scenario.loseCreateResponse) throw new ResponseLostError();
    return result;
  }

  async confirmIntent(id: string, payload: Confirmation, key: string): Promise<PaymentIntent> {
    if (!key || !payload.providerToken.startsWith('mock_token_')
      || !['card', 'apple_pay', 'google_pay', 'affirm'].includes(payload.method)) {
      throw new PaymentError('INVALID_REQUEST');
    }
    const result = await this.store.transact(db => {
      this.settle(db);
      const intent = findIntent(db, id);
      const other = db.intents.find(item => item.confirmation?.key === key && item.id !== id);
      if (other) throw new PaymentError('KEY_CONFLICT');
      if (intent.confirmation) {
        if (intent.confirmation.key !== key || intent.confirmation.method !== payload.method
          || intent.confirmation.providerToken !== payload.providerToken) throw new PaymentError('KEY_CONFLICT');
        return view(intent);
      }
      const order = findOrder(db, intent.orderId);
      if (order.paidIntentId) throw new PaymentError('ORDER_PAID');
      if (order.version !== intent.orderVersion || order.amountCents !== intent.amountCents) {
        throw new PaymentError('ORDER_CHANGED');
      }
      if (intent.status !== 'requires_action') throw new PaymentError('INVALID_STATE');
      intent.confirmation = { ...payload, key };
      intent.status = 'processing';
      intent.processingUntil = this.now() + this.scenario.processingMs;
      intent.settlement = this.scenario.settlement;
      this.settle(db);
      return view(intent);
    });
    if (this.scenario.loseConfirmResponse) {
      this.statusTimeouts = this.scenario.statusTimeoutsAfterConfirm ?? 0;
      throw new ResponseLostError();
    }
    return result;
  }

  getIntent(id: string): Promise<PaymentIntent> {
    if (this.consumeStatusTimeout()) return Promise.reject(new Error('Simulated status request timeout'));
    return this.store.transact(db => { this.settle(db); return view(findIntent(db, id)); });
  }

  cancelIntent(id: string): Promise<PaymentIntent> {
    return this.store.transact(db => {
      this.settle(db);
      const intent = findIntent(db, id);
      if (intent.status === 'requires_action') intent.status = 'cancelled';
      return view(intent);
    });
  }

  private settle(db: Database): void {
    for (const intent of db.intents) {
      if (intent.status !== 'processing' || intent.processingUntil === null || intent.processingUntil > this.now()) continue;
      const order = findOrder(db, intent.orderId);
      if (intent.settlement === 'failed') { intent.status = 'failed'; continue; }
      if (order.paidIntentId && order.paidIntentId !== intent.id) throw new Error('Mock order charge invariant violated');
      if (!db.charges.some(charge => charge.intentId === intent.id)) {
        db.charges.push({ orderId: order.id, intentId: intent.id, amountCents: intent.amountCents });
      }
      order.paidIntentId = intent.id;
      intent.status = 'succeeded';
    }
  }

  private validateAmount(amount: number): void {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new PaymentError('INVALID_REQUEST');
  }

  private consumeStatusTimeout(): boolean {
    if (this.statusTimeouts === 0) return false;
    this.statusTimeouts -= 1;
    return true;
  }
}
