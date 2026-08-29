"use client";

import { useEffect, useState } from "react";
import type { RadarData } from "@/lib/trend-scout/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Globe, Languages, Rocket, Save, Star, TrendingUp } from "lucide-react";
import { TrendOpportunityCard } from "./TrendOpportunityCard";

export function TrendRadar() {
  const [data, setData] = useState<RadarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/trend-scout/radar");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as RadarData;
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Radar failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-xl bg-white/[0.04]" />
        <Skeleton className="h-64 rounded-xl bg-white/[0.04]" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] p-6 text-center">
        <h3 className="text-sm font-semibold text-red-200 mb-1">Trend Radar failed to load</h3>
        <p className="text-xs text-red-300/80">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="pr-card-grad pr-border-grad rounded-2xl p-5">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--pr-text-mute)] mb-1">
          <Activity className="h-3.5 w-3.5 text-[var(--pr-electric)]" />
          Daily Trend Radar
        </div>
        <h2 className="text-xl font-bold mb-1">
          What should the world be talking about today?
        </h2>
        <p className="text-sm text-[var(--pr-text-dim)] mb-4">
          {data.windowDaysLabel}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricTile
            label="Top opportunities"
            value={data.topOpportunities.length.toString()}
            icon={<TrendingUp className="h-4 w-4 text-[var(--pr-electric)]" />}
          />
          <MetricTile
            label="Niches covered"
            value={data.bestByNiche.length.toString()}
            icon={<Star className="h-4 w-4 text-[var(--pr-gold)]" />}
          />
          <MetricTile
            label="Languages tracked"
            value={data.bestByLanguage.length.toString()}
            icon={<Languages className="h-4 w-4 text-violet-300" />}
          />
          <MetricTile
            label="Conversion rate"
            value={`${data.conversionRate}%`}
            sub="from real user actions"
            icon={<Rocket className="h-4 w-4 text-emerald-300" />}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[var(--pr-text-mute)]">
          <span>Sources:</span>
          {data.dataSourceMix.map((s) => (
            <span
              key={s.source}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06]"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${s.source === "google_trends_rss" ? "bg-[var(--pr-electric)]" : "bg-[var(--pr-gold)]"}`} />
              {s.source === "google_trends_rss" ? "Google Trends RSS" : "Fallback"} ({s.count})
            </span>
          ))}
        </div>
      </header>

      <section>
        <SectionHeading
          icon={<TrendingUp className="h-4 w-4 text-[var(--pr-electric)]" />}
          title="Top 10 opportunities today"
          sub="Across all tracked markets, sorted by Trend Score"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.topOpportunities.map((t, i) => (
            <TrendOpportunityCard key={t.id} trend={t} index={i} />
          ))}
        </div>
      </section>

      <section>
        <SectionHeading
          icon={<Star className="h-4 w-4 text-[var(--pr-gold)]" />}
          title="Best emerging trend by niche"
          sub="Highest-scoring trend per niche right now"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.bestByNiche.map(({ niche, trend }) => (
            <div key={niche} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--pr-text-mute)] mb-1">{niche}</div>
              <div className="text-sm font-semibold mb-1">{trend.title}</div>
              <div className="text-[11px] text-[var(--pr-text-mute)]">
                {trend.countryLabel} · {trend.languageLabel} · score {trend.score.total}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionHeading
          icon={<Languages className="h-4 w-4 text-violet-300" />}
          title="Best trend for each target language"
          sub="The strongest trend localized per market"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.bestByLanguage.map(({ language, trend }) => (
            <div key={language} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-violet-300 mb-1">{language.toUpperCase()}</div>
              <div className="text-sm font-semibold mb-1">{trend.title}</div>
              <div className="text-[11px] text-[var(--pr-text-mute)]">
                {trend.countryLabel} · score {trend.score.total}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionHeading
          icon={<Globe className="h-4 w-4 text-[var(--pr-gold)]" />}
          title="Highest international potential"
          sub="Trend with the strongest translation/adaptation signal"
        />
        {data.highestInternationalPotential && (
          <div className="max-w-xl">
            <TrendOpportunityCard trend={data.highestInternationalPotential} />
          </div>
        )}
      </section>

      <section>
        <SectionHeading
          icon={<Save className="h-4 w-4 text-[var(--pr-electric)]" />}
          title="Trends saved for later"
          sub={`${data.trendsSavedForLater.length} saved — real user actions only`}
        />
        {data.trendsSavedForLater.length === 0 ? (
          <EmptyBlock>
            No trends saved yet. When you tap “Save” on a trend card, it shows up here.
          </EmptyBlock>
        ) : (
          <ul className="space-y-1.5">
            {data.trendsSavedForLater.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm truncate">{s.trendTitle}</div>
                  <div className="text-[10px] text-[var(--pr-text-mute)]">
                    {s.niche} · {s.country} · {s.language}
                  </div>
                </div>
                <div className="text-[10px] text-[var(--pr-text-mute)] shrink-0">
                  {new Date(s.savedAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeading
          icon={<Rocket className="h-4 w-4 text-emerald-300" />}
          title="Trends converted into videos"
          sub={`${data.trendsConvertedToVideos.length} P&R sends — real user actions only`}
        />
        {data.trendsConvertedToVideos.length === 0 ? (
          <EmptyBlock>
            No sends yet. When you use “Create Original”, “Send to /clip”, “Rebuild for World”, or
            “Create here.now Preview”, they show up here.
          </EmptyBlock>
        ) : (
          <ul className="space-y-1.5">
            {data.trendsConvertedToVideos.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm truncate">{u.trendTitle}</div>
                  <div className="text-[10px] text-[var(--pr-text-mute)]">
                    {u.action}
                    {u.format ? ` · ${u.format}` : ""}
                    {u.targetLanguages ? ` · ${u.targetLanguages}` : ""}
                    {u.briefSummary ? ` · “${u.briefSummary.slice(0, 80)}…”` : ""}
                  </div>
                </div>
                <div className="text-[10px] text-[var(--pr-text-mute)] shrink-0">
                  {new Date(u.usedAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="text-sm font-semibold mb-1">Trend-to-render conversion rate</div>
        <p className="text-xs text-[var(--pr-text-dim)]">{data.conversionRateLabel}</p>
      </section>
    </div>
  );
}

function SectionHeading({
  icon,
  title,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: string;
}) {
  return (
    <header className="mb-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        <span>{title}</span>
      </div>
      {sub && <p className="text-[11px] text-[var(--pr-text-mute)] mt-0.5">{sub}</p>}
    </header>
  );
}

function MetricTile({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--pr-text-mute)]">{label}</div>
        {icon}
      </div>
      <div className="text-xl font-bold">{value}</div>
      {sub && <div className="text-[10px] text-[var(--pr-text-mute)] mt-0.5">{sub}</div>}
    </div>
  );
}

function EmptyBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.01] p-6 text-center text-xs text-[var(--pr-text-dim)]">
      {children}
    </div>
  );
}
