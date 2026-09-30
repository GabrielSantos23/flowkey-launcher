import { defineExtension } from '@flowkey-cli/native-sdk';
import manifestJson from '../manifest.json';
import { evaluate } from './engine/evaluator';

/**
 * Functional half of the calculator: the launcher's root search calls
 * `handlers.search` with the raw query, and math/unit/currency/date queries
 * come back as a Calculator section. The pretty web panel lives in
 * `index.web.tsx`; both share the engine in `src/engine/`.
 */

interface RatesCache {
  fetchedAtMs: number;
  rates: Record<string, number>;
}

const RATES_KEY = 'rates';
const RATES_TTL_MS = 12 * 60 * 60 * 1000;
// frankfurter moved to .dev: the legacy .app host 301s there, and redirects
// are re-validated against httpHosts, so call the new host directly.
const RATES_URL = 'https://api.frankfurter.dev/v1/latest?base=USD';

let refreshPromise: Promise<Map<string, number> | null> | null = null;

async function loadRates(
  ctx: {
    capabilities: {
      storage: {
        get(key: string): Promise<unknown>;
        set(key: string, value: unknown): Promise<void>;
      };
      http: { fetchJson<T>(url: string): Promise<T> };
    };
  },
  awaitRefresh = false,
): Promise<Map<string, number> | null> {
  const cached = (await ctx.capabilities.storage
    .get(RATES_KEY)
    .catch(() => null)) as RatesCache | null;
  // a usable cache carries the full rate table (~30 currencies); a degraded
  // one (older builds stored only USD after a failed parse) must re-fetch
  const cacheIsSane = cached && cached.rates && Object.keys(cached.rates).length >= 10;
  if (cacheIsSane && cached && cached.rates && typeof cached.fetchedAtMs === 'number') {
    const rates = toRateMap(cached.rates);
    if (Date.now() - cached.fetchedAtMs < RATES_TTL_MS) {
      return rates;
    }
    // stale-but-usable: answer with the cached rates and refresh behind the search
    if (awaitRefresh) {
      return await refreshRates(ctx, true);
    }
    void refreshRates(ctx);
    return rates;
  }
  // cold start: the first currency query waits for the fetch so the card does
  // not depend on the user typing another character afterwards
  if (awaitRefresh) {
    return await refreshRates(ctx, true);
  }
  void refreshRates(ctx);
  return null;
}

/** Fetches fresh rates; concurrent callers share one in-flight promise. */
function refreshRates(
  ctx: Parameters<typeof loadRates>[0],
  wait = false,
): Promise<Map<string, number> | null> {
  if (refreshPromise) {
    return wait ? refreshPromise : Promise.resolve(null);
  }
  refreshPromise = (async () => {
    try {
      const response = await ctx.capabilities.http.fetchJson<{ rates?: Record<string, number> }>(
        RATES_URL,
      );
      const rates: Record<string, number> = { USD: 1, ...(response.rates ?? {}) };
      await ctx.capabilities.storage.set(RATES_KEY, { fetchedAtMs: Date.now(), rates });
      return toRateMap(rates);
    } catch (error) {
      // surfaces in the launcher status bar (sidecar stderr) so failures are debuggable
      console.error('[calculator] rates fetch failed:', JSON.stringify(error) ?? String(error));
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

function toRateMap(record: Record<string, number>): Map<string, number> {
  const map = new Map<string, number>();
  for (const [code, rate] of Object.entries(record)) {
    map.set(code.toUpperCase(), rate);
  }
  map.set('USD', 1);
  return map;
}

export default defineExtension({
  manifest: manifestJson as unknown as Parameters<typeof defineExtension>[0]['manifest'],
  handlers: {
    async search(query, ctx) {
      // The calculator must never break the root search: any failure (rates
      // fetch, storage hiccup) degrades to no card.
      try {
        let rates = await loadRates(ctx);
        let result = evaluate(query, { now: () => new Date(), rates });
        if (!result && /[0-9]/.test(query.trim())) {
          // a numeric query that matched nothing is usually a currency
          // conversion on a cold start: wait once for the rates fetch
          rates = await loadRates(ctx, true);
          if (rates) {
            result = evaluate(query, { now: () => new Date(), rates });
          }
        }
        if (!result) {
          return { type: 'list', sections: [] };
        }
        // No section title: the shell's root merge (WithGroupHeaders) already
        // inserts a header from the extension name — a title here would duplicate it.
        return {
          type: 'list',
          sections: [
            {
              items: [
                {
                  id: 'calculator-result',
                  // Kind "calculator" renders the centered expression → answer
                  // card in the shell's result list.
                  kind: 'calculator',
                  title: result.result,
                  subtitle: result.expression,
                  accessories: [{ text: result.expressionBadge }, { text: result.resultBadge }],
                  actions: [
                    { id: 'copy', title: 'Copy Answer', primary: true },
                    { id: 'copyExpression', title: 'Copy Expression' },
                  ],
                },
              ],
            },
          ],
        };
      } catch (error) {
        // surfaces in the launcher status bar (sidecar stderr) so failures are debuggable
        console.error(
          '[calculator] search failed:',
          error instanceof Error ? error.message : JSON.stringify(error),
        );
        return { type: 'list', sections: [] };
      }
    },
    async onAction(actionId, item, ctx) {
      if (!item) {
        return null;
      }
      if (actionId === 'copy' && item.subtitle) {
        await ctx.native.call('clipboard.write', { text: item.subtitle });
      } else if (actionId === 'copyExpression') {
        await ctx.native.call('clipboard.write', { text: item.title });
      }
      return null;
    },
  },
});
