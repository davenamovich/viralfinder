"use client";

import { useEffect, useState, useRef } from "react";
import type { TrendOpportunity } from "@/lib/trend-scout/types";
import { useBridgeKeys, isBridgeUnlocked } from "@/lib/trend-scout/use-bridge-keys";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  Key,
  Loader2,
  Lock,
  Rocket,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  trend: TrendOpportunity;
  /** Optional preselected UI format label (set when the user clicks a one-click button on the trend card) */
  initialUiFormat?: string;
  /** When true, auto-run Verify then Create with the preselected format on mount */
  autoRun?: boolean;
}

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
  uiFormat?: string;
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

/**
 * UI formats — the user-facing labels the one-click buttons use.
 * Mapped to MCP canonical formats + brief flavors by the API route via `resolveFormat()`.
 */
const UI_FORMATS = [
  { label: "Hot Take", icon: "🔥", desc: "Opinion — outrage, identity, contrarian" },
  { label: "Carousel", icon: "📊", desc: "Explainer — curiosity, useful takeaways" },
  { label: "iMessage", icon: "💬", desc: "iMessage thread — aspiration, story" },
  { label: "Hybrid", icon: "🔀", desc: "Mixed-format — when one format isn't enough" },
  { label: "Meme", icon: "😎", desc: "Single meme image — humor" },
  { label: "Roast", icon: "🔥", desc: "Pointed, humorous takedown — punch up, not down" },
] as const;

