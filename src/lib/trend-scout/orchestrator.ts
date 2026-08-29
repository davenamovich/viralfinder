/**
 * Trend orchestrator — turns raw trend rows into P&R TrendOpportunity
 * objects by running the niche classifier, the scoring engine, the hook
 * generator, and the angle generator.
 *
 * This is the layer the API routes call. It handles provider selection
 * (try Google Trends RSS → fall back to curated), window filtering
 * (now / 24h / 7d / 30d using snapshot history), and niche filtering.
 */

import { googleTrendsProvider } from "./providers/google-trends-provider";
import { fallbackTrendsProvider } from "./providers/fallback-provider";
import type { RawTrendRow, TrendProvider } from "./providers/trends-provider";
import { classifyNiche } from "./classifier";
import {
  computeTrendScore,
  inferDirection,
  inferEmotion,
} from "./scoring";
import type {
  ContentType,
  ContentAngle,
  Direction,
  Niche,
  TrendFilters,
  TrendOpportunity,
  Emotion,
  TimeWindow,
} from "./types";
import { countryLabel, languageLabel } from "./types";
import { cacheReadThrough, TTL, cacheInvalidatePrefix } from "./cache";

const PROVIDERS: TrendProvider[] = [googleTrendsProvider, fallbackTrendsProvider];

export interface FetchTrendsResult {
  trends: TrendOpportunity[];
  usedProvider: string;
  usedFallback: boolean;
  rawCount: number;
  filteredByNiche: number;
  windowDaysLabel: string;
}

export async function fetchTrends(filters: TrendFilters): Promise<FetchTrendsResult> {
  const cacheKey = `orch:${filters.country}:${filters.language}:${filters.niche}:${filters.timeWindow}`;
  return cacheReadThrough(cacheKey, 60 * 1000, async () => {
    const { rows, usedProvider, usedFallback } = await loadRaw(filters.country, filters.language);
    const filteredByTime = applyTimeWindow(rows, filters.timeWindow);
    const opportunities = filteredByTime
      .map((row) => rowToOpportunity(row, filters))
      .filter((o): o is TrendOpportunity => o !== null);

    const allCount = opportunities.length;
    const byNiche = opportunities.filter(
      (o) => filters.niche === "All" || o.niche === filters.niche,
    );
    // sort by score desc, then recency
    byNiche.sort((a, b) => b.score.total - a.score.total || +new Date(b.publishedAt) - +new Date(a.publishedAt));

    return {
      trends: byNiche.slice(0, 30),
      usedProvider,
      usedFallback,
      rawCount: rows.length,
      filteredByNiche: allCount - byNiche.length,
      windowDaysLabel: windowLabel(filters.timeWindow),
    };
  });
}

export function refreshTrendsCache(): void {
  cacheInvalidatePrefix("orch:");
  cacheInvalidatePrefix("gtrss:");
}

async function loadRaw(country: string, language: string): Promise<{
  rows: RawTrendRow[];
  usedProvider: string;
  usedFallback: boolean;
}> {
  for (let i = 0; i < PROVIDERS.length; i++) {
    const p = PROVIDERS[i];
    try {
      const available = await p.available();
      if (!available) continue;
      const rows = await p.fetchRaw(country, language);
      if (rows.length > 0) {
        return { rows, usedProvider: p.name, usedFallback: p.name === "fallback_curated" };
      }
    } catch (err) {
      console.warn(`[trend-scout] provider ${p.name} failed:`, err);
    }
  }
  // last resort: explicit fallback (always available)
  const rows = await fallbackTrendsProvider.fetchRaw(country, language);
  return { rows, usedProvider: fallbackTrendsProvider.name, usedFallback: true };
}

function applyTimeWindow(rows: RawTrendRow[], window: TimeWindow): RawTrendRow[] {
  if (window === "now") {
    return rows.filter((r) => Date.now() - new Date(r.publishedAt).getTime() < 2 * 3600 * 1000);
  }
  if (window === "24h") {
    return rows.filter((r) => Date.now() - new Date(r.publishedAt).getTime() < 24 * 3600 * 1000);
  }
  if (window === "7d") {
    return rows.filter((r) => Date.now() - new Date(r.publishedAt).getTime() < 7 * 24 * 3600 * 1000);
  }
  // 30d — Google Trends RSS only gives today; we return everything but label honestly
  return rows;
}

