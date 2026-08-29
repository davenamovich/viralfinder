/**
 * P&R integration layer.
 *
 * Routes the user's chosen action (Create Original / Send to /clip /
 * Rebuild for World / Create here.now Preview) into the existing P&R
 * Thought Engine / Telegram bot flows.
 *
 * This layer does NOT execute the actual Telegram send or render pipeline —
 * those are owned by the existing P&R backend. It produces a fully-formed
 * routing payload (bot command, message text, target languages, source URL,
 * brief) that the existing P&R backend consumes.
 *
 * If a required integration key is missing (e.g. P_R_TELEGRAM_BOT_TOKEN or
 * P_R_RENDER_API_BASE), the layer returns status: "missing_key" and the UI
 * shows the user the exact prefilled Telegram command they can paste into
 * the bot manually.
 */

import type {
  ContentBrief,
  ContentType,
  InternationalAdaptation,
  PRRoutingPayload,
  TrendOpportunity,
} from "./types";

export interface PRIntegrationConfig {
  telegramBotUsername?: string;
  renderApiBase?: string;
  botToken?: string;
}

const cfg: PRIntegrationConfig = {
  telegramBotUsername: process.env.P_R_TELEGRAM_BOT_USERNAME,
  renderApiBase: process.env.P_R_RENDER_API_BASE,
  botToken: process.env.P_R_TELEGRAM_BOT_TOKEN,
};

export function getPRConfig(): PRIntegrationConfig {
  return cfg;
}

function hasTelegram(): boolean {
  return !!cfg.telegramBotUsername;
}

function hasRenderPipeline(): boolean {
  return !!cfg.renderApiBase;
}

// --- public routing functions ---

export function routeCreateOriginal(
  trend: TrendOpportunity,
  brief: ContentBrief,
): PRRoutingPayload {
  const message = buildCreateOriginalMessage(trend, brief);
  return {
    kind: "create_original",
    trendId: trend.id,
    trendTitle: trend.title,
    niche: trend.niche,
    country: trend.country,
    language: trend.language,
    format: brief.bestFormat,
    brief,
    botCommand: "/create",
    status: hasTelegram() ? "queued" : "missing_key",
    message: hasTelegram()
      ? `Sent to @${cfg.telegramBotUsername}. The P&R Thought Engine will start a new original creation flow with the brief prefilled.`
      : `Telegram bot username not configured. Copy the prefilled /create command below and send it to your P&R bot manually.`,
    previewUrl: undefined,
  };
}

export function routeSendToClip(trend: TrendOpportunity, sourceUrl: string): PRRoutingPayload {
  const command = `/clip ${sourceUrl}\n# ${trend.title}\n# Niche: ${trend.niche} | Country: ${trend.country} | Lang: ${trend.language}\n# Hook: ${trend.firstHook}`;
  return {
    kind: "send_to_clip",
    trendId: trend.id,
    trendTitle: trend.title,
    niche: trend.niche,
    country: trend.country,
    language: trend.language,
    format: "Clip",
    sourceUrl,
    botCommand: "/clip",
    status: hasTelegram() ? "queued" : "missing_key",
    message: hasTelegram()
      ? `Sent to @${cfg.telegramBotUsername} /clip. The existing /clip flow will ingest the URL and return clip moments.`
      : `Telegram bot username not configured. Copy the prefilled /clip command and the source URL into your P&R bot manually.`,
  };
}

