/**
 * P&R Thought Engine — Trend Scout type system
 *
 * Everything here is shared between the trend-provider layer, the scoring
 * engine, the API routes, and the UI. Keep it strict — no `any`.
 */

export type Niche =
  | "Business"
  | "AI"
  | "Small Business"
  | "Motivation"
  | "Crypto"
  | "Creator Economy"
  | "E-commerce"
  | "Real Estate"
  | "Fitness"
  | "Local News"
  | "Other";

export const NICHE_VALUES: Niche[] = [
  "Business",
  "AI",
  "Small Business",
  "Motivation",
  "Crypto",
  "Creator Economy",
  "E-commerce",
  "Real Estate",
  "Fitness",
  "Local News",
  "Other",
];

export type TimeWindow = "now" | "24h" | "7d" | "30d";

export type ContentType =
  | "Clip"
  | "Slideshow"
  | "Hot Take"
  | "Story"
  | "Meme Video"
  | "Song";

export const CONTENT_TYPE_VALUES: ContentType[] = [
  "Clip",
  "Slideshow",
  "Hot Take",
  "Story",
  "Meme Video",
  "Song",
];

export type Direction = "Rising" | "Breakout" | "Stable";

export type Emotion =
  | "curiosity"
  | "outrage"
  | "aspiration"
  | "fear"
  | "humor"
  | "urgency"
  | "identity";

export type RightsStatus =
  | "my_channel"
  | "creator_authorized"
  | "creative_commons"
  | "public_domain"
  | "rights_unverified";

export type DataSource =
  | "google_trends_rss"
  | "fallback_curated"
  | "youtube_api"
  | "youtube_search_url";

export interface TrendScoreReasoning {
  factor: string;
  /** raw input that produced this score (for transparency) */
  input: string;
  /** 0–10 sub-score */
  score: number;
  /** how heavily this factor weighs toward the total */
  weight: number;
  /** weighted contribution (score * weight / sum of weights) */
  contribution: number;
  /** human-readable note explaining the score */
  note: string;
}

export interface TrendScore {
  total: number; // 1–100
  factors: TrendScoreReasoning[];
}

export interface ContentAngle {
  title: string;
  oneLiner: string;
  format: ContentType;
}

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  picture?: string;
}

export interface TrendOpportunity {
  id: string;
  title: string;
  direction: Direction;
  country: string;
  countryLabel: string;
  language: string;
  languageLabel: string;
  niche: Niche;
  publishedAt: string; // ISO
  approxTraffic?: string;
  whyItMattersNow: string;
  audienceEmotion: Emotion;
  stopScrollingHook: string;
  suggestedFormat: ContentType;
  firstHook: string;
  angles: ContentAngle[];
  relatedQueries: string[];
  searchTerms: string[];
  score: TrendScore;
  rightsSafetyScore: number; // 0–100
  dataSource: DataSource;
  dataLabel: string;
  thumbnailUrl?: string;
  thumbnailSource?: string;
  newsItems?: NewsItem[];
  /** when true, the data source is a fallback / estimated source */
  estimated?: boolean;
}

export interface ContentBrief {
  trend: string;
  realConversation: string;
  contrarianOrUsefulAngle: string;
  audience: string;
  hook: string;
  scriptDirection: string;
  bestFormat: ContentType;
  suggestedLanguages: string[];
  visualTreatment: string;
  cta: string;
  riskNotes: string;
}

export interface SourceVideoClipMoment {
  timecode: string;
  reason: string;
}

export interface SourceVideo {
  id: string;
  title: string;
  channel: string;
  channelId?: string;
  publishedAt: string;
  lengthSeconds?: number;
  lengthLabel?: string;
  views?: number;
  viewsLabel?: string;
  thumbnailUrl?: string;
  description?: string;
  estimatedClipMoments?: SourceVideoClipMoment[];
  audioQuality: "high" | "medium" | "low" | "unknown";
  originalLanguage: string;
  originalLanguageLabel: string;
  rightsStatus: RightsStatus;
  rightsLabel: string;
  url: string;
  dataSource: DataSource;
}

export interface InternationalAdaptation {
  language: string;
  languageLabel: string;
  angle: string;
  culturalNote: string;
  hook: string;
}

