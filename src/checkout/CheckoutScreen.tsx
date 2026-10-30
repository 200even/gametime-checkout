import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { checkout } from '../bootstrap/createCheckout';
import { useCheckoutStore } from '../state/checkoutStore';
import { AuthorizationSheet, methodNames } from '../providers/AuthorizationSheet';
import { detectEnvironment } from '../providers/capabilities';
import { CardForm } from './CardForm';
import { canStartPayment } from './card';
import { eligibleMethods } from './eligibility';

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function OrderSummary({ amountCents, confirmed }: { amountCents: number; confirmed: boolean }) {
  const fees = Math.min(2000, amountCents);
  return <View style={styles.summary}>
    <Text style={styles.event}>Grizzlies vs. Lakers</Text>
    <Text style={styles.muted}>FRI · OCT 30, 2026</Text>
    <Text style={styles.muted}>2 Tickets · Section 112 · Row G</Text>
    {!confirmed ? <View style={styles.breakdown}>
      <View style={styles.line}><Text style={styles.text}>Tickets</Text><Text style={styles.text}>{money(amountCents - fees)}</Text></View>
      <View style={styles.line}><Text style={styles.text}>Fees</Text><Text style={styles.text}>{money(fees)}</Text></View>
    </View> : null}
    <View style={[styles.line, styles.totalLine]}><Text style={styles.total}>Total</Text><Text style={styles.amount}>{money(amountCents)}</Text></View>
    <Text style={styles.small}>Demo event and pricing</Text>
  </View>;
}

function ReviewEnvironment({ disabled }: { disabled: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const environment = useCheckoutStore(state => state.environment);
  return <View style={styles.review}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.action}>
      <Text style={styles.link}>{expanded ? 'Hide' : 'Review'} environment</Text>
    </Pressable>
    {expanded ? <View style={styles.gap}>
      <Text style={styles.muted}>Device: {Platform.OS}. Wallet readiness is simulated and defaults to unavailable.</Text>
      <View style={styles.platforms}>
        {['ios', 'android'].map(platform => <Pressable key={platform} accessibilityRole="button"
          accessibilityLabel={`Simulate ${platform}`} disabled={disabled}
          accessibilityState={{ selected: environment.platform === platform, disabled }}
          onPress={() => useCheckoutStore.setState({ environment: { ...environment, platform } })}
          style={[styles.chip, environment.platform === platform && styles.selected]}>
          <Text style={styles.text}>{platform === 'ios' ? 'iOS' : 'Android'}</Text>
        </Pressable>)}
        <Pressable accessibilityRole="button" disabled={disabled} onPress={() => useCheckoutStore.setState({ environment: detectEnvironment() })} style={styles.chip}>
          <Text style={styles.text}>Device default</Text>
        </Pressable>
      </View>
      <View style={styles.line}><Text style={styles.text}>Simulated Apple Wallet ready</Text><Switch accessibilityLabel="Simulated Apple Wallet ready"
        disabled={disabled} value={environment.appleWalletReady} onValueChange={appleWalletReady => useCheckoutStore.setState({ environment: { ...environment, appleWalletReady } })} /></View>
      <View style={styles.line}><Text style={styles.text}>Simulated Google Pay ready</Text><Switch accessibilityLabel="Simulated Google Pay ready"
        disabled={disabled} value={environment.googleWalletReady} onValueChange={googleWalletReady => useCheckoutStore.setState({ environment: { ...environment, googleWalletReady } })} /></View>
    </View> : null}
  </View>;
}

