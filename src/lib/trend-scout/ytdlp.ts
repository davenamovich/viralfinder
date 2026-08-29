/**
 * yt-dlp wrapper for the P&R Trend Scout.
 *
 * Uses the yt-dlp binary installed by Agent Reach at `~/.agent-reach-venv/bin/yt-dlp`.
 * Provides:
 *   - `searchYouTube(query, opts)`  — `--flat-playlist ytsearch10:"query"`, no API key required
 *   - `fetchTranscript(videoId)`    — best-effort, multi-player-client fallback; on bot-block, returns `{status: "blocked"}`
 *   - `extractClipMoments(vttText)`  — parse VTT and pick 3 highest-attention moments (first strong claim, longest silence boundary, climax)
 *
 * All child processes get a hard timeout so a stuck yt-dlp call can never hang
 * the Next.js request.
 */

import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

const YT_DLP_BIN =
  process.env.YT_DLP_BIN ?? path.join(os.homedir(), ".agent-reach-venv", "bin", "yt-dlp");

const PLAYER_CLIENTS = "tv,web_safari,ios,android,mweb";

export interface YtdlpSearchResult {
  id: string;
  title: string;
  channel: string;
  durationSeconds?: number;
  viewCount?: number;
  uploadDate?: string; // YYYYMMDD
}

export interface TranscriptResult {
  status: "ok" | "blocked" | "no_subtitles" | "error";
  vtt?: string;
  message?: string;
  language?: string;
}

export interface ClipMoment {
  timecode: string;
  reason: string;
}

const MAX_SEARCH_RESULTS = 10;

export async function searchYouTube(
  query: string,
  opts: { max?: number; language?: string } = {},
): Promise<{ results: YtdlpSearchResult[]; error?: string }> {
  const max = Math.min(opts.max ?? 8, MAX_SEARCH_RESULTS);
  const searchArg = `ytsearch${max}:${query}`;

  // yt-dlp search syntax: --flat-playlist --print "<fields>" "ytsearchN:query"
  // We use the `--print` flag (newer) instead of `-J` so it streams and stays small.
  const fields = "%(id)s|%(title)s|%(channel)s|%(duration)s|%(view_count)s|%(upload_date)s";

  try {
    const out = await runYtdlp([
      "--flat-playlist",
      "--print", fields,
      "--no-playlist-reverse",
      "--no-warnings",
      // Prefer English results when language is set; yt-dlp's --extractor-args for youtube search
      ...(opts.language === "en" ? [] : []),
      searchArg,
    ], 30_000);

    const results: YtdlpSearchResult[] = [];
    for (const line of out.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [id, title, channel, duration, viewCount, uploadDate] = trimmed.split("|");
      if (!id || !title) continue;
      results.push({
        id: id.trim(),
        title: title.trim(),
        channel: (channel ?? "").trim() || "Unknown channel",
        durationSeconds: duration && duration !== "NA" && duration !== "None" ? parseNumber(duration) : undefined,
        viewCount: viewCount && viewCount !== "NA" && viewCount !== "None" ? parseNumber(viewCount) : undefined,
        uploadDate: uploadDate && uploadDate !== "NA" && uploadDate !== "None" ? uploadDate.trim() : undefined,
      });
    }
    return { results };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { results: [], error: msg };
  }
}

