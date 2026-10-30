import type { Confirmation, Order, PaymentIntent, Settlement } from '../payments/types';
import type { KeyValueStorage } from '../storage/KeyValueStorage';

export const MOCK_BACKEND_KEY = '@mock_backend/database/v1';

export interface StoredIntent extends PaymentIntent {
  attemptKey: string;
  confirmation: (Confirmation & { key: string }) | null;
  processingUntil: number | null;
  settlement: Settlement;
}

interface Charge { orderId: string; intentId: string; amountCents: number }

export interface Database {
  schema: 1;
  orders: Order[];
  intents: StoredIntent[];
  charges: Charge[];
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function order(value: unknown): value is Order {
  return object(value) && typeof value.id === 'string' && integer(value.version)
    && integer(value.amountCents) && value.currency === 'USD'
    && (value.paidIntentId === null || typeof value.paidIntentId === 'string');
}
function confirmation(value: unknown): value is StoredIntent['confirmation'] {
  return value === null || (object(value) && typeof value.key === 'string'
    && typeof value.providerToken === 'string'
    && ['card', 'apple_pay', 'google_pay', 'affirm'].includes(String(value.method)));
}
function intent(value: unknown): value is StoredIntent {
  return object(value) && typeof value.id === 'string' && typeof value.orderId === 'string'
    && integer(value.orderVersion) && integer(value.amountCents) && value.currency === 'USD'
    && ['requires_action', 'processing', 'succeeded', 'failed', 'cancelled'].includes(String(value.status))
    && typeof value.attemptKey === 'string' && confirmation(value.confirmation)
    && (value.processingUntil === null || integer(value.processingUntil))
    && (value.settlement === 'succeeded' || value.settlement === 'failed');
}
function charge(value: unknown): value is Charge {
  return object(value) && typeof value.orderId === 'string' && typeof value.intentId === 'string'
    && integer(value.amountCents);
}
function database(value: unknown): value is Database {
  return object(value) && value.schema === 1
    && Array.isArray(value.orders) && value.orders.every(order)
    && Array.isArray(value.intents) && value.intents.every(intent)
    && Array.isArray(value.charges) && value.charges.every(charge);
}

// Store instances sharing the app's storage adapter also share a single-runtime write queue.
const queues = new WeakMap<KeyValueStorage, Promise<void>>();

export class MockBackendStore {
  constructor(private readonly storage: KeyValueStorage) {}

  transact<T>(mutate: (db: Database) => T): Promise<T> {
    const previous = queues.get(this.storage) ?? Promise.resolve();
    const operation = previous.then(async () => {
      const raw = await this.storage.getItem(MOCK_BACKEND_KEY);
      const parsed: unknown = raw === null
        ? { schema: 1, orders: [], intents: [], charges: [] }
        : JSON.parse(raw);
      if (!database(parsed)) throw new Error('Invalid mock backend record');
      const result = mutate(parsed);
      // One durable snapshot contains both the intent transition and its charge ledger entry.
      await this.storage.setItem(MOCK_BACKEND_KEY, JSON.stringify(parsed));
      return result;
    });
    // A failed operation rejects its caller, but must not poison subsequent operations.
    queues.set(this.storage, operation.then(() => undefined, () => undefined));
    return operation;
  }
}
