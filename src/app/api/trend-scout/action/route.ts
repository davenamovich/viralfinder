import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  routeCreateOriginal,
  routeCreatePreview,
  routeSendToClip,
  routeRebuildForWorld,
} from "@/lib/trend-scout/pr-integration";
import type {
  ContentBrief,
  ContentType,
  InternationalAdaptation,
  PRRoutingPayload,
  TrendOpportunity,
} from "@/lib/trend-scout/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ActionBody {
  action: "save" | "unsave" | "create_original" | "send_to_clip" | "rebuild_for_world" | "create_preview";
  trend: TrendOpportunity;
  sourceUrl?: string;
  targetLanguages?: string[];
  format?: ContentType;
  brief?: ContentBrief;
  adaptations?: InternationalAdaptation[];
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ActionBody;
    if (!body?.action || !body?.trend?.id) {
      return NextResponse.json({ error: "Missing action or trend" }, { status: 400 });
    }
    const t = body.trend;

    switch (body.action) {
      case "save": {
        // upsert — only if not already saved
        const existing = await db.savedTrend.findUnique({ where: { trendId: t.id } });
        if (existing) {
          return NextResponse.json({ ok: true, message: "Already saved", action: "save" });
        }
        await db.savedTrend.create({
          data: {
            trendId: t.id,
            trendTitle: t.title,
            niche: t.niche,
            country: t.country,
            language: t.language,
          },
        });
        return NextResponse.json({ ok: true, message: "Saved for later", action: "save" });
      }

      case "unsave": {
        await db.savedTrend.deleteMany({ where: { trendId: t.id } });
        return NextResponse.json({ ok: true, message: "Removed from saved", action: "unsave" });
      }

      case "create_original": {
        if (!body.brief) return NextResponse.json({ error: "Missing brief" }, { status: 400 });
        const payload = routeCreateOriginal(t, body.brief);
        await persistUsed(t, payload, body);
        return NextResponse.json({ ok: true, action: "create_original", payload });
      }

      case "send_to_clip": {
        if (!body.sourceUrl) return NextResponse.json({ error: "Missing sourceUrl" }, { status: 400 });
        const payload = routeSendToClip(t, body.sourceUrl);
        await persistUsed(t, payload, body);
        return NextResponse.json({ ok: true, action: "send_to_clip", payload });
      }

      case "rebuild_for_world": {
        if (!body.sourceUrl) return NextResponse.json({ error: "Missing sourceUrl" }, { status: 400 });
        if (!body.targetLanguages || body.targetLanguages.length === 0)
          return NextResponse.json({ error: "Missing targetLanguages" }, { status: 400 });
        if (!body.brief) return NextResponse.json({ error: "Missing brief" }, { status: 400 });
        const format = body.format ?? body.brief.bestFormat;
        const payload = routeRebuildForWorld(t, body.sourceUrl, body.targetLanguages, format, body.brief);
        await persistUsed(t, payload, body);
        return NextResponse.json({ ok: true, action: "rebuild_for_world", payload });
      }

      case "create_preview": {
        if (!body.brief) return NextResponse.json({ error: "Missing brief" }, { status: 400 });
        const payload = routeCreatePreview(t, body.brief);
        await persistUsed(t, payload, body);
        return NextResponse.json({ ok: true, action: "create_preview", payload });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
    }
  } catch (err) {
    console.error("[trend-scout] /action error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Action failed" },
      { status: 500 },
    );
  }
}

async function persistUsed(t: TrendOpportunity, payload: PRRoutingPayload, body: ActionBody): Promise<void> {
  await db.usedTrend.create({
    data: {
      trendId: t.id,
      trendTitle: t.title,
      action: payload.kind,
      format: payload.format ?? body.format ?? null,
      targetLanguages: payload.targetLanguages?.join(", ") ?? null,
      sourceUrl: payload.sourceUrl ?? body.sourceUrl ?? null,
      briefSummary: body.brief ? body.brief.contrarianOrUsefulAngle : null,
    },
  });
}
