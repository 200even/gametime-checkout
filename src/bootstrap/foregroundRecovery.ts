import type { CheckoutStatus } from '../payments/types';

export function createForegroundHandler(
  initial: string | null,
  status: () => CheckoutStatus,
  reconcile: () => Promise<void>,
  reportError: () => void,
): (next: string) => void {
  let previous = initial;
  return next => {
    const returning = (previous === 'background' || previous === 'inactive') && next === 'active';
    previous = next;
    if (returning && (status() === 'processing' || status() === 'checking')) {
      reconcile().catch(reportError);
    }
  };
}
