/**
 * YouTube source video provider.
 *
 * Strategy:
 *   1. If YOUTUBE_API_KEY is configured, use the YouTube Data API v3
 *      (search + videos endpoint). Returns real thumbnails, view counts,
 *      durations, channel names. Rights status is inferred from the
 *      "license" field on the video (creativeCommon => creative_commons).
 *   2. If no API key is configured, we DO NOT fake results. Instead we
 *      return an empty list with a clear "API key not configured" status
 *      and a constructed YouTube search URL the user can open in a new
 *      tab. The UI shows an explicit message explaining this.
 *
 * Rights status logic:
 *   - my_channel:    when the video's channel id matches an env-configured
 *                    P&R_OWN_CHANNEL_ID (the creator's own channel)
 *   - creative_commons: from API field contentDetails.licensedAsCC === true
 *   - public_domain:    not directly determinable from YouTube API; we never
 *                       auto-assign this from a search
 *   - creator_authorized: would require integration with a permissions list
 *                          (out of scope of this build) — left as rights_unverified
 *   - rights_unverified: the default for everything else
 */

import { withRateLimit } from "../rate-limit";
import { cacheReadThrough, TTL } from "../cache";
import type {
  SourceVideo,
  RightsStatus,
  DataSource,
} from "../types";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY ?? "";
const P_R_OWN_CHANNEL_ID = process.env.P_R_OWN_CHANNEL_ID ?? "";

export interface SourceVideoResult {
  videos: SourceVideo[];
  status: "ok" | "missing_key" | "error";
  message: string;
  searchUrl: string; // always returned so the UI can offer "open in YouTube"
  dataSource: DataSource;
}

export async function findSourceVideos(opts: {
  query: string;
  relatedQueries?: string[];
  language?: string;
  publishedWithinDays?: number;
}): Promise<SourceVideoResult> {
  const query = buildQuery(opts);
  const searchUrl = buildYouTubeSearchUrl(query, opts.language);
  if (!YOUTUBE_API_KEY) {
    return {
      videos: [],
      status: "missing_key",
      message:
        "YouTube Data API key not configured. Trend Scout will not fake search results — open the query in YouTube instead, or set YOUTUBE_API_KEY to enable in-app search.",
      searchUrl,
      dataSource: "youtube_search_url",
    };
  }

  try {
    const cacheKey = `yt:${query}:${opts.language ?? ""}:${opts.publishedWithinDays ?? ""}`;
    const videos = await cacheReadThrough(cacheKey, TTL.YOUTUBE_SEARCH, () =>
      searchYouTube(opts),
    );
    return {
      videos,
      status: "ok",
      message: `Found ${videos.length} videos via YouTube Data API.`,
      searchUrl,
      dataSource: "youtube_api",
    };
  } catch (err) {
    return {
      videos: [],
      status: "error",
      message:
        err instanceof Error
          ? `YouTube API error: ${err.message}`
          : "YouTube API error.",
      searchUrl,
      dataSource: "youtube_search_url",
    };
  }
}

function buildQuery(opts: { query: string; relatedQueries?: string[] }): string {
  // Combine main query with one related query for stronger recall
  const related = opts.relatedQueries?.[0];
  return related ? `${opts.query} ${related}` : opts.query;
}

function buildYouTubeSearchUrl(query: string, language?: string): string {
  const params = new URLSearchParams({
    search_query: query,
    sp: "CAI%3D", // sort by upload date (Today/This week filter)
  });
  if (language) params.set("hl", language);
  return `https://www.youtube.com/results?${params.toString()}`;
}

