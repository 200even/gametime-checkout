import { Platform } from 'react-native';
import type { PaymentEnvironment } from '../checkout/eligibility';

export function detectEnvironment(): PaymentEnvironment {
  return { platform: Platform.OS, appleWalletReady: false, googleWalletReady: false };
}
