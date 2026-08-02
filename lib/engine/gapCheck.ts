/**
 * Gap & Consistency Checker — Drafter's trust layer.
 *
 * Deliberately modelled on an exchange pre-check report (compliance issues +
 * missing information + exact locations), because Drafter sits UPSTREAM of the
 * exchange's own AI pre-check. Every finding therefore carries the
 * `exchangePattern` that explains why a real exchange returns drafts for it.
 *
 * Two design commitments worth stating:
 *
 * 1. Coverage is COMPUTED, never asserted. Each requirement declares
 *    `evidence_fields`; presence of those fields in the issuer data decides
 *    Complete / Partial / Missing. Filling in the wizard moves the number.
 *
 * 2. The red-flag checks DERIVE their conclusion from the issuer's free text
 *    rather than trusting a pre-set boolean. The litigation check reads the
 *    narrative answers, finds the proceeding, then observes that the Legal
 *    chapter says "None pending". That is the behaviour that generalises to a
 *    real issuer who never sets a flag.
 */

import {
  allRequirements,
  chapterTitle,
  getRequirementSection,
  registry,
} from "../data";
import type {
  Finding,
  FindingCategory,
  GapReport,
  IssuerData,
  IssuerMeta,
  Requirement,
  RequirementResult,
  RequirementStatus,
} from "../types";
import {
  containsAny,
  formatCrore,
  formatIndianNumber,
  getPath,
  isExplicitNil,
  isPresent,
  money,
  pctDiff,
  round,
  sumBy,
} from "./utils";

// ---------------------------------------------------------------------------
// Keyword banks for the derived red-flag checks
// ---------------------------------------------------------------------------

/**
 * Terms that indicate a legal or quasi-legal proceeding. Kept broad because a
 * promoter writing in plain language says "notice from the GST people", not
 * "proceeding under section 73".
 */
const LITIGATION_KEYWORDS = [
  "litigation",
  "litigations",
  "suit",
  "case pending",
  "court",
  "tribunal",
  "appellate",
  "appeal",
  "show-cause",
  "show cause",
  "notice",
  "demand",
  "penalty",
  "prosecution",
  "arbitration",
  "dispute",
  "proceeding",
  "summons",
  "attachment",
  "recovery",
  "default",
  "under protest",
];

/** Terms that indicate a transaction with a related party. */
const RELATED_PARTY_KEYWORDS = [
  "promoter-owned",
  "promoter owned",
  "owned by the promoter",
  "owned by promoters",
  "promoter family",
  "promoter group",
  "related party",
  "related-party",
  "group entity",
  "group company",
  "leased from the managing director",
  "leased from the promoter",
  "director in his personal capacity",
  "director in her personal capacity",
  "llp",
  "huf",
  "family trust",
];

// ---------------------------------------------------------------------------
// Finding code allocation
// ---------------------------------------------------------------------------

const CODE_PREFIX: Record<FindingCategory, string> = {
  Inconsistency: "DR-INC",
  "Missing Information": "DR-MIS",
  "Compliance Issue": "DR-CMP",
  "Red Flag": "DR-RFL",
};

function makeCoder() {
  const counters: Record<string, number> = {};
  return (category: FindingCategory): string => {
    const prefix = CODE_PREFIX[category];
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    return `${prefix}-${String(counters[prefix]).padStart(3, "0")}`;
  };
}

/**
 * Read a numeric field, returning null when it is absent.
 *
 * `Number(null)` and `Number("")` are both 0, and 0 is finite — so reading a
 * missing field naively makes a reconciliation check fire against a phantom
 * zero and report nonsense like "against net proceeds of INR 0.00 crore".
 * Real issuer data is full of not-yet-supplied fields (a draft DRHP legitimately
 * carries "[●]" for anything price-dependent), so every numeric check must
 * distinguish "absent" from "zero".
 */
