/**
 * Domain data access.
 *
 * The four JSON files in `data/` and `knowledge_base/` are the product's
 * regulatory assets. They are imported statically so they are available in both
 * server route handlers and client components without a fetch, and so a typo in
 * a chapter ID fails at build time rather than on stage.
 */

import structureJson from "@/data/drhp_structure.json";
import registryJson from "@/data/requirement_registry.json";
import questionnaireJson from "@/data/intake_questionnaire.json";
import templatesJson from "@/knowledge_base/section_templates.json";
import autocompJson from "@/data/sample_company_autocomp.json";
import specchemJson from "@/data/sample_company_specchem.json";
import problemStatementJson from "@/data/problem_statement.json";

import type {
  DrhpStructure,
  IssuerData,
  IssuerMeta,
  Requirement,
  RequirementRegistry,
  StructureChapter,
} from "./types";

export const structure = structureJson as unknown as DrhpStructure;
export const registry = registryJson as unknown as RequirementRegistry;
export const questionnaire = questionnaireJson as any;
export const sectionTemplates = templatesJson as any;

/**
 * SEBI's Track 04 problem statement, verbatim, split into the clauses that
 * impose a requirement — each next to the files that discharge it and the
 * number that proves it.
 *
 * Kept as data rather than prose in a page so the conformance claim has exactly
 * one home. A claim written into JSX gets copied into the README, then the two
 * drift, and the drifted one is the one a judge reads.
 */
export interface ProblemStatementClause {
  id: string;
  origin: string;
  text: string;
  status: "met" | "partial";
  discharged_by: string;
  files: string[];
  evidence: string;
}

export interface ProblemStatement {
  source: string;
  title: string;
  recorded_at: string;
  clauses: ProblemStatementClause[];
}

export const problemStatement = problemStatementJson as unknown as ProblemStatement;

// ---------------------------------------------------------------------------
// Sample issuers
// ---------------------------------------------------------------------------

export interface SampleIssuer {
  id: string;
  name: string;
  sector: string;
  data: IssuerData;
  meta: IssuerMeta;
}

export const sampleIssuers: SampleIssuer[] = [
  {
    id: "autocomp",
    name: (autocompJson as any).meta.case_name,
    sector: (autocompJson as any).meta.sector,
    data: autocompJson as IssuerData,
    meta: (autocompJson as any).meta as IssuerMeta,
  },
  {
    id: "specchem",
    name: (specchemJson as any).meta.case_name,
    sector: (specchemJson as any).meta.sector,
    data: specchemJson as IssuerData,
    meta: (specchemJson as any).meta as IssuerMeta,
  },
];

export function getSampleIssuer(id: string): SampleIssuer {
  return sampleIssuers.find((issuer) => issuer.id === id) ?? sampleIssuers[0];
}

