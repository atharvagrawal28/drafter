/**
 * Classify a SEBI feed item against the rules Drafter encodes.
 *
 * Entirely rule-based, and deliberately so. A language model could summarise
 * these items more fluently, but this decides what a compliance panel tells a
 * first-time issuer to worry about — and a plausible-sounding wrong answer
 * there is worse than a blunt right one. Every classification here is
 * reproducible and carries the terms that produced it, so a reader can see why
 * an item was surfaced and overrule it.
 *
 * The mapping is to requirement IDs, not to prose. "This may bear on R5.9" is
 * checkable against the registry; "SEBI has tightened IPO rules" is not.
 */

import { allRequirements, registry } from "../data";
import type { ClassifiedItem, FeedItem, Relevance, WatchResult } from "./types";

/**
 * Enforcement and case traffic. These dominate the feed by volume and have no
 * bearing on how an offer document is drafted, so they are removed before
 * anything else runs — otherwise the panel is 90% noise and gets ignored,
 * which is the failure mode the RBI version of this feature actually had.
 */
const EXCLUDE = [
  "appeal no",
  "recovery certificate",
  "adjudication order",
  "settlement order",
  "in the matter of",
  "defaulter",
  "attachment of",
  "auction of",
  "notice under rule",
  "show cause",
  "penalty on",
  "sat order",
  "vacancy",
  "tender",
  "request for proposal",
];

/** Terms that place an item squarely in Drafter's territory. */
const CHAPTER_IX = [
  "chapter ix",
  "small and medium enterprise",
  "sme",
  "sme platform",
  "sme exchange",
  "emerge",
  "migration to the main board",
];

const ICDR = [
  "icdr",
  "issue of capital and disclosure requirements",
  "draft red herring",
  "red herring prospectus",
  "offer document",
  "draft offer document",
  "initial public offer",
  "public issue",
  "prospectus",
  "minimum promoters' contribution",
  "promoter contribution",
  "lock-in",
  "offer for sale",
  "monitoring agency",
  "merchant banker",
  "lead manager",
  "book building",
  "basis of allotment",
  "anchor investor",
  "objects of the issue",
  "general corporate purpose",
  "issue proceeds",
  "net proceeds",
  "issue expense",
  "price band",
];

const MARKET_WIDE = [
  "listing obligations",
  "lodr",
  "disclosure requirements",
  "related party",
  "corporate governance",
  "asba",
  "upi",
  "registrar to an issue",
  "underwriter",
  "market making",
  "promoter group",
  "freezing of holdings",
  "demat",
  "depositor",
  "dematerialis",
];

/**
 * Topic → requirement IDs. Only topics that map to something Drafter actually
 * checks appear here; a term with no requirement behind it would produce a
 * finding the user cannot act on.
 */
const TOPIC_MAP: { terms: string[]; requirementIds: string[] }[] = [
  { terms: ["general corporate purpose"], requirementIds: ["R5.9"] },
  { terms: ["monitoring agency"], requirementIds: ["R5.7"] },
  { terms: ["offer for sale"], requirementIds: ["R5.12"] },
  { terms: ["promoter contribution", "minimum promoters' contribution", "lock-in"], requirementIds: ["R12.2"] },
  { terms: ["wilful defaulter", "fraudulent borrower", "fugitive economic offender", "debarred"], requirementIds: ["R12.3"] },
  { terms: ["key performance indicator", "kpi"], requirementIds: ["R9.4"] },
  { terms: ["weighted average cost of acquisition", "waca"], requirementIds: ["R9.5"] },
  { terms: ["related party"], requirementIds: ["R6.2"] },
  { terms: ["litigation", "outstanding proceeding", "material litigation"], requirementIds: ["R6.3"] },
  { terms: ["restated financial", "financial statement", "auditor"], requirementIds: ["R4.1", "R4.3"] },
  { terms: ["issue expense"], requirementIds: ["R5.10"] },
  { terms: ["market making", "market maker"], requirementIds: ["R5.6", "R8.5"] },
  { terms: ["allocation", "basis of allotment", "issue structure"], requirementIds: ["R8.2"] },
  { terms: ["risk factor"], requirementIds: ["R3.1"] },
  { terms: ["shareholding pattern", "capital structure", "promoter group", "freezing of holdings"], requirementIds: ["R5.1"] },
  { terms: ["special tax benefit"], requirementIds: ["R13.2"] },
  { terms: ["asba", "upi"], requirementIds: ["R8.4"] },
];

