/**
 * Drafter — core type model.
 *
 * The central design decision: generation produces a STRUCTURED DOCUMENT, not a
 * string. Every block carries provenance (where the text came from) and the
 * requirement IDs it discharges. The on-screen view, the DOCX export, the PDF
 * export and the gap report are all projections of this one model.
 *
 * That is what makes the "regulatory-grade traceability" claim real rather than
 * cosmetic: the disclosure trail is machine-readable by construction.
 */

// ---------------------------------------------------------------------------
// Provenance — the audit trail
// ---------------------------------------------------------------------------

/**
 * Where a block's content came from. This is the heart of the no-hallucination
 * guarantee: anything marked `issuer-input` or `derived` is traceable to a field
 * the issuer supplied, and `llm-narrative` blocks are only ever phrasing around
 * facts that were passed to the model.
 */
export type ProvenanceOrigin =
  | "issuer-input" // copied verbatim from an issuer-supplied field
  | "derived" // computed arithmetically from issuer-supplied fields
  | "llm-narrative" // language model prose, constrained to supplied facts
  | "template-narrative" // deterministic template prose (no LLM key present)
  | "standard-clause" // standard offer-document text, banker to finalise
  | "placeholder"; // structured gap: content the issuer has not yet supplied

export interface Provenance {
  origin: ProvenanceOrigin;
  /** Dotted paths into the issuer data object that this block relies on. */
  fields?: string[];
  /** Requirement IDs this block contributes to discharging. */
  requirementIds?: string[];
  /** Human-readable note shown in the traceability panel. */
  note?: string;
}

// ---------------------------------------------------------------------------
// Blocks — the document's atomic content units
// ---------------------------------------------------------------------------

export interface ParagraphBlock {
  kind: "para";
  text: string;
  provenance: Provenance;
}

export interface HeadingBlock {
  kind: "heading";
  level: 2 | 3;
  text: string;
  provenance: Provenance;
}

export interface ListBlock {
  kind: "list";
  ordered?: boolean;
  items: string[];
  provenance: Provenance;
}

export interface TableColumn {
  header: string;
  /** Right-align and use tabular figures — for monetary and share-count columns. */
  numeric?: boolean;
  /** Relative column width hint, used by the DOCX and PDF exporters. */
  width?: number;
}

export interface TableBlock {
  kind: "table";
  caption?: string;
  columns: TableColumn[];
  rows: string[][];
  /** Row indices (into `rows`) to render as emphasised total rows. */
  totalRowIndices?: number[];
  /** Footnotes printed beneath the table, e.g. reconciliation statements. */
  notes?: string[];
  provenance: Provenance;
}

export interface PlaceholderBlock {
  kind: "placeholder";
  text: string;
  /** Plain-language description of what the issuer must supply to fill this. */
  requiredInputs: string[];
  provenance: Provenance;
}

export interface CalloutBlock {
  kind: "callout";
  tone: "standard" | "attention";
  title?: string;
  text: string;
  provenance: Provenance;
}

export type Block =
  | ParagraphBlock
  | HeadingBlock
  | ListBlock
  | TableBlock
  | PlaceholderBlock
  | CalloutBlock;

// ---------------------------------------------------------------------------
// Document structure
// ---------------------------------------------------------------------------

export type ChapterMode = "factual" | "narrative" | "boilerplate";

/**
 * How complete a chapter is. Drives the colour chips in the TOC.
 * - `generated`  — fully drafted from issuer data / LLM / standard clauses
 * - `partial`    — drafted, but at least one placeholder remains
 * - `skeleton`   — heading and structured placeholders only (non-priority chapter)
 */
export type ChapterStatus = "generated" | "partial" | "skeleton";

export interface Chapter {
  id: string;
  title: string;
  sectionId: string;
  sectionTitle: string;
  mode: ChapterMode;
  priority: boolean;
  /** Requirement IDs mapped to this chapter, inverted from the registry. */
  requirementIds: string[];
  blocks: Block[];
  status: ChapterStatus;
  wordCount: number;
  /** Distinct provenance origins present in this chapter, for the source strip. */
  origins: ProvenanceOrigin[];
}

