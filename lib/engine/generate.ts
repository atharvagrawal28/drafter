/**
 * DRHP generation engine.
 *
 * Driven entirely by `data/drhp_structure.json`: the engine walks the real SME
 * DRHP tree (Sections I–IX, 34 chapters) and fills each chapter according to its
 * declared `mode`.
 *
 *   factual     — built in code from issuer data only. Real tables. If a number
 *                 is not in the issuer data it does not appear, full stop.
 *   narrative   — drafted by the language model under a constrained prompt, or
 *                 by a deterministic template when no key is present. Either way
 *                 the facts come from the issuer data.
 *   boilerplate — standard offer-document clauses from the knowledge base with
 *                 issuer fields merged in, always marked for banker finalisation.
 *
 * The engine is pure and has no dependency on the AI SDK: language-model
 * drafting is injected as a callback, so the whole document can be generated in
 * a plain Node script for verification.
 */

import {
  chapterRequirementMap,
  flatChapters,
  sectionTemplates,
  structure,
} from "../data";
import type {
  Block,
  Chapter,
  ChapterStatus,
  CoverPage,
  DrhpDocument,
  IssuerData,
  Provenance,
  ProvenanceOrigin,
  StructureChapter,
  TableBlock,
} from "../types";
import { normaliseIssuerProse } from "./register";
import {
  countWords,
  ensurePeriod,
  formatCrore,
  formatIndianNumber,
  getPath,
  isExplicitNil,
  isPresent,
  round,
  splitEntries,
  sumBy,
  truncate,
} from "./utils";

// ---------------------------------------------------------------------------
// Derived values
// ---------------------------------------------------------------------------

/**
 * Values computed arithmetically from issuer data.
 *
 * Everything here is `derived` provenance: it is not invented, it is calculated
 * from numbers the issuer supplied. Anything that cannot be calculated stays
 * undefined and the template that referenced it degrades to a placeholder
 * rather than printing a wrong figure.
 */
export interface Computed {
  [key: string]: any;
}

export function buildComputed(data: IssuerData): Computed {
  const fin = data.financials ?? {};
  const issue = data.issue ?? {};
  const legal = data.legal ?? {};
  const management = data.management ?? {};

  const years: string[] = Array.isArray(fin.years) ? fin.years : [];
  const revenue: number[] = Array.isArray(fin.revenue_3yr) ? fin.revenue_3yr : [];
  const ebitda: number[] = Array.isArray(fin.ebitda_3yr) ? fin.ebitda_3yr : [];
  const pat: number[] = Array.isArray(fin.pat_3yr) ? fin.pat_3yr : [];
  const networth: number[] = Array.isArray(fin.networth_3yr) ? fin.networth_3yr : [];
  const cashFlow: number[] = Array.isArray(fin.cash_flow_ops_3yr) ? fin.cash_flow_ops_3yr : [];

  const last = <T,>(arr: T[]): T | undefined => (arr.length ? arr[arr.length - 1] : undefined);
  const first = <T,>(arr: T[]): T | undefined => (arr.length ? arr[0] : undefined);

  // Compound annual growth over the supplied series.
  let revenueCagr: string | undefined;
  const r0 = first(revenue);
  const rN = last(revenue);
  if (typeof r0 === "number" && typeof rN === "number" && r0 > 0 && revenue.length > 1) {
    const periods = revenue.length - 1;
    revenueCagr = `${(((rN / r0) ** (1 / periods) - 1) * 100).toFixed(2)}%`;
  }

  const preIssueShares = Number(issue.pre_issue_capital);
  const freshShares = Number(issue.fresh_issue_shares);
  const postIssueShares =
    Number.isFinite(preIssueShares) && Number.isFinite(freshShares)
      ? preIssueShares + freshShares
      : undefined;

  const marketMakerShares = Number(issue.market_maker_reservation_shares);
  const netIssueShares =
    Number.isFinite(freshShares) && Number.isFinite(marketMakerShares)
      ? freshShares - marketMakerShares
      : freshShares;

  // Implied price/earnings at each end of the band — a derived figure the
  // Basis for Issue Price chapter is required to disclose.
  const eps = Number(fin.eps);
  const priceFloor = Number(issue.price_floor);
  const priceCap = Number(issue.price_cap);
  const peFloor = Number.isFinite(eps) && eps > 0 && Number.isFinite(priceFloor) ? priceFloor / eps : undefined;
  const peCap = Number.isFinite(eps) && eps > 0 && Number.isFinite(priceCap) ? priceCap / eps : undefined;

  const litigationText = legal.litigation;
  const hasLitigation = isPresent(litigationText) && !isExplicitNil(litigationText);

  const relatedPartyText = management.related_parties;
  const hasRelatedParty = isPresent(relatedPartyText) && !isExplicitNil(relatedPartyText);

  const objectsTotal = Array.isArray(issue.objects_breakup)
    ? round(sumBy(issue.objects_breakup, "amount"))
    : undefined;

  return {
    financialYearsList: years.join(", "),
    years,
    firstYear: first(years),
    latestYear: last(years),
    revenueFirst: first(revenue),
    revenueLatest: last(revenue),
    ebitdaFirst: first(ebitda),
    ebitdaLatest: last(ebitda),
    patFirst: first(pat),
    patLatest: last(pat),
    networthFirst: first(networth),
    networthLatest: last(networth),
    cashFlowLatest: last(cashFlow),
    revenueCagr,
    preIssueShares,
    postIssueShares,
    postIssueSharesFmt: postIssueShares !== undefined ? formatIndianNumber(postIssueShares) : undefined,
    freshIssueSharesFmt: Number.isFinite(freshShares) ? formatIndianNumber(freshShares) : undefined,
    marketMakerShares: Number.isFinite(marketMakerShares) ? marketMakerShares : undefined,
    // Formatted variants exist so that boilerplate clauses can interpolate a
    // share count into prose without emitting "126000" mid-sentence.
    marketMakerSharesFmt: Number.isFinite(marketMakerShares)
      ? formatIndianNumber(marketMakerShares)
      : undefined,
    netIssueShares: Number.isFinite(netIssueShares) ? netIssueShares : undefined,
    netIssueSharesFmt: Number.isFinite(netIssueShares)
      ? formatIndianNumber(netIssueShares)
      : undefined,
    peFloor: peFloor !== undefined ? peFloor.toFixed(2) : undefined,
    peCap: peCap !== undefined ? peCap.toFixed(2) : undefined,
    objectsTotal,
    hasLitigation,
    hasRelatedParty,
    promoterPostIssuePct: undefined as number | undefined,
  };
}

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

interface Ctx {
  data: IssuerData;
  computed: Computed;
}

function lookup(ctx: Ctx, path: string): any {
  if (path.startsWith("computed.")) return getPath(ctx.computed, path.slice("computed.".length));
  return getPath(ctx.data, path);
}

function renderValue(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    return Number.isInteger(value) ? formatIndianNumber(value) : value.toFixed(2);
  }
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

/**
 * Render an issuer's free-text answer for inclusion in the document.
 *
 * Factual chapters reproduce what the issuer actually said rather than an LLM's
 * paraphrase of it, so this is the only place their prose is treated: person
 * and register are normalised ("we do" -> "the Company does"), and nothing else
 * is touched. See `register.ts` — the transform fails closed if any figure
 * would move.
 */
function issuerProse(value: any): string {
  const rendered = renderValue(value);
  return typeof value === "string" ? normaliseIssuerProse(rendered) : rendered;
}

/**
 * Substitute {dotted.path} references. Any path that resolves to nothing leaves
 * a visible marker rather than an empty gap, so an unfilled field is obvious in
 * the draft instead of silently disappearing mid-sentence.
 */
function interpolate(text: string, ctx: Ctx): { text: string; missing: string[] } {
  const missing: string[] = [];
  const out = text.replace(/\{([\w.]+)\}/g, (_match, path: string) => {
    const value = lookup(ctx, path);
    if (!isPresent(value)) {
      missing.push(path);
      return `[· to be supplied: ${humanise(path)} ·]`;
    }
    return issuerProse(value);
  });
  return { text: out, missing };
}

function humanise(path: string): string {
  const parts = path.split(".");
  return parts[parts.length - 1].replace(/_/g, " ");
}

/** Evaluate a `when` guard such as "computed.hasLitigation" or "!legal.litigation". */
function evalWhen(condition: string | undefined, ctx: Ctx): boolean {
  if (!condition) return true;
  const negated = condition.startsWith("!");
  const path = negated ? condition.slice(1) : condition;
  const value = lookup(ctx, path);
  const truthy = value === true || (value !== false && isPresent(value));
  return negated ? !truthy : truthy;
}

// ---------------------------------------------------------------------------
// Knowledge-base clause rendering
// ---------------------------------------------------------------------------

type ClauseSpec = Record<string, any>;

function renderClauses(
  clauses: ClauseSpec[],
  ctx: Ctx,
  origin: ProvenanceOrigin,
  requirementIds: string[],
): Block[] {
  const blocks: Block[] = [];

  // Risk factors are numbered at RENDER time, after the `when` filter, not
  // written into the template text. Hard-coded numbers were producing
  // "1, 2, 3, 5, 9, 10 …" for any issuer without litigation, related-party
  // dealings or borrowings, because the conditional factors took their numbers
  // with them. A filed offer document with gaps in its risk-factor numbering
  // looks defective, and the promoter has no way to know why.
  let riskFactorNumber = 0;

  for (const clause of clauses ?? []) {
    if (!evalWhen(clause.when, ctx)) continue;

    const provenance = (fields: string[] = []): Provenance => ({
      origin,
      fields,
      requirementIds,
      note:
        origin === "standard-clause"
          ? "Standard offer-document text. To be reviewed and finalised by the merchant banker."
          : undefined,
    });

    if (clause.h) {
      const { text, missing } = interpolate(clause.h, ctx);
      blocks.push({ kind: "heading", level: 2, text, provenance: provenance(missing) });
    } else if (clause.p) {
      const { text, missing } = interpolate(clause.p, ctx);
      blocks.push({
        kind: "para",
        text,
        provenance: {
          ...provenance(referencedPaths(clause.p)),
          note: missing.length
            ? `Awaiting: ${missing.map(humanise).join(", ")}.`
            : provenance().note,
        },
      });
    } else if (clause.rf) {
      riskFactorNumber += 1;
      const { text, missing } = interpolate(clause.rf, ctx);
      blocks.push({
        kind: "para",
        text: `${riskFactorNumber}. ${text}`,
        provenance: {
          ...provenance(referencedPaths(clause.rf)),
          note: missing.length
            ? `Awaiting: ${missing.map(humanise).join(", ")}.`
            : provenance().note,
        },
      });
    } else if (clause.list) {
      const items = (clause.list as string[]).map((item) => interpolate(item, ctx).text);
      blocks.push({ kind: "list", items, provenance: provenance() });
    } else if (clause.deftable) {
      const rows = (clause.deftable as string[][]).map(([term, meaning]) => [
        interpolate(term, ctx).text,
        interpolate(meaning, ctx).text,
      ]);
      blocks.push({
        kind: "table",
        columns: [
          { header: "Term", width: 30 },
          { header: "Description", width: 70 },
        ],
        rows,
        provenance: provenance(),
      });
    } else if (clause.placeholder) {
      blocks.push({
        kind: "placeholder",
        text: interpolate(clause.placeholder, ctx).text,
        requiredInputs: (clause.requiredInputs as string[]) ?? [],
        provenance: { origin: "placeholder", requirementIds },
      });
    } else if (clause.note) {
      blocks.push({
        kind: "callout",
        tone: "attention",
        title: "For the merchant banker",
        text: interpolate(clause.note, ctx).text,
        provenance: { origin: "standard-clause", requirementIds },
      });
    }
  }

  return blocks;
}

