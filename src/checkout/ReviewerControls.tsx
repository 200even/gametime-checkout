import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { checkout } from '../bootstrap/createCheckout';
import { useCheckoutStore } from '../state/checkoutStore';
import { canStartPayment } from './card';
import { resetReviewEnvironment, updateReviewEnvironment } from './reviewEnvironment';

const scenarios = [
  { id: 'success', label: 'Success' },
  { id: 'lost_response', label: 'Force network drop' },
  { id: 'delayed', label: 'Process for 15 seconds' },
  { id: 'decline', label: 'Issuer decline' },
] as const;

export function ReviewerControls() {
  const [expanded, setExpanded] = useState(false);
  const { payment, scenario, chargeCount, busy, ready, recoverySource, order, environment } = useCheckoutStore();
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
      <Text accessibilityRole="header" style={styles.heading}>Environment simulation</Text>
      <Text style={styles.caption}>Device: {Platform.OS}. Wallet readiness is simulated and defaults to unavailable.</Text>
      <View style={styles.buttons}>
        {['ios', 'android'].map(platform => <Pressable key={platform} accessibilityRole="button"
          accessibilityLabel={`Simulate ${platform}`} disabled={!canChange}
          accessibilityState={{ selected: environment.platform === platform, disabled: !canChange }}
          onPress={() => updateReviewEnvironment({ platform })}
          style={[styles.button, environment.platform === platform && styles.selected, !canChange && styles.disabled]}>
          <Text style={styles.text}>{platform === 'ios' ? 'iOS' : 'Android'}</Text>
        </Pressable>)}
        <Pressable accessibilityRole="button" disabled={!canChange} accessibilityState={{ disabled: !canChange }}
          onPress={resetReviewEnvironment} style={[styles.button, !canChange && styles.disabled]}>
          <Text style={styles.text}>Device default</Text>
        </Pressable>
      </View>
      <View style={styles.switchRow}><Text style={[styles.text, styles.switchLabel]}>Simulated Apple Wallet ready</Text>
        <Switch accessibilityLabel="Simulated Apple Wallet ready" disabled={!canChange}
          value={environment.appleWalletReady} onValueChange={appleWalletReady => updateReviewEnvironment({ appleWalletReady })} /></View>
      <View style={styles.switchRow}><Text style={[styles.text, styles.switchLabel]}>Simulated Google Pay ready</Text>
        <Switch accessibilityLabel="Simulated Google Pay ready" disabled={!canChange}
          value={environment.googleWalletReady} onValueChange={googleWalletReady => updateReviewEnvironment({ googleWalletReady })} /></View>
      <Text accessibilityRole="header" style={styles.heading}>Payment scenarios</Text>
      <Text style={styles.caption}>Fault: {scenarios.find(item => item.id === scenario)?.label}.</Text>
      <View style={styles.buttons}>{scenarios.map(item => <Pressable key={item.id} accessibilityRole="button"
        accessibilityState={{ selected: scenario === item.id, disabled: !canChange }} disabled={!canChange}
        onPress={() => checkout.chooseScenario(item.id)} style={[styles.button, scenario === item.id && styles.selected, !canChange && styles.disabled]}>
        <Text style={styles.text}>{item.label}</Text>
      </Pressable>)}</View>
      <Text style={styles.caption}>Network drop commits first, then loses the response and one status read. Check status or leave and return to recover. Charge count should stay 1.</Text>
      <Text accessibilityRole="header" style={styles.heading}>Recovery and diagnostics</Text>
      <Text style={styles.caption}>Mock charges: {chargeCount} · Client: {payment.status}. Last recovery: {recoverySource ?? 'none'}.</Text>
      <Text selectable style={styles.caption}>Order: {order?.id ?? 'loading'}</Text>
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
  heading: { color: '#d5ff55', fontSize: 15, fontWeight: '700', marginTop: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }, switchLabel: { flex: 1 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { borderColor: '#69765d', borderWidth: 1, borderRadius: 7, padding: 10, minHeight: 44, justifyContent: 'center' },
  selected: { borderColor: '#c7f52d', backgroundColor: '#35422b' }, disabled: { opacity: 0.45 }, text: { color: '#fff', fontSize: 14 },
});
