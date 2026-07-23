import { NextResponse } from "next/server";
import { fetchFeed } from "@/lib/circulars/feed";
import { buildWatch } from "@/lib/circulars/relevance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/**
 * Regulation Watch.
 *
 * Reads SEBI's public RSS feed server-side (the browser cannot, and should not
 * have to deal with CORS on a regulator's server), classifies each item against
 * the rules Drafter encodes, and returns what bears on the registry.
 *
 * Fails soft on purpose. A regulator's feed being slow or down must not take a
 * page of the product with it, so a fetch failure returns 200 with an empty
 * item list and an `error` string for the UI to show plainly. The alternative —
 * a 500 — would make Drafter look broken when nothing of Drafter's is.
 *
 * No issuer data is involved, so nothing leaves the server that did not come
 * from a public feed.
 */
export async function GET() {
  try {
    const items = await fetchFeed();
    return NextResponse.json(buildWatch(items), {
      headers: { "cache-control": "s-maxage=900, stale-while-revalidate=3600" },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === "AbortError"
          ? "SEBI's feed did not respond in time."
          : error.message
        : "Could not read the SEBI feed.";
    return NextResponse.json(buildWatch([], message));
  }
}