/** Collect the issuer-data paths a template string depends on, for provenance. */
function referencedPaths(template: string): string[] {
  const paths: string[] = [];
  const pattern = /\{([\w.]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(template)) !== null) paths.push(match[1]);
  return paths;
}

// ---------------------------------------------------------------------------
// Small block builders
// ---------------------------------------------------------------------------

function heading(text: string, requirementIds: string[], level: 2 | 3 = 2): Block {
  return {
    kind: "heading",
    level,
    text,
    provenance: { origin: "derived", requirementIds },
  };
}

function para(
  text: string,
  fields: string[],
  requirementIds: string[],
  origin: ProvenanceOrigin = "issuer-input",
): Block {
  return { kind: "para", text, provenance: { origin, fields, requirementIds } };
}

function table(spec: Omit<TableBlock, "kind">): Block {
  return { kind: "table", ...spec };
}

function placeholder(text: string, requiredInputs: string[], requirementIds: string[]): Block {
  return {
    kind: "placeholder",
    text,
    requiredInputs,
    provenance: { origin: "placeholder", requirementIds },
  };
}

/**
 * Emit a paragraph from an issuer field, or a placeholder if it is absent.
 * This is the workhorse that keeps factual chapters honest: no field, no prose.
 */
function fieldPara(
  ctx: Ctx,
  path: string,
  requirementIds: string[],
  missingLabel: string,
  requiredInputs: string[],
): Block {
  const value = lookup(ctx, path);
  if (isPresent(value)) {
    return para(ensurePeriod(issuerProse(value)), [path], requirementIds);
  }
  return placeholder(missingLabel, requiredInputs, requirementIds);
}

/** Render a semi-structured free-text answer as a list, or a placeholder. */
function fieldList(
  ctx: Ctx,
  path: string,
  requirementIds: string[],
  missingLabel: string,
  requiredInputs: string[],
): Block {
  const value = lookup(ctx, path);
  const entries = splitEntries(typeof value === "string" ? value : "");
  if (entries.length > 1) {
    return {
      kind: "list",
      items: entries.map((entry) => ensurePeriod(normaliseIssuerProse(entry))),
      provenance: { origin: "issuer-input", fields: [path], requirementIds },
    };
  }
  return fieldPara(ctx, path, requirementIds, missingLabel, requiredInputs);
}

// ---------------------------------------------------------------------------
// Factual chapter builders
// ---------------------------------------------------------------------------

type Builder = (ctx: Ctx, reqs: string[]) => Block[];