export interface RadarData {
  generatedAt: string;
  topOpportunities: TrendOpportunity[];
  bestByNiche: { niche: Niche; trend: TrendOpportunity }[];
  bestByLanguage: { language: string; trend: TrendOpportunity }[];
  highestInternationalPotential: TrendOpportunity | null;
  trendsSavedForLater: SavedTrendRow[];
  trendsConvertedToVideos: UsedTrendRow[];
  conversionRate: number; // 0–100, computed from real user actions
  conversionRateLabel: string;
  dataSourceMix: { source: DataSource; count: number }[];
  windowDays: number; // how many days of snapshot history we currently have
  windowDaysLabel: string;
}

export interface SavedTrendRow {
  id: string;
  trendId: string;
  trendTitle: string;
  niche?: string;
  country?: string;
  language?: string;
  savedAt: string;
}

export interface UsedTrendRow {
  id: string;
  trendId: string;
  trendTitle: string;
  action: string;
  format?: string;
  targetLanguages?: string;
  sourceUrl?: string;
  briefSummary?: string;
  usedAt: string;
}

export interface TrendFilters {
  country: string;
  language: string;
  niche: Niche | "All";
  timeWindow: TimeWindow;
  contentType: ContentType;
}

export interface PRRoutingPayload {
  kind: "create_original" | "send_to_clip" | "rebuild_for_world" | "create_preview";
  trendId: string;
  trendTitle: string;
  niche: string;
  country: string;
  language: string;
  format?: ContentType;
  targetLanguages?: string[];
  sourceUrl?: string;
  brief?: Partial<ContentBrief>;
  /** telegram bot command target, e.g. /clip, /rebuild */
  botCommand?: string;
  /** preview URL when available */
  previewUrl?: string;
  /** status the routing layer returns */
  status: "queued" | "missing_key" | "missing_permission";
  message: string;
}

export const COUNTRY_OPTIONS: {
  code: string;
  label: string;
  languages: { code: string; label: string }[];
}[] = [
  {
    code: "US",
    label: "United States",
    languages: [
      { code: "en", label: "English" },
      { code: "es", label: "Spanish" },
    ],
  },
  { code: "GB", label: "United Kingdom", languages: [{ code: "en", label: "English" }] },
  { code: "BR", label: "Brazil", languages: [{ code: "pt", label: "Portuguese" }] },
  {
    code: "IN",
    label: "India",
    languages: [
      { code: "en", label: "English" },
      { code: "hi", label: "Hindi" },
    ],
  },
  { code: "DE", label: "Germany", languages: [{ code: "de", label: "German" }] },
  { code: "JP", label: "Japan", languages: [{ code: "ja", label: "Japanese" }] },
  { code: "MX", label: "Mexico", languages: [{ code: "es", label: "Spanish" }] },
  { code: "ES", label: "Spain", languages: [{ code: "es", label: "Spanish" }] },
  { code: "FR", label: "France", languages: [{ code: "fr", label: "French" }] },
  {
    code: "CA",
    label: "Canada",
    languages: [
      { code: "en", label: "English" },
      { code: "fr", label: "French" },
    ],
  },
  { code: "AU", label: "Australia", languages: [{ code: "en", label: "English" }] },
  { code: "AE", label: "United Arab Emirates", languages: [{ code: "ar", label: "Arabic" }] },
  { code: "NG", label: "Nigeria", languages: [{ code: "en", label: "English" }] },
  { code: "ZA", label: "South Africa", languages: [{ code: "en", label: "English" }] },
  { code: "ID", label: "Indonesia", languages: [{ code: "id", label: "Indonesian" }] },
  { code: "PH", label: "Philippines", languages: [{ code: "en", label: "English" }] },
  { code: "KR", label: "South Korea", languages: [{ code: "ko", label: "Korean" }] },
  { code: "IT", label: "Italy", languages: [{ code: "it", label: "Italian" }] },
  { code: "TR", label: "Turkey", languages: [{ code: "tr", label: "Turkish" }] },
  { code: "AR", label: "Argentina", languages: [{ code: "es", label: "Spanish" }] },
];

export const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  es: "Spanish",
  pt: "Portuguese",
  de: "German",
  fr: "French",
  hi: "Hindi",
  ja: "Japanese",
  ko: "Korean",
  it: "Italian",
  ar: "Arabic",
  id: "Indonesian",
  tr: "Turkish",
  ru: "Russian",
  zh: "Chinese",
};

export function languageLabel(code: string): string {
  return LANGUAGE_LABELS[code] ?? code.toUpperCase();
}

export function countryLabel(code: string): string {
  return COUNTRY_OPTIONS.find((c) => c.code === code)?.label ?? code;
}
