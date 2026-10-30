import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { MockBackendStore } from '../mock/MockBackendStore';
import { MockPaymentAPI } from '../mock/MockPaymentAPI';
import { PaymentCoordinator } from '../payments/PaymentCoordinator';
import { ClientRecoveryStore } from '../storage/ClientRecoveryStore';
import { MockAuthorization } from '../providers/MockAuthorization';
import { detectEnvironment } from '../providers/capabilities';
import { useCheckoutStore } from '../state/checkoutStore';
import { canStartPayment } from '../checkout/card';
import { eligibleMethods } from '../checkout/eligibility';
import type { Authorization, PaymentMethod } from '../payments/types';

export const DEMO_ORDER_ID = 'gametime-demo-order';

export function createCheckout() {
  const api = new MockPaymentAPI(new MockBackendStore(AsyncStorage), Date.now, randomUUID);
  const coordinator = new PaymentCoordinator(api, new ClientRecoveryStore(AsyncStorage), randomUUID);
  const provider = new MockAuthorization(randomUUID);
  let initialization: Promise<void> | null = null;

  async function refreshOrder() {
    const snapshot = await api.getOrder(DEMO_ORDER_ID);
    useCheckoutStore.setState({ order: snapshot.order });
  }

  async function submit(method: PaymentMethod, authorize: () => Promise<Authorization>) {
    const state = useCheckoutStore.getState();
    if (!state.ready || state.busy || !state.order || !canStartPayment(state.payment.status)
      || !eligibleMethods(state.environment, state.order.amountCents).includes(method)) return;
    useCheckoutStore.setState({ busy: true, selectedMethod: method });
    try {
      await coordinator.submit(DEMO_ORDER_ID, method, authorize);
      await refreshOrder();
    } catch {
      useCheckoutStore.setState({ initializationError: 'Could not refresh checkout. Check payment status before continuing.' });
    } finally {
      useCheckoutStore.setState({ busy: false });
    }
  }

  return {
    provider,
    connect() {
      useCheckoutStore.setState({ payment: coordinator.getState() });
      return coordinator.subscribe(payment => useCheckoutStore.setState({ payment }));
    },
    initialize(): Promise<void> {
      initialization ??= (async () => {
        try {
          useCheckoutStore.setState({ environment: detectEnvironment(), initializationError: null });
          await api.seedOrder(DEMO_ORDER_ID, 24000);
          await coordinator.reconcile(DEMO_ORDER_ID);
          await refreshOrder();
          useCheckoutStore.setState({ ready: true });
        } catch {
          initialization = null;
          useCheckoutStore.setState({ initializationError: 'Could not load checkout. Please try again.' });
        }
      })();
      return initialization;
    },
    submitCard(token: string) {
      return submit('card', () => Promise.resolve({ kind: 'authorized', providerToken: token }));
    },
    submitExpress(method: PaymentMethod) {
      return submit(method, () => provider.authorize(method));
    },
    async checkStatus() {
      if (useCheckoutStore.getState().busy) return;
      useCheckoutStore.setState({ busy: true, initializationError: null });
      try {
        await coordinator.reconcile(DEMO_ORDER_ID);
        await refreshOrder();
      } catch {
        useCheckoutStore.setState({ initializationError: 'Could not refresh checkout. Please check again.' });
      } finally {
        useCheckoutStore.setState({ busy: false });
      }
    },
  };
}

export const checkout = createCheckout();
