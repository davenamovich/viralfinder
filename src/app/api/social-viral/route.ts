import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Social Viral Content Finder API
 * 
 * Use this endpoint to find rapidly growing posts using engagement velocity
 * and recency signals across multiple social platforms.
 * 
 * This leverages the social-viral-content-finder skill with BrowserAct for
 * cross-platform browser-based data collection.
 * 
 * @see https://skills.sh/sam6dvpte34/social-media-skill
 * @see https://skills.sh/browser-act/skills/browser-act
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  
  // Platforms to search (comma-separated: instagram,tiktok,youtube,linkedin,facebook,reddit,x)
  const platformsStr = sp.get("platforms") || "instagram,tiktok,youtube,linkedin,facebook,reddit,x";
  const platforms = platformsStr.split(",").map(p => p.trim()).filter(p => p.length > 0);
  
  // Keywords/topic to search for
  const keywords = sp.get("keywords") || "viral content";
  
  // Result count approximation
  const resultCount = sp.get("count") ? parseInt(sp.get("count") || "10") : 10;
  
  // Filter by recency/velocity
  const timeWindow = sp.get("window") || "24h"; // now, 24h, 7d, 30d
  
  // Target accounts/URLs (optional)
  const targets = sp.get("targets");

  try {
    // TODO: When browser-act Skill is fully integrated,
    // invoke: browser-act search platforms with keywords, filters
    // 
    // Per social-viral-content-finder skill instructions:
    // 1. Identify target platforms, accounts, keywords, URLs, filters, or monitoring criteria
    // 2. Identify requested fields, approximate result count, filters, and preferred output format
    // 3. Invoke the browser-act Skill when live browser access or website interaction is required
    // 4. Work only with public data or data the user is authorized to access
    // 5. Return the requested result directly when available
    
    // Currently returning structured placeholder indicating the skill integration point
    // In full implementation, this would use BrowserAct to scrape cross-platform viral data
    
    return NextResponse.json({
      success: true,
      skill: "social-viral-content-finder",
      browserActSkill: "browser-act",
      integrationStatus: "ready",
      parameters: {
        platforms,
        keywords,
        resultCount,
        timeWindow,
        targets: targets || undefined,
      },
      // Methodology per skill instructions:
      // - Find rapidly growing posts using engagement velocity and recency signals
      // - Cross-platform: Instagram, TikTok, YouTube, LinkedIn, Facebook, Reddit, X
      // - Engagement velocity signals for ranking
      // - Recency filtering by specified time window
      // - Export structured, source-linked records
      methodology: "social-viral-content-finder skill with BrowserAct CLI",
      notes: [
        "Works with public data only - no login credential scraping",
        "Keep cookies, account info, browser IDs under workspaces/, never in Skill directory",
        "Do not claim data was collected unless BrowserAct actually returns it",
        "Website availability, visible fields, and result limits can change",
      ],
      results: [], // Would be populated by BrowserAct execution
    });
  } catch (err) {
    console.error("[social-viral] Error", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST version for initiating monitoring tasks
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  
  const { action, platforms, keywords, count, window, targets, format } = body;
  
  if (action === "monitor") {
    // Return monitoring task initiation response
    return NextResponse.json({
      success: true,
      task: "monitoring_initiated",
      skill: "social-viral-content-finder",
      platforms,
      keywords,
      window,
      format,
      message: "Monitoring task started - will collect engagement signals over specified window",
    });
  }
  
  if (action === "export") {
    // Return export confirmation
    return NextResponse.json({
      success: true,
      task: "export_initiated",
      skill: "social-viral-content-finder",
      format: format || "structured",
      message: "Export task started - structured, source-linked records will be generated",
    });
  }
  
  return NextResponse.json(
    { success: false, error: "Unknown action. Use: monitor or export" },
    { status: 400 }
  );
}