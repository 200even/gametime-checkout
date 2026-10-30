import { cardMetadata, digits } from './card';

export interface Selection { start: number; end: number }
export type FormattedField = 'number' | 'expiry';

export function formatNumber(value: string): string {
  const raw = digits(value);
  const card = cardMetadata(raw);
  const gaps = card?.gaps ?? [4, 8, 12, 16];
  const maximum = card ? Math.max(...card.lengths) : 19;
  return [...raw.slice(0, maximum)].map((digit, index) => `${gaps.includes(index) ? ' ' : ''}${digit}`).join('');
}

export function formatExpiry(value: string): string {
  let raw = digits(value).slice(0, 6);
  // Full-year autofill is normalized only within this century; other centuries stay explicit and invalid.
  const century = String(new Date().getFullYear()).slice(0, 2);
  if (raw.length === 6 && raw.slice(2, 4) === century) raw = raw.slice(0, 2) + raw.slice(4);
  return raw.length > 2 ? `${raw.slice(0, 2)}/${raw.slice(2)}` : raw;
}

function positionAfterDigits(value: string, count: number): number {
  if (count === 0) return 0;
  let seen = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (/\d/.test(value.charAt(index))) seen += 1;
    if (seen === count) return index + 1;
  }
  return value.length;
}

export function formatEdit(previous: string, next: string, selection: Selection, kind: FormattedField) {
  let start = Math.min(selection.start, previous.length);
  let end = Math.min(selection.end, previous.length);
  let insertedLength = next.length - (previous.length - (end - start));
  if (start === end && next === previous.slice(0, start - 1) + previous.slice(start) && start > 0) {
    start -= 1;
    insertedLength = 0;
  } else if (start === end && next === previous.slice(0, start) + previous.slice(start + 1)) {
    end += 1;
    insertedLength = 0;
  } else if (insertedLength < 0 || next.slice(0, start) !== previous.slice(0, start)
    || next.slice(start + insertedLength) !== previous.slice(end)) {
    // Autofill can replace the whole value without first sending a matching selection event.
    start = 0;
    while (start < previous.length && start < next.length && previous[start] === next[start]) start += 1;
    let suffix = 0;
    while (suffix < previous.length - start && suffix < next.length - start
      && previous[previous.length - suffix - 1] === next[next.length - suffix - 1]) suffix += 1;
    end = previous.length - suffix;
    insertedLength = next.length - start - suffix;
  }
  let edited = next;
  let caret = start + insertedLength;
  if (insertedLength === 0 && end > start && /^\D+$/.test(previous.slice(start, end))) {
    const backward = selection.start >= end;
    const digitPosition = backward ? start - 1 : start;
    if (digitPosition >= 0 && digitPosition < edited.length) {
      edited = edited.slice(0, digitPosition) + edited.slice(digitPosition + 1);
      caret = digitPosition;
    }
  }
  let digitCaret = digits(edited.slice(0, caret)).length;
  const text = kind === 'number' ? formatNumber(edited) : formatExpiry(edited);
  if (kind === 'expiry' && digits(edited).length === 6 && digits(text).length === 4 && digitCaret > 2) {
    digitCaret = Math.max(2, digitCaret - 2);
  }
  const position = positionAfterDigits(text, digitCaret);
  return { text, selection: { start: position, end: position } };
}
