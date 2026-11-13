import { NextRequest, NextResponse } from "next/server";
import {
  stepScout,
  stepScore,
  stepVerify,
  stepCreate,
  stepRequestMp4,
  stepHandOff,
  shouldDropTrend,
  type PipelineFormat,
  type ScoredTrend,
  type Agent37Trend,
} from "@/lib/bridge/trend-pipeline";
import {
  pnrInitialize,
  pnrResearchBrand,
  getPnrConfig,
} from "@/lib/bridge/pnr";
import { isAgent37Configured, agent37Mode } from "@/lib/bridge/agent37";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Allow long-running calls: P&R MP4 jobs can take a while
export const maxDuration = 300;

interface BridgeRequestBody {
  action:
    | "status"
    | "scout"
    | "score"
    | "verify"
    | "create"
    | "request_mp4"
    | "handoff"
    | "research_brand";
  // scout
  niche?: string;
  region?: string;
  limit?: number;
  // score / verify / create / request_mp4 / handoff
  trend?: Agent37Trend;
  format?: PipelineFormat;
  brand?: string;
  brandUrl?: string;
  // create
  brandProfile?: unknown;
  // request_mp4
  pageUrl?: string;
  caption?: string;
  // handoff
  mp4Url?: string;
  platforms?: string[];
  approvedBy?: string;
}

export async function POST(req: NextRequest) {
  let body: BridgeRequestBody;
  try {
    body = (await req.json()) as BridgeRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  switch (body.action) {
    case "status":
      return NextResponse.json({
        pnr: getPnrConfig(),
        agent37: {
          configured: isAgent37Configured(),
          mode: agent37Mode(),
        },
      });

    case "scout": {
      if (!body.niche) return NextResponse.json({ error: "Missing niche" }, { status: 400 });
      const r = await stepScout({
        niche: body.niche,
        region: body.region,
        limit: body.limit ?? 5,
      });
      return NextResponse.json(r);
    }

    case "score": {
      if (!body.trend) return NextResponse.json({ error: "Missing trend" }, { status: 400 });
      const scored = stepScore(body.trend);
      const dropped = shouldDropTrend(scored);
      return NextResponse.json({ scored, dropped, dropReason: scored.dropReason });
    }

    case "verify": {
      if (!body.trend) return NextResponse.json({ error: "Missing trend" }, { status: 400 });
      const cfg = getPnrConfig();
      if (!cfg.configured) {
        return NextResponse.json({
          ok: false,
          warning: "PNR_MCP_KEY not configured. Set it server-side (process.env.PNR_MCP_KEY).",
        });
      }
      const init = await pnrInitialize();
      if (!init.ok) {
        return NextResponse.json({ ok: false, warning: init.error });
      }
      const r = await stepVerify(body.trend, init.value);
      return NextResponse.json({ ...r, sessionId: init.value });
    }

    case "create": {
      if (!body.trend) return NextResponse.json({ error: "Missing trend" }, { status: 400 });
      if (!body.format) return NextResponse.json({ error: "Missing format (hottake|carousel|hybrid|image)" }, { status: 400 });
      const cfg = getPnrConfig();
      if (!cfg.configured) {
        return NextResponse.json({
          ok: false,
          warning: "PNR_MCP_KEY not configured.",
        });
      }
      const init = await pnrInitialize();
      if (!init.ok) {
        return NextResponse.json({ ok: false, warning: init.error });
      }
      const r = await stepCreate(body.trend, body.format, body.brandProfile, init.value);
      return NextResponse.json({ ...r, sessionId: init.value });
    }

    case "request_mp4": {
      if (!body.pageUrl) return NextResponse.json({ error: "Missing pageUrl" }, { status: 400 });
      const cfg = getPnrConfig();
      if (!cfg.configured) {
        return NextResponse.json({
          ok: false,
          warning: "PNR_MCP_KEY not configured.",
        });
      }
      const init = await pnrInitialize();
      if (!init.ok) {
        return NextResponse.json({ ok: false, warning: init.error });
      }
      const r = await stepRequestMp4(body.pageUrl, body.caption, init.value);
      return NextResponse.json({ ...r, sessionId: init.value });
    }

    case "handoff": {
      if (!body.trend) return NextResponse.json({ error: "Missing trend" }, { status: 400 });
      if (!body.pageUrl) return NextResponse.json({ error: "Missing pageUrl" }, { status: 400 });
      if (!body.approvedBy) return NextResponse.json({ error: "Missing approvedBy" }, { status: 400 });
      const r = await stepHandOff({
        trend: body.trend,
        pageUrl: body.pageUrl,
        mp4Url: body.mp4Url,
        caption: body.caption,
        platforms: body.platforms,
        approvedBy: body.approvedBy,
      });
      return NextResponse.json(r);
    }

    case "research_brand": {
      if (!body.brand) return NextResponse.json({ error: "Missing brand" }, { status: 400 });
      const cfg = getPnrConfig();
      if (!cfg.configured) {
        return NextResponse.json({
          ok: false,
          warning: "PNR_MCP_KEY not configured.",
        });
      }
      const init = await pnrInitialize();
      if (!init.ok) {
        return NextResponse.json({ ok: false, warning: init.error });
      }
      const r = await pnrResearchBrand({ brand: body.brand, url: body.brandUrl }, init.value);
      return NextResponse.json(r);
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
  }
}
