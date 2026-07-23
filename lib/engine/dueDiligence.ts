/**
 * Merchant-banker due-diligence model.
 *
 * The banker workspace is a second view over the SAME draft and the SAME gap
 * report — not a parallel data set. This file derives, from the requirement
 * registry and the issuer data, the three things a merchant banker needs to
 * begin due diligence:
 *
 *   1. a documents-required-vs-provided checklist,
 *   2. the regulatory mapping of every chapter to the requirements it discharges
 *      and whether they are satisfied, and
 *   3. the risk-flag list (the high/medium findings), restated for the banker.
 *
 * Keeping this derivation in one pure module means the promoter view and the
 * banker view can never drift apart.
 */

import { allRequirements, chapterTitle, flatChapters, registry } from "../data";
import type { GapReport, IssuerData, Requirement } from "../types";
import { getPath, isPresent } from "./utils";

// ---------------------------------------------------------------------------
// Due-diligence document checklist
// ---------------------------------------------------------------------------

export type DocStatus = "provided" | "outstanding" | "banker-to-obtain";

export interface DDItem {
  id: string;
  document: string;
  requirementIds: string[];
  category: string;
  status: DocStatus;
  responsibility: "issuer" | "auditor" | "lead-manager" | "legal-counsel";
  note: string;
}

/**
 * The standard SME due-diligence document set, each item tied to the registry
 * requirement it evidences and to an issuer-data signal that indicates whether
 * the underlying information has been provided.
 */
const DD_TEMPLATE: Omit<DDItem, "status">[] = [
  {
    id: "DD-01",
    document: "Certificate of Incorporation, Memorandum and Articles of Association",
    requirementIds: ["R1.1", "R1.2", "R14.1"],
    category: "Constitutional",
    responsibility: "issuer",
    note: "Verified against MCA master data.",
  },
  {
    id: "DD-02",
    document: "Restated financial statements for three years with the auditor's examination report",
    requirementIds: ["R4.1", "R4.2", "R4.3"],
    category: "Financial",
    responsibility: "auditor",
    note: "Peer-reviewed auditor and firm registration number must be identified.",
  },
  {
    id: "DD-03",
    document: "Board and shareholder resolutions authorising the issue",
    requirementIds: ["R5.2", "R11.3"],
    category: "Corporate authorisation",
    responsibility: "issuer",
    note: "Special resolution under section 62(1)(c) of the Companies Act.",
  },
  {
    id: "DD-04",
    document: "Deployment plan and quotations supporting the objects of the issue",
    requirementIds: ["R5.3", "R5.4"],
    category: "Objects",
    responsibility: "issuer",
    note: "Objects must reconcile with the net proceeds.",
  },
  {
    id: "DD-05",
    document: "Statement of share capital build-up and shareholding pattern",
    requirementIds: ["R5.1"],
    category: "Capital structure",
    responsibility: "issuer",
    note: "Must reconcile with the register of members and the pre-issue paid-up capital.",
  },
  {
    id: "DD-06",
    document: "Minimum promoter contribution computation and lock-in undertakings",
    requirementIds: ["R12.2"],
    category: "Promoter",
    responsibility: "lead-manager",
    note: "Computed and certified by the lead manager; confirmed by the depository.",
  },
  {
    id: "DD-07",
    document: "Promoter and director declarations (no debarment, no wilful default)",
    requirementIds: ["R12.3"],
    category: "Promoter",
    responsibility: "lead-manager",
    note: "Obtained and verified during due diligence.",
  },
  {
    id: "DD-08",
    document: "Legal counsel certificate listing all outstanding litigation",
    requirementIds: ["R6.3", "R3.4"],
    category: "Legal",
    responsibility: "legal-counsel",
    note: "Must capture every proceeding referenced anywhere in the issuer's records.",
  },
  {
    id: "DD-09",
    document: "Related-party transaction schedule certified in the audited financials",
    requirementIds: ["R6.2"],
    category: "Legal",
    responsibility: "auditor",
    note: "Must reconcile with the related-party disclosures in the offer document.",
  },
  {
    id: "DD-10",
    document: "Statutory approvals, licences and consents register",
    requirementIds: ["R11.1"],
    category: "Regulatory",
    responsibility: "issuer",
    note: "With validity dates and renewals.",
  },
  {
    id: "DD-11",
    document: "Statement of special tax benefits certified by the statutory auditor",
    requirementIds: ["R13.2"],
    category: "Financial",
    responsibility: "auditor",
    note: "Discharged at the certification stage.",
  },
  {
    id: "DD-12",
    document: "Financial indebtedness statement with sanction letters and charge register",
    requirementIds: ["R10.3"],
    category: "Financial",
    responsibility: "issuer",
    note: "Lender-wise, with security and material terms.",
  },
  {
    id: "DD-13",
    document: "Issue, registrar, underwriting and market-making agreements",
    requirementIds: ["R1.3", "R8.5", "R14.2"],
    category: "Issue arrangements",
    responsibility: "lead-manager",
    note: "Executed copies for inspection.",
  },
  {
    id: "DD-14",
    document: "Executed declaration page and the lead manager's due diligence certificate",
    requirementIds: ["R15.1", "R7.2"],
    category: "Certification",
    responsibility: "lead-manager",
    note: "Executed at filing, after due diligence is complete.",
  },
];

