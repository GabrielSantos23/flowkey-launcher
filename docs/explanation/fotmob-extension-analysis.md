# FotMob Raycast Extension — Data Extraction Analysis

An analysis of `raycast-extensions/fotmob/` (v1.0.0): how it obtains football
data, the trade-offs of that approach, and how it compares to our
`extensions/football-scores` extension (football-data.org).

## 1. How it gets data

The extension uses **three different extraction channels**, chosen per data
type. There is **no API key and no authentication anywhere** — everything
relies on endpoints FotMob exposes for its own website/app.

### 1.1 Public (undocumented) JSON API — match schedules

```
GET https://www.fotmob.com/api/data/matches?date=YYYYMMDD&timezone=<local tz>
```

- Returns the full matchday slate: every league playing that day, with live
  statuses, scores, and team IDs (`src/utils/fotmob-client.ts:79`).
- This is the website's own internal API — undocumented, unversioned, but
  stable in practice and fast (near-real-time scores).
- No rate-limit handling: the extension just calls it on demand and lets
  Raycast's `useCachedPromise` memoize per query.

### 1.2 Search gateway — teams, players, matches

```
GET https://apigw.fotmob.com/searchapi/suggest?term=<query>&lang=en
```

- A separate API gateway (`apigw.fotmob.com`) used by the site's search box.
- Returns suggestions in categories (`teamSuggest`, `squadMemberSuggest`,
  match suggestions) with payload IDs, parsed in `src/hooks/useSearch.ts`.
- This is what makes team/player search **instant and global**: FotMob's
  search index covers every competition on earth, no per-competition
  indexing, no API key.

### 1.3 HTML scraping of the `__NEXT_DATA__` payload — rich pages

For anything deep (team fixtures, league tables, match statistics, player
details), the extension fetches the **HTML page** and regex-extracts the
Next.js hydration payload:

```ts
// src/utils/fotmob-client.ts:96
const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
```

- `fetchTeamPageData(id)` → `https://www.fotmob.com/teams/{id}` — upcoming
  match, ongoing match, previous/next fixtures (`useTeamDetail.ts` derives
  `calculated.ongoingMatch` / `upcomingMatch` from the fixture list).
- `fetchLeaguePageData(id)` → `https://www.fotmob.com/leagues/{id}` — tables,
  fixtures, top scorers.
- Match detail pages similarly yield stats (possession, shots, …) matched by
  normalized keys (`useMatchDetail.ts`).
- The code is honest about the fragility — comment at
  `fotmob-client.ts:86`: _"FotMob no longer exposes a usable public JSON API
  for these pages"_ — i.e. scraping is already the **fallback** after FotMob
  killed the old JSON API.

All parsing is defensive (`isRecord`/`getString`/`getNumber` helpers), which
mitigates but does not remove the breakage risk.

### 1.4 Images — deterministic CDN URLs, zero requests

```
https://images.fotmob.com/image_resources/logo/teamlogo/{teamId}.png
https://images.fotmob.com/image_resources/logo/leaguelogo/{light|dark}/{leagueId}.png
https://images.fotmob.com/image_resources/playerimages/{playerId}.png
```

No fetch, no auth, no caching needed — the URL is derived purely from the
entity ID (`src/utils/url-builder.ts`). This is a notable elegance: shields
"just work" and cost nothing.

### 1.5 State

Favorites (teams/players/leagues) persist in Raycast local storage with a
tiny typed schema (`src/storages/schema.ts`). No polling, no background
process — everything is pull-based while a command is open.

## 2. Comparison with our `football-scores` extension

