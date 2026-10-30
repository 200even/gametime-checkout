import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { canSubmitCard, cvcLength, tokenizeCard, validateCard } from '../src/checkout/card';
import { formatEdit, formatExpiry, formatNumber } from '../src/checkout/formatting';
import { eligibleMethods } from '../src/checkout/eligibility';
import { inputHints } from '../src/checkout/inputHints';
import { MockAuthorization } from '../src/providers/MockAuthorization';
import type { AuthorizationRequest } from '../src/providers/MockAuthorization';
import { fixture, ORDER } from './helpers';

const visa = { number: '4242 4242 4242 4242', expiry: '12/30', cvc: '123' };
const amex = { number: '3782 822463 10005', expiry: '12/30', cvc: '1234' };

describe('card validation and submission', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 30)); });
  afterEach(() => { jest.useRealTimers(); });

  test.each([visa, amex])('accepts a valid fake card with the correct CVC length: $number', fields => {
    expect(validateCard(fields)).toEqual({});
    expect(canSubmitCard(fields, 'idle')).toBe(true);
  });

  test.each(['4242424242424241', '424242424242424', '3782822463100050'])('rejects invalid Luhn or network length: %s', number => {
    expect(validateCard({ ...visa, number }).number).toBeDefined();
  });

  test.each(['09/26', '00/30', '13/30', '12/25', '12/1927'])('rejects expired or invalid expiry %s', expiry => {
    expect(validateCard({ ...visa, expiry }).expiry).toBeDefined();
  });

  test.each(['10/26', '10/2026', '12/2030'])('accepts current month and full-year autofill: %s', expiry => {
    expect(validateCard({ ...visa, expiry }).expiry).toBeUndefined();
  });

  test('CVC length follows the detected BIN and retains room before detection', () => {
    expect(cvcLength('')).toBe(4);
    expect(cvcLength('3782')).toBe(4);
    expect(cvcLength('4242')).toBe(3);
    expect(cvcLength('5555')).toBe(3);
    expect(validateCard({ ...amex, cvc: '123' }).cvc).toBeDefined();
    expect(validateCard({ ...visa, cvc: '1234' }).cvc).toBeDefined();
  });

  test('switching Amex to Visa invalidates an existing four-digit CVC until corrected', () => {
    const changed = { ...amex, number: visa.number };
    expect(cvcLength(changed.number)).toBe(3);
    expect(canSubmitCard(changed, 'idle')).toBe(false);
    expect(canSubmitCard({ ...changed, cvc: '123' }, 'idle')).toBe(true);
  });

  test.each(['processing', 'checking', 'authorizing', 'succeeded'] as const)('blocks token creation in %s state', status => {
    const id = jest.fn(() => 'id');
    expect(tokenizeCard(visa, status, id)).toBeNull();
    expect(id).not.toHaveBeenCalled();
  });

  test('invalid data never creates a token, and valid data creates an unrelated opaque token', () => {
    const id = jest.fn(() => 'random-id');
    expect(tokenizeCard({ ...visa, cvc: '' }, 'idle', id)).toBeNull();
    expect(id).not.toHaveBeenCalled();
    expect(tokenizeCard(visa, 'idle', id)).toBe('mock_token_random-id');
  });

  test('native hints are platform-specific for all three fields', () => {
    expect(inputHints('ios', 'number')).toEqual({ textContentType: 'creditCardNumber' });
    expect(inputHints('ios', 'expiry')).toEqual({ textContentType: 'creditCardExpiration' });
    expect(inputHints('ios', 'cvc')).toEqual({ textContentType: 'creditCardSecurityCode' });
    expect(inputHints('android', 'number')).toEqual({ autoComplete: 'cc-number', importantForAutofill: 'yes' });
    expect(inputHints('android', 'expiry')).toEqual({ autoComplete: 'cc-exp', importantForAutofill: 'yes' });
    expect(inputHints('android', 'cvc')).toEqual({ autoComplete: 'cc-csc', importantForAutofill: 'yes' });
  });
});

