import type { TextInputProps } from 'react-native';
import type { CardFields } from './card';

export function inputHints(platform: string, field: keyof CardFields): Pick<TextInputProps, 'textContentType' | 'autoComplete' | 'importantForAutofill'> {
  if (platform === 'ios') {
    const hints = { number: 'creditCardNumber', expiry: 'creditCardExpiration', cvc: 'creditCardSecurityCode' } as const;
    return { textContentType: hints[field] };
  }
  const hints = { number: 'cc-number', expiry: 'cc-exp', cvc: 'cc-csc' } as const;
  return { autoComplete: hints[field], importantForAutofill: 'yes' };
}
