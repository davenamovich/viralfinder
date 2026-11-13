"use client";

import { useEffect, useState } from "react";
import type { TrendOpportunity } from "@/lib/trend-scout/types";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  Loader2,
  Rocket,
  Send,
  ShieldCheck,
  Sparkles,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  trend: TrendOpportunity;
}

type Format = "hottake" | "carousel" | "hybrid" | "image";

interface BridgeStatus {
  pnr: { configured: boolean; url: string };
  agent37: { configured: boolean; mode: string };
}

interface VerifyState {
  loading: boolean;
  ok: boolean;
  unverified: boolean;
  pageUrl?: string;
  sources?: Array<{ url: string; title?: string }>;
  caption?: string;
  warning?: string;
}

interface CreateState {
  loading: boolean;
  ok: boolean;
  pageUrl?: string;
  caption?: string;
  sources?: Array<{ url: string; title?: string }>;
  format?: Format;
  warning?: string;
}

interface Mp4State {
  loading: boolean;
  ok: boolean;
  mp4Url?: string;
  warning?: string;
}

interface HandOffState {
  loading: boolean;
  ok: boolean;
  agent37Id?: string;
  status?: string;
  warning?: string;
  source?: string;
}

const FORMAT_OPTIONS: { value: Format; label: string; desc: string }[] = [
  { value: "hottake", label: "Hot Take", desc: "Opinion — best for outrage, identity, contrarian angles" },
  { value: "carousel", label: "Carousel", desc: "Explainer — best for curiosity, useful takeaways" },
  { value: "hybrid", label: "Hybrid", desc: "iMessage thread — best for aspiration, story" },
  { value: "image", label: "Image", desc: "Single meme — best for humor" },
];

