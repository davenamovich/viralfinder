import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchTrends } from "@/lib/trend-scout/orchestrator";
import { recommendInternational } from "@/lib/trend-scout/international";
import type {
  Niche,
  RadarData,
  SavedTrendRow,
  TrendOpportunity,
  UsedTrendRow,
} from "@/lib/trend-scout/types";
import { NICHE_VALUES, languageLabel } from "@/lib/trend-scout/types";
import { cacheReadThrough, TTL } from "@/lib/trend-scout/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  try {
    const result = await cacheReadThrough("radar:global", TTL.RADAR, buildRadar);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[trend-scout] /radar error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Radar build failed" },
      { status: 500 },
    );
  }
}

async function buildRadar(): Promise<RadarData> {
  // Fetch real trends for the top 6 markets (in parallel)
  const markets = [
    { country: "US", language: "en" },
    { country: "BR", language: "pt" },
    { country: "IN", language: "en" },
    { country: "DE", language: "de" },
    { country: "GB", language: "en" },
    { country: "MX", language: "es" },
  ];

  const byMarket = await Promise.all(
    markets.map((m) =>
      fetchTrends({
        country: m.country,
        language: m.language,
        niche: "All",
        timeWindow: "24h",
        contentType: "Clip",
      }),
    ),
  );

  const allTrends: TrendOpportunity[] = [];
  const sourceMix = new Map<string, number>();
  for (const r of byMarket) {
    allTrends.push(...r.trends);
    sourceMix.set(r.usedProvider, (sourceMix.get(r.usedProvider) ?? 0) + 1);
  }

  // dedupe by title (trends can show up in multiple markets)
  const seen = new Set<string>();
  const unique: TrendOpportunity[] = [];
  for (const t of allTrends) {
    if (seen.has(t.title)) continue;
    seen.add(t.title);
    unique.push(t);
  }
  unique.sort((a, b) => b.score.total - a.score.total);

  // top 10
  const top10 = unique.slice(0, 10);

  // best by niche — for each niche, find the highest-scoring trend
  const bestByNiche = NICHE_VALUES.map((niche) => {
    const t = unique.find((u) => u.niche === niche);
    return t ? { niche, trend: t } : null;
  }).filter((x): x is { niche: Niche; trend: TrendOpportunity } => x !== null);

  // best by language — for each language code in our markets, highest-scoring
  const langs = new Set(markets.map((m) => m.language));
  const bestByLanguage = Array.from(langs).map((lang) => {
    const t = unique.find((u) => u.language === lang);
    return t ? { language: lang, trend: t } : null;
  }).filter((x): x is { language: string; trend: TrendOpportunity } => x !== null);

  // highest international potential = trend with the most suggested languages from brief + highest score
  // We approximate without the LLM by scoring on the international factor in the score breakdown
  const highestIntl = unique
    .map((t) => {
      const intlFactor = t.score.factors.find((f) => f.factor === "International translation potential");
      return { t, intl: intlFactor?.score ?? 0 };
    })
    .sort((a, b) => b.intl - a.intl || b.t.score.total - a.t.score.total)[0]?.t ?? null;

  // real user actions from DB
  const [savedRows, usedRows] = await Promise.all([
    db.savedTrend.findMany({ orderBy: { savedAt: "desc" }, take: 50 }),
    db.usedTrend.findMany({ orderBy: { usedAt: "desc" }, take: 50 }),
  ]);

  const trendsSavedForLater: SavedTrendRow[] = savedRows.map((r) => ({
    id: r.id,
    trendId: r.trendId,
    trendTitle: r.trendTitle,
    niche: r.niche ?? undefined,
    country: r.country ?? undefined,
    language: r.language ?? undefined,
    savedAt: r.savedAt.toISOString(),
  }));

  const trendsConvertedToVideos: UsedTrendRow[] = usedRows.map((r) => ({
    id: r.id,
    trendId: r.trendId,
    trendTitle: r.trendTitle,
    action: r.action,
    format: r.format ?? undefined,
    targetLanguages: r.targetLanguages ?? undefined,
    sourceUrl: r.sourceUrl ?? undefined,
    briefSummary: r.briefSummary ?? undefined,
    usedAt: r.usedAt.toISOString(),
  }));

  // conversion rate — saved vs converted, from REAL user actions
  const savedCount = savedRows.length;
  // distinct trends converted (a trend may be converted multiple times — count unique)
  const convertedIds = new Set(usedRows.map((r) => r.trendId));
  const convertedCount = convertedIds.size;
  const conversionRate = savedCount === 0 ? 0 : Math.round((convertedCount / savedCount) * 100);
  const conversionRateLabel = savedCount === 0
    ? "No saves yet — conversion rate will appear once you start saving trends."
    : `${convertedCount} of ${savedCount} saved trends were sent into the P&R pipeline (${conversionRate}%).`;

  return {
    generatedAt: new Date().toISOString(),
    topOpportunities: top10,
    bestByNiche,
    bestByLanguage,
    highestInternationalPotential: highestIntl,
    trendsSavedForLater,
    trendsConvertedToVideos,
    conversionRate,
    conversionRateLabel,
    dataSourceMix: Array.from(sourceMix.entries()).map(([source, count]) => ({ source, count })),
    windowDays: 1,
    windowDaysLabel: "Live — Google Trends RSS for today (history builds over time as snapshots accumulate).",
  };
}

void languageLabel; // for future label localization