const factualBuilders: Record<string, Builder> = {
  // ---------------------------------------------------------------- I.4
  // Summary of the Offer Document. Added in registry R3: it is required by
  // Schedule VI and is the first chapter an exchange reviewer reads.
  // Every row here is a projection of a detailed chapter — nothing new is
  // asserted, which is exactly what a summary should be.
  "I.4": (ctx, reqs) => {
    const { data, computed } = ctx;
    const blocks: Block[] = [];

    blocks.push(
      para(
        `This summary is intended to convey the essential particulars of the Company and the Issue. ` +
          `It does not contain all the information that should be considered before investing, and must ` +
          `be read together with the whole of this Draft Red Herring Prospectus, in particular ` +
          `“Risk Factors”, “Our Business” and the Restated Financial Statements.`,
        [],
        reqs,
        "standard-clause",
      ),
    );

    const rows: string[][] = [];
    const add = (label: string, value: any) => {
      if (isPresent(value)) rows.push([label, renderValue(value)]);
    };

    add("Name of the issuer", data.identity?.company_name);
    add("Primary business", truncate(issuerProse(data.business?.business_description ?? ""), 260));
    add("Industry", data.business?.industry);
    add("Promoters", data.promoters?.promoter_names);
    if (isPresent(data.issue?.issue_size)) {
      add("Size of the Issue", `INR ${formatCrore(data.issue.issue_size)} crore`);
    }
    if (computed.freshIssueSharesFmt) add("Equity shares offered", `${computed.freshIssueSharesFmt} equity shares`);
    add("Price band", data.issue?.price_band);
    if (isPresent(data.promoters?.promoter_shareholding_pct)) {
      add("Pre-Issue promoter shareholding", `${renderValue(data.promoters.promoter_shareholding_pct)}%`);
    }
    if (isPresent(data.financials?.revenue_latest_year)) {
      add(
        `Revenue from operations (${computed.latestYear ?? "latest year"})`,
        `INR ${formatCrore(data.financials.revenue_latest_year)} crore`,
      );
    }
    if (isPresent(data.financials?.pat_latest_year)) {
      add(
        `Profit after tax (${computed.latestYear ?? "latest year"})`,
        `INR ${formatCrore(data.financials.pat_latest_year)} crore`,
      );
    }
    add("Listing platform", data.issue_structure?.listing_platform);

    if (rows.length) {
      blocks.push(
        table({
          caption: "Summary of the offer document",
          columns: [
            { header: "Particulars", width: 38 },
            { header: "Details", width: 62 },
          ],
          rows,
          provenance: {
            origin: "derived",
            fields: ["identity.company_name", "business.business_description", "issue.issue_size", "financials.revenue_latest_year"],
            requirementIds: reqs,
            note: "Summarised from the detailed chapters. No fact appears here that is not stated elsewhere in the document.",
          },
        }),
      );
    }

    // Objects summary
    const objects = data.issue?.objects_breakup;
    if (Array.isArray(objects) && objects.length) {
      blocks.push(heading("Objects of the Issue in summary", reqs));
      blocks.push({
        kind: "list",
        items: objects.map(
          (object: any) => `${renderValue(object.purpose)} — INR ${formatCrore(object.amount)} crore`,
        ),
        provenance: { origin: "issuer-input", fields: ["issue.objects_breakup"], requirementIds: reqs },
      });
    }

    blocks.push(heading("Summary of outstanding litigation", reqs));
    const litigation = data.legal?.litigation;
    blocks.push(
      isPresent(litigation)
        ? para(
            isExplicitNil(litigation)
              ? `The Company has disclosed that there are no outstanding proceedings. Investors should read this together with the chapter “Outstanding Litigation and Material Developments”.`
              : `${truncate(issuerProse(litigation), 420)} Full particulars appear in the chapter “Outstanding Litigation and Material Developments”.`,
            ["legal.litigation"],
            reqs,
          )
        : placeholder(
            "Summary of outstanding litigation involving the Company, its Directors and its Promoters.",
            ["Aggregate number and amount of proceedings, by category and by party"],
            reqs,
          ),
    );

    blocks.push(heading("Summary of related-party transactions", reqs));
    blocks.push(
      fieldPara(
        ctx,
        "management.related_parties",
        reqs,
        "Summary of related-party transactions for each reported period.",
        ["Aggregate value of related-party transactions for each restated financial year"],
      ),
    );

    blocks.push(heading("Contingent liabilities", reqs));
    blocks.push(
      fieldPara(ctx, "financials.contingent_liabilities", reqs, "Summary of contingent liabilities as at the last balance sheet date.", [
        "Contingent liabilities as disclosed in the notes to the restated financial statements",
      ]),
    );

    return blocks;
  },

  // ---------------------------------------------------------------- IV.9
  // Our Subsidiaries. Added in registry R3 (86% of the corpus). A subsidiary
  // is consolidated; a group company is not — conflating them is a real
  // disclosure error, so this is a chapter of its own.
  "IV.9": (ctx, reqs) => {
    const { data } = ctx;
    const blocks: Block[] = [];
    const subsidiaries = data.management?.subsidiaries;

    if (isPresent(subsidiaries) && isExplicitNil(subsidiaries)) {
      blocks.push(
        para(
          `As at the date of this Draft Red Herring Prospectus, the Company does not have any ` +
            `subsidiary. Particulars of the entities forming part of the promoter group and the group ` +
            `companies appear in the chapter “Our Group Companies”.`,
          ["management.subsidiaries"],
          reqs,
        ),
      );
      return blocks;
    }

    blocks.push(
      fieldList(ctx, "management.subsidiaries", reqs, "Particulars of the subsidiaries of the Company.", [
        "Name, date of incorporation and registered office of each subsidiary",
        "The Company's shareholding and voting interest in each subsidiary",
        "Nature of business carried on by each subsidiary",
        "Summary financial information of each subsidiary for the last three financial years",
        "An express statement if the Company has no subsidiary",
      ]),
    );

    blocks.push({
      kind: "callout",
      tone: "attention",
      title: "For the merchant banker",
      text:
        "A subsidiary is consolidated into the restated financial statements; a group company is not. " +
        "Confirm the classification of every connected entity against the shareholding records, and " +
        "ensure entities disclosed here are not also presented as group companies.",
      provenance: { origin: "standard-clause", requirementIds: reqs },
    });

    return blocks;
  },

  // ---------------------------------------------------------------- III.1
  "III.1": (ctx, reqs) => {
    const { data, computed } = ctx;
    const issue = data.issue ?? {};
    const blocks: Block[] = [];

    const rows: string[][] = [];
    if (isPresent(issue.fresh_issue_shares)) {
      rows.push([
        "Issue of equity shares by the Company (fresh issue)",
        `${formatIndianNumber(issue.fresh_issue_shares)} equity shares of face value INR ${renderValue(
          issue.face_value,
        )} each, aggregating to INR ${formatCrore(issue.issue_size)} crore`,
      ]);
    }
    if (computed.marketMakerShares !== undefined) {
      rows.push([
        "Of which: Market Maker reservation portion",
        `${formatIndianNumber(computed.marketMakerShares)} equity shares`,
      ]);
      rows.push([
        "Net Issue to the public",
        `${formatIndianNumber(computed.netIssueShares)} equity shares`,
      ]);
    }
    if (isPresent(issue.pre_issue_capital)) {
      rows.push([
        "Equity shares outstanding prior to the Issue",
        `${formatIndianNumber(issue.pre_issue_capital)} equity shares`,
      ]);
    }
    if (computed.postIssueShares !== undefined) {
      rows.push([
        "Equity shares outstanding after the Issue",
        `${formatIndianNumber(computed.postIssueShares)} equity shares`,
      ]);
    }
    if (isPresent(issue.net_proceeds)) {
      rows.push([
        "Use of Net Proceeds",
        `See the chapter “Objects of the Issue”. Net Proceeds of INR ${formatCrore(
          issue.net_proceeds,
        )} crore`,
      ]);
    }

    if (rows.length) {
      blocks.push(
        table({
          caption: "The Issue",
          columns: [
            { header: "Particulars", width: 42 },
            { header: "Details", width: 58 },
          ],
          rows,
          provenance: {
            origin: "issuer-input",
            fields: [
              "issue.fresh_issue_shares",
              "issue.face_value",
              "issue.issue_size",
              "issue.market_maker_reservation_shares",
              "issue.pre_issue_capital",
            ],
            requirementIds: reqs,
          },
        }),
      );
    } else {
      blocks.push(
        placeholder(
          "Particulars of the Issue.",
          [
            "Number of equity shares offered in the fresh issue",
            "Face value per equity share",
            "Total issue size",
            "Market maker reservation portion",
          ],
          reqs,
        ),
      );
    }

    blocks.push(
      para(
        `The Issue is a ${renderValue(issue.issue_type) || "fresh issue"} and is being made in ` +
          `accordance with Chapter IX of the ICDR Regulations, which governs the issue of ` +
          `specified securities by small and medium enterprises. The equity shares are proposed ` +
          `to be listed on ${renderValue(data.issue_structure?.listing_platform) || "the SME Platform"}. ` +
          `The Issue has been authorised by the Board of Directors and by a special resolution of ` +
          `the shareholders of the Company.`,
        ["issue.issue_type", "issue_structure.listing_platform"],
        reqs,
        "derived",
      ),
    );

    return blocks;
  },

  // ---------------------------------------------------------------- III.2
  "III.2": (ctx, reqs) => {
    const { data, computed } = ctx;
    const fin = data.financials ?? {};
    const years: string[] = fin.years ?? [];
    const blocks: Block[] = [];

    blocks.push(
      para(
        `The summary financial information set out below has been extracted from the Restated ` +
          `Financial Statements of the Company for the financial years ${years.join(", ")}. ` +
          `It should be read together with the chapter “Restated Financial Statements” ` +
          `and the chapter “Management's Discussion and Analysis of Financial Condition and ` +
          `Results of Operations”.`,
        ["financials.years"],
        reqs,
        "derived",
      ),
    );

    const seriesRows = buildSeriesRows(fin, [
      ["Revenue from operations", "revenue_3yr"],
      ["EBITDA", "ebitda_3yr"],
      ["Profit after tax", "pat_3yr"],
      ["Net worth", "networth_3yr"],
    ]);

    if (years.length && seriesRows.length) {
      blocks.push(
        table({
          caption: "Summary of financial information (INR in crore)",
          columns: [
            { header: "Particulars", width: 40 },
            ...years.map((year) => ({ header: year, numeric: true, width: 20 })),
          ],
          rows: seriesRows,
          provenance: {
            origin: "issuer-input",
            fields: ["financials.revenue_3yr", "financials.ebitda_3yr", "financials.pat_3yr", "financials.networth_3yr"],
            requirementIds: reqs,
          },
        }),
      );
    } else {
      blocks.push(
        placeholder(
          "Summary of the restated financial information for the last three financial years.",
          [
            "Revenue from operations for each of the last three financial years",
            "Profit after tax for each of the last three financial years",
            "Net worth as at the end of each of the last three financial years",
          ],
          reqs,
        ),
      );
    }

    const ratioRows = buildRatioRows(fin, computed);
    if (ratioRows.length) {
      blocks.push(
        table({
          caption: "Key accounting ratios",
          columns: [
            { header: "Ratio", width: 55 },
            { header: computed.latestYear ?? "Latest year", numeric: true, width: 45 },
          ],
          rows: ratioRows,
          provenance: {
            origin: "issuer-input",
            fields: ["financials.eps", "financials.ronw_pct", "financials.nav_per_share"],
            requirementIds: reqs,
          },
        }),
      );
    }

    return blocks;
  },

  // ---------------------------------------------------------------- III.3
  "III.3": (ctx, reqs) => {
    const { data } = ctx;
    const identity = data.identity ?? {};
    const structureData = data.issue_structure ?? {};
    const blocks: Block[] = [];

    blocks.push(heading("The Company", reqs));
    const companyRows: string[][] = [];
    const pushIf = (rows: string[][], label: string, value: any) => {
      if (isPresent(value)) rows.push([label, renderValue(value)]);
    };
    pushIf(companyRows, "Name of the Company", identity.company_name);
    pushIf(companyRows, "Corporate Identification Number", identity.cin);
    pushIf(companyRows, "Date of incorporation", identity.incorporation_date);
    pushIf(companyRows, "Place of incorporation", identity.incorporation_place);
    pushIf(companyRows, "Registered office", identity.registered_office);
    pushIf(companyRows, "Corporate office", identity.corporate_office);
    pushIf(companyRows, "Telephone", identity.phone);
    pushIf(companyRows, "Email", identity.email);
    pushIf(companyRows, "Website", identity.website);
    pushIf(companyRows, "Company Secretary and Compliance Officer", identity.company_secretary);

    if (companyRows.length) {
      blocks.push(
        table({
          columns: [
            { header: "Particulars", width: 38 },
            { header: "Details", width: 62 },
          ],
          rows: companyRows,
          provenance: {
            origin: "issuer-input",
            fields: Object.keys(identity).map((key) => `identity.${key}`),
            requirementIds: reqs,
          },
        }),
      );
    }

    blocks.push(heading("Intermediaries to the Issue", reqs));
    const partyRows: string[][] = [];
    pushIf(partyRows, "Lead Manager", structureData.lead_manager);
    pushIf(partyRows, "Registrar to the Issue", structureData.registrar);
    pushIf(partyRows, "Underwriter", structureData.underwriter);
    pushIf(partyRows, "Banker to the Issue", structureData.banker);
    pushIf(partyRows, "Market Maker", data.issue?.market_maker);
    pushIf(partyRows, "Legal advisor to the Issue", structureData.legal_advisor);
    pushIf(partyRows, "Statutory auditor", data.financials?.auditor);
    pushIf(partyRows, "Listing platform", structureData.listing_platform);

    if (partyRows.length) {
      blocks.push(
        table({
          columns: [
            { header: "Capacity", width: 38 },
            { header: "Name", width: 62 },
          ],
          rows: partyRows,
          provenance: {
            origin: "issuer-input",
            fields: [
              "issue_structure.lead_manager",
              "issue_structure.registrar",
              "issue_structure.underwriter",
              "issue_structure.banker",
              "issue.market_maker",
            ],
            requirementIds: reqs,
          },
        }),
      );
    }

    const missingParties = [
      ["Legal advisor to the Issue", structureData.legal_advisor],
      ["Statutory auditor", data.financials?.auditor],
    ].filter(([, value]) => !isPresent(value));

    if (missingParties.length) {
      blocks.push(
        placeholder(
          "Particulars of the remaining intermediaries and advisors to the Issue.",
          missingParties.map(([label]) => `${label} — name, address, contact and SEBI registration number`),
          reqs,
        ),
      );
    }

    blocks.push(
      {
        kind: "callout",
        tone: "attention",
        title: "For the merchant banker",
        text:
          "The registered address, telephone, email, website, contact person and SEBI registration " +
          "number of every intermediary named above must be inserted, together with the details of " +
          "the self-certified syndicate banks and the sponsor bank, before this chapter is finalised.",
        provenance: { origin: "standard-clause", requirementIds: reqs },
      },
    );

    return blocks;
  },

  // ---------------------------------------------------------------- III.4
  "III.4": (ctx, reqs) => {
    const { data, computed } = ctx;
    const cap = data.capital_structure ?? {};
    const issue = data.issue ?? {};
    const blocks: Block[] = [];

    // (a) Share capital summary
    const capRows: string[][] = [];
    if (isPresent(cap.authorised_capital)) capRows.push(["Authorised share capital", renderValue(cap.authorised_capital)]);
    if (isPresent(cap.paid_up_capital)) {
      capRows.push(["Issued, subscribed and paid-up share capital before the Issue", renderValue(cap.paid_up_capital)]);
    }
    if (isPresent(issue.fresh_issue_shares)) {
      capRows.push([
        "Present Issue in terms of this Draft Red Herring Prospectus",
        `${formatIndianNumber(issue.fresh_issue_shares)} equity shares of face value INR ${renderValue(
          issue.face_value,
        )} each`,
      ]);
    }
    if (computed.postIssueShares !== undefined) {
      capRows.push([
        "Issued, subscribed and paid-up share capital after the Issue",
        `${formatIndianNumber(computed.postIssueShares)} equity shares of face value INR ${renderValue(
          issue.face_value,
        )} each`,
      ]);
    }

    blocks.push(heading("Share capital", reqs));
    if (capRows.length) {
      blocks.push(
        table({
          columns: [
            { header: "Particulars", width: 55 },
            { header: "Aggregate value", width: 45 },
          ],
          rows: capRows,
          provenance: {
            origin: "issuer-input",
            fields: ["capital_structure.authorised_capital", "capital_structure.paid_up_capital", "issue.fresh_issue_shares"],
            requirementIds: reqs,
          },
        }),
      );
    } else {
      blocks.push(
        placeholder(
          "Share capital of the Company before and after the Issue.",
          ["Authorised share capital", "Issued, subscribed and paid-up share capital", "Number of shares offered in the Issue"],
          reqs,
        ),
      );
    }

    // (b) Share capital build-up
    blocks.push(heading("History of the equity share capital of the Company", reqs));
    const history = cap.share_capital_history;
    if (Array.isArray(history) && history.length) {
      const rows = history.map((entry: any) => [
        renderValue(entry.date),
        formatIndianNumber(entry.no_of_shares),
        renderValue(entry.face_value),
        Number(entry.issue_price) > 0 ? renderValue(entry.issue_price) : "Nil (bonus)",
        renderValue(entry.nature),
      ]);
      const totalShares = sumBy(history, "no_of_shares");
      rows.push(["Total", formatIndianNumber(totalShares), "", "", ""]);

      blocks.push(
        table({
          caption: "Equity share capital build-up",
          columns: [
            { header: "Date of allotment", width: 18 },
            { header: "No. of equity shares", numeric: true, width: 18 },
            { header: "Face value (INR)", numeric: true, width: 13 },
            { header: "Issue price (INR)", numeric: true, width: 15 },
            { header: "Nature of allotment", width: 36 },
          ],
          rows,
          totalRowIndices: [rows.length - 1],
          notes: [
            `The aggregate of the allotments set out above is ${formatIndianNumber(totalShares)} equity shares, ` +
              `which reconciles with the pre-Issue paid-up equity share capital of the Company.`,
          ],
          provenance: {
            origin: "issuer-input",
            fields: ["capital_structure.share_capital_history"],
            requirementIds: reqs,
          },
        }),
      );
    } else {
      blocks.push(
        placeholder(
          "History of the equity share capital build-up of the Company.",
          [
            "Date of each allotment since incorporation",
            "Number of equity shares allotted, face value and issue price",
            "Nature and consideration for each allotment",
          ],
          reqs,
        ),
      );
    }

    // (c) Shareholding pattern
    blocks.push(heading("Shareholding pattern of the Company", reqs));
    const pattern = cap.shareholding_pattern;
    if (Array.isArray(pattern) && pattern.length) {
      const totalPre = sumBy(pattern, "shares");
      const totalPost = computed.postIssueShares ?? totalPre;

      const rows = pattern.map((holder: any) => {
        const shares = Number(holder.shares) || 0;
        return [
          renderValue(holder.name),
          renderValue(holder.category),
          formatIndianNumber(shares),
          totalPre ? `${((shares / totalPre) * 100).toFixed(2)}%` : "—",
          totalPost ? `${((shares / totalPost) * 100).toFixed(2)}%` : "—",
        ];
      });

      if (Number.isFinite(Number(issue.fresh_issue_shares)) && Number(issue.fresh_issue_shares) > 0) {
        rows.push([
          "Investors in the Issue",
          "Public",
          formatIndianNumber(issue.fresh_issue_shares),
          "—",
          totalPost ? `${((Number(issue.fresh_issue_shares) / totalPost) * 100).toFixed(2)}%` : "—",
        ]);
      }

      rows.push([
        "Total",
        "",
        formatIndianNumber(totalPost),
        totalPre ? "100.00%" : "—",
        "100.00%",
      ]);

      blocks.push(
        table({
          caption: "Shareholding pattern before and after the Issue",
          columns: [
            { header: "Name of the shareholder", width: 30 },
            { header: "Category", width: 16 },
            { header: "No. of equity shares", numeric: true, width: 18 },
            { header: "Pre-Issue %", numeric: true, width: 18 },
            { header: "Post-Issue %", numeric: true, width: 18 },
          ],
          rows,
          totalRowIndices: [rows.length - 1],
          notes: [
            "Post-Issue percentages are computed on the enlarged share capital assuming full subscription to the Issue.",
          ],
          provenance: {
            origin: "derived",
            fields: ["capital_structure.shareholding_pattern", "issue.fresh_issue_shares"],
            requirementIds: reqs,
            note: "Percentages computed from the shareholdings and the Issue size supplied by the issuer.",
          },
        }),
      );
    } else {
      blocks.push(
        placeholder(
          "Shareholding pattern of the Company before and after the Issue.",
          [
            "Name, category and holding of every shareholder before the Issue",
            "Promoter and promoter-group holdings identified separately",
          ],
          reqs,
        ),
      );
    }

    blocks.push(
      {
        kind: "callout",
        tone: "attention",
        title: "For the merchant banker",
        text:
          "Minimum promoter contribution and the lock-in applicable to the pre-Issue capital under " +
          "the ICDR Regulations must be computed, disclosed in this chapter and confirmed by the " +
          "depository before filing. Drafter does not compute lock-in because it depends on the " +
          "date and consideration of each allotment as verified in due diligence.",
        provenance: { origin: "standard-clause", requirementIds: reqs },
      },
    );

    return blocks;
  },

  // ---------------------------------------------------------------- III.5
  "III.5": (ctx, reqs) => {
    const { data, computed } = ctx;
    const issue = data.issue ?? {};
    const blocks: Block[] = [];

    blocks.push(
      para(
        `The Company proposes to utilise the Net Proceeds of the Issue towards the objects set out ` +
          `below. The Company confirms that the objects of the Issue are within the main objects ` +
          `set out in its Memorandum of Association. The proposed deployment has been estimated by ` +
          `management and has not been appraised by any bank or financial institution.`,
        [],
        reqs,
        "standard-clause",
      ),
    );

    // Gross-to-net bridge
    const bridgeRows: string[][] = [];
    if (isPresent(issue.issue_size)) bridgeRows.push(["Gross proceeds of the Issue", formatCrore(issue.issue_size)]);
    if (isPresent(issue.issue_expenses)) {
      bridgeRows.push(["Less: estimated Issue-related expenses", formatCrore(issue.issue_expenses)]);
    }
    if (isPresent(issue.net_proceeds)) bridgeRows.push(["Net Proceeds of the Issue", formatCrore(issue.net_proceeds)]);

    if (bridgeRows.length) {
      blocks.push(
        table({
          caption: "Net Proceeds of the Issue (INR in crore)",
          columns: [
            { header: "Particulars", width: 70 },
            { header: "Amount", numeric: true, width: 30 },
          ],
          rows: bridgeRows,
          totalRowIndices: bridgeRows.length ? [bridgeRows.length - 1] : undefined,
          provenance: {
            origin: "issuer-input",
            fields: ["issue.issue_size", "issue.issue_expenses", "issue.net_proceeds"],
            requirementIds: reqs,
          },
        }),
      );
    }

    // Objects table
    const objects = issue.objects_breakup;
    if (Array.isArray(objects) && objects.length) {
      const total = round(sumBy(objects, "amount"));
      const net = Number(issue.net_proceeds);

      const rows = objects.map((object: any, index: number) => [
        String(index + 1),
        renderValue(object.purpose),
        formatCrore(object.amount),
        Number.isFinite(net) && net > 0 ? `${((Number(object.amount) / net) * 100).toFixed(2)}%` : "—",
        renderValue(object.deployment) || "—",
      ]);
      rows.push([
        "",
        "Total",
        formatCrore(total),
        Number.isFinite(net) && net > 0 ? `${((total / net) * 100).toFixed(2)}%` : "—",
        "",
      ]);

      // The reconciliation note states the arithmetic outcome plainly, whether
      // or not it balances. A draft that silently hides a shortfall is worse
      // than one that shows it.
      const notes: string[] = [];
      if (Number.isFinite(net)) {
        const difference = round(net - total);
        notes.push(
          Math.abs(difference) < 0.005
            ? `The aggregate of the objects set out above is INR ${formatCrore(total)} crore, which equals the Net Proceeds of INR ${formatCrore(net)} crore.`
            : `The aggregate of the objects set out above is INR ${formatCrore(total)} crore against Net Proceeds of INR ${formatCrore(net)} crore, leaving INR ${formatCrore(Math.abs(difference))} crore ${difference > 0 ? "unallocated" : "over-allocated"}. This difference requires resolution before filing.`,
        );
      }

      blocks.push(
        table({
          caption: "Objects of the Issue and utilisation of Net Proceeds (INR in crore)",
          columns: [
            { header: "No.", width: 6 },
            { header: "Object", width: 44 },
            { header: "Amount", numeric: true, width: 16 },
            { header: "% of Net Proceeds", numeric: true, width: 16 },
            { header: "Proposed deployment", width: 18 },
          ],
          rows,
          totalRowIndices: [rows.length - 1],
          notes,
          provenance: {
            origin: "issuer-input",
            fields: ["issue.objects_breakup", "issue.net_proceeds"],
            requirementIds: reqs,
          },
        }),
      );
    } else {
      blocks.push(
        placeholder(
          "Objects of the Issue and the proposed utilisation of the Net Proceeds.",
          [
            "Each object for which the Net Proceeds are proposed to be used",
            "Amount proposed to be deployed against each object",
            "Financial year in which each amount is proposed to be deployed",
          ],
          reqs,
        ),
      );
    }

    // ---- Issue expenses break-up (R5.10 — 100% of the corpus) ----------
    blocks.push(heading("Estimated Issue-related expenses", reqs));
    const expenseRows = data.issue?.issue_expenses_breakup;
    if (Array.isArray(expenseRows) && expenseRows.length) {
      const totalExpenses = round(sumBy(expenseRows, "amount"));
      const rows = expenseRows.map((row: any) => [
        renderValue(row.head),
        formatCrore(row.amount),
        Number.isFinite(Number(issue.issue_size)) && Number(issue.issue_size) > 0
          ? `${((Number(row.amount) / Number(issue.issue_size)) * 100).toFixed(2)}%`
          : "—",
      ]);
      rows.push(["Total estimated Issue expenses", formatCrore(totalExpenses), ""]);
      blocks.push(
        table({
          caption: "Break-up of estimated Issue-related expenses (INR in crore)",
          columns: [
            { header: "Head of expense", width: 58 },
            { header: "Estimated amount", numeric: true, width: 21 },
            { header: "% of Issue size", numeric: true, width: 21 },
          ],
          rows,
          totalRowIndices: [rows.length - 1],
          provenance: {
            origin: "issuer-input",
            fields: ["issue.issue_expenses_breakup"],
            requirementIds: reqs,
          },
        }),
      );
    } else {
      blocks.push(
        placeholder(
          "Break-up of the estimated Issue-related expenses by head.",
          [
            "Fees of the lead manager and underwriter",
            "Fees of the registrar to the Issue",
            "Fees of legal advisors and auditors",
            "Advertising, printing and distribution expenses",
            "Regulatory, listing and depository fees",
          ],
          reqs,
        ),
      );
    }

    // ---- Working-capital basis (R5.8 — 100% of the corpus) -------------
    blocks.push(heading("Basis of the working-capital requirement", reqs));
    blocks.push(
      fieldPara(
        ctx,
        "issue.working_capital_basis",
        reqs,
        "Basis and assumptions on which the incremental working-capital requirement has been estimated.",
        [
          "Holding periods assumed for inventory, receivables and payables",
          "Working-capital position for each restated financial year and the projected requirement",
          "Certificate of the statutory auditor supporting the computation",
        ],
      ),
    );

    // ---- Monitoring agency (R5.7 — 100% of the corpus) -----------------
    blocks.push(heading("Monitoring of the deployment of Net Proceeds", reqs));
    blocks.push(
      fieldPara(
        ctx,
        "issue.monitoring_agency",
        reqs,
        "Particulars of the monitoring agency appointed to monitor the deployment of the Net Proceeds, or the basis on which no monitoring agency is required.",
        [
          "Name of the credit rating agency appointed as monitoring agency, where the issue size requires one",
          "Where no monitoring agency is appointed, the board's basis for non-applicability under the ICDR Regulations",
          "The Audit Committee's undertaking to monitor utilisation and to disclose deviations",
        ],
      ),
    );

    blocks.push(
      {
        kind: "callout",
        tone: "attention",
        title: "For the merchant banker",
        text:
          "Quotations or estimates supporting each item of capital expenditure, the means of finance " +
          "for the balance requirement, the auditor's certificate on the working-capital computation, " +
          "the bridge financing position, and the schedule of deployment by financial year must be " +
          "inserted and verified before filing. General corporate purposes remain subject to the " +
          "ceiling prescribed under the ICDR Regulations, which Drafter checks arithmetically.",
        provenance: { origin: "standard-clause", requirementIds: reqs },
      },
    );

    return blocks;
  },

  // ---------------------------------------------------------------- III.6
  "III.6": (ctx, reqs) => {
    const { data, computed } = ctx;
    const fin = data.financials ?? {};
    const issue = data.issue ?? {};
    const blocks: Block[] = [];

    blocks.push(
      para(
        `The Issue price of ${renderValue(issue.price_band) || "[·]"} has been determined by the Company ` +
          `in consultation with the Lead Manager on the basis of an assessment of the qualitative and ` +
          `quantitative factors set out below. The face value of the equity shares is INR ` +
          `${renderValue(issue.face_value)} each and the Issue price is ` +
          `${Number(issue.price_cap) && Number(issue.face_value) ? (Number(issue.price_cap) / Number(issue.face_value)).toFixed(1) : "[·]"} ` +
          `times the face value at the upper end of the band. Investors should read this chapter ` +
          `together with “Risk Factors”, “Our Business” and the Restated Financial Statements.`,
        ["issue.price_band", "issue.face_value", "issue.price_cap"],
        reqs,
        "derived",
      ),
    );

    blocks.push(heading("Qualitative factors", reqs));
    blocks.push(
      fieldList(
        ctx,
        "business.competitive_strengths",
        reqs,
        "Qualitative factors supporting the Issue price.",
        ["The Company's competitive strengths, as described in the chapter 'Our Business'"],
      ),
    );

    blocks.push(heading("Quantitative factors", reqs));
    const rows: string[][] = [];
    if (isPresent(fin.eps)) rows.push(["Basic earnings per equity share (INR)", renderValue(fin.eps)]);
    if (isPresent(fin.eps_diluted)) rows.push(["Diluted earnings per equity share (INR)", renderValue(fin.eps_diluted)]);
    if (computed.peFloor) rows.push(["Price to earnings ratio at the floor price", computed.peFloor]);
    if (computed.peCap) rows.push(["Price to earnings ratio at the cap price", computed.peCap]);
    if (isPresent(fin.ronw_pct)) rows.push(["Return on net worth (%)", `${renderValue(fin.ronw_pct)}%`]);
    if (isPresent(fin.nav_per_share)) rows.push(["Net asset value per equity share (INR)", renderValue(fin.nav_per_share)]);

    if (rows.length) {
      blocks.push(
        table({
          caption: `Quantitative factors (based on the Restated Financial Statements for ${computed.latestYear ?? "the latest financial year"})`,
          columns: [
            { header: "Particulars", width: 62 },
            { header: "Value", numeric: true, width: 38 },
          ],
          rows,
          notes: computed.peFloor
            ? [
                `The price to earnings ratios above are computed on the basic earnings per share of INR ${renderValue(fin.eps)} for ${computed.latestYear ?? "the latest financial year"} and the floor and cap of the price band.`,
              ]
            : undefined,
          provenance: {
            origin: "derived",
            fields: ["financials.eps", "financials.ronw_pct", "financials.nav_per_share", "issue.price_floor", "issue.price_cap"],
            requirementIds: reqs,
            note: "Price to earnings ratios are computed from the issuer's earnings per share and price band. All other figures are as supplied.",
          },
        }),
      );
    } else {
      blocks.push(
        placeholder(
          "Quantitative factors supporting the Issue price.",
          [
            "Basic and diluted earnings per equity share for each of the last three financial years",
            "Return on net worth for each of the last three financial years",
            "Net asset value per equity share before and after the Issue",
          ],
          reqs,
        ),
      );
    }

    // ---- Weighted average EPS / RoNW (R9.6 — 100% of the corpus) -------
    // Schedule VI requires the weighted average across restated periods, with
    // the most recent year carrying the greatest weight (3:2:1).
    blocks.push(heading("Weighted average earnings per share and return on net worth", reqs));
    const epsSeries: number[] = Array.isArray(fin.eps_3yr) ? fin.eps_3yr : [];
    const ronwSeries: number[] = Array.isArray(fin.ronw_3yr) ? fin.ronw_3yr : [];
    const years: string[] = fin.years ?? [];

    if (epsSeries.length === years.length && epsSeries.length > 0) {
      const weights = epsSeries.map((_, index) => index + 1); // oldest → newest
      const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
      const weighted = (series: number[]) =>
        series.length === weights.length
          ? series.reduce((sum, value, index) => sum + Number(value) * weights[index], 0) / weightTotal
          : null;

      const rows = years.map((year, index) => [
        year,
        epsSeries[index] !== undefined ? String(epsSeries[index]) : "—",
        ronwSeries[index] !== undefined ? `${ronwSeries[index]}%` : "—",
        String(weights[index]),
      ]);
      const weightedEps = weighted(epsSeries);
      const weightedRonw = weighted(ronwSeries);
      rows.push([
        "Weighted average",
        weightedEps !== null ? weightedEps.toFixed(2) : "—",
        weightedRonw !== null ? `${weightedRonw.toFixed(2)}%` : "—",
        "",
      ]);

      blocks.push(
        table({
          caption: "Weighted average earnings per share and return on net worth",
          columns: [
            { header: "Financial year", width: 30 },
            { header: "Basic EPS (INR)", numeric: true, width: 24 },
            { header: "RoNW (%)", numeric: true, width: 24 },
            { header: "Weight", numeric: true, width: 22 },
          ],
          rows,
          totalRowIndices: [rows.length - 1],
          notes: [
            "Weights are assigned in ascending order to the restated financial years, with the most recent year carrying the greatest weight, in the manner prescribed by Schedule VI.",
          ],
          provenance: {
            origin: "derived",
            fields: ["financials.eps_3yr", "financials.ronw_3yr", "financials.years"],
            requirementIds: reqs,
            note: "Weighted averages computed from the issuer's restated per-year figures.",
          },
        }),
      );
    } else {
      blocks.push(
        placeholder(
          "Weighted average earnings per share and return on net worth across the restated financial years.",
          [
            "Basic and diluted earnings per share for each restated financial year",
            "Return on net worth for each restated financial year",
          ],
          reqs,
        ),
      );
    }

    // ---- Key Performance Indicators (R9.4 — 100% of the corpus) --------
    blocks.push(heading("Key performance indicators", reqs));
    blocks.push(
      para(
        `The key performance indicators set out below are those the Company's management uses to ` +
          `evaluate its operating and financial performance. The Company confirms that these indicators ` +
          `have been approved by the Audit Committee and that they have been disclosed to investors in ` +
          `all periods presented.`,
        [],
        reqs,
        "standard-clause",
      ),
    );
    const kpis = data.business?.kpis;
    if (Array.isArray(kpis) && kpis.length) {
      const kpiYears: string[] = fin.years ?? [];
      blocks.push(
        table({
          caption: "Key performance indicators",
          columns: [
            { header: "Indicator", width: 40 },
            ...kpiYears.map((year) => ({ header: year, numeric: true, width: 20 })),
          ],
          rows: kpis.map((kpi: any) => [renderValue(kpi.name), ...(kpi.values ?? []).map((value: any) => renderValue(value))]),
          provenance: {
            origin: "issuer-input",
            fields: ["business.kpis"],
            requirementIds: reqs,
          },
        }),
      );
    } else {
      blocks.push(
        placeholder(
          "Key performance indicators of the Company for each restated period.",
          [
            "The indicators management uses to evaluate performance, with the value for each restated period",
            "Audit Committee resolution approving the key performance indicators",
            "Certificate of the statutory auditor on the indicators disclosed",
            "An explanation of how each indicator is computed",
          ],
          reqs,
        ),
      );
    }

    // ---- WACA (R9.5 — 100% of the corpus) ------------------------------
    blocks.push(heading("Weighted average cost of acquisition", reqs));
    const waca = data.promoters?.waca;
    if (isPresent(waca)) {
      const floor = Number(issue.price_floor);
      const cap = Number(issue.price_cap);
      const wacaValue = Number(waca);
      const rows: string[][] = [["Weighted average cost of acquisition (WACA)", `INR ${renderValue(waca)}`]];
      if (Number.isFinite(floor) && Number.isFinite(wacaValue) && wacaValue > 0) {
        rows.push(["Floor price as a multiple of WACA", `${(floor / wacaValue).toFixed(2)} times`]);
      }
      if (Number.isFinite(cap) && Number.isFinite(wacaValue) && wacaValue > 0) {
        rows.push(["Cap price as a multiple of WACA", `${(cap / wacaValue).toFixed(2)} times`]);
      }
      blocks.push(
        table({
          caption: "Weighted average cost of acquisition of the Promoters and selling shareholders",
          columns: [
            { header: "Particulars", width: 62 },
            { header: "Value", numeric: true, width: 38 },
          ],
          rows,
          provenance: {
            origin: "derived",
            fields: ["promoters.waca", "issue.price_floor", "issue.price_cap"],
            requirementIds: reqs,
            note: "Multiples computed from the issuer's stated WACA and price band.",
          },
        }),
      );
    } else {
      blocks.push(
        placeholder(
          "Weighted average cost of acquisition of equity shares by the Promoters and selling shareholders.",
          [
            "Weighted average cost of acquisition of all equity shares transacted in the last three years",
            "Weighted average cost of acquisition for the Promoters and for each selling shareholder",
            "Certificate of the statutory auditor on the computation",
          ],
          reqs,
        ),
      );
    }

    blocks.push(heading("Comparison with listed industry peers", reqs));
    blocks.push(
      fieldPara(
        ctx,
        "financials.peer_comparison",
        reqs,
        "Comparison of the Company's accounting ratios with those of listed industry peers, or a statement that no directly comparable listed peer exists.",
        [
          "Name of each listed peer, with the source and date of the peer's financial information",
          "Peer earnings per share, price to earnings ratio, return on net worth and net asset value",
        ],
      ),
    );

    blocks.push(
      {
        kind: "callout",
        tone: "attention",
        title: "For the merchant banker",
        text:
          "The net asset value before and after the Issue, the peer set with named and dated sources, " +
          "the Audit Committee's approval of the key performance indicators and the auditor's certificate " +
          "on the weighted average cost of acquisition must all be in place before filing.",
        provenance: { origin: "standard-clause", requirementIds: reqs },
      },
    );

    return blocks;
  },

  // ---------------------------------------------------------------- IV.5
  "IV.5": (ctx, reqs) => {
    const { data } = ctx;
    const management = data.management ?? {};
    const blocks: Block[] = [];

    blocks.push(heading("Board of Directors", reqs));
    const directorRows = parseNamedEntries(management.directors);
    if (directorRows.length) {
      blocks.push(
        table({
          caption: "Directors of the Company",
          columns: [
            { header: "Name", width: 28 },
            { header: "Designation and particulars", width: 72 },
          ],
          rows: directorRows,
          provenance: {
            origin: "issuer-input",
            fields: ["management.directors"],
            requirementIds: reqs,
          },
        }),
      );
    } else {
      blocks.push(
        placeholder(
          "Particulars of the Directors of the Company.",
          [
            "Name, designation, DIN, age, address and qualification of each Director",
            "Date of appointment and term of office",
            "Other directorships held by each Director",
          ],
          reqs,
        ),
      );
    }

    blocks.push(heading("Key managerial personnel", reqs));
    blocks.push(
      fieldPara(ctx, "management.kmp", reqs, "Particulars of the key managerial personnel of the Company.", [
        "Name, designation and date of appointment of each key managerial person",
        "Qualification and prior experience",
      ]),
    );

    blocks.push(heading("Remuneration of Directors and key managerial personnel", reqs));
    blocks.push(
      fieldPara(ctx, "management.remuneration", reqs, "Remuneration paid to the Directors and key managerial personnel.", [
        "Remuneration paid to each Director in the last financial year",
        "Sitting fees paid to independent Directors",
      ]),
    );

    blocks.push(heading("Corporate governance", reqs));
    blocks.push(
      para(
        `The Company is in compliance with the requirements of the Companies Act and, on listing, ` +
          `will comply with the applicable provisions of the LODR Regulations in relation to the ` +
          `composition of the Board and the constitution of its committees.`,
        [],
        reqs,
        "standard-clause",
      ),
    );
    blocks.push(
      fieldPara(
        ctx,
        "management.corporate_governance_committees",
        reqs,
        "Constitution of the Audit Committee, the Nomination and Remuneration Committee and the Stakeholders Relationship Committee.",
        [
          "Members and chairperson of the Audit Committee",
          "Members and chairperson of the Nomination and Remuneration Committee",
          "Members and chairperson of the Stakeholders Relationship Committee",
        ],
      ),
    );

    blocks.push(heading("Related-party transactions", reqs));
    blocks.push(
      fieldPara(
        ctx,
        "management.related_parties",
        reqs,
        "Particulars of related-party transactions entered into by the Company.",
        [
          "Name of each related party and the nature of the relationship",
          "Nature and value of each transaction for every reported financial year",
          "Confirmation that the transactions were at arm's length",
        ],
      ),
    );

    return blocks;
  },

  // ---------------------------------------------------------------- IV.6
  "IV.6": (ctx, reqs) => {
    const { data } = ctx;
    const blocks: Block[] = [];

    blocks.push(heading("Our Promoters", reqs));
    blocks.push(
      fieldPara(ctx, "promoters.promoter_details", reqs, "Particulars of the Promoters of the Company.", [
        "Name, age, qualification, experience and address of each Promoter",
        "Permanent Account Number, passport number and bank account details for verification",
        "Other ventures and directorships of each Promoter",
      ]),
    );

    const shareholding = data.promoters?.promoter_shareholding_pct;
    if (isPresent(shareholding)) {
      blocks.push(
        para(
          `The Promoters together hold ${renderValue(shareholding)}% of the pre-Issue paid-up equity ` +
            `share capital of the Company. The shareholder-wise break-up is set out in the chapter ` +
            `“Capital Structure”.`,
          ["promoters.promoter_shareholding_pct"],
          reqs,
          "issuer-input",
        ),
      );
    }

    blocks.push(heading("Promoter contribution and lock-in", reqs));
    blocks.push(
      placeholder(
        "Minimum promoter contribution, the equity shares locked in, and the period of lock-in under the ICDR Regulations.",
        [
          "Computation of the minimum promoter contribution required under the ICDR Regulations",
          "Identification of the specific equity shares proposed to be locked in, with the date and consideration of each allotment",
          "Written undertaking from each Promoter not to transfer the locked-in equity shares",
          "Confirmation from the depository that the lock-in has been recorded",
        ],
        reqs,
      ),
    );

    blocks.push(heading("Confirmations", reqs));
    blocks.push(
      para(
        `The Promoters and the members of the Promoter Group are required to confirm that they have ` +
          `not been declared as wilful defaulters or fraudulent borrowers, that they are not debarred ` +
          `from accessing the capital markets, and that they are not promoters or directors of any ` +
          `other company which is so debarred. These confirmations are obtained and verified by the ` +
          `Lead Manager during due diligence.`,
        [],
        reqs,
        "standard-clause",
      ),
    );

    return blocks;
  },

  // ---------------------------------------------------------------- IV.7
  "IV.7": (ctx, reqs) => {
    const blocks: Block[] = [];
    blocks.push(
      fieldList(ctx, "management.group_companies", reqs, "Particulars of the group companies of the Company.", [
        "Name and date of incorporation of each group company",
        "Nature of the relationship with the Company",
        "Summary financial information of each group company for the last three financial years",
      ]),
    );
    blocks.push(
      {
        kind: "callout",
        tone: "attention",
        title: "For the merchant banker",
        text:
          "Summary financial information for each group company for the last three financial years, " +
          "particulars of any group company with a negative net worth, any common pursuits or conflict " +
          "of interest with the Company, and any related business transactions must be disclosed in " +
          "this chapter before filing.",
        provenance: { origin: "standard-clause", requirementIds: reqs },
      },
    );
    return blocks;
  },

  // ---------------------------------------------------------------- V.1
  "V.1": (ctx, reqs) => {
    const { data, computed } = ctx;
    const fin = data.financials ?? {};
    const years: string[] = fin.years ?? [];
    const blocks: Block[] = [];

    blocks.push(
      para(
        `The Restated Financial Statements of the Company for the financial years ` +
          `${years.join(", ")} have been prepared in accordance with the Companies Act and restated ` +
          `in accordance with the ICDR Regulations. The summary set out below is extracted from those ` +
          `statements and must be read together with the full Restated Financial Statements and the ` +
          `notes and annexures thereto.`,
        ["financials.years"],
        reqs,
        "derived",
      ),
    );

    blocks.push(heading("Restated statement of profit and loss", reqs));
    const plRows = buildSeriesRows(fin, [
      ["Revenue from operations", "revenue_3yr"],
      ["EBITDA", "ebitda_3yr"],
      ["Profit after tax", "pat_3yr"],
    ]);
    if (years.length && plRows.length) {
      blocks.push(
        table({
          caption: "Restated statement of profit and loss (INR in crore)",
          columns: [
            { header: "Particulars", width: 40 },
            ...years.map((year) => ({ header: `For the year ended ${year}`, numeric: true, width: 20 })),
          ],
          rows: plRows,
          provenance: {
            origin: "issuer-input",
            fields: ["financials.revenue_3yr", "financials.ebitda_3yr", "financials.pat_3yr"],
            requirementIds: reqs,
          },
        }),
      );
    }

    blocks.push(heading("Restated statement of assets and liabilities", reqs));
    const bsRows = buildSeriesRows(fin, [
      ["Total assets", "total_assets_3yr"],
      ["Net worth", "networth_3yr"],
      ["Total borrowings", "borrowings_3yr"],
    ]);
    if (years.length && bsRows.length) {
      blocks.push(
        table({
          caption: "Restated statement of assets and liabilities (INR in crore)",
          columns: [
            { header: "Particulars", width: 40 },
            ...years.map((year) => ({ header: `As at ${year}`, numeric: true, width: 20 })),
          ],
          rows: bsRows,
          provenance: {
            origin: "issuer-input",
            fields: ["financials.total_assets_3yr", "financials.networth_3yr", "financials.borrowings_3yr"],
            requirementIds: reqs,
          },
        }),
      );
    }

    blocks.push(heading("Restated statement of cash flows", reqs));
    const cfRows = buildSeriesRows(fin, [["Net cash generated from operating activities", "cash_flow_ops_3yr"]]);
    if (years.length && cfRows.length) {
      blocks.push(
        table({
          caption: "Restated statement of cash flows (INR in crore)",
          columns: [
            { header: "Particulars", width: 40 },
            ...years.map((year) => ({ header: `For the year ended ${year}`, numeric: true, width: 20 })),
          ],
          rows: cfRows,
          provenance: {
            origin: "issuer-input",
            fields: ["financials.cash_flow_ops_3yr"],
            requirementIds: reqs,
          },
        }),
      );
      blocks.push(
        placeholder(
          "Cash flows from investing and financing activities, and the reconciliation of opening to closing cash and cash equivalents.",
          [
            "Net cash used in investing activities for each restated year",
            "Net cash from or used in financing activities for each restated year",
            "Opening and closing cash and cash equivalents for each restated year",
          ],
          reqs,
        ),
      );
    }

    blocks.push(heading("Accounting ratios", reqs));
    const ratioRows = buildRatioRows(fin, computed);
    if (ratioRows.length) {
      blocks.push(
        table({
          columns: [
            { header: "Ratio", width: 60 },
            { header: computed.latestYear ?? "Latest year", numeric: true, width: 40 },
          ],
          rows: ratioRows,
          provenance: {
            origin: "issuer-input",
            fields: ["financials.eps", "financials.ronw_pct", "financials.nav_per_share"],
            requirementIds: reqs,
          },
        }),
      );
    }

    // Auditor reference. Absent here, the exchange pre-check returns the draft —
    // so a missing auditor becomes a visible placeholder, never a silent gap.
    blocks.push(heading("Auditor's examination report", reqs));
    if (isPresent(fin.auditor)) {
      blocks.push(
        para(
          `The Restated Financial Statements have been examined by ${renderValue(fin.auditor)}` +
            `${isPresent(fin.auditor_frn) ? `, firm registration number ${renderValue(fin.auditor_frn)}` : ""}, ` +
            `the peer-reviewed statutory auditor of the Company` +
            `${isPresent(fin.audit_report_date) ? `, whose examination report is dated ${renderValue(fin.audit_report_date)}` : ""}. ` +
            `The examination report, together with the Restated Financial Statements and the annexures ` +
            `thereto, is set out in this chapter.`,
          ["financials.auditor", "financials.auditor_frn", "financials.audit_report_date"],
          reqs,
        ),
      );
    } else {
      blocks.push(
        placeholder(
          "Reference to the peer-reviewed statutory auditor and the examination report on the Restated Financial Statements.",
          [
            "Name of the peer-reviewed statutory auditor of the Company",
            "ICAI firm registration number of the auditor",
            "Date of the auditor's examination report on the Restated Financial Statements",
            "The auditor's peer review certificate number and its validity",
          ],
          reqs,
        ),
      );
    }

    blocks.push(
      {
        kind: "callout",
        tone: "attention",
        title: "For the merchant banker",
        text:
          "The complete restated statement of assets and liabilities, statement of profit and loss and " +
          "statement of cash flows, together with the significant accounting policies, the notes to " +
          "accounts, the statement of restatement adjustments and the related-party schedule, must be " +
          "annexed as certified by the peer-reviewed auditor. The summary tables above are a navigational " +
          "extract and do not substitute for the certified statements.",
        provenance: { origin: "standard-clause", requirementIds: reqs },
      },
    );

    return blocks;
  },

  // ---------------------------------------------------------------- V.3
  "V.3": (ctx, reqs) => {
    const { data } = ctx;
    const debt = data.indebtedness ?? {};
    const blocks: Block[] = [];

    const rows: string[][] = [];
    if (isPresent(debt.secured)) rows.push(["Secured borrowings", formatCrore(debt.secured)]);
    if (isPresent(debt.unsecured)) rows.push(["Unsecured borrowings", formatCrore(debt.unsecured)]);
    if (isPresent(debt.total_borrowings)) rows.push(["Total borrowings", formatCrore(debt.total_borrowings)]);

    if (rows.length) {
      blocks.push(
        table({
          caption: "Financial indebtedness of the Company (INR in crore)",
          columns: [
            { header: "Particulars", width: 70 },
            { header: "Amount outstanding", numeric: true, width: 30 },
          ],
          rows,
          totalRowIndices: isPresent(debt.total_borrowings) ? [rows.length - 1] : undefined,
          provenance: {
            origin: "issuer-input",
            fields: ["indebtedness.secured", "indebtedness.unsecured", "indebtedness.total_borrowings"],
            requirementIds: reqs,
          },
        }),
      );
    }

    blocks.push(heading("Principal lenders and security", reqs));
    blocks.push(
      fieldPara(ctx, "indebtedness.lenders", reqs, "Particulars of the Company's lenders and the security created.", [
        "Name of each lender and the nature of the facility",
        "Sanctioned amount and amount outstanding",
        "Security created in favour of each lender",
      ]),
    );

    blocks.push(heading("Material terms", reqs));
    blocks.push(
      fieldPara(ctx, "indebtedness.terms", reqs, "Material terms of the Company's borrowings.", [
        "Rate of interest applicable to each facility",
        "Repayment schedule and tenor",
        "Restrictive covenants and events of default",
      ]),
    );

    return blocks;
  },

  // ---------------------------------------------------------------- VI.1
  "VI.1": (ctx, reqs) => {
    const { data } = ctx;
    const legal = data.legal ?? {};
    const blocks: Block[] = [];

    blocks.push(
      para(
        `Set out below are the outstanding legal proceedings involving the Company, its Directors ` +
          `and its Promoters, and the material developments since the date of the Restated Financial ` +
          `Statements, in each case as disclosed by the Company. The disclosure is made on the basis ` +
          `of the materiality policy adopted by the Board of Directors.`,
        [],
        reqs,
        "standard-clause",
      ),
    );

    blocks.push(heading("Outstanding litigation involving the Company", reqs));
    const matters = legal.litigation_matters;
    if (Array.isArray(matters) && matters.length) {
      blocks.push(
        table({
          caption: "Outstanding proceedings",
          columns: [
            { header: "Counterparty or authority", width: 26 },
            { header: "Nature of the proceeding", width: 34 },
            { header: "Amount involved (INR crore)", numeric: true, width: 18 },
            { header: "Present status", width: 22 },
          ],
          rows: matters.map((matter: any) => [
            renderValue(matter.party),
            renderValue(matter.nature),
            isPresent(matter.amount) ? formatCrore(matter.amount) : "Not quantified",
            renderValue(matter.status),
          ]),
          provenance: {
            origin: "issuer-input",
            fields: ["legal.litigation_matters"],
            requirementIds: reqs,
          },
        }),
      );
    }

    blocks.push(
      fieldPara(
        ctx,
        "legal.litigation",
        reqs,
        "Particulars of outstanding litigation involving the Company, its Directors and its Promoters.",
        [
          "Every civil, criminal, tax and regulatory proceeding involving the Company",
          "Proceedings involving the Directors and the Promoters in their personal capacity",
          "The forum, the amount involved and the present status of each proceeding",
        ],
      ),
    );

    blocks.push(heading("Tax proceedings", reqs));
    blocks.push(
      fieldPara(ctx, "legal.tax_matters", reqs, "Particulars of outstanding direct and indirect tax proceedings.", [
        "Direct tax proceedings, with the assessment year and the amount demanded",
        "Indirect tax proceedings, including goods and services tax matters, with the period and amount",
        "The forum before which each matter is pending",
      ]),
    );

    blocks.push(heading("Material developments", reqs));
    blocks.push(
      fieldPara(
        ctx,
        "legal.material_developments",
        reqs,
        "Material developments since the date of the Restated Financial Statements.",
        [
          "Any circumstance since the last financial statements that materially affects the Company's trading or profitability",
          "Any change in the value of the Company's assets or liabilities",
        ],
      ),
    );

    blocks.push(
      {
        kind: "callout",
        tone: "attention",
        title: "For the merchant banker",
        text:
          "The materiality policy adopted by the Board, the certificate of the Company's legal counsel " +
          "listing all outstanding proceedings, and confirmations from each Director and Promoter as to " +
          "proceedings in their personal capacity must be obtained and verified. A proceeding referenced " +
          "anywhere in the issuer's records but omitted from this chapter is treated by the exchange as a " +
          "material non-disclosure.",
        provenance: { origin: "standard-clause", requirementIds: reqs },
      },
    );

    return blocks;
  },

  // ---------------------------------------------------------------- VI.2
  "VI.2": (ctx, reqs) => {
    const blocks: Block[] = [];
    blocks.push(heading("Approvals and licences held by the Company", reqs));
    blocks.push(
      fieldList(ctx, "legal.approvals", reqs, "Particulars of the statutory approvals and licences held by the Company.", [
        "Every licence, consent, registration and approval held, with its issuing authority",
        "The reference number and the date of expiry of each approval",
      ]),
    );
    blocks.push(heading("Approvals applied for or yet to be obtained", reqs));
    blocks.push(
      fieldPara(ctx, "legal.pending_approvals", reqs, "Approvals applied for but not yet received, and approvals yet to be applied for.", [
        "Approvals required for the objects of the Issue that have not yet been obtained",
        "The date of application and the present status of each",
      ]),
    );
    return blocks;
  },

  // ---------------------------------------------------------------- VII.2
  "VII.2": (ctx, reqs) => {
    const { data, computed } = ctx;
    const issue = data.issue ?? {};
    const blocks: Block[] = [];

    const fresh = Number(issue.fresh_issue_shares);
    const mm = Number(issue.market_maker_reservation_shares);
    const net = computed.netIssueShares;

    if (Number.isFinite(fresh) && Number.isFinite(mm) && Number.isFinite(net)) {
      const half = Math.floor(net / 2);
      const rows = [
        ["Market Maker reservation portion", formatIndianNumber(mm), `${((mm / fresh) * 100).toFixed(2)}%`],
        [
          "Net Issue to the public — retail individual investors",
          formatIndianNumber(half),
          `${((half / fresh) * 100).toFixed(2)}%`,
        ],
        [
          "Net Issue to the public — other than retail individual investors",
          formatIndianNumber(net - half),
          `${(((net - half) / fresh) * 100).toFixed(2)}%`,
        ],
        ["Total Issue", formatIndianNumber(fresh), "100.00%"],
      ];

      blocks.push(
        table({
          caption: "Issue structure",
          columns: [
            { header: "Category", width: 54 },
            { header: "No. of equity shares", numeric: true, width: 23 },
            { header: "% of Issue", numeric: true, width: 23 },
          ],
          rows,
          totalRowIndices: [rows.length - 1],
          notes: [
            "The allocation between retail individual investors and other than retail individual investors is presented on the indicative basis prescribed for issues on the SME platform, and is subject to confirmation by the Lead Manager against the ICDR Regulations in force at the time of filing.",
          ],
          provenance: {
            origin: "derived",
            fields: ["issue.fresh_issue_shares", "issue.market_maker_reservation_shares"],
            requirementIds: reqs,
            note: "Category split computed from the Issue size and the market maker reservation supplied by the issuer.",
          },
        }),
      );
    } else {
      blocks.push(
        placeholder(
          "Issue structure and the allocation between investor categories.",
          [
            "Total number of equity shares offered in the Issue",
            "Market maker reservation portion",
            "Allocation between retail individual investors and other investors",
          ],
          reqs,
        ),
      );
    }

    blocks.push(
      para(
        `Undersubscription, if any, in any category would be met with spillover from the other ` +
          `categories at the discretion of the Company in consultation with the Lead Manager and the ` +
          `SME Platform, subject to applicable law. The Issue is subject to the minimum subscription ` +
          `requirement prescribed under the ICDR Regulations; if the Company does not receive the ` +
          `minimum subscription, it will refund the entire subscription amount received.`,
        [],
        reqs,
        "standard-clause",
      ),
    );

    return blocks;
  },

  // ---------------------------------------------------------------- IX.1
  "IX.1": (ctx, reqs) => {
    const { data } = ctx;
    const blocks: Block[] = [];

    blocks.push(
      para(
        `The contracts referred to below, which are or may be deemed material, have been entered ` +
          `into or are to be entered into by the Company. Copies of these contracts, together with ` +
          `the documents for inspection referred to below, will be available for inspection at the ` +
          `registered office of the Company between 10:00 a.m. and 5:00 p.m. on all working days ` +
          `from the date of the Prospectus until the Issue closing date.`,
        [],
        reqs,
        "standard-clause",
      ),
    );

    blocks.push(heading("Material contracts", reqs));
    const contracts = [
      `Issue agreement dated [·] between the Company and ${renderValue(data.issue_structure?.lead_manager) || "the Lead Manager"}.`,
      `Registrar agreement dated [·] between the Company and ${renderValue(data.issue_structure?.registrar) || "the Registrar to the Issue"}.`,
      `Underwriting agreement dated [·] between the Company and ${renderValue(data.issue_structure?.underwriter) || "the Underwriter"}.`,
      `Market making agreement dated [·] between the Company, the Lead Manager and ${renderValue(data.issue?.market_maker) || "the Market Maker"}.`,
      `Banker to the Issue agreement dated [·] between the Company, the Lead Manager, the Registrar to the Issue and ${renderValue(data.issue_structure?.banker) || "the Banker to the Issue"}.`,
      "Tripartite agreement between the Company, the Registrar to the Issue and the National Securities Depository Limited.",
      "Tripartite agreement between the Company, the Registrar to the Issue and the Central Depository Services (India) Limited.",
    ];
    blocks.push({
      kind: "list",
      items: contracts,
      provenance: {
        origin: "standard-clause",
        fields: ["issue_structure.lead_manager", "issue_structure.registrar", "issue_structure.underwriter"],
        requirementIds: reqs,
      },
    });

    blocks.push(heading("Documents for inspection", reqs));
    blocks.push({
      kind: "list",
      items: [
        "Certified copies of the Memorandum and Articles of Association of the Company, as amended.",
        "Certificate of incorporation of the Company.",
        "Resolutions of the Board of Directors and of the shareholders authorising the Issue.",
        "The Restated Financial Statements and the examination report of the peer-reviewed statutory auditor thereon.",
        "The statement of special tax benefits certified by the statutory auditor.",
        "Written consents of the Directors, the Company Secretary and Compliance Officer, the statutory auditor, the Lead Manager, the Registrar to the Issue, the Underwriter, the Market Maker, the bankers to the Company and the legal advisor.",
        "The due diligence certificate issued by the Lead Manager to SEBI.",
        "The in-principle listing approval issued by the SME Platform.",
      ],
      provenance: { origin: "standard-clause", requirementIds: reqs },
    });

    blocks.push(
      {
        kind: "callout",
        tone: "attention",
        title: "For the merchant banker",
        text:
          "The date of execution of each material contract must be inserted, and any contract entered " +
          "into other than in the ordinary course of business in the two years preceding the date of " +
          "the Prospectus must be added to this chapter.",
        provenance: { origin: "standard-clause", requirementIds: reqs },
      },
    );

    return blocks;
  },
};

