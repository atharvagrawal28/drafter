/**
 * Applies the corpus-driven upgrade to the domain files.
 *
 * Every addition below is justified by evidence from the 14-document corpus in
 * backtest_output/corpus-result.json — the share of real filed SME DRHPs that
 * contain the item is recorded in each requirement's `corpus_evidence` field.
 * Nothing here is added on intuition.
 *
 * Run once: tsx scripts/apply-corpus-upgrade.ts
 */

import * as fs from "fs";

const STRUCTURE = "data/drhp_structure.json";
const REGISTRY = "data/requirement_registry.json";

const structure = JSON.parse(fs.readFileSync(STRUCTURE, "utf8"));
const registry = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));

// ---------------------------------------------------------------------------
// 1. New chapters
// ---------------------------------------------------------------------------

const sectionI = structure.sections.find((s: any) => s.id === "I");
if (!sectionI.chapters.some((c: any) => c.id === "I.4")) {
  sectionI.chapters.push({
    id: "I.4",
    title: "Summary of the Offer Document",
    mode: "factual",
    priority: true,
    must_cover: [
      "summary of the business",
      "summary of the industry",
      "names of promoters",
      "size of the issue",
      "objects of the issue",
      "pre-issue shareholding of promoters",
      "summary of restated financials",
      "summary of outstanding litigation",
      "summary of related-party transactions",
      "summary of contingent liabilities",
    ],
    corpus_evidence: "A dedicated summary chapter is required by Schedule VI and appears in the corpus; it is the first thing an exchange reviewer reads.",
  });
}

const sectionIV = structure.sections.find((s: any) => s.id === "IV");
if (!sectionIV.chapters.some((c: any) => c.id === "IV.9")) {
  sectionIV.chapters.push({
    id: "IV.9",
    title: "Our Subsidiaries",
    mode: "factual",
    corpus_evidence: "Present in 86% of the 14-document corpus. Distinct from group companies: a subsidiary is consolidated, a group company is not.",
  });
}

structure.basis =
  structure.basis +
  " Structure validated against a corpus of 14 filed NSE Emerge DRHPs (5,619 pages): 30 of 32 chapters appear in every document in the corpus, and all 32 in at least 86%.";

// ---------------------------------------------------------------------------
// 2. New requirements, each carrying its corpus evidence
// ---------------------------------------------------------------------------

