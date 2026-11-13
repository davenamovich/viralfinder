"use client";

import { useScoutStore } from "@/lib/trend-scout/store";
import type { TrendOpportunity } from "@/lib/trend-scout/types";
import {
  Flame,
  TrendingUp,
  Activity,
  Lock,
  Eye,
  Share2,
  ChevronRight,
  Bookmark,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { toast } from "sonner";

interface Props {
  trend: TrendOpportunity;
  index?: number;
}

/**
 * One-click format buttons on the trend card.
 * Maps UI labels to the bridge's `uiFormat` (resolved to MCP format + brief flavor server-side).
 * "Meme" → image, "iMessage" → hybrid, "Hybrid" → hybrid, "Roast" → hottake with roast brief.
 */
const ONE_CLICK_FORMATS: { label: string; icon: string; desc: string; tone: "electric" | "gold" | "emerald" | "violet" }[] = [
  { label: "Meme", icon: "😎", desc: "Single meme image — humor", tone: "gold" },
  { label: "iMessage", icon: "💬", desc: "iMessage thread — story", tone: "emerald" },
  { label: "Hybrid", icon: "🔀", desc: "Mixed-format — when one isn't enough", tone: "violet" },
  { label: "Roast", icon: "🔥", desc: "Pointed, humorous takedown — punch up", tone: "gold" },
];

export function TrendOpportunityCard({ trend, index = 0 }: Props) {
  const selectTrend = useScoutStore((s) => s.selectTrend);
  const setOneClickBridge = useScoutStore((s) => s.setOneClickBridge);
  const setDetailTab = useScoutStore((s) => s.setDetailTab);
  const direction = directionMeta(trend.direction);
  const emotion = emotionMeta(trend.audienceEmotion);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: Math.min(index * 0.04, 0.32) }}
      className="pr-card-grad pr-border-grad rounded-xl overflow-hidden"
      onClick={() => selectTrend(trend.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectTrend(trend.id);
        }
      }}
    >
      <div className="p-4 sm:p-5 cursor-pointer group">
        {/* Top row: direction + score */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              icon={direction.icon}
              label={direction.label}
              className={direction.className}
            />
            <Badge
              icon={<span className="text-[10px] font-bold leading-none">{emotion.glyph}</span>}
              label={trend.audienceEmotion}
              className={emotion.className}
            />
            <Badge
              icon={<Flame className="h-3 w-3" />}
              label={`Score ${trend.score.total}`}
              className="bg-[var(--pr-gold)]/10 text-[var(--pr-gold)] border-[var(--pr-gold)]/20"
            />
            {trend.estimated && (
              <Badge
                label="Estimated"
                className="bg-white/[0.03] text-[var(--pr-text-mute)] border-white/10"
              />
            )}
          </div>
          <div className="shrink-0">
            <ScoreRing score={trend.score.total} />
          </div>
        </div>

        {/* Title */}
        <h3 className="text-lg sm:text-xl font-semibold leading-tight mb-1.5">
          {trend.title}
        </h3>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--pr-text-mute)] mb-3">
          {trend.countryLabel} · {trend.languageLabel} · {trend.niche}
          {trend.approxTraffic ? ` · ${trend.approxTraffic} searches` : ""}
        </div>

        {/* Stop-scrolling hook */}
        <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] px-3 py-2 mb-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--pr-text-mute)] mb-1">
            <Eye className="h-3 w-3 text-[var(--pr-electric)]" />
            <span>Why people will stop scrolling</span>
          </div>
          <p className="text-sm text-foreground/90 leading-snug">{trend.stopScrollingHook}</p>
        </div>

        {/* Why it matters now (collapsed to 2 lines) */}
        <p className="text-sm text-[var(--pr-text-dim)] leading-relaxed line-clamp-2 mb-3">
          {trend.whyItMattersNow}
        </p>

        {/* First hook */}
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--pr-text-mute)] mb-1">
            First 3-second hook
          </div>
          <p className="text-sm font-medium text-foreground/95 italic">“{trend.firstHook}”</p>
        </div>

        {/* Angles (compact) */}
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--pr-text-mute)] mb-1.5">
            3 original angles
          </div>
          <ul className="space-y-1">
            {trend.angles.slice(0, 3).map((a, i) => (
              <li key={i} className="text-xs text-foreground/85 flex gap-2">
                <span className="text-[var(--pr-electric)] font-bold">{i + 1}.</span>
                <span className="line-clamp-1">{a.title}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Search terms / related queries */}
        {(trend.relatedQueries.length > 0 || trend.searchTerms.length > 0) && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {trend.searchTerms.slice(0, 5).map((t, i) => (
              <span
                key={i}
                className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-[var(--pr-text-dim)] border border-white/[0.06]"
              >
                #{t.toLowerCase().replace(/\s+/g, "_").slice(0, 22)}
              </span>
            ))}
          </div>
        )}

        {/* One-click Bridge buttons — Meme / iMessage / Hybrid / Roast */}
        <div className="mb-3 grid grid-cols-2 gap-1.5">
          {ONE_CLICK_FORMATS.map((f) => (
            <button
              key={f.label}
              onClick={(e) => {
                e.stopPropagation();
                setOneClickBridge({ uiFormat: f.label, autoRun: true });
                setDetailTab("bridge");
                selectTrend(trend.id);
              }}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium border transition-all",
                "bg-white/[0.03] border-white/[0.08] text-foreground/85 hover:bg-white/[0.07]",
                f.tone === "gold"
                  ? "hover:border-[var(--pr-gold)]/40 hover:text-[var(--pr-gold)]"
                  : f.tone === "emerald"
                  ? "hover:border-emerald-500/40 hover:text-emerald-300"
                  : f.tone === "violet"
                  ? "hover:border-violet-500/40 hover:text-violet-300"
                  : "hover:border-[var(--pr-electric)]/40 hover:text-[var(--pr-electric)]",
              )}
              title={f.desc}
            >
              <span className="text-xs">{f.icon}</span>
              <span>{f.label}</span>
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/[0.06]">
          <ActionButton
            primary
            icon={<Share2 className="h-3.5 w-3.5" />}
            onClick={(e) => {
              e.stopPropagation();
              selectTrend(trend.id);
            }}
          >
            Open
          </ActionButton>
          <ActionButton
            icon={<Eye className="h-3.5 w-3.5" />}
            onClick={async (e) => {
              e.stopPropagation();
              await saveTrend(trend);
            }}
          >
            <Bookmark className="h-3 w-3 mr-0.5" />
            Save
          </ActionButton>
          <div className="ml-auto text-[var(--pr-text-mute)] group-hover:text-[var(--pr-electric)] transition-colors">
            <ChevronRight className="h-4 w-4" />
          </div>
        </div>
      </div>
    </motion.article>
  );
}

