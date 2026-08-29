"use client";

import { useEffect, useState } from "react";
import type { SourceVideo, TrendOpportunity } from "@/lib/trend-scout/types";
import { SourceVideoCard } from "./SourceVideoCard";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ExternalLink, Key, Search, Youtube } from "lucide-react";

interface Props {
  trend: TrendOpportunity;
  onSendToClip: (video: SourceVideo) => void;
}

interface State {
  loading: boolean;
  videos: SourceVideo[];
  status: "ok" | "missing_key" | "error" | "idle";
  message: string;
  searchUrl: string;
  dataSource: string;
}

export function SourceVideoFinder({ trend, onSendToClip }: Props) {
  const [state, setState] = useState<State>({
    loading: false,
    videos: [],
    status: "idle",
    message: "",
    searchUrl: "",
    dataSource: "",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState((s) => ({ ...s, loading: true, status: "idle" }));
      try {
        const params = new URLSearchParams({
          query: trend.title,
          language: trend.language,
          days: "7",
        });
        for (const q of trend.relatedQueries.slice(0, 3)) params.append("related", q);
        const res = await fetch(`/api/trend-scout/sources?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Omit<State, "loading">;
        if (!cancelled) {
          setState({ ...data, loading: false });
        }
      } catch (e) {
        if (!cancelled) {
          setState({
            loading: false,
            videos: [],
            status: "error",
            message: e instanceof Error ? e.message : "Search failed",
            searchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(trend.title)}`,
            dataSource: "youtube_search_url",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trend.id, trend.title, trend.language, trend.relatedQueries.join(",")]);

  if (state.loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-56 rounded-xl bg-white/[0.04]" />
        ))}
      </div>
    );
  }

  if (state.status === "missing_key" || (state.status === "error" && state.videos.length === 0)) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center">
        <div className="inline-flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full mb-3">
          <Key className="h-3.5 w-3.5" />
          YouTube Data API key not configured
        </div>
        <h3 className="text-sm font-semibold mb-2">Trend Scout will not fake search results.</h3>
        <p className="text-xs text-[var(--pr-text-dim)] max-w-md mx-auto mb-4">
          To enable in-app source video search, set the <code className="text-[var(--pr-electric)]">YOUTUBE_API_KEY</code> environment variable. Until then, you can open the YouTube search for this trend in a new tab and pick your source manually.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <a
            href={state.searchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm px-3.5 py-2 rounded-md bg-[#ff0033]/10 text-white border border-[#ff0033]/25 hover:bg-[#ff0033]/20 transition-colors"
          >
            <Youtube className="h-4 w-4" />
            Open YouTube search for “{trend.title}”
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <p className="text-[10px] text-[var(--pr-text-mute)] mt-3 font-mono break-all">
          {state.searchUrl}
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] p-6 text-center">
        <AlertCircle className="h-5 w-5 mx-auto mb-2 text-red-400" />
        <h3 className="text-sm font-semibold text-red-200 mb-1">YouTube search failed</h3>
        <p className="text-xs text-red-300/80 mb-3">{state.message}</p>
        <a
          href={state.searchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-white/[0.05] border border-white/10 hover:bg-white/[0.08]"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open YouTube search manually
        </a>
      </div>
    );
  }

  if (state.videos.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center">
        <Search className="h-5 w-5 mx-auto mb-2 text-[var(--pr-text-mute)]" />
        <h3 className="text-sm font-semibold mb-1">No videos found</h3>
        <p className="text-xs text-[var(--pr-text-dim)] mb-4">
          YouTube returned no results for this query in the selected language and time window.
        </p>
        <a
          href={state.searchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-white/[0.05] border border-white/10 hover:bg-white/[0.08]"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open YouTube search
        </a>
      </div>
    );
  }

  // OK — show source cards
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--pr-text-mute)] mb-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--pr-electric)]" />
          Source: <strong className="text-foreground/80">{state.dataSource === "youtube_api" ? "YouTube Data API" : "YouTube search URL"}</strong>
        </span>
        <span>{state.videos.length} results</span>
        <a
          href={state.searchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-[var(--pr-electric)] hover:underline"
        >
          <ExternalLink className="h-3 w-3" /> Open full search
        </a>
      </div>
      <div className="mb-3 rounded-lg border border-amber-500/15 bg-amber-500/[0.04] px-3 py-2 text-[11px] text-amber-200/90">
        Prioritize “My connected channel”, “Creator-authorized”, “Creative Commons”, and “Public domain”.
        Do not auto-process “Rights unverified” sources — open them, confirm you own or have permission, then send.
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {state.videos.map((v) => (
          <SourceVideoCard key={v.id} video={v} onSend={onSendToClip} />
        ))}
      </div>
    </div>
  );
}
