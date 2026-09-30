/**
 * Date, relative-time and world-clock evaluation — port of CalculatorDates.cs.
 * Time zones run through Intl with IANA ids; DST abbreviations come from the
 * per-place standard/daylight table, selected by comparing the zone's current
 * offset against its January/June offsets.
 */

export interface TimeZonePlace {
  displayName: string;
  ianaId: string;
  abbrevStandard: string;
  abbrevDaylight: string;
  aliases: string[];
}

export interface DateEvaluation {
  expressionBadge: string;
  result: string;
  resultBadge: string;
  isTimeZone: boolean;
}

const PLACES: TimeZonePlace[] = [
  {
    displayName: 'Sydney, Australia',
    ianaId: 'Australia/Sydney',
    abbrevStandard: 'AEST',
    abbrevDaylight: 'AEDT',
    aliases: ['sydney', 'syd', 'australia', 'aussie'],
  },
  {
    displayName: 'Melbourne, Australia',
    ianaId: 'Australia/Melbourne',
    abbrevStandard: 'AEST',
    abbrevDaylight: 'AEDT',
    aliases: ['melbourne', 'mel'],
  },
  {
    displayName: 'Brisbane, Australia',
    ianaId: 'Australia/Brisbane',
    abbrevStandard: 'AEST',
    abbrevDaylight: 'AEST',
    aliases: ['brisbane', 'bne'],
  },
  {
    displayName: 'Perth, Australia',
    ianaId: 'Australia/Perth',
    abbrevStandard: 'AWST',
    abbrevDaylight: 'AWST',
    aliases: ['perth', 'per'],
  },
  {
    displayName: 'Auckland, New Zealand',
    ianaId: 'Pacific/Auckland',
    abbrevStandard: 'NZST',
    abbrevDaylight: 'NZDT',
    aliases: ['auckland', 'akl', 'new zealand'],
  },
  {
    displayName: 'Tokyo, Japan',
    ianaId: 'Asia/Tokyo',
    abbrevStandard: 'JST',
    abbrevDaylight: 'JST',
    aliases: ['tokyo', 'tyo', 'japan'],
  },
  {
    displayName: 'Seoul, South Korea',
    ianaId: 'Asia/Seoul',
    abbrevStandard: 'KST',
    abbrevDaylight: 'KST',
    aliases: ['seoul', 'icn', 'south korea', 'korea'],
  },
  {
    displayName: 'Singapore',
    ianaId: 'Asia/Singapore',
    abbrevStandard: 'SGT',
    abbrevDaylight: 'SGT',
    aliases: ['singapore', 'sin'],
  },
  {
    displayName: 'Hong Kong',
    ianaId: 'Asia/Hong_Kong',
    abbrevStandard: 'HKT',
    abbrevDaylight: 'HKT',
    aliases: ['hong kong', 'hkg'],
  },
  {
    displayName: 'Shanghai, China',
    ianaId: 'Asia/Shanghai',
    abbrevStandard: 'CST',
    abbrevDaylight: 'CST',
    aliases: ['shanghai', 'pvg', 'china'],
  },
  {
    displayName: 'Beijing, China',
    ianaId: 'Asia/Shanghai',
    abbrevStandard: 'CST',
    abbrevDaylight: 'CST',
    aliases: ['beijing', 'pek'],
  },
  {
    displayName: 'Taipei, Taiwan',
    ianaId: 'Asia/Taipei',
    abbrevStandard: 'CST',
    abbrevDaylight: 'CST',
    aliases: ['taipei', 'tpe', 'taiwan'],
  },
  {
    displayName: 'Bangkok, Thailand',
    ianaId: 'Asia/Bangkok',
    abbrevStandard: 'ICT',
    abbrevDaylight: 'ICT',
    aliases: ['bangkok', 'bkk', 'thailand'],
  },
  {
    displayName: 'Jakarta, Indonesia',
    ianaId: 'Asia/Jakarta',
    abbrevStandard: 'WIB',
    abbrevDaylight: 'WIB',
    aliases: ['jakarta', 'cgk', 'indonesia'],
  },
  {
    displayName: 'Manila, Philippines',
    ianaId: 'Asia/Manila',
    abbrevStandard: 'PHT',
    abbrevDaylight: 'PHT',
    aliases: ['manila', 'mnl', 'philippines'],
  },
  {
    displayName: 'Kuala Lumpur, Malaysia',
    ianaId: 'Asia/Kuala_Lumpur',
    abbrevStandard: 'MYT',
    abbrevDaylight: 'MYT',
    aliases: ['kuala lumpur', 'kul', 'malaysia'],
  },
  {
    displayName: 'Mumbai, India',
    ianaId: 'Asia/Kolkata',
    abbrevStandard: 'IST',
    abbrevDaylight: 'IST',
    aliases: ['mumbai', 'bom', 'india'],
  },
  {
    displayName: 'New Delhi, India',
    ianaId: 'Asia/Kolkata',
    abbrevStandard: 'IST',
    abbrevDaylight: 'IST',
    aliases: ['delhi', 'new delhi', 'del'],
  },
  {
    displayName: 'Dubai, UAE',
    ianaId: 'Asia/Dubai',
    abbrevStandard: 'GST',
    abbrevDaylight: 'GST',
    aliases: ['dubai', 'dxb', 'uae'],
  },
  {
    displayName: 'Tel Aviv, Israel',
    ianaId: 'Asia/Jerusalem',
    abbrevStandard: 'IST',
    abbrevDaylight: 'IDT',
    aliases: ['tel aviv', 'tlv', 'israel'],
  },
  {
    displayName: 'Istanbul, Türkiye',
    ianaId: 'Europe/Istanbul',
    abbrevStandard: 'TRT',
    abbrevDaylight: 'TRT',
    aliases: ['istanbul', 'ist', 'turkey'],
  },
  {
    displayName: 'Moscow, Russia',
    ianaId: 'Europe/Moscow',
    abbrevStandard: 'MSK',
    abbrevDaylight: 'MSK',
    aliases: ['moscow', 'mow', 'russia'],
  },
  {
    displayName: 'Athens, Greece',
    ianaId: 'Europe/Athens',
    abbrevStandard: 'EET',
    abbrevDaylight: 'EEST',
    aliases: ['athens', 'ath', 'greece'],
  },
  {
    displayName: 'Helsinki, Finland',
    ianaId: 'Europe/Helsinki',
    abbrevStandard: 'EET',
    abbrevDaylight: 'EEST',
    aliases: ['helsinki', 'hel', 'finland'],
  },
  {
    displayName: 'Stockholm, Sweden',
    ianaId: 'Europe/Stockholm',
    abbrevStandard: 'CET',
    abbrevDaylight: 'CEST',
    aliases: ['stockholm', 'arn', 'sweden'],
  },
  {
    displayName: 'Oslo, Norway',
    ianaId: 'Europe/Oslo',
    abbrevStandard: 'CET',
    abbrevDaylight: 'CEST',
    aliases: ['oslo', 'osl', 'norway'],
  },
  {
    displayName: 'Copenhagen, Denmark',
    ianaId: 'Europe/Copenhagen',
    abbrevStandard: 'CET',
    abbrevDaylight: 'CEST',
    aliases: ['copenhagen', 'cph', 'denmark'],
  },
  {
    displayName: 'Berlin, Germany',
    ianaId: 'Europe/Berlin',
    abbrevStandard: 'CET',
    abbrevDaylight: 'CEST',
    aliases: ['berlin', 'munich', 'frankfurt', 'germany'],
  },
  {
    displayName: 'Zurich, Switzerland',
    ianaId: 'Europe/Zurich',
    abbrevStandard: 'CET',
    abbrevDaylight: 'CEST',
    aliases: ['zurich', 'zrh', 'switzerland'],
  },
  {
    displayName: 'Madrid, Spain',
    ianaId: 'Europe/Madrid',
    abbrevStandard: 'CET',
    abbrevDaylight: 'CEST',
    aliases: ['madrid', 'barcelona', 'spain'],
  },
  {
    displayName: 'Lisbon, Portugal',
    ianaId: 'Europe/Lisbon',
    abbrevStandard: 'WET',
    abbrevDaylight: 'WEST',
    aliases: ['lisbon', 'lis', 'portugal'],
  },
  {
    displayName: 'Rome, Italy',
    ianaId: 'Europe/Rome',
    abbrevStandard: 'CET',
    abbrevDaylight: 'CEST',
    aliases: ['rome', 'milan', 'italy'],
  },
  {
    displayName: 'Amsterdam, Netherlands',
    ianaId: 'Europe/Amsterdam',
    abbrevStandard: 'CET',
    abbrevDaylight: 'CEST',
    aliases: ['amsterdam', 'ams', 'netherlands'],
  },
  {
    displayName: 'Brussels, Belgium',
    ianaId: 'Europe/Brussels',
    abbrevStandard: 'CET',
    abbrevDaylight: 'CEST',
    aliases: ['brussels', 'bru', 'belgium'],
  },
  {
    displayName: 'Paris, France',
    ianaId: 'Europe/Paris',
    abbrevStandard: 'CET',
    abbrevDaylight: 'CEST',
    aliases: ['paris', 'cdg', 'france'],
  },
  {
    displayName: 'London, United Kingdom',
    ianaId: 'Europe/London',
    abbrevStandard: 'GMT',
    abbrevDaylight: 'BST',
    aliases: ['london', 'lon', 'lhr', 'uk', 'united kingdom', 'england'],
  },
  {
    displayName: 'Dublin, Ireland',
    ianaId: 'Europe/Dublin',
    abbrevStandard: 'GMT',
    abbrevDaylight: 'IST',
    aliases: ['dublin', 'dub', 'ireland'],
  },
  {
    displayName: 'Warsaw, Poland',
    ianaId: 'Europe/Warsaw',
    abbrevStandard: 'CET',
    abbrevDaylight: 'CEST',
    aliases: ['warsaw', 'waw', 'poland'],
  },
  {
    displayName: 'Prague, Czechia',
    ianaId: 'Europe/Prague',
    abbrevStandard: 'CET',
    abbrevDaylight: 'CEST',
    aliases: ['prague', 'prg', 'czechia', 'czech republic'],
  },
  {
    displayName: 'Vienna, Austria',
    ianaId: 'Europe/Vienna',
    abbrevStandard: 'CET',
    abbrevDaylight: 'CEST',
    aliases: ['vienna', 'vie', 'austria'],
  },
  {
    displayName: 'Budapest, Hungary',
    ianaId: 'Europe/Budapest',
    abbrevStandard: 'CET',
    abbrevDaylight: 'CEST',
    aliases: ['budapest', 'bud', 'hungary'],
  },
  {
    displayName: 'Bucharest, Romania',
    ianaId: 'Europe/Bucharest',
    abbrevStandard: 'EET',
    abbrevDaylight: 'EEST',
    aliases: ['bucharest', 'otpen', 'romania'],
  },
  {
    displayName: 'Kyiv, Ukraine',
    ianaId: 'Europe/Kyiv',
    abbrevStandard: 'EET',
    abbrevDaylight: 'EEST',
    aliases: ['kyiv', 'kiev', 'ukraine'],
  },
  {
    displayName: 'Reykjavik, Iceland',
    ianaId: 'Atlantic/Reykjavik',
    abbrevStandard: 'GMT',
    abbrevDaylight: 'GMT',
    aliases: ['reykjavik', 'kef', 'iceland'],
  },
  {
    displayName: 'Cape Town, South Africa',
    ianaId: 'Africa/Johannesburg',
    abbrevStandard: 'SAST',
    abbrevDaylight: 'SAST',
    aliases: ['cape town', 'johannesburg', 'south africa'],
  },
  {
    displayName: 'Nairobi, Kenya',
    ianaId: 'Africa/Nairobi',
    abbrevStandard: 'EAT',
    abbrevDaylight: 'EAT',
    aliases: ['nairobi', 'kenya'],
  },
  {
    displayName: 'Lagos, Nigeria',
    ianaId: 'Africa/Lagos',
    abbrevStandard: 'WAT',
    abbrevDaylight: 'WAT',
    aliases: ['lagos', 'nigeria'],
  },
  {
    displayName: 'Cairo, Egypt',
    ianaId: 'Africa/Cairo',
    abbrevStandard: 'EET',
    abbrevDaylight: 'EEST',
    aliases: ['cairo', 'egypt'],
  },
  {
    displayName: 'Buenos Aires, Argentina',
    ianaId: 'America/Argentina/Buenos_Aires',
    abbrevStandard: 'ART',
    abbrevDaylight: 'ART',
    aliases: ['buenos aires', 'eze', 'argentina'],
  },
  {
    displayName: 'Santiago, Chile',
    ianaId: 'America/Santiago',
    abbrevStandard: 'CLT',
    abbrevDaylight: 'CLST',
    aliases: ['santiago', 'scl', 'chile'],
  },
  {
    displayName: 'Lima, Peru',
    ianaId: 'America/Lima',
    abbrevStandard: 'PET',
    abbrevDaylight: 'PET',
    aliases: ['lima', 'peru'],
  },
  {
    displayName: 'Bogotá, Colombia',
    ianaId: 'America/Bogota',
    abbrevStandard: 'COT',
    abbrevDaylight: 'COT',
    aliases: ['bogota', 'bog', 'colombia'],
  },
  {
    displayName: 'Mexico City, Mexico',
    ianaId: 'America/Mexico_City',
    abbrevStandard: 'CST',
    abbrevDaylight: 'CST',
    aliases: ['mexico city', 'mex', 'mexico'],
  },
  {
    displayName: 'Caracas, Venezuela',
    ianaId: 'America/Caracas',
    abbrevStandard: 'VET',
    abbrevDaylight: 'VET',
    aliases: ['caracas', 'venezuela'],
  },
  {
    displayName: 'São Paulo, Brazil',
    ianaId: 'America/Sao_Paulo',
    abbrevStandard: 'BRT',
    abbrevDaylight: 'BRST',
    aliases: ['sao paulo', 'são paulo', 'sao', 'gru', 'sp', 'brazil', 'brasil', 'bra'],
  },
  {
    displayName: 'Rio de Janeiro, Brazil',
    ianaId: 'America/Sao_Paulo',
    abbrevStandard: 'BRT',
    abbrevDaylight: 'BRST',
    aliases: ['rio de janeiro', 'rio', 'gig', 'rj'],
  },
  {
    displayName: 'Brasília, Brazil',
    ianaId: 'America/Sao_Paulo',
    abbrevStandard: 'BRT',
    abbrevDaylight: 'BRST',
    aliases: ['brasilia', 'brasília', 'bsb'],
  },
  {
    displayName: 'Belo Horizonte, Brazil',
    ianaId: 'America/Sao_Paulo',
    abbrevStandard: 'BRT',
    abbrevDaylight: 'BRST',
    aliases: ['belo horizonte', 'cnf', 'bh'],
  },
  {
    displayName: 'Salvador, Brazil',
    ianaId: 'America/Bahia',
    abbrevStandard: 'BRT',
    abbrevDaylight: 'BRT',
    aliases: ['salvador', 'ssa'],
  },
  {
    displayName: 'Recife, Brazil',
    ianaId: 'America/Recife',
    abbrevStandard: 'BRT',
    abbrevDaylight: 'BRT',
    aliases: ['recife', 'rec'],
  },
  {
    displayName: 'Fortaleza, Brazil',
    ianaId: 'America/Fortaleza',
    abbrevStandard: 'BRT',
    abbrevDaylight: 'BRT',
    aliases: ['fortaleza', 'for'],
  },
  {
    displayName: 'Manaus, Brazil',
    ianaId: 'America/Manaus',
    abbrevStandard: 'AMT',
    abbrevDaylight: 'AMT',
    aliases: ['manaus', 'mao'],
  },
  {
    displayName: 'New York, United States',
    ianaId: 'America/New_York',
    abbrevStandard: 'EST',
    abbrevDaylight: 'EDT',
    aliases: [
      'new york',
      'nyc',
      'ny',
      'jfk',
      'ewr',
      'lga',
      'united states',
      'us',
      'usa',
      'u.s.',
      'america',
    ],
  },
  {
    displayName: 'Boston, United States',
    ianaId: 'America/New_York',
    abbrevStandard: 'EST',
    abbrevDaylight: 'EDT',
    aliases: ['boston', 'bos'],
  },
  {
    displayName: 'Washington, United States',
    ianaId: 'America/New_York',
    abbrevStandard: 'EST',
    abbrevDaylight: 'EDT',
    aliases: ['washington', 'iad', 'dca'],
  },
  {
    displayName: 'Miami, United States',
    ianaId: 'America/New_York',
    abbrevStandard: 'EST',
    abbrevDaylight: 'EDT',
    aliases: ['miami', 'mia'],
  },
  {
    displayName: 'Atlanta, United States',
    ianaId: 'America/New_York',
    abbrevStandard: 'EST',
    abbrevDaylight: 'EDT',
    aliases: ['atlanta', 'atl'],
  },
  {
    displayName: 'Toronto, Canada',
    ianaId: 'America/Toronto',
    abbrevStandard: 'EST',
    abbrevDaylight: 'EDT',
    aliases: ['toronto', 'yyz', 'canada'],
  },
  {
    displayName: 'Montreal, Canada',
    ianaId: 'America/Toronto',
    abbrevStandard: 'EST',
    abbrevDaylight: 'EDT',
    aliases: ['montreal', 'yul'],
  },
  {
    displayName: 'Vancouver, Canada',
    ianaId: 'America/Vancouver',
    abbrevStandard: 'PST',
    abbrevDaylight: 'PDT',
    aliases: ['vancouver', 'yvr'],
  },
  {
    displayName: 'Chicago, United States',
    ianaId: 'America/Chicago',
    abbrevStandard: 'CST',
    abbrevDaylight: 'CDT',
    aliases: ['chicago', 'ord', 'mdw'],
  },
  {
    displayName: 'Dallas, United States',
    ianaId: 'America/Chicago',
    abbrevStandard: 'CST',
    abbrevDaylight: 'CDT',
    aliases: ['dallas', 'dfw', 'houston', 'iah'],
  },
  {
    displayName: 'Denver, United States',
    ianaId: 'America/Denver',
    abbrevStandard: 'MST',
    abbrevDaylight: 'MDT',
    aliases: ['denver', 'phoenix', 'phx', 'arizona'],
  },
  {
    displayName: 'Los Angeles, United States',
    ianaId: 'America/Los_Angeles',
    abbrevStandard: 'PST',
    abbrevDaylight: 'PDT',
    aliases: ['los angeles', 'la', 'lax', 'california'],
  },
  {
    displayName: 'San Francisco, United States',
    ianaId: 'America/Los_Angeles',
    abbrevStandard: 'PST',
    abbrevDaylight: 'PDT',
    aliases: ['san francisco', 'sf', 'sfo', 'sjc', 'san jose'],
  },
  {
    displayName: 'Seattle, United States',
    ianaId: 'America/Los_Angeles',
    abbrevStandard: 'PST',
    abbrevDaylight: 'PDT',
    aliases: ['seattle', 'sea'],
  },
  {
    displayName: 'Las Vegas, United States',
    ianaId: 'America/Los_Angeles',
    abbrevStandard: 'PST',
    abbrevDaylight: 'PDT',
    aliases: ['las vegas', 'las'],
  },
  {
    displayName: 'Honolulu, United States',
    ianaId: 'Pacific/Honolulu',
    abbrevStandard: 'HST',
    abbrevDaylight: 'HST',
    aliases: ['honolulu', 'hnl', 'hawaii'],
  },
  {
    displayName: 'Anchorage, United States',
    ianaId: 'America/Anchorage',
    abbrevStandard: 'AKST',
    abbrevDaylight: 'AKDT',
    aliases: ['anchorage', 'anc', 'alaska'],
  },
];

