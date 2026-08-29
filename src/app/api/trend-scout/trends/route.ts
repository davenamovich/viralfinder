import { NextRequest, NextResponse } from "next/server";
import { fetchTrends, refreshTrendsCache } from "@/lib/trend-scout/orchestrator";
import type { ContentType, Niche, TimeWindow } from "@/lib/trend-scout/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_NICHE: (Niche | "All")[] = [
  "All",
  "Business",
  "AI",
  "Small Business",
  "Motivation",
  "Crypto",
  "Creator Economy",
  "E-commerce",
  "Real Estate",
  "Fitness",
  "Local News",
  "Other",
];

const VALID_WINDOW: TimeWindow[] = ["now", "24h", "7d", "30d"];
const VALID_CT: ContentType[] = ["Clip", "Slideshow", "Hot Take", "Story", "Meme Video", "Song"];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const country = sp.get("country") ?? "US";
  const language = sp.get("language") ?? "en";
  const nicheRaw = sp.get("niche") ?? "All";
  const windowRaw = sp.get("timeWindow") ?? "24h";
  const ctRaw = sp.get("contentType") ?? "Clip";
  const refresh = sp.get("refresh") === "1";

  const niche = (VALID_NICHE as string[]).includes(nicheRaw) ? (nicheRaw as Niche | "All") : "All";
  const timeWindow = VALID_WINDOW.includes(windowRaw as TimeWindow) ? (windowRaw as TimeWindow) : "24h";
  const contentType = VALID_CT.includes(ctRaw as ContentType) ? (ctRaw as ContentType) : "Clip";

  if (refresh) refreshTrendsCache();

  try {
    const result = await fetchTrends({ country, language, niche, timeWindow, contentType });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[trend-scout] /trends error", err);
    return NextResponse.json(
      {
        trends: [],
        usedProvider: "error",
        usedFallback: false,
        rawCount: 0,
        filteredByNiche: 0,
        windowDaysLabel: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
