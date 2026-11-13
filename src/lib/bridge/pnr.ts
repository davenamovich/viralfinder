/**
 * Plunder & Riffle MCP client — raw JSON-RPC 2.0 over Streamable HTTP.
 *
 * Same design as The SEO Audit Factory's P&R client:
 *   - No SDK, just fetch
 *   - Keys kept on the server (process.env.PNR_MCP_KEY)
 *   - Labeled fallback when a call fails
 *
 * Flow:
 *   1. initialize  → MCP session id (returned via Mcp-Session-Id header)
 *   2. tools/list   → discover available tools
 *   3. tools/call   → invoke a tool by name
 *
 * Async jobs (create_news, generate_ad_creative, request_mp4) return a
 * job id immediately. We poll get_job_status every pollAfterSec until
 * terminal=true. If phase="needs_input", the caller must ask the human.
 *
 * Streaming responses (SSE): we read the response body as a stream and
 * parse `data: {...}` lines until we see the final JSON-RPC response
 * (id matches the request id). This handles the "Streamable HTTP"
 * transport the P&R MCP uses.
 *
 * All failures are returned as a labeled `BridgeResult.error` with the
 * exact server message — never swallowed. The UI shows every failure.
 */

const PNR_MCP_URL =
  process.env.PNR_MCP_URL ?? "https://bot.plunderandriffle.com/api/mcp";
const PNR_MCP_KEY = process.env.PNR_MCP_KEY ?? "";

export interface PnrConfig {
  url: string;
  key: string;
  /** Default per-call timeout in ms */
  timeoutMs?: number;
  /** Default job poll interval in ms */
  pollAfterMs?: number;
  /** Max job polls before giving up */
  maxPolls?: number;
}

export function getPnrConfig(): PnrConfig & { configured: boolean } {
  return {
    url: PNR_MCP_URL,
    key: PNR_MCP_KEY,
    timeoutMs: 60_000,
    pollAfterMs: 20_000,
    maxPolls: 30,
    configured: !!PNR_MCP_KEY,
  };
}

export interface PnrTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface PnrJobStatus {
  id: string;
  kind: string;
  status: "queued" | "running" | "completed" | "failed" | "needs_input";
  phase?: string;
  terminal: boolean;
  result?: unknown;
  error?: string;
  /** Refund info — failed calls are refunded per the spec */
  refunded?: boolean;
}

export type BridgeResult<T> =
  | { ok: true; value: T; sessionId?: string }
  | { ok: false; error: string; code?: string; refunded?: boolean };

// --- JSON-RPC primitives ---

