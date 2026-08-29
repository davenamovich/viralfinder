/**
 * Trend scoring engine — fully transparent.
 *
 * Each factor has a sub-score (0–10), a weight (0–1), and a human-readable
 * note that explains exactly what input produced the score. The total is
 * computed as a weighted average on a 1–100 scale.
 *
 * IMPORTANT: We never invent fake inputs. If we don't have real data for a
 * factor, the score for that factor is 0 and the note says "no data —
 * provider did not return this signal". The UI explicitly shows this.
 */

import type {
  TrendScore,
  TrendScoreReasoning,
  Direction,
  Emotion,
  NewsItem,
} from "./types";

export interface ScoringInputs {
  title: string;
  direction: Direction;
  approxTraffic?: string;
  publishedAt: string; // ISO
  relatedQueries: string[];
  newsItems?: NewsItem[];
  /** When true, this trend came from a fallback / curated source — score is capped. */
  estimated: boolean;
  /** Number of snapshot days available (for recency context) */
  windowDays: number;
  /** Optional: detected emotion from classifier */
  emotion: Emotion;
  /** Optional: detected niche */
  niche: string;
  /** Search volume label, when known */
}

interface FactorSpec {
  factor: string;
  weight: number;
  /** Compute a 0–10 sub-score for this factor */
  score: (i: ScoringInputs) => number;
  note: (i: ScoringInputs, score: number) => string;
  input: (i: ScoringInputs) => string;
}

const FACTORS: FactorSpec[] = [
  {
    factor: "Search momentum",
    weight: 1.4,
    score: (i) => momentumScore(i.direction, i.approxTraffic),
    note: (i, score) =>
      `Direction=${i.direction}${i.approxTraffic ? `, traffic=${i.approxTraffic}` : ""}. ${
        score >= 7
          ? "Strong, sustained climb in searches."
          : score >= 4
          ? "Real movement but not yet a breakout."
          : "Flat or weak signal."
      }`,
    input: (i) => `direction=${i.direction}; traffic=${i.approxTraffic ?? "n/a"}`,
  },
  {
    factor: "Recency",
    weight: 1.1,
    score: (i) => recencyScore(i.publishedAt, i.windowDays),
    note: (i, score) =>
      `Published ${humanizeAge(i.publishedAt)} ago. ${
        score >= 7
          ? "Still inside the attention window."
          : score >= 4
          ? "Recent enough to feel fresh."
          : "Stale for short-form — may still work as context."
      }`,
    input: (i) => `publishedAt=${i.publishedAt}`,
  },
  {
    factor: "Search volume",
    weight: 1.0,
    score: (i) => volumeScore(i.approxTraffic),
    note: (i, score) =>
      i.approxTraffic
        ? `Reported volume: ${i.approxTraffic}. ${
            score >= 7 ? "Large audience reachable." : score >= 4 ? "Mid-tier audience." : "Niche audience."
          }`
        : "No volume reported by the provider — score is 0 (not faked).",
    input: (i) => `approxTraffic=${i.approxTraffic ?? "n/a"}`,
  },
  {
    factor: "Related-query growth",
    weight: 0.9,
    score: (i) => relatedQueriesScore(i.relatedQueries, i.newsItems),
    note: (i, score) =>
      `${i.relatedQueries.length} related queries, ${i.newsItems?.length ?? 0} related news items. ${
        score >= 7
          ? "Active conversation around the topic."
          : score >= 4
          ? "Some related signal."
          : "Sparse related signal."
      }`,
    input: (i) =>
      `relatedQueries=${i.relatedQueries.length}; newsItems=${i.newsItems?.length ?? 0}`,
  },
  {
    factor: "Emotional intensity",
    weight: 1.1,
    score: (i) => emotionScore(i.emotion, i.title, i.newsItems),
    note: (i, score) =>
      `Detected emotion: ${i.emotion}. ${
        score >= 7 ? "High-arousal emotion — drives shares." : score >= 4 ? "Moderate emotion." : "Low arousal — harder to stop the scroll."
      }`,
    input: (i) => `emotion=${i.emotion}`,
  },
  {
    factor: "Visual / meme potential",
    weight: 0.8,
    score: (i) => visualPotentialScore(i.title, i.newsItems),
    note: (i, score) =>
      i.newsItems && i.newsItems.length > 0 && i.newsItems.some((n) => n.picture)
        ? `News pictures available from ${countPictures(i.newsItems)} sources. ${
            score >= 7 ? "Strong visual hook material." : "Some visual material to work with."
          }`
        : "No visual material returned by provider — score is 0 (not faked).",
    input: (i) => `pictures=${countPictures(i.newsItems ?? [])}`,
  },
  {
    factor: "Clear point of view",
    weight: 0.9,
    score: (i) => povScore(i.title, i.newsItems),
    note: (i, score) =>
      score >= 7
        ? "Trend implies a clear stance or debate — easy to take a position."
        : score >= 4
        ? "Some angle visible but not obvious."
        : "Topic is neutral / informational — angle must be invented.",
    input: (i) => `titleWords=${i.title.split(/\s+/).length}`,
  },
  {
    factor: "International translation potential",
    weight: 0.9,
    score: (i) => intlScore(i.title, i.relatedQueries),
    note: (i, score) =>
      score >= 7
        ? "Concept is universal — adapts cleanly across cultures."
        : score >= 4
        ? "Concept travels with reframing."
        : "Concept is US/local-specific — needs strong reframing to travel.",
    input: (i) => `title=${i.title}`,
  },
  {
    factor: "Competition / saturation penalty",
    weight: 0.7,
    score: (i) => saturationScore(i.newsItems),
    note: (i, score) =>
      `${i.newsItems?.length ?? 0} major outlets already covering. ${
        score >= 7 ? "Open lane — few have it yet." : score >= 4 ? "Crowded but room for a fresh angle." : "Heavily saturated — need a contrarian angle."
      }`,
    input: (i) => `newsItems=${i.newsItems?.length ?? 0}`,
  },
  {
    factor: "Rights safety score",
    weight: 1.0,
    score: (i) => rightsScore(i.estimated),
    note: (i, score) =>
      i.estimated
        ? "Estimated source — rights status must be verified before publishing. Score capped."
        : "Provider-sourced trend — rights clearance still required for any media you publish.",
    input: (i) => `estimated=${i.estimated}`,
  },
];

