/**
 * Agent 37 adapter.
 *
 * Two paths, in priority order:
 *
 *   1. CUSTOM_CONTRACT — when the user has stood up an Agent 37 instance
 *      with the spec's small HTTP contract:
 *        POST {AGENT37_URL}/trends/scout    { niche, region, limit } -> { trends: Trend[] }
 *        POST {AGENT37_URL}/posts/handoff   { trend, pageUrl, mp4Url?, caption, platforms[], approvedBy }
 *                                           -> { id, status }
 *      Detect this when AGENT37_URL ends with a path that looks like the
 *      custom contract base (or when AGENT37_CONTRACT=custom is set).
 *
 *   2. HERMES_CHAT — the real Agent 37 chat API. We create (or reuse)
 *      an instance from the `agent37-hermes` template, wait for healthy,
 *      then send a chat turn through `POST {INSTANCE_URL}/v1/responses`
 *      asking the harness to scout trends or to record a handoff. The
 *      harness returns text; we parse the JSON it emits back. This is
 *      the default when AGENT37_URL is unset but AGENT37_API_KEY is set.
 *
 * When neither AGENT37_URL nor AGENT37_API_KEY is set, both functions
 * return `{ configured: false }` and the pipeline keeps working — it just
 * won't schedule anything (per the spec).
 *
 * Reference: https://www.agent37.com/docs
 *   - Management API base:  https://api.agent37.com/v1
 *   - Per-instance base:     https://sandbox.agent37.app/v1/instances/{id}
 *   - Management auth:       Authorization: Bearer sk_live_...
 *   - Per-instance auth:    X-Agent37-Key: sk_live_...
 */

const AGENT37_URL = process.env.AGENT37_URL ?? "";
const AGENT37_KEY = process.env.AGENT37_KEY ?? process.env.AGENT37_API_KEY ?? "";
const AGENT37_CONTRACT = process.env.AGENT37_CONTRACT ?? "auto";
const AGENT37_TEMPLATE = process.env.AGENT37_TEMPLATE ?? "agent37-hermes";

// --- shared types ---

export interface Agent37Trend {
  title: string;
  niche?: string;
  region?: string;
  velocity?: number; // 0–100
  freshness?: number; // 0–100
  nicheFit?: number; // 0–100
  memeability?: number; // 0–100
  source?: string;
  url?: string;
  /** Reason to drop (tragedy, death, disaster, minors). If set, the pipeline skips it. */
  dropReason?: string;
}

export interface ScoutTrendsArgs {
  niche: string;
  region?: string;
  limit?: number;
}

export interface ScoutTrendsResult {
  configured: boolean;
  trends?: Agent37Trend[];
  /** When using HERMES_CHAT, the chat session id for follow-ups */
  sessionId?: string;
  /** When the call failed but we shouldn't abort the pipeline */
  warning?: string;
  source: "custom_contract" | "hermes_chat" | "not_configured";
}

export interface HandOffArgs {
  trend: { title: string; niche?: string; region?: string };
  pageUrl: string;
  mp4Url?: string;
  caption?: string;
  platforms?: string[];
  approvedBy: string;
}

export interface HandOffResult {
  configured: boolean;
  id?: string;
  status?: string;
  warning?: string;
  source: "custom_contract" | "hermes_chat" | "not_configured";
}

// --- public functions ---

export function isAgent37Configured(): boolean {
  return !!(AGENT37_KEY && (AGENT37_URL || process.env.AGENT37_API_KEY));
}

export function agent37Mode(): "custom_contract" | "hermes_chat" | "not_configured" {
  if (!AGENT37_KEY) return "not_configured";
  if (AGENT37_CONTRACT === "custom") return "custom_contract";
  if (AGENT37_CONTRACT === "hermes") return "hermes_chat";
  // auto: prefer AGENT37_URL if set (the user is hosting a contract server)
  if (AGENT37_URL) return "custom_contract";
  // Otherwise, if we have an API key, fall back to Hermes chat
  if (process.env.AGENT37_API_KEY) return "hermes_chat";
  return "not_configured";
}

export async function scoutTrends(args: ScoutTrendsArgs): Promise<ScoutTrendsResult> {
  const mode = agent37Mode();
  if (mode === "not_configured") {
    return { configured: false, source: "not_configured" };
  }
  if (mode === "custom_contract") {
    return customContractScout(args);
  }
  return hermesChatScout(args);
}

