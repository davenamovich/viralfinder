/**
 * Exa MCP adapter for the P&R Trend Scout.
 *
 * Exa is configured as an MCP server via Agent Reach (`mcporter config add exa`).
 * We call it via the `mcporter` CLI to keep things simple (no MCP client SDK
 * dependency in the Next.js app).
 *
 * Used to enrich the brief generator with real-time web context (news, blog
 * posts, opinion pieces) that goes beyond what Google Trends RSS returns.
 */

import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import { cacheReadThrough, TTL } from "./cache";
import { withRateLimit } from "./rate-limit";

const promisifiedExec = promisify(exec);

const MCPORTer_BIN =
  process.env.MCPORTER_BIN ?? path.join(os.homedir(), ".npm-global", "bin", "mcporter");

export interface ExaResult {
  title: string;
  url: string;
  publishedDate?: string;
  author?: string;
  highlights?: string;
  text?: string;
}

export interface ExaSearchResult {
  results: ExaResult[];
  status: "ok" | "error" | "unavailable";
  message?: string;
}

/**
 * Search the web via Exa. Caches for 1 hour so repeat calls for the same
 * trend are free.
 */
export async function exaSearch(
  query: string,
  numResults = 5,
): Promise<ExaSearchResult> {
  const cacheKey = `exa:${query}:${numResults}`;
  return cacheReadThrough(cacheKey, TTL.BRIEF, async () => {
    try {
      const out = await callMcporter([
        "call", "exa.web_search_exa",
        `query=${query}`,
        `numResults=${numResults}`,
      ], 30_000);

      return parseExaOutput(out);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("not found") || msg.includes("ENOENT") || msg.includes("mcporter")) {
        return {
          results: [],
          status: "unavailable",
          message: "mcporter or Exa MCP not configured. Install via Agent Reach.",
        };
      }
      return { results: [], status: "error", message: msg };
    }
  });
}

/**
 * Fetch full text of specific URLs (best for after exaSearch when we want
 * to read a particular article).
 */
export async function exaFetch(
  urls: string[],
  maxCharacters = 4000,
): Promise<ExaSearchResult> {
  const cacheKey = `exafetch:${urls.join(",")}:${maxCharacters}`;
  return cacheReadThrough(cacheKey, TTL.BRIEF, async () => {
    try {
      const args = ["call", "exa.web_fetch_exa"];
      // mcporter accepts array values as `key=value` flags
      for (const u of urls) args.push(`urls=${u}`);
      args.push(`maxCharacters=${maxCharacters}`);
      const out = await callMcporter(args, 30_000);
      return parseExaOutput(out);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { results: [], status: "error", message: msg };
    }
  });
}

export async function isExaAvailable(): Promise<boolean> {
  try {
    await callMcporter(["list", "exa"], 10_000);
    return true;
  } catch {
    return false;
  }
}

// --- helpers ---

function callMcporter(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const cmd = `"${MCPORTer_BIN}" ${args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(" ")}`;
    promisifiedExec(cmd, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 })
      .then(({ stdout }) => resolve(stdout))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        reject(new Error(msg));
      });
  });
}

function parseExaOutput(stdout: string): ExaSearchResult {
  // mcporter prints results as plain text — typically:
  //   Title: <title>
  //   URL: <url>
  //   Published: <date>
  //   Author: <author>
  //   Highlights:
  //   <highlights text>
  //   ---
  //   Title: ...

  const blocks = stdout.split(/\n---+\n/).filter((b) => b.trim());
  const results: ExaResult[] = [];
  for (const block of blocks) {
    const titleMatch = block.match(/^Title:\s*(.+)$/m);
    const urlMatch = block.match(/^URL:\s*(.+)$/m);
    const publishedMatch = block.match(/^Published:\s*(.+)$/m);
    const authorMatch = block.match(/^Author:\s*(.+)$/m);
    const highlightsIdx = block.indexOf("Highlights:");
    const highlights = highlightsIdx >= 0
      ? block.slice(highlightsIdx + "Highlights:".length).trim()
      : undefined;

    if (titleMatch && urlMatch) {
      results.push({
        title: titleMatch[1].trim(),
        url: urlMatch[1].trim(),
        publishedDate: publishedMatch?.[1]?.trim() || undefined,
        author: authorMatch?.[1]?.trim() || undefined,
        highlights,
      });
    }
  }
  return { results, status: "ok" };
}

/** Rate-limited Exa search — prevents hitting Exa too often from API routes. */
export async function exaSearchRateLimited(
  query: string,
  numResults = 5,
): Promise<ExaSearchResult> {
  const gate = withRateLimit("exa", 3, async () => exaSearch(query, numResults));
  const r = await gate;
  if (!r.ok) {
    return { results: [], status: "error", message: `Exa rate-limited: ${r.error}` };
  }
  return r.value;
}
