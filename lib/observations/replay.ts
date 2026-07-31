/**
 * Map exchange observations onto Drafter's requirement registry.
 *
 * Rule-based, for the same reason the circular watch is: this decides whether
 * Drafter claims it would have caught a real defect, and a model that maps an
 * observation to a plausible-looking wrong requirement would manufacture
 * exactly the false confidence the rest of the product is built to avoid.
 * Every verdict carries the terms that produced it and can be overruled.
 *
 * The number this produces is a claim ABOUT US, so the arithmetic is set up to
 * be hard on itself:
 *
 *  - An observation that matches nothing is reported as `unmapped` and counted
 *    against the score. Silently dropping it would turn a registry gap — the
 *    single most useful thing this feature can find — into a higher percentage.
 *  - `out-of-scope` is narrow, and leaves the denominator rather than joining
 *    the numerator. It is available only to observations that demand a physical
 *    artefact and do NOT also ask for a disclosure.
 *  - 0 in scope scores null, not 100%.
 */

import { allRequirements, getRequirement, registry } from "../data";
import type { MappedObservation, ParsedObservation, ReplayReport } from "./types";

/**
 * Terms that place an observation against a requirement.
 *
 * Longer, more specific phrases first — `scoreMatch` prefers them, so
 * "restated financial statements" wins over the bare "financial" it contains.
 */
