import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { MockBackendStore } from '../mock/MockBackendStore';
import { MockPaymentAPI } from '../mock/MockPaymentAPI';
import { PaymentCoordinator } from '../payments/PaymentCoordinator';
import { ClientRecoveryStore } from '../storage/ClientRecoveryStore';

export const DEMO_ORDER_ID = 'gametime-demo-order';

export function createCheckout() {
  const api = new MockPaymentAPI(new MockBackendStore(AsyncStorage), Date.now, randomUUID);
  const coordinator = new PaymentCoordinator(api, new ClientRecoveryStore(AsyncStorage), randomUUID);
  return {
    coordinator,
    async initialize() {
      await api.seedOrder(DEMO_ORDER_ID, 12500);
      return await coordinator.reconcile(DEMO_ORDER_ID);
    },
  };
}
