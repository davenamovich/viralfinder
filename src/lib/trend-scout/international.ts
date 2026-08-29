/**
 * International adaptation recommender.
 *
 * For each trend, recommends the best markets to adapt it for. Uses a small
 * cultural-fluency rule set per language, plus the LLM to actually rewrite
 * the angle + hook for cultural relevance (never word-for-word translation).
 *
 * Falls back to a deterministic cultural note when the LLM is unavailable.
 */

import ZAI from "z-ai-web-dev-sdk";
import { cacheReadThrough, TTL } from "./cache";
import type {
  InternationalAdaptation,
  TrendOpportunity,
} from "./types";
import { languageLabel } from "./types";

interface MarketCandidate {
  language: string;
  angleHint: string;
}

const MARKETS_BY_COUNTRY: Record<string, MarketCandidate[]> = {
  US: [
    { language: "es", angleHint: "job mobility and opportunity angle" },
    { language: "pt", angleHint: "creator and side-income angle" },
    { language: "de", angleHint: "productivity and workforce-change angle" },
    { language: "hi", angleHint: "skills and global work angle" },
  ],
  BR: [
    { language: "en", angleHint: "global tech and creator angle" },
    { language: "es", angleHint: "LATAM economic-mobility angle" },
    { language: "pt", angleHint: "primary market" },
  ],
  IN: [
    { language: "en", angleHint: "global work and skills angle" },
    { language: "hi", angleHint: "primary market" },
    { language: "es", angleHint: "remittance and mobility angle" },
  ],
  GB: [
    { language: "en", angleHint: "primary market" },
    { language: "es", angleHint: "European labor angle" },
    { language: "fr", angleHint: "channel-crossing European angle" },
  ],
  DE: [
    { language: "de", angleHint: "primary market" },
    { language: "en", angleHint: "global tech angle" },
    { language: "tr", angleHint: "diaspora and migration angle" },
  ],
  JP: [
    { language: "ja", angleHint: "primary market" },
    { language: "en", angleHint: "global culture angle" },
    { language: "ko", angleHint: "East Asian trend angle" },
  ],
  KR: [
    { language: "ko", angleHint: "primary market" },
    { language: "en", angleHint: "global culture angle" },
    { language: "ja", angleHint: "East Asian trend angle" },
  ],
  MX: [
    { language: "es", angleHint: "primary market" },
    { language: "en", angleHint: "cross-border economy angle" },
    { language: "pt", angleHint: "LATAM tech angle" },
  ],
};

const DEFAULT_MARKETS: MarketCandidate[] = [
  { language: "es", angleHint: "Spanish-language LATAM adaptation" },
  { language: "pt", angleHint: "Brazilian Portuguese adaptation" },
  { language: "hi", angleHint: "Hindi-language adaptation" },
];

export interface InternationalResult {
  adaptations: InternationalAdaptation[];
  source: "llm" | "fallback";
  raw?: string;
}

export async function recommendInternational(
  trend: TrendOpportunity,
): Promise<InternationalResult> {
  const cacheKey = `intl:${trend.id}:${trend.language}`;
  return cacheReadThrough(cacheKey, TTL.INTERNATIONAL, async () => {
    const markets = (MARKETS_BY_COUNTRY[trend.country] ?? DEFAULT_MARKETS).slice(0, 4);
    try {
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: "assistant",
            content: `You are the international adaptation lead for the Plunder & Riffle Thought Engine.
You take a trending topic and produce culturally-fluent adaptations for new markets — never word-for-word translations.

Return JSON only with this shape:
{
  "adaptations": [
    {
      "language": "<2-letter code>",
      "angle": "<1–2 sentences — the cultural angle that will travel in that market>",
      "hook": "<1 sentence — the first-3-second hook in that market's idiom>",
      "culturalNote": "<1 sentence — the local context that makes the angle land>"
    }
  ]
}

Rules:
- Pick ONE angle per market. Be specific.
- Do not translate the original hook. Rewrite it.
- The cultural note must be a real local context (a current event, a tension, a meme format, a public figure, a platform idiom) — not generic.
- Keep each field under 280 characters.`,
          },
          {
            role: "user",
            content: buildUserPrompt(trend, markets),
          },
        ],
        thinking: { type: "disabled" },
      });
      const raw = completion.choices[0]?.message?.content ?? "";
      const adaptations = parseAdaptations(raw, trend, markets);
      return { adaptations, source: "llm", raw };
    } catch (err) {
      console.warn("[trend-scout] LLM intl failed, using fallback:", err);
      return {
        adaptations: markets.map((m) => fallbackAdaptation(trend, m)),
        source: "fallback",
      };
    }
  });
}

function buildUserPrompt(t: TrendOpportunity, markets: MarketCandidate[]): string {
  const marketLines = markets.map((m) => `- ${m.language} (${languageLabel(m.language)}): ${m.angleHint}`).join("\n");
  return `Trend: ${t.title}
Original country: ${t.countryLabel}
Original language: ${t.languageLabel}
Original emotion: ${t.audienceEmotion}
Niche: ${t.niche}

Adapt for these markets:
${marketLines}

Return JSON only.`;
}

function parseAdaptations(
  raw: string,
  trend: TrendOpportunity,
  markets: MarketCandidate[],
): InternationalAdaptation[] {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return markets.map((m) => fallbackAdaptation(trend, m));
  try {
    const obj = JSON.parse(jsonMatch[0]) as {
      adaptations?: { language: string; angle: string; hook: string; culturalNote: string }[];
    };
    if (!obj.adaptations || !Array.isArray(obj.adaptations)) {
      return markets.map((m) => fallbackAdaptation(trend, m));
    }
    return obj.adaptations.map((a) => ({
      language: a.language,
      languageLabel: languageLabel(a.language) ?? a.language,
      angle: a.angle,
      culturalNote: a.culturalNote,
      hook: a.hook,
    }));
  } catch {
    return markets.map((m) => fallbackAdaptation(trend, m));
  }
}

function fallbackAdaptation(t: TrendOpportunity, m: MarketCandidate): InternationalAdaptation {
  return {
    language: m.language,
    languageLabel: languageLabel(m.language),
    angle: `Adapt "${t.title}" for the ${languageLabel(m.language)}-speaking audience using the ${m.angleHint}. Reframe, do not translate.`,
    culturalNote: `The ${languageLabel(m.language)} audience responds to local context — pick one current local reference and anchor the hook to it.`,
    hook: `Replace the English hook with a ${languageLabel(m.language)}-idiom equivalent that carries the same emotional weight as: "${t.firstHook}"`,
  };
}
