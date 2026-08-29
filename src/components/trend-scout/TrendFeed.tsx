"use client";

import { useScoutStore } from "@/lib/trend-scout/store";
import { TrendOpportunityCard } from "./TrendOpportunityCard";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Compass } from "lucide-react";

interface Props {
  trends: ReturnType<typeof useScoutStore.getState>["trends"];
  loading: boolean;
  error: string | null;
  usedProvider: string;
  usedFallback: boolean;
  rawCount: number;
  filteredByNiche: number;
  windowDaysLabel: string;
}

export function TrendFeed({
  trends,
  loading,
  error,
  usedProvider,
  usedFallback,
  rawCount,
  filteredByNiche,
  windowDaysLabel,
}: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-xl bg-white/[0.04]" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] p-6 text-center">
        <AlertCircle className="h-6 w-6 mx-auto mb-2 text-red-400" />
        <h3 className="text-sm font-semibold text-red-200 mb-1">Trend fetch failed</h3>
        <p className="text-xs text-red-300/80">{error}</p>
      </div>
    );
  }

  if (trends.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center">
        <Compass className="h-7 w-7 mx-auto mb-3 text-[var(--pr-text-mute)]" />
        <h3 className="text-sm font-semibold mb-1">No opportunities right now</h3>
        <p className="text-xs text-[var(--pr-text-dim)] max-w-md mx-auto">
          The provider didn’t return any trends for this country + niche combination in the selected
          time window. Try widening the niche, switching the time window to <em>Past 24 hours</em>, or
          refreshing in a few minutes.
        </p>
      </div>
    );
  }

  return (
    <div>
      <FeedStatusBar
        usedProvider={usedProvider}
        usedFallback={usedFallback}
        rawCount={rawCount}
        shownCount={trends.length}
        filteredByNiche={filteredByNiche}
        windowDaysLabel={windowDaysLabel}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {trends.map((t, i) => (
          <TrendOpportunityCard key={t.id} trend={t} index={i} />
        ))}
      </div>
    </div>
  );
}

function FeedStatusBar({
  usedProvider,
  usedFallback,
  rawCount,
  shownCount,
  filteredByNiche,
  windowDaysLabel,
}: Pick<Props, "usedProvider" | "usedFallback" | "rawCount" | "filteredByNiche" | "windowDaysLabel"> & { shownCount: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--pr-text-mute)]">
      <span className="inline-flex items-center gap-1.5">
        <span
          className={`h-2 w-2 rounded-full ${
            usedFallback ? "bg-[var(--pr-gold)]" : "bg-[var(--pr-electric)] pr-pulse-ring"
          }`}
        />
        <span>
          Source: <strong className="text-foreground/80">
            {usedProvider === "google_trends_rss" && "Google Trends RSS (live)"}
            {usedProvider === "fallback_curated" && "Curated fallback (estimated)"}
            {usedProvider === "error" && "Error"}
          </strong>
        </span>
      </span>
      <span>
        Showing <strong className="text-foreground/80">{shownCount}</strong> of {rawCount} raw trends
      </span>
      {filteredByNiche > 0 && (
        <span>
          {filteredByNiche} filtered by niche
        </span>
      )}
      <span className="ml-auto text-[var(--pr-text-mute)] italic">{windowDaysLabel}</span>
    </div>
  );
}
