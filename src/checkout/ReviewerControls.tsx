import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { checkout } from '../bootstrap/createCheckout';
import { useCheckoutStore } from '../state/checkoutStore';
import { canStartPayment } from './card';

const scenarios = [
  { id: 'success', label: 'Success' },
  { id: 'lost_response', label: 'Force network drop' },
  { id: 'delayed', label: 'Process for 15 seconds' },
  { id: 'decline', label: 'Issuer decline' },
] as const;

export function ReviewerControls() {
  const [expanded, setExpanded] = useState(false);
  const { payment, scenario, chargeCount, busy, ready, recoverySource, order } = useCheckoutStore();
  const canChange = ready && !busy && canStartPayment(payment.status);
  const canNewOrder = ready && !busy && (canStartPayment(payment.status) || payment.status === 'succeeded');
  function run(action: () => Promise<void>) {
    action().catch(() => useCheckoutStore.setState({ initializationError: 'Review action failed. Please check status.' }));
  }
  return <View style={styles.panel}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.toggle}>
      <Text style={styles.title}>Reviewer controls {expanded ? '−' : '+'}</Text>
    </Pressable>
    <Text style={styles.caption}>Mock charges: {chargeCount} · Client: {payment.status}</Text>
    {expanded ? <View style={styles.body}>
      <Text style={styles.caption}>Fault: {scenarios.find(item => item.id === scenario)?.label}. Last recovery: {recoverySource ?? 'none'}.</Text>
      <Text selectable style={styles.caption}>Order: {order?.id ?? 'loading'}</Text>
      <View style={styles.buttons}>{scenarios.map(item => <Pressable key={item.id} accessibilityRole="button"
        accessibilityState={{ selected: scenario === item.id, disabled: !canChange }} disabled={!canChange}
        onPress={() => checkout.chooseScenario(item.id)} style={[styles.button, scenario === item.id && styles.selected, !canChange && styles.disabled]}>
        <Text style={styles.text}>{item.label}</Text>
      </Pressable>)}</View>
      <Text style={styles.caption}>Network drop commits first, then loses the response and one status read. Check status or leave and return to recover. Charge count should stay 1.</Text>
      <Pressable accessibilityRole="button" disabled={busy || !ready} style={styles.button}
        onPress={() => run(() => checkout.checkStatus('simulated foreground return'))}><Text style={styles.text}>Simulate foreground return</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy || !ready} style={styles.button}
        onPress={() => run(() => checkout.simulateRestart())}><Text style={styles.text}>Simulate cold start</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy || !ready} style={styles.button}
        onPress={() => run(() => checkout.simulateRestart(true))}><Text style={styles.text}>Clear client recovery only</Text></Pressable>
      <Text style={styles.caption}>Cold-start simulation recreates services over retained storage. It does not kill the native process. Client reset preserves the mock backend.</Text>
      <Pressable accessibilityRole="button" disabled={!canNewOrder} style={[styles.button, !canNewOrder && styles.disabled]}
        onPress={() => run(checkout.newOrder)}><Text style={styles.text}>New demo order</Text></Pressable>
      <View style={styles.buttons}>{[9999, 10000, 10001, 24000].map(amount => <Pressable key={amount} accessibilityRole="button"
        disabled={!canChange} style={[styles.button, !canChange && styles.disabled]} onPress={() => run(() => checkout.changeAmount(amount))}>
        <Text style={styles.text}>${(amount / 100).toFixed(2)}</Text>
      </Pressable>)}</View>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  panel: { backgroundColor: '#182313', borderColor: '#8bad30', borderWidth: 1, borderRadius: 10, padding: 12, gap: 5 },
  toggle: { minHeight: 44, justifyContent: 'center' }, title: { color: '#d5ff55', fontSize: 17, fontWeight: '700' },
  caption: { color: '#c1cdbb', fontSize: 12, lineHeight: 18 }, body: { gap: 10, paddingTop: 8 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { borderColor: '#69765d', borderWidth: 1, borderRadius: 7, padding: 10, minHeight: 44, justifyContent: 'center' },
  selected: { borderColor: '#c7f52d', backgroundColor: '#35422b' }, disabled: { opacity: 0.45 }, text: { color: '#fff', fontSize: 14 },
});
