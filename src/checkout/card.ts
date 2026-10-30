import valid from 'card-validator';
import type { CheckoutStatus } from '../payments/types';

export interface CardFields { number: string; expiry: string; cvc: string }
export type CardErrors = Partial<Record<keyof CardFields, string>>;
export const digits = (value: string): string => value.replace(/\D/g, '');

export function cardMetadata(number: string) {
  return valid.number(digits(number), { luhnValidateUnionPay: true }).card;
}

export function cvcLength(number: string): number {
  return cardMetadata(number)?.code.size ?? 4;
}

export function validateCard(fields: CardFields): CardErrors {
  const errors: CardErrors = {};
  const number = valid.number(digits(fields.number), { luhnValidateUnionPay: true });
  if (!number.isValid) errors.number = 'Enter a valid card number.';
  if (!valid.expirationDate(fields.expiry).isValid) errors.expiry = 'Enter a valid expiration date.';
  if (!number.card || !valid.cvv(fields.cvc, number.card.code.size).isValid) {
    errors.cvc = `Enter ${number.card?.code.size ?? '3 or 4'} security-code digits.`;
  }
  return errors;
}

export function canStartPayment(status: CheckoutStatus): boolean {
  return ['idle', 'declined', 'cancelled', 'order_changed', 'error'].includes(status);
}

export function canSubmitCard(fields: CardFields, status: CheckoutStatus): boolean {
  return canStartPayment(status) && Object.keys(validateCard(fields)).length === 0;
}

export function tokenizeCard(fields: CardFields, status: CheckoutStatus, newId: () => string): string | null {
  if (!canSubmitCard(fields, status)) return null;
  return `mock_token_${newId()}`;
}