function windowLabel(window: TimeWindow): string {
  switch (window) {
    case "now":
      return "Live — last 2 hours";
    case "24h":
      return "Last 24 hours";
    case "7d":
      return "Last 7 days (may include older — provider limited to today's snapshot)";
    case "30d":
      return "Last 30 days (provider limited to today's snapshot — history builds over time)";
  }
}

function rowToOpportunity(row: RawTrendRow, filters: TrendFilters): TrendOpportunity | null {
  const classification = classifyNiche(
    row.title,
    row.newsItems?.map((n) => n.title) ?? [],
  );
  const emotion: Emotion = inferEmotion(row.title, row.newsItems);
  const direction: Direction = inferDirection(row.approxTraffic, row.relatedQueries);

  // The user's selected content type influences the suggested format hint,
  // but the trend itself can override (e.g. viral meme → Meme Video)
  const suggestedFormat: ContentType = pickSuggestedFormat(emotion, filters.contentType, classification.niche);

  const score = computeTrendScore({
    title: row.title,
    direction,
    approxTraffic: row.approxTraffic,
    publishedAt: row.publishedAt,
    relatedQueries: row.relatedQueries ?? [],
    newsItems: row.newsItems,
    estimated: row.estimated,
    windowDays: 1,
    emotion,
    niche: classification.niche,
  });

  const angles = generateAngles(row, emotion, classification.niche, suggestedFormat);
  const hook = generateHook(row, emotion);
  const stopScroll = generateStopScrolling(row, emotion, classification.niche);

  return {
    id: `${filters.country}:${slugify(row.title)}`,
    title: row.title,
    direction,
    country: filters.country,
    countryLabel: countryLabel(filters.country),
    language: filters.language,
    languageLabel: languageLabel(filters.language),
    niche: classification.niche,
    publishedAt: row.publishedAt,
    approxTraffic: row.approxTraffic,
    whyItMattersNow: whyItMatters(row, classification.niche, emotion),
    audienceEmotion: emotion,
    stopScrollingHook: stopScroll,
    suggestedFormat,
    firstHook: hook,
    angles,
    relatedQueries: row.relatedQueries ?? [],
    searchTerms: buildSearchTerms(row),
    score,
    rightsSafetyScore: rightsSafetyScore(row.estimated, row.newsItems ?? []),
    dataSource: row.source,
    dataLabel: row.estimated
      ? "Estimated — fallback dataset (Google Trends unavailable)"
      : "Live — Google Trends RSS",
    thumbnailUrl: row.thumbnailUrl,
    thumbnailSource: row.thumbnailSource,
    newsItems: row.newsItems,
    estimated: row.estimated,
  };
}

function rightsSafetyScore(estimated: boolean, news: { source: string }[]): number {
  // Estimated sources start lower because rights aren't guaranteed.
  // Heavy major-outlet coverage implies licensed source material, harder to reuse.
  if (estimated) return 35;
  if (news.length >= 4) return 55;
  if (news.length >= 2) return 65;
  return 75;
}

function pickSuggestedFormat(emotion: Emotion, userPick: ContentType, niche: Niche): ContentType {
  // Meme-y emotion or humor → Meme Video
  if (emotion === "humor") return "Meme Video";
  // Outrage + identity → Hot Take
  if (emotion === "outrage" || emotion === "identity") return "Hot Take";
  // Aspiration + motivation niche → Story
  if (emotion === "aspiration" || niche === "Motivation") return "Story";
  // Default to user's pick
  return userPick;
}

function generateAngles(
  row: RawTrendRow,
  emotion: Emotion,
  niche: Niche,
  format: ContentType,
): ContentAngle[] {
  const title = row.title;
  const angles: ContentAngle[] = [];

  // Angle 1: contrarian
  angles.push({
    title: `The opposite take: "${title}" is actually a good thing`,
    oneLiner: contrarianOneLiner(title, emotion),
    format,
  });

  // Angle 2: useful / how-to
  angles.push({
    title: `What "${title}" means for you (and what to do this week)`,
    oneLiner: usefulOneLiner(title, niche),
    format: format === "Meme Video" ? "Clip" : format,
  });

  // Angle 3: human story / POV
  angles.push({
    title: `The one person this "${title}" story is really about`,
    oneLiner: humanOneLiner(title, emotion),
    format: format === "Hot Take" ? "Story" : format,
  });

  return angles;
}

