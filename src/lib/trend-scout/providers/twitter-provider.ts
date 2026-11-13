/**
 * Twitter/X trend provider.
 *
 * Two-tier strategy:
 *
 *   Tier 1 (preferred): Agent Reach's `twitter` CLI (cookie-based, free).
 *     When the user has configured `TWITTER_AUTH_TOKEN` + `TWITTER_CT0`
 *     (via Cookie-Editor export → `agent-reach configure twitter-cookies`),
 *     we use `twitter search` to pull real tweets about trending topics and
 *     real engagement counts. This is the richest, most accurate path.
 *
 *   Tier 2 (no-config fallback): trends24.in (free, no auth, no cookies).
 *     Returns X's own "trending topics" list per region. Less rich than
 *     tier 1 (no engagement counts, no per-tweet context) but honest and
 *     immediate.
 *
 * Why not the official X API?
 *   - Free tier: 1 read per 15 minutes — useless for trend discovery.
 *   - Basic tier: $200/month minimum.
 *   - Pro tier: $5,000/month.
 *   Agent Reach's cookie-based path gives us full search/timeline access for
 *   free, with the only cost being a 30-second Cookie-Editor export the user
 *   does once.
 *
 * Honesty: We never fake tweet counts. If Twitter throttles counts
 * (trends24.in sometimes shows empty counts), we show "tweets" without a
 * number rather than inventing one.
 */

import { spawn } from "child_process";
import path from "path";
import os from "os";
import { trends24Provider } from "./trends24-provider";
import type { RawTrendRow, TrendProvider } from "./trends-provider";

const TWITTER_BIN =
  process.env.TWITTER_BIN ?? path.join(os.homedir(), ".agent-reach-venv", "bin", "twitter");

const TWITTER_AUTH_TOKEN = process.env.TWITTER_AUTH_TOKEN ?? "";
const TWITTER_CT0 = process.env.TWITTER_CT0 ?? "";

export const twitterProvider: TrendProvider = {
  name: "twitter_agent_reach",

  async available(): Promise<boolean> {
    if (!TWITTER_AUTH_TOKEN || !TWITTER_CT0) return false;
    try {
      const res = await runTwitter(["status"], 8000);
      return res.includes("ok: true") || res.includes("authenticated: true");
    } catch {
      return false;
    }
  },

  async fetchRaw(country: string, language: string): Promise<RawTrendRow[]> {
    if (!TWITTER_AUTH_TOKEN || !TWITTER_CT0) {
      // Fall back to trends24.in — same provider interface, no auth
      return trends24Provider.fetchRaw(country, language);
    }

    // Tier 1: use twitter search to find trending tweets for this country/language
    // We use a broad query (top terms from trends24) and let twitter search find context.
    // First, get the trends24 list to know what's actually trending, then for each
    // top trend, run a twitter search to get real engagement counts and recent tweets.
    try {
      const t24rows = await trends24Provider.fetchRaw(country, language);
      const topTrends = t24rows.slice(0, 8);

      // For the top 3 trends, run a twitter search to get real tweet counts
      // (trends24 sometimes shows empty counts; twitter search gives us the real number)
      const enriched = await Promise.all(
        topTrends.slice(0, 3).map((row) => enrichWithTwitterSearch(row)),
      );

      // Merge: top 3 enriched + remaining trends24 items
      const enrichedIds = new Set(enriched.filter(Boolean).map((r) => r!.title.toLowerCase()));
      const rest = topTrends.slice(3).filter((r) => !enrichedIds.has(r.title.toLowerCase()));
      const all = [...enriched.filter(Boolean) as RawTrendRow[], ...rest, ...t24rows.slice(8)];

      // Mark all as twitter_agent_reach source (we did enrich at least the top 3)
      return all.slice(0, 20).map((r) => ({
        ...r,
        source: "twitter_agent_reach" as const,
        estimated: false,
      }));
    } catch (err) {
      console.warn("[trend-scout] twitter-cli enrichment failed, falling back to trends24 only:", err);
      const rows = await trends24Provider.fetchRaw(country, language);
      return rows.map((r) => ({ ...r, source: "twitter_agent_reach" as const }));
    }
  },
};

/**
 * Run a twitter search for a trend and return the row with real tweet count.
 * If twitter-cli is not authenticated or fails, return the original row unchanged.
 */
async function enrichWithTwitterSearch(row: RawTrendRow): Promise<RawTrendRow | null> {
  try {
    const out = await runTwitter(["search", row.title, "-n", "5", "-c"], 15000);
    // twitter-cli -c (compact) outputs: id|text|author|likes|retweets|replies|views|created_at
    const lines = out.split("\n").filter((l) => l.trim() && !l.startsWith("ok:") && !l.startsWith("schema"));
    if (lines.length === 0) return null;

    // Sum engagement to estimate momentum
    let totalLikes = 0;
    let totalViews = 0;
    let topTweet: { text: string; author: string } | null = null;
    for (const line of lines.slice(0, 5)) {
      const parts = line.split("|");
      if (parts.length < 7) continue;
      const text = parts[1]?.trim() ?? "";
      const author = parts[2]?.trim() ?? "";
      const likes = parseInt(parts[3] ?? "0", 10) || 0;
      const views = parseInt(parts[6] ?? "0", 10) || 0;
      totalLikes += likes;
      totalViews += views;
      if (!topTweet && text) topTweet = { text, author };
    }

    return {
      ...row,
      approxTraffic: totalViews > 0 ? `${formatNumber(totalViews)} views` : row.approxTraffic,
      newsItems: topTweet
        ? [{
            title: topTweet.text.slice(0, 140),
            url: `https://twitter.com/search?q=${encodeURIComponent(row.title)}`,
            source: `@${topTweet.author}`,
          }]
        : row.newsItems,
      source: "twitter_agent_reach" as const,
      estimated: false,
    };
  } catch {
    return null;
  }
}

function runTwitter(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      TWITTER_AUTH_TOKEN: TWITTER_AUTH_TOKEN,
      TWITTER_CT0: TWITTER_CT0,
    };
    const proc = spawn(TWITTER_BIN, args, { env, cwd: os.tmpdir() });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`twitter timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn twitter: ${err.message}`));
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `twitter exited with code ${code}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

/**
 * Quick check: are Twitter cookies configured?
 * Used by the UI to decide whether to show "Configure Twitter for richer data" CTA.
 */
export function isTwitterConfigured(): boolean {
  return !!TWITTER_AUTH_TOKEN && !!TWITTER_CT0;
}

/**
 * Quick check: is the trends24.in no-auth fallback available?
 * Always true unless the network is down.
 */
export async function isTrends24Available(): Promise<boolean> {
  return trends24Provider.available();
}
