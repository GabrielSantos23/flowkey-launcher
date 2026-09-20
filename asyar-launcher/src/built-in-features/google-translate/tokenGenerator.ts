import { fetchUrl } from '../../lib/ipc/commands';

function zr(a: string, bValue: number, d1: number): string {
  const e: number[] = [];
  for (let f = 0, g = 0; g < a.length; g++) {
    let l = a.charCodeAt(g);
    if (l < 128) {
      e[f++] = l;
    } else if (l < 2048) {
      e[f++] = (l >> 6) | 192;
      e[f++] = (l & 63) | 128;
    } else if (
      (l & 64512) === 55296 &&
      g + 1 < a.length &&
      (a.charCodeAt(g + 1) & 64512) === 56320
    ) {
      l = 65536 + ((l & 1023) << 10) + (a.charCodeAt(++g) & 1023);
      e[f++] = (l >> 18) | 240;
      e[f++] = ((l >> 12) & 63) | 128;
      e[f++] = ((l >> 6) & 63) | 128;
      e[f++] = (l & 63) | 128;
    } else {
      e[f++] = (l >> 12) | 224;
      e[f++] = ((l >> 6) & 63) | 128;
      e[f++] = (l & 63) | 128;
    }
  }

  let h = bValue;
  for (let f = 0; f < e.length; f++) {
    h += e[f];
    h = xr(h, '+-a^+6');
  }
  h = xr(h, '+-3^+b+-f');
  h ^= d1;
  if (0 > h) {
    h = (h & 2147483647) + 2147483648;
  }
  h %= 1e6;
  return `${h.toString()}.${h ^ bValue}`;
}

function xr(a: number, b: string): number {
  for (let c = 0; c < b.length - 2; c += 3) {
    let d = b.charAt(c + 2);
    const dNum = d >= 'a' ? d.charCodeAt(0) - 87 : Number(d);
    const shifted = b.charAt(c + 1) === '+' ? a >>> dNum : a << dNum;
    a = b.charAt(c) === '+' ? (a + shifted) & 4294967295 : a ^ shifted;
  }
  return a;
}

let cachedTKK = '0';
let lastTkkUpdate = 0;

export async function updateTKK(customFetch?: typeof fetch): Promise<string> {
  const nowHour = Math.floor(Date.now() / 3600000);
  if (lastTkkUpdate !== nowHour) {
    try {
      let body: string | null = null;
      if (customFetch) {
        const response = await customFetch('https://translate.google.com');
        body = await response.text();
      } else {
        const res = await fetchUrl({
          url: 'https://translate.google.com',
          method: 'GET',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          callerExtensionId: 'google-translate',
        });
        if (res && res.ok) {
          body = res.body;
        } else if (!res) {
          const response = await fetch('https://translate.google.com');
          body = await response.text();
        }
      }

      if (body) {
        const code = body.match(/tkk:'\d+\.\d+'/g);
        if (code && code.length > 0) {
          const xt = code[0].split(':')[1].replace(/'/g, '');
          cachedTKK = xt;
          lastTkkUpdate = nowHour;
        }
      }
    } catch {
      // Fall back to existing cached TKK
    }
  }
  return cachedTKK;
}

export async function tokenGenerator(
  text: string,
  customFetch?: typeof fetch,
): Promise<{ name: string; value: string }> {
  try {
    const tkk = await updateTKK(customFetch);
    const parts = tkk.split('.');
    const bValue = Number(parts[0]) || 0;
    const d1 = Number(parts[1]) || 0;
    const tk = zr(text, bValue, d1);
    return { name: 'tk', value: tk };
  } catch {
    return { name: 'tk', value: '' };
  }
}