function contrarianOneLiner(title: string, emotion: Emotion): string {
  switch (emotion) {
    case "outrage":
      return `The thing everyone is mad about — and why they might be wrong.`;
    case "fear":
      return `The scary headline nobody is reading carefully enough.`;
    case "aspiration":
      return `The "success" story that hides what actually went wrong.`;
    case "urgency":
      return `The deadline everyone is panicking about — but missed the real point.`;
    case "identity":
      return `The "us vs them" story that quietly hurts both sides.`;
    case "humor":
      return `The joke everyone is sharing — and the truth inside it.`;
    case "curiosity":
      return `The question everyone is asking — and the answer nobody is giving.`;
  }
}

function usefulOneLiner(_title: string, niche: Niche): string {
  switch (niche) {
    case "AI":
      return `Three ways to use this before your competitors do — and one way to NOT use it.`;
    case "Crypto":
      return `What this means for your bag, your time horizon, and your risk.`;
    case "Business":
      return `The market signal hiding in the headline — and the play to make this week.`;
    case "Small Business":
      return `How a small business can use this in the next 7 days.`;
    case "Creator Economy":
      return `The format that will travel on this trend — and the one that won't.`;
    case "E-commerce":
      return `The product angle and the price point this trend opens up.`;
    case "Real Estate":
      return `What this means for buyers, sellers, and renters in the next 90 days.`;
    case "Fitness":
      return `The protocol that actually works — and what to skip.`;
    case "Motivation":
      return `The discipline move this trend is actually teaching you.`;
    case "Local News":
      return `What this means for your block this week.`;
    case "Other":
    default:
      return `The takeaway you can use today.`;
  }
}

function humanOneLiner(title: string, _emotion: Emotion): string {
  return `Behind "${title}" is one person whose story changes how you'll see it.`;
}

function generateHook(row: RawTrendRow, emotion: Emotion): string {
  const t = row.title;
  switch (emotion) {
    case "outrage":
      return `Pause before you scroll — what they're actually doing with "${t}".`;
    case "fear":
      return `If you saw "${t}" and felt your stomach drop, here's what's really happening.`;
    case "aspiration":
      return `Everyone wants the result behind "${t}" — almost no one sees what it actually costs.`;
    case "urgency":
      return `"${t}" — and why the next 72 hours actually matter.`;
    case "identity":
      return `If you've ever felt on the wrong side of "${t}", this is for you.`;
    case "humor":
      return `"${t}" broke the internet today — here's the part no one is pointing out.`;
    case "curiosity":
      return `You're going to see "${t}" everywhere today. Here's what they're not telling you.`;
  }
}

function generateStopScrolling(row: RawTrendRow, emotion: Emotion, _niche: Niche): string {
  return `You'll see "${row.title}" in 3 places today — here's the version worth 30 seconds of your scroll.`;
}

function whyItMatters(row: RawTrendRow, _niche: Niche, emotion: Emotion): string {
  const traffic = row.approxTraffic ? ` (${row.approxTraffic} searches)` : "";
  const news = row.newsItems?.length ?? 0;
  const newsClause = news > 0
    ? ` ${news} major ${news === 1 ? "outlet is" : "outlets are"} already on it`
    : " no major outlet has framed it yet";
  return `Trending right now in ${row.title}${traffic}.${newsClause}. Emotion in the room: ${emotion}. The window for an original angle is short — usually 24 to 72 hours before the conversation gets crowded.`;
}

function buildSearchTerms(row: RawTrendRow): string[] {
  const terms = new Set<string>();
  terms.add(row.title);
  for (const q of row.relatedQueries ?? []) terms.add(q);
  // first 2 news titles as additional context terms
  for (const n of row.newsItems?.slice(0, 2) ?? []) {
    const first = n.title.split(/[:—–-]/)[0].trim();
    if (first) terms.add(first);
  }
  return Array.from(terms).slice(0, 6);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}