export const OBSERVATION_MAP: { terms: string[]; requirementIds: string[] }[] = [
  // --- Objects and issue proceeds --------------------------------------
  { terms: ["general corporate purpose", "gcp"], requirementIds: ["R5.9"] },
  { terms: ["monitoring agency", "monitoring of issue proceeds"], requirementIds: ["R5.7"] },
  { terms: ["offer for sale", "selling shareholder"], requirementIds: ["R5.12"] },
  { terms: ["objects of the issue", "object of the issue", "deployment of the net proceeds", "utilisation of the net proceeds"], requirementIds: ["R5.3", "R5.4"] },
  { terms: ["net proceeds", "gross proceeds"], requirementIds: ["R5.5"] },
  { terms: ["working capital requirement", "means of finance"], requirementIds: ["R5.8"] },
  { terms: ["issue expense", "issue-related expense"], requirementIds: ["R5.10"] },
  { terms: ["repayment of", "loan from the promoter", "promoter loan"], requirementIds: ["R5.11"] },

  // --- Capital structure and promoters ---------------------------------
  { terms: ["capital structure", "shareholding pattern", "share capital", "paid-up capital", "build-up of"], requirementIds: ["R5.1"] },
  { terms: ["issue size", "face value", "number of equity shares offered"], requirementIds: ["R5.2"] },
  { terms: ["minimum promoters' contribution", "minimum promoter contribution", "promoter's contribution", "lock-in", "locked-in"], requirementIds: ["R12.2"] },
  { terms: ["promoter group", "promoter particulars", "promoters of the company"], requirementIds: ["R12.1"] },
  { terms: ["wilful defaulter", "willful defaulter", "fraudulent borrower", "fugitive economic offender", "debarred"], requirementIds: ["R12.3"] },

  // --- Financials ------------------------------------------------------
  { terms: ["restated financial statement", "restated financial"], requirementIds: ["R4.1"] },
  { terms: ["peer review", "peer-reviewed", "firm registration number", "examination report"], requirementIds: ["R4.3"] },
  { terms: ["accounting ratio", "earnings per share", "return on net worth", "net asset value"], requirementIds: ["R4.2"] },
  { terms: ["capitalisation statement", "capitalization statement"], requirementIds: ["R4.5"] },
  { terms: ["interim period", "stub period"], requirementIds: ["R4.4"] },
  { terms: ["financial indebtedness", "secured and unsecured", "borrowing"], requirementIds: ["R10.3"] },
  { terms: ["management's discussion", "management discussion", "results of operations"], requirementIds: ["R10.1", "R10.2"] },

  // --- Basis for issue price -------------------------------------------
  { terms: ["basis for issue price", "basis of the issue price", "price band", "floor price", "qualitative factor"], requirementIds: ["R9.1"] },
  { terms: ["quantitative factor", "price-to-earnings", "p/e ratio"], requirementIds: ["R9.2"] },
  { terms: ["listed industry peer", "peer comparison", "comparable compan"], requirementIds: ["R9.3"] },
  { terms: ["key performance indicator", "kpi"], requirementIds: ["R9.4"] },
  { terms: ["weighted average cost of acquisition", "waca"], requirementIds: ["R9.5"] },

  // --- Business --------------------------------------------------------
  { terms: ["our business", "business overview", "products and services"], requirementIds: ["R2.1"] },
  { terms: ["industry overview", "industry report", "market data", "competitive position"], requirementIds: ["R2.2"] },
  { terms: ["customer concentration", "key customer", "top customer"], requirementIds: ["R2.3", "R3.3"] },
  { terms: ["revenue from operations", "reconcile"], requirementIds: ["R2.4"] },
  { terms: ["installed capacity", "capacity utilisation", "capacity utilization"], requirementIds: ["R2.5"] },
  { terms: ["employee strength", "human resources", "number of employees"], requirementIds: ["R2.6"] },
  { terms: ["intellectual property", "trademark", "patent"], requirementIds: ["R2.7"] },
  { terms: ["immovable propert", "leasehold", "lease deed", "principal propert"], requirementIds: ["R2.8"] },

  // --- Risk factors ----------------------------------------------------
  { terms: ["risk factor"], requirementIds: ["R3.1"] },
  { terms: ["raw material", "supplier concentration"], requirementIds: ["R3.2"] },
  { terms: ["external risk", "issue-related risk"], requirementIds: ["R3.5"] },

  // --- Legal, management, governance -----------------------------------
  { terms: ["related party", "related-party"], requirementIds: ["R6.2"] },
  { terms: ["outstanding litigation", "litigation", "outstanding proceeding", "criminal proceeding", "material litigation", "pending case", "tax proceeding", "statutory dues"], requirementIds: ["R6.3", "R3.4"] },
  { terms: ["board of directors", "key managerial personnel", "our management", "directorship", "director of the company"], requirementIds: ["R6.1"] },
  { terms: ["corporate governance", "independent director", "audit committee"], requirementIds: ["R6.5"] },
  { terms: ["remuneration"], requirementIds: ["R6.6"] },
  { terms: ["group compan"], requirementIds: ["R6.4"] },
  { terms: ["subsidiar"], requirementIds: ["R6.7"] },

  // --- Approvals and regulation ----------------------------------------
  { terms: ["government approval", "statutory approval", "licence", "license", "registration under"], requirementIds: ["R11.1"] },
  { terms: ["key regulation", "applicable law", "policies applicable"], requirementIds: ["R11.2"] },
  { terms: ["sebi disclaimer", "exchange disclaimer", "disclaimer clause"], requirementIds: ["R11.3"] },
  { terms: ["price information of past issues", "track record of the lead manager"], requirementIds: ["R11.4"] },

  // --- Issue mechanics -------------------------------------------------
  { terms: ["the issue table", "fresh issue"], requirementIds: ["R8.1"] },
  { terms: ["basis of allotment", "issue structure", "allocation"], requirementIds: ["R8.2"] },
  { terms: ["terms of the issue", "ranking of equity shares", "mode of payment"], requirementIds: ["R8.3"] },
  { terms: ["asba", "upi", "issue procedure", "bidding process"], requirementIds: ["R8.4"] },
  { terms: ["market making", "market maker", "underwrit"], requirementIds: ["R5.6", "R8.5"] },

  // --- Front and back matter -------------------------------------------
  { terms: ["cover page", "red herring prospectus label"], requirementIds: ["R7.1"] },
  { terms: ["responsibility statement"], requirementIds: ["R7.2"] },
  { terms: ["general risk", "eligibility for the sme platform"], requirementIds: ["R7.3"] },
  { terms: ["definitions and abbreviation", "glossary"], requirementIds: ["R7.4"] },
  { terms: ["presentation of financial", "currency of presentation"], requirementIds: ["R7.5"] },
  { terms: ["forward-looking"], requirementIds: ["R7.6"] },
  { terms: ["summary of the offer document"], requirementIds: ["R7.7"] },
  { terms: ["lead manager", "registrar to the issue", "banker to the issue"], requirementIds: ["R1.3"] },
  { terms: ["compliance officer", "investor grievance"], requirementIds: ["R1.4"] },
  { terms: ["main objects", "memorandum of association"], requirementIds: ["R1.2"] },
  { terms: ["corporate identity number", "registered office", "date of incorporation"], requirementIds: ["R1.1"] },
  { terms: ["dividend"], requirementIds: ["R13.1"] },
  { terms: ["special tax benefit"], requirementIds: ["R13.2"] },
  { terms: ["articles of association"], requirementIds: ["R14.1"] },
  { terms: ["material contract", "documents for inspection"], requirementIds: ["R14.2"] },
  { terms: ["declaration by the directors", "declaration page"], requirementIds: ["R15.1"] },
  { terms: ["foreign ownership", "fema", "non-resident", "fdi"], requirementIds: ["R16.1"] },
  { terms: ["impersonal", "first person", "formal register"], requirementIds: ["R2.9"] },
];

