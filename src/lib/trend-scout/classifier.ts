/**
 * Niche classifier — maps a raw Google Trends item into one of the P&R
 * niches (Business, AI, Crypto, …) using keyword heuristics on the trend
 * title + its related news titles. Pure function, no network, no LLM.
 *
 * This is intentionally transparent — when a trend falls into "Other", the
 * UI shows that the classifier didn't have enough signal to bin it.
 */

import type { Niche } from "./types";

const NICHE_KEYWORDS: Record<Exclude<Niche, "Other">, string[]> = {
  AI: [
    "ai", "gpt", "openai", "chatgpt", "anthropic", "claude", "gemini",
    "llm", "machine learning", "neural", "deepmind", "diffusion",
    "midjourney", "stable diffusion", "sora", "agent", "model",
    "copilot", "prompt", "transformer",
  ],
  Crypto: [
    "crypto", "bitcoin", "btc", "ethereum", "eth", "solana", "sol",
    "nft", "blockchain", "defi", "coinbase", "binance", "kraken",
    "altcoin", "token", "web3", "dao", "stablecoin", "doge", "shib",
  ],
  Business: [
    "ipo", "stock", "earnings", "merger", "acquisition", "layoff",
    "layoffs", "fed", "interest rate", "inflation", "s&p", "dow",
    "nasdaq", "earnings call", "ceo", "cfo", "board", "buyout",
    "valuation", "private equity", "hedge fund", "bull market", "bear market",
  ],
  "Small Business": [
    "small business", "shopify", "etsy", "main street", "local shop",
    "smallbiz", "sba", "side hustle", "freelance", "contractor",
    "sole proprietor", "mom and pop",
  ],
  "Creator Economy": [
    "creator", "youtuber", "tiktok", "instagram", "influencer",
    "twitch", "streamer", "podcast", "substack", "patreon", "kick",
    "creator fund", "monetization", "vlogger", "content creator",
  ],
  "E-commerce": [
    "amazon", "walmart", "shein", "temu", "shopify", "ebay", "aliexpress",
    "prime day", "black friday", "cyber monday", "dropship", "shopper",
    "checkout", "subscription", "shipping", "delivery",
  ],
  "Real Estate": [
    "real estate", "housing", "mortgage", "rent", "zillow", "redfin",
    "home prices", "foreclosure", "airbnb", "landlord", "tenant",
    "housing market", "property",
  ],
  Fitness: [
    "workout", "gym", "fitness", "yoga", "pilates", "crossfit", "weight loss",
    "marathon", "bodybuilding", "running", "calisthenics", "diet",
    "nutrition", "wellness", "strength training",
  ],
  Motivation: [
    "motivation", "discipline", "hustle", "grind", "success", "mindset",
    "self help", "self-help", "self improvement", "productivity",
    "stoicism", "habits", "goals", "morning routine", "focus",
  ],
  "Local News": [
    "city council", "mayor", "county", "police", "fire", "shooting",
    "incident", "storm", "hurricane", "wildfire", "earthquake", "flood",
    "blackout", "outage", "school district", "road closure", "arrest",
  ],
};

const NICHE_ORDER: Exclude<Niche, "Other">[] = [
  "AI",
  "Crypto",
  "Creator Economy",
  "E-commerce",
  "Small Business",
  "Business",
  "Real Estate",
  "Fitness",
  "Motivation",
  "Local News",
];

const LOWER_PRIORITY_FALLBACKS = ["Entertainment", "Sports", "Politics"];

export interface NicheClassification {
  niche: Niche;
  confidence: number; // 0–1
  matchedKeywords: string[];
  signal: "strong" | "weak" | "none";
}

export function classifyNiche(
  title: string,
  relatedTitles: string[] = [],
): NicheClassification {
  const haystack = `${title} ${relatedTitles.join(" ")}`.toLowerCase();

  let best: { niche: Exclude<Niche, "Other">; score: number; matched: string[] } = {
    niche: "Business",
    score: 0,
    matched: [],
  };

  for (const niche of NICHE_ORDER) {
    const keywords = NICHE_KEYWORDS[niche];
    const matched: string[] = [];
    for (const k of keywords) {
      const re = new RegExp(`\\b${escapeRegExp(k)}\\b`, "i");
      if (re.test(haystack)) matched.push(k);
    }
    if (matched.length > best.score) {
      best = { niche, score: matched.length, matched };
    }
  }

  if (best.score === 0) {
    return {
      niche: "Other",
      confidence: 0,
      matchedKeywords: [],
      signal: "none",
    };
  }

  // confidence heuristic: 1 match = 0.55, 2 = 0.75, 3+ = 0.9
  const confidence =
    best.score >= 3 ? 0.9 : best.score === 2 ? 0.75 : 0.55;

  return {
    niche: best.niche,
    confidence,
    matchedKeywords: best.matched,
    signal: best.score >= 2 ? "strong" : "weak",
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
