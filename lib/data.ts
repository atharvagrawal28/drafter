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