export interface DocSection {
  id: string;
  title: string;
  chapterIds: string[];
}

export interface CoverPage {
  companyName: string;
  cin: string;
  incorporationLine: string;
  registeredOffice: string;
  corporateOffice: string;
  contactLine: string;
  companySecretary: string;
  promoters: string;
  documentLabel: string;
  issueTypeLine: string;
  issueLine: string;
  priceLine: string;
  platformLine: string;
  leadManager: string;
  registrar: string;
  marketMaker: string;
  generalRisk: string;
  issuerResponsibility: string;
  lmResponsibility: string;
}

export interface DrhpDocument {
  issuerId: string;
  issuerName: string;
  docType: string;
  cover: CoverPage;
  sections: DocSection[];
  chapters: Chapter[];
  generatedAt: string;
  /** Version identifier of the regulation set used — a supervision requirement. */
  regulationSetVersion: string;
  regulationSetDescription: string;
  /** True when a language model drafted the narrative chapters. */
  llmUsed: boolean;
  llmModel?: string;
  /** Explains why the LLM was or was not used — surfaced in the UI. */
  generationMode: "llm" | "template";
  generationNote: string;
  stats: {
    totalChapters: number;
    generatedChapters: number;
    partialChapters: number;
    skeletonChapters: number;
    totalWords: number;
    totalTables: number;
    placeholders: number;
  };
}

// ---------------------------------------------------------------------------
// Requirement registry
// ---------------------------------------------------------------------------

export type Fulfilment = "issuer_data" | "standard_clause" | "banker_certification";

export interface ConsistencyCheckSpec {
  type:
    | "cross_section_numeric"
    | "sum_reconciliation"
    | "difference_reconciliation"
    | "series_consistency"
    | "shareholding_reconciliation"
    | "litigation_flag"
    | "related_party_flag"
    | "presence_critical"
    | "percentage_cap"
    | "prohibited_object"
    | "register_check";
  [key: string]: unknown;
}

/**
 * Gate that decides whether a requirement applies to this issuer at all.
 *
 * Without `exceeds`, `field` is a boolean-ish path: when it is explicitly
 * false, the requirement is reported as "Not applicable" rather than "Missing".
 *
 * With `exceeds`, `field` is numeric and the requirement applies only above
 * that threshold — Regulation 262(1) requires a monitoring agency only where
 * the issue exceeds ₹50 crore, and most SME issues do not reach it.
 */
export interface Applicability {
  field: string;
  /** Numeric threshold; the requirement applies only when field > exceeds. */
  exceeds?: number;
  reason: string;
}

export interface Requirement {
  id: string;
  requirement: string;
  source: string;
  evidence: string;
  mandatory: boolean;
  fulfilment: Fulfilment;
  chapters: string[];
  evidence_fields: string[];
  consistency_check?: ConsistencyCheckSpec;
  applicability?: Applicability;
  /** Share of the real-DRHP corpus containing this item (registry R3 onwards). */
  corpus_evidence?: string;
  /**
   * How the corpus study should treat this requirement.
   *
   * - `absence-expected` — a prohibition. No compliant filing contains the
   *   thing it forbids, so a 0% hit rate is the corpus agreeing with the rule.
   * - `not-keyword-detectable` — a property of how the prose is WRITTEN
   *   (register, tone), which a keyword probe cannot measure.
   *
   * Both are excluded from the evidenced-in-N%-of-filings score, which would
   * otherwise report correct behaviour as a gap.
   */
  corpus_probe?: "absence-expected" | "not-keyword-detectable";
}

export interface RegistrySection {
  section_id: string;
  section_title: string;
  requirements: Requirement[];
}

export interface RequirementRegistry {
  registry_version: string;
  regulation_set: string;
  note: string;
  fulfilment_legend: Record<string, string>;
  sections: RegistrySection[];
}

