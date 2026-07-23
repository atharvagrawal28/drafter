/**
 * Regulation Watch — types.
 *
 * Drafter's whole claim rests on a VERSIONED rule set: the checklist a promoter
 * is held to is `requirement_registry.json` at a stated version, built against
 * the ICDR text as it stood on a stated date. That guardrail is only honest if
 * something tells you when the text has moved on.
 *
 * This module does that, and deliberately does no more. It reports what SEBI has
 * published since the registry's as-at date and which requirements each item
 * *may* bear on. It never edits the registry, and it never asserts that a rule
 * has changed — reading a circular and deciding what it means is a job for a
 * securities-markets reader, not a keyword match.
 */

/** How an item relates to the rules Drafter encodes. */
export type Relevance =
  /** Names Chapter IX, the SME platforms, or SME issues directly. */
  | "chapter-ix"
  /** Touches the ICDR Regulations or offer-document disclosure generally. */
  | "icdr"
  /** Market-wide and may reach an issuer indirectly (LODR, intermediaries). */
  | "market-wide"
  /** Enforcement and case traffic — no bearing on drafting an offer document. */
  | "not-relevant";

export interface FeedItem {
  title: string;
  link: string;
  description: string;
  /** ISO date, or null when the feed's date could not be parsed. */
  publishedAt: string | null;
  rawDate: string;
}

export interface ClassifiedItem extends FeedItem {
  relevance: Relevance;
  /** The terms that put it in that bucket — the classification is explainable. */
  matchedTerms: string[];
  /** Requirement IDs the matched terms map to. May be empty. */
  requirementIds: string[];
  /** True when published after the registry's as-at date. */
  newerThanRegistry: boolean;
}

export interface WatchResult {
  fetchedAt: string;
  /** Registry state the items are compared against. */
  registryVersion: string;
  regulationSetAsAt: string;
  source: string;
  /** Items that bear on the rule set, most recent first. */
  items: ClassifiedItem[];
  /** Count of feed entries filtered out as enforcement or case traffic. */
  filteredOut: number;
  totalFetched: number;
  /**
   * Set when the feed could not be read. The page still renders: a watch that
   * breaks the app when SEBI's server is slow is worse than no watch.
   */
  error?: string;
}