export function BridgePanel({ trend }: Props) {
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [format, setFormat] = useState<Format>("hottake");
  const [verify, setVerify] = useState<VerifyState>({ loading: false, ok: false, unverified: false });
  const [create, setCreate] = useState<CreateState>({ loading: false, ok: false });
  const [mp4, setMp4] = useState<Mp4State>({ loading: false, ok: false });
  const [handOff, setHandOff] = useState<HandOffState>({ loading: false, ok: false });
  const [approved, setApproved] = useState(false);

  // Fetch bridge config status on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/bridge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status" }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as BridgeStatus;
        if (!cancelled) setStatus(data);
      } catch {
        // non-fatal
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function callBridge(payload: Record<string, unknown>) {
    const res = await fetch("/api/bridge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function handleVerify() {
    setVerify({ loading: true, ok: false, unverified: false });
    try {
      const r = await callBridge({
        action: "verify",
        trend: { title: trend.title, niche: trend.niche, region: trend.country },
      });
      setVerify({
        loading: false,
        ok: r.ok ?? false,
        unverified: r.unverified ?? false,
        pageUrl: r.pageUrl,
        sources: r.sources,
        caption: r.caption,
        warning: r.warning,
      });
      if (r.ok && !r.unverified) {
        toast.success("Verified against live sources.");
      } else if (r.unverified) {
        toast.error("Trend unverified — no live sources answered. Skipping create step.");
      } else if (r.warning) {
        toast.error(r.warning);
      }
    } catch (e) {
      setVerify({ loading: false, ok: false, unverified: false, warning: e instanceof Error ? e.message : "Verify failed" });
      toast.error("Verify call failed.");
    }
  }

  async function handleCreate() {
    setCreate({ loading: true, ok: false });
    try {
      const r = await callBridge({
        action: "create",
        trend: { title: trend.title, niche: trend.niche, region: trend.country },
        format,
      });
      setCreate({
        loading: false,
        ok: r.ok ?? false,
        pageUrl: r.pageUrl,
        caption: r.caption,
        sources: r.sources,
        format: r.format,
        warning: r.warning,
      });
      if (r.ok && r.pageUrl) {
        toast.success("Preview created — review before approving.");
      } else if (r.warning) {
        toast.error(r.warning);
      }
    } catch (e) {
      setCreate({ loading: false, ok: false, warning: e instanceof Error ? e.message : "Create failed" });
      toast.error("Create call failed.");
    }
  }

  async function handleRequestMp4() {
    if (!approved) {
      toast.error("You must approve the preview first.");
      return;
    }
    if (!create.pageUrl) {
      toast.error("No preview to render.");
      return;
    }
    setMp4({ loading: true, ok: false });
    try {
      const r = await callBridge({
        action: "request_mp4",
        pageUrl: create.pageUrl,
        caption: create.caption,
      });
      setMp4({
        loading: false,
        ok: r.ok ?? false,
        mp4Url: r.mp4Url,
        warning: r.warning,
      });
      if (r.ok && r.mp4Url) {
        toast.success("MP4 rendered.");
      } else if (r.warning) {
        toast.error(r.warning);
      }
    } catch (e) {
      setMp4({ loading: false, ok: false, warning: e instanceof Error ? e.message : "MP4 failed" });
      toast.error("MP4 render failed.");
    }
  }

  async function handleHandOff() {
    if (!approved) {
      toast.error("You must approve the preview first.");
      return;
    }
    if (!create.pageUrl) {
      toast.error("No preview to hand off.");
      return;
    }
    setHandOff({ loading: true, ok: false });
    try {
      const r = await callBridge({
        action: "handoff",
        trend: { title: trend.title, niche: trend.niche, region: trend.country },
        pageUrl: create.pageUrl,
        mp4Url: mp4.mp4Url,
        caption: create.caption,
        platforms: ["x", "tiktok", "instagram"],
        approvedBy: "human",
      });
      setHandOff({
        loading: false,
        ok: r.ok ?? false,
        agent37Id: r.agent37Id,
        status: r.status,
        warning: r.warning,
        source: r.source,
      });
      if (r.ok) {
        toast.success(`Handed off to Agent 37 — ${r.status ?? "recorded"}.`);
      } else if (r.warning) {
        toast.error(r.warning);
      }
    } catch (e) {
      setHandOff({ loading: false, ok: false, warning: e instanceof Error ? e.message : "Handoff failed" });
      toast.error("Handoff failed.");
    }
  }

  const pnrConfigured = status?.pnr?.configured ?? false;
  const agent37Configured = status?.agent37?.configured ?? false;
  const agent37Mode = status?.agent37?.mode ?? "not_configured";

  return (
    <div className="space-y-4">
      {/* Config status + cost disclosure */}
      <div className="pr-card-grad pr-border-grad rounded-xl p-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--pr-text-mute)] mb-3">
          <Rocket className="h-3.5 w-3.5 text-[var(--pr-gold)]" />
          Viral Trend Bridge — Agent 37 + Plunder & Riffle
        </div>
        <p className="text-xs text-[var(--pr-text-dim)] mb-3">
          Real pipeline that calls the P&R MCP (memes, hot takes, Jobless Joe news videos) and
          hands approved posts to Agent 37 for scheduling. Stops at preview until you approve.
        </p>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <ConfigPill
            label="P&R MCP"
            configured={pnrConfigured}
            sub={pnrConfigured ? "ready" : "PNR_MCP_KEY missing"}
          />
          <ConfigPill
            label="Agent 37"
            configured={agent37Configured}
            sub={agent37Configured ? agent37Mode : "AGENT37_KEY missing"}
          />
        </div>

        <div className="rounded-lg border border-[var(--pr-gold)]/15 bg-[var(--pr-gold)]/[0.04] p-2.5 text-[11px] text-[var(--pr-gold)]/90">
          <div className="flex items-start gap-2">
            <DollarSign className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div>
              <strong>Cost disclosure:</strong> $0.01/MCP call on BYOK (first 100/month free).
              MP4 is $0.01 with own worker / full BYOK, else $0.25. Failed calls are refunded.
              A 5-trend verify+create run ≈ 10 calls ≈ $0.10.
              <code className="text-[var(--pr-gold)]">research_brand</code> and{" "}
              <code className="text-[var(--pr-gold)]">get_job_status</code> are free.
            </div>
          </div>
        </div>
      </div>

      {!pnrConfigured && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4 text-xs text-amber-200/90">
          <AlertTriangle className="h-4 w-4 inline mr-2" />
          <code className="text-amber-300">PNR_MCP_KEY</code> is not configured server-side. The bridge
          cannot run without it. Set it in your environment and restart the dev server.
        </div>
      )}

      {/* Step 1: verify */}
      <StepCard
        n={1}
        title="Verify against live sources"
        icon={<ShieldCheck className="h-4 w-4 text-[var(--pr-electric)]" />}
        description="Calls P&R create_news. Doubles as a fact check — if no live source answers, the trend is marked unverified and skipped."
        disabled={!pnrConfigured}
        actionLabel="Verify"
        actionLoading={verify.loading}
        onAction={handleVerify}
      >
        {verify.warning && <WarnBlock text={verify.warning} />}
        {verify.ok && !verify.unverified && (
          <ResultBlock tone="emerald" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
            Verified. {verify.sources && verify.sources.length > 0 && (
              <>
                {verify.sources.length} source{verify.sources.length === 1 ? "" : "s"} —
                credit them in the caption.
              </>
            )}
            {verify.caption && (
              <div className="mt-2 text-[11px] italic text-foreground/80">“{verify.caption.slice(0, 200)}…”</div>
            )}
          </ResultBlock>
        )}
        {verify.unverified && (
          <ResultBlock tone="amber" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
            Unverified — no live source answered. The trend may not be real, or sources are
            paywalled. The create step is disabled until this is verified.
          </ResultBlock>
        )}
      </StepCard>

      {/* Step 2: create preview */}
      <StepCard
        n={2}
        title="Create preview creative"
        icon={<Sparkles className="h-4 w-4 text-[var(--pr-gold)]" />}
        description="Calls P&R generate_ad_creative. Returns a temporary pageUrl, NOT a video. Pick a format that matches the trend's emotion."
        disabled={!pnrConfigured || !verify.ok || verify.unverified}
        actionLabel="Create preview"
        actionLoading={create.loading}
        onAction={handleCreate}
      >
        <div className="mb-3 grid grid-cols-2 gap-1.5">
          {FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFormat(opt.value)}
              className={cn(
                "text-left p-2 rounded-lg border text-xs transition-all",
                format === opt.value
                  ? "border-[var(--pr-electric)]/40 bg-[var(--pr-electric)]/10 text-[var(--pr-electric)] pr-glow"
                  : "border-white/[0.06] bg-white/[0.02] text-foreground/80 hover:bg-white/[0.04]",
              )}
            >
              <div className="font-semibold">{opt.label}</div>
              <div className="text-[10px] text-[var(--pr-text-mute)] mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>
        {create.warning && <WarnBlock text={create.warning} />}
        {create.ok && create.pageUrl && (
          <ResultBlock tone="emerald" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
            <div className="mb-1">Preview created:</div>
            <a
              href={create.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-[var(--pr-electric)] hover:underline break-all"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              {create.pageUrl}
            </a>
            {create.caption && (
              <div className="mt-2 text-[11px] italic text-foreground/80">
                “{create.caption.slice(0, 200)}…”
              </div>
            )}
            {create.sources && create.sources.length > 0 && (
              <div className="mt-2 text-[10px] text-[var(--pr-text-mute)]">
                Credit: {create.sources.map((s) => s.url).join(", ")}
              </div>
            )}
          </ResultBlock>
        )}
      </StepCard>

      {/* Step 3: approval gate */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
            approved ? "bg-emerald-500/15 text-emerald-300" : "bg-white/[0.04] text-[var(--pr-text-mute)]",
          )}>
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold mb-1">Human approval gate</div>
            <p className="text-[11px] text-[var(--pr-text-dim)] mb-3">
              The bridge will not request MP4 or hand off to Agent 37 until you approve the preview
              above. Open the pageUrl, review the post copy and sources, then check the box.
            </p>
            <label className="inline-flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={approved}
                onChange={(e) => setApproved(e.target.checked)}
                disabled={!create.ok}
                className="h-4 w-4 rounded border-white/20 bg-white/5 accent-[var(--pr-electric)] disabled:opacity-40"
              />
              <span className={cn(!create.ok && "text-[var(--pr-text-mute)]")}>
                I approve this preview for MP4 render and Agent 37 handoff
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Step 4: request MP4 */}
      <StepCard
        n={4}
        title="Request MP4"
        icon={<Video className="h-4 w-4 text-violet-300" />}
        description="Calls P&R request_mp4. $0.01 with your own render worker / full BYOK, else $0.25. Polls the job until terminal."
        disabled={!approved || !create.ok}
        actionLabel="Render MP4"
        actionLoading={mp4.loading}
        onAction={handleRequestMp4}
      >
        {mp4.warning && <WarnBlock text={mp4.warning} />}
        {mp4.ok && mp4.mp4Url && (
          <ResultBlock tone="emerald" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
            MP4 rendered:{" "}
            <a href={mp4.mp4Url} target="_blank" rel="noopener noreferrer" className="text-[var(--pr-electric)] hover:underline break-all">
              {mp4.mp4Url}
            </a>
          </ResultBlock>
        )}
      </StepCard>

      {/* Step 5: hand off to Agent 37 */}
      <StepCard
        n={5}
        title="Hand off to Agent 37"
        icon={<Send className="h-4 w-4 text-emerald-300" />}
        description={agent37Configured
          ? `Sends the approved post to Agent 37 (${agent37Mode}) for scheduling. Agent 37 does not publish without its own approval step.`
          : "Agent 37 not configured. The bridge will record the handoff locally but won't schedule. Set AGENT37_KEY (or AGENT37_URL for a custom contract)."}
        disabled={!approved || !create.ok}
        actionLabel="Hand off"
        actionLoading={handOff.loading}
        onAction={handleHandOff}
      >
        {handOff.warning && <WarnBlock text={handOff.warning} />}
        {handOff.ok && (
          <ResultBlock tone="emerald" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
            Handed off to Agent 37{handOff.agent37Id ? ` — id ${handOff.agent37Id}` : ""} — {handOff.status ?? "recorded"}.
          </ResultBlock>
        )}
      </StepCard>
    </div>
  );
}

