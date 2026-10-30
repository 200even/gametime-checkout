import { useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import { randomUUID } from 'expo-crypto';
import type { CheckoutStatus } from '../payments/types';
import { cardMetadata, canSubmitCard, cvcLength, digits, tokenizeCard, validateCard } from './card';
import type { CardFields } from './card';
import { formatEdit } from './formatting';
import type { FormattedField, Selection } from './formatting';
import { inputHints } from './inputHints';

const emptyFields: CardFields = { number: '', expiry: '', cvc: '' };

function FormattedInput({ kind, value, onValue, inputRef, ...props }: Omit<TextInputProps, 'value' | 'onChangeText'> & {
  kind: FormattedField; value: string; onValue: (value: string) => void; inputRef: ComponentProps<typeof TextInput>['ref'];
}) {
  const latestSelection = useRef<Selection>({ start: 0, end: 0 });
  const [selection, setSelection] = useState<Selection | undefined>();
  return <TextInput {...props} ref={inputRef} value={value} selection={selection}
    onSelectionChange={event => {
      // Observe native selection without rendering it back; echoing events can overwrite later keystrokes.
      latestSelection.current = event.nativeEvent.selection;
    }}
    onChangeText={text => {
      const edited = formatEdit(value, text, latestSelection.current, kind);
      latestSelection.current = edited.selection;
      onValue(edited.text);
      setSelection(edited.text !== text ? edited.selection : undefined);
    }} />;
}

export function CardForm({ status, busy, amount, onToken, onInputFocus }: {
  status: CheckoutStatus; busy: boolean; amount: string; onToken: (token: string) => Promise<void>; onInputFocus: () => void;
}) {
  const { control, getValues, reset, setFocus, formState } = useForm<CardFields>({ defaultValues: emptyFields, mode: 'onChange' });
  const fields = useWatch({ control });
  const values: CardFields = { number: fields.number ?? '', expiry: fields.expiry ?? '', cvc: fields.cvc ?? '' };
  const errors = validateCard(values);
  const metadata = cardMetadata(values.number);
  const disabled = busy || !canSubmitCard(values, status);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  function submit() {
    const token = tokenizeCard(getValues(), status, randomUUID);
    if (!token || busy) return;
    Keyboard.dismiss();
    reset(emptyFields);
    setSubmissionError(null);
    onToken(token).catch(() => setSubmissionError('Could not submit. Check payment status before trying again.'));
  }

  return <View style={styles.form}>
    <Text style={styles.heading}>Credit or debit card</Text>
    <Text style={styles.note}>Demo only. Use a fake card such as 4242 4242 4242 4242.</Text>
    <Text nativeID="card-number-label" style={styles.label}>Card number{metadata ? ` · ${metadata.niceType}` : ''}</Text>
    <Controller control={control} name="number" render={({ field }) => <FormattedInput
      kind="number" value={field.value} onValue={field.onChange} onBlur={field.onBlur}
      onFocus={onInputFocus}
      inputRef={field.ref} accessibilityLabel="Card number" accessibilityHint="Enter a fake test card number"
      {...inputHints(Platform.OS, 'number')} keyboardType="number-pad" autoCorrect={false}
      style={styles.input} placeholderTextColor="#8f9c93" placeholder="4242 4242 4242 4242" editable={!busy}
      returnKeyType="next" onSubmitEditing={() => setFocus('expiry')} />}/>
    {formState.touchedFields.number && errors.number ? <Text accessibilityRole="alert" style={styles.error}>{errors.number}</Text> : null}
    <View style={styles.row}>
      <View style={styles.column}>
        <Text style={styles.label}>Expiration</Text>
        <Controller control={control} name="expiry" render={({ field }) => <FormattedInput
          kind="expiry" value={field.value} onValue={field.onChange} onBlur={field.onBlur}
          onFocus={onInputFocus}
          inputRef={field.ref} accessibilityLabel="Expiration date" accessibilityHint="Month and year"
          {...inputHints(Platform.OS, 'expiry')} keyboardType="number-pad" autoCorrect={false}
          style={styles.input} placeholderTextColor="#8f9c93" placeholder="MM/YY" editable={!busy} returnKeyType="next"
          onSubmitEditing={() => setFocus('cvc')} />}/>
        {formState.touchedFields.expiry && errors.expiry ? <Text accessibilityRole="alert" style={styles.error}>{errors.expiry}</Text> : null}
      </View>
      <View style={styles.column}>
        <Text style={styles.label}>{metadata?.code.name ?? 'CVC'} ({metadata?.code.size ?? '3 or 4'} digits)</Text>
        <Controller control={control} name="cvc" render={({ field }) => <TextInput
          value={field.value} onChangeText={text => field.onChange(digits(text))} onBlur={field.onBlur}
          onFocus={onInputFocus}
          ref={field.ref} accessibilityLabel="Security code" accessibilityHint={`${metadata?.code.size ?? '3 or 4'} digits`}
          {...inputHints(Platform.OS, 'cvc')} keyboardType="number-pad" autoCorrect={false}
          maxLength={cvcLength(values.number)} style={styles.input} placeholderTextColor="#8f9c93" placeholder={metadata?.code.size === 4 ? '1234' : '123'}
          editable={!busy} returnKeyType="done" onSubmitEditing={submit} />}/>
        {formState.touchedFields.cvc && errors.cvc ? <Text accessibilityRole="alert" style={styles.error}>{errors.cvc}</Text> : null}
      </View>
    </View>
    {submissionError ? <Text accessibilityRole="alert" style={styles.error}>{submissionError}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={`Pay ${amount} by card`}
      accessibilityState={{ disabled }} disabled={disabled} onPress={submit}
      style={[styles.button, disabled && styles.disabled]}><Text style={[styles.buttonText, disabled && styles.disabledText]}>Pay {amount}</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  form: { gap: 10 }, heading: { fontSize: 19, fontWeight: '700', color: '#f5f6f5' },
  note: { fontSize: 13, color: '#b1b8b3' }, label: { fontSize: 14, fontWeight: '600', color: '#d7ded9' },
  input: { borderWidth: 1, borderColor: '#687a6e', borderRadius: 8, padding: 13, fontSize: 18, color: '#fff', backgroundColor: '#171b19', minHeight: 50 },
  row: { flexDirection: 'row', gap: 12 }, column: { flex: 1, gap: 8 },
  error: { color: '#ff9a9a', fontSize: 13 },
  button: { backgroundColor: '#c7f52d', borderRadius: 9, padding: 16, alignItems: 'center', marginTop: 8, minHeight: 52 },
  disabled: { backgroundColor: '#343e36' }, disabledText: { color: '#c0c9c2' }, buttonText: { fontSize: 17, fontWeight: '700', color: '#0a1007' },
});