// ---------------------------------------------------------------------------
// Table helpers
// ---------------------------------------------------------------------------

/** Build rows for a set of three-year series, skipping any series not supplied. */
function buildSeriesRows(fin: any, specs: [string, string][]): string[][] {
  const rows: string[][] = [];
  for (const [label, key] of specs) {
    const series = fin?.[key];
    if (Array.isArray(series) && series.length) {
      rows.push([label, ...series.map((value: number) => formatCrore(value))]);
    }
  }
  return rows;
}

function buildRatioRows(fin: any, computed: Computed): string[][] {
  const rows: string[][] = [];
  if (isPresent(fin?.eps)) rows.push(["Basic earnings per equity share (INR)", renderValue(fin.eps)]);
  if (isPresent(fin?.eps_diluted)) rows.push(["Diluted earnings per equity share (INR)", renderValue(fin.eps_diluted)]);
  if (isPresent(fin?.ronw_pct)) rows.push(["Return on net worth (%)", `${renderValue(fin.ronw_pct)}%`]);
  if (isPresent(fin?.nav_per_share)) rows.push(["Net asset value per equity share (INR)", renderValue(fin.nav_per_share)]);
  if (computed.revenueCagr) {
    rows.push([`Revenue compound annual growth rate (${computed.financialYearsList})`, computed.revenueCagr]);
  }
  return rows;
}

