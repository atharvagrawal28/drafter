/**
 * SEBI RSS reader.
 *
 * The feed is a firehose: appeals, recovery certificates and adjudication
 * orders vastly outnumber the circulars that bear on drafting an offer
 * document. Reading it is the easy half; the classification in `relevance.ts`
 * is what makes it useful rather than noisy.
 *
 * No XML dependency. RSS 2.0 is a fixed, shallow shape, and a parser for it is
 * smaller than the argument for adding a package.
 */

import type { FeedItem } from "./types";

export const SEBI_FEED_URL = "https://www.sebi.gov.in/sebirss.xml";

/** Strip CDATA wrappers, decode the five XML entities, collapse whitespace. */
function decode(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match ? decode(match[1]) : "";
}

/**
 * SEBI writes dates as "23 Jul, 2026 +0530", which `Date` does not parse.
 * Returning null rather than a wrong date matters: the whole point of the
 * comparison is whether an item is newer than the registry, and a silently
 * mis-parsed date would answer that question wrongly.
 */
export function parseSebiDate(raw: string): string | null {
  const MONTHS: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  const match = raw.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*,?\s+(\d{4})/);
  if (match) {
    const month = MONTHS[match[2].toLowerCase()];
    if (month !== undefined) {
      const date = new Date(Date.UTC(Number(match[3]), month, Number(match[1])));
      if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
    }
  }

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString().slice(0, 10);
}

export function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const title = tag(block, "title");
    if (!title) continue;
    const rawDate = tag(block, "pubDate");
    items.push({
      title,
      link: tag(block, "link"),
      description: tag(block, "description"),
      rawDate,
      publishedAt: rawDate ? parseSebiDate(rawDate) : null,
    });
  }
  return items;
}

/**
 * Fetch the feed. Times out rather than holding a serverless function open —
 * SEBI's server is occasionally slow, and a stale watch panel is a far better
 * outcome than a request that never returns.
 */
export async function fetchFeed(timeoutMs = 8000): Promise<FeedItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(SEBI_FEED_URL, {
      signal: controller.signal,
      headers: { accept: "application/rss+xml, application/xml, text/xml" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`SEBI feed returned HTTP ${response.status}`);
    return parseFeed(await response.text());
  } finally {
    clearTimeout(timer);
  }
}