export function CheckoutScreen() {
  const { payment, order, environment, ready, busy, initializationError } = useCheckoutStore();
  const [formGeneration, setFormGeneration] = useState(0);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const formY = useRef(0);
  function showCardForm() { scroll.current?.scrollTo({ y: formY.current, animated: true }); }
  // Subscribe before startup reconciliation. Cleanup removes the UI subscription, not the payment operation.
  useEffect(() => {
    const unsubscribe = checkout.connect();
    checkout.initialize().catch(() => useCheckoutStore.setState({ initializationError: 'Could not initialize checkout.' }));
    return unsubscribe;
  }, []);
  // Native keyboard height arrives after focus; scroll again once its reduced viewport is available.
  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', showCardForm);
    return () => subscription.remove();
  }, []);

  const confirmed = payment.status === 'succeeded';
  const checking = payment.status === 'checking' || payment.status === 'processing';
  const blocked = busy || !ready || !canStartPayment(payment.status);
  const total = payment.intent?.amountCents ?? order?.amountCents ?? 0;
  const methods = order ? eligibleMethods(environment, order.amountCents).filter(method => method !== 'card') : [];

  function reportActionError() {
    useCheckoutStore.setState({ initializationError: 'Could not complete that action. Check payment status.' });
  }

  return <SafeAreaView style={styles.safe}>
    <StatusBar barStyle="light-content" />
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}><Text style={styles.title}>Checkout</Text></View>
      <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {initializationError ? <View style={styles.notice}>
          <Text accessibilityRole="alert" style={styles.text}>{initializationError}</Text>
          <Pressable accessibilityRole="button" style={styles.action} onPress={() => (ready ? checkout.checkStatus() : checkout.initialize()).catch(reportActionError)}><Text style={styles.link}>Retry loading</Text></Pressable>
        </View> : null}
        {!ready ? <ActivityIndicator size="large" color="#c7f52d" accessibilityLabel="Loading checkout" /> : null}
        {confirmed ? <View style={styles.status}>
          <Text style={styles.checkmark}>✓</Text>
          <Text accessibilityRole="header" style={styles.statusTitle}>Payment confirmed</Text>
          <Text style={styles.muted}>Your demo order is ready</Text>
        </View> : checking ? <View style={styles.status}>
          <ActivityIndicator size="large" color="#c7f52d" />
          <Text accessibilityRole="header" style={styles.statusTitle}>Checking payment status</Text>
          <Text style={styles.centered}>Please don’t try paying again.{ '\n' }We’re confirming your order.</Text>
        </View> : null}
        {order ? <OrderSummary amountCents={confirmed ? total : order.amountCents} confirmed={confirmed} /> : null}
        {confirmed ? <View style={styles.notice}>
          <Text style={styles.muted}>Confirmation ID</Text><Text selectable style={styles.text}>{payment.intent?.id}</Text>
          <Text style={styles.small}>Demo payment only. No tickets were issued.</Text>
        </View> : checking ? <Pressable accessibilityRole="button" disabled={busy} style={styles.outline}
          onPress={() => checkout.checkStatus().catch(reportActionError)}><Text style={styles.text}>Check status</Text></Pressable> : ready ? <>
          {payment.status === 'declined' || payment.status === 'cancelled' || payment.status === 'error' || payment.status === 'order_changed' ? <View style={styles.notice}>
            <Text accessibilityRole="alert" style={styles.text}>{payment.message ?? (payment.status === 'declined' ? 'Payment declined. Try another payment method.' : 'Authorization cancelled. You can try again.')}</Text>
          </View> : null}
          {methods.map(method => <View key={method} style={styles.gap}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Pay with ${methodNames[method]}`} disabled={blocked}
              accessibilityState={{ disabled: blocked }} style={[method === 'affirm' ? styles.outline : styles.express, blocked && styles.disabled]}
              onPress={() => {
                Keyboard.dismiss();
                checkout.submitExpress(method).catch(reportActionError);
              }}><Text style={method === 'affirm' ? styles.text : styles.expressText}>{method === 'affirm' ? 'Pay with Affirm' : methodNames[method]}</Text></Pressable>
            {method !== 'affirm' ? <Text style={styles.small}>Simulated {environment.platform} wallet readiness</Text> : null}
          </View>)}
          <View style={styles.divider}><View style={styles.rule}/><Text style={styles.muted}>or pay with card</Text><View style={styles.rule}/></View>
          <View onLayout={event => { formY.current = event.nativeEvent.layout.y; }}>
            <CardForm key={formGeneration} status={payment.status} busy={busy} amount={money(order?.amountCents ?? 0)} onToken={checkout.submitCard} onInputFocus={showCardForm} />
          </View>
          <Pressable accessibilityRole="button" disabled={busy} style={styles.action} onPress={() => {
            Keyboard.dismiss();
            setFormGeneration(value => value + 1);
          }}><Text style={styles.link}>Clear card details</Text></Pressable>
        </> : null}
        <Text style={styles.footer}>Demo checkout · No real charge</Text>
        <ReviewEnvironment disabled={blocked} />
      </ScrollView>
    </KeyboardAvoidingView>
    <AuthorizationSheet provider={checkout.provider} amount={money(order?.amountCents ?? 0)} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#090c0b' }, flex: { flex: 1 },
  header: { padding: 16, borderBottomWidth: 1, borderColor: '#303632', alignItems: 'center' },
  title: { color: '#fff', fontSize: 21, fontWeight: '700' },
  content: { padding: 20, gap: 18, width: '100%', maxWidth: 600, alignSelf: 'center', paddingBottom: 32 },
  summary: { backgroundColor: '#171b19', borderWidth: 1, borderColor: '#3f4742', borderRadius: 12, padding: 18, gap: 10 },
  event: { color: '#fff', fontSize: 23, fontWeight: '700' }, muted: { color: '#b1b8b3', fontSize: 15 },
  small: { color: '#a8b0aa', fontSize: 12 }, text: { color: '#f5f6f5', fontSize: 16 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  breakdown: { borderTopWidth: 1, borderColor: '#3f4742', marginTop: 4, paddingTop: 12, gap: 8 },
  totalLine: { borderTopWidth: 1, borderColor: '#3f4742', marginTop: 3, paddingTop: 12 },
  total: { color: '#fff', fontSize: 18, fontWeight: '700' }, amount: { color: '#fff', fontSize: 26, fontWeight: '700' },
  gap: { gap: 8 }, express: { backgroundColor: '#fff', padding: 16, borderRadius: 9, alignItems: 'center', minHeight: 52 },
  expressText: { color: '#111', fontSize: 18, fontWeight: '600' },
  outline: { borderWidth: 1, borderColor: '#d9dfda', padding: 16, borderRadius: 9, alignItems: 'center', minHeight: 52 },
  disabled: { opacity: 0.45 }, divider: { flexDirection: 'row', alignItems: 'center', gap: 12 }, rule: { flex: 1, height: 1, backgroundColor: '#3f4742' },
  notice: { backgroundColor: '#1c241f', borderRadius: 9, padding: 16, gap: 8 },
  status: { paddingVertical: 20, gap: 18, alignItems: 'center' },
  statusTitle: { color: '#fff', fontWeight: '700', fontSize: 28, textAlign: 'center' },
  centered: { color: '#b1b8b3', fontSize: 17, textAlign: 'center', lineHeight: 25 },
  checkmark: { color: '#c7f52d', fontSize: 64 }, footer: { color: '#a8b0aa', textAlign: 'center', fontSize: 13 },
  review: { borderTopWidth: 1, borderColor: '#303632', paddingTop: 8, gap: 12 },
  action: { minHeight: 44, justifyContent: 'center', alignItems: 'center' }, link: { color: '#c7f52d', fontSize: 14 },
  platforms: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { padding: 10, minHeight: 44, borderWidth: 1, borderColor: '#59665d', borderRadius: 8 },
  selected: { backgroundColor: '#35422b', borderColor: '#c7f52d' },
});
