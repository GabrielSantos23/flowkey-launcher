/**
 * Unit conversions — port of CalculatorUnits.cs. ~60 units with aliases,
 * temperature offsets, category checks and the "<number><unit> in <unit>"
 * grammar.
 */

export interface UnitInfo {
  canonical: string;
  displayName: string;
  category: string;
  toBase: number;
  offsetScale: boolean;
}

const UNITS = new Map<string, UnitInfo>();

function add(unit: UnitInfo, ...aliases: string[]): void {
  UNITS.set(unit.canonical, unit);
  for (const alias of aliases) {
    UNITS.set(alias, unit);
  }
}

function unit(
  canonical: string,
  displayName: string,
  category: string,
  toBase: number,
  offsetScale = false,
): UnitInfo {
  return { canonical, displayName, category, toBase, offsetScale };
}

add(unit('m', 'Meters', 'Length', 1), 'meter', 'meters', 'metre', 'metres');
add(unit('km', 'Kilometers', 'Length', 1000), 'kilometer', 'kilometers', 'kilometre', 'kilometres');
add(unit('cm', 'Centimeters', 'Length', 0.01), 'centimeter', 'centimeters');
add(unit('mm', 'Millimeters', 'Length', 0.001), 'millimeter', 'millimeters');
add(unit('mi', 'Miles', 'Length', 1609.344), 'mile', 'miles');
add(unit('ft', 'Feet', 'Length', 0.3048), 'foot', 'feet');
add(unit('in', 'Inches', 'Length', 0.0254), 'inch', 'inches');
add(unit('yd', 'Yards', 'Length', 0.9144), 'yard', 'yards');
add(unit('nmi', 'Nautical miles', 'Length', 1852), 'nauticalmile', 'nauticalmiles');

add(unit('g', 'Grams', 'Mass', 1), 'gram', 'grams');
add(unit('kg', 'Kilograms', 'Mass', 1000), 'kilo', 'kilos', 'kilogram', 'kilograms');
add(unit('mg', 'Milligrams', 'Mass', 0.001), 'milligram', 'milligrams');
add(unit('t', 'Tonnes', 'Mass', 1_000_000), 'tonne', 'tonnes', 'metricton', 'metrictons');
add(unit('lb', 'Pounds', 'Mass', 453.59237), 'lbs', 'pound', 'pounds');
add(unit('oz', 'Ounces', 'Mass', 28.349523125), 'ounce', 'ounces');
add(unit('st', 'Stones', 'Mass', 6350.29318), 'stone', 'stones');

add(unit('c', 'Celsius', 'Temperature', 1, true), 'celsius', '°c');
add(unit('f', 'Fahrenheit', 'Temperature', 1, true), 'fahrenheit', '°f');
add(unit('k', 'Kelvin', 'Temperature', 1, true), 'kelvin', 'kelvins');

add(unit('b', 'Bytes', 'Data', 1), 'byte', 'bytes');
add(unit('kb', 'Kilobytes', 'Data', 1e3), 'kilobyte', 'kilobytes');
add(unit('mb', 'Megabytes', 'Data', 1e6), 'megabyte', 'megabytes');
add(unit('gb', 'Gigabytes', 'Data', 1e9), 'gigabyte', 'gigabytes');
add(unit('tb', 'Terabytes', 'Data', 1e12), 'terabyte', 'terabytes');
add(unit('kib', 'Kibibytes', 'Data', 1024), 'kibibyte', 'kibibytes');
add(unit('mib', 'Mebibytes', 'Data', 1024 * 1024), 'mebibyte', 'mebibytes');
add(unit('gib', 'Gibibytes', 'Data', 1024 ** 3), 'gibibyte', 'gibibytes');
add(unit('tib', 'Tebibytes', 'Data', 1024 ** 4), 'tebibyte', 'tebibytes');
add(unit('bit', 'Bits', 'Data', 1 / 8), 'bits');

add(unit('s', 'Seconds', 'Duration', 1), 'second', 'seconds', 'sec', 'secs');
add(unit('min', 'Minutes', 'Duration', 60), 'minute', 'minutes', 'mins');
add(unit('h', 'Hours', 'Duration', 3600), 'hour', 'hours', 'hr', 'hrs');
add(unit('day', 'Days', 'Duration', 86400), 'days');
add(unit('week', 'Weeks', 'Duration', 604800), 'weeks');
add(unit('month', 'Months', 'Duration', 2_629_800), 'months');
add(unit('year', 'Years', 'Duration', 31_557_600), 'years');

