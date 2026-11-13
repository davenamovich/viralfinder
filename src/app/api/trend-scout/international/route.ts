import { NextRequest, NextResponse } from "next/server";
import { recommendInternational } from "@/lib/trend-scout/international";
import type { TrendOpportunity } from "@/lib/trend-scout/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { trend: TrendOpportunity };
    if (!body?.trend?.id || !body?.trend?.title) {
      return NextResponse.json({ error: "Missing trend" }, { status: 400 });
    }
    const result = await recommendInternational(body.trend);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "International recommendation failed" },
      { status: 500 },
    );
  }
}
