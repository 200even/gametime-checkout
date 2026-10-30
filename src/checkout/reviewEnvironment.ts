import { detectEnvironment } from '../providers/capabilities';
import { useCheckoutStore } from '../state/checkoutStore';
import { canStartPayment } from './card';
import type { PaymentEnvironment } from './eligibility';

export function updateReviewEnvironment(change: Partial<PaymentEnvironment>): void {
  const state = useCheckoutStore.getState();
  if (!state.ready || state.busy || !canStartPayment(state.payment.status)) return;
  useCheckoutStore.setState({ environment: { ...state.environment, ...change } });
}

export function resetReviewEnvironment(): void {
  updateReviewEnvironment(detectEnvironment());
}