const NAMED_DATES: Record<string, { month: number; day: number }> = {
  christmas: { month: 12, day: 25 },
  'new year': { month: 1, day: 1 },
  halloween: { month: 10, day: 31 },
  valentines: { month: 2, day: 14 },
  valentine: { month: 2, day: 14 },
};

export function findPlace(query: string): TimeZonePlace | null {
  const normalized = query.trim().toLowerCase();
  for (const place of PLACES) {
    if (place.aliases.some((alias) => alias === normalized)) {
      return place;
    }
  }
  for (const place of PLACES) {
    const name = place.displayName.toLowerCase();
    if (name.startsWith(`${normalized},`) || name === normalized) {
      return place;
    }
  }
  for (const place of PLACES) {
    if (place.aliases.some((alias) => alias.startsWith(normalized))) {
      return place;
    }
  }
  return null;
}

export function tryEvaluateDates(query: string, now: Date, locale?: string): DateEvaluation | null {
  const normalized = query.trim().toLowerCase();

  if (normalized === 'now' || normalized === 'time') {
    return {
      expressionBadge: 'Now',
      result: formatTime(now, locale),
      resultBadge: 'Local time',
      isTimeZone: false,
    };
  }
  if (normalized === 'today') {
    return {
      expressionBadge: 'Today',
      result: formatLongDate(now, locale),
      resultBadge: 'Date',
      isTimeZone: false,
    };
  }
  if (normalized === 'tomorrow' || normalized === 'yesterday') {
    const day = new Date(now);
    day.setDate(day.getDate() + (normalized === 'tomorrow' ? 1 : -1));
    return {
      expressionBadge: normalized === 'tomorrow' ? 'Tomorrow' : 'Yesterday',
      result: formatLongDate(day, locale),
      resultBadge: 'Date',
      isTimeZone: false,
    };
  }

  const relative = tryRelative(normalized, now, locale);
  if (relative) {
    return relative;
  }

  if (normalized.startsWith('days until ')) {
    const target = tryParseDate(normalized.slice('days until '.length), now);
    if (target) {
      while (startOfDay(target) < startOfDay(now)) {
        target.setFullYear(target.getFullYear() + 1);
      }
      const days = Math.round(
        (startOfDay(target).getTime() - startOfDay(now).getTime()) / 86400000,
      );
      return {
        expressionBadge: formatLongDate(target, locale),
        result: days === 1 ? '1 day' : `${days} days`,
        resultBadge: 'Countdown',
        isTimeZone: false,
      };
    }
  }

  if (normalized.startsWith('time in ')) {
    const place = findPlace(normalized.slice('time in '.length));
    if (place) {
      const abbreviation = zoneAbbreviation(place, now);
      if (abbreviation) {
        return {
          expressionBadge: place.displayName,
          result: formatTimeInZone(now, place.ianaId, locale),
          resultBadge: abbreviation,
          isTimeZone: true,
        };
      }
    }
  }

  return null;
}

