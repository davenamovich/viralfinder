/**
 * Trend pipeline: scout → score → verify → create → previews.
 *
 * Stops BEFORE publishing, per the spec. The human must explicitly approve
 * a specific preview before request_mp4 + handOff are called.
 *
 * Each step is its own function so the UI can drive them one at a time
 * (and show the human the result of each step).
 *
 * Cost disclosure (per the spec):
 *   - BYOK key: 1 credit ($0.01) per MCP call, first 100/month free
 *   - MP4 is $0.01 with own render worker / full BYOK, else $0.25
 *   - Failed calls are refunded
 *   - 5-trend verify+create run ≈ 10 calls ≈ $0.10 on BYOK
 */

import {
  pnrInitialize,
  pnrCreateNews,
  pnrGenerateAdCreative,
  pnrRequestMp4,
  pnrPollJob,
  getPnrConfig,
  type CreateNewsResult,
  type GenerateAdCreativeResult,
  type RequestMp4Result,
  type PnrJobStatus,
} from "./pnr";
import {
  scoutTrends,
  handOff,
  isAgent37Configured,
  type Agent37Trend,
  type ScoutTrendsResult,
  type HandOffResult,
} from "./agent37";

// --- shared types ---

export type PipelineFormat = "hottake" | "carousel" | "hybrid" | "image";

export interface ScoredTrend extends Agent37Trend {
  score: number; // 0–100
  scoreReason: string;
}

export interface VerifyResult {
  ok: boolean;
  unverified: boolean;
  pageUrl?: string;
  sources?: Array<{ url: string; title?: string }>;
  caption?: string;
  warning?: string;
  jobId?: string;
  raw?: unknown;
}

export interface CreatePreviewResult {
  ok: boolean;
  pageUrl?: string;
  caption?: string;
  sources?: Array<{ url: string; title?: string }>;
  format?: PipelineFormat;
  warning?: string;
  jobId?: string;
  raw?: unknown;
}

export interface RequestMp4PipelineResult {
  ok: boolean;
  mp4Url?: string;
  warning?: string;
  jobId?: string;
  raw?: unknown;
}

export interface HandOffPipelineResult {
  ok: boolean;
  agent37Id?: string;
  status?: string;
  warning?: string;
  source?: string;
}

// --- step 1: scout (delegates to Agent 37 or uses caller-supplied trends) ---

export async function stepScout(args: {
  niche: string;
  region?: string;
  limit?: number;
}): Promise<{ agent37: ScoutTrendsResult; configured: boolean }> {
  const agent37 = await scoutTrends({
    niche: args.niche,
    region: args.region,
    limit: args.limit ?? 10,
  });
  return { agent37, configured: isAgent37Configured() };
}

// --- step 2: score (per the spec — velocity, freshness, niche fit, meme-ability) ---

export function stepScore(trend: Agent37Trend): ScoredTrend {
  const velocity = clamp(trend.velocity ?? 50, 0, 100);
  const freshness = clamp(trend.freshness ?? 50, 0, 100);
  const nicheFit = clamp(trend.nicheFit ?? 50, 0, 100);
  const memeability = clamp(trend.memeability ?? 50, 0, 100);
  // Weighted average per the spec — "ranks each trend on velocity, freshness,
  // niche fit and meme-ability"
  const score = Math.round(velocity * 0.3 + freshness * 0.25 + nicheFit * 0.2 + memeability * 0.25);
  return {
    ...trend,
    score,
    scoreReason: `velocity ${velocity}×0.3 + freshness ${freshness}×0.25 + nicheFit ${nicheFit}×0.2 + memeability ${memeability}×0.25 = ${score}`,
  };
}

// Drop anything about tragedy, death, disasters, or minors per the spec
const DROP_KEYWORDS = [
  "dead", "death", "died", "killed", "murder", "fatal", "tragedy", "tragic",
  "disaster", "earthquake", "tsunami", "flood", "wildfire", "shooting",
  "massacre", "victim", "casualt", "crash", "wounded", "injured",
  "child", "minor", "kid", "teen", "baby", "infant", "student died",
];

export function shouldDropTrend(trend: Agent37Trend): boolean {
  if (trend.dropReason) return true;
  const title = trend.title.toLowerCase();
  return DROP_KEYWORDS.some((k) => title.includes(k));
}

// --- step 3: verify (P&R create_news — doubles as fact check) ---

