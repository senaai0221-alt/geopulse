import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const RETENTION_DAYS = 30;
// Supabase (Postgres row storage) charges by disk, and raw_response is
// by far the heaviest column in `rankings` - full LLM completions,
// potentially several KB each, written once per prompt x provider x
// day. Numeric/boolean fields (mentioned, rank_position, sentiment,
// citations) are what the dashboard's charts actually need long-term,
// so only the heavy text is cleared, not the row itself.
const BATCH_SIZE = 500;

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // no secret configured - allow (dev only)
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * Weekly cleanup: nulls out `rankings.raw_response` (and the smaller
 * `error` text) for rows older than RETENTION_DAYS, keeping every other
 * column - the dashboard's trend chart, mention rate, and share-of-voice
 * all read from those, not the raw text. Runs in capped batches so a
 * large backlog can't itself blow the function's time limit; any
 * remainder is picked up by next week's run.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  try {
    const { data, error } = await supabase
      .from("rankings")
      .update({ raw_response: null, error: null })
      .lt("checked_at", cutoff.toISOString())
      .not("raw_response", "is", null)
      .limit(BATCH_SIZE)
      .select("id");

    if (error) {
      console.error("cleanup-old-rankings failed:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      cutoff: cutoff.toISOString(),
      rowsCleaned: data?.length ?? 0,
    });
  } catch (err) {
    console.error("cleanup-old-rankings crashed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
