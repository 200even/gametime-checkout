import { create } from 'zustand';
import type { CheckoutState, Order, PaymentMethod } from '../payments/types';
import type { PaymentEnvironment } from '../checkout/eligibility';

interface PresentationState {
  payment: CheckoutState;
  order: Order | null;
  environment: PaymentEnvironment;
  selectedMethod: PaymentMethod;
  ready: boolean;
  busy: boolean;
  initializationError: string | null;
  chargeCount: number;
  scenario: 'success' | 'lost_response' | 'delayed' | 'decline';
  recoverySource: string | null;
  formGeneration: number;
}

export const useCheckoutStore = create<PresentationState>(() => ({
  payment: { status: 'idle', intent: null, message: null },
  order: null,
  environment: { platform: 'unknown', appleWalletReady: false, googleWalletReady: false },
  selectedMethod: 'card', ready: false, busy: false, initializationError: null,
  chargeCount: 0, scenario: 'success', recoverySource: null, formGeneration: 0,
}));
