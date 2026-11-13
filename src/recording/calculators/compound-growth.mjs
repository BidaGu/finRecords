import { assert, assertObject, cents, exact } from '../core/values.mjs';
import { MAX_CENTS, ceilDiv, roundRatio, gcd, decimalRatio } from './arithmetic.mjs';

export const MAX_GROWTH_MONTHS = 1200;
const COMPOUNDING = { annually: 1, semiannually: 2, quarterly: 4, monthly: 12, daily: 365 };
const CONTRIBUTIONS = { monthly: 1, quarterly: 3, annually: 12 };
function integerRoot(value, degree) {
  if (degree === 1 || value <= 1n) return value;
  const n = BigInt(degree);
  let root = 1n << BigInt(Math.ceil(value.toString(2).length / degree));
  for (;;) {
    const next = ((n - 1n) * root + value / root ** (n - 1n)) / n;
    if (next >= root) return root;
    root = next;
  }
}
function fixedPower(base, exponent, scale, upper) {
  const divide = upper ? ceilDiv : (value, by) => value / by;
  let result = scale;
  while (exponent) {
    if (exponent % 2) result = divide(result * base, scale);
    exponent = Math.floor(exponent / 2);
    if (exponent) base = divide(base * base, scale);
  }
  return result;
}
function growthBounds(rate, scale) {
  const lower = (rate.numerator * scale) / rate.denominator;
  const upper = ceilDiv(rate.numerator * scale, rate.denominator);
  const radicandScale = scale ** BigInt(rate.degree - 1);
  const lowValue = fixedPower(lower, rate.power, scale, false) * radicandScale;
  const highValue = fixedPower(upper, rate.power, scale, true) * radicandScale;
  const low = integerRoot(lowValue, rate.degree);
  let high = integerRoot(highValue, rate.degree);
  if (high ** BigInt(rate.degree) < highValue) high++;
  return { low, high };
}
function exactPeriod(rate) {
  let numerator = rate.numerator ** BigInt(rate.power),
    denominator = rate.denominator ** BigInt(rate.power),
    degree = rate.degree;
  for (const divisor of [12, 6, 4, 3, 2]) {
    if (degree % divisor) continue;
    const a = integerRoot(numerator, divisor),
      b = integerRoot(denominator, divisor);
    if (a ** BigInt(divisor) === numerator && b ** BigInt(divisor) === denominator) {
      numerator = a;
      denominator = b;
      degree /= divisor;
      break;
    }
  }
  return { numerator, denominator, degree };
}
function contributionCount(months, interval, beginning) {
  return months === 0 || interval === 0
    ? 0
    : beginning
      ? Math.ceil(months / interval)
      : Math.floor(months / interval);
}
// Exact rational endpoints resolve half-cent ties without an epsilon or cent reinvestment.
function exactEndpoint(month, inputs, rate) {
  const { numerator, denominator, degree } = rate;
  const terms = new Map();
  const add = (duration, amount) => {
    if (amount === 0n) return true;
    if (duration % degree) return false;
    const power = duration / degree;
    terms.set(power, (terms.get(power) ?? 0n) + amount);
    return true;
  };
  if (!add(month, inputs.initial)) return null;
  if (inputs.interval && inputs.contribution) {
    const start = inputs.beginning ? 0 : inputs.interval;
    for (let time = start; inputs.beginning ? time < month : time <= month; time += inputs.interval)
      if (!add(month - time, inputs.contribution)) return null;
  }
  const maximum = Math.max(0, ...terms.keys());
  let top = terms.get(maximum) ?? 0n,
    bottom = 1n;
  for (let power = maximum - 1; power >= 0; power--) {
    top = top * numerator + (terms.get(power) ?? 0n) * bottom * denominator;
    bottom *= denominator;
  }
  return roundRatio(top, bottom);
}
function project(inputs, rate, precision) {
  const scale = 10n ** BigInt(precision),
    factor = growthBounds(rate, scale),
    rows = [];
  let low = inputs.initial * scale,
    high = low,
    opening = inputs.initial,
    rational = null;
  for (let month = 1; month <= inputs.totalMonths; month++) {
    const count =
      inputs.interval &&
      (inputs.beginning ? (month - 1) % inputs.interval === 0 : month % inputs.interval === 0)
        ? 1
        : 0;
    const contribution = BigInt(count) * inputs.contribution;
    if (inputs.beginning) {
      low += contribution * scale;
      high += contribution * scale;
    }
    low = (low * factor.low) / scale;
    high = ceilDiv(high * factor.high, scale);
    if (!inputs.beginning) {
      low += contribution * scale;
      high += contribution * scale;
    }
    let ending = roundRatio(low, scale);
    if (ending !== roundRatio(high, scale)) {
      rational ??= exactPeriod(rate);
      ending = exactEndpoint(month, inputs, rational);
      if (ending === null) return null;
    }
    assert(ending <= MAX_CENTS, 'Projected balance exceeds the exact supported cent range.');
    rows.push({
      month,
      openingBalanceCents: exact(opening),
      contributionCount: count,
      contributionsCents: exact(contribution),
      interestCents: exact(ending - opening - contribution),
      endingBalanceCents: exact(ending),
    });
    opening = ending;
  }
  return rows;
}
function nonnegativeMoney(value, label) {
  cents(value, label);
  assert(value >= 0, `${label} must not be negative.`);
  return BigInt(value);
}

