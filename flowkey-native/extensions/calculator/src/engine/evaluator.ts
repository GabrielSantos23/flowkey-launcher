/**
 * The detection cascade and result formatting — port of CalculatorEvaluator.cs
 * (currency → dates → units → percent → math) plus the money/number
 * formatters. Rates come from the caller; inject the clock and rate map for
 * deterministic tests.
 */

import { tryEvaluateExpression } from './parser';
import { formatSignificant, formatUnitValue, fromBase, toBase, tryConvertUnits } from './units';
import { tryEvaluateDates } from './dates';

export interface CalculatorResult {
  expression: string;
  expressionBadge: string;
  result: string;
  resultBadge: string;
  copyText: string;
}

export interface EngineContext {
  now: () => Date;
  /** USD-based rates; currency queries produce nothing while absent. */
  rates: Map<string, number> | null;
  /** BCP-47 locale for number/date formatting; defaults to the host locale. */
  locale?: string;
}

/** (symbol, code) pairs, tried as prefix then suffix. */
const SYMBOLS: [string, string][] = [
  ['R$', 'BRL'],
  ['$', 'USD'],
  ['€', 'EUR'],
  ['£', 'GBP'],
  ['¥', 'JPY'],
  ['₹', 'INR'],
  ['₩', 'KRW'],
  ['₺', 'TRY'],
  ['₪', 'ILS'],
  ['zł', 'PLN'],
  ['฿', 'THB'],
  ['₱', 'PHP'],
];

const DISPLAY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CNY: 'CN¥',
  KRW: '₩',
  INR: '₹',
  BRL: 'R$',
  TRY: '₺',
  ILS: '₪',
  PLN: 'zł',
  THB: '฿',
  PHP: '₱',
  AUD: 'A$',
  CAD: 'C$',
  NZD: 'NZ$',
  HKD: 'HK$',
  SGD: 'S$',
  MXN: 'MX$',
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
  ISK: 'kr',
  CZK: 'Kč',
  HUF: 'Ft',
  RON: 'lei',
  IDR: 'Rp',
  MYR: 'RM',
};

const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'ISK', 'CLP', 'VND']);

const CURRENCY_NAMES: Record<string, string> = {
  dollar: 'USD',
  dollars: 'USD',
  euro: 'EUR',
  euros: 'EUR',
  real: 'BRL',
  reais: 'BRL',
  pound: 'GBP',
  pounds: 'GBP',
  sterling: 'GBP',
  yen: 'JPY',
  yuan: 'CNY',
  renminbi: 'CNY',
  won: 'KRW',
  rupee: 'INR',
  rupees: 'INR',
  peso: 'MXN',
  pesos: 'MXN',
  franc: 'CHF',
  francs: 'CHF',
  krona: 'SEK',
  kronor: 'SEK',
  krone: 'NOK',
  kroner: 'NOK',
  koruna: 'CZK',
  forint: 'HUF',
  zloty: 'PLN',
  zlotys: 'PLN',
  leu: 'RON',
  lev: 'BGN',
  lira: 'TRY',
  shekel: 'ILS',
  shekels: 'ILS',
  rand: 'ZAR',
  rupiah: 'IDR',
  baht: 'THB',
  dong: 'VND',
  ringgit: 'MYR',
  aussie: 'AUD',
  aussiedollar: 'AUD',
  loonie: 'CAD',
  kiwi: 'NZD',
  singaporedollar: 'SGD',
  hongkongdollar: 'HKD',
};

function resolveCurrencyWord(word: string): string | null {
  const normalized = word.trim();
  if (normalized.length === 0) {
    return null;
  }
  if (normalized.length === 3 && /^[a-zA-Z]+$/.test(normalized)) {
    return normalized.toUpperCase();
  }
  const byExact = CURRENCY_NAMES[normalized.toLowerCase()];
  if (byExact) {
    return byExact;
  }
  if (normalized.endsWith('s')) {
    const bySingular = CURRENCY_NAMES[normalized.slice(0, -1).toLowerCase()];
    if (bySingular) {
      return bySingular;
    }
  }
  return null;
}

