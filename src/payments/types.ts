export type PaymentMethod = 'card' | 'apple_pay' | 'google_pay' | 'affirm';
export type IntentStatus = 'requires_action' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
export type Settlement = 'succeeded' | 'failed';

export interface Order {
  id: string;
  version: number;
  amountCents: number;
  currency: 'USD';
  paidIntentId: string | null;
}

export interface PaymentIntent {
  id: string;
  orderId: string;
  orderVersion: number;
  amountCents: number;
  currency: 'USD';
  status: IntentStatus;
}

export interface Confirmation {
  method: PaymentMethod;
  providerToken: string;
}

export interface OrderSnapshot {
  order: Order;
  activeIntent: PaymentIntent | null;
  chargeCount: number;
}

export type PaymentErrorCode =
  | 'NOT_FOUND' | 'KEY_CONFLICT' | 'ORDER_CHANGED' | 'ORDER_PAID'
  | 'ACTIVE_ATTEMPT' | 'INVALID_STATE' | 'INVALID_REQUEST';

export class PaymentError extends Error {
  constructor(public readonly code: PaymentErrorCode) {
    super(code);
    this.name = 'PaymentError';
  }
}

export interface RecoveryRecord {
  orderId: string;
  attemptKey: string;
  confirmationKey: string;
  intentId: string | null;
  phase: 'creating' | 'authorizing' | 'confirming';
}

export interface RecoveryStore {
  read(): Promise<RecoveryRecord | null>;
  write(record: RecoveryRecord): Promise<void>;
  clear(): Promise<void>;
}

export type Authorization =
  | { kind: 'authorized'; providerToken: string }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

export type CheckoutStatus =
  | 'idle' | 'authorizing' | 'processing' | 'checking'
  | 'succeeded' | 'declined' | 'cancelled' | 'order_changed' | 'error';

export interface CheckoutState {
  status: CheckoutStatus;
  intent: PaymentIntent | null;
  message: string | null;
}