const hits = (haystack: string, needles: string[]) => needles.filter((n) => haystack.includes(n));

export function classify(item: FeedItem, regulationSetAsAt: string): ClassifiedItem {
  const text = `${item.title} ${item.description}`.toLowerCase();

  const excluded = hits(text, EXCLUDE).length > 0;

  // Topic matching drives BOTH the mapping and the relevance floor. Keeping
  // two parallel keyword lists in step by hand does not work: the first version
  // of this had "general corporate purpose" in the topic map but not in the
  // relevance list, so an item about the ICDR ceiling classified as irrelevant
  // and was never shown. If a term is specific enough to name a requirement, it
  // is specific enough to make the item worth reading.
  const topics = excluded
    ? []
    : TOPIC_MAP.filter((topic) => topic.terms.some((term) => text.includes(term)));

  const known = new Set(allRequirements.map((r) => r.id));
  const requirementIds = Array.from(
    new Set(topics.flatMap((topic) => topic.requirementIds).filter((id) => known.has(id))),
  ).sort();

  let relevance: Relevance;
  let matchedTerms: string[] = [];

  if (excluded) {
    relevance = "not-relevant";
  } else {
    const chapterIx = hits(text, CHAPTER_IX);
    const icdr = hits(text, ICDR);
    const marketWide = hits(text, MARKET_WIDE);
    const topicTerms = topics.flatMap((topic) => topic.terms.filter((term) => text.includes(term)));

    if (chapterIx.length > 0) {
      relevance = "chapter-ix";
      matchedTerms = [...chapterIx, ...icdr, ...topicTerms];
    } else if (icdr.length > 0) {
      relevance = "icdr";
      matchedTerms = [...icdr, ...topicTerms];
    } else if (marketWide.length > 0 || topicTerms.length > 0) {
      // A topic match on its own floors at market-wide, never higher. Several
      // topics — related-party disclosure, corporate governance — are shared
      // with the Listing Regulations, and promoting an LODR circular to "ICDR"
      // would misdescribe it. It is still surfaced, and still mapped.
      relevance = "market-wide";
      matchedTerms = [...marketWide, ...topicTerms];
    } else {
      relevance = "not-relevant";
    }
  }

  return {
    ...item,
    relevance,
    matchedTerms: Array.from(new Set(matchedTerms)).slice(0, 6),
    requirementIds,
    // An unparseable date is treated as NOT newer. The alternative — assuming
    // it is recent — would raise a false alarm about the rule set being stale.
    newerThanRegistry: item.publishedAt !== null && item.publishedAt > regulationSetAsAt,
  };
}

const RANK: Record<Relevance, number> = {
  "chapter-ix": 0,
  icdr: 1,
  "market-wide": 2,
  "not-relevant": 3,
};

export function buildWatch(items: FeedItem[], error?: string): WatchResult {
  const asAt = (registry as any).regulation_set_as_at ?? "2025-03-08";

  const classified = items.map((item) => classify(item, asAt));
  const relevant = classified
    .filter((item) => item.relevance !== "not-relevant")
    .sort((a, b) => {
      if (RANK[a.relevance] !== RANK[b.relevance]) return RANK[a.relevance] - RANK[b.relevance];
      return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
    });

  return {
    fetchedAt: new Date().toISOString(),
    registryVersion: registry.registry_version,
    regulationSetAsAt: asAt,
    source: "SEBI RSS (sebi.gov.in/sebirss.xml)",
    items: relevant,
    filteredOut: classified.length - relevant.length,
    totalFetched: classified.length,
    error,
  };
}