export async function stepVerify(
  trend: Agent37Trend,
  sessionId: string,
  onProgress?: (s: PnrJobStatus) => void,
): Promise<VerifyResult> {
  const cfg = getPnrConfig();
  const r = await pnrCreateNews({ topic: trend.title }, sessionId);
  if (!r.ok) {
    return { ok: false, unverified: false, warning: r.error, jobId: undefined };
  }
  // If we got a job id, poll kind=sitdown
  if (r.value.jobId) {
    const poll = await pnrPollJob(r.value.jobId, "sitdown", sessionId, {
      pollAfterMs: cfg.pollAfterMs,
      maxPolls: cfg.maxPolls,
      onProgress,
    });
    if (!poll.ok) {
      return { ok: false, unverified: false, warning: poll.error, jobId: r.value.jobId };
    }
    const result = (poll.value.result ?? {}) as CreateNewsResult;
    return {
      ok: true,
      unverified: false,
      pageUrl: result.pageUrl,
      sources: result.sources,
      caption: result.caption,
      jobId: r.value.jobId,
      raw: result.raw,
    };
  }
  // Direct result
  const result = r.value as CreateNewsResult;
  const unverified = !result.sources || result.sources.length === 0;
  return {
    ok: true,
    unverified,
    pageUrl: result.pageUrl,
    sources: result.sources,
    caption: result.caption,
    raw: result.raw,
  };
}

// --- step 4: create (P&R generate_ad_creative) ---

export async function stepCreate(
  trend: Agent37Trend,
  format: PipelineFormat,
  brandProfile: unknown,
  sessionId: string,
  onProgress?: (s: PnrJobStatus) => void,
): Promise<CreatePreviewResult> {
  const cfg = getPnrConfig();
  const brief = `${trend.title} — angle: ${trend.niche ?? "general"} — audience: P&R viewer`;
  const r = await pnrGenerateAdCreative(
    { topic: trend.title, format, brandProfile, brief },
    sessionId,
  );
  if (!r.ok) {
    return { ok: false, warning: r.error, format };
  }
  if (r.value.jobId) {
    const poll = await pnrPollJob(r.value.jobId, "creative", sessionId, {
      pollAfterMs: cfg.pollAfterMs,
      maxPolls: cfg.maxPolls,
      onProgress,
    });
    if (!poll.ok) {
      return { ok: false, warning: poll.error, jobId: r.value.jobId, format };
    }
    const result = (poll.value.result ?? {}) as GenerateAdCreativeResult;
    return {
      ok: true,
      pageUrl: result.pageUrl,
      caption: result.caption,
      sources: result.sources,
      format,
      jobId: r.value.jobId,
      raw: result.raw,
    };
  }
  const result = r.value as GenerateAdCreativeResult;
  return {
    ok: true,
    pageUrl: result.pageUrl,
    caption: result.caption,
    sources: result.sources,
    format,
    raw: result.raw,
  };
}

// --- step 5: request MP4 (only after human approval) ---

export async function stepRequestMp4(
  pageUrl: string,
  caption: string | undefined,
  sessionId: string,
  onProgress?: (s: PnrJobStatus) => void,
): Promise<RequestMp4PipelineResult> {
  const cfg = getPnrConfig();
  const r = await pnrRequestMp4({ pageUrl, caption }, sessionId);
  if (!r.ok) {
    return { ok: false, warning: r.error };
  }
  if (r.value.jobId) {
    const poll = await pnrPollJob(r.value.jobId, "mp4", sessionId, {
      pollAfterMs: cfg.pollAfterMs,
      maxPolls: cfg.maxPolls,
      onProgress,
    });
    if (!poll.ok) {
      return { ok: false, warning: poll.error, jobId: r.value.jobId };
    }
    const result = (poll.value.result ?? {}) as RequestMp4Result;
    return { ok: true, mp4Url: result.mp4Url, jobId: r.value.jobId, raw: result.raw };
  }
  const result = r.value as RequestMp4Result;
  return { ok: true, mp4Url: result.mp4Url, raw: result.raw };
}

// --- step 6: hand off to Agent 37 (only after MP4 is ready) ---

