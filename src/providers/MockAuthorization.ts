import type { Authorization, PaymentMethod } from '../payments/types';

export interface AuthorizationRequest { method: PaymentMethod; finish: (result: 'authorized' | 'cancelled' | 'error') => void }

export class MockAuthorization {
  private pending: AuthorizationRequest | null = null;
  private readonly listeners = new Set<(request: AuthorizationRequest | null) => void>();

  constructor(private readonly newId: () => string) {}

  subscribe(listener: (request: AuthorizationRequest | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.pending);
    return () => { this.listeners.delete(listener); };
  }

  authorize(method: PaymentMethod): Promise<Authorization> {
    if (this.pending) return Promise.resolve({ kind: 'error', message: 'Authorization is already open.' });
    return new Promise(resolve => {
      let finished = false;
      this.pending = { method, finish: result => {
        if (finished) return;
        finished = true;
        this.pending = null;
        this.publish();
        if (result === 'authorized') resolve({ kind: 'authorized', providerToken: `mock_token_${this.newId()}` });
        else if (result === 'cancelled') resolve({ kind: 'cancelled' });
        else resolve({ kind: 'error', message: 'Mock provider could not authorize. Try another payment method.' });
      } };
      this.publish();
    });
  }

  cancel(): void { this.pending?.finish('cancelled'); }

  private publish(): void { for (const listener of this.listeners) listener(this.pending); }
}
