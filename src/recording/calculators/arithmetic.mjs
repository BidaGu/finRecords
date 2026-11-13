import { assert } from '../core/values.mjs';

export const MAX_CENTS = BigInt(Number.MAX_SAFE_INTEGER);
export const ceilDiv = (numerator, denominator) => (numerator + denominator - 1n) / denominator;
export const roundRatio = (numerator, denominator) =>
  (2n * numerator + denominator) / (2n * denominator);
export const roundSignedRatio = (numerator, denominator) =>
  numerator < 0n ? -roundRatio(-numerator, denominator) : roundRatio(numerator, denominator);

export function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}
export function decimalRatio(value) {
  const [coefficient, exponent = '0'] = String(value).toLowerCase().split('e');
  const decimals = coefficient.split('.')[1]?.length ?? 0;
  const power = Number(exponent) - decimals;
  let numerator = BigInt(coefficient.replace('.', '')),
    denominator = 1n;
  if (power >= 0) numerator *= 10n ** BigInt(power);
  else denominator = 10n ** BigInt(-power);
  const divisor = gcd(numerator, denominator);
  return [numerator / divisor, denominator / divisor];
}
export function scaledDecimal(units, places) {
  const digits = units.toString().padStart(places + 1, '0');
  const fraction = digits.slice(-places).replace(/0+$/, '');
  return digits.slice(0, -places) + (fraction ? `.${fraction}` : '');
}
export function decimalInput(value, places, label, positive = false) {
  assert(typeof value === 'string', `${label} must be a decimal number.`);
  const text = value.trim();
  assert(
    new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(text),
    `${label} must use digits and at most ${places} decimal places, without signs or separators.`,
  );
  const [whole, fraction = ''] = text.split('.');
  const units = BigInt(whole + fraction.padEnd(places, '0'));
  assert(!positive || units > 0n, `${label} must be greater than zero.`);
  return { units, text: scaledDecimal(units, places) };
}
export function rationalDisplay(numerator, denominator, places) {
  const scale = 10n ** BigInt(places);
  const rounded = roundRatio(numerator * scale, denominator);
  const digits = rounded.toString().padStart(places + 1, '0');
  return {
    decimal: `${digits.slice(0, -places)}.${digits.slice(-places)}`,
    approximate: rounded * denominator !== numerator * scale,
  };
}
export function rationalStrings(numerator, denominator) {
  const divisor = gcd(numerator, denominator);
  return {
    numerator: (numerator / divisor).toString(),
    denominator: (denominator / divisor).toString(),
  };
}
