import type { PaymentMethod } from '../payments/types';

export interface PaymentEnvironment {
  platform: string;
  appleWalletReady: boolean;
  googleWalletReady: boolean;
}

export function eligibleMethods(environment: PaymentEnvironment, amountCents: number): PaymentMethod[] {
  const methods: PaymentMethod[] = [];
  if (environment.platform === 'ios' && environment.appleWalletReady) methods.push('apple_pay');
  if (environment.platform === 'android' && environment.googleWalletReady) methods.push('google_pay');
  if (amountCents > 10000) methods.push('affirm');
  return [...methods, 'card'];
}