/**
 * Parse "Name (details); Name (details)" into table rows. Falls back to a single
 * column when the promoter's answer is not in that shape — a wizard answer is
 * free text and the engine must never lose content it cannot parse.
 */
function parseNamedEntries(text: any): string[][] {
  const entries = splitEntries(typeof text === "string" ? text : "");
  if (!entries.length) return [];
  return entries.map((entry) => {
    const match = entry.match(/^(.+?)\s*\((.+)\)\s*$/s);
    if (match) return [match[1].trim(), ensurePeriod(match[2].trim())];
    return [entry.trim(), ""];
  });
}

// ---------------------------------------------------------------------------
// Chapter assembly
// ---------------------------------------------------------------------------

export interface NarrativeRequest {
  chapterId: string;
  chapterTitle: string;
  instruction: string;
  mustCover: string[];
  context: Record<string, any>;
}

export interface GenerateOptions {
  issuerId?: string;
  useLlm?: boolean;
  llmModel?: string;
  /** Injected language-model drafter. Returning null falls back to the template. */
  draftNarrative?: (request: NarrativeRequest) => Promise<string | null>;
  /** Restrict LLM drafting to priority chapters (default true) to bound latency. */
  llmPriorityOnly?: boolean;
}

async function buildChapter(
  spec: StructureChapter,
  sectionId: string,
  sectionTitle: string,
  ctx: Ctx,
  options: GenerateOptions,
): Promise<Chapter> {
  const reqs = chapterRequirementMap[spec.id] ?? [];
  const kb = (sectionTemplates.chapters ?? {})[spec.id];
  let blocks: Block[] = [];

  if (spec.mode === "factual") {
    const builder = factualBuilders[spec.id];
    blocks = builder
      ? builder(ctx, reqs)
      : [
          placeholder(
            `${spec.title}.`,
            (spec.must_cover ?? []).map((item) => `Particulars of ${item}`),
            reqs,
          ),
        ];

    // A factual chapter may ALSO carry standard text. Issue Structure is the
    // clear case: the allocation and the market-maker reservation come from
    // issuer data, but the terms of payment, the revision rules and the
    // minimum-subscription consequence are the same in every SME offer
    // document. Rendering those as standard-clause after the factual blocks
    // gives the chapter its proper substance without any of it becoming an
    // issuer assertion.
    if (kb?.clauses) {
      blocks = [...blocks, ...renderClauses(kb.clauses, ctx, "standard-clause", reqs)];
    }
  } else if (spec.mode === "boilerplate") {
    blocks = kb?.clauses
      ? renderClauses(kb.clauses, ctx, "standard-clause", reqs)
      : [
          {
            kind: "callout",
            tone: "standard",
            title: "Standard clauses",
            text: `This chapter comprises standard offer-document text to be settled by the merchant banker.`,
            provenance: { origin: "standard-clause", requirementIds: reqs },
          },
          placeholder(
            `${spec.title}.`,
            (spec.must_cover ?? []).map((item) => `Standard text covering ${item}`),
            reqs,
          ),
        ];
  } else {
    // narrative
    const wantsLlm =
      options.useLlm &&
      options.draftNarrative &&
      (options.llmPriorityOnly === false || spec.priority === true);

    let llmText: string | null = null;
    if (wantsLlm && kb?.instruction) {
      const context: Record<string, any> = {};
      for (const field of (kb.context_fields as string[]) ?? []) {
        const value = getPath(ctx.data, field);
        if (isPresent(value)) context[field] = value;
      }
      try {
        llmText = await options.draftNarrative!({
          chapterId: spec.id,
          chapterTitle: spec.title,
          instruction: kb.instruction,
          mustCover: kb.must_cover ?? [],
          context,
        });
      } catch {
        llmText = null; // any failure falls through to the deterministic template
      }
    }

    if (llmText && llmText.trim().length > 200) {
      blocks = parseNarrativeText(llmText, reqs, (kb?.context_fields as string[]) ?? []);
    } else if (kb?.fallback) {
      blocks = renderClauses(kb.fallback, ctx, "template-narrative", reqs);
    } else {
      blocks = [
        placeholder(
          `${spec.title}.`,
          (spec.must_cover ?? []).map((item) => `Narrative covering ${item}`),
          reqs,
        ),
      ];
    }
  }

  // ----- Derived chapter metadata -------------------------------------
  const origins = Array.from(new Set(blocks.map((block) => block.provenance.origin)));
  const placeholders = blocks.filter((block) => block.kind === "placeholder").length;
  const substantive = blocks.filter(
    (block) => block.kind === "para" || block.kind === "table" || block.kind === "list",
  ).length;

  let status: ChapterStatus;
  if (substantive === 0) status = "skeleton";
  else if (placeholders > 0) status = "partial";
  else status = "generated";

  const wordCount = blocks.reduce((total, block) => {
    if (block.kind === "para" || block.kind === "heading") return total + countWords(block.text);
    if (block.kind === "list") return total + block.items.reduce((s, i) => s + countWords(i), 0);
    if (block.kind === "callout") return total + countWords(block.text);
    if (block.kind === "table") {
      return total + block.rows.reduce((s, row) => s + row.reduce((c, cell) => c + countWords(cell), 0), 0);
    }
    return total;
  }, 0);

  return {
    id: spec.id,
    title: spec.title,
    sectionId,
    sectionTitle,
    mode: spec.mode,
    priority: spec.priority === true,
    requirementIds: reqs,
    blocks,
    status,
    wordCount,
    origins,
  };
}