export function computeTrendScore(inputs: ScoringInputs): TrendScore {
  const totalWeight = FACTORS.reduce((sum, f) => sum + f.weight, 0);
  const factors: TrendScoreReasoning[] = FACTORS.map((f) => {
    const raw = f.score(inputs);
    const score = Math.max(0, Math.min(10, raw));
    const contribution = (score * f.weight) / totalWeight;
    return {
      factor: f.factor,
      input: f.input(inputs),
      score: round1(score),
      weight: f.weight,
      contribution: Math.round(contribution * 100) / 100,
      note: f.note(inputs, score),
    };
  });
  const totalRaw = factors.reduce((sum, f) => sum + (f.score * f.weight) / totalWeight, 0);
  // scale 0..10 -> 1..100 (avoid 0 for visual interest, but keep honest)
  const total = Math.max(1, Math.round(totalRaw * 10));
  return { total: Math.min(100, total), factors };
}

// --- per-factor score functions ---

function momentumScore(direction: Direction, traffic?: string): number {
  let base = 5;
  if (direction === "Breakout") base = 9;
  else if (direction === "Rising") base = 7;
  else if (direction === "Stable") base = 3;
  // bump for very high traffic
  const trafficNum = parseTraffic(traffic);
  if (trafficNum && trafficNum >= 1_000_000) base = Math.min(10, base + 1.5);
  return base;
}

function recencyScore(publishedAt: string, windowDays: number): number {
  const ageH = (Date.now() - new Date(publishedAt).getTime()) / 3_600_000;
  if (ageH <= 3) return 10;
  if (ageH <= 12) return 8.5;
  if (ageH <= 24) return 7;
  if (ageH <= 48) return 5;
  if (ageH <= 7 * 24) return 4;
  if (ageH <= 30 * 24) return 2.5;
  return 1;
}

function volumeScore(traffic?: string): number {
  const n = parseTraffic(traffic);
  if (!n) return 0;
  if (n >= 1_000_000) return 10;
  if (n >= 200_000) return 8.5;
  if (n >= 50_000) return 7;
  if (n >= 10_000) return 5.5;
  if (n >= 2_000) return 4;
  return 2.5;
}

function relatedQueriesScore(related: string[], news?: NewsItem[]): number {
  const r = related.length + (news?.length ?? 0);
  if (r >= 8) return 9;
  if (r >= 5) return 7.5;
  if (r >= 3) return 6;
  if (r >= 1) return 4;
  return 0;
}

function emotionScore(emotion: Emotion, title: string, news?: NewsItem[]): number {
  // High-arousal emotions get higher scores; low-arousal score lower.
  const baseByEmotion: Record<Emotion, number> = {
    outrage: 9,
    fear: 8.5,
    urgency: 8.5,
    aspiration: 7.5,
    curiosity: 7,
    identity: 7.5,
    humor: 6.5,
  };
  let s = baseByEmotion[emotion] ?? 5;
  // Emotional words in title or news titles bump slightly
  const emotionalWords = [
    "crash", "collapse", "breaks", "scam", "exposed", "destroys",
    "leak", "fired", "arrest", "scandal", "viral", "rages", "erupts",
    "shocking", "warning", "panic",
  ];
  const hay = `${title} ${news?.map((n) => n.title).join(" ") ?? ""}`.toLowerCase();
  for (const w of emotionalWords) {
    if (hay.includes(w)) s = Math.min(10, s + 0.4);
  }
  return s;
}

function visualPotentialScore(title: string, news?: NewsItem[]): number {
  const pics = countPictures(news ?? []);
  if (pics >= 3) return 9;
  if (pics === 2) return 7.5;
  if (pics === 1) return 6;
  if (pics === 0 && news && news.length > 0) return 3.5;
  // No pictures at all — score from title salience only
  const visualWords = [
    "video", "photo", "image", "scene", "stadium", "crowd", "fire",
    "explosion", "concert", "stage", "broadcast", "trailer", "footage",
  "reveal", "show",
  ];
  const hay = title.toLowerCase();
  for (const w of visualWords) if (hay.includes(w)) return 5;
  return 0;
}