/**
 * Physical artefacts an exchange asks to be produced. Drafter does not generate
 * any of these and must never take credit for them.
 *
 * Every entry is a specific document. A bare "certificate" used to be on this
 * list and it was wrong: "confirm the arrangements for safekeeping of the
 * physical share certificates" was classified out-of-scope and vanished from
 * the denominator, turning a genuine registry gap into a higher score. That is
 * precisely the failure this feature exists to expose, so the list is narrow
 * and every term names the artefact rather than gesturing at one.
 */
const ARTEFACTS = [
  "peer review certificate",
  "due diligence certificate",
  "auditor's certificate",
  "chartered accountant certificate",
  "certificate from the",
  "consent letter",
  "written consent",
  "undertaking",
  "affidavit",
  "no objection",
  "board resolution",
  "shareholders' resolution",
  "copy of the agreement",
  "executed agreement",
  "tripartite agreement",
  "in-principle approval",
  "self-attested",
  "duly signed",
  "notarised",
];

/**
 * Verbs that make an observation a demand to PRODUCE a document rather than to
 * write one. Required in addition to an artefact: the artefact alone is only a
 * noun the observation happens to mention.
 */
const PRODUCTION_VERBS = [
  "furnish",
  "provide",
  "submit",
  "enclose",
  "forward",
  "produce",
  "upload",
  "send us",
  "share a copy",
  "file with",
];

/**
 * Verbs that make an observation a DISCLOSURE demand rather than a document
 * demand. These take precedence: "disclose the name of the peer-reviewed
 * auditor" is a disclosure Drafter is responsible for, even though it mentions
 * a peer review certificate, whereas "furnish the peer review certificate" is
 * not. Getting this precedence backwards would let Drafter disown roughly a
 * third of a real letter and call the rest 100% covered.
 */
const DISCLOSURE_VERBS = [
  "disclose",
  "disclosure",
  "state in",
  "specify in",
  "include in the section",
  "reconcile",
  "explain the",
  "quantify",
  "add a risk factor",
  "revise the",
  "update the section",
  "clarify in the",
];

const norm = (text: string) => text.toLowerCase().replace(/\s+/g, " ");

function hits(haystack: string, needles: string[]): string[] {
  return needles.filter((needle) => haystack.includes(needle));
}

export function mapObservation(observation: ParsedObservation): MappedObservation {
  const text = norm(observation.text);

  const topics = OBSERVATION_MAP.filter((topic) => topic.terms.some((term) => text.includes(term)));
  const known = new Set(allRequirements.map((requirement) => requirement.id));
  const requirementIds = Array.from(
    new Set(topics.flatMap((topic) => topic.requirementIds).filter((id) => known.has(id))),
  ).sort();

  const artefactHits = hits(text, ARTEFACTS);
  const productionHits = hits(text, PRODUCTION_VERBS);
  const disclosureHits = hits(text, DISCLOSURE_VERBS);

  // Three conditions, all required. Disclosure wins outright — see
  // DISCLOSURE_VERBS above for why that precedence is the load-bearing decision
  // in this module — and an artefact must be actively demanded, not merely
  // mentioned, before an observation may leave the denominator.
  const outOfScope =
    artefactHits.length > 0 && productionHits.length > 0 && disclosureHits.length === 0;

  const matchedTerms = Array.from(
    new Set(
      outOfScope
        ? [...productionHits, ...artefactHits]
        : topics.flatMap((topic) => topic.terms.filter((term) => text.includes(term))),
    ),
  ).slice(0, 6);

  const chapters = Array.from(
    new Set(requirementIds.flatMap((id) => getRequirement(id)?.chapters ?? [])),
  ).sort();

  return {
    ...observation,
    verdict: outOfScope ? "out-of-scope" : requirementIds.length > 0 ? "mapped" : "unmapped",
    requirementIds: outOfScope ? [] : requirementIds,
    chapters: outOfScope ? [] : chapters,
    matchedTerms,
  };
}

export function replayObservations(parsed: ParsedObservation[]): ReplayReport {
  const observations = parsed.map(mapObservation);

  const mapped = observations.filter((o) => o.verdict === "mapped").length;
  const outOfScope = observations.filter((o) => o.verdict === "out-of-scope").length;
  const unmapped = observations.filter((o) => o.verdict === "unmapped").length;
  const inScope = mapped + unmapped;

  return {
    observations,
    counts: { total: observations.length, mapped, outOfScope, unmapped },
    // 0/0 is not 100%. A letter with nothing in scope scores nothing.
    coveragePct: inScope === 0 ? null : Math.round((mapped / inScope) * 100),
    requirementIds: Array.from(new Set(observations.flatMap((o) => o.requirementIds))).sort(),
    registryVersion: registry.registry_version,
  };
}
