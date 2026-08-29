/**
 * Creative Intelligence — generates a content brief from a trend using the
 * z-ai-web-dev-sdk LLM. Falls back to a deterministic, structured brief if
 * the LLM is unavailable.
 *
 * The prompt is engineered to extract the tension / debate / aspiration /
 * useful takeaway / meme inside the trend — not to summarize the headline.
 *
 * Output is parsed into the structured ContentBrief shape so the UI can
 * render it consistently. The raw LLM output is also returned for display
 * inside the <details> disclosure so the user can audit what came from the
 * model vs. what was templated.
 */

import ZAI from "z-ai-web-dev-sdk";
import { cacheReadThrough, TTL } from "./cache";
import type { ContentBrief, ContentType, TrendOpportunity } from "./types";

const SYSTEM_PROMPT = `You are the creative director of the Plunder & Riffle Thought Engine.

Your job: take a single trending topic and turn it into a 30-second content brief
that is worth watching — not a summary of the headline.

Hard rules:
- Do not summarize the headline.
- Find the tension, the debate, the aspiration, the useful takeaway, or the meme
  inside the trend. Pick ONE and commit to it.
- The hook must work in the first 3 seconds or it loses.
- The script direction must be specific enough to shoot, not vague.
- The CTA must be one line and must invite a comment, save, or share — not a sale.
- The risk note must call out at least one real risk (rights, misinfo, audience
  backlash, cultural insensitivity, or platform demonetization).

Return JSON only, matching this exact shape:
{
  "realConversation": "1–2 sentences. What is the conversation people are actually having? Not the headline.",
  "contrarianOrUsefulAngle": "1–2 sentences. The specific angle this brief takes. Must be a stance, not a recap.",
  "audience": "1 sentence. The exact person this is for (be specific — not 'people interested in X').",
  "hook": "1 sentence. The first-3-second line. Direct, scroll-stopping, no clickbait cliches.",
  "scriptDirection": "3–5 sentences. How the 30-second version plays out: open, build, turn, payoff.",
  "visualTreatment": "1–2 sentences. Concrete visual approach (b-roll, on-screen text, single shot, etc.).",
  "cta": "1 sentence. What the viewer does after.",
  "riskNotes": "1–2 sentences. Real risks: rights, misinfo, backlash, cultural, monetization.",
  "suggestedLanguages": ["en", "..."] // 2–4 language codes that adapt cleanly
}

Be specific. Be honest. If you don't know something, say so. Never pad.`;

export interface BriefResult {
  brief: ContentBrief;
  source: "llm" | "fallback";
  raw?: string; // raw LLM output for transparency
}

export async function generateBrief(trend: TrendOpportunity): Promise<BriefResult> {
  const cacheKey = `brief:${trend.id}:${trend.language}`;
  return cacheReadThrough(cacheKey, TTL.BRIEF, async () => {
    try {
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: [
          { role: "assistant", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: userPrompt(trend),
          },
        ],
        thinking: { type: "disabled" },
      });
      const raw = completion.choices[0]?.message?.content ?? "";
      const parsed = parseBrief(raw, trend);
      return { brief: parsed, source: "llm", raw };
    } catch (err) {
      console.warn("[trend-scout] LLM brief failed, using fallback:", err);
      return { brief: fallbackBrief(trend), source: "fallback" };
    }
  });
}

function userPrompt(t: TrendOpportunity): string {
  const news = t.newsItems?.slice(0, 3).map((n) => `- ${n.title} (${n.source})`).join("\n") ?? "";
  return `Trend: ${t.title}
Country: ${t.countryLabel}
Language: ${t.languageLabel}
Niche: ${t.niche}
Emotion: ${t.audienceEmotion}
Direction: ${t.direction}
Approx traffic: ${t.approxTraffic ?? "unknown"}
Related queries: ${t.relatedQueries.join(", ") || "none"}
Suggested P&R format: ${t.suggestedFormat}

News context:
${news || "(no news items returned by provider)"}

Return JSON only.`;
}

function parseBrief(raw: string, t: TrendOpportunity): ContentBrief {
  // try to extract JSON object from the raw output
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return fallbackBrief(t);
  try {
    const obj = JSON.parse(jsonMatch[0]) as Partial<ContentBrief>;
    return {
      trend: t.title,
      realConversation: obj.realConversation ?? fallbackBrief(t).realConversation,
      contrarianOrUsefulAngle: obj.contrarianOrUsefulAngle ?? fallbackBrief(t).contrarianOrUsefulAngle,
      audience: obj.audience ?? fallbackBrief(t).audience,
      hook: obj.hook ?? t.firstHook,
      scriptDirection: obj.scriptDirection ?? fallbackBrief(t).scriptDirection,
      bestFormat: t.suggestedFormat,
      suggestedLanguages: obj.suggestedLanguages ?? defaultLanguagesFor(t.country),
      visualTreatment: obj.visualTreatment ?? fallbackBrief(t).visualTreatment,
      cta: obj.cta ?? fallbackBrief(t).cta,
      riskNotes: obj.riskNotes ?? fallbackBrief(t).riskNotes,
    };
  } catch {
    return fallbackBrief(t);
  }
}

function fallbackBrief(t: TrendOpportunity): ContentBrief {
  return {
    trend: t.title,
    realConversation: `People are talking about "${t.title}" right now, but the conversation is still mostly reaction — not analysis. The dominant emotion is ${t.audienceEmotion}, and most posts are restating the headline.`,
    contrarianOrUsefulAngle: `Take the angle no one else is taking: instead of reacting to what happened, explain what it means and what to do next. The useful version beats the loud version.`,
    audience: `People who already saw the headline and want to understand it — not people who haven't heard of it yet.`,
    hook: t.firstHook,
    scriptDirection: `Open on the hook. In the first 5 seconds, name the part of the story everyone is missing. In the next 15 seconds, give the one piece of evidence that proves it. In the last 10 seconds, deliver the takeaway and the CTA. Keep cuts tight; one big idea per beat.`,
    bestFormat: t.suggestedFormat,
    suggestedLanguages: defaultLanguagesFor(t.country),
    visualTreatment: `Single face-cam or voice-over with on-screen text for the key claim. Two text cards maximum. No b-roll dump — let the point breathe.`,
    cta: `Comment "THIS" if you've seen this happen to you — I'll send you the full breakdown.`,
    riskNotes: `Verify any specific number or quote before you publish. Do not reuse footage from major outlets without rights clearance. If the trend involves a person, expect pushback — keep the stance on the issue, not the person.`,
  };
}

function defaultLanguagesFor(country: string): string[] {
  // Always include English + the country's primary language + Spanish (huge LATAM reach)
  const countryLangs: Record<string, string[]> = {
    US: ["en", "es"],
    BR: ["pt", "en", "es"],
    IN: ["en", "hi", "es"],
    DE: ["de", "en"],
    FR: ["fr", "en", "es"],
    ES: ["es", "en"],
    MX: ["es", "en"],
    JP: ["ja", "en"],
    KR: ["ko", "en"],
    IT: ["it", "en"],
    TR: ["tr", "en"],
    AE: ["ar", "en"],
  };
  return countryLangs[country] ?? ["en", "es"];
}

export function contentTypeLabel(c: ContentType): string {
  return c;
}