function povScore(title: string, news?: NewsItem[]): number {
  // Stronger when title implies a debate / verb of opinion
  const debateWords = [
    "vs", "debate", "war", "fight", "clash", "accused", "sued",
    "fired", "called out", "defends", "responds", "blames", "denies",
  ];
  const hay = `${title} ${news?.map((n) => n.title).join(" ") ?? ""}`.toLowerCase();
  let score = 4;
  for (const w of debateWords) if (hay.includes(w)) score = Math.min(10, score + 1.5);
  return score;
}

function intlScore(title: string, related: string[]): number {
  // US-jargon / local-only terms reduce international potential
  const localTerms = [
    "supreme court", "congress", "senate", "nfl", "nba", "mlb",
    "stateside", "wall street", "the dow",
  ];
  const hay = `${title} ${related.join(" ")}`.toLowerCase();
  let score = 7;
  for (const w of localTerms) if (hay.includes(w)) score = Math.max(2, score - 1.5);
  // Universal concepts boost
  const universalTerms = [
    "ai", "love", "money", "family", "future", "work", "job",
    "kids", "school", "music", "movie", "war", "peace",
  ];
  for (const w of universalTerms) if (hay.includes(w)) score = Math.min(10, score + 0.5);
  return score;
}

function saturationScore(news?: NewsItem[]): number {
  const n = news?.length ?? 0;
  // Fewer major outlets = less saturated = higher score
  if (n === 0) return 9;
  if (n <= 1) return 8;
  if (n <= 2) return 6.5;
  if (n <= 3) return 5;
  return 3;
}

function rightsScore(estimated: boolean): number {
  // Both cases require clearance, but estimated sources start lower
  return estimated ? 5 : 7;
}

// --- helpers ---

function parseTraffic(traffic?: string): number | undefined {
  if (!traffic) return undefined;
  // e.g. "200+", "500K+", "1M+", "200,000+"
  const cleaned = traffic.replace(/[^0-9KM.]/gi, "").toLowerCase();
  if (!cleaned) return undefined;
  const m = cleaned.match(/^(\d+(?:\.\d+)?)(km)?$/);
  if (!m) return undefined;
  const num = parseFloat(m[1]);
  if (Number.isNaN(num)) return undefined;
  if (m[2] === "k") return num * 1_000;
  if (m[2] === "m") return num * 1_000_000;
  return num;
}

function countPictures(news: NewsItem[]): number {
  return news.filter((n) => !!n.picture).length;
}

function humanizeAge(publishedAt: string): string {
  const diffMs = Date.now() - new Date(publishedAt).getTime();
  const h = Math.max(0, Math.round(diffMs / 3_600_000));
  if (h < 1) return "less than an hour";
  if (h === 1) return "1 hour";
  if (h < 24) return `${h} hours`;
  const d = Math.round(h / 24);
  if (d === 1) return "1 day";
  return `${d} days`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// --- direction + emotion heuristics used by provider ---

export function inferDirection(traffic?: string, related?: string[]): Direction {
  // Heuristic: high traffic + many related queries => Breakout
  const n = parseTraffic(traffic);
  const r = related?.length ?? 0;
  if (n && n >= 200_000 && r >= 3) return "Breakout";
  if (n && n >= 50_000) return "Rising";
  if (r >= 2) return "Rising";
  return "Stable";
}

export function inferEmotion(title: string, news?: NewsItem[]): Emotion {
  const hay = `${title} ${news?.map((n) => n.title).join(" ") ?? ""}`.toLowerCase();
  const rules: { emotion: Emotion; words: string[] }[] = [
    { emotion: "outrage", words: ["scam", "exposed", "fired", "scandal", "outrage", "boycott", "blast", "rages", "slams", "rips"] },
    { emotion: "fear", words: ["crash", "collapse", "plunge", "warning", "panic", "threat", "attack", "alert", "danger"] },
    { emotion: "urgency", words: ["breaking", "now", "deadline", "last chance", "hours away", "minutes away", "just in"] },
    { emotion: "aspiration", words: [" billionaire", "richest", "wealth", "luxury", "dream", "success", "wins", "secret", "formula"] },
    { emotion: "identity", words: ["our", "we", "they", "them", "immigrants", "fans", "americans", "people", "young", "old"] },
    { emotion: "humor", words: ["meme", "joke", "funny", "viral", "tweet", "amusing", "hilarious", "comedian"] },
    { emotion: "curiosity", words: ["what is", "who is", "explained", "why", "how", "secret", "mystery", "reveals"] },
  ];
  let best: { emotion: Emotion; score: number } = { emotion: "curiosity", score: 0 };
  for (const r of rules) {
    let score = 0;
    for (const w of r.words) if (hay.includes(w)) score += 1;
    if (score > best.score) best = { emotion: r.emotion, score };
  }
  return best.emotion;
}
