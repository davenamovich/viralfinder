"use client";

import type { TrendScore } from "@/lib/trend-scout/types";
import { cn } from "@/lib/utils";

export function TrendScoreBreakdown({ score }: { score: TrendScore }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--pr-text-mute)]">
            Trend Score breakdown
          </div>
          <div className="text-sm font-bold pr-text-gradient">{score.total}/100</div>
        </div>
        <p className="text-[11px] text-[var(--pr-text-mute)] mt-1">
          Every factor is computed from real inputs. If a signal isn’t available, the score for that
          factor is 0 — never faked.
        </p>
      </div>

      <ul className="divide-y divide-white/[0.04]">
        {score.factors.map((f) => (
          <li key={f.factor} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3 mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium truncate">{f.factor}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-[var(--pr-text-mute)] shrink-0">
                  weight ×{f.weight}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn("text-xs font-bold tabular-nums", scoreClass(f.score))}>
                  {f.score.toFixed(1)}
                </span>
                <span className="text-[10px] text-[var(--pr-text-mute)]">
                  → +{f.contribution.toFixed(1)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="flex-1 h-1 rounded-full bg-white/[0.04] overflow-hidden">
                <div
                  className={cn("h-full rounded-full", barClass(f.score))}
                  style={{ width: `${(f.score / 10) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-[var(--pr-text-mute)] tabular-nums shrink-0">
                /10
              </span>
            </div>
            <p className="text-[11px] text-[var(--pr-text-dim)] leading-snug">{f.note}</p>
            <div className="mt-1 text-[10px] text-[var(--pr-text-mute)] font-mono">
              input: <span className="text-[var(--pr-text-dim)]">{f.input}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function scoreClass(s: number): string {
  if (s >= 7.5) return "text-[var(--pr-gold)]";
  if (s >= 5) return "text-[var(--pr-electric)]";
  if (s >= 2.5) return "text-foreground/70";
  return "text-[var(--pr-text-mute)]";
}

function barClass(s: number): string {
  if (s >= 7.5) return "bg-[var(--pr-gold)]";
  if (s >= 5) return "bg-[var(--pr-electric)]";
  if (s >= 2.5) return "bg-foreground/40";
  return "bg-foreground/15";
}