async function searchYouTube(opts: {
  query: string;
  relatedQueries?: string[];
  language?: string;
  publishedWithinDays?: number;
}): Promise<SourceVideo[]> {
  // 1. Search
  const searchParams = new URLSearchParams({
    key: YOUTUBE_API_KEY,
    part: "snippet",
    type: "video",
    q: buildQuery(opts),
    maxResults: "10",
    order: "relevance",
    regionCode: opts.language ? undefined : undefined,
    relevanceLanguage: opts.language ?? undefined,
  });
  if (opts.publishedWithinDays) {
    const d = new Date();
    d.setDate(d.getDate() - opts.publishedWithinDays);
    searchParams.set("publishedAfter", d.toISOString());
  }
  const url = `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`;
  const res = await withRateLimit("yt", 2, async () => {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`YouTube search HTTP ${r.status}: ${body.slice(0, 200)}`);
    }
    return r.json();
  });
  if (!res.ok) throw new Error(res.error);

  const json = res.value as {
    items?: {
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        channelId?: string;
        channelTitle?: string;
        publishedAt?: string;
        description?: string;
        thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
      };
    }[];
  };
  const items = json.items ?? [];
  const ids = items
    .map((i) => i.id?.videoId)
    .filter((v): v is string => !!v);
  if (ids.length === 0) return [];

  // 2. Videos endpoint for content details + statistics + license
  const vParams = new URLSearchParams({
    key: YOUTUBE_API_KEY,
    part: "contentDetails,statistics,status",
    id: ids.join(","),
  });
  const vRes = await withRateLimit("yt", 2, async () => {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?${vParams.toString()}`, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!r.ok) throw new Error(`YouTube videos HTTP ${r.status}`);
    return r.json();
  });
  if (!vRes.ok) throw new Error(vRes.error);

  const vJson = vRes.value as {
    items?: {
      id: string;
      contentDetails?: {
        duration?: string; // ISO 8601
        licensedContent?: boolean;
        definition?: string;
      };
      statistics?: { viewCount?: string; likeCount?: string };
      status?: { license?: string };
    }[];
  };
  const vById = new Map((vJson.items ?? []).map((v) => [v.id, v]));

  const out: SourceVideo[] = [];
  for (const it of items) {
    const vid = it.id?.videoId;
    if (!vid) continue;
    const v = vById.get(vid);
    const durationLabel = v?.contentDetails?.duration
      ? isoDurationToLabel(v.contentDetails.duration)
      : undefined;
    const lengthSeconds = v?.contentDetails?.duration
      ? isoDurationToSeconds(v.contentDetails.duration)
      : undefined;
    const views = v?.statistics?.viewCount ? parseInt(v.statistics.viewCount, 10) : undefined;
    const rightsStatus = inferRights(
      it.snippet?.channelId,
      v?.status?.license === "creativeCommon",
    );
    out.push({
      id: vid,
      title: decodeHtml(it.snippet?.title ?? ""),
      channel: it.snippet?.channelTitle ?? "Unknown channel",
      channelId: it.snippet?.channelId,
      publishedAt: it.snippet?.publishedAt ?? new Date().toISOString(),
      lengthSeconds,
      lengthLabel: durationLabel,
      views,
      viewsLabel: views ? formatViews(views) : undefined,
      thumbnailUrl: it.snippet?.thumbnails?.high?.url ?? it.snippet?.thumbnails?.medium?.url,
      description: (it.snippet?.description ?? "").slice(0, 280),
      estimatedClipMoments: [], // would require transcript retrieval — left empty unless we have a transcript adapter
      audioQuality: v?.contentDetails?.definition === "hd" ? "high" : "medium",
      originalLanguage: opts.language ?? "en",
      originalLanguageLabel: opts.language ?? "English",
      rightsStatus,
      rightsLabel: rightsStatusLabel(rightsStatus),
      url: `https://www.youtube.com/watch?v=${vid}`,
      dataSource: "youtube_api",
    });
  }
  return out;
}

function inferRights(channelId: string | undefined, isCC: boolean): RightsStatus {
  if (P_R_OWN_CHANNEL_ID && channelId && channelId === P_R_OWN_CHANNEL_ID) {
    return "my_channel";
  }
  if (isCC) return "creative_commons";
  return "rights_unverified";
}

export function rightsStatusLabel(s: RightsStatus): string {
  switch (s) {
    case "my_channel":
      return "My connected channel";
    case "creator_authorized":
      return "Creator-authorized";
    case "creative_commons":
      return "Creative Commons";
    case "public_domain":
      return "Public domain";
    case "rights_unverified":
      return "Rights unverified";
  }
}

function isoDurationToLabel(d: string): string {
  const s = isoDurationToSeconds(d);
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}:${String(mm).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function isoDurationToSeconds(d: string): number | undefined {
  const m = d.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!m) return undefined;
  const h = parseInt(m[1] ?? "0", 10);
  const min = parseInt(m[2] ?? "0", 10);
  const s = parseInt(m[3] ?? "0", 10);
  return h * 3600 + min * 60 + s;
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K views`;
  return `${n} views`;
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