/**
 * Convert language-model prose into blocks.
 *
 * The model is asked for plain prose with short headings, not markup. Lines that
 * look like headings become headings; everything else becomes a paragraph. Any
 * stray markdown emphasis is stripped so the prospectus typography stays clean.
 */
function parseNarrativeText(text: string, reqs: string[], fields: string[]): Block[] {
  const clean = text
    .replace(/\r/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .trim();

  // Work line by line, not blank-line-delimited chunk by chunk. Models
  // habitually put a sub-heading on the line immediately above its paragraph
  // with only a single newline between them; splitting on blank lines alone
  // glues the two together ("Industry Structure The Indian auto-component…").
  const lines = clean
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  /** A short, unpunctuated, non-numbered line introducing what follows. */
  const looksLikeHeading = (line: string): boolean =>
    line.length < 90 &&
    line.split(/\s+/).length <= 12 &&
    !/[.:;!?,]$/.test(line) &&
    !/^\d+[.)]/.test(line) &&
    !/^[-–—•]/.test(line);

  /** A numbered risk factor / item, which always starts its own paragraph. */
  const startsNumberedItem = (line: string): boolean => /^\d+[.)]\s/.test(line);

  const blocks: Block[] = [];
  let current: string[] = [];

  const flush = () => {
    if (!current.length) return;
    blocks.push({
      kind: "para",
      text: current.join(" ").replace(/\s+/g, " ").trim(),
      provenance: {
        origin: "llm-narrative",
        fields,
        requirementIds: reqs,
        note: "Drafted by a language model constrained to the issuer data listed. Verify every figure against source records.",
      },
    });
    current = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const next = lines[index + 1];

    // A heading only counts as one when something follows it to introduce.
    if (looksLikeHeading(line) && next) {
      flush();
      blocks.push({
        kind: "heading",
        level: 2,
        text: line.replace(/^[-–—]\s*/, ""),
        provenance: { origin: "llm-narrative", fields, requirementIds: reqs },
      });
      continue;
    }

    if (startsNumberedItem(line)) {
      flush();
      current.push(line);
      continue;
    }

    // A continuation of a hard-wrapped sentence: the previous line did not
    // close and this one does not begin a new one. Join rather than split.
    const previous = current[current.length - 1];
    const isContinuation =
      previous !== undefined && !/[.!?]$/.test(previous) && /^[a-z(]/.test(line);

    if (isContinuation) current.push(line);
    else {
      flush();
      current.push(line);
    }
  }
  flush();

  return blocks;
}

