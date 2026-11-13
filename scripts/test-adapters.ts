/**
 * Smoke-test the yt-dlp and Exa wrappers. Run with:
 *   bun /home/z/my-project/scripts/test-adapters.ts
 */

import { searchYouTube, fetchTranscript, extractClipMoments, isYtdlpAvailable } from "../src/lib/trend-scout/ytdlp";
import { exaSearch, isExaAvailable } from "../src/lib/trend-scout/exa";

async function main() {
  console.log("=== yt-dlp ===");
  const ytdlpOk = await isYtdlpAvailable();
  console.log("yt-dlp available:", ytdlpOk);

  console.log("\n[ytdlp] Searching 'cameron diaz interview'...");
  const search = await searchYouTube("cameron diaz interview", { max: 5, language: "en" });
  console.log("Search results:", search.results.length);
  for (const r of search.results.slice(0, 3)) {
    console.log(`  ${r.id} | ${r.title} | ${r.channel} | ${r.durationSeconds ?? "?"}s | ${r.viewCount ?? "?"} views`);
  }

  console.log("\n[ytdlp] Fetching transcript of a known-working video (Rick Astley)...");
  const transcript = await fetchTranscript("dQw4w9WgXcQ", "en");
  console.log("Transcript status:", transcript.status);
  if (transcript.status === "ok" && transcript.vtt) {
    console.log("VTT length:", transcript.vtt.length);
    const moments = extractClipMoments(transcript.vtt);
    console.log("Extracted moments:");
    for (const m of moments) console.log(`  ${m.timecode} — ${m.reason}`);
  } else {
    console.log("Message:", transcript.message);
  }

  console.log("\n=== Exa ===");
  const exaOk = await isExaAvailable();
  console.log("Exa available:", exaOk);

  console.log("\n[exa] Searching 'cameron diaz return to acting 2026'...");
  const exa = await exaSearch("cameron diaz return to acting 2026", 3);
  console.log("Exa status:", exa.status, "results:", exa.results.length);
  for (const r of exa.results.slice(0, 2)) {
    console.log(`  ${r.title}`);
    console.log(`    ${r.url}`);
    console.log(`    ${r.publishedDate ?? "?"} | ${r.author ?? "?"}`);
    console.log(`    ${(r.highlights ?? "").slice(0, 120)}…`);
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