export async function fetchTranscript(
  videoId: string,
  language = "en",
): Promise<TranscriptResult> {
  const workDir = path.join(os.tmpdir(), "ytdlp-pr-trend-scout", crypto.randomBytes(8).toString("hex"));
  await fs.mkdir(workDir, { recursive: true });
  const outTemplate = path.join(workDir, "sub.%(ext)s");
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    await runYtdlp([
      "--skip-download",
      "--write-auto-sub",
      "--write-sub",
      "--sub-lang", language,
      "--sub-format", "vtt",
      "--extractor-args", `youtube:player_client=${PLAYER_CLIENTS}`,
      "--no-warnings",
      "-o", outTemplate,
      url,
    ], 45_000);

    const files = await fs.readdir(workDir);
    const vttFile = files.find((f) => f.endsWith(".vtt"));
    if (!vttFile) {
      return { status: "no_subtitles", message: `No ${language} captions available for this video.` };
    }
    const vtt = await fs.readFile(path.join(workDir, vttFile), "utf-8");
    return { status: "ok", vtt, language };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Sign in to confirm") || msg.includes("not a bot")) {
      return {
        status: "blocked",
        message: "YouTube asked yt-dlp to sign in (sandbox IP / bot detection). Trend Scout does not auto-bypass this — open the video manually and we'll fall back to search-only source cards.",
      };
    }
    if (msg.includes("No video formats") || msg.includes("Private video") || msg.includes("Video unavailable")) {
      return { status: "no_subtitles", message: msg };
    }
    return { status: "error", message: msg };
  } finally {
    // cleanup
    try {
      await fs.rm(workDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

/**
 * Parse a VTT transcript and pick 3 highest-attention moments:
 *   1. The first "strong claim" — a sentence containing high-signal words
 *   2. The moment after the longest pause (silence boundary)
 *   3. The "climax" — the segment with the densest concentration of strong words
 *
 * If no strong claims exist, we fall back to the first 3 caption segments — and
 * mark the reasons honestly so the UI can say "timestamp only, no semantic match".
 */
export function extractClipMoments(vtt: string, max = 3): ClipMoment[] {
  const segments = parseVtt(vtt);
  if (segments.length === 0) return [];

  const strongWords = [
    "but", "however", "actually", "the truth", "what nobody",
    "the secret", "here's why", "the problem", "the real", "what they",
    "the truth is", "nobody tells you", "the reason", "actually",
    "this is", "stop", "watch", "look at", "imagine", "if you",
    "the lie", "the myth", "the thing",
  ];

  // 1. First strong claim
  const strongIdx = segments.findIndex((s) => strongWords.some((w) => s.text.toLowerCase().includes(w)));
  const firstStrong: ClipMoment | null = strongIdx >= 0
    ? { timecode: formatTimecode(segments[strongIdx].start), reason: `Strong claim — "${truncate(segments[strongIdx].text, 70)}"` }
    : null;

  // 2. Longest pause — biggest gap between two consecutive segments
  let maxPause = 0;
  let pauseIdx = -1;
  for (let i = 1; i < segments.length; i++) {
    const pause = segments[i].start - segments[i - 1].end;
    if (pause > maxPause) {
      maxPause = pause;
      pauseIdx = i;
    }
  }
  const afterPause: ClipMoment | null = pauseIdx > 0 && maxPause >= 2
    ? { timecode: formatTimecode(segments[pauseIdx].start), reason: `Biggest pause in the video (${maxPause.toFixed(1)}s) — what comes next is usually the payoff.` }
    : null;

  // 3. Climax — segment with the highest density of strong words (sliding window of 3)
  let bestScore = 0;
  let bestIdx = -1;
  for (let i = 0; i < segments.length; i++) {
    let score = 0;
    for (let j = Math.max(0, i - 1); j <= Math.min(segments.length - 1, i + 1); j++) {
      const txt = segments[j].text.toLowerCase();
      for (const w of strongWords) if (txt.includes(w)) score += 1;
    }
    if (score >= bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  const climax: ClipMoment | null = bestIdx >= 0 && bestScore > 0
    ? { timecode: formatTimecode(segments[bestIdx].start), reason: `High-signal cluster — "${truncate(segments[bestIdx].text, 70)}"` }
    : null;

  // Deduplicate by timecode, keep order: firstStrong → afterPause → climax
  const seen = new Set<string>();
  const moments: ClipMoment[] = [];
  for (const m of [firstStrong, afterPause, climax]) {
    if (m && !seen.has(m.timecode)) {
      moments.push(m);
      seen.add(m.timecode);
    }
  }

  // Honest fallback: if we found fewer than max and segments exist, fill with the earliest segments
  while (moments.length < max && moments.length < segments.length) {
    const idx = moments.length;
    const s = segments[idx];
    const tc = formatTimecode(s.start);
    if (!seen.has(tc)) {
      moments.push({ timecode: tc, reason: `Timestamp only — no semantic match found in transcript.` });
      seen.add(tc);
    } else {
      break;
    }
  }

  return moments.slice(0, max);
}

// --- helpers ---

function runYtdlp(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(YT_DLP_BIN, args, { cwd: os.tmpdir() });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`yt-dlp timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}. Is YTDLP_BIN set correctly? (currently ${YT_DLP_BIN})`));
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

function parseNumber(s: string): number | undefined {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
}

interface VttSegment {
  start: number; // seconds
  end: number;
  text: string;
}

function parseVtt(vtt: string): VttSegment[] {
  const segments: VttSegment[] = [];
  const blocks = vtt.split(/\r?\n\r?\n/);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter((l) => l.trim());
    // find the line that looks like "00:00:01.234 --> 00:00:05.678"
    const cueLineIdx = lines.findIndex((l) => l.includes("-->"));
    if (cueLineIdx === -1) continue;
    const cueLine = lines[cueLineIdx];
    const m = cueLine.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
    if (!m) continue;
    const start = vttTimeToSeconds(m[1]);
    const end = vttTimeToSeconds(m[2]);
    // text is the lines after the cue line
    const text = lines.slice(cueLineIdx + 1).join(" ").replace(/<[^>]+>/g, "").trim();
    if (text) segments.push({ start, end, text });
  }
  return segments;
}

function vttTimeToSeconds(t: string): number {
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

function formatTimecode(seconds: number): string {
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

/** Check if yt-dlp is available on this machine. */
export async function isYtdlpAvailable(): Promise<boolean> {
  try {
    await runYtdlp(["--version"], 5_000);
    return true;
  } catch {
    return false;
  }
}
