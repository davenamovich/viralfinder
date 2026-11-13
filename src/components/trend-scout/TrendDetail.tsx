"use client";

import { useEffect, useMemo, useState } from "react";
import { useScoutStore } from "@/lib/trend-scout/store";
import type {
  ContentBrief,
  SourceVideo,
  TrendOpportunity,
} from "@/lib/trend-scout/types";
import { TrendScoreBreakdown } from "./TrendScoreBreakdown";
import { ContentBriefView } from "./ContentBriefView";
import { SourceVideoFinder } from "./SourceVideoFinder";
import { InternationalPanel } from "./InternationalPanel";
import { PRActions } from "./PRActions";
import { BridgePanel } from "./BridgePanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BadgeCheck, ChevronLeft, Clock, ExternalLink, Globe, Lightbulb, Rocket, Search, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

interface Props {
  trend: TrendOpportunity;
}

export function TrendDetail({ trend }: Props) {
  const selectTrend = useScoutStore((s) => s.selectTrend);
  const setView = useScoutStore((s) => s.setView);
  const detailTab = useScoutStore((s) => s.detailTab);
  const setDetailTab = useScoutStore((s) => s.setDetailTab);
  const oneClickBridge = useScoutStore((s) => s.oneClickBridge);
  const setOneClickBridge = useScoutStore((s) => s.setOneClickBridge);

  // Capture one-click bridge intent on first render, then clear it so it
  // doesn't re-fire when the user manually switches tabs back to Bridge.
  const [consumedOneClick, setConsumedOneClick] = useState<
    { uiFormat: string; autoRun: boolean } | null
  >(null);
  useEffect(() => {
    if (oneClickBridge) {
      setConsumedOneClick(oneClickBridge);
      setOneClickBridge(null);
    }
  }, [oneClickBridge, setOneClickBridge]);

  const [brief, setBrief] = useState<ContentBrief | null>(null);
  const [briefState, setBriefState] = useState<"loading" | "llm" | "fallback">("loading");
  const [briefRaw, setBriefRaw] = useState<string | undefined>(undefined);
  const [briefExaSources, setBriefExaSources] = useState<number>(0);
  const [selectedSource, setSelectedSource] = useState<SourceVideo | null>(null);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);

  // Fetch brief on mount + whenever trend id changes
  useEffect(() => {
    let cancelled = false;
    setBrief(null);
    setBriefState("loading");
    setBriefRaw(undefined);
    setBriefExaSources(0);
    (async () => {
      try {
        const res = await fetch("/api/trend-scout/brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trend }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          brief: ContentBrief;
          source: "llm" | "fallback";
          raw?: string;
          enrichedWithExa?: boolean;
          exaSources?: number;
        };
        if (!cancelled) {
          setBrief(data.brief);
          setBriefState(data.source);
          setBriefRaw(data.raw);
          setBriefExaSources(data.exaSources ?? 0);
          // Preselect the first two suggested languages
          setSelectedLanguages(data.brief.suggestedLanguages.slice(0, 2));
        }
      } catch (e) {
        if (!cancelled) setBriefState("fallback");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trend.id, trend.title]);

  function handleSendToClip(video: SourceVideo) {
    setSelectedSource(video);
    setDetailTab("actions");
    toast.success(`Source selected — review and send to /clip from the Actions tab.`);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          onClick={() => {
            selectTrend(null);
            setView("scout");
          }}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--pr-text-dim)] hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" /> Back to feed
        </button>
        <div className="flex items-center gap-2 text-[11px] text-[var(--pr-text-mute)]">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3 w-3" /> {formatRelative(trend.publishedAt)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${trend.estimated ? "bg-[var(--pr-gold)]" : "bg-[var(--pr-electric)]"}`} />
            {trend.dataLabel}
          </span>
        </div>
      </div>

      {/* Hero header */}
      <header className="pr-card-grad pr-border-grad rounded-2xl overflow-hidden mb-5">
        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <DirectionBadge direction={trend.direction} />
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--pr-gold)]/10 text-[var(--pr-gold)] border border-[var(--pr-gold)]/20 uppercase tracking-wider font-semibold">
              Score {trend.score.total}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-[var(--pr-text-dim)] border border-white/[0.08] uppercase tracking-wider font-semibold">
              {trend.audienceEmotion}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-[var(--pr-text-dim)] border border-white/[0.08] uppercase tracking-wider font-semibold">
              {trend.niche}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-[var(--pr-text-dim)] border border-white/[0.08] uppercase tracking-wider font-semibold">
              {trend.countryLabel} · {trend.languageLabel}
            </span>
            {trend.estimated && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 uppercase tracking-wider font-semibold">
                Estimated
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold leading-tight mb-2">{trend.title}</h1>

          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2 mb-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--pr-text-mute)] mb-1">
              <Sparkles className="h-3 w-3 text-[var(--pr-electric)]" />
              <span>Why people will stop scrolling</span>
            </div>
            <p className="text-sm sm:text-base text-foreground/95">{trend.stopScrollingHook}</p>
          </div>

          <p className="text-sm text-foreground/85 leading-relaxed mb-4">{trend.whyItMattersNow}</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <InfoTile label="First 3-second hook" tone="electric">
              <em>“{trend.firstHook}”</em>
            </InfoTile>
            <InfoTile label="Suggested P&R format" tone="gold">
              <strong>{trend.suggestedFormat}</strong>
            </InfoTile>
            <InfoTile label="Rights safety" tone={trend.rightsSafetyScore >= 70 ? "emerald" : trend.rightsSafetyScore >= 50 ? "gold" : "amber"}>
              <strong>{trend.rightsSafetyScore}/100</strong> — {rightsNote(trend.rightsSafetyScore)}
            </InfoTile>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--pr-text-mute)]">
              Search terms:
            </span>
            {trend.searchTerms.map((t, i) => (
              <span
                key={i}
                className="text-xs px-2 py-0.5 rounded-full bg-white/[0.04] text-[var(--pr-text-dim)] border border-white/[0.06]"
              >
                #{t.toLowerCase().replace(/\s+/g, "_").slice(0, 24)}
              </span>
            ))}
            <a
              href={`https://trends.google.com/trending/rss?geo=${trend.country}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-[10px] text-[var(--pr-electric)] hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> View source
            </a>
          </div>

          {trend.newsItems && trend.newsItems.length > 0 && (
            <div className="mt-5 pt-4 border-t border-white/[0.06]">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--pr-text-mute)] mb-2 inline-flex items-center gap-1.5">
                <BadgeCheck className="h-3 w-3 text-[var(--pr-electric)]" /> Related news
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {trend.newsItems.slice(0, 4).map((n, i) => (
                  <li key={i} className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-2.5">
                    <a
                      href={n.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-foreground/85 hover:text-[var(--pr-electric)] hover:underline line-clamp-2"
                    >
                      {n.title}
                    </a>
                    <div className="text-[10px] text-[var(--pr-text-mute)] mt-1">{n.source}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </header>

      <Tabs value={detailTab} onValueChange={(v) => setDetailTab(v as typeof detailTab)}>
        <TabsList className="bg-white/[0.02] border border-white/[0.06] p-1 h-auto">
          <TabsTrigger value="brief" className="data-[state=active]:bg-[var(--pr-electric)]/15 data-[state=active]:text-[var(--pr-electric)] text-xs">
            <Lightbulb className="h-3.5 w-3.5 mr-1.5" /> Brief
          </TabsTrigger>
          <TabsTrigger value="sources" className="data-[state=active]:bg-[var(--pr-electric)]/15 data-[state=active]:text-[var(--pr-electric)] text-xs">
            <Search className="h-3.5 w-3.5 mr-1.5" /> Source videos
          </TabsTrigger>
          <TabsTrigger value="international" className="data-[state=active]:bg-[var(--pr-electric)]/15 data-[state=active]:text-[var(--pr-electric)] text-xs">
            <Globe className="h-3.5 w-3.5 mr-1.5" /> International
          </TabsTrigger>
          <TabsTrigger value="actions" className="data-[state=active]:bg-[var(--pr-electric)]/15 data-[state=active]:text-[var(--pr-electric)] text-xs">
            <Rocket className="h-3.5 w-3.5 mr-1.5" /> Send to P&R
          </TabsTrigger>
          <TabsTrigger value="bridge" className="data-[state=active]:bg-[var(--pr-gold)]/15 data-[state=active]:text-[var(--pr-gold)] text-xs">
            <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Bridge
          </TabsTrigger>
        </TabsList>

        <TabsContent value="brief" className="mt-4 space-y-4">
          <ContentBriefView brief={brief ?? fallbackBriefView(trend)} trend={trend} source={briefState} raw={briefRaw} exaSources={briefExaSources} />
          <TrendScoreBreakdown score={trend.score} />
        </TabsContent>

        <TabsContent value="sources" className="mt-4">
          <SourceVideoFinder trend={trend} onSendToClip={handleSendToClip} />
        </TabsContent>

        <TabsContent value="international" className="mt-4">
          <InternationalPanel
            trend={trend}
            selectedLanguages={selectedLanguages}
            onSelectForRebuild={(lang) => {
              setSelectedLanguages((cur) =>
                cur.includes(lang) ? cur.filter((l) => l !== lang) : [...cur, lang],
              );
            }}
          />
        </TabsContent>

        <TabsContent value="actions" className="mt-4">
          <PRActions
            trend={trend}
            brief={brief}
            briefLoading={briefState === "loading"}
            selectedSource={selectedSource}
            selectedLanguages={selectedLanguages}
            onClearSource={() => setSelectedSource(null)}
          />
        </TabsContent>

        <TabsContent value="bridge" className="mt-4">
          <BridgePanel
            trend={trend}
            initialUiFormat={consumedOneClick?.uiFormat}
            autoRun={consumedOneClick?.autoRun}
          />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

function InfoTile({
  label,
  children,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  tone: "electric" | "gold" | "emerald" | "amber";
}) {
  const toneClass: Record<typeof tone, string> = {
    electric: "text-[var(--pr-electric)]",
    gold: "text-[var(--pr-gold)]",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
  };
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--pr-text-mute)] mb-1">{label}</div>
      <div className={`text-sm ${toneClass[tone]}`}>{children}</div>
    </div>
  );
}

function DirectionBadge({ direction }: { direction: TrendOpportunity["direction"] }) {
  switch (direction) {
    case "Breakout":
      return <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--pr-gold)]/15 text-[var(--pr-gold)] border border-[var(--pr-gold)]/25 uppercase tracking-wider font-semibold">Breakout</span>;
    case "Rising":
      return <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--pr-electric)]/15 text-[var(--pr-electric)] border border-[var(--pr-electric)]/25 uppercase tracking-wider font-semibold">Rising</span>;
    case "Stable":
    default:
      return <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-[var(--pr-text-dim)] border border-white/[0.08] uppercase tracking-wider font-semibold">Stable</span>;
  }
}

function rightsNote(s: number): string {
  if (s >= 70) return "clearance still required";
  if (s >= 50) return "clear carefully";
  return "high-risk — multiple outlets";
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function fallbackBriefView(t: TrendOpportunity): ContentBrief {
  return {
    trend: t.title,
    realConversation: "Generating…",
    contrarianOrUsefulAngle: "Generating…",
    audience: "Generating…",
    hook: t.firstHook,
    scriptDirection: "Generating…",
    bestFormat: t.suggestedFormat,
    suggestedLanguages: ["en"],
    visualTreatment: "Generating…",
    cta: "Generating…",
    riskNotes: "Generating…",
  };
}

void useMemo;