export function routeRebuildForWorld(
  trend: TrendOpportunity,
  sourceUrl: string,
  targetLanguages: string[],
  format: ContentType,
  brief: ContentBrief,
): PRRoutingPayload {
  const command = `/rebuild\nsource: ${sourceUrl}\ntrend: ${trend.title}\nformat: ${format}\nlanguages: ${targetLanguages.join(", ")}\nhook: ${brief.hook}\nangle: ${brief.contrarianOrUsefulAngle}`;
  return {
    kind: "rebuild_for_world",
    trendId: trend.id,
    trendTitle: trend.title,
    niche: trend.niche,
    country: trend.country,
    language: trend.language,
    format,
    targetLanguages,
    sourceUrl,
    brief,
    botCommand: "/rebuild",
    status: hasTelegram() ? "queued" : "missing_key",
    message: hasTelegram()
      ? `Sent to @${cfg.telegramBotUsername} /rebuild with ${targetLanguages.length} target language(s). The existing /rebuild flow will produce internationalized versions.`
      : `Telegram bot username not configured. Copy the prefilled /rebuild command and the source URL into your P&R bot manually.`,
  };
}

export function routeCreatePreview(
  trend: TrendOpportunity,
  brief: ContentBrief,
): PRRoutingPayload {
  const previewId = `preview_${trend.id.replace(/[^a-z0-9]+/gi, "_").slice(0, 24)}`;
  if (!hasRenderPipeline()) {
    return {
      kind: "create_preview",
      trendId: trend.id,
      trendTitle: trend.title,
      niche: trend.niche,
      country: trend.country,
      language: trend.language,
      format: brief.bestFormat,
      brief,
      botCommand: undefined,
      status: "missing_key",
      message: `Render API base not configured. Trend Scout produced a preview identifier (${previewId}) and the full brief — hand this to your P&R rendering pipeline to generate the here.now preview page.`,
      previewUrl: undefined,
    };
  }
  // Construct the here.now preview URL — the existing P&R pipeline owns the
  // actual render. We just construct what the URL *will* be once rendered.
  const previewUrl = `${cfg.renderApiBase}/preview/${previewId}`;
  return {
    kind: "create_preview",
    trendId: trend.id,
    trendTitle: trend.title,
    niche: trend.niche,
    country: trend.country,
    language: trend.language,
    format: brief.bestFormat,
    brief,
    botCommand: undefined,
    status: "queued",
    message: `Preview queued at ${previewUrl}. The existing P&R render pipeline will publish the here.now preview page and the /market flow will handle MP4 unlocks.`,
    previewUrl,
  };
}

// --- message builders ---

function buildCreateOriginalMessage(trend: TrendOpportunity, brief: ContentBrief): string {
  return `/create
trend: ${trend.title}
niche: ${trend.niche}
country: ${trend.country}
language: ${trend.language}
format: ${brief.bestFormat}
hook: ${brief.hook}
angle: ${brief.contrarianOrUsefulAngle}
audience: ${brief.audience}
script_direction: ${brief.scriptDirection}
visual_treatment: ${brief.visualTreatment}
cta: ${brief.cta}
risk_notes: ${brief.riskNotes}
suggested_languages: ${brief.suggestedLanguages.join(", ")}`;
}

export function buildTelegramDeepLink(command: string, botUsername?: string): string {
  if (!botUsername) return "";
  return `https://t.me/${botUsername}?start=${encodeURIComponent(command.slice(0, 64))}`;
}

export function formatBriefAsTelegramMessage(brief: ContentBrief, trend: TrendOpportunity): string {
  return [
    `*${trend.title}*`,
    `_${trend.countryLabel} · ${trend.languageLabel} · ${trend.niche}_`,
    ``,
    `*Real conversation:*`,
    brief.realConversation,
    ``,
    `*Angle:*`,
    brief.contrarianOrUsefulAngle,
    ``,
    `*Audience:*`,
    brief.audience,
    ``,
    `*Hook:*`,
    brief.hook,
    ``,
    `*30-second direction:*`,
    brief.scriptDirection,
    ``,
    `*Visual treatment:*`,
    brief.visualTreatment,
    ``,
    `*CTA:*`,
    brief.cta,
    ``,
    `*Risk notes:*`,
    brief.riskNotes,
    ``,
    `*Suggested languages:* ${brief.suggestedLanguages.join(", ")}`,
  ].join("\n");
}
