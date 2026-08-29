/**
 * Client-safe helper for displaying YouTube rights status labels.
 *
 * Pure function — no Node.js APIs, no imports of youtube-provider (which now
 * pulls in yt-dlp / child_process via Agent Reach).
 *
 * Both the client UI and the server provider import from here so the labels
 * stay in sync.
 */

import type { RightsStatus } from "./types";

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
