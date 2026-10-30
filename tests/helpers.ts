import type { KeyValueStorage } from '../src/storage/KeyValueStorage';
import { ClientRecoveryStore } from '../src/storage/ClientRecoveryStore';
import { MockBackendStore } from '../src/mock/MockBackendStore';
import { MockPaymentAPI } from '../src/mock/MockPaymentAPI';
import type { MockScenario } from '../src/mock/MockPaymentAPI';
import { PaymentCoordinator } from '../src/payments/PaymentCoordinator';
import type { PaymentAPI } from '../src/payments/PaymentAPI';

export class MemoryStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();
  failWriteKey: string | null = null;
  failRemove = false;
  async getItem(key: string): Promise<string | null> { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string): Promise<void> {
    if (key === this.failWriteKey) throw new Error('Simulated disk write failure');
    this.values.set(key, value);
  }
  async removeItem(key: string): Promise<void> {
    if (this.failRemove) throw new Error('Simulated disk removal failure');
    this.values.delete(key);
  }
}

export const ORDER = 'order-1';
export const CARD = { method: 'card', providerToken: 'mock_token_card' } satisfies Parameters<PaymentAPI['confirmIntent']>[1];
export const authorize = () => Promise.resolve({ kind: 'authorized', providerToken: CARD.providerToken } as const);

export async function fixture(scenario: MockScenario = { settlement: 'succeeded', processingMs: 0 }) {
  const storage = new MemoryStorage();
  let timestamp = 1000;
  let sequence = 0;
  const id = () => `key-${++sequence}`;
  const now = () => timestamp;
  const api = new MockPaymentAPI(new MockBackendStore(storage), now, id, scenario);
  const recovery = new ClientRecoveryStore(storage);
  await api.seedOrder(ORDER, 12500);
  return {
    storage, api, recovery, id, now,
    advance: (ms: number) => { timestamp += ms; },
    coordinator: new PaymentCoordinator(api, recovery, id),
    restart: () => {
      const restartedAPI = new MockPaymentAPI(new MockBackendStore(storage), now, id);
      return {
        api: restartedAPI,
        coordinator: new PaymentCoordinator(restartedAPI, new ClientRecoveryStore(storage), id),
      };
    },
  };
}