function tryRelative(normalized: string, now: Date, locale?: string): DateEvaluation | null {
  const tokens = normalized.split(' ').filter((token) => token.length > 0);
  if (tokens.length === 3 && tokens[0] === 'in') {
    const when = tryQuantity(tokens[1], tokens[2], now);
    if (when) {
      const dateOnly = isDateUnit(tokens[2]);
      return {
        expressionBadge: titleCase(`${tokens[1]} ${tokens[2]}`) + ' from now',
        result: dateOnly ? formatLongDate(when, locale) : formatLongDateTime(when, locale),
        resultBadge: dateOnly ? 'Date' : 'Local time',
        isTimeZone: false,
      };
    }
  }
  if (tokens.length === 4 && tokens[2] === 'from' && tokens[3] === 'now') {
    const when = tryQuantity(tokens[0], tokens[1], now);
    if (when) {
      const dateOnly = isDateUnit(tokens[1]);
      const adjusted = dateOnly ? startOfDay(when) : when;
      return {
        expressionBadge: titleCase(`${tokens[0]} ${tokens[1]}`) + ' from now',
        result: dateOnly ? formatLongDate(adjusted, locale) : formatLongDateTime(adjusted, locale),
        resultBadge: dateOnly ? 'Date' : 'Local time',
        isTimeZone: false,
      };
    }
  }
  if (tokens.length === 3 && tokens[2] === 'ago') {
    const when = tryQuantity(tokens[0], tokens[1], now);
    if (when) {
      const span = when.getTime() - now.getTime();
      const past = new Date(now.getTime() - span);
      const dateOnly = isDateUnit(tokens[1]);
      const adjusted = dateOnly ? startOfDay(past) : past;
      return {
        expressionBadge: titleCase(`${tokens[0]} ${tokens[1]}`) + ' ago',
        result: dateOnly ? formatLongDate(adjusted, locale) : formatLongDateTime(adjusted, locale),
        resultBadge: dateOnly ? 'Date' : 'Local time',
        isTimeZone: false,
      };
    }
  }
  return null;
}

