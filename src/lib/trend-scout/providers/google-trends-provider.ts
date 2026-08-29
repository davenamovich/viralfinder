/**
 * Google Trends RSS provider.
 *
 * Uses the public Google Trends "Daily Search Trends" RSS feed:
 *   https://trends.google.com/trending/rss?geo=US
 *
 * This endpoint is public and does not require an API key. It returns
 * today's top 20 daily search trends for a country, with related news items
 * and approx-traffic.
 *
 * Time-window handling:
 *   - "now" / "24h": uses the live RSS snapshot.
 *   - "7d" / "30d": combines the cached snapshot history (if any) with the
 *     live RSS. We are explicit about how many days of history are actually
 *     available — we never pretend to have 30 days of data when we have 1.
 */

import { withRateLimit } from "../rate-limit";
import { cacheReadThrough, TTL } from "../cache";
import type { RawTrendRow, TrendProvider } from "./trends-provider";

const RSS_BASE = "https://trends.google.com/trending/rss";

function buildUrl(geo: string, hl: string): string {
  const params = new URLSearchParams({ geo, hl });
  return `${RSS_BASE}?${params.toString()}`;
}

export const googleTrendsProvider: TrendProvider = {
  name: "google_trends_rss",

  async available(): Promise<boolean> {
    try {
      const res = await fetch(buildUrl("US", "en-US"), {
        method: "GET",
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": "PRTrendScout/1.0 (+trend-scout@plunder-riffle)" },
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async fetchRaw(country: string, language: string): Promise<RawTrendRow[]> {
    const hl = hlFor(country, language);
    const url = buildUrl(country, hl);
    const cacheKey = `gtrss:${country}:${hl}`;
    return cacheReadThrough(cacheKey, TTL.TRENDS_RSS, async () => {
      const res = await withRateLimit("gtrss", 2, async () => {
        const r = await fetch(url, {
          headers: { "User-Agent": "PRTrendScout/1.0 (+trend-scout@plunder-riffle)" },
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) throw new Error(`gtrss ${country} -> HTTP ${r.status}`);
        return r.text();
      });
      if (!res.ok) {
        throw new Error(`Google Trends RSS fetch failed after retries: ${res.error}`);
      }
      return parseRss(res.value);
    });
  },
};

function hlFor(country: string, language: string): string {
  // Google Trends RSS expects hl in the form "en-US" (language-COUNTRY)
  // Some countries speak multiple languages; we map common cases.
  const map: Record<string, string> = {
    "US-en": "en-US",
    "US-es": "es-US",
    "GB-en": "en-GB",
    "BR-pt": "pt-BR",
    "IN-en": "en-IN",
    "IN-hi": "hi-IN",
    "DE-de": "de-DE",
    "JP-ja": "ja-JP",
    "MX-es": "es-MX",
    "ES-es": "es-ES",
    "FR-fr": "fr-FR",
    "CA-en": "en-CA",
    "CA-fr": "fr-CA",
    "AU-en": "en-AU",
    "AE-ar": "ar-AE",
    "NG-en": "en-NG",
    "ZA-en": "en-ZA",
    "ID-id": "id-ID",
    "PH-en": "en-PH",
    "KR-ko": "ko-KR",
    "IT-it": "it-IT",
    "TR-tr": "tr-TR",
    "AR-es": "es-AR",
  };
  return map[`${country}-${language}`] ?? `${language}-${country}`;
}

// --- minimal RSS / XML parser ---
// We don't pull in a full XML parser dependency — the Google Trends RSS
// is well-structured and we only need a handful of fields. We tokenize
// per-item and extract what we need.

export function parseRss(xml: string): RawTrendRow[] {
  const items: RawTrendRow[] = [];
  const itemBlocks = splitItems(xml);
  for (const block of itemBlocks) {
    const title = extractTag(block, "title");
    if (!title) continue;
    const approxTraffic = extractTagNS(block, "ht:approx_traffic") ?? extractTag(block, "ht:approx_traffic");
    const pubDate = extractTag(block, "pubDate");
    const picture = extractTagNS(block, "ht:picture") ?? extractTag(block, "ht:picture");
    const pictureSource = extractTagNS(block, "ht:picture_source") ?? extractTag(block, "ht:picture_source");
    const newsItems = extractNewsItems(block);
    const relatedQueries = extractRelatedQueries(block, title, newsItems);

    items.push({
      title: decodeEntities(title),
      approxTraffic: approxTraffic ? decodeEntities(approxTraffic) : undefined,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      thumbnailUrl: picture ? decodeEntities(picture) : undefined,
      thumbnailSource: pictureSource ? decodeEntities(pictureSource) : undefined,
      newsItems,
      relatedQueries,
      source: "google_trends_rss",
      estimated: false,
    });
  }
  return items;
}

function splitItems(xml: string): string[] {
  const out: string[] = [];
  const re = /<item\b[^>]*>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1]);
  }
  return out;
}

function extractTag(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = re.exec(xml);
  return m ? m[1].trim() : undefined;
}

function extractTagNS(xml: string, tag: string): string | undefined {
  // handles namespaced tags like <ht:approx_traffic>
  const t = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)<\\/${t}>`, "i");
  const m = re.exec(xml);
  return m ? m[1].trim() : undefined;
}

function extractNewsItems(block: string): RawTrendRow["newsItems"] {
  const out: { title: string; url: string; source: string; picture?: string }[] = [];
  const re = /<ht:news_item\b[^>]*>([\s\S]*?)<\/ht:news_item>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const inner = m[1];
    const t = extractTagNS(inner, "ht:news_item_title");
    const u = extractTagNS(inner, "ht:news_item_url");
    const s = extractTagNS(inner, "ht:news_item_source");
    const p = extractTagNS(inner, "ht:news_item_picture");
    if (t && u && s) {
      out.push({
        title: decodeEntities(t),
        url: decodeEntities(u),
        source: decodeEntities(s),
        picture: p ? decodeEntities(p) : undefined,
      });
    }
  }
  return out;
}

function extractRelatedQueries(block: string, title: string, news: { title: string }[] = []): string[] {
  // The Google Trends RSS does not expose related queries directly.
  // We approximate related queries from news titles — extract proper nouns
  // + bigrams that aren't already the trend title.
  const set = new Set<string>();
  for (const n of news) {
    const words = n.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    for (const w of words.slice(0, 2)) {
      if (!title.toLowerCase().includes(w)) set.add(w);
    }
  }
  return Array.from(set).slice(0, 6);
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
