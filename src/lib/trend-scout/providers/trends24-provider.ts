/**
 * trends24.in adapter — free, no-auth source of X (Twitter) trending topics.
 *
 * trends24.in is a public third-party site that has been tracking X (Twitter)
 * trends for over a decade. It publishes trends hourly per country/region in
 * plain HTML — no API key, no auth, no cookies required.
 *
 * We use this as the no-config default for the Twitter/X trend provider.
 * When the user later configures Agent Reach's `twitter` CLI with their own
 * cookies (via Cookie-Editor export), the provider upgrades to the richer
 * Agent Reach path (real tweet counts, full search access). Until then,
 * trends24.in gives us honest, real, no-auth X trend data.
 *
 * Honesty notes:
 *  - trends24.in trends are X's own "trending topics" list per region. They
 *    are NOT the same as Google Trends search trends — they reflect what
 *    people are tweeting about, not what they're searching for.
 *  - tweet counts from trends24.in are sometimes empty (X throttles them
 *    for some trends); we never fabricate them.
 *  - We clearly tag these as `dataSource: "trends24_in"` so the UI can show
 *    "X (via trends24.in)" as the source.
 */

import { withRateLimit } from "../rate-limit";
import { cacheReadThrough, TTL } from "../cache";
import type { RawTrendRow, TrendProvider } from "./trends-provider";

const BASE = "https://trends24.in";

// Map our internal country codes to trends24.in URL slugs.
// trends24.in uses lowercase-hyphenated country names.
const COUNTRY_SLUGS: Record<string, string> = {
  US: "united-states",
  GB: "united-kingdom",
  BR: "brazil",
  IN: "india",
  DE: "germany",
  JP: "japan",
  MX: "mexico",
  ES: "spain",
  FR: "france",
  CA: "canada",
  AU: "australia",
  AE: "united-arab-emirates",
  NG: "nigeria",
  ZA: "south-africa",
  ID: "indonesia",
  PH: "philippines",
  KR: "south-korea",
  IT: "italy",
  TR: "turkey",
  AR: "argentina",
};

function buildUrl(country: string): string {
  const slug = COUNTRY_SLUGS[country] ?? "united-states";
  return `${BASE}/${slug}/`;
}

export const trends24Provider: TrendProvider = {
  name: "trends24_in",

  async available(): Promise<boolean> {
    try {
      const res = await fetch(buildUrl("US"), {
        method: "GET",
        signal: AbortSignal.timeout(5000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
          Accept: "text/html",
        },
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async fetchRaw(country: string, _language: string): Promise<RawTrendRow[]> {
    const url = buildUrl(country);
    const cacheKey = `t24:${country}`;
    return cacheReadThrough(cacheKey, TTL.TRENDS_RSS, async () => {
      const res = await withRateLimit("t24", 2, async () => {
        const r = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
            Accept: "text/html",
          },
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) throw new Error(`trends24.in ${country} -> HTTP ${r.status}`);
        return r.text();
      });
      if (!res.ok) {
        throw new Error(`trends24.in fetch failed after retries: ${res.error}`);
      }
      return parseTrends24Html(res.value, country);
    });
  },
};

/**
 * Parse trends24.in HTML to extract trend rows.
 *
 * Structure (simplified):
 *   <ol>
 *     <li>
 *       <span class="trend-name">
 *         <a href="https://twitter.com/search?q=...">Trend Name</a>
 *         <span class="tweet-count" data-count="12345">12,345</span>
 *       </span>
 *     </li>
 *     ...
 *   </ol>
 *
 * The page has multiple <ol> elements — one per hourly time bucket. We
 * take the first one (most recent) and deduplicate trend names.
 */
export function parseTrends24Html(html: string, country: string): RawTrendRow[] {
  // Pull all <ol>...</ol> blocks, take the first (most recent hour)
  const olMatch = html.match(/<ol[^>]*>([\s\S]*?)<\/ol>/);
  if (!olMatch) return [];
  const ol = olMatch[1];

  // Pull each <li>...</li>
  const liMatches = ol.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g);
  const seen = new Set<string>();
  const rows: RawTrendRow[] = [];
  const now = new Date();

  for (const m of liMatches) {
    const li = m[1];
    const aMatch = li.match(/<a[^>]*>([^<]+)<\/a>/);
    if (!aMatch) continue;
    const title = decodeEntities(aMatch[1].trim());
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());

    const countMatch = li.match(/data-count="([^"]*)"/);
    const tweetCount = countMatch?.[1]?.trim();
    // Only show count label when the data is present (X sometimes throttles)
    const approxTraffic = tweetCount && tweetCount !== "" ? `${formatCount(tweetCount)} tweets` : undefined;

    // Strip leading # for hashtags to make the trend title cleaner
    const cleanTitle = title.replace(/^#/, "");

    rows.push({
      title: cleanTitle,
      approxTraffic,
      publishedAt: now.toISOString(),
      thumbnailUrl: undefined,
      thumbnailSource: undefined,
      newsItems: [],
      relatedQueries: [],
      source: "trends24_in" as const,
      estimated: false,
    });
    if (rows.length >= 20) break;
  }
  return rows;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, "&");
}

function formatCount(s: string): string {
  // trends24 stores raw numbers as strings like "12345"
  const n = parseInt(s, 10);
  if (!Number.isFinite(n)) return s;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