export async function stepHandOff(args: {
  trend: Agent37Trend;
  pageUrl: string;
  mp4Url?: string;
  caption?: string;
  platforms?: string[];
  approvedBy: string;
}): Promise<HandOffPipelineResult> {
  const r: HandOffResult = await handOff({
    trend: { title: args.trend.title, niche: args.trend.niche, region: args.trend.region },
    pageUrl: args.pageUrl,
    mp4Url: args.mp4Url,
    caption: args.caption,
    platforms: args.platforms,
    approvedBy: args.approvedBy,
  });
  if (!r.configured) {
    return { ok: false, warning: "Agent 37 not configured — pipeline stopped before scheduling.", source: r.source };
  }
  if (r.warning) {
    return { ok: false, warning: r.warning, source: r.source };
  }
  return { ok: true, agent37Id: r.id, status: r.status, source: r.source };
}

// --- the full pipeline (helper — UI usually drives step-by-step) ---

export interface FullPipelineResult {
  sessionId?: string;
  scoredTrends: ScoredTrend[];
  verified: Array<{ trend: ScoredTrend; result: VerifyResult }>;
  previews: Array<{ trend: ScoredTrend; format: PipelineFormat; result: CreatePreviewResult }>;
  warnings: string[];
}

/**
 * Run the full scout → score → verify → create → preview pipeline.
 * Stops at previews. Does NOT request MP4 or hand off. The human must
 * approve a specific preview first.
 *
 * Costs (per the spec):
 *   - ~$0.01/call on BYOK (first 100/month free)
 *   - 5 trends ≈ 10 calls ≈ $0.10
 */
export async function runPipelineToPreviews(args: {
  niche: string;
  region?: string;
  limit?: number;
  format?: PipelineFormat;
  onProgress?: (msg: string) => void;
}): Promise<FullPipelineResult> {
  const warnings: string[] = [];
  const cfg = getPnrConfig();
  if (!cfg.configured) {
    warnings.push("PNR_MCP_KEY not configured — pipeline cannot verify or create. Set it server-side.");
    return { scoredTrends: [], verified: [], previews: [], warnings };
  }

  args.onProgress?.("Step 1: scouting trends…");
  const scout = await stepScout({ niche: args.niche, region: args.region, limit: args.limit ?? 5 });
  if (scout.agent37.warning) warnings.push(`Agent 37: ${scout.agent37.warning}`);

  // Use Agent 37 trends if configured and returned some, otherwise nothing —
  // per the spec, when AGENT37_URL is unset, the agent gathers candidates
  // itself and passes them in. This full-pipeline helper doesn't have a
  // caller-supplied list, so it just uses Agent 37.
  const raw = scout.agent37.trends ?? [];
  if (raw.length === 0) {
    warnings.push("No candidate trends. Either Agent 37 is unconfigured or it returned an empty list.");
    return { scoredTrends: [], verified: [], previews: [], warnings };
  }

  args.onProgress?.(`Step 2: scoring ${raw.length} trends…`);
  const scored = raw
    .map(stepScore)
    .filter((t) => !shouldDropTrend(t))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (scored.length === 0) {
    warnings.push("All candidate trends were dropped (tragedy/death/disaster/minors).");
    return { scoredTrends: [], verified: [], previews: [], warnings };
  }

  args.onProgress?.("Step 3: initializing P&R MCP session…");
  const init = await pnrInitialize();
  if (!init.ok) {
    warnings.push(`P&R initialize failed: ${init.error}`);
    return { scoredTrends: scored, verified: [], previews: [], warnings };
  }
  const sessionId = init.value;

  args.onProgress?.("Step 4: verifying trends (create_news)…");
  const verified: FullPipelineResult["verified"] = [];
  for (const trend of scored) {
    const result = await stepVerify(trend, sessionId);
    verified.push({ trend, result });
    if (result.warning) warnings.push(`Verify "${trend.title}": ${result.warning}`);
  }

  args.onProgress?.("Step 5: generating previews (generate_ad_creative)…");
  const previews: FullPipelineResult["previews"] = [];
  for (const v of verified) {
    if (!v.result.ok || v.result.unverified) continue;
    const result = await stepCreate(v.trend, args.format ?? "hottake", undefined, sessionId);
    previews.push({ trend: v.trend, format: args.format ?? "hottake", result });
    if (result.warning) warnings.push(`Create "${v.trend.title}": ${result.warning}`);
  }

  return { sessionId, scoredTrends: scored, verified, previews, warnings };
}

// --- helpers ---

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