function num(data: IssuerData, path: string | undefined): number | null {
  if (!path) return null;
  const raw = getPath(data, path);
  if (!isPresent(raw)) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Is the gap between two figures a power-of-ten unit slip rather than a genuine
 * disagreement?
 *
 * Indian financial statements are published in lakh, thousand or crore more or
 * less interchangeably, and Drafter's fields are all in crore. A promoter
 * copying "4,560.00" from a statement headed "INR in lakh" into a field labelled
 * "INR crore" produces a 9,900% discrepancy that is not a discrepancy at all.
 * Detecting the ratio lets the report name the actual mistake.
 */
function detectUnitScale(
  a: number,
  b: number,
): { factorLabel: string; likelyUnitError: string; reading: string; larger: number; smaller: number } | null {
  if (a === 0 || b === 0) return null;
  const larger = Math.max(Math.abs(a), Math.abs(b));
  const smaller = Math.min(Math.abs(a), Math.abs(b));
  const ratio = larger / smaller;

  const CANDIDATES: { factor: number; label: string; error: string; reading: string }[] = [
    {
      factor: 100,
      label: "100 times",
      error: "lakh entered where crore was expected",
      reading: "read as lakh is the same amount as the smaller figure read as crore",
    },
    {
      factor: 1000,
      label: "1,000 times",
      error: "thousand entered where lakh or crore was expected",
      reading: "read in thousands corresponds to the smaller figure",
    },
    {
      factor: 10000000,
      label: "1 crore times",
      error: "rupees entered where crore was expected",
      reading: "read in rupees is the same amount as the smaller figure read as crore",
    },
    {
      factor: 100000,
      label: "1 lakh times",
      error: "rupees entered where lakh was expected",
      reading: "read in rupees corresponds to the smaller figure",
    },
  ];

  for (const candidate of CANDIDATES) {
    // Within 1% of an exact power-of-ten relationship.
    if (Math.abs(ratio - candidate.factor) / candidate.factor <= 0.01) {
      return {
        factorLabel: candidate.label,
        likelyUnitError: candidate.error,
        reading: candidate.reading,
        larger,
        smaller,
      };
    }
  }
  return null;
}

/**
 * Markers of first-person or conversational writing, split by who can fix them.
 *
 * A promoter answering "what does your company do?" naturally writes "we do
 * housekeeping for offices". That is the right answer to the question and the
 * wrong register for a prospectus, which speaks impersonally about "the
 * Company".
 *
 * The split matters, because the two halves have different remedies:
 *
 *  `auto`   — person, possessives, approximation qualifiers, "percent", "right
 *             now". These are mechanical, so `register.ts` rewrites them
 *             deterministically on the way into the document. The checker still
 *             reports them, but as a note on what was changed, not as a defect.
 *
 *  `issuer` — vagueness: "nothing much", "a few", "they pay on time". Deciding
 *             that "Nothing much" means "there is no outstanding litigation" is
 *             an inference about a legal fact, and Drafter does not make those.
 *             Only the issuer can replace these, so they stay a finding.
 */
type RegisterMarker = { label: string; fixable: "auto" | "issuer" };

function detectInformalRegister(text: string): RegisterMarker[] {
  const PATTERNS: { re: RegExp; label: string; fixable: "auto" | "issuer" }[] = [
    { re: /\bwe\s+(?:do|are|have|sign|take|buy|started|work|also|mostly|had)\b/gi, label: "first person (“we …”)", fixable: "auto" },
    { re: /\bour\s+(?:biggest|own)\b/gi, label: "first person (“our …”)", fixable: "auto" },
    { re: /\bright now\b/gi, label: "“right now”", fixable: "auto" },
    { re: /\b(?:roughly|around|about)\s+\d/gi, label: "approximation (“about 19 percent”)", fixable: "auto" },
    { re: /\bpercent\b/gi, label: "“percent” written out rather than %", fixable: "auto" },
    { re: /\bnothing much\b|\bnothing major\b/gi, label: "“nothing much”, vague where a disclosure is required", fixable: "issuer" },
    { re: /\ba few\b/gi, label: "“a few”, unquantified", fixable: "issuer" },
    { re: /\blot of\b|\blots of\b/gi, label: "“lots of”, unquantified", fixable: "issuer" },
    { re: /\bkind of\b|\bsort of\b/gi, label: "hedging (“sort of”)", fixable: "issuer" },
    { re: /\bthey pay\b|\bpay on time\b/gi, label: "conversational claim about a third party", fixable: "issuer" },
  ];

  const found: RegisterMarker[] = [];
  for (const pattern of PATTERNS) {
    if (pattern.re.test(text)) found.push({ label: pattern.label, fixable: pattern.fixable });
    pattern.re.lastIndex = 0;
  }
  return found;
}

/** Resolve a requirement's chapters into the location list a report needs. */
/**
 * Does this requirement apply to this issuer at all?
 *
 * Two gate shapes, because the regulations use two:
 *
 *  - a BOOLEAN gate — installed capacity does not apply to a services business.
 *    Only an explicit `false` excuses it; an unanswered flag leaves the
 *    requirement in force, because silence is not an exemption.
 *
 *  - a THRESHOLD gate — Regulation 262(1) requires a monitoring agency only
 *    where the issue exceeds ₹50 crore. Most SME issues are far below that, so
 *    demanding one of every issuer is not a strict reading of the rule, it is a
 *    false positive. An absent or unparseable figure leaves the requirement in
 *    force: the gate excuses an issuer only on a figure it can actually see.
 */
function gateApplies(data: IssuerData, gate: NonNullable<Requirement["applicability"]>): boolean {
  if (gate.exceeds !== undefined) {
    const value = num(data, gate.field);
    return value === null ? true : value > gate.exceeds;
  }
  return getPath(data, gate.field) !== false;
}

function locationsFor(requirement: Requirement) {
  return requirement.chapters.map((chapterId) => ({
    chapterId,
    chapterTitle: chapterTitle(chapterId),
  }));
}

// ---------------------------------------------------------------------------
// Consistency checks
// ---------------------------------------------------------------------------

interface CheckOutcome {
  failed: boolean;
  finding?: Omit<Finding, "code" | "planted">;
}

function runConsistencyCheck(
  requirement: Requirement,
  data: IssuerData,
): CheckOutcome {
  const spec = requirement.consistency_check;
  if (!spec) return { failed: false };

  const locations = locationsFor(requirement);
  const exchangePattern = spec.exchange_pattern as string | undefined;

  switch (spec.type) {
    // -----------------------------------------------------------------
    // A figure stated in one chapter must equal the same figure elsewhere.
    // -----------------------------------------------------------------
    case "cross_section_numeric": {
      const a = num(data, spec.field_a as string);
      const b = num(data, spec.field_b as string);
      if (a === null || b === null) return { failed: false };

      const tolerance = Number(spec.tolerance_pct ?? 1);
      const diff = pctDiff(a, b);
      if (diff <= tolerance) return { failed: false };

      const unit = (spec.unit as string) ?? "";
      const scale = detectUnitScale(a, b);

      // A near-exact power-of-ten ratio is almost never a real disagreement
      // about the figure — it is the promoter having typed lakh into a field
      // asking for crore, which is the single most common data-entry error in
      // Indian filings. Saying "9,900% apart" is arithmetically true and
      // useless; naming the unit slip is what a first-time issuer can act on.
      if (scale) {
        return {
          failed: true,
          finding: {
            category: "Inconsistency",
            severity: "high",
            requirementId: requirement.id,
            locations,
            title: `Figures differ by exactly ${scale.factorLabel}, which looks like a ${scale.likelyUnitError}`,
            observation:
              `${spec.label_a} states ${money(a, unit)} and ${spec.label_b} shows ${money(b, unit)}. ` +
              `One figure is almost exactly ${scale.factorLabel} the other, which usually means the two were ` +
              `entered in different units rather than that they genuinely disagree. ` +
              `${money(scale.larger, unit)} ${scale.reading}.`,
            exchangePattern,
            remediation:
              `Check the units before changing either number. Every monetary field in Drafter is in ` +
              `INR crore: one crore is one hundred lakh, so a figure of ${formatIndianNumber(scale.larger)} ` +
              `keyed from a statement in lakh should be entered as ${formatCrore(scale.smaller)}. ` +
              `Correct the entry rather than restating the audited figure.`,
            values: [
              { label: String(spec.label_a), value: `${money(a, unit)}` },
              { label: String(spec.label_b), value: `${money(b, unit)}` },
              { label: "Ratio between them", value: scale.factorLabel },
              { label: "Most likely cause", value: scale.likelyUnitError },
            ],
          },
        };
      }

      return {
        failed: true,
        finding: {
          category: "Inconsistency",
          severity: "high",
          requirementId: requirement.id,
          locations,
          title: "Figures do not reconcile across chapters",
          observation:
            `The same figure is stated differently in two chapters. ` +
            `${spec.label_a} states ${money(a, unit)}, while ` +
            `${spec.label_b} shows ${money(b, unit)}, a difference of ` +
            `${money(Math.abs(round(a - b)), unit)} (${diff.toFixed(1)}%).`,
          exchangePattern,
          remediation:
            `Restate the business-section figure to agree with the restated audited ` +
            `financial statements, or explain the reconciling difference in a footnote. ` +
            `The audited figure governs.`,
          values: [
            { label: String(spec.label_a), value: `${money(a, unit)}` },
            { label: String(spec.label_b), value: `${money(b, unit)}` },
            {
              label: "Difference",
              value: `${money(Math.abs(round(a - b)), unit)} (${diff.toFixed(1)}%)`,
            },
          ],
        },
      };
    }

    // -----------------------------------------------------------------
    // A list of amounts must aggregate to a stated total.
    // -----------------------------------------------------------------
    case "sum_reconciliation": {
      const rows = getPath(data, spec.sum_field as string);
      const target = num(data, spec.target_field as string);
      if (!Array.isArray(rows) || rows.length === 0 || target === null) {
        return { failed: false };
      }

      const total = round(sumBy(rows, (spec.sum_key as string) ?? "amount"));
      const tolerance = Number(spec.tolerance_pct ?? 1);
      const diff = pctDiff(total, target);
      if (diff <= tolerance) return { failed: false };

      const unit = (spec.unit as string) ?? "";
      const shortfall = round(target - total);
      return {
        failed: true,
        finding: {
          category: "Inconsistency",
          severity: "high",
          requirementId: requirement.id,
          locations,
          title: "Stated objects do not aggregate to the net proceeds",
          observation:
            `${spec.label_sum} lists ${rows.length} utilisations aggregating ` +
            `${money(total, unit)}, against ${spec.label_target} of ` +
            `${money(target, unit)}. ` +
            `${money(Math.abs(shortfall), unit)} of the net proceeds is ` +
            `${shortfall > 0 ? "unallocated" : "over-allocated"} and unexplained.`,
          exchangePattern,
          remediation:
            `Either allocate the ${money(Math.abs(shortfall), unit)} balance to a ` +
            `stated object (general corporate purposes is capped by regulation), or correct ` +
            `the net proceeds figure. Every rupee of net proceeds must be accounted for.`,
          values: [
            { label: "Sum of stated objects", value: `${money(total, unit)}` },
            { label: "Stated net proceeds", value: `${money(target, unit)}` },
            {
              label: shortfall > 0 ? "Unallocated" : "Over-allocated",
              value: `${money(Math.abs(shortfall), unit)}`,
            },
          ],
        },
      };
    }

    // -----------------------------------------------------------------
    // gross - deduction must equal net.
    // -----------------------------------------------------------------
    case "difference_reconciliation": {
      const gross = num(data, spec.gross_field as string);
      const net = num(data, spec.net_field as string);
      const deduction = num(data, spec.deduction_field as string);
      if (gross === null || net === null || deduction === null) return { failed: false };

      const expected = round(gross - deduction);
      const tolerance = Number(spec.tolerance_pct ?? 1);
      const diff = pctDiff(expected, net);
      if (diff <= tolerance) return { failed: false };

      const unit = (spec.unit as string) ?? "";
      return {
        failed: true,
        finding: {
          category: "Inconsistency",
          severity: "medium",
          requirementId: requirement.id,
          locations,
          title: "Net proceeds do not bridge from the gross issue size",
          observation:
            `Gross issue size of ${money(gross, unit)} less estimated issue ` +
            `expenses of ${money(deduction, unit)} gives ${money(expected, unit)}, ` +
            `but net proceeds are stated as ${money(net, unit)}.`,
          exchangePattern,
          remediation:
            `Correct the issue-expense estimate or the net proceeds figure so the bridge ` +
            `from gross to net is arithmetically demonstrable.`,
          values: [
            { label: "Gross issue size", value: `${money(gross, unit)}` },
            { label: "Less: issue expenses", value: `${money(deduction, unit)}` },
            { label: "Expected net proceeds", value: `${money(expected, unit)}` },
            { label: "Stated net proceeds", value: `${money(net, unit)}` },
          ],
        },
      };
    }

    // -----------------------------------------------------------------
    // The last element of a time series must match the headline scalar.
    // -----------------------------------------------------------------
    case "series_consistency": {
      const series = getPath(data, spec.series_field as string);
      const scalar = num(data, spec.scalar_field as string);
      if (!Array.isArray(series) || series.length === 0 || scalar === null) {
        return { failed: false };
      }

      const last = Number(series[series.length - 1]);
      if (!isPresent(series[series.length - 1]) || !Number.isFinite(last)) return { failed: false };

      const tolerance = Number(spec.tolerance_pct ?? 1);
      const diff = pctDiff(last, scalar);
      if (diff <= tolerance) return { failed: false };

      const unit = (spec.unit as string) ?? "";
      return {
        failed: true,
        finding: {
          category: "Inconsistency",
          severity: "high",
          requirementId: requirement.id,
          locations,
          title: "Financial series is internally inconsistent",
          observation:
            `${spec.label_series} ends at ${money(last, unit)} for the latest ` +
            `year, but ${spec.label_scalar} is stated as ${money(scalar, unit)}.`,
          exchangePattern,
          remediation:
            `Align the latest-year figure with the final year of the restated series. ` +
            `Both are derived from the same audited accounts and cannot differ.`,
          values: [
            { label: "Latest year in series", value: `${money(last, unit)}` },
            { label: "Stated latest-year figure", value: `${money(scalar, unit)}` },
          ],
        },
      };
    }

    // -----------------------------------------------------------------
    // Shareholding pattern must add back to the paid-up capital.
    // -----------------------------------------------------------------
    case "shareholding_reconciliation": {
      const rows = getPath(data, spec.pattern_field as string);
      const total = num(data, spec.total_field as string);
      if (!Array.isArray(rows) || rows.length === 0 || total === null) {
        return { failed: false };
      }

      const sum = sumBy(rows, "shares");
      const tolerance = Number(spec.tolerance_pct ?? 0.5);
      const diff = pctDiff(sum, total);
      if (diff <= tolerance) return { failed: false };

      return {
        failed: true,
        finding: {
          category: "Inconsistency",
          severity: "high",
          requirementId: requirement.id,
          locations,
          title: "Shareholding pattern does not reconcile with paid-up capital",
          observation:
            `The shareholding pattern lists holdings totalling ` +
            `${formatIndianNumber(sum)} equity shares, but the pre-issue paid-up capital ` +
            `is stated as ${formatIndianNumber(total)} equity shares, a difference of ` +
            `${formatIndianNumber(Math.abs(sum - total))} shares.`,
          exchangePattern,
          remediation:
            `Reconcile the shareholder-wise holdings against the register of members so ` +
            `the pattern adds back to the pre-issue paid-up capital.`,
          values: [
            { label: "Sum of shareholdings", value: `${formatIndianNumber(sum)} shares` },
            { label: "Pre-issue paid-up capital", value: `${formatIndianNumber(total)} shares` },
          ],
        },
      };
    }

    // -----------------------------------------------------------------
    // RED FLAG: a proceeding referenced anywhere must be formally disclosed.
    // Derived from free text — the promoter never sets a flag.
    // -----------------------------------------------------------------
    case "litigation_flag": {
      const scanFields = (spec.scan_fields as string[]) ?? [];
      const hits: { field: string; terms: string[]; excerpt: string }[] = [];

      for (const field of scanFields) {
        const text = getPath(data, field);
        const terms = containsAny(text, LITIGATION_KEYWORDS);
        if (terms.length > 0) {
          hits.push({ field, terms, excerpt: extractExcerpt(text, terms[0]) });
        }
      }

      // Corroborating explicit flag, if the dataset carries one.
      const flagged = getPath(data, spec.trigger_field as string) === true;
      const mentioned = hits.length > 0 || flagged;

      const declared = getPath(data, "legal.litigation");
      const disclosed = isPresent(declared) && !isExplicitNil(declared);

      if (!mentioned || disclosed) return { failed: false };

      const primary = hits[0];
      return {
        failed: true,
        finding: {
          category: "Red Flag",
          severity: "high",
          requirementId: requirement.id,
          locations,
          title: "Proceeding referenced elsewhere but not disclosed in the Legal chapter",
          observation:
            `The Legal chapter states ${JSON.stringify(String(declared ?? "").trim())}, ` +
            `but a proceeding is referenced in the issuer's own answers. ` +
            (primary
              ? `Found in "${humanField(primary.field)}": "…${primary.excerpt}…"`
              : `An outstanding matter was flagged in the intake.`),
          exchangePattern,
          remediation:
            `Disclose the matter in Outstanding Litigation and Material Developments with ` +
            `the forum, the amount involved, the present status, and the financial impact ` +
            `if determined adversely, and carry a corresponding risk factor. A matter ` +
            `referenced in the issuer's own records but omitted from the Legal chapter is ` +
            `treated as a material non-disclosure.`,
          values: hits.slice(0, 3).map((hit) => ({
            label: humanField(hit.field),
            value: `…${hit.excerpt}…`,
          })),
        },
      };
    }

    // -----------------------------------------------------------------
    // RED FLAG: related-party dealings referenced but declared as nil.
    // -----------------------------------------------------------------
    case "related_party_flag": {
      const declared = getPath(data, spec.declared_field as string);
      const declaredNil = !isPresent(declared) || isExplicitNil(declared);
      if (!declaredNil) return { failed: false };

      const scanFields = (spec.scan_fields as string[]) ?? [];
      const hits: { field: string; terms: string[]; excerpt: string }[] = [];
      for (const field of scanFields) {
        const text = getPath(data, field);
        const terms = containsAny(text, RELATED_PARTY_KEYWORDS);
        if (terms.length > 0) {
          hits.push({ field, terms, excerpt: extractExcerpt(text, terms[0]) });
        }
      }
      if (hits.length === 0) return { failed: false };

      return {
        failed: true,
        finding: {
          category: "Red Flag",
          severity: "high",
          requirementId: requirement.id,
          locations,
          title: "Related-party dealings referenced but declared as nil",
          observation:
            `Related-party transactions are declared as ` +
            `${JSON.stringify(String(declared ?? "").trim() || "(blank)")}, but the ` +
            `issuer's own answers describe dealings with promoter-connected entities. ` +
            hits
              .slice(0, 2)
              .map((hit) => `Found in "${humanField(hit.field)}": "…${hit.excerpt}…"`)
              .join(" "),
          exchangePattern,
          remediation:
            `Disclose each related-party relationship, the nature of the transaction and ` +
            `the amount for every reported period, consistent with the related-party ` +
            `schedule in the audited financial statements, and reflect the dependency as ` +
            `a risk factor.`,
          values: hits.slice(0, 3).map((hit) => ({
            label: humanField(hit.field),
            value: `…${hit.excerpt}…`,
          })),
        },
      };
    }

    // -----------------------------------------------------------------
    // A component of a total must not exceed a regulatory ceiling.
    // Used for the general-corporate-purposes cap, which the ICDR
    // Regulations fix as a share of gross proceeds.
    // -----------------------------------------------------------------
    case "percentage_cap": {
      const total = num(data, spec.total_field as string);
      if (total === null || total === 0) return { failed: false };

      // The capped amount is either a single figure (the offer for sale
      // component) or the sum of matching rows in a break-up (the general
      // corporate purposes objects).
      let component: number;
      if (spec.component_scalar_field) {
        const scalar = num(data, spec.component_scalar_field as string);
        if (scalar === null) return { failed: false };
        component = scalar;
      } else {
        const rows = getPath(data, spec.component_field as string);
        if (!Array.isArray(rows) || rows.length === 0) return { failed: false };
        const match = String(spec.component_match ?? "").toLowerCase();
        component = rows
          .filter((row: any) => String(row?.purpose ?? "").toLowerCase().includes(match))
          .reduce((sum: number, row: any) => sum + (Number(row?.amount) || 0), 0);
      }
      if (component === 0) return { failed: false };

      const capPct = Number(spec.cap_pct ?? 15);
      const actualPct = (component / total) * 100;

      // Regulation 230(2) is a two-limb cap — a percentage AND an absolute
      // amount, "whichever is less". For an SME issue the absolute limb binds
      // above a gross issue of about ₹67 crore, so both have to be evaluated;
      // a percentage-only test would clear an oversized allocation on a large
      // SME issue.
      const capAbsolute = spec.cap_absolute === undefined ? null : Number(spec.cap_absolute);
      const pctCeiling = (capPct / 100) * total;
      const ceiling = round(capAbsolute === null ? pctCeiling : Math.min(pctCeiling, capAbsolute));
      if (component <= ceiling + 0.005) return { failed: false };

      const unit = (spec.unit as string) ?? "";
      const subject = (spec.subject as string) ?? "general corporate purposes";
      const basis = (spec.total_label as string) ?? "the gross issue proceeds";
      const citation = (spec.citation as string) ?? "The ICDR Regulations cap";
      const bindingLimb =
        capAbsolute !== null && capAbsolute < pctCeiling
          ? `the absolute limb (${money(capAbsolute, unit)})`
          : `the percentage limb (${capPct}% of ${money(total, unit)})`;

      return {
        failed: true,
        finding: {
          category: "Compliance Issue",
          severity: "high",
          requirementId: requirement.id,
          locations,
          title: `${subject[0].toUpperCase()}${subject.slice(1)} exceeds the prescribed ceiling`,
          observation:
            `${money(component, unit)} is allocated to ${subject}, which is ` +
            `${actualPct.toFixed(1)}% of ${basis} of ${money(total, unit)}. ` +
            (capAbsolute === null
              ? `${citation} this at ${capPct}%, being ${money(ceiling, unit)}.`
              : `${citation} this at ${capPct}% of the amount being raised or ` +
                `${money(capAbsolute, unit)}, whichever is less. Here ${bindingLimb} binds, giving ` +
                `${money(ceiling, unit)}.`),
          exchangePattern,
          remediation:
            (spec.remediation as string) ??
            `Reduce the allocation to at most ${money(ceiling, unit)}, and identify the balance ` +
              `against a specific, described object. The ceiling is arithmetic and is checked ` +
              `directly by the exchange.`,
          values: [
            { label: `Allocated to ${subject}`, value: money(component, unit) },
            { label: "Gross issue proceeds", value: money(total, unit) },
            { label: `As a share of ${basis}`, value: `${actualPct.toFixed(1)}%` },
            {
              label: capAbsolute === null ? `Ceiling (${capPct}%)` : `Ceiling (lower of ${capPct}% and ${money(capAbsolute, unit)})`,
              value: money(ceiling, unit),
            },
          ],
        },
      };
    }

    // -----------------------------------------------------------------
    // An object of the issue that the regulations forbid outright.
    //
    // This is a different kind of finding from everything else here. The rest
    // of the checks report a disclosure that is missing or inconsistent, and
    // the remedy is to supply or reconcile it. Regulation 230(1)(h) is an
    // ELIGIBILITY condition: an SME issuer whose objects include repaying a
    // promoter or related-party loan cannot make the issue at all, and no
    // amount of redrafting fixes that. So it is reported as a Red Flag.
    // -----------------------------------------------------------------
    case "prohibited_object": {
      const rows = getPath(data, spec.component_field as string);
      if (!Array.isArray(rows) || rows.length === 0) return { failed: false };

      const parties = (spec.patterns as string[]) ?? [];
      const context = (spec.context as string[]) ?? [];

      // Both limbs must be present in the SAME object. "Repayment of bank
      // borrowings" and "Purchase of machinery from a promoter-owned supplier"
      // are each unremarkable on their own; it is the combination of a
      // repayment and a connected party in one object that is prohibited.
      const offenders = rows.filter((row: any) => {
        const text = `${row?.purpose ?? ""} ${row?.deployment ?? ""}`.toLowerCase();
        return parties.some((p) => text.includes(p)) && context.some((c) => text.includes(c));
      });
      if (offenders.length === 0) return { failed: false };

      const unit = "INR crore";
      const amount = offenders.reduce((sum: number, row: any) => sum + (Number(row?.amount) || 0), 0);

      return {
        failed: true,
        finding: {
          category: "Red Flag",
          severity: "high",
          requirementId: requirement.id,
          locations,
          title: "An object of the issue is prohibited for an SME issuer",
          observation:
            `${offenders.length} object${offenders.length === 1 ? "" : "s"} of the issue, totalling ` +
            `${money(amount, unit)}, appear${offenders.length === 1 ? "s" : ""} to apply issue proceeds ` +
            `towards repaying borrowings from a promoter, the promoter group or a related party: ` +
            `${offenders.map((row: any) => `"${String(row?.purpose ?? "").trim()}"`).join(", ")}. ` +
            `Regulation 230(1)(h), inserted with effect from 8 March 2025, prohibits this directly or indirectly.`,
          exchangePattern,
          remediation:
            `This is a condition of eligibility rather than a disclosure point, so it cannot be resolved ` +
            `by redrafting. Either fund the repayment from a source other than the issue proceeds, or ` +
            `remove the object and reduce the issue size accordingly. Confirm the position with the ` +
            `merchant banker before the draft is filed.`,
          values: offenders.slice(0, 4).map((row: any) => ({
            label: String(row?.purpose ?? "").trim().slice(0, 70),
            value: money(Number(row?.amount) || 0, unit),
          })),
        },
      };
    }

    // -----------------------------------------------------------------
    // The issuer's narrative answers are written in the first person or in
    // conversational register. An offer document must be impersonal and
    // formal, so this text cannot stand as drafted.
    // -----------------------------------------------------------------
    case "register_check": {
      const fields = (spec.fields as string[]) ?? [];
      const offenders: { field: string; markers: RegisterMarker[]; excerpt: string }[] = [];

      for (const field of fields) {
        const text = getPath(data, field);
        if (typeof text !== "string" || text.trim().length < 40) continue;
        const markers = detectInformalRegister(text);
        if (markers.length >= 2) {
          offenders.push({ field, markers, excerpt: text.trim().slice(0, 110) });
        }
      }
      if (offenders.length === 0) return { failed: false };

      const all = offenders.flatMap((o) => o.markers);
      const needsIssuer = offenders.filter((o) => o.markers.some((m) => m.fixable === "issuer"));
      const autoCount = all.filter((m) => m.fixable === "auto").length;
      const issuerMarkers = all.filter((m) => m.fixable === "issuer");

      // Nothing left for the issuer to do: Drafter has already rewritten every
      // marker on the way into the document. Report it so the banker knows the
      // prose was normalised rather than supplied that way, but do not present
      // a solved problem as an outstanding one.
      if (issuerMarkers.length === 0) {
        return {
          failed: true,
          finding: {
            category: "Compliance Issue",
            severity: "low",
            requirementId: requirement.id,
            locations,
            title: "Issuer answers were normalised into offer-document register",
            observation:
              `${offenders.length} of the issuer's narrative answers were supplied in the first person or ` +
              `in informal register (${autoCount} markers). Drafter rewrote these into impersonal register ` +
              `so "we do" becomes "the Company does" and "about 19 percent" becomes "approximately 19%", while leaving ` +
              `every figure exactly as supplied. Example, as supplied by the issuer, from ` +
              `${humanField(offenders[0].field)}: "${offenders[0].excerpt}…"`,
            exchangePattern:
              "Conversational or promotional language in an offer document draws an exchange observation on presentation, and marketing register in particular is expressly discouraged.",
            remediation:
              `No issuer action is required, but the merchant banker should read the affected chapters ` +
              `against the issuer's original answers, since the rewriting is mechanical and does not ` +
              `judge whether the underlying statement is complete.`,
            values: offenders.slice(0, 4).map((o) => ({
              label: humanField(o.field),
              value: `${o.markers.length} marker(s), normalised`,
            })),
          },
        };
      }

      const example = issuerMarkers.slice(0, 3).map((m) => `"${m.label}"`).join(", ");
      return {
        failed: true,
        finding: {
          category: "Compliance Issue",
          severity: "medium",
          requirementId: requirement.id,
          locations,
          title: "Narrative answers contain vague statements that cannot be drafted around",
          observation:
            `${needsIssuer.length} of the issuer's narrative answers contain statements too vague to carry ` +
            `into an offer document (${example}). Drafter normalises person and register automatically ` +
            `(${autoCount} such markers were rewritten), but it will not decide what a vague answer means: ` +
            `reading "nothing much" as "there is no outstanding litigation" would be an inference about a ` +
            `legal fact, not a rewording. Example, from ${humanField(needsIssuer[0].field)}: ` +
            `"${needsIssuer[0].excerpt}…"`,
          exchangePattern:
            "Conversational or promotional language in an offer document draws an exchange observation on presentation, and marketing register in particular is expressly discouraged.",
          remediation:
            `Replace each vague phrase with the specific position: a count, an amount, a date, or an ` +
            `express nil statement such as "there are no outstanding proceedings against the Company". ` +
            `The figures already supplied are not in question; what is needed is the particular the ` +
            `phrase stands in for.`,
          values: needsIssuer.slice(0, 4).map((o) => ({
            label: humanField(o.field),
            value: `${o.markers.filter((m) => m.fixable === "issuer").length} vague statement(s)`,
          })),
        },
      };
    }

    // -----------------------------------------------------------------
    // A field whose absence alone blocks exchange pre-check clearance.
    // -----------------------------------------------------------------
    case "presence_critical": {
      const fields = (spec.fields as string[]) ?? [];
      const missing = fields.filter((field) => !isPresent(getPath(data, field)));
      if (missing.length === 0) return { failed: false };

      // The finding is "financials are presented WITHOUT naming the auditor",
      // which is only true once there are financials to present. On an issuer
      // who has not started — every field empty — it is not a defect, it is one
      // of sixty missing fields, and reporting it as a high-severity compliance
      // issue makes the report cry wolf on the promoter's first screen. The
      // ordinary Missing status still records it; `depends_on` names the
      // evidence whose presence makes the omission meaningful.
      const dependsOn = (spec.depends_on as string[]) ?? [];
      if (dependsOn.length > 0 && !dependsOn.some((field) => isPresent(getPath(data, field)))) {
        return { failed: false };
      }

      return {
        failed: true,
        finding: {
          category: "Compliance Issue",
          severity: "high",
          requirementId: requirement.id,
          locations,
          title: "Mandatory auditor reference is absent",
          observation:
            `The restated financial statements are presented without ` +
            `${missing.map(humanField).map((f) => `"${f}"`).join(" and ")}. ` +
            `The offer document must identify the peer-reviewed statutory auditor and ` +
            `the firm registration number against the restated financials.`,
          exchangePattern,
          remediation:
            `Insert the name of the peer-reviewed statutory auditor, the ICAI firm ` +
            `registration number and the date of the examination report on the restated ` +
            `financial statements.`,
          values: missing.map((field) => ({ label: humanField(field), value: "Not supplied" })),
        },
      };
    }

    default:
      return { failed: false };
  }
}

/** Pull a readable window of text around a matched keyword. */
function extractExcerpt(text: string, term: string, window = 70): string {
  if (typeof text !== "string") return "";
  const index = text.toLowerCase().indexOf(term.toLowerCase());
  if (index === -1) return text.slice(0, window);
  const start = Math.max(0, index - Math.floor(window / 2));
  const end = Math.min(text.length, index + term.length + Math.floor(window / 2));
  return text.slice(start, end).trim();
}

/** Turn `business.internal_notes_for_checker` into "Business — internal notes". */
function humanField(path: string): string {
  const [group, ...rest] = path.split(".");
  const label = rest
    .join(" ")
    .replace(/_/g, " ")
    .replace(/\s*for checker\b/i, "")
    .trim();
  const groupLabel = group.replace(/_/g, " ");
  return `${groupLabel.charAt(0).toUpperCase()}${groupLabel.slice(1)}: ${label}`;
}

// ---------------------------------------------------------------------------
// Requirement evaluation
// ---------------------------------------------------------------------------

function evaluateRequirement(
  requirement: Requirement,
  data: IssuerData,
): { result: RequirementResult; checkOutcome: CheckOutcome } {
  const section = getRequirementSection(requirement.id);
  const fieldsPresent: string[] = [];
  const fieldsMissing: string[] = [];

  for (const field of requirement.evidence_fields ?? []) {
    if (isPresent(getPath(data, field))) fieldsPresent.push(field);
    else fieldsMissing.push(field);
  }

  let status: RequirementStatus;
  let detail = "";

  // Applicability gate first. A services issuer has no installed capacity, and
  // reporting that as a missing disclosure is simply wrong — it depresses the
  // coverage score with an obligation the issuer does not have. The corpus bore
  // this out: capacity disclosures appear in only 64% of filings because the
  // rest are not manufacturers.
  const gate = requirement.applicability;
  if (gate && !gateApplies(data, gate)) {
    return {
      result: {
        id: requirement.id,
        requirement: requirement.requirement,
        sectionId: section?.section_id ?? "",
        sectionTitle: section?.section_title ?? "",
        source: requirement.source,
        evidence: requirement.evidence,
        mandatory: requirement.mandatory,
        fulfilment: requirement.fulfilment,
        chapters: requirement.chapters,
        chapterTitles: requirement.chapters.map(chapterTitle),
        status: "Not applicable",
        fieldsPresent: [],
        fieldsMissing: [],
        detail: gate.reason,
      },
      checkOutcome: { failed: false },
    };
  }

  if (requirement.fulfilment === "standard_clause") {
    // Standard offer-document text is generated by Drafter, so the requirement
    // is structurally discharged — but never silently: it is always surfaced as
    // needing the merchant banker's finalisation.
    if (fieldsMissing.length > 0 && fieldsPresent.length === 0) {
      status = "Partial";
      detail =
        "Standard clause generated, but the issuer-specific particulars it merges are not yet supplied.";
    } else {
      status = "Complete";
      detail =
        "Discharged by standard offer-document text generated by Drafter. To be reviewed and finalised by the merchant banker.";
    }
  } else if (requirement.fulfilment === "banker_certification") {
    if (fieldsMissing.length === 0 && fieldsPresent.length > 0) {
      status = "Complete";
      detail = "Supporting information supplied; certification remains with the merchant banker.";
    } else {
      status = "Missing";
      detail =
        "Discharged by the merchant banker or the statutory auditor during due diligence and certification. Not expected at the promoter drafting stage.";
    }
  } else {
    // issuer_data
    if (fieldsMissing.length === 0 && fieldsPresent.length > 0) {
      status = "Complete";
      detail = "All supporting information supplied by the issuer.";
    } else if (fieldsPresent.length > 0) {
      status = "Partial";
      detail = `Supplied in part. Outstanding: ${fieldsMissing.map(humanField).join("; ")}.`;
    } else {
      status = "Missing";
      detail = `No supporting information supplied. Required: ${(requirement.evidence_fields ?? [])
        .map(humanField)
        .join("; ")}.`;
    }
  }

  // A failed consistency check overrides any status: the information may be
  // present but it does not hold together, which is the more serious problem.
  const checkOutcome = runConsistencyCheck(requirement, data);
  if (checkOutcome.failed) {
    status = "Defect";
    detail = checkOutcome.finding!.observation;
  }

  return {
    result: {
      id: requirement.id,
      requirement: requirement.requirement,
      sectionId: section?.section_id ?? "",
      sectionTitle: section?.section_title ?? "",
      source: requirement.source,
      evidence: requirement.evidence,
      mandatory: requirement.mandatory,
      fulfilment: requirement.fulfilment,
      chapters: requirement.chapters,
      chapterTitles: requirement.chapters.map(chapterTitle),
      status,
      fieldsPresent,
      fieldsMissing,
      detail,
    },
    checkOutcome,
  };
}

// ---------------------------------------------------------------------------
// Report assembly
// ---------------------------------------------------------------------------

export function runGapCheck(
  data: IssuerData,
  options: { issuerId?: string; issuerName?: string; meta?: IssuerMeta } = {},
): GapReport {
  const nextCode = makeCoder();
  const items: RequirementResult[] = [];
  const findings: Finding[] = [];

  // Requirement IDs a planted demo defect expects to be caught by. Used only to
  // annotate findings for the team's own verification — never to create one.
  const plantedTargets = new Set(
    (options.meta?.planted_defects ?? []).flatMap((defect) =>
      (defect.should_be_caught_by ?? "").split(/[^\w.]+/).filter((token) => /^R\d/.test(token)),
    ),
  );

  for (const requirement of allRequirements) {
    const { result, checkOutcome } = evaluateRequirement(requirement, data);
    items.push(result);

    if (checkOutcome.failed && checkOutcome.finding) {
      findings.push({
        ...checkOutcome.finding,
        code: nextCode(checkOutcome.finding.category),
        planted: plantedTargets.has(requirement.id),
      });
    }
  }

  // Missing / partial information becomes findings too, so the report reads as
  // a single actionable list rather than a status grid the promoter must decode.
  for (const item of items) {
    if (item.status === "Defect" || item.status === "Not applicable") continue;

    const requirement = allRequirements.find((r) => r.id === item.id)!;
    const locations = locationsFor(requirement);

    if (item.status === "Missing") {
      const bankerStage = item.fulfilment === "banker_certification";
      findings.push({
        code: nextCode("Missing Information"),
        category: "Missing Information",
        severity: bankerStage ? "low" : item.mandatory ? "medium" : "low",
        requirementId: item.id,
        locations,
        title: bankerStage
          ? "Awaiting merchant-banker or auditor certification"
          : `Required disclosure not yet supplied`,
        observation: `${item.requirement}. ${item.detail}`,
        remediation: bankerStage
          ? "No action required from the promoter at this stage. The merchant banker discharges this item during due diligence."
          : `Supply the information in the guided intake. Supporting evidence: ${item.evidence}.`,
        values: item.fieldsMissing.slice(0, 4).map((field) => ({
          label: humanField(field),
          value: "Not supplied",
        })),
      });
    } else if (item.status === "Partial") {
      findings.push({
        code: nextCode("Missing Information"),
        category: "Missing Information",
        severity: item.mandatory ? "medium" : "low",
        requirementId: item.id,
        locations,
        title: "Disclosure supplied only in part",
        observation: `${item.requirement}. ${item.detail}`,
        remediation: `Complete the outstanding fields in the guided intake so the chapter can be drafted in full.`,
        values: item.fieldsMissing.slice(0, 4).map((field) => ({
          label: humanField(field),
          value: "Not supplied",
        })),
      });
    }
  }

  // ----- Scores -------------------------------------------------------
  // Weighted so a half-answered requirement is not scored as a zero.
  const weightFor = (status: RequirementStatus) =>
    status === "Complete" ? 1 : status === "Partial" ? 0.5 : 0;

  // Requirements that do not apply to this issuer leave the denominator
  // entirely — they are not obligations, so they can neither be met nor missed.
  const applicable = items.filter((i) => i.status !== "Not applicable");

  const coveragePct = applicable.length
    ? Math.round((applicable.reduce((sum, i) => sum + weightFor(i.status), 0) / applicable.length) * 100)
    : 0;

  // Coverage over what the ISSUER can actually discharge. Banker-certification
  // items are excluded so the promoter's score is not depressed by work that is
  // not theirs to do — an honesty point, and it makes the number actionable.
  const issuerItems = applicable.filter((i) => i.fulfilment !== "banker_certification");
  const issuerCoveragePct = issuerItems.length
    ? Math.round(
        (issuerItems.reduce((sum, i) => sum + weightFor(i.status), 0) / issuerItems.length) * 100,
      )
    : 0;

  const counts = {
    total: applicable.length,
    complete: items.filter((i) => i.status === "Complete").length,
    partial: items.filter((i) => i.status === "Partial").length,
    missing: items.filter((i) => i.status === "Missing").length,
    defect: items.filter((i) => i.status === "Defect").length,
    notApplicable: items.filter((i) => i.status === "Not applicable").length,
    bankerDependent: applicable.filter((i) => i.fulfilment === "banker_certification").length,
    standardClause: applicable.filter((i) => i.fulfilment === "standard_clause").length,
  };

  const byCategory = findings.reduce(
    (acc, finding) => {
      acc[finding.category] = (acc[finding.category] ?? 0) + 1;
      return acc;
    },
    {
      Inconsistency: 0,
      "Missing Information": 0,
      "Compliance Issue": 0,
      "Red Flag": 0,
    } as Record<FindingCategory, number>,
  );

  const findingCounts = {
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
    byCategory,
  };

  // ----- Verdict ------------------------------------------------------
  const verdict = buildVerdict(coveragePct, findingCounts.high, counts.defect);

  // Severity, then category, then code — the order an exchange report reads in.
  const severityRank = { high: 0, medium: 1, low: 2 };
  findings.sort(
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] || a.code.localeCompare(b.code),
  );

  return {
    issuerId: options.issuerId ?? "custom",
    issuerName: options.issuerName ?? data?.identity?.company_name ?? "Issuer",
    generatedAt: new Date().toISOString(),
    registryVersion: registry.registry_version,
    regulationSet: registry.regulation_set,
    coveragePct,
    issuerCoveragePct,
    counts,
    findingCounts,
    items,
    findings,
    verdict,
  };
}

function buildVerdict(
  coveragePct: number,
  highFindings: number,
  defects: number,
): GapReport["verdict"] {
  if (highFindings > 0) {
    return {
      level: "attention",
      headline: `${highFindings} issue${highFindings === 1 ? "" : "s"} would return this draft at pre-check`,
      detail:
        `The draft carries ${defects} unresolved consistency or disclosure defect` +
        `${defects === 1 ? "" : "s"} of the kind an exchange pre-check flags. ` +
        `Resolve the high-severity findings below before the draft goes to the merchant banker.`,
    };
  }
  if (coveragePct < 60) {
    return {
      level: "not-ready",
      headline: "Substantial disclosure gaps remain",
      detail:
        "Too much of the disclosure framework is unanswered for this draft to be useful to a merchant banker. Continue through the guided intake.",
    };
  }
  return {
    level: "substantially-complete",
    headline: "No pre-check blocking issues detected",
    detail:
      "No inconsistencies or undisclosed matters were detected across the disclosure registry. " +
      "Remaining items are ordinary completeness gaps and matters reserved to the merchant banker. " +
      "This remains a preparatory draft and requires due diligence and certification before any filing.",
  };
}
