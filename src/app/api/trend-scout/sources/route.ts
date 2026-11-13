import { NextRequest, NextResponse } from "next/server";
import { findSourceVideos } from "@/lib/trend-scout/providers/youtube-provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const query = sp.get("query") ?? "";
  const language = sp.get("language") ?? undefined;
  const publishedWithinDays = sp.get("days") ? parseInt(sp.get("days") as string, 10) : undefined;
  const related = sp.getAll("related");
  // withTranscripts defaults to true — Trend Scout best-effort fetches VTT
  // transcripts via Agent Reach's yt-dlp and extracts real clip moments.
  // If yt-dlp is unavailable, this flag is a no-op.
  const withTranscripts = sp.get("transcripts") !== "0";

  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }
  try {
    const result = await findSourceVideos({
      query,
      relatedQueries: related,
      language,
      publishedWithinDays,
      withTranscripts,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Source video search failed" },
      { status: 500 },
    );
  }
}
