/**
 * Trend provider interface.
 *
 * This is the modular layer that lets Trend Scout swap or supplement
 * Google Trends with another provider later (e.g. a paid trend API,
 * an internal data warehouse, or a curated editorial feed).
 *
 * Each provider returns raw trend rows. The scoring / classification /
 * brief layers run on top of those rows, so providers don't need to know
 * anything about P&R content strategy.
 */

import type { Niche, TrendOpportunity, TrendFilters } from "../types";

export interface RawTrendRow {
  title: string;
  approxTraffic?: string;
  publishedAt: string; // ISO
  thumbnailUrl?: string;
  thumbnailSource?: string;
  newsItems?: { title: string; url: string; source: string; picture?: string }[];
  relatedQueries?: string[];
  /** Provider-specific source label */
  source: "google_trends_rss" | "fallback_curated" | "trends24_in" | "twitter_agent_reach";
  estimated: boolean;
}

export interface TrendProvider {
  name: string;
  /** Whether this provider is currently available (e.g. RSS endpoint reachable) */
  available: () => Promise<boolean>;
  /** Fetch raw trends for the given country+language. */
  fetchRaw: (country: string, language: string) => Promise<RawTrendRow[]>;
}

export interface TrendFetchResult {
  trends: TrendOpportunity[];
  /** The provider that actually produced the data */
  usedProvider: string;
  /** Whether the fallback source was used */
  usedFallback: boolean;
  /** Number of raw rows that came back (before filtering) */
  rawCount: number;
  /** How many were filtered out by niche */
  filteredByNiche: number;
  /** Window-days label (for honesty in the UI) */
  windowDaysLabel: string;
}

export const DEFAULT_FALLBACK_NICHE: Niche = "Other";