| Dimension                    | FotMob (Raycast)                                                                                                     | football-scores (ours)                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Data source**              | Undocumented private endpoints + HTML scraping                                                                       | Official football-data.org API, documented, key-authenticated                                   |
| **Coverage**                 | Global: every league/cup on earth, players, lineups, match stats, xG                                                 | Free key: 12 competitions, teams & scores only (no players/stats)                               |
| **Score latency**            | Near-real-time (same feed as the FotMob site)                                                                        | Free tier: delayed (minutes), updated per poll                                                  |
| **Search**                   | Instant, server-side, global (their search index)                                                                    | One-time ~1 min team-index build (per-competition lists), then instant/local                    |
| **Images**                   | Deterministic CDN URLs, zero cost                                                                                    | `crests.football-data.org` URLs; needs data-URL inlining inside our extension CSP               |
| **Cost**                     | Free (unofficial)                                                                                                    | Free tier: 10 req/min, 12 competitions                                                          |
| **Rate limits**              | None enforced by us; endpoint could throttle/lock out scrapers anytime                                               | Hard budget we actively manage (throttled index build, 1 req/min live polling)                  |
| **Stability**                | **Brittle by design** — FotMob already killed one public API; page-scrape fallback breaks silently on site redesigns | Stable: versioned API, ToS-clean                                                                |
| **Background/live behavior** | None — data only while a command is open                                                                             | Always-on worker: pinned Dynamic Island live score, goal alerts, kickoff reminders, quiet hours |
| **Platform integration**     | Raycast UI lists                                                                                                     | Asyar permission system, storage isolation, Dynamic Island (`pinned`/`dismiss`)                 |

### Where FotMob is genuinely better

1. **Breadth**: global coverage (Brazil included), players, match statistics,
   league tables — the official API can't match this on the free tier.
2. **Zero-config**: no API key, no rate-limit math, no index building. Search
   is server-side and instant.
3. **Image strategy**: deriving CDN URLs from IDs is simpler and cheaper than
   our crest fetching + CSP data-URL workaround.
4. **Score freshness**: same latency as the FotMob app.

### Where ours is genuinely better

1. **Legitimacy & longevity**: we use a licensed, documented API designed for
   consumers; FotMob's channels are unofficial — a redesign or CDN rule
   breaks the extension with no warning (and scraping their site is in a
   ToS gray zone).
2. **Ambient live behavior**: our core feature — the pinned Dynamic Island
   score, goal alerts, reminders — has no equivalent in the Raycast
   extension, which is purely pull-based.
3. **Background correctness**: an always-on worker with rate-limit budgeting,
   persistent resume-able state, and quiet hours vs. "fetch when opened".

## 3. Practical takeaways for our extension

1. **Hybrid provider strategy is viable and cheap.** FotMob's endpoints need
   no key, so our extension could add a second provider used for
   _search/team images/next-fixture enrichment_, with football-data.org
   remaining the source of truth for live scores. `src/api.ts` is already
   provider-isolated; a `FotmobProvider` implementing the same surface is a
   contained addition.
2. **Adopt the deterministic-CDN image idea where licenses allow.** Any
   provider that exposes stable image URLs lets us drop the crest
   fetch-and-inline step for that provider.
3. **Keep scraping out of the critical path.** If we use FotMob channels,
   treat them as best-effort enrichment (search suggest, logos) — never for
   the live-score loop, where a silent break would be invisible until a user
   misses a goal notification.
4. **Learn from their defensive parsing.** The `isRecord`/`get*` helpers and
   strict per-field normalization are a good pattern for any future
   provider with loose schemas.
5. **Respect the legal line.** Pulling an undocumented API for personal,
   non-commercial use is what the Raycast extension does; redistributing our
   extension doing the same shifts the exposure to every user. football-data
   .org's official free tier has no such problem — that is the right default
   for a distributable extension.

## 4. Verdict

**As a data extractor, the FotMob extension is better** — broader, faster,
free, and elegantly simple (three channels, no keys). **As a product for our
platform, ours is better** — it is the only one of the two that can deliver
the Dynamic Island live-score experience at all, it stays inside official
API terms, and it manages its quota like a long-lived background citizen.
The strongest version of our extension borrows FotMob's channels for search
and images while keeping football-data.org as the trusted live-score
backbone.