// ---------------------------------------------------------------------------
// DRHP structure tree
// ---------------------------------------------------------------------------

export interface StructureChapter {
  id: string;
  title: string;
  mode: ChapterMode;
  priority?: boolean;
  must_cover?: string[];
}

export interface StructureSection {
  id: string;
  title: string;
  chapters: StructureChapter[];
}

export interface DrhpStructure {
  doc_type: string;
  basis: string;
  front_matter: {
    cover_page: string[];
    standard_statements: string[];
  };
  sections: StructureSection[];
  generation_policy: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Gap & Consistency report (modelled on an exchange pre-check report)
// ---------------------------------------------------------------------------

export type RequirementStatus =
  | "Complete"
  | "Partial"
  | "Missing"
  | "Defect"
  /**
   * The requirement does not apply to this issuer — e.g. installed capacity for
   * a services business. Excluded from the coverage denominator entirely, so a
   * software issuer is not marked down for lacking a factory.
   */
  | "Not applicable";

export interface RequirementResult {
  id: string;
  requirement: string;
  sectionId: string;
  sectionTitle: string;
  source: string;
  evidence: string;
  mandatory: boolean;
  fulfilment: Fulfilment;
  chapters: string[];
  chapterTitles: string[];
  status: RequirementStatus;
  /** Evidence fields present vs expected — the basis of the Partial state. */
  fieldsPresent: string[];
  fieldsMissing: string[];
  detail: string;
}

export type FindingCategory =
  | "Inconsistency"
  | "Missing Information"
  | "Compliance Issue"
  | "Red Flag";

export type FindingSeverity = "high" | "medium" | "low";

export interface Finding {
  /** Stable code in the style of an exchange observation, e.g. DR-INC-001. */
  code: string;
  category: FindingCategory;
  severity: FindingSeverity;
  requirementId: string;
  /** Chapters where the issue is located, for "exact location" reporting. */
  locations: { chapterId: string; chapterTitle: string }[];
  title: string;
  observation: string;
  /** Why the exchange returns drafts for this — the BSE pre-check framing. */
  exchangePattern?: string;
  remediation: string;
  /** Concrete values involved, rendered as a small comparison table. */
  values?: { label: string; value: string }[];
  /** True when this corresponds to a deliberately planted demo defect. */
  planted?: boolean;
}

export interface GapReport {
  issuerId: string;
  issuerName: string;
  generatedAt: string;
  registryVersion: string;
  regulationSet: string;
  /** Weighted coverage: Complete = 1, Partial = 0.5, Missing/Defect = 0. */
  coveragePct: number;
  /** Coverage restricted to items the issuer itself can discharge. */
  issuerCoveragePct: number;
  counts: {
    /** Applicable requirements only — the coverage denominator. */
    total: number;
    complete: number;
    partial: number;
    missing: number;
    defect: number;
    /** Requirements that do not apply to this issuer (e.g. capacity for a services business). */
    notApplicable: number;
    bankerDependent: number;
    standardClause: number;
  };
  findingCounts: {
    high: number;
    medium: number;
    low: number;
    byCategory: Record<FindingCategory, number>;
  };
  items: RequirementResult[];
  findings: Finding[];
  /** Readiness verdict shown at the top of the report. */
  verdict: {
    level: "not-ready" | "attention" | "substantially-complete";
    headline: string;
    detail: string;
  };
}

// ---------------------------------------------------------------------------
// Issuer data
// ---------------------------------------------------------------------------

/**
 * Issuer data is intentionally loosely typed: the wizard writes arbitrary
 * dotted paths into it and the registry reads them back by path. Concrete shape
 * is documented by the two sample issuers in `data/`.
 */
export type IssuerData = Record<string, any>;

export interface IssuerMeta {
  issuer_id: string;
  case_name: string;
  sector: string;
  purpose: string;
  fictional: boolean;
  planted_defects: {
    id: string;
    type: string;
    where: string;
    should_be_caught_by: string;
  }[];
}
