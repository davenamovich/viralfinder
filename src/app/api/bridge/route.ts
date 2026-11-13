import { NextRequest, NextResponse } from "next/server";
import {
  stepScout,
  stepScore,
  stepVerify,
  stepCreate,
  stepRequestMp4,
  stepHandOff,
  shouldDropTrend,
  resolveFormat,
  type PipelineFormat,
  type ScoredTrend,
  type Agent37Trend,
} from "@/lib/bridge/trend-pipeline";
import {
  pnrInitialize,
  pnrResearchBrand,
  setPnrKeyOverride,
  getPnrConfig,
} from "@/lib/bridge/pnr";
import { setAgent37KeyOverride, isAgent37Configured, agent37Mode } from "@/lib/bridge/agent37";

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
  // BYOK: client-supplied keys (override server env vars for this request only)
  pnrKey?: string;
  agent37Key?: string;
  // scout
  niche?: string;
  region?: string;
  limit?: number;
  // score / verify / create / request_mp4 / handoff
  trend?: Agent37Trend;
  // UI label (Meme, iMessage, Hybrid, Roast, Hot Take, Carousel) — resolved to MCP format + brief flavor
  uiFormat?: string;
  // MCP format (alternative to uiFormat — passed through directly)
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

  // BYOK keys are now request-scoped — passed directly to pipeline functions.
  // No module-level state is set; each request carries its own key, eliminating
  // race conditions with concurrent requests. The keys come from the request body
  // (body.pnrKey / body.agent37Key) or fall back to server env vars for this request only.
  const pnrKey = body.pnrKey ?? process.env.PNR_MCP_KEY ?? "";
  const agent37Key = body.agent37Key ?? process.env.AGENT37_KEY ?? process.env.AGENT37_API_KEY ?? "";

  switch (body.action) {
    case "status":
      return NextResponse.json({
        pnr: getPnrConfig(pnrKey),
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
        key: pnrKey,
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
      const cfg = getPnrConfig(pnrKey);
      if (!cfg.configured) {
        return NextResponse.json({
          ok: false,
          warning: "P&R MCP key not configured. Paste your key in the Bridge Settings panel (BYOK) or set PNR_MCP_KEY server-side.",
        });
      }
      const init = await pnrInitialize(pnrKey);
      if (!init.ok) {
        return NextResponse.json({ ok: false, warning: init.error });
      }
      const r = await stepVerify(body.trend, init.value, undefined, pnrKey);
      return NextResponse.json({ ...r, sessionId: init.value });
    }

    case "create": {
      if (!body.trend) return NextResponse.json({ error: "Missing trend" }, { status: 400 });
      // Resolve UI format → MCP format + brief flavor
      // Either body.uiFormat (label like "Meme"/"Roast"/"Hot Take") or body.format (canonical MCP)
      let format: PipelineFormat | undefined = body.format;
      let briefFlavor: string | undefined;
      if (body.uiFormat) {
        const r = resolveFormat(body.uiFormat);
        format = r.format;
        briefFlavor = r.brief;
      }
      if (!format) {
        return NextResponse.json({ error: "Missing format (uiFormat or format)" }, { status: 400 });
      }
      const cfg = getPnrConfig(pnrKey);
      if (!cfg.configured) {
        return NextResponse.json({
          ok: false,
          warning: "P&R MCP key not configured. Paste your key in the Bridge Settings panel (BYOK) or set PNR_MCP_KEY server-side.",
        });
      }
      const init = await pnrInitialize(pnrKey);
      if (!init.ok) {
        return NextResponse.json({ ok: false, warning: init.error });
      }
      const r = await stepCreate(body.trend, format, body.brandProfile, init.value, undefined, briefFlavor, pnrKey);
      return NextResponse.json({ ...r, sessionId: init.value });
    }

    case "request_mp4": {
      if (!body.pageUrl) return NextResponse.json({ error: "Missing pageUrl" }, { status: 400 });
      const cfg = getPnrConfig(pnrKey);
      if (!cfg.configured) {
        return NextResponse.json({
          ok: false,
          warning: "P&R MCP key not configured. Paste your key in the Bridge Settings panel (BYOK) or set PNR_MCP_KEY server-side.",
        });
      }
      const init = await pnrInitialize(pnrKey);
      if (!init.ok) {
        return NextResponse.json({ ok: false, warning: init.error });
      }
      const r = await stepRequestMp4(body.pageUrl, body.caption, init.value, undefined, pnrKey);
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
        key: agent37Key,
      });
      return NextResponse.json(r);
    }

    case "research_brand": {
      if (!body.brand) return NextResponse.json({ error: "Missing brand" }, { status: 400 });
      const cfg = getPnrConfig(pnrKey);
      if (!cfg.configured) {
        return NextResponse.json({
          ok: false,
          warning: "P&R MCP key not configured. Paste your key in the Bridge Settings panel (BYOK) or set PNR_MCP_KEY server-side.",
        });
      }
      const init = await pnrInitialize(pnrKey);
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