async function saveTrend(t: TrendOpportunity) {
  try {
    const res = await fetch("/api/trend-scout/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", trend: t }),
    });
    if (!res.ok) throw new Error("Save failed");
    toast.success(`Saved "${t.title}" for later`);
  } catch (e) {
    toast.error("Could not save trend. Try again.");
  }
}

// --- badges ---

function Badge({
  icon,
  label,
  className,
}: {
  icon?: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border",
        className,
      )}
    >
      {icon}
      <span>{label}</span>
    </span>
  );
}

function ActionButton({
  primary,
  icon,
  children,
  onClick,
}: {
  primary?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
        primary
          ? "bg-[var(--pr-electric)] text-[#03121a] hover:bg-[var(--pr-electric)]/90 pr-glow"
          : "bg-white/[0.03] text-foreground/85 hover:bg-white/[0.06] border border-white/[0.08]",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// --- score ring ---

function ScoreRing({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const radius = 22;
  const circ = 2 * Math.PI * radius;
  const dash = (pct / 100) * circ;
  const color = pct >= 75 ? "var(--pr-gold)" : pct >= 50 ? "var(--pr-electric)" : "var(--pr-text-mute)";
  return (
    <div className="relative w-14 h-14 flex items-center justify-center">
      <svg width="56" height="56" viewBox="0 0 56 56" className="absolute inset-0 -rotate-90">
        <circle
          cx="28" cy="28" r={radius}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4"
        />
        <circle
          cx="28" cy="28" r={radius}
          fill="none" stroke={color} strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div className="text-center leading-none">
        <div className="text-base font-bold" style={{ color }}>{score}</div>
        <div className="text-[8px] uppercase tracking-wider text-[var(--pr-text-mute)]">/100</div>
      </div>
    </div>
  );
}

// --- direction + emotion meta ---

function directionMeta(d: TrendOpportunity["direction"]) {
  switch (d) {
    case "Breakout":
      return {
        label: "Breakout",
        icon: <Flame className="h-3 w-3" />,
        className: "bg-[var(--pr-gold)]/15 text-[var(--pr-gold)] border-[var(--pr-gold)]/25",
      };
    case "Rising":
      return {
        label: "Rising",
        icon: <TrendingUp className="h-3 w-3" />,
        className: "bg-[var(--pr-electric)]/15 text-[var(--pr-electric)] border-[var(--pr-electric)]/25",
      };
    case "Stable":
    default:
      return {
        label: "Stable",
        icon: <Activity className="h-3 w-3" />,
        className: "bg-white/[0.05] text-[var(--pr-text-dim)] border-white/10",
      };
  }
}

function emotionMeta(e: TrendOpportunity["audienceEmotion"]) {
  const map: Record<TrendOpportunity["audienceEmotion"], { glyph: string; className: string }> = {
    outrage:  { glyph: "!",  className: "bg-red-500/10 text-red-300 border-red-500/20" },
    fear:     { glyph: "⚠", className: "bg-amber-500/10 text-amber-300 border-amber-500/20" },
    urgency:  { glyph: "⏱", className: "bg-orange-500/10 text-orange-300 border-orange-500/20" },
    aspiration:{ glyph: "★", className: "bg-[var(--pr-gold)]/10 text-[var(--pr-gold)] border-[var(--pr-gold)]/20" },
    identity: { glyph: "✊", className: "bg-violet-500/10 text-violet-300 border-violet-500/20" },
    humor:    { glyph: "lol",className: "bg-pink-500/10 text-pink-300 border-pink-500/20" },
    curiosity:{ glyph: "?",  className: "bg-[var(--pr-electric)]/10 text-[var(--pr-electric)] border-[var(--pr-electric)]/20" },
  };
  return map[e];
}

// Used by detail view
export function RightsBadge({ score }: { score: number }) {
  const s = score >= 70 ? "Safe-ish" : score >= 50 ? "Caution" : "Clear carefully";
  const color =
    score >= 70 ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20"
    : score >= 50 ? "text-amber-300 bg-amber-500/10 border-amber-500/20"
    : "text-red-300 bg-red-500/10 border-red-500/20";
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border", color)}>
      <Lock className="h-3 w-3" />
      Rights {s} · {score}
    </span>
  );
}
