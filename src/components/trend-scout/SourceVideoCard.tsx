"use client";

import type { SourceVideo } from "@/lib/trend-scout/types";
import { rightsStatusLabel } from "@/lib/trend-scout/providers/youtube-provider";
import { Check, Shield, ShieldAlert, ShieldCheck, ExternalLink, Send, Clock, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  video: SourceVideo;
  onSend?: (video: SourceVideo) => void;
}

const RIGHTS_STYLES: Record<SourceVideo["rightsStatus"], { color: string; icon: React.ReactNode }> = {
  my_channel:        { color: "bg-[var(--pr-gold)]/10 text-[var(--pr-gold)] border-[var(--pr-gold)]/25",        icon: <Check className="h-3 w-3" /> },
  creator_authorized:{ color: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",                       icon: <ShieldCheck className="h-3 w-3" /> },
  creative_commons:  { color: "bg-[var(--pr-electric)]/10 text-[var(--pr-electric)] border-[var(--pr-electric)]/25", icon: <ShieldCheck className="h-3 w-3" /> },
  public_domain:     { color: "bg-violet-500/10 text-violet-300 border-violet-500/25",                          icon: <Shield className="h-3 w-3" /> },
  rights_unverified: { color: "bg-amber-500/10 text-amber-300 border-amber-500/25",                             icon: <ShieldAlert className="h-3 w-3" /> },
};

export function SourceVideoCard({ video, onSend }: Props) {
  const r = RIGHTS_STYLES[video.rightsStatus];
  const audio = audioMeta(video.audioQuality);
  const unverified = video.rightsStatus === "rights_unverified";

  return (
    <article className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden hover:border-white/[0.12] transition-colors">
      <div className="relative aspect-video bg-black/60">
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-[var(--pr-text-mute)] text-xs">
            No thumbnail
          </div>
        )}
        {video.lengthLabel && (
          <span className="absolute bottom-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-black/80 text-white font-mono">
            {video.lengthLabel}
          </span>
        )}
        <span
          className={cn(
            "absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border",
            r.color,
          )}
        >
          {r.icon}
          {rightsStatusLabel(video.rightsStatus)}
        </span>
      </div>

      <div className="p-3">
        <h4 className="text-sm font-medium leading-tight line-clamp-2 mb-1">{video.title}</h4>
        <div className="text-[11px] text-[var(--pr-text-mute)] mb-2">
          {video.channel}
          {" · "}
          {formatDate(video.publishedAt)}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--pr-text-mute)] mb-3">
          {video.viewsLabel && (
            <span className="inline-flex items-center gap-1">
              <Eye className="h-3 w-3" /> {video.viewsLabel}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> {audio.label}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[var(--pr-electric)]/60" />
            {video.originalLanguageLabel}
          </span>
          <span className="ml-auto inline-flex items-center gap-1 text-[var(--pr-text-mute)]">
            source: <span className="text-[var(--pr-text-dim)]">
              {video.dataSource === "youtube_api" ? "YouTube Data API" : "YouTube search URL"}
            </span>
          </span>
        </div>

        {video.estimatedClipMoments && video.estimatedClipMoments.length > 0 && (
          <div className="mb-3 rounded-lg bg-white/[0.02] border border-white/[0.04] p-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--pr-text-mute)] mb-1">
              Estimated best clip moments
            </div>
            <ul className="space-y-1">
              {video.estimatedClipMoments.slice(0, 3).map((m, i) => (
                <li key={i} className="text-[11px] flex gap-2">
                  <span className="text-[var(--pr-electric)] font-mono shrink-0">{m.timecode}</span>
                  <span className="text-[var(--pr-text-dim)] line-clamp-1">{m.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {video.description && (
          <p className="text-[11px] text-[var(--pr-text-dim)] leading-snug mb-3 line-clamp-2">
            {video.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-white/[0.04] text-foreground/85 hover:bg-white/[0.08] border border-white/[0.08] transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open
          </a>
          <button
            onClick={() => {
              if (unverified) {
                toast.error("Rights unverified — open the video first and confirm you own or have permission to adapt it before sending to /clip.");
              } else {
                onSend?.(video);
              }
            }}
            className={cn(
              "inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors",
              unverified
                ? "bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20"
                : "bg-[var(--pr-electric)] text-[#03121a] pr-glow",
            )}
          >
            <Send className="h-3.5 w-3.5" />
            {unverified ? "Confirm rights → Send to /clip" : "Send to /clip"}
          </button>
        </div>
      </div>
    </article>
  );
}

function audioMeta(q: SourceVideo["audioQuality"]) {
  switch (q) {
    case "high":
      return { label: "HD audio", color: "text-emerald-300" };
    case "medium":
      return { label: "Std audio", color: "text-foreground/70" };
    case "low":
      return { label: "Low audio", color: "text-amber-300" };
    case "unknown":
    default:
      return { label: "Audio n/a", color: "text-[var(--pr-text-mute)]" };
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / (24 * 3600 * 1000);
    if (diff < 1) return "today";
    if (diff < 2) return "yesterday";
    if (diff < 7) return `${Math.floor(diff)} days ago`;
    if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}