export function evaluate(query: string, context: EngineContext): CalculatorResult | null {
  const trimmed = query.trim();
  if (trimmed.length < 2 || trimmed.includes('\n')) {
    return null;
  }
  // Pin the output locale: locale-aware grouping/decimals make math results
  // unpredictable across machines (e.g. pt-BR "1.234,56"), and launchers
  // conventionally show invariant formatting.
  const locale = context.locale ?? 'en-US';
  const currency = tryCurrency(trimmed, context.rates, locale);
  if (currency) {
    return currency;
  }
  const dates = tryEvaluateDates(trimmed, context.now(), locale);
  if (dates) {
    return {
      expression: trimmed,
      expressionBadge: dates.expressionBadge,
      result: dates.result,
      resultBadge: dates.resultBadge,
      copyText: dates.result,
    };
  }
  const units = tryUnits(trimmed, locale);
  if (units) {
    return units;
  }
  const percent = tryPercent(trimmed, locale);
  if (percent) {
    return percent;
  }
  return tryMath(trimmed, locale);
}

function tryUnits(query: string, locale?: string): CalculatorResult | null {
  const conversion = tryConvertUnits(query);
  if (!conversion) {
    return null;
  }
  const converted = fromBase(conversion.target, toBase(conversion.source, conversion.value));
  const text = `${formatUnitValue(converted, locale)} ${conversion.target.canonical}`;
  return {
    expression: query,
    expressionBadge: conversion.source.displayName,
    result: text,
    resultBadge: conversion.target.displayName,
    copyText: text,
  };
}

function tryMath(query: string, locale?: string): CalculatorResult | null {
  if (!/[0-9]/.test(query)) {
    return null;
  }
  const value = tryEvaluateExpression(query);
  if (value === null) {
    return null;
  }
  const text = formatNumber(value, locale);
  return {
    expression: query,
    expressionBadge: 'Calculation',
    result: text,
    resultBadge: 'Result',
    copyText: text,
  };
}

function tryPercent(query: string, locale?: string): CalculatorResult | null {
  const normalized = query.trim();
  if (normalized.toLowerCase().startsWith('ratio of ')) {
    return tryRatio(normalized.slice(9).trim(), normalized, locale);
  }
  const parts = tryPercentParts(normalized);
  if (!parts) {
    return null;
  }
  const amount = tryParseAmount(parts.amountText);
  if (!amount) {
    return null;
  }
  const value = applyPercent(amount.value, parts.percent, parts.mode);
  const text = formatNumber(value, locale);
  return {
    expression: normalized,
    expressionBadge: parts.badge,
    result: text,
    resultBadge: 'Result',
    copyText: text,
  };
}

function tryRatio(tail: string, expression: string, locale?: string): CalculatorResult | null {
  const parts = tail.split(' to ');
  if (parts.length !== 2) {
    return null;
  }
  const left = Number(parts[0].trim().replace(/,/g, ''));
  const right = Number(parts[1].trim().replace(/,/g, ''));
  if (
    Number.isNaN(left) ||
    Number.isNaN(right) ||
    right === 0 ||
    parts[0].trim() === '' ||
    parts[1].trim() === ''
  ) {
    return null;
  }
  const text = formatNumber(left / right, locale);
  return {
    expression,
    expressionBadge: 'Ratio',
    result: text,
    resultBadge: 'Result',
    copyText: text,
  };
}

function tryCurrency(
  query: string,
  rates: Map<string, number> | null,
  locale?: string,
): CalculatorResult | null {
  const splitIndex = lastCurrencySeparator(query);
  if (splitIndex < 0) {
    return null;
  }
  const target = resolveCurrencyWord(query.slice(splitIndex + 4));
  if (!target) {
    return null;
  }
  const left = query.slice(0, splitIndex).trim();
  const percentParts = tryPercentParts(left);
  if (percentParts) {
    const amount = tryParseAmount(percentParts.amountText);
    if (!amount || amount.currency.length === 0) {
      return null;
    }
    const value = applyPercent(amount.value, percentParts.percent, percentParts.mode);
    const converted = convertMoney(value, amount.currency, target, rates);
    if (converted === null) {
      return null;
    }
    const text = formatMoney(converted, target, locale);
    return {
      expression: query,
      expressionBadge: percentParts.badge,
      result: text,
      resultBadge: 'Result',
      copyText: text,
    };
  }
  const plain = tryParseAmount(left);
  if (!plain || plain.currency.length === 0) {
    return null;
  }
  const plainConverted = convertMoney(plain.value, plain.currency, target, rates);
  if (plainConverted === null) {
    return null;
  }
  const plainText = formatMoney(plainConverted, target, locale);
  return {
    expression: query,
    expressionBadge: plain.currency,
    result: plainText,
    resultBadge: 'Result',
    copyText: plainText,
  };
}