function isDateUnit(unitText: string): boolean {
  const unit = unitText.replace(/s$/, '');
  return unit === 'day' || unit === 'week' || unit === 'month' || unit === 'year';
}

function tryQuantity(countText: string, unitText: string, now: Date): Date | null {
  const count = Number(countText);
  if (!Number.isInteger(count) || count < 0) {
    return null;
  }
  const unit = unitText.replace(/s$/, '');
  const when = new Date(now);
  switch (unit) {
    case 'second':
    case 'sec':
      when.setSeconds(when.getSeconds() + count);
      break;
    case 'minute':
    case 'min':
      when.setMinutes(when.getMinutes() + count);
      break;
    case 'hour':
    case 'hr':
      when.setHours(when.getHours() + count);
      break;
    case 'day':
      when.setDate(when.getDate() + count);
      break;
    case 'week':
      when.setDate(when.getDate() + count * 7);
      break;
    case 'month':
      when.setMonth(when.getMonth() + count);
      break;
    case 'year':
      when.setFullYear(when.getFullYear() + count);
      break;
    default:
      return null;
  }
  return when;
}

function tryParseDate(text: string, now: Date): Date | null {
  const normalized = text.trim();
  const named = NAMED_DATES[normalized];
  if (named) {
    return new Date(now.getFullYear(), named.month - 1, named.day);
  }
  // yyyy-MM-dd, d MMM(M), MMM(M) d, dd/MM, d/M
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (iso) {
    const parsed = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const monthFormats = [/^(\d{1,2}) ([a-z]+)$/i, /^([a-z]+) (\d{1,2})$/i];
  for (const pattern of monthFormats) {
    const match = pattern.exec(normalized);
    if (match) {
      const day = Number(pattern === monthFormats[0] ? match[1] : match[2]);
      const monthName = pattern === monthFormats[0] ? match[2] : match[1];
      const month = monthFromName(monthName);
      if (month >= 0 && day >= 1 && day <= 31) {
        return new Date(now.getFullYear(), month, day);
      }
      return null;
    }
  }
  const slash = /^(\d{1,2})\/(\d{1,2})$/.exec(normalized);
  if (slash) {
    // dd/MM
    return new Date(now.getFullYear(), Number(slash[2]) - 1, Number(slash[1]));
  }
  return null;
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

function monthFromName(name: string): number {
  const lower = name.toLowerCase();
  const full = MONTHS.indexOf(lower);
  if (full >= 0) {
    return full;
  }
  const short = MONTHS.findIndex((month) => month.slice(0, 3) === lower.slice(0, 3));
  return short;
}

/** True when the zone is on its daylight offset at the given instant. */
function zoneAbbreviation(place: TimeZonePlace, when: Date): string | null {
  try {
    // Probe the zone's offsets in January and June; the smaller one is the
    // daylight offset for northern-hemisphere-style zones (and vice versa).
    const january = zoneOffsetMinutes(place.ianaId, new Date(when.getFullYear(), 0, 1));
    const june = zoneOffsetMinutes(place.ianaId, new Date(when.getFullYear(), 5, 1));
    const current = zoneOffsetMinutes(place.ianaId, when);
    if (january === null || june === null || current === null) {
      return place.abbrevStandard;
    }
    const daylightOffset = Math.min(january, june);
    return current === daylightOffset ? place.abbrevDaylight : place.abbrevStandard;
  } catch {
    return null;
  }
}

function zoneOffsetMinutes(ianaId: string, when: Date): number | null {
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: ianaId,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(when);
    const parts: Record<string, string> = {};
    for (const part of formatted) {
      if (part.type !== 'literal') {
        parts[part.type] = part.value;
      }
    }
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    return (asUtc - when.getTime()) / 60000;
  } catch {
    return null;
  }
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function titleCase(text: string): string {
  return text.replace(/(^|\s)(\S)/g, (_, space, letter) => space + letter.toUpperCase());
}

function formatTime(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function formatTimeInZone(date: Date, timeZone: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  }).format(date);
}

function formatLongDate(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatLongDateTime(date: Date, locale?: string): string {
  return `${formatLongDate(date, locale)} ${formatTime(date, locale)}`;
}
