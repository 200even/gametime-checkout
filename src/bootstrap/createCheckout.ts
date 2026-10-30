import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { MockBackendStore } from '../mock/MockBackendStore';
import { MockPaymentAPI } from '../mock/MockPaymentAPI';
import type { MockScenario } from '../mock/MockPaymentAPI';
import { createForegroundHandler } from './foregroundRecovery';
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
  const scenario: MockScenario = { settlement: 'succeeded', processingMs: 0 };
  let api = new MockPaymentAPI(new MockBackendStore(AsyncStorage), Date.now, randomUUID, scenario);
  const recovery = new ClientRecoveryStore(AsyncStorage);
  let coordinator = new PaymentCoordinator(api, recovery, randomUUID);
  let orderId = DEMO_ORDER_ID;
  let connected = false;
  let detach = () => {};
  let foregroundRequested = false;
  const provider = new MockAuthorization(randomUUID);
  let initialization: Promise<void> | null = null;

  async function refreshOrder() {
    const snapshot = await api.getOrder(orderId);
    useCheckoutStore.setState({ order: snapshot.order, chargeCount: snapshot.chargeCount });
  }

  async function submit(method: PaymentMethod, authorize: () => Promise<Authorization>) {
    const state = useCheckoutStore.getState();
    if (!state.ready || state.busy || !state.order || !canStartPayment(state.payment.status)
      || !eligibleMethods(state.environment, state.order.amountCents).includes(method)) return;
    useCheckoutStore.setState({ busy: true, selectedMethod: method });
    try {
      await coordinator.submit(orderId, method, authorize);
      await refreshOrder();
    } catch {
      useCheckoutStore.setState({ initializationError: 'Could not refresh checkout. Check payment status before continuing.' });
    } finally {
      useCheckoutStore.setState({ busy: false });
      if (foregroundRequested) {
        foregroundRequested = false;
        await checkStatus('foreground');
      }
    }
  }

  function attach() {
    detach();
    useCheckoutStore.setState({ payment: coordinator.getState() });
    detach = coordinator.subscribe(payment => useCheckoutStore.setState({ payment }));
  }

  async function checkStatus(source = 'manual check') {
    if (useCheckoutStore.getState().busy) {
      if (source === 'foreground') foregroundRequested = true;
      return;
    }
    useCheckoutStore.setState({ busy: true, initializationError: null, recoverySource: source });
    try {
      await coordinator.reconcile(orderId);
      await refreshOrder();
    } catch {
      useCheckoutStore.setState({ initializationError: 'Could not refresh checkout. Please check again.' });
    } finally {
      useCheckoutStore.setState({ busy: false });
      if (foregroundRequested) {
        foregroundRequested = false;
        await checkStatus('foreground');
      }
    }
  }

  async function reviewAction(action: () => Promise<void>) {
    if (useCheckoutStore.getState().busy) return;
    useCheckoutStore.setState({ busy: true, initializationError: null });
    try { await action(); }
    catch { useCheckoutStore.setState({ initializationError: 'Review action failed. Check payment status before continuing.' }); }
    finally {
      useCheckoutStore.setState({ busy: false });
      if (foregroundRequested) {
        foregroundRequested = false;
        await checkStatus('foreground');
      }
    }
  }

  return {
    provider,
    connect() {
      connected = true;
      attach();
      return () => { connected = false; detach(); };
    },
    foregroundHandler(initial: string | null) {
      return createForegroundHandler(initial, () => coordinator.getState().status,
        () => checkStatus('foreground'),
        () => useCheckoutStore.setState({ initializationError: 'Foreground status check failed.' }));
    },
    initialize(): Promise<void> {
      initialization ??= (async () => {
        try {
          useCheckoutStore.setState({ environment: detectEnvironment(), initializationError: null, recoverySource: 'startup' });
          await api.seedOrder(DEMO_ORDER_ID, 24000);
          orderId = await api.getReviewOrderId();
          await coordinator.reconcile(orderId);
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
    checkStatus,
    chooseScenario(mode: 'success' | 'lost_response' | 'delayed' | 'decline') {
      const state = useCheckoutStore.getState();
      if (state.busy || !canStartPayment(state.payment.status)) return;
      Object.assign(scenario, {
        settlement: mode === 'decline' ? 'failed' : 'succeeded',
        processingMs: mode === 'delayed' ? 15000 : 0,
        loseConfirmResponse: mode === 'lost_response',
        statusTimeoutsAfterConfirm: mode === 'lost_response' ? 1 : 0,
      });
      useCheckoutStore.setState({ scenario: mode });
    },
    simulateRestart(clearClient = false) {
      return reviewAction(async () => {
        if (clearClient) await recovery.clear();
        // Recreate services over retained storage; this is not an OS process-kill test.
        api = new MockPaymentAPI(new MockBackendStore(AsyncStorage), Date.now, randomUUID, scenario);
        coordinator = new PaymentCoordinator(api, recovery, randomUUID);
        if (connected) attach();
        useCheckoutStore.setState(state => ({ formGeneration: state.formGeneration + 1,
          recoverySource: clearClient ? 'client-only reset' : 'simulated cold start' }));
        orderId = await api.getReviewOrderId();
        await coordinator.reconcile(orderId);
        await refreshOrder();
      });
    },
    newOrder() {
      const state = useCheckoutStore.getState();
      if (!canStartPayment(state.payment.status) && state.payment.status !== 'succeeded') return Promise.resolve();
      return reviewAction(async () => {
        await coordinator.reconcile(orderId);
        const status = coordinator.getState().status;
        if (!canStartPayment(status) && status !== 'succeeded') return;
        if (await recovery.read()) throw new Error('Recovery cleanup must complete before changing orders');
        const nextOrderId = `demo-${randomUUID()}`;
        await api.seedOrder(nextOrderId, 24000);
        orderId = nextOrderId;
        await coordinator.reconcile(orderId);
        await refreshOrder();
        useCheckoutStore.setState(state => ({ formGeneration: state.formGeneration + 1, recoverySource: 'new demo order' }));
      });
    },
    changeAmount(amountCents: number) {
      if (!canStartPayment(useCheckoutStore.getState().payment.status)) return Promise.resolve();
      return reviewAction(async () => { await api.changeOrderAmount(orderId, amountCents); await refreshOrder(); });
    },
  };
}

export const checkout = createCheckout();