function convertMoney(
  amount: number,
  source: string,
  target: string,
  rates: Map<string, number> | null,
): number | null {
  if (!rates) {
    return null;
  }
  const sourceRate = rates.get(source.toUpperCase());
  const targetRate = rates.get(target.toUpperCase());
  if (sourceRate === undefined || targetRate === undefined) {
    return null;
  }
  return (amount * targetRate) / sourceRate;
}

interface PercentParts {
  percent: number;
  mode: 'of' | 'off' | 'tip';
  amountText: string;
  badge: string;
}

function tryPercentParts(text: string): PercentParts | null {
  const normalized = text.trim();
  const percentIndex = normalized.indexOf('%');
  if (percentIndex <= 0) {
    return null;
  }
  const percent = Number(normalized.slice(0, percentIndex).trim().replace(/,/g, ''));
  if (Number.isNaN(percent)) {
    return null;
  }
  const remainder = normalized.slice(percentIndex + 1).trimStart();
  let mode: PercentParts['mode'];
  let amountText: string;
  if (remainder.toLowerCase().startsWith('of ')) {
    mode = 'of';
    amountText = remainder.slice(3).trim();
  } else if (remainder.toLowerCase().startsWith('off ')) {
    mode = 'off';
    amountText = remainder.slice(4).trim();
  } else if (remainder.toLowerCase().startsWith('tip on ')) {
    mode = 'tip';
    amountText = remainder.slice(7).trim();
  } else {
    return null;
  }
  if (amountText.length === 0) {
    return null;
  }
  return { percent, mode, amountText, badge: 'Percentage' };
}

function applyPercent(amount: number, percent: number, mode: PercentParts['mode']): number {
  switch (mode) {
    case 'off':
      return amount * (1 - percent / 100);
    case 'tip':
      return amount * (1 + percent / 100);
    default:
      return (amount * percent) / 100;
  }
}

function lastCurrencySeparator(query: string): number {
  const lower = query.toLowerCase();
  const inIndex = lower.lastIndexOf(' in ');
  const toIndex = lower.lastIndexOf(' to ');
  return Math.max(inIndex, toIndex);
}

interface ParsedAmount {
  value: number;
  currency: string;
}

function tryParseAmount(text: string): ParsedAmount | null {
  let normalized = text.trim();
  if (normalized.length === 0) {
    return null;
  }
  let currency = '';
  for (const [symbol, code] of SYMBOLS) {
    if (normalized.startsWith(symbol)) {
      currency = code;
      normalized = normalized.slice(symbol.length).trim();
      break;
    }
  }
  if (currency.length === 0) {
    for (const [symbol, code] of SYMBOLS) {
      if (normalized.endsWith(symbol)) {
        currency = code;
        normalized = normalized.slice(0, normalized.length - symbol.length).trim();
        break;
      }
    }
  }
  if (currency.length === 0) {
    const spaceIndex = normalized.lastIndexOf(' ');
    if (spaceIndex > 0) {
      const candidate = normalized.slice(spaceIndex + 1).trim();
      const resolved = resolveCurrencyWord(candidate);
      if (resolved) {
        currency = resolved;
        normalized = normalized.slice(0, spaceIndex).trim();
      }
    }
  }
  let scale = 1;
  if (normalized.length > 1) {
    const last = normalized[normalized.length - 1];
    if (last === 'k' || last === 'K') {
      scale = 1_000;
      normalized = normalized.slice(0, -1);
    } else if (last === 'M') {
      scale = 1_000_000;
      normalized = normalized.slice(0, -1);
    } else if (last === 'b' || last === 'B') {
      scale = 1_000_000_000;
      normalized = normalized.slice(0, -1);
    }
  }
  const value = Number(normalized.replace(/,/g, ''));
  if (Number.isNaN(value)) {
    return null;
  }
  return { value: value * scale, currency };
}

function formatMoney(value: number, currency: string, locale?: string): string {
  const symbol = DISPLAY_SYMBOLS[currency] ?? currency;
  const decimals =
    ZERO_DECIMAL_CURRENCIES.has(currency) || Math.round(value * 100) / 100 === Math.floor(value)
      ? 0
      : 2;
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  return symbol + formatted;
}

function formatNumber(value: number, locale?: string): string {
  if (Math.abs(value) < 1e15 && Number.isInteger(value)) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
  }
  return formatSignificant(Math.round(value * 1e10) / 1e10, 10);
}