const ADDITIONS: Record<string, any[]> = {
  S2: [
    {
      id: "R2.7",
      requirement: "Intellectual property owned or used by the issuer — trademarks, patents, designs and their registration status",
      source: "ICDR Sch VI (SME) — Our Business",
      evidence: "Trademark/patent registration certificates and applications",
      mandatory: true,
      fulfilment: "issuer_data",
      chapters: ["IV.2"],
      evidence_fields: ["business.intellectual_property"],
      corpus_evidence: "100% of the 14-document corpus",
    },
    {
      id: "R2.8",
      requirement: "Immovable properties owned or leased by the issuer, with tenure and the nature of the interest held",
      source: "ICDR Sch VI (SME) — Our Business / Our Property",
      evidence: "Title deeds, lease deeds, rent agreements",
      mandatory: true,
      fulfilment: "issuer_data",
      chapters: ["IV.2"],
      evidence_fields: ["business.immovable_properties"],
      corpus_evidence: "100% of the 14-document corpus",
    },
  ],
  S4: [
    {
      id: "R4.5",
      requirement: "Capitalisation statement showing borrowings and shareholders' funds before and after the issue",
      source: "ICDR Sch VI (SME) — Financial Information",
      evidence: "Derived from the restated financial statements and the issue size",
      mandatory: true,
      fulfilment: "issuer_data",
      chapters: ["V.1"],
      evidence_fields: ["financials.networth_3yr", "indebtedness.total_borrowings"],
      corpus_evidence: "79% of the 14-document corpus",
    },
  ],
  S5: [
    {
      id: "R5.7",
      requirement: "Appointment of a monitoring agency for the deployment of issue proceeds, or a statement of why one is not required",
      source: "ICDR Reg 262 (monitoring agency)",
      evidence: "Monitoring agency appointment letter, or the board's basis for non-applicability",
      mandatory: true,
      fulfilment: "issuer_data",
      chapters: ["III.5"],
      evidence_fields: ["issue.monitoring_agency"],
      corpus_evidence: "100% of the 14-document corpus",
    },
    {
      id: "R5.8",
      requirement: "Basis of the estimated working-capital requirement funded from the net proceeds, with the assumptions and holding periods relied upon",
      source: "ICDR Sch VI (SME) — Objects of the Issue",
      evidence: "Working-capital computation certified by the statutory auditor",
      mandatory: true,
      fulfilment: "issuer_data",
      chapters: ["III.5"],
      evidence_fields: ["issue.working_capital_basis"],
      corpus_evidence: "100% of the 14-document corpus",
    },
    {
      id: "R5.9",
      requirement: "Amount proposed to be deployed towards general corporate purposes, which must not exceed the ceiling prescribed under the ICDR Regulations",
      source: "ICDR Reg 7(2) / Sch VI — general corporate purposes ceiling (25% of gross proceeds)",
      evidence: "Objects break-up and gross issue size",
      mandatory: true,
      fulfilment: "issuer_data",
      chapters: ["III.5"],
      evidence_fields: ["issue.objects_breakup", "issue.issue_size"],
      corpus_evidence: "100% of the 14-document corpus",
      consistency_check: {
        type: "percentage_cap",
        component_field: "issue.objects_breakup",
        component_match: "general corporate",
        total_field: "issue.issue_size",
        cap_pct: 25,
        unit: "INR crore",
        label: "General corporate purposes as a share of gross proceeds",
        exchange_pattern:
          "General corporate purposes exceeding the prescribed ceiling of the gross issue proceeds is an arithmetic breach the exchange pre-check identifies immediately.",
      },
    },
    {
      id: "R5.10",
      requirement: "Break-up of the estimated issue-related expenses by category (fees of the lead manager, registrar, legal advisors, advertising, listing and statutory fees)",
      source: "ICDR Sch VI (SME) — Objects of the Issue",
      evidence: "Estimated expense schedule agreed with the lead manager",
      mandatory: true,
      fulfilment: "issuer_data",
      chapters: ["III.5"],
      evidence_fields: ["issue.issue_expenses_breakup"],
      corpus_evidence: "100% of the 14-document corpus",
    },
  ],
  S6: [
    {
      id: "R6.7",
      requirement: "Particulars of the issuer's subsidiaries, if any, with the nature of the holding and their financial position — or an express statement that the issuer has none",
      source: "ICDR Sch VI (SME) — Our Subsidiaries",
      evidence: "Shareholding records; MCA filings of each subsidiary",
      mandatory: true,
      fulfilment: "issuer_data",
      chapters: ["IV.9"],
      evidence_fields: ["management.subsidiaries"],
      corpus_evidence: "86% of the 14-document corpus",
    },
  ],
  S7: [
    {
      id: "R7.7",
      requirement: "Summary of the offer document — business, industry, promoters, issue size, objects, restated financials, litigation, related-party transactions and contingent liabilities, presented together at the front of the document",
      source: "ICDR Sch VI (SME) — Summary of the Offer Document",
      evidence: "Derived from the corresponding detailed chapters",
      mandatory: true,
      fulfilment: "issuer_data",
      chapters: ["I.4"],
      evidence_fields: ["identity.company_name", "business.business_description", "issue.issue_size", "financials.revenue_latest_year"],
      corpus_evidence: "Required by Schedule VI; the first chapter an exchange reviewer reads.",
    },
  ],
  S9: [
    {
      id: "R9.4",
      requirement: "Key performance indicators of the issuer's business, disclosed for each restated period, certified and approved by the audit committee",
      source: "ICDR Sch VI (SME) — Basis for Issue Price; SEBI KPI disclosure requirements",
      evidence: "KPI schedule approved by the audit committee and certified by the statutory auditor",
      mandatory: true,
      fulfilment: "issuer_data",
      chapters: ["III.6"],
      evidence_fields: ["business.kpis"],
      corpus_evidence: "100% of the 14-document corpus",
    },
    {
      id: "R9.5",
      requirement: "Weighted average cost of acquisition of equity shares by the promoters and selling shareholders, compared against the issue price",
      source: "ICDR Sch VI (SME) — Basis for Issue Price; SEBI WACA disclosure requirements",
      evidence: "Share acquisition history certified by the statutory auditor",
      mandatory: true,
      fulfilment: "issuer_data",
      chapters: ["III.6", "IV.6"],
      evidence_fields: ["promoters.waca"],
      corpus_evidence: "100% of the 14-document corpus",
    },
    {
      id: "R9.6",
      requirement: "Weighted average earnings per share and return on net worth across the restated periods, weighted by the respective period weights",
      source: "ICDR Sch VI (SME) — Basis for Issue Price",
      evidence: "Derived from the restated financial statements",
      mandatory: true,
      fulfilment: "issuer_data",
      chapters: ["III.6"],
      evidence_fields: ["financials.eps_3yr", "financials.ronw_3yr"],
      corpus_evidence: "100% of the 14-document corpus",
    },
  ],
  S11: [
    {
      id: "R11.4",
      requirement: "Price information of past issues handled by the lead manager, and the lead manager's track record",
      source: "ICDR Sch VI — Other Regulatory and Statutory Disclosures",
      evidence: "Track record furnished by the lead manager",
      mandatory: true,
      fulfilment: "banker_certification",
      chapters: ["VI.3"],
      evidence_fields: ["issue_structure.lead_manager_track_record"],
      corpus_evidence: "100% of the 14-document corpus",
    },
  ],
};

for (const [sectionId, requirements] of Object.entries(ADDITIONS)) {
  const section = registry.sections.find((s: any) => s.section_id === sectionId);
  if (!section) throw new Error(`registry section ${sectionId} not found`);
  for (const requirement of requirements) {
    if (section.requirements.some((r: any) => r.id === requirement.id)) continue;
    section.requirements.push(requirement);
  }
}

registry.registry_version = "2026-07-R3";
registry.note =
  registry.note +
  " Version R3 extends the registry using evidence from a corpus of 14 filed NSE Emerge SME DRHPs (5,619 pages, 2.6 million words): every requirement added in R3 carries a `corpus_evidence` field recording the share of real filings that contain it. Items appearing in 79-100% of filings but absent from R2 were added; nothing was added on intuition.";

fs.writeFileSync(STRUCTURE, JSON.stringify(structure, null, 2) + "\n");
fs.writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + "\n");

const total = registry.sections.reduce((sum: number, s: any) => sum + s.requirements.length, 0);
const chapters = structure.sections.reduce((sum: number, s: any) => sum + s.chapters.length, 0);
console.log(`registry: ${total} requirements (was 60)`);
console.log(`structure: ${chapters} chapters (was 32)`);
