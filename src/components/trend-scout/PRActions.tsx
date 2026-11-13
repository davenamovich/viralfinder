"use client";

import { useState } from "react";
import type {
  ContentBrief,
  PRRoutingPayload,
  SourceVideo,
  TrendOpportunity,
} from "@/lib/trend-scout/types";
import { useScoutStore } from "@/lib/trend-scout/store";
import { toast } from "sonner";
import {
  ClipboardCopy,
  ExternalLink,
  Loader2,
  Rocket,
  Send,
  Sparkles,
  Tv,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  trend: TrendOpportunity;
  brief: ContentBrief | null;
  briefLoading: boolean;
  selectedSource: SourceVideo | null;
  selectedLanguages: string[];
  onClearSource?: () => void;
}

export function PRActions({
  trend,
  brief,
  briefLoading,
  selectedSource,
  selectedLanguages,
  onClearSource,
}: Props) {
  const [busy, setBusy] = useState<null | "create_original" | "send_to_clip" | "rebuild_for_world" | "create_preview">(null);
  const [payload, setPayload] = useState<PRRoutingPayload | null>(null);
  const openRightsConfirm = useScoutStore((s) => s.openRightsConfirm);

  async function callAction(action: typeof busy, body: Record<string, unknown>) {
    setBusy(action);
    setPayload(null);
    try {
      const res = await fetch("/api/trend-scout/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, trend, ...body }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { ok: boolean; payload?: PRRoutingPayload; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Action failed");
      setPayload(json.payload ?? null);
      toast.success(actionLabel(action) + " — routing payload ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="pr-card-grad pr-border-grad rounded-xl p-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--pr-text-mute)] mb-2">
          <Rocket className="h-3.5 w-3.5 text-[var(--pr-gold)]" />
          Send into the existing P&amp;R flows
        </div>
        <p className="text-xs text-[var(--pr-text-dim)] mb-3">
          These actions do not build a new video renderer — they send the trend, brief, source URL,
          and target languages into the existing P&amp;R Thought Engine / Telegram <code className="text-[var(--pr-electric)]">/clip</code> and <code className="text-[var(--pr-electric)]">/rebuild</code> flows.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <ActionButton
            tone="electric"
            icon={busy === "create_original" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            label="Create Original Version"
            sub="Sends brief → P&R Telegram /create flow"
            disabled={briefLoading || !brief}
            onClick={() => brief && callAction("create_original", { brief })}
          />
          <ActionButton
            tone="gold"
            icon={busy === "send_to_clip" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            label="Send Link to /clip"
            sub={selectedSource ? `Source: ${selectedSource.channel}` : "Pick a source video first"}
            disabled={!selectedSource}
            onClick={() => {
              if (!selectedSource) return;
              if (selectedSource.rightsStatus === "rights_unverified") {
                openRightsConfirm(selectedSource.id, () => {
                  callAction("send_to_clip", { sourceUrl: selectedSource.url });
                });
                return;
              }
              callAction("send_to_clip", { sourceUrl: selectedSource.url });
            }}
          />
          <ActionButton
            tone="violet"
            icon={busy === "rebuild_for_world" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            label="Rebuild for the World"
            sub={`${selectedLanguages.length} language(s) selected`}
            disabled={!selectedSource || selectedLanguages.length === 0 || !brief}
            onClick={() => {
              if (!selectedSource || selectedLanguages.length === 0 || !brief) return;
              if (selectedSource.rightsStatus === "rights_unverified") {
                openRightsConfirm(selectedSource.id, () => {
                  callAction("rebuild_for_world", {
                    sourceUrl: selectedSource.url,
                    targetLanguages: selectedLanguages,
                    format: brief.bestFormat,
                    brief,
                  });
                });
                return;
              }
              callAction("rebuild_for_world", {
                sourceUrl: selectedSource.url,
                targetLanguages: selectedLanguages,
                format: brief.bestFormat,
                brief,
              });
            }}
          />
          <ActionButton
            tone="emerald"
            icon={busy === "create_preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tv className="h-4 w-4" />}
            label="Create here.now Preview"
            sub="Existing render pipeline + /market unlock"
            disabled={briefLoading || !brief}
            onClick={() => brief && callAction("create_preview", { brief })}
          />
        </div>

        {selectedSource && (
          <div className="mt-3 rounded-lg bg-white/[0.02] border border-white/[0.04] p-2 flex items-center gap-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--pr-text-mute)] shrink-0">
              Selected source:
            </div>
            <div className="text-[11px] text-foreground/85 truncate flex-1">
              {selectedSource.title}
            </div>
            <button
              onClick={onClearSource}
              className="text-[10px] text-[var(--pr-text-mute)] hover:text-foreground transition-colors"
            >
              clear
            </button>
          </div>
        )}
      </div>

      {payload && <RoutingPayloadView payload={payload} />}
    </div>
  );
}

function ActionButton({
  tone,
  icon,
  label,
  sub,
  disabled,
  onClick,
}: {
  tone: "electric" | "gold" | "violet" | "emerald";
  icon: React.ReactNode;
  label: string;
  sub: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const tones: Record<typeof tone, string> = {
    electric: "from-[var(--pr-electric)]/15 to-[var(--pr-electric)]/5 border-[var(--pr-electric)]/30 text-[var(--pr-electric)] hover:from-[var(--pr-electric)]/25 hover:to-[var(--pr-electric)]/10",
    gold: "from-[var(--pr-gold)]/15 to-[var(--pr-gold)]/5 border-[var(--pr-gold)]/30 text-[var(--pr-gold)] hover:from-[var(--pr-gold)]/25 hover:to-[var(--pr-gold)]/10",
    violet: "from-violet-500/15 to-violet-500/5 border-violet-500/30 text-violet-300 hover:from-violet-500/25 hover:to-violet-500/10",
    emerald: "from-emerald-500/15 to-emerald-500/5 border-emerald-500/30 text-emerald-300 hover:from-emerald-500/25 hover:to-emerald-500/10",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex items-start gap-3 p-3 rounded-lg border bg-gradient-to-br text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed",
        tones[tone],
      )}
    >
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-[11px] text-[var(--pr-text-dim)] truncate">{sub}</div>
      </div>
    </button>
  );
}

function RoutingPayloadView({ payload }: { payload: PRRoutingPayload }) {
  const command = payload.botCommand
    ? buildCommandPreview(payload)
    : undefined;

  return (
    <div
      className={`rounded-xl border p-4 ${
        payload.status === "missing_key"
          ? "border-amber-500/25 bg-amber-500/[0.04]"
          : "border-emerald-500/25 bg-emerald-500/[0.04]"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
            payload.status === "missing_key"
              ? "bg-amber-500/15 text-amber-300"
              : "bg-emerald-500/15 text-emerald-300"
          }`}
        >
          <Rocket className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold">
              {payload.status === "missing_key" ? "Action ready — manual step required" : "Action queued"}
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full ${
                payload.status === "missing_key"
                  ? "bg-amber-500/15 text-amber-300"
                  : "bg-emerald-500/15 text-emerald-300"
              }`}
            >
              {payload.status}
            </span>
          </div>
          <p className="text-xs text-foreground/85 mb-3">{payload.message}</p>

          {payload.previewUrl && (
            <a
              href={payload.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-[var(--pr-electric)] hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> {payload.previewUrl}
            </a>
          )}

          {command && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--pr-text-mute)]">
                  Prefilled bot command
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(command);
                    toast.success("Copied command to clipboard");
                  }}
                  className="inline-flex items-center gap-1 text-[10px] text-[var(--pr-electric)] hover:underline"
                >
                  <ClipboardCopy className="h-3 w-3" /> Copy
                </button>
              </div>
              <pre className="rounded-lg bg-black/50 border border-white/[0.06] p-3 text-[11px] text-foreground/85 overflow-x-auto whitespace-pre-wrap font-mono max-h-48 pr-scrollbar">
                {command}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function actionLabel(a: typeof busy): string {
  switch (a) {
    case "create_original":
      return "Create Original Version";
    case "send_to_clip":
      return "Send to /clip";
    case "rebuild_for_world":
      return "Rebuild for the World";
    case "create_preview":
      return "Create here.now Preview";
    default:
      return "Action";
  }
}

function buildCommandPreview(p: PRRoutingPayload): string {
  const lines: string[] = [];
  if (p.botCommand) lines.push(p.botCommand);
  if (p.sourceUrl) lines.push(`source: ${p.sourceUrl}`);
  if (p.trendTitle) lines.push(`trend: ${p.trendTitle}`);
  if (p.format) lines.push(`format: ${p.format}`);
  if (p.targetLanguages && p.targetLanguages.length) lines.push(`languages: ${p.targetLanguages.join(", ")}`);
  if (p.brief?.hook) lines.push(`hook: ${p.brief.hook}`);
  if (p.brief?.contrarianOrUsefulAngle) lines.push(`angle: ${p.brief.contrarianOrUsefulAngle}`);
  if (p.brief?.audience) lines.push(`audience: ${p.brief.audience}`);
  if (p.brief?.suggestedLanguages?.length) lines.push(`suggested_languages: ${p.brief.suggestedLanguages.join(", ")}`);
  return lines.join("\n");
}