/** Hypothetical pre-tax growth; no financial document or implicit calendar is involved. */
export function calculateCompoundGrowth(options) {
  assertObject(options, 'Compound Growth inputs');
  const {
    initialCents,
    annualRatePercent,
    rateType,
    compounding,
    years,
    months,
    contributionsEnabled = false,
    contributionCents,
    contributionFrequency,
    contributionTiming,
  } = options;
  const initial = nonnegativeMoney(initialCents, 'Initial amount');
  assert(
    typeof annualRatePercent === 'number' &&
      Number.isFinite(annualRatePercent) &&
      annualRatePercent >= 0,
    'Annual rate must be a finite nonnegative percentage.',
  );
  assert(rateType === 'nominal' || rateType === 'apy', 'Choose Nominal annual rate or APY.');
  assert(
    Number.isSafeInteger(years) && years >= 0 && Number.isSafeInteger(months) && months >= 0,
    'Years and months must be nonnegative whole numbers.',
  );
  const duration = BigInt(years) * 12n + BigInt(months);
  assert(duration <= BigInt(MAX_GROWTH_MONTHS), 'Choose a term of at most 1,200 months.');
  assert(
    typeof contributionsEnabled === 'boolean',
    'Regular contributions must be enabled or disabled.',
  );
  let contribution = 0n,
    interval = 0,
    beginning = false;
  if (contributionsEnabled) {
    contribution = nonnegativeMoney(contributionCents, 'Regular contribution');
    assert(
      Object.hasOwn(CONTRIBUTIONS, contributionFrequency),
      'Choose a supported contribution frequency.',
    );
    assert(
      contributionTiming === 'end' || contributionTiming === 'beginning',
      'Choose Beginning or End contribution timing.',
    );
    interval = CONTRIBUTIONS[contributionFrequency];
    beginning = contributionTiming === 'beginning';
  }
  const totalMonths = Number(duration),
    count = contributionCount(totalMonths, interval, beginning),
    additional = BigInt(count) * contribution,
    contributed = initial + additional;
  assert(contributed <= MAX_CENTS, 'Total contributed exceeds the exact supported cent range.');
  let frequency = 1;
  if (rateType === 'nominal') {
    assert(Object.hasOwn(COMPOUNDING, compounding), 'Choose a supported compounding frequency.');
    frequency = COMPOUNDING[compounding];
  }
  const [rateNumerator, rateDenominator] = decimalRatio(annualRatePercent);
  const denominator = rateDenominator * 100n * BigInt(frequency),
    numerator = denominator + rateNumerator,
    divisor = gcd(numerator, denominator),
    shared = Number(gcd(BigInt(frequency), 12n)),
    rate = {
      numerator: numerator / divisor,
      denominator: denominator / divisor,
      power: frequency / shared,
      degree: 12 / shared,
    };
  let effectiveAnnualYieldPercent =
    rateType === 'apy'
      ? annualRatePercent
      : Math.expm1(frequency * Math.log1p(annualRatePercent / 100 / frequency)) * 100;
  if (effectiveAnnualYieldPercent === 0 && annualRatePercent > 0)
    effectiveAnnualYieldPercent = annualRatePercent;
  assert(
    Number.isFinite(effectiveAnnualYieldPercent),
    'Effective annual yield exceeds the supported numerical range.',
  );
  const inputs = { initial, contribution, interval, beginning, totalMonths };
  let monthly = totalMonths === 0 ? [] : null;
  for (const precision of [48, 96]) {
    if (monthly !== null) break;
    monthly = project(inputs, rate, precision);
  }
  assert(
    monthly !== null,
    'This scenario is too close to a half-cent boundary to round reliably. Adjust the inputs.',
  );
  const yearly = [];
  for (const row of monthly) {
    const year = Math.floor((row.month - 1) / 12) + 1;
    let current = yearly.at(-1);
    if (!current || current.year !== year) {
      current = {
        year,
        months: 0,
        openingBalanceCents: row.openingBalanceCents,
        contributionCount: 0,
        contributionsCents: 0,
        interestCents: 0,
        endingBalanceCents: row.openingBalanceCents,
      };
      yearly.push(current);
    }
    current.months++;
    current.contributionCount += row.contributionCount;
    current.contributionsCents = exact(
      BigInt(current.contributionsCents) + BigInt(row.contributionsCents),
    );
    current.endingBalanceCents = row.endingBalanceCents;
    current.interestCents = exact(
      BigInt(current.endingBalanceCents) -
        BigInt(current.openingBalanceCents) -
        BigInt(current.contributionsCents),
    );
  }
  const ending = BigInt(monthly.at(-1)?.endingBalanceCents ?? initialCents);
  return {
    totalMonths,
    initialCents: exact(initial),
    contributionCount: count,
    additionalContributionsCents: exact(additional),
    totalContributedCents: exact(contributed),
    interestCents: exact(ending - contributed),
    endingBalanceCents: exact(ending),
    effectiveAnnualYieldPercent,
    months: monthly,
    years: yearly,
  };
}