describe('native input edit transformations', () => {
  test('formats Visa and Amex from network grouping metadata', () => {
    expect(formatNumber('4242424242424242')).toBe(visa.number);
    expect(formatNumber('378282246310005')).toBe(amex.number);
  });

  test('pasting a complete card puts the caret after the formatted value', () => {
    expect(formatEdit('', '378282246310005', { start: 0, end: 0 }, 'number'))
      .toEqual({ text: amex.number, selection: { start: 17, end: 17 } });
  });

  test('backspace over a number separator removes the preceding digit instead of trapping the cursor', () => {
    expect(formatEdit('4242 5678', '42425678', { start: 5, end: 5 }, 'number'))
      .toEqual({ text: '4245 678', selection: { start: 3, end: 3 } });
  });

  test('backspace over an expiry slash removes the preceding digit', () => {
    expect(formatEdit('12/30', '1230', { start: 3, end: 3 }, 'expiry'))
      .toEqual({ text: '13/0', selection: { start: 1, end: 1 } });
  });

  test('inserting in the middle maps the caret by digits rather than moving it to the end', () => {
    expect(formatEdit('4242 5678', '42942 5678', { start: 2, end: 2 }, 'number'))
      .toEqual({ text: '4294 2567 8', selection: { start: 3, end: 3 } });
  });

  test('selected text replacement preserves the new caret position', () => {
    expect(formatEdit('4242 5678', '4242 99', { start: 5, end: 9 }, 'number'))
      .toEqual({ text: '4242 99', selection: { start: 7, end: 7 } });
  });

  test('forward deletion of a separator deletes the next digit', () => {
    expect(formatEdit('4242 5678', '42425678', { start: 4, end: 4 }, 'number'))
      .toEqual({ text: '4242 678', selection: { start: 4, end: 4 } });
  });

  test('replacing a whole Amex with Visa preserves every new digit and maps the caret to the end', () => {
    expect(formatEdit(amex.number, '4242424242424242', { start: 0, end: amex.number.length }, 'number'))
      .toEqual({ text: visa.number, selection: { start: 19, end: 19 } });
  });

  test.each(['12/30', '12/2030', '122030'])('normalizes expiry paste %s', value => {
    expect(formatExpiry(value)).toBe('12/30');
    expect(formatEdit('', value, { start: 0, end: 0 }, 'expiry').selection).toEqual({ start: 5, end: 5 });
  });
});

describe('payment eligibility', () => {
  test.each([
    ['ios', true, true, ['apple_pay', 'affirm', 'card']],
    ['android', true, true, ['google_pay', 'affirm', 'card']],
    ['ios', false, true, ['affirm', 'card']],
    ['android', true, false, ['affirm', 'card']],
  ] as const)('%s requires its own wallet readiness', (platform, appleWalletReady, googleWalletReady, expected) => {
    expect(eligibleMethods({ platform, appleWalletReady, googleWalletReady }, 12500)).toEqual(expected);
  });
  test.each([9999, 10000, 10001])('Affirm threshold at %i cents', amount => {
    const methods = eligibleMethods({ platform: 'ios', appleWalletReady: false, googleWalletReady: false }, amount);
    expect(methods.includes('affirm')).toBe(amount > 10000);
    expect(methods).toContain('card');
  });
});

describe('stub authorization to coordinator integration', () => {
  test.each(['apple_pay', 'google_pay', 'affirm'] as const)('%s authorization completes the purchase without another checkout submit', async method => {
    const f = await fixture();
    const provider = new MockAuthorization(() => 'authorization');
    const unsubscribe = provider.subscribe(request => request?.finish('authorized'));
    const result = await f.coordinator.submit(ORDER, method, () => provider.authorize(method));
    unsubscribe();
    expect(result.status).toBe('succeeded');
    expect((await f.api.getOrder(ORDER)).chargeCount).toBe(1);
  });

  test.each(['cancelled', 'error'] as const)('provider %s returns to a retryable checkout without charging', async outcome => {
    const f = await fixture();
    const provider = new MockAuthorization(() => 'authorization');
    const unsubscribe = provider.subscribe(request => request?.finish(outcome));
    const result = await f.coordinator.submit(ORDER, 'apple_pay', () => provider.authorize('apple_pay'));
    unsubscribe();
    expect(result.status).toBe(outcome === 'error' ? 'error' : 'cancelled');
    expect((await f.api.getOrder(ORDER)).chargeCount).toBe(0);
  });

  test('repeated provider completion callbacks resolve only once', async () => {
    const provider = new MockAuthorization(() => 'authorization');
    const requests: AuthorizationRequest[] = [];
    const unsubscribe = provider.subscribe(value => { if (value) requests.push(value); });
    const result = provider.authorize('apple_pay');
    const current = requests[0];
    if (!current) throw new Error('Missing authorization request');
    current.finish('authorized');
    current.finish('cancelled');
    expect(await result).toEqual({ kind: 'authorized', providerToken: 'mock_token_authorization' });
    unsubscribe();
  });

  test('card validation hands only a synthetic token to payment persistence', async () => {
    const f = await fixture();
    const token = tokenizeCard(visa, 'idle', () => 'unrelated-id');
    if (token === null) throw new Error('Expected valid test card');
    await f.coordinator.submit(ORDER, 'card', () => Promise.resolve({ kind: 'authorized', providerToken: token }));
    const stored = [...f.storage.values.values()].join('');
    expect(stored).toContain(token);
    expect(stored).not.toContain('4242');
    expect(stored).not.toContain('12/30');
    expect(stored).not.toMatch(/"(number|expiry|cvc)"/);
  });
});
