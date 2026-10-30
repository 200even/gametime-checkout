import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createCheckout } from '../src/bootstrap/createCheckout';
import { useCheckoutStore } from '../src/state/checkoutStore';
import { eligibleMethods } from '../src/checkout/eligibility';
import { resetReviewEnvironment, updateReviewEnvironment } from '../src/checkout/reviewEnvironment';

jest.mock('@react-native-async-storage/async-storage', () => {
  const values = new Map<string, string>();
  return {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); },
    clear: async () => { values.clear(); },
  };
});
jest.mock('expo-crypto', () => {
  let sequence = 0;
  return { randomUUID: () => `review-key-${++sequence}` };
});

beforeEach(async () => {
  await AsyncStorage.clear();
  useCheckoutStore.setState(useCheckoutStore.getInitialState());
});

describe('reviewer session controls', () => {
  test.each(['ios', 'android'])('%s wallet switches are independent and only expose the matching platform method', platform => {
    useCheckoutStore.setState({ ready: true });
    updateReviewEnvironment({ platform });
    updateReviewEnvironment({ appleWalletReady: true });
    expect(useCheckoutStore.getState().environment).toEqual({ platform, appleWalletReady: true, googleWalletReady: false });
    expect(eligibleMethods(useCheckoutStore.getState().environment, 24000))
      .toEqual(platform === 'ios' ? ['apple_pay', 'affirm', 'card'] : ['affirm', 'card']);
    updateReviewEnvironment({ googleWalletReady: true });
    expect(eligibleMethods(useCheckoutStore.getState().environment, 24000))
      .toEqual(platform === 'ios' ? ['apple_pay', 'affirm', 'card'] : ['google_pay', 'affirm', 'card']);
    updateReviewEnvironment({ appleWalletReady: false });
    expect(useCheckoutStore.getState().environment).toEqual({ platform, appleWalletReady: false, googleWalletReady: true });
    expect(eligibleMethods(useCheckoutStore.getState().environment, 24000))
      .toEqual(platform === 'android' ? ['google_pay', 'affirm', 'card'] : ['affirm', 'card']);
    updateReviewEnvironment({ googleWalletReady: false });
    expect(eligibleMethods(useCheckoutStore.getState().environment, 24000)).toEqual(['affirm', 'card']);
  });

  test('device default restores the actual platform and both conservative simulated wallet defaults', () => {
    useCheckoutStore.setState({ ready: true });
    updateReviewEnvironment({ platform: Platform.OS === 'ios' ? 'android' : 'ios', appleWalletReady: true, googleWalletReady: true });
    resetReviewEnvironment();
    expect(useCheckoutStore.getState().environment).toEqual({ platform: Platform.OS, appleWalletReady: false, googleWalletReady: false });
  });

  test.each(['authorizing', 'processing', 'checking', 'succeeded'] as const)('environment actions cannot change checkout in %s', status => {
    useCheckoutStore.setState({ ready: true, environment: { platform: 'android', appleWalletReady: true, googleWalletReady: true },
      payment: { status, intent: null, message: null } });
    const before = useCheckoutStore.getState();
    updateReviewEnvironment({ platform: 'ios', googleWalletReady: false });
    resetReviewEnvironment();
    expect(useCheckoutStore.getState()).toBe(before);
  });

  test.each([{ ready: false, busy: false }, { ready: true, busy: true }])('environment changes are blocked with readiness/busy state %j', flags => {
    useCheckoutStore.setState(flags);
    const before = useCheckoutStore.getState();
    updateReviewEnvironment({ platform: 'android', appleWalletReady: true, googleWalletReady: true });
    resetReviewEnvironment();
    expect(useCheckoutStore.getState()).toBe(before);
  });

  test('the network-drop control stays visibly unknown with one charge, then foreground recovers it', async () => {
    const session = createCheckout();
    const detach = session.connect();
    await session.initialize();
    session.chooseScenario('lost_response');
    await session.submitCard('mock_token_card');
    expect(useCheckoutStore.getState()).toMatchObject({ payment: { status: 'checking' }, chargeCount: 1 });
    const unresolved = useCheckoutStore.getState();
    const backend = await AsyncStorage.getItem('@mock_backend/database/v1');
    const recovery = await AsyncStorage.getItem('@client/recovery/v1');
    updateReviewEnvironment({ platform: 'android', appleWalletReady: true, googleWalletReady: true });
    resetReviewEnvironment();
    expect(useCheckoutStore.getState()).toBe(unresolved);
    expect(await AsyncStorage.getItem('@mock_backend/database/v1')).toBe(backend);
    expect(await AsyncStorage.getItem('@client/recovery/v1')).toBe(recovery);
    const originalOrder = useCheckoutStore.getState().order?.id;
    await session.newOrder();
    expect(useCheckoutStore.getState().order?.id).toBe(originalOrder);
    const recovered = new Promise<void>(resolve => {
      const unsubscribe = useCheckoutStore.subscribe(state => {
        if (state.payment.status === 'succeeded' && !state.busy) { unsubscribe(); resolve(); }
      });
    });
    const lifecycle = session.foregroundHandler('background');
    lifecycle('active');
    await recovered;
    expect(useCheckoutStore.getState()).toMatchObject({ payment: { status: 'succeeded' }, chargeCount: 1, recoverySource: 'foreground' });
    detach();
  });

  test('simulated cold start and client-only reset recover the same paid order', async () => {
    const session = createCheckout();
    const detach = session.connect();
    await session.initialize();
    session.chooseScenario('lost_response');
    await session.submitCard('mock_token_card');
    const orderId = useCheckoutStore.getState().order?.id;
    await session.simulateRestart();
    expect(useCheckoutStore.getState()).toMatchObject({ order: { id: orderId }, payment: { status: 'succeeded' }, chargeCount: 1 });
    await session.simulateRestart(true);
    expect(useCheckoutStore.getState()).toMatchObject({ order: { id: orderId }, payment: { status: 'succeeded' }, chargeCount: 1 });
    detach();
  });

  test('new demo orders are discovered on a new session while old charges remain', async () => {
    const session = createCheckout();
    const detach = session.connect();
    await session.initialize();
    await session.submitCard('mock_token_card');
    const paidOrder = useCheckoutStore.getState().order?.id;
    await session.newOrder();
    const nextOrder = useCheckoutStore.getState().order?.id;
    expect(nextOrder).not.toBe(paidOrder);
    expect(useCheckoutStore.getState()).toMatchObject({ payment: { status: 'idle' }, chargeCount: 0 });
    detach();
    const fresh = createCheckout();
    const detachFresh = fresh.connect();
    await fresh.initialize();
    expect(useCheckoutStore.getState().order?.id).toBe(nextOrder);
    const database = await AsyncStorage.getItem('@mock_backend/database/v1');
    expect(database).toContain(`"orderId":"${paidOrder}"`);
    detachFresh();
  });

  test('amount controls change authoritative cents and scenario changes allow decline then success', async () => {
    const session = createCheckout();
    const detach = session.connect();
    await session.initialize();
    await session.changeAmount(10000);
    expect(useCheckoutStore.getState().order?.amountCents).toBe(10000);
    session.chooseScenario('decline');
    await session.submitCard('mock_token_decline');
    expect(useCheckoutStore.getState()).toMatchObject({ payment: { status: 'declined' }, chargeCount: 0 });
    session.chooseScenario('success');
    await session.submitCard('mock_token_success');
    expect(useCheckoutStore.getState()).toMatchObject({ payment: { status: 'succeeded' }, chargeCount: 1 });
    detach();
  });
});