add(unit('l', 'Liters', 'Volume', 1), 'liter', 'liters', 'litre', 'litres');
add(
  unit('ml', 'Milliliters', 'Volume', 0.001),
  'milliliter',
  'milliliters',
  'millilitre',
  'millilitres',
);
add(unit('gal', 'Gallons', 'Volume', 3.785411784), 'gallon', 'gallons');
add(unit('qt', 'Quarts', 'Volume', 0.946352946), 'quart', 'quarts');
add(unit('pt', 'Pints', 'Volume', 0.473176473), 'pint', 'pints');
add(unit('cup', 'Cups', 'Volume', 0.2365882365), 'cups');
add(unit('floz', 'Fluid ounces', 'Volume', 0.0295735295625), 'fluidounce', 'fluidounces');

add(
  unit('m2', 'Square meters', 'Area', 1),
  'sqm',
  'squaremeter',
  'squaremeters',
  'squaremetre',
  'squaremetres',
);
add(unit('km2', 'Square kilometers', 'Area', 1e6), 'sqkm', 'squarekilometer', 'squarekilometers');
add(unit('ft2', 'Square feet', 'Area', 0.09290304), 'sqft', 'squarefoot', 'squarefeet');
add(unit('mi2', 'Square miles', 'Area', 2_589_988.110336), 'sqmi', 'squaremile', 'squaremiles');
add(unit('ha', 'Hectares', 'Area', 10_000), 'hectare', 'hectares');
add(unit('acre', 'Acres', 'Area', 4046.8564224), 'acres');

add(unit('kmh', 'Kilometers per hour', 'Speed', 1), 'kph', 'km/h');
add(unit('mph', 'Miles per hour', 'Speed', 1.609344), 'mi/h');
add(unit('ms', 'Meters per second', 'Speed', 3.6), 'm/s');
add(unit('kn', 'Knots', 'Speed', 1.852), 'knot', 'knots');

export function isTemperature(unitInfo: UnitInfo): boolean {
  return unitInfo.category === 'Temperature';
}

export function toBase(unitInfo: UnitInfo, value: number): number {
  if (!unitInfo.offsetScale) {
    return value * unitInfo.toBase;
  }
  switch (unitInfo.canonical) {
    case 'f':
      return ((value - 32) * 5) / 9;
    case 'k':
      return value - 273.15;
    default:
      return value;
  }
}

export function fromBase(unitInfo: UnitInfo, celsius: number): number {
  if (!unitInfo.offsetScale) {
    return celsius / unitInfo.toBase;
  }
  switch (unitInfo.canonical) {
    case 'f':
      return (celsius * 9) / 5 + 32;
    case 'k':
      return celsius + 273.15;
    default:
      return celsius;
  }
}

export function tryParseUnit(text: string): UnitInfo | null {
  return UNITS.get(text.trim()) ?? null;
}

export interface UnitConversion {
  value: number;
  source: UnitInfo;
  target: UnitInfo;
}

export function tryConvertUnits(query: string): UnitConversion | null {
  const parts = query.split(/[ \t]+/).filter((part) => part.length > 0);
  if (parts.length < 3 || parts.length > 4) {
    return null;
  }
  const connector = parts.length === 3 ? parts[1] : parts[2];
  if (connector.toLowerCase() !== 'in' && connector.toLowerCase() !== 'to') {
    return null;
  }
  const target = tryParseUnit(parts[parts.length - 1]);
  if (!target) {
    return null;
  }
  const numberAndUnit = parts.length === 3 ? parts[0] : `${parts[0]} ${parts[1]}`;
  let numberEnd = 0;
  while (
    numberEnd < numberAndUnit.length &&
    (/[0-9]/.test(numberAndUnit[numberEnd]) ||
      numberAndUnit[numberEnd] === '.' ||
      numberAndUnit[numberEnd] === ',')
  ) {
    numberEnd++;
  }
  if (numberEnd === 0) {
    return null;
  }
  const value = Number(numberAndUnit.slice(0, numberEnd).replace(/,/g, ''));
  if (Number.isNaN(value)) {
    return null;
  }
  const source = tryParseUnit(numberAndUnit.slice(numberEnd).trim());
  if (!source) {
    return null;
  }
  if (source.category !== target.category) {
    return null;
  }
  return { value, source, target };
}

export function formatUnitValue(value: number, locale?: string): string {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return String(value);
  }
  const rounded = round(value, 10);
  if (Number.isInteger(rounded) && Math.abs(rounded) < 1e15) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(rounded);
  }
  return formatSignificant(rounded, 12);
}

export function round(value: number, digits: number): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

/** .NET "G12"-style: up to 12 significant digits, no trailing zeros. */
export function formatSignificant(value: number, digits: number): string {
  if (value === 0) {
    return '0';
  }
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const decimals = Math.min(Math.max(digits - 1 - magnitude, 0), 100);
  const scaled = round(value, decimals);
  if (Number.isInteger(scaled) && Math.abs(scaled) < 1e15) {
    return new Intl.NumberFormat(localeFor(digits), { maximumFractionDigits: 0 }).format(scaled);
  }
  return String(round(scaled, Math.max(0, Math.min(decimals, 15))));
}

function localeFor(_digits: number): string | undefined {
  return undefined;
}
