import type { Confirmation, OrderSnapshot, PaymentIntent } from './types';

export interface PaymentAPI {
  getOrder(orderId: string): Promise<OrderSnapshot>;
  createIntent(orderId: string, attemptKey: string): Promise<PaymentIntent>;
  confirmIntent(intentId: string, confirmation: Confirmation, confirmationKey: string): Promise<PaymentIntent>;
  getIntent(intentId: string): Promise<PaymentIntent>;
  /** Atomically cancels only requires_action; an in-flight confirmation wins or loses under the same lock. */
  cancelIntent(intentId: string): Promise<PaymentIntent>;
}