export async function handOff(args: HandOffArgs): Promise<HandOffResult> {
  const mode = agent37Mode();
  if (mode === "not_configured") {
    return { configured: false, source: "not_configured" };
  }
  if (mode === "custom_contract") {
    return customContractHandOff(args);
  }
  return hermesChatHandOff(args);
}

// --- path 1: custom contract ---

async function customContractScout(args: ScoutTrendsArgs): Promise<ScoutTrendsResult> {
  try {
    const res = await fetch(`${AGENT37_URL}/trends/scout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AGENT37_KEY}`,
      },
      body: JSON.stringify({
        niche: args.niche,
        region: args.region,
        limit: args.limit ?? 10,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        configured: true,
        source: "custom_contract",
        warning: `Agent 37 /trends/scout HTTP ${res.status}: ${text.slice(0, 200) || res.statusText}`,
        trends: [],
      };
    }
    const json = (await res.json()) as { trends?: Agent37Trend[] };
    return { configured: true, source: "custom_contract", trends: json.trends ?? [] };
  } catch (err) {
    return {
      configured: true,
      source: "custom_contract",
      warning: `Agent 37 /trends/scout fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      trends: [],
    };
  }
}

async function customContractHandOff(args: HandOffArgs): Promise<HandOffResult> {
  try {
    const res = await fetch(`${AGENT37_URL}/posts/handoff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AGENT37_KEY}`,
      },
      body: JSON.stringify({
        trend: args.trend,
        pageUrl: args.pageUrl,
        mp4Url: args.mp4Url,
        caption: args.caption,
        platforms: args.platforms ?? ["x", "tiktok", "instagram"],
        approvedBy: args.approvedBy,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        configured: true,
        source: "custom_contract",
        warning: `Agent 37 /posts/handoff HTTP ${res.status}: ${text.slice(0, 200) || res.statusText}`,
      };
    }
    const json = (await res.json()) as { id?: string; status?: string };
    return { configured: true, source: "custom_contract", id: json.id, status: json.status };
  } catch (err) {
    return {
      configured: true,
      source: "custom_contract",
      warning: `Agent 37 /posts/handoff fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// --- path 2: Hermes chat (real Agent 37 API) ---

const API_BASE = "https://api.agent37.com/v1";
const SANDBOX_BASE = "https://sandbox.agent37.app/v1/instances";

interface HermesInstance {
  id: string;
  url: string;
}

let cachedInstance: HermesInstance | null = null;

/**
 * Create or reuse an Agent 37 Hermes instance for trend scouting.
 * Per the docs: POST /v1/instances with the agent37-hermes template,
 * then poll /v1/health until healthy=true.
 *
 * We cache the instance per process to avoid creating a new one on every
 * call. The user can force a new one by deleting the env var or
 * restarting the server.
 */
async function getOrCreateHermesInstance(): Promise<{
  ok: true;
  instance: HermesInstance;
} | {
  ok: false;
  error: string;
}> {
  if (cachedInstance) return { ok: true, instance: cachedInstance };

  try {
    // Create the instance
    const createRes = await fetch(`${API_BASE}/instances`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AGENT37_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        template: AGENT37_TEMPLATE,
        budget: { credit_micros: 1_000_000 }, // $1 budget for managed LLM calls
        name: `trend-scout-${Date.now().toString(36)}`,
        metadata: { app: "pr-trend-scout-bridge" },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!createRes.ok) {
      const text = await createRes.text().catch(() => "");
      return { ok: false, error: `Create instance HTTP ${createRes.status}: ${text.slice(0, 200)}` };
    }
    const inst = (await createRes.json()) as HermesInstance;

    // Wait for healthy (up to 3 minutes)
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const healthRes = await fetch(`${inst.url}/v1/health`, {
        headers: { "X-Agent37-Key": AGENT37_KEY },
        signal: AbortSignal.timeout(10_000),
      });
      if (healthRes.ok) {
        const health = (await healthRes.json()) as { healthy?: boolean; ok?: boolean };
        if (health.healthy === true) {
          cachedInstance = inst;
          return { ok: true, instance: inst };
        }
      }
      await sleep(2_000);
    }
    return { ok: false, error: "Instance did not become healthy within 3 minutes" };
  } catch (err) {
    return { ok: false, error: `Failed to create Agent 37 instance: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function hermesChatScout(args: ScoutTrendsArgs): Promise<ScoutTrendsResult> {
  const inst = await getOrCreateHermesInstance();
  if (!inst.ok) {
    return { configured: true, source: "hermes_chat", warning: inst.error, trends: [] };
  }
  // Brief the agent to scout trends in JSON
  const prompt = `You are a trend scout. Find ${args.limit ?? 10} trending topics in the niche "${args.niche}"${args.region ? ` for region "${args.region}"` : ""}.

Use web search and your judgment. Return ONLY a JSON array (no prose, no markdown fences) of objects with this shape:
{"title": "<trend>", "velocity": 0-100, "freshness": 0-100, "nicheFit": 0-100, "memeability": 0-100, "source": "<where you found it>", "url": "<source url>", "dropReason": "<only set if the trend is about tragedy, death, disaster, or minors — those are never meme material>"}

If you cannot reach the internet, return an empty array [] and nothing else.`;

  try {
    const chatRes = await fetch(`${inst.instance.url}/v1/responses`, {
      method: "POST",
      headers: {
        "X-Agent37-Key": AGENT37_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: prompt }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!chatRes.ok) {
      const text = await chatRes.text().catch(() => "");
      return {
        configured: true,
        source: "hermes_chat",
        warning: `Hermes chat HTTP ${chatRes.status}: ${text.slice(0, 200)}`,
        trends: [],
      };
    }
    const chat = (await chatRes.json()) as {
      session_id?: string;
      status: string;
      output_text?: string;
      error?: string;
    };
    if (chat.status !== "completed") {
      return {
        configured: true,
        source: "hermes_chat",
        warning: `Hermes chat status: ${chat.status}. ${chat.error ?? ""}`,
        trends: [],
      };
    }
    const trends = parseTrendsFromChat(chat.output_text ?? "");
    return {
      configured: true,
      source: "hermes_chat",
      trends,
      sessionId: chat.session_id,
    };
  } catch (err) {
    return {
      configured: true,
      source: "hermes_chat",
      warning: `Hermes chat fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      trends: [],
    };
  }
}

async function hermesChatHandOff(args: HandOffArgs): Promise<HandOffResult> {
  const inst = await getOrCreateHermesInstance();
  if (!inst.ok) {
    return { configured: true, source: "hermes_chat", warning: inst.error };
  }
  const prompt = `Record this approved post handoff. Save it to disk (~/handoffs/) so you can schedule it later. Reply with ONLY a JSON object: {"id": "<uuid>", "status": "recorded"}.

Trend: ${args.trend.title}
Niche: ${args.trend.niche ?? "unknown"}
Preview page URL: ${args.pageUrl}
MP4 URL: ${args.mp4Url ?? "(not yet rendered)"}
Caption: ${args.caption ?? ""}
Platforms: ${(args.platforms ?? ["x", "tiktok", "instagram"]).join(", ")}
Approved by: ${args.approvedBy}`;
  try {
    const chatRes = await fetch(`${inst.instance.url}/v1/responses`, {
      method: "POST",
      headers: {
        "X-Agent37-Key": AGENT37_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: prompt }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!chatRes.ok) {
      return { configured: true, source: "hermes_chat", warning: `Hermes handoff HTTP ${chatRes.status}` };
    }
    const chat = (await chatRes.json()) as { status: string; output_text?: string };
    if (chat.status !== "completed") {
      return { configured: true, source: "hermes_chat", warning: `Hermes handoff status: ${chat.status}` };
    }
    const parsed = parseHandOffFromChat(chat.output_text ?? "");
    return {
      configured: true,
      source: "hermes_chat",
      id: parsed.id,
      status: parsed.status ?? "recorded",
    };
  } catch (err) {
    return {
      configured: true,
      source: "hermes_chat",
      warning: `Hermes handoff fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function parseTrendsFromChat(text: string): Agent37Trend[] {
  // Extract the first JSON array from the text
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]) as Agent37Trend[];
    if (!Array.isArray(arr)) return [];
    return arr.filter((t) => t && typeof t.title === "string");
  } catch {
    return [];
  }
}

function parseHandOffFromChat(text: string): { id?: string; status?: string } {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    return JSON.parse(match[0]) as { id?: string; status?: string };
  } catch {
    return {};
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

// --- cleanup ---

/**
 * Delete the cached Hermes instance. Call this when the bridge is shut down
 * or when the user wants to start fresh. Per the docs: DELETE /v1/instances/{id}
 */
export async function cleanupHermesInstance(): Promise<void> {
  if (!cachedInstance) return;
  try {
    await fetch(`${API_BASE}/instances/${cachedInstance.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${AGENT37_KEY}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // best-effort cleanup
  }
  cachedInstance = null;
}