// ---------------------------------------------------------------------------
// Cover page
// ---------------------------------------------------------------------------

function buildCover(ctx: Ctx): CoverPage {
  const { data, computed } = ctx;
  const identity = data.identity ?? {};
  const issue = data.issue ?? {};
  const issueStructure = data.issue_structure ?? {};
  const value = (path: string, fallback = "[·]") => {
    const raw = lookup(ctx, path);
    return isPresent(raw) ? renderValue(raw) : fallback;
  };

  return {
    companyName: value("identity.company_name", "[Company name]"),
    cin: value("identity.cin"),
    incorporationLine: `Incorporated on ${value("identity.incorporation_date")} at ${value(
      "identity.incorporation_place",
    )} under the Companies Act`,
    registeredOffice: value("identity.registered_office"),
    corporateOffice: value("identity.corporate_office"),
    contactLine: [
      isPresent(identity.phone) ? `Tel: ${identity.phone}` : null,
      isPresent(identity.email) ? `Email: ${identity.email}` : null,
      isPresent(identity.website) ? `Website: ${identity.website}` : null,
    ]
      .filter(Boolean)
      .join("  ·  "),
    companySecretary: value("identity.company_secretary"),
    promoters: value("promoters.promoter_names"),
    documentLabel: "DRAFT RED HERRING PROSPECTUS",
    issueTypeLine: `${value("issue.issue_type", "Fresh issue")} · Book building / fixed price to be confirmed by the Lead Manager`,
    issueLine:
      computed.freshIssueSharesFmt && isPresent(issue.issue_size)
        ? `Initial public offering of ${computed.freshIssueSharesFmt} equity shares of face value INR ${value(
            "issue.face_value",
          )} each, aggregating to INR ${formatCrore(issue.issue_size)} crore`
        : "[· Particulars of the Issue to be supplied ·]",
    priceLine: `Price band: ${value("issue.price_band")}`,
    platformLine: `The equity shares are proposed to be listed on ${value(
      "issue_structure.listing_platform",
      "the SME Platform",
    )} in accordance with Chapter IX of the ICDR Regulations`,
    leadManager: value("issue_structure.lead_manager"),
    registrar: value("issue_structure.registrar"),
    marketMaker: value("issue.market_maker"),
    generalRisk:
      "Investments in equity and equity-related securities involve a degree of risk, and investors " +
      "should not invest any funds in the Issue unless they can afford to take the risk of losing " +
      "their investment. Investors are advised to read the risk factors carefully before taking an " +
      "investment decision. In making an investment decision, prospective investors must rely on " +
      "their own examination of the Company and the Issue, including the risks involved. The equity " +
      "shares have not been recommended or approved by the Securities and Exchange Board of India, " +
      "nor does SEBI guarantee the accuracy or adequacy of the contents of this document.",
    issuerResponsibility:
      `The Company, having made all reasonable enquiries, accepts responsibility for and confirms ` +
      `that this Draft Red Herring Prospectus contains all information with regard to the Company ` +
      `and the Issue which is material in the context of the Issue, that the information contained ` +
      `is true and correct in all material respects and is not misleading in any material respect, ` +
      `that the opinions and intentions expressed are honestly held, and that there are no other ` +
      `facts the omission of which makes this document as a whole or any such information or the ` +
      `expression of any such opinions or intentions misleading in any material respect.`,
    lmResponsibility:
      `${value("issue_structure.lead_manager", "The Lead Manager")}, as the lead manager to the Issue, ` +
      `is required to certify, by way of a due diligence certificate furnished to SEBI, that the ` +
      `disclosures made in this Draft Red Herring Prospectus are generally adequate and are in ` +
      `conformity with the ICDR Regulations. This certification is the responsibility of the lead ` +
      `manager and is discharged after the completion of due diligence.`,
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function generateDocument(
  data: IssuerData,
  options: GenerateOptions = {},
): Promise<DrhpDocument> {
  const ctx: Ctx = { data, computed: buildComputed(data) };

  const chapters: Chapter[] = [];
  for (const section of structure.sections) {
    for (const spec of section.chapters) {
      chapters.push(await buildChapter(spec, section.id, section.title, ctx, options));
    }
  }

  const llmUsed = chapters.some((chapter) => chapter.origins.includes("llm-narrative"));

  const stats = {
    totalChapters: chapters.length,
    generatedChapters: chapters.filter((c) => c.status === "generated").length,
    partialChapters: chapters.filter((c) => c.status === "partial").length,
    skeletonChapters: chapters.filter((c) => c.status === "skeleton").length,
    totalWords: chapters.reduce((total, c) => total + c.wordCount, 0),
    totalTables: chapters.reduce(
      (total, c) => total + c.blocks.filter((b) => b.kind === "table").length,
      0,
    ),
    placeholders: chapters.reduce(
      (total, c) => total + c.blocks.filter((b) => b.kind === "placeholder").length,
      0,
    ),
  };

  return {
    issuerId: options.issuerId ?? "custom",
    issuerName: data?.identity?.company_name ?? "Issuer",
    docType: structure.doc_type,
    cover: buildCover(ctx),
    sections: structure.sections.map((section) => ({
      id: section.id,
      title: section.title,
      chapterIds: section.chapters.map((chapter) => chapter.id),
    })),
    chapters,
    generatedAt: new Date().toISOString(),
    regulationSetVersion: "2026-07-R2",
    regulationSetDescription: structure.basis,
    llmUsed,
    llmModel: llmUsed ? options.llmModel : undefined,
    generationMode: llmUsed ? "llm" : "template",
    generationNote: llmUsed
      ? `Narrative chapters drafted by ${options.llmModel ?? "the configured language model"} under a constrained prompt limited to the issuer data. Factual chapters are built deterministically from issuer data and contain no model output.`
      : `No language-model key is configured, so narrative chapters were drafted from Drafter's deterministic templates. Factual chapters are unaffected — they are always built directly from issuer data.`,
    stats,
  };
}
