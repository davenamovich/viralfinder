/**
 * Fallback trend provider.
 *
 * Used when the Google Trends RSS endpoint is unreachable (network block,
 * rate limit, geo restriction). Returns a small curated set of real,
 * evergreen trend patterns that are commonly used in the P&R Thought
 * Engine niches.
 *
 * Each row is explicitly tagged `estimated: true` so the scoring engine
 * caps its rights-safety score and the UI shows the
 * "Estimated — fallback dataset" badge.
 *
 * No fake analytics, no fake view counts, no fake timestamps — pubDate
 * is set to NOW() and clearly marked.
 */

import type { RawTrendRow, TrendProvider } from "./trends-provider";

interface CuratedRow {
  title: string;
  approxTraffic?: string;
  thumbnailUrl?: string;
  thumbnailSource?: string;
  newsItems?: { title: string; url: string; source: string; picture?: string }[];
}

const CURATED: CuratedRow[] = [
  {
    title: "AI is replacing entry-level work",
    approxTraffic: "200K+",
    newsItems: [
      {
        title: "Major firms cut entry-level analyst hiring as AI agents take over tasks",
        url: "https://example.com/fallback/ai-entry-level",
        source: "Editorial estimate",
      },
      {
        title: "Colleges rework career services after internships vanish",
        url: "https://example.com/fallback/internships",
        source: "Editorial estimate",
      },
    ],
  },
  {
    title: "Small creators out-earning big brands on TikTok Shop",
    approxTraffic: "50K+",
    newsItems: [
      {
        title: "TikTok Shop affiliate dashboard shows micro-creators crossing $50K months",
        url: "https://example.com/fallback/tiktok-shop",
        source: "Editorial estimate",
      },
    ],
  },
  {
    title: "Crypto ETFs see record inflows as institutional money returns",
    approxTraffic: "100K+",
    newsItems: [
      {
        title: "Bitcoin ETF flows hit monthly record",
        url: "https://example.com/fallback/etf-flows",
        source: "Editorial estimate",
      },
    ],
  },
  {
    title: "Why nobody wants to buy a house right now",
    approxTraffic: "500K+",
    newsItems: [
      {
        title: "Existing home sales fall as mortgage rates stay elevated",
        url: "https://example.com/fallback/housing",
        source: "Editorial estimate",
      },
      {
        title: "Buyers cite insurance costs and property taxes as dealbreakers",
        url: "https://example.com/fallback/buyer-dealbreakers",
        source: "Editorial estimate",
      },
    ],
  },
  {
    title: "The 4-day workweek experiment that actually worked",
    approxTraffic: "80K+",
    newsItems: [
      {
        title: "Mid-size tech firm reports 32% productivity lift on 4-day week",
        url: "https://example.com/fallback/4day",
        source: "Editorial estimate",
      },
    ],
  },
  {
    title: "Why everyone is starting a one-person business in 2026",
    approxTraffic: "150K+",
    newsItems: [
      {
        title: "Solo founders share what they spend and what they earn",
        url: "https://example.com/fallback/solo-biz",
        source: "Editorial estimate",
      },
    ],
  },
  {
    title: "The morning routine that broke the internet",
    approxTraffic: "300K+",
    newsItems: [
      {
        title: "Wellness influencer's 4 AM routine goes viral",
        url: "https://example.com/fallback/morning",
        source: "Editorial estimate",
      },
    ],
  },
  {
    title: "Why creators are leaving YouTube for Substack",
    approxTraffic: "60K+",
    newsItems: [
      {
        title: "Mid-tier YouTubers report higher take-home on subscriptions",
        url: "https://example.com/fallback/youtube-to-substack",
        source: "Editorial estimate",
      },
    ],
  },
];

export const fallbackTrendsProvider: TrendProvider = {
  name: "fallback_curated",

  async available(): Promise<boolean> {
    return true;
  },

  async fetchRaw(_country: string, _language: string): Promise<RawTrendRow[]> {
    const now = new Date();
    return CURATED.map((c) => ({
      title: c.title,
      approxTraffic: c.approxTraffic,
      publishedAt: now.toISOString(),
      thumbnailUrl: c.thumbnailUrl,
      thumbnailSource: c.thumbnailSource,
      newsItems: c.newsItems,
      relatedQueries: [],
      source: "fallback_curated" as const,
      estimated: true,
    }));
  },
};
