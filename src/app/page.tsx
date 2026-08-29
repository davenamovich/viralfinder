"use client";

import { useEffect, useCallback, useMemo, useState } from "react";
import { useScoutStore } from "@/lib/trend-scout/store";
import { Header } from "@/components/trend-scout/Header";
import { FilterBar } from "@/components/trend-scout/FilterBar";
import { TrendFeed } from "@/components/trend-scout/TrendFeed";
import { TrendDetail } from "@/components/trend-scout/TrendDetail";
import { TrendRadar } from "@/components/trend-scout/TrendRadar";
import { TelegramBotFlow } from "@/components/trend-scout/TelegramBotFlow";
import { RightsConfirmDialog } from "@/components/trend-scout/RightsConfirmDialog";
import type { FetchTrendsResult } from "@/lib/trend-scout/orchestrator";
import type { TrendOpportunity } from "@/lib/trend-scout/types";
import { Compass, Sparkles, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  const view = useScoutStore((s) => s.view);
  const filters = useScoutStore((s) => s.filters);
  const trends = useScoutStore((s) => s.trends);
  const setTrends = useScoutStore((s) => s.setTrends);
  const loading = useScoutStore((s) => s.loading);
  const setLoading = useScoutStore((s) => s.setLoading);
  const error = useScoutStore((s) => s.error);
  const setError = useScoutStore((s) => s.setError);
  const selectedTrendId = useScoutStore((s) => s.selectedTrendId);

  const [meta, setMeta] = useState<FetchTrendsResult | null>(null);

  const fetchTrends = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        country: filters.country,
        language: filters.language,
        niche: filters.niche,
        timeWindow: filters.timeWindow,
        contentType: filters.contentType,
      });
      const res = await fetch(`/api/trend-scout/trends?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as FetchTrendsResult;
      setMeta(data);
      setTrends(data.trends);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fetch failed");
      setTrends([]);
    } finally {
      setLoading(false);
    }
  }, [filters, setTrends, setLoading, setError]);

  useEffect(() => {
    if (view === "scout") fetchTrends();
  }, [view, fetchTrends]);

  const selectedTrend: TrendOpportunity | null = useMemo(() => {
    if (!selectedTrendId) return null;
    return trends.find((t) => t.id === selectedTrendId) ?? null;
  }, [selectedTrendId, trends]);

  return (
    <div className="min-h-screen flex flex-col bg-background pr-grid-bg">
      <Header />

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 py-5 sm:py-7">
        {view === "scout" && !selectedTrend && <ScoutView loading={loading} error={error} trends={trends} meta={meta} onRefresh={() => fetchTrends()} />}
        {view === "scout" && selectedTrend && (
          <TrendDetail trend={selectedTrend} />
        )}
        {view === "radar" && <TrendRadar />}
        {view === "telegram" && <TelegramBotFlow />}
      </main>

      <Footer />
      <RightsConfirmDialog />
    </div>
  );
}

function ScoutView({
  loading,
  error,
  trends,
  meta,
  onRefresh,
}: {
  loading: boolean;
  error: string | null;
  trends: TrendOpportunity[];
  meta: FetchTrendsResult | null;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-5">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="pr-card-grad pr-border-grad rounded-2xl overflow-hidden"
      >
        <div className="p-5 sm:p-7 flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--pr-text-mute)] mb-2">
              <Compass className="h-3 w-3 text-[var(--pr-electric)]" />
              P&R Thought Engine — Trend Scout
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold leading-tight mb-2">
              <span className="pr-text-gradient">What should the world be talking about today?</span>
            </h2>
            <p className="text-sm text-[var(--pr-text-dim)] max-w-2xl leading-relaxed">
              Find what the world is already talking about. Turn it into something worth watching.
              Trend Scout pulls live Google Trends data, scores it for short-form potential, finds
              source material, and sends the result straight into the existing P&R Thought Engine
              and Telegram <code className="text-[var(--pr-electric)]">/clip</code> and{" "}
              <code className="text-[var(--pr-electric)]">/rebuild</code> flows.
            </p>
          </div>
          <div className="shrink-0 flex md:flex-col gap-3">
            <HeroStat
              label="Live trends"
              value={meta ? String(meta.rawCount) : "—"}
              icon={<TrendingUp className="h-4 w-4 text-[var(--pr-electric)]" />}
            />
            <HeroStat
              label="Opportunities shown"
              value={meta ? String(meta.trends.length) : "—"}
              icon={<Sparkles className="h-4 w-4 text-[var(--pr-gold)]" />}
            />
          </div>
        </div>
      </motion.section>

      <FilterBar onRefresh={onRefresh} />

      <TrendFeed
        trends={trends}
        loading={loading}
        error={error}
        usedProvider={meta?.usedProvider ?? ""}
        usedFallback={meta?.usedFallback ?? false}
        rawCount={meta?.rawCount ?? 0}
        filteredByNiche={meta?.filteredByNiche ?? 0}
        windowDaysLabel={meta?.windowDaysLabel ?? ""}
      />
    </div>
  );
}

function HeroStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 min-w-[120px]">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--pr-text-mute)]">{label}</div>
        {icon}
      </div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-auto border-t border-white/[0.04] bg-background/80 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-[var(--pr-text-mute)]">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-gradient-to-br from-[var(--pr-electric)] to-[var(--pr-gold)]" />
          <span>P&amp;R Thought Engine — Trend Scout · <em>Find the signal. Build the version worth sharing.</em></span>
        </div>
        <div className="flex items-center gap-3">
          <span>Provider: Google Trends RSS + curated fallback</span>
          <span>·</span>
          <span>YouTube Data API when configured</span>
        </div>
      </div>
    </footer>
  );
}
