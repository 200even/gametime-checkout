import type { RecoveryRecord, RecoveryStore } from '../payments/types';
import type { KeyValueStorage } from './KeyValueStorage';

export const CLIENT_RECOVERY_KEY = '@client/recovery/v1';

function isRecoveryRecord(value: unknown): value is RecoveryRecord {
  return typeof value === 'object' && value !== null
    && 'orderId' in value && typeof value.orderId === 'string'
    && 'attemptKey' in value && typeof value.attemptKey === 'string'
    && 'confirmationKey' in value && typeof value.confirmationKey === 'string'
    && 'intentId' in value && (value.intentId === null || typeof value.intentId === 'string')
    && 'phase' in value && ['creating', 'authorizing', 'confirming'].some(phase => phase === value.phase);
}

export class ClientRecoveryStore implements RecoveryStore {
  constructor(private readonly storage: KeyValueStorage) {}

  async read(): Promise<RecoveryRecord | null> {
    const raw = await this.storage.getItem(CLIENT_RECOVERY_KEY);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (!isRecoveryRecord(value)) throw new Error('Invalid client recovery record');
    return value;
  }

  async write(record: RecoveryRecord): Promise<void> {
    await this.storage.setItem(CLIENT_RECOVERY_KEY, JSON.stringify(record));
  }

  async clear(): Promise<void> {
    await this.storage.removeItem(CLIENT_RECOVERY_KEY);
  }
}
