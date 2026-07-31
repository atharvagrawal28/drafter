/**
 * Exchange observation replay.
 *
 * When an SME submits a draft offer document, the exchange returns a numbered
 * list of observations that must be resolved before in-principle approval.
 * That letter is the ground truth for whether Drafter's requirement registry
 * actually reflects what an exchange checks — every other claim this product
 * makes about its registry is self-referential.
 *
 * The replay takes a real letter and asks, observation by observation: does
 * Drafter's registry contain a requirement that would have prompted the issuer
 * for this before they filed?
 */

/** One observation, as parsed out of the letter. */
export interface ParsedObservation {
  /** The enumerator as it appeared: "1", "2(a)", "iii". */
  label: string;
  text: string;
}

export type ObservationVerdict =
  /** Maps to one or more requirements Drafter checks. */
  | "mapped"
  /**
   * A demand for a document, consent or certificate rather than a disclosure —
   * the auditor's peer review certificate, the RTA's consent, a signed MOU.
   * Drafter deliberately does not produce these and must not claim credit for
   * them. Excluded from the denominator, never counted as covered.
   */
  | "out-of-scope"
  /**
   * Neither. This is a gap in the registry, and it is the most valuable output
   * of the whole feature.
   */
  | "unmapped";

export interface MappedObservation extends ParsedObservation {
  verdict: ObservationVerdict;
  requirementIds: string[];
  /** Chapter numerals the matched requirements land in, for the banker's routing. */
  chapters: string[];
  /** The terms that produced the verdict, so a reader can audit and overrule it. */
  matchedTerms: string[];
}

export interface ReplayReport {
  observations: MappedObservation[];
  counts: {
    total: number;
    mapped: number;
    outOfScope: number;
    unmapped: number;
  };
  /**
   * Mapped as a percentage of IN-SCOPE observations — out-of-scope items are
   * removed from the denominator, not counted as successes. Null when there is
   * nothing in scope to score, because 0/0 is not 100%.
   */
  coveragePct: number | null;
  /** Requirement IDs the letter touched, for the banker to jump to. */
  requirementIds: string[];
  registryVersion: string;
}
