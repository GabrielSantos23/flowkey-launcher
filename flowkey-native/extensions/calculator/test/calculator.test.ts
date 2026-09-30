import { describe, expect, test } from 'bun:test';
import { evaluate, type EngineContext } from '../src/engine/evaluator';
import { tryEvaluateExpression } from '../src/engine/parser';

// Deterministic context: en-US formatting, fixed clock, injected FX rates.
const FIXED_NOW = new Date(2026, 8, 23, 21, 30, 0); // Wed, 23 Sep 2026 21:30 local
const RATES = new Map<string, number>([
  ['USD', 1],
  ['EUR', 0.9],
  ['BRL', 5.4],
  ['JPY', 150],
  ['GBP', 0.8],
]);

function ctx(overrides: Partial<EngineContext> = {}): EngineContext {
  return { now: () => FIXED_NOW, rates: RATES, locale: 'en-US', ...overrides };
}

function evaluateText(query: string, overrides: Partial<EngineContext> = {}) {
  return evaluate(query, ctx(overrides));
}

describe('arithmetic', () => {
  test('evaluates arithmetic expressions with precedence', () => {
    expect(evaluateText('2+3*4')?.result).toBe('14');
    expect(evaluateText('2^3^2')?.result).toBe('512');
    expect(evaluateText('-3^2')?.result).toBe('-9');
    expect(evaluateText('sqrt(625)')?.result).toBe('25');
    expect(evaluateText('50%')?.result).toBe('0.5');
  });

  test('applies thousand scale suffixes', () => {
    expect(evaluateText('2k+1')?.result).toBe('2,001');
    expect(evaluateText('5M*2')?.result).toBe('10,000,000');
    expect(evaluateText('1.5b')?.result).toBe('1,500,000,000');
  });

  test('evaluates implicit multiplication', () => {
    expect(evaluateText('2x3')?.result).toBe('6');
    expect(evaluateText('2(3)')?.result).toBe('6');
    expect(evaluateText('(2)(3)')?.result).toBe('6');
  });

  test('rejects incomplete expressions', () => {
    expect(evaluateText('2+')).toBeNull();
    expect(evaluateText('sqrt(')).toBeNull();
    expect(evaluateText('(2')).toBeNull();
    expect(evaluateText('2 **')).toBeNull();
  });

  test('supports functions and constants', () => {
    expect(evaluateText('round(3.7)')?.result).toBe('4');
    expect(evaluateText('max(3, 5)')?.result).toBe('5');
    expect(evaluateText('sin(0)')?.result).toBe('0');
    const tau = evaluateText('tau');
    expect(tau?.result).not.toBeNull();
    expect(tryEvaluateExpression('pi*2')).toBeCloseTo(tryEvaluateExpression('tau')!, 10);
  });

  test('large numbers keep integer grouping', () => {
    const result = evaluateText('2^40');
    expect(result?.result).toBe('1,099,511,627,776');
  });
});

describe('percent and ratio phrases', () => {
  test('evaluates percentage phrases', () => {
    expect(evaluateText('20% of 90')?.result).toBe('18');
    expect(evaluateText('20% off 90')?.result).toBe('72');
    expect(evaluateText('15% tip on 100')?.result).toBe('115');
    expect(evaluateText('20% of 90')?.expressionBadge).toBe('Percentage');
  });

  test('evaluates ratio phrases', () => {
    const result = evaluateText('ratio of 3 to 9');
    expect(result?.expressionBadge).toBe('Ratio');
    expect(Number(result?.result.replace(/,/g, ''))).toBeCloseTo(1 / 3, 5);
  });
});

describe('units', () => {
  test('converts length units', () => {
    const result = evaluateText('5km to mi');
    expect(result?.result).toBe('3.1068559612 mi');
    expect(result?.expressionBadge).toBe('Kilometers');
    expect(result?.resultBadge).toBe('Miles');
    expect(evaluateText('5km in mi')?.result).toBe('3.1068559612 mi');
  });

  test('converts mass between kilograms and pounds', () => {
    const result = evaluateText('12 kg in lbs');
    expect(result?.result).toBe('26.4554714622 lb');
  });

  test('converts data units', () => {
    expect(evaluateText('10gb to mb')?.result).toBe('10,000 mb');
  });

  test('converts temperatures', () => {
    const result = evaluateText('100f to c');
    expect(Number(result?.result.replace(/ c$/, ''))).toBeCloseTo(37.7777778, 3);
  });

  test('rejects cross-category conversions', () => {
    expect(evaluateText('5kg in m')).toBeNull();
    expect(evaluateText('5kg to liters')).toBeNull();
  });
});

describe('currency', () => {
  test('converts from explicit codes', () => {
    expect(evaluateText('50 usd in eur')?.result).toBe('€45');
  });

  test('converts from symbols', () => {
    expect(evaluateText('$50 in eur')?.result).toBe('€45');
    expect(evaluateText('€50 in usd')?.result).toBe('$55.56');
  });

  test('formats zero-decimal currencies without decimals', () => {
    expect(evaluateText('$50 in jpy')?.result).toBe('¥7,500');
  });

  test('converts by spoken names', () => {
    expect(evaluateText('50 dollars in euros')?.result).toBe('€45');
    expect(evaluateText('100 reais in usd')?.result).toBe('$18.52');
  });

  test('combines percentage phrases with currency', () => {
    expect(evaluateText('20% off $90 in eur')?.result).toBe('€64.80');
  });

  test('currency queries without rates produce no card', () => {
    expect(evaluateText('$50 in eur', { rates: null })).toBeNull();
  });

  test('unknown target currencies produce no card', () => {
    expect(evaluateText('$50 in xyz')).toBeNull();
  });
});

describe('dates and time zones', () => {
  test('reports current time and dates', () => {
    expect(evaluateText('now')?.resultBadge).toBe('Local time');
    expect(evaluateText('today')?.result).toContain('September 23, 2026');
    expect(evaluateText('tomorrow')?.result).toContain('September 24');
    expect(evaluateText('yesterday')?.result).toContain('September 22');
  });

  test('evaluates relative dates', () => {
    expect(evaluateText('in 3 days')?.result).toContain('September 26');
    expect(evaluateText('3 days from now')?.result).toContain('September 26');
    expect(evaluateText('2 weeks ago')?.result).toContain('September 09');
    expect(evaluateText('in 3 days')?.expressionBadge).toBe('3 Days from now');
  });

  test('counts days until dates', () => {
    const result = evaluateText('days until 2026-12-25');
    expect(result?.result).toBe('93 days');
    expect(result?.resultBadge).toBe('Countdown');
  });

  test('resolves time zones by city and airport code', () => {
    const tokyo = evaluateText('time in tokyo');
    expect(tokyo?.expressionBadge).toBe('Tokyo, Japan');
    expect(tokyo?.resultBadge).toBe('JST');
    const lax = evaluateText('time in lax');
    expect(lax?.expressionBadge).toBe('Los Angeles, United States');
  });

  test('resolves time zones while typing a prefix', () => {
    expect(evaluateText('time in lon')?.expressionBadge).toBe('London, United Kingdom');
  });

  test('non-calculator queries produce no card', () => {
    expect(evaluateText('spotify')).toBeNull();
    expect(evaluateText('hello world')).toBeNull();
    expect(evaluateText('2')).toBeNull();
    expect(evaluateText('')).toBeNull();
  });
});
