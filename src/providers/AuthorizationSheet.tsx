import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MockAuthorization, AuthorizationRequest } from './MockAuthorization';

export const methodNames = { card: 'Card', apple_pay: 'Apple Pay', google_pay: 'Google Pay', affirm: 'Affirm' };

export function AuthorizationSheet({ provider, amount }: { provider: MockAuthorization; amount: string }) {
  const [request, setRequest] = useState<AuthorizationRequest | null>(null);
  useEffect(() => provider.subscribe(setRequest), [provider]);
  return <Modal visible={request !== null} transparent animationType="slide" onRequestClose={() => request?.finish('cancelled')}>
    <View style={styles.backdrop}><View accessibilityViewIsModal style={styles.sheet}>
      <Text style={styles.title}>{request ? methodNames[request.method] : ''}</Text>
      <Text style={styles.amount}>{amount}</Text>
      <Text>Simulated authorization. No real payment or wallet account is used.</Text>
      <Pressable accessibilityRole="button" onPress={() => request?.finish('authorized')} style={styles.authorize}>
        <Text style={styles.authorizeText}>Authorize demo payment</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => request?.finish('cancelled')} style={styles.action}><Text>Cancel</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => request?.finish('error')} style={styles.action}><Text>Simulate provider error</Text></Pressable>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  sheet: { padding: 24, paddingBottom: 40, backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 16 },
  title: { fontSize: 24, fontWeight: '700' }, amount: { fontSize: 22 },
  authorize: { backgroundColor: '#075c3c', padding: 17, borderRadius: 9, alignItems: 'center' },
  authorizeText: { color: 'white', fontWeight: '700', fontSize: 17 }, action: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