export function BridgePanel({ trend, initialUiFormat, autoRun }: Props) {
  const { keys, save, clear, loaded } = useBridgeKeys();
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [uiFormat, setUiFormat] = useState<string>(initialUiFormat ?? "Hot Take");
  const [verify, setVerify] = useState<VerifyState>({ loading: false, ok: false, unverified: false });
  const [create, setCreate] = useState<CreateState>({ loading: false, ok: false });
  const [mp4, setMp4] = useState<Mp4State>({ loading: false, ok: false });
  const [handOff, setHandOff] = useState<HandOffState>({ loading: false, ok: false });
  const [approved, setApproved] = useState(false);
  // Settings dialog — defaults to OPEN when the bridge isn't unlocked,
  // so the user is prompted to paste keys on first visit. We avoid a
  // setState-in-effect by initializing from the BYOK keys (which are
  // available synchronously from localStorage). The server's env-var
  // status loads later, but if the server has a key the dialog close
  // still works correctly because pnrUnlocked will flip to true.
  const [settingsOpen, setSettingsOpen] = useState(() => !isBridgeUnlocked(keys));
  const autoRunStarted = useRef(false);
  // Refs to the latest runVerify/runCreate so the auto-run effect can call
  // them without re-firing on every render.
  const runVerifyRef = useRef<() => Promise<void>>(async () => {});
  const runCreateRef = useRef<(format: string) => Promise<void>>(async () => {});

  // Compute effective config: BYOK overrides take precedence over server env vars.
  // `unlocked` is true if the user has pasted a P&R key OR the server has one.
  const pnrUnlocked = !!(keys.pnrKey || status?.pnr?.configured);
  const agent37Unlocked = !!(keys.agent37Key || status?.agent37?.configured);

  // Fetch bridge config status on mount (server-side env var presence)
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

  // Auto-run Verify → Create when user clicked a one-click button.
  // We deliberately only re-run when autoRun or pnrUnlocked flips so we
  // don't re-fire on every render — the autoRunStarted ref guards against
  // double-runs in StrictMode.
  useEffect(() => {
    if (!autoRun || autoRunStarted.current) return;
    if (!pnrUnlocked) return; // wait until keys are available
    autoRunStarted.current = true;
    void (async () => {
      await runVerifyRef.current();
      await runCreateRef.current(uiFormat);
    })();
  }, [autoRun, pnrUnlocked, uiFormat]);

  async function callBridge(payload: Record<string, unknown>) {
    const res = await fetch("/api/bridge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        // Attach BYOK keys so the server uses them (overrides process.env)
        ...(keys.pnrKey ? { pnrKey: keys.pnrKey } : {}),
        ...(keys.agent37Key ? { agent37Key: keys.agent37Key } : {}),
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function runVerify() {
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
        toast.error("Trend unverified — no live sources answered.");
      } else if (r.warning) {
        toast.error(r.warning);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Verify failed";
      setVerify({ loading: false, ok: false, unverified: false, warning: msg });
      toast.error("Verify call failed.");
    }
  }

  async function runCreate(formatLabel: string) {
    setCreate({ loading: true, ok: false });
    try {
      const r = await callBridge({
        action: "create",
        trend: { title: trend.title, niche: trend.niche, region: trend.country },
        uiFormat: formatLabel,
      });
      setCreate({
        loading: false,
        ok: r.ok ?? false,
        pageUrl: r.pageUrl,
        caption: r.caption,
        sources: r.sources,
        uiFormat: formatLabel,
        warning: r.warning,
      });
      if (r.ok && r.pageUrl) {
        toast.success(`${formatLabel} preview created — review before approving.`);
      } else if (r.warning) {
        toast.error(r.warning);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Create failed";
      setCreate({ loading: false, ok: false, warning: msg });
      toast.error("Create call failed.");
    }
  }

  // Keep refs in sync so the auto-run effect can call the latest versions
  useEffect(() => {
    runVerifyRef.current = runVerify;
    runCreateRef.current = runCreate;
  });

  async function runRequestMp4() {
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
      const msg = e instanceof Error ? e.message : "MP4 failed";
      setMp4({ loading: false, ok: false, warning: msg });
      toast.error("MP4 render failed.");
    }
  }

  async function runHandOff() {
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
      const msg = e instanceof Error ? e.message : "Handoff failed";
      setHandOff({ loading: false, ok: false, warning: msg });
      toast.error("Handoff failed.");
    }
  }

  const agent37Mode = status?.agent37?.mode ?? "not_configured";
  const showLockedScreen = loaded && !pnrUnlocked && !settingsOpen;

  return (
    <div className="space-y-4">
      {/* Config status + cost disclosure + Settings button */}
      <div className="pr-card-grad pr-border-grad rounded-xl p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--pr-text-mute)]">
            <Rocket className="h-3.5 w-3.5 text-[var(--pr-gold)]" />
            Viral Trend Bridge — Agent 37 + Plunder & Riffle
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-colors"
          >
            <Settings className="h-3 w-3" />
            Settings
          </button>
        </div>
        <p className="text-xs text-[var(--pr-text-dim)] mb-3">
          Real pipeline that calls the P&R MCP (memes, hot takes, Jobless Joe news videos) and
          hands approved posts to Agent 37 for scheduling. Stops at preview until you approve.
        </p>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <ConfigPill
            label="P&R MCP"
            configured={pnrUnlocked}
            sub={pnrUnlocked
              ? (keys.pnrKey ? "BYOK key" : "server env var")
              : "click Settings to unlock"}
          />
          <ConfigPill
            label="Agent 37"
            configured={agent37Unlocked}
            sub={agent37Unlocked
              ? (keys.agent37Key ? `BYOK · ${agent37Mode}` : `${agent37Mode}`)
              : "optional — for scheduling"}
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

      {/* Locked screen — P&R key not set */}
      {showLockedScreen && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-6 text-center">
          <div className="inline-flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full mb-3">
            <Lock className="h-3.5 w-3.5" />
            Bridge engine locked
          </div>
          <h3 className="text-sm font-semibold mb-2">Paste your P&R key to unlock</h3>
          <p className="text-xs text-[var(--pr-text-dim)] max-w-md mx-auto mb-4">
            The Viral Trend Bridge needs a Plunder & Riffle API key to verify trends against live
            sources and create preview creatives. Paste your key in Settings — it's stored in
            your browser only (never sent anywhere except to make the bridge call), and never
            logged server-side. BYOK = Bring Your Own Key.
          </p>
          <button
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-1.5 text-sm px-3.5 py-2 rounded-md bg-[var(--pr-gold)] text-[#1a0e00] pr-glow-gold hover:bg-[var(--pr-gold)]/90 transition-colors"
          >
            <Key className="h-3.5 w-3.5" />
            Open Settings
          </button>
        </div>
      )}

      {/* Step 1: verify */}
      <StepCard
        n={1}
        title="Verify against live sources"
        icon={<ShieldCheck className="h-4 w-4 text-[var(--pr-electric)]" />}
        description="Calls P&R create_news. Doubles as a fact check — if no live source answers, the trend is marked unverified and skipped."
        disabled={!pnrUnlocked}
        actionLabel="Verify"
        actionLoading={verify.loading}
        onAction={runVerify}
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

      {/* Step 2: create preview — with the new UI format picker */}
      <StepCard
        n={2}
        title="Create preview creative"
        icon={<Sparkles className="h-4 w-4 text-[var(--pr-gold)]" />}
        description="Calls P&R generate_ad_creative. Returns a temporary pageUrl, NOT a video. Pick a format that matches the trend's emotion."
        disabled={!pnrUnlocked || !verify.ok || verify.unverified}
        actionLabel={`Create ${uiFormat}`}
        actionLoading={create.loading}
        onAction={() => runCreate(uiFormat)}
      >
        <div className="mb-3 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {UI_FORMATS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => setUiFormat(opt.label)}
              className={cn(
                "text-left p-2 rounded-lg border text-xs transition-all",
                uiFormat === opt.label
                  ? "border-[var(--pr-electric)]/40 bg-[var(--pr-electric)]/10 text-[var(--pr-electric)] pr-glow"
                  : "border-white/[0.06] bg-white/[0.02] text-foreground/80 hover:bg-white/[0.04]",
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{opt.icon}</span>
                <span className="font-semibold">{opt.label}</span>
              </div>
              <div className="text-[10px] text-[var(--pr-text-mute)] mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>
        {create.warning && <WarnBlock text={create.warning} />}
        {create.ok && create.pageUrl && (
          <ResultBlock tone="emerald" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
            <div className="mb-1">{create.uiFormat} preview created:</div>
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
        onAction={runRequestMp4}
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
        description={agent37Unlocked
          ? `Sends the approved post to Agent 37 (${agent37Mode}) for scheduling. Agent 37 does not publish without its own approval step.`
          : "Agent 37 not configured. The bridge will record the handoff locally but won't schedule. Open Settings to paste an Agent 37 key."}
        disabled={!approved || !create.ok}
        actionLabel="Hand off"
        actionLoading={handOff.loading}
        onAction={runHandOff}
      >
        {handOff.warning && <WarnBlock text={handOff.warning} />}
        {handOff.ok && (
          <ResultBlock tone="emerald" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
            Handed off to Agent 37{handOff.agent37Id ? ` — id ${handOff.agent37Id}` : ""} — {handOff.status ?? "recorded"}.
          </ResultBlock>
        )}
      </StepCard>

      {/* Settings dialog */}
      {settingsOpen && (
        <SettingsDialog
          keys={keys}
          onSave={save}
          onClear={clear}
          onClose={() => setSettingsOpen(false)}
          pnrServerConfigured={status?.pnr?.configured ?? false}
          agent37ServerConfigured={status?.agent37?.configured ?? false}
        />
      )}
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

interface SettingsDialogProps {
  keys: { pnrKey: string; agent37Key: string };
  onSave: (next: Partial<{ pnrKey: string; agent37Key: string }>) => void;
  onClear: () => void;
  onClose: () => void;
  pnrServerConfigured: boolean;
  agent37ServerConfigured: boolean;
}

function SettingsDialog({
  keys,
  onSave,
  onClear,
  onClose,
  pnrServerConfigured,
  agent37ServerConfigured,
}: SettingsDialogProps) {
  const [pnrKey, setPnrKey] = useState(keys.pnrKey);
  const [agent37Key, setAgent37Key] = useState(keys.agent37Key);
  const [showPnr, setShowPnr] = useState(false);
  const [showAgent37, setShowAgent37] = useState(false);

  function handleSave() {
    onSave({ pnrKey: pnrKey.trim(), agent37Key: agent37Key.trim() });
    toast.success("Keys saved — bridge engine unlocked.");
    onClose();
  }

  function handleClear() {
    onClear();
    setPnrKey("");
    setAgent37Key("");
    toast.success("Keys cleared from browser.");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md pr-card-grad pr-border-grad rounded-2xl p-5 max-h-[90vh] overflow-y-auto pr-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-[var(--pr-gold)]/10 flex items-center justify-center">
              <Key className="h-4 w-4 text-[var(--pr-gold)]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Bridge Settings — BYOK</h3>
              <p className="text-[10px] text-[var(--pr-text-mute)] uppercase tracking-[0.18em]">
                Bring Your Own Key
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--pr-text-mute)] hover:text-foreground transition-colors text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <p className="text-[11px] text-[var(--pr-text-dim)] mb-4 leading-relaxed">
          Paste your Plunder & Riffle API key and (optional) Agent 37 key. Keys are stored in
          your browser's localStorage only — never in cookies, never in NEXT_PUBLIC_* env vars.
          They are sent in the POST body to <code className="text-[var(--pr-electric)]">/api/bridge</code>{" "}
          so the server uses them for the actual MCP call, and never logged server-side. Clear
          your browser data to remove them.
        </p>

        <div className="space-y-4">
          {/* P&R key */}
          <div>
            <label className="text-xs font-semibold mb-1 block">
              Plunder & Riffle API key
              {pnrServerConfigured && !keys.pnrKey && (
                <span className="ml-2 text-[10px] text-emerald-300/80 font-normal">
                  (server env var already set — leave blank to use that)
                </span>
              )}
            </label>
            <div className="relative">
              <input
                type={showPnr ? "text" : "password"}
                value={pnrKey}
                onChange={(e) => setPnrKey(e.target.value)}
                placeholder="paste your P&R API key here"
                className="w-full bg-background/60 border border-white/[0.08] rounded-md px-3 py-2 text-sm font-mono pr-10 focus:outline-none focus:border-[var(--pr-electric)]"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                onClick={() => setShowPnr(!showPnr)}
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--pr-text-mute)] hover:text-foreground"
              >
                {showPnr ? "hide" : "show"}
              </button>
            </div>
            <p className="text-[10px] text-[var(--pr-text-mute)] mt-1">
              Get your key from{" "}
              <a href="https://www.plunderandriffle.com" target="_blank" rel="noopener noreferrer" className="text-[var(--pr-electric)] hover:underline">
                 www.plunderandriffle.com
              </a>{" "}
              — required for verify + create + mp4.
            </p>
          </div>

          {/* Agent 37 key */}
          <div>
            <label className="text-xs font-semibold mb-1 block">
              Agent 37 API key <span className="font-normal text-[var(--pr-text-mute)]">(optional)</span>
              {agent37ServerConfigured && !keys.agent37Key && (
                <span className="ml-2 text-[10px] text-emerald-300/80 font-normal">
                  (server env var already set)
                </span>
              )}
            </label>
            <div className="relative">
              <input
                type={showAgent37 ? "text" : "password"}
                value={agent37Key}
                onChange={(e) => setAgent37Key(e.target.value)}
                placeholder="sk_live_... (optional — only needed for scheduling)"
                className="w-full bg-background/60 border border-white/[0.08] rounded-md px-3 py-2 text-sm font-mono pr-10 focus:outline-none focus:border-[var(--pr-electric)]"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                onClick={() => setShowAgent37(!showAgent37)}
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--pr-text-mute)] hover:text-foreground"
              >
                {showAgent37 ? "hide" : "show"}
              </button>
            </div>
            <p className="text-[10px] text-[var(--pr-text-mute)] mt-1">
              Get your key from{" "}
              <a href="https://www.agent37.com/dashboard/cloud/api-keys" target="_blank" rel="noopener noreferrer" className="text-[var(--pr-electric)] hover:underline">
                agent37.com/dashboard/cloud/api-keys
              </a>{" "}
              — only needed for the final hand-off-to-schedule step.
            </p>
          </div>

          {/* Cost reminder */}
          <div className="rounded-lg border border-[var(--pr-gold)]/15 bg-[var(--pr-gold)]/[0.04] p-2.5 text-[11px] text-[var(--pr-gold)]/90">
            <DollarSign className="h-3 w-3 inline mr-1" />
            <strong>Costs:</strong> $0.01/MCP call on BYOK (first 100/month free). MP4 is $0.01
            with own worker / full BYOK, else $0.25. Failed calls are refunded.
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 text-sm px-3.5 py-2 rounded-md bg-[var(--pr-electric)] text-[#03121a] pr-glow hover:bg-[var(--pr-electric)]/90 transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Save keys
            </button>
            <button
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-md bg-white/[0.04] border border-white/[0.08] text-foreground/80 hover:bg-white/[0.08] transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              Clear keys
            </button>
            <button
              onClick={onClose}
              className="ml-auto text-xs text-[var(--pr-text-mute)] hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