function ConfigPill({ label, configured, sub }: { label: string; configured: boolean; sub: string }) {
  return (
    <div className={cn(
      "rounded-lg border p-2.5",
      configured ? "border-emerald-500/20 bg-emerald-500/[0.04]" : "border-amber-500/20 bg-amber-500/[0.04]",
    )}>
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        <span className={cn("h-1.5 w-1.5 rounded-full", configured ? "bg-emerald-400" : "bg-amber-400")} />
        {label}
      </div>
      <div className={cn("text-[10px] mt-0.5", configured ? "text-emerald-300/80" : "text-amber-300/80")}>
        {sub}
      </div>
    </div>
  );
}

function StepCard({
  n,
  title,
  icon,
  description,
  actionLabel,
  actionLoading,
  onAction,
  disabled,
  children,
}: {
  n: number;
  title: string;
  icon: React.ReactNode;
  description: string;
  actionLabel: string;
  actionLoading: boolean;
  onAction: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(n * 0.04, 0.2) }}
      className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
    >
      <div className="flex items-start gap-3 mb-2">
        <div className="h-8 w-8 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-[var(--pr-text-mute)] text-xs">Step {n}</span>
            {title}
          </div>
          <p className="text-[11px] text-[var(--pr-text-dim)] mt-0.5">{description}</p>
        </div>
      </div>
      <div className="mb-3">{children}</div>
      <button
        onClick={onAction}
        disabled={disabled || actionLoading}
        className={cn(
          "inline-flex items-center gap-1.5 text-sm px-3.5 py-1.5 rounded-md transition-all",
          disabled
            ? "bg-white/[0.03] text-[var(--pr-text-mute)] border border-white/[0.06] cursor-not-allowed"
            : "bg-[var(--pr-electric)] text-[#03121a] pr-glow hover:bg-[var(--pr-electric)]/90",
        )}
      >
        {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
        {actionLabel}
      </button>
    </motion.div>
  );
}

function WarnBlock({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-amber-500/15 bg-amber-500/[0.04] p-2 text-[11px] text-amber-200/90 mb-2">
      <AlertTriangle className="h-3 w-3 inline mr-1" />
      {text}
    </div>
  );
}

function ResultBlock({
  tone,
  icon,
  children,
}: {
  tone: "emerald" | "amber";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const cls = tone === "emerald"
    ? "border-emerald-500/20 bg-emerald-500/[0.04] text-emerald-100"
    : "border-amber-500/20 bg-amber-500/[0.04] text-amber-100";
  return (
    <div className={cn("rounded-lg border p-2.5 text-xs", cls)}>
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0">{icon}</div>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