/** Decide the status of each DD item from the issuer data actually supplied. */
export function buildDueDiligence(data: IssuerData): DDItem[] {
  return DD_TEMPLATE.map((template) => {
    const requirements = template.requirementIds
      .map((id) => allRequirements.find((requirement) => requirement.id === id))
      .filter((requirement): requirement is Requirement => Boolean(requirement));

    const issuerRequirements = requirements.filter((requirement) => requirement.fulfilment === "issuer_data");
    const bankerRequirements = requirements.filter((requirement) => requirement.fulfilment !== "issuer_data");

    let status: DocStatus;
    if (issuerRequirements.length === 0) {
      // Nothing here is the promoter's to provide at the drafting stage.
      status = "banker-to-obtain";
    } else {
      const allFieldsPresent = issuerRequirements.every((requirement) =>
        (requirement.evidence_fields ?? []).every((field) => isPresent(getPath(data, field))),
      );
      const someFieldsPresent = issuerRequirements.some((requirement) =>
        (requirement.evidence_fields ?? []).some((field) => isPresent(getPath(data, field))),
      );
      if (allFieldsPresent) status = "provided";
      else if (someFieldsPresent) status = "outstanding";
      else status = bankerRequirements.length ? "banker-to-obtain" : "outstanding";
    }

    return { ...template, status };
  });
}

// ---------------------------------------------------------------------------
// Regulatory mapping — chapter -> requirements -> satisfied?
// ---------------------------------------------------------------------------

export interface RegulatoryMapEntry {
  chapterId: string;
  chapterTitle: string;
  sectionTitle: string;
  requirements: {
    id: string;
    requirement: string;
    status: string;
    source: string;
    fulfilment: string;
  }[];
  satisfied: number;
  total: number;
}

/** Build the chapter-by-chapter regulatory map, reading statuses from the report. */
export function buildRegulatoryMap(report: GapReport): RegulatoryMapEntry[] {
  const statusById = new Map(report.items.map((item) => [item.id, item]));

  return flatChapters
    .map((chapter) => {
      const requirements = allRequirements.filter((requirement) =>
        requirement.chapters.includes(chapter.id),
      );
      const mapped = requirements.map((requirement) => {
        const item = statusById.get(requirement.id);
        return {
          id: requirement.id,
          requirement: requirement.requirement,
          status: item?.status ?? "Missing",
          source: requirement.source,
          fulfilment: requirement.fulfilment,
        };
      });
      const satisfied = mapped.filter(
        (requirement) => requirement.status === "Complete",
      ).length;
      return {
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        sectionTitle: chapter.sectionTitle,
        requirements: mapped,
        satisfied,
        total: mapped.length,
      };
    })
    .filter((entry) => entry.total > 0);
}

// ---------------------------------------------------------------------------
// Summary counts for the workspace header
// ---------------------------------------------------------------------------

export function dueDiligenceSummary(items: DDItem[]) {
  return {
    total: items.length,
    provided: items.filter((item) => item.status === "provided").length,
    outstanding: items.filter((item) => item.status === "outstanding").length,
    bankerToObtain: items.filter((item) => item.status === "banker-to-obtain").length,
  };
}

export const registryMeta = {
  version: registry.registry_version,
  regulationSet: registry.regulation_set,
  chapterTitle,
};