/** Deep clone so a wizard edit can never mutate the bundled sample data. */
export function cloneIssuerData(data: IssuerData): IssuerData {
  return JSON.parse(JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// A blank issuer — the starting point for a real company
// ---------------------------------------------------------------------------

/**
 * Build an empty issuer record from the questionnaire itself.
 *
 * Deriving this rather than hand-writing it is the whole point. A hand-written
 * skeleton would silently rot the moment a question is added: the new field
 * would be absent from the object, the wizard would still write to it, and the
 * two would disagree in ways nobody notices until a demo. Reading the same
 * questionnaire the wizard renders means the blank issuer is correct by
 * construction, for every question that exists today and every one added later.
 *
 * The empty VALUES matter as much as the keys:
 *
 *  - `""` for text — `isPresent("")` is false, so the requirement reads Missing.
 *  - `[]` for series, tables and objects — an empty array is honestly empty.
 *  - `null` for numbers and confirmations — NOT `0` and NOT `false`. Zero is a
 *    figure the issuer might genuinely mean, and `false` is a denial. Both must
 *    be distinguishable from "not answered yet", because the eligibility gate
 *    reports an unanswered confirmation as an open question rather than a fail.
 */
export function buildBlankIssuerData(): IssuerData {
  const data: IssuerData = {};

  const emptyFor = (type: string): unknown => {
    switch (type) {
      case "number":
        return null;
      case "confirm":
        return null;
      case "series":
      case "rows":
      case "objects":
        return [];
      default:
        return "";
    }
  };

  const put = (path: string, value: unknown) => {
    const parts = path.split(".");
    let node = data;
    for (let i = 0; i < parts.length - 1; i += 1) {
      node[parts[i]] = node[parts[i]] ?? {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
  };

  for (const step of (questionnaire as any).steps ?? []) {
    for (const question of step.questions ?? []) {
      // `upload` is a control, not a field — it writes into financials.* itself.
      if (question.type === "upload") continue;
      put(question.path, emptyFor(question.type));
      for (const row of question.rows ?? []) put(row.path, []);
    }
  }

  // Fields the engine reads that no question asks for directly. Without these
  // the generator would hit `undefined` on a brand-new issuer.
  data.meta = {
    issuer_id: "new-issuer",
    case_name: "",
    sector: "",
    purpose: "Issuer created in Drafter.",
    fictional: false,
    planted_defects: [],
  };
  data.financials = { ...(data.financials ?? {}), ebitda_3yr: [], total_assets_3yr: [], borrowings_3yr: [] };
  data.identity = { ...(data.identity ?? {}), corporate_office: "", website: "", phone: "" };
  data.legal = { ...(data.legal ?? {}), litigation_matters: [] };
  data.capital_structure = {
    ...(data.capital_structure ?? {}),
    authorised_capital: "",
    paid_up_capital: "",
    promoter_holding_pre_pct: null,
    public_holding_pre_pct: null,
  };
  data.issue = { ...(data.issue ?? {}), price_floor: null, price_cap: null };

  return data;
}

/** The blank issuer, presented alongside the samples in the picker. */
export const BLANK_ISSUER_ID = "new";

// ---------------------------------------------------------------------------
// Registry helpers
// ---------------------------------------------------------------------------

export const allRequirements: Requirement[] = registry.sections.flatMap(
  (section) => section.requirements as Requirement[],
);

const requirementById = new Map<string, Requirement>(
  allRequirements.map((requirement) => [requirement.id, requirement]),
);

export function getRequirement(id: string): Requirement | undefined {
  return requirementById.get(id);
}

/** The registry section a requirement belongs to — used for report grouping. */
export function getRequirementSection(id: string) {
  return registry.sections.find((section) =>
    section.requirements.some((requirement) => requirement.id === id),
  );
}

/**
 * Invert the registry: chapter ID -> requirement IDs.
 *
 * The registry is the single source of truth for this mapping. Inverting it here
 * (rather than duplicating chapter lists in the structure file) means a
 * requirement can be re-pointed at a different chapter in one place.
 */
export const chapterRequirementMap: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {};
  for (const requirement of allRequirements) {
    for (const chapterId of requirement.chapters) {
      (map[chapterId] ??= []).push(requirement.id);
    }
  }
  return map;
})();

export function requirementsForChapter(chapterId: string): string[] {
  return chapterRequirementMap[chapterId] ?? [];
}

// ---------------------------------------------------------------------------
// Structure helpers
// ---------------------------------------------------------------------------

export interface FlatChapter extends StructureChapter {
  sectionId: string;
  sectionTitle: string;
}

/** Every chapter in document order, carrying its parent section. */
export const flatChapters: FlatChapter[] = structure.sections.flatMap((section) =>
  section.chapters.map((chapter) => ({
    ...chapter,
    sectionId: section.id,
    sectionTitle: section.title,
  })),
);

const chapterById = new Map<string, FlatChapter>(
  flatChapters.map((chapter) => [chapter.id, chapter]),
);

export function getChapter(id: string): FlatChapter | undefined {
  return chapterById.get(id);
}

export function chapterTitle(id: string): string {
  if (id === "COVER") return "Cover Page";
  return chapterById.get(id)?.title ?? id;
}

/** Cover page is addressed as a pseudo-chapter so requirements can map to it. */
export const COVER_CHAPTER_ID = "COVER";