let nextId = 1;
function rpcId(): number {
  return nextId++;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * Send a JSON-RPC request to the P&R MCP.
 *
 * The first call (initialize) establishes a session; the Mcp-Session-Id
 * header is returned and must be passed on subsequent calls.
 *
 * The server may respond with SSE (Content-Type: text/event-stream) or
 * plain JSON. We handle both.
 */
export async function pnrCall(
  method: string,
  params: Record<string, unknown> = {},
  opts: {
    sessionId?: string;
    timeoutMs?: number;
  } = {},
): Promise<BridgeResult<unknown>> {
  if (!PNR_MCP_KEY) {
    return {
      ok: false,
      error:
        "PNR_MCP_KEY not configured. Set it server-side (process.env.PNR_MCP_KEY). Never expose it to the client.",
      code: "missing_key",
    };
  }

  const id = rpcId();
  const body: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);

  try {
    const res = await fetch(PNR_MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${PNR_MCP_KEY}`,
        ...(opts.sessionId ? { "Mcp-Session-Id": opts.sessionId } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: `P&R MCP HTTP ${res.status}: ${text.slice(0, 300) || res.statusText}`,
        code: `http_${res.status}`,
      };
    }

    const sessionId = res.headers.get("Mcp-Session-Id") ?? undefined;
    const contentType = res.headers.get("Content-Type") ?? "";

    // Handle SSE stream
    if (contentType.includes("text/event-stream")) {
      const parsed = await parseSseStream(res.body!, id);
      if (!parsed) {
        return { ok: false, error: "SSE stream ended without a JSON-RPC response", code: "sse_no_response" };
      }
      return rpcResult(parsed, sessionId);
    }

    // Plain JSON response
    const json = (await res.json()) as JsonRpcResponse;
    return rpcResult(json, sessionId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("aborted")) {
      return { ok: false, error: `P&R MCP call timed out after ${opts.timeoutMs ?? 60_000}ms`, code: "timeout" };
    }
    return { ok: false, error: `P&R MCP fetch failed: ${msg}`, code: "fetch_error" };
  } finally {
    clearTimeout(timeout);
  }
}

function rpcResult(json: JsonRpcResponse, sessionId?: string): BridgeResult<unknown> {
  if (json.error) {
    return {
      ok: false,
      error: json.error.message,
      code: `rpc_${json.error.code}`,
    };
  }
  return { ok: true, value: json.result, sessionId };
}

/**
 * Parse an SSE stream until we see the JSON-RPC response matching `id`.
 * Each `data: {...}` line is one JSON object. We collect until the
 * response with the matching id arrives.
 */
async function parseSseStream(
  body: ReadableStream<Uint8Array>,
  expectedId: number,
): Promise<JsonRpcResponse | null> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastJson: JsonRpcResponse | null = null;

  // Stream read loop. We don't rely on a separate "event:" line; the
  // JSON-RPC response object itself carries the id.
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Process complete `data: ...\n\n` blocks
    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 2);
      const lines = block.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const obj = JSON.parse(payload) as JsonRpcResponse;
          if (obj.id === expectedId) {
            lastJson = obj;
          }
        } catch {
          // ignore non-JSON lines (heartbeat comments etc.)
        }
      }
    }
  }
  return lastJson;
}

// --- High-level MCP flow ---

export async function pnrInitialize(): Promise<BridgeResult<string>> {
  // The MCP initialize call. Some servers auto-create a session on first call,
  // others require an explicit initialize. We try initialize first.
  const r = await pnrCall("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "pr-trend-scout-bridge", version: "1.0.0" },
  });
  if (!r.ok) return r;
  if (!r.sessionId) {
    return { ok: false, error: "initialize succeeded but no Mcp-Session-Id header was returned", code: "no_session" };
  }
  // Send initialized notification (no response expected)
  await pnrCall("notifications/initialized", {}, { sessionId: r.sessionId, timeoutMs: 10_000 });
  return { ok: true, value: r.sessionId, sessionId: r.sessionId };
}

export async function pnrListTools(sessionId: string): Promise<BridgeResult<PnrTool[]>> {
  const r = await pnrCall("tools/list", {}, { sessionId });
  if (!r.ok) return r;
  const v = r.value as { tools?: PnrTool[] };
  return { ok: true, value: v.tools ?? [], sessionId: r.sessionId };
}

export interface PnrToolCallResult {
  content: Array<{ type: string; text?: string; data?: unknown }>;
  /** When the tool returned a job id, this is set */
  jobId?: string;
  /** When the tool returned a direct result, this is the parsed JSON */
  parsed?: unknown;
  isError?: boolean;
}

export async function pnrToolCall(
  name: string,
  args: Record<string, unknown>,
  sessionId: string,
  opts: { timeoutMs?: number } = {},
): Promise<BridgeResult<PnrToolCallResult>> {
  const r = await pnrCall("tools/call", { name, arguments: args }, { sessionId, timeoutMs: opts.timeoutMs ?? 60_000 });
  if (!r.ok) return r;

  const v = r.value as {
    content?: Array<{ type: string; text?: string; data?: unknown }>;
    isError?: boolean;
  };
  const content = v.content ?? [];
  // Look for a job id in the first text content
  let jobId: string | undefined;
  let parsed: unknown = undefined;
  for (const c of content) {
    if (c.type === "text" && c.text) {
      try {
        const obj = JSON.parse(c.text);
        if (typeof obj === "object" && obj !== null) {
          parsed = obj;
          if ("jobId" in obj && typeof (obj as Record<string, unknown>).jobId === "string") {
            jobId = (obj as Record<string, unknown>).jobId as string;
          } else if ("job_id" in obj && typeof (obj as Record<string, unknown>).job_id === "string") {
            jobId = (obj as Record<string, unknown>).job_id as string;
          } else if ("id" in obj && typeof (obj as Record<string, unknown>).id === "string") {
            jobId = (obj as Record<string, unknown>).id as string;
          }
        }
      } catch {
        // not JSON, ignore
      }
    }
  }
  return {
    ok: true,
    value: { content, jobId, parsed, isError: v.isError },
    sessionId: r.sessionId,
  };
}

/**
 * Poll get_job_status until terminal=true or maxPolls reached.
 * Returns the final job state.
 */
export async function pnrPollJob(
  jobId: string,
  kind: string,
  sessionId: string,
  opts: { pollAfterMs?: number; maxPolls?: number; onProgress?: (s: PnrJobStatus) => void } = {},
): Promise<BridgeResult<PnrJobStatus>> {
  const pollAfterMs = opts.pollAfterMs ?? 20_000;
  const maxPolls = opts.maxPolls ?? 30;
  for (let i = 0; i < maxPolls; i++) {
    await sleep(pollAfterMs);
    const r = await pnrToolCall("get_job_status", { jobId, kind }, sessionId, { timeoutMs: 30_000 });
    if (!r.ok) return r;
    const parsed = (r.value.parsed ?? {}) as Partial<PnrJobStatus>;
    const status: PnrJobStatus = {
      id: jobId,
      kind,
      status: (parsed.status as PnrJobStatus["status"]) ?? "running",
      phase: parsed.phase,
      terminal: parsed.terminal ?? false,
      result: parsed.result,
      error: parsed.error,
      refunded: parsed.refunded,
    };
    opts.onProgress?.(status);
    if (status.terminal) {
      return { ok: true, value: status, sessionId };
    }
    if (status.phase === "needs_input") {
      return {
        ok: false,
        error: "Job needs human input. Ask the user, then resume.",
        code: "needs_input",
      };
    }
  }
  return {
    ok: false,
    error: `Job ${jobId} did not reach terminal state after ${maxPolls} polls (${(maxPolls * pollAfterMs) / 1000}s).`,
    code: "poll_timeout",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

// --- High-level P&R tool wrappers (per the bridge spec) ---

export interface CreateNewsArgs {
  topic: string;
  /** Optional angle hint */
  brief?: string;
}

export interface CreateNewsResult {
  pageUrl?: string;
  sources?: Array<{ url: string; title?: string }>;
  caption?: string;
  unverified?: boolean;
  raw?: unknown;
}

export async function pnrCreateNews(
  args: CreateNewsArgs,
  sessionId: string,
): Promise<BridgeResult<CreateNewsResult & { jobId?: string }>> {
  // topic <= 200 chars per the spec
  const topic = args.topic.slice(0, 200);
  const r = await pnrToolCall("create_news", { topic, brief: args.brief }, sessionId);
  if (!r.ok) return r;
  const v = r.value;
  // If we got a job id, return it so the caller can poll kind=sitdown
  if (v.jobId) {
    return { ok: true, value: { jobId: v.jobId, raw: v.parsed }, sessionId: r.sessionId };
  }
  // Otherwise the result is direct
  const parsed = (v.parsed ?? {}) as CreateNewsResult;
  return { ok: true, value: { ...parsed, raw: v.parsed }, sessionId: r.sessionId };
}

export interface GenerateAdCreativeArgs {
  topic: string;
  format: "hottake" | "carousel" | "hybrid" | "image";
  brandProfile?: unknown;
  brief?: string;
}

export interface GenerateAdCreativeResult {
  pageUrl?: string;
  caption?: string;
  sources?: Array<{ url: string; title?: string }>;
  format?: string;
  raw?: unknown;
}

export async function pnrGenerateAdCreative(
  args: GenerateAdCreativeArgs,
  sessionId: string,
): Promise<BridgeResult<GenerateAdCreativeResult & { jobId?: string }>> {
  const r = await pnrToolCall(
    "generate_ad_creative",
    {
      topic: args.topic.slice(0, 200),
      format: args.format,
      brief: args.brief,
      ...(args.brandProfile ? { brandProfile: args.brandProfile } : {}),
    },
    sessionId,
  );
  if (!r.ok) return r;
  if (r.value.jobId) {
    return { ok: true, value: { jobId: r.value.jobId, raw: r.value.parsed }, sessionId: r.sessionId };
  }
  const parsed = (r.value.parsed ?? {}) as GenerateAdCreativeResult;
  return { ok: true, value: { ...parsed, raw: r.value.parsed }, sessionId: r.sessionId };
}

export interface RequestMp4Args {
  pageUrl: string;
  /** Optional caption override */
  caption?: string;
}

export interface RequestMp4Result {
  mp4Url?: string;
  jobId?: string;
  raw?: unknown;
}

export async function pnrRequestMp4(
  args: RequestMp4Args,
  sessionId: string,
): Promise<BridgeResult<RequestMp4Result>> {
  const r = await pnrToolCall("request_mp4", { pageUrl: args.pageUrl, caption: args.caption }, sessionId);
  if (!r.ok) return r;
  if (r.value.jobId) {
    return { ok: true, value: { jobId: r.value.jobId, raw: r.value.parsed }, sessionId: r.sessionId };
  }
  const parsed = (r.value.parsed ?? {}) as RequestMp4Result;
  return { ok: true, value: { ...parsed, raw: r.value.parsed }, sessionId: r.sessionId };
}

export interface ResearchBrandArgs {
  brand: string;
  /** URL or handle of the brand */
  url?: string;
}

export async function pnrResearchBrand(
  args: ResearchBrandArgs,
  sessionId: string,
): Promise<BridgeResult<{ brandProfile?: unknown; raw?: unknown }>> {
  const r = await pnrToolCall("research_brand", { brand: args.brand, url: args.url }, sessionId);
  if (!r.ok) return r;
  const parsed = (r.value.parsed ?? {}) as { brandProfile?: unknown };
  return { ok: true, value: { ...parsed, raw: r.value.parsed }, sessionId: r.sessionId };
}
