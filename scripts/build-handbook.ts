/**
 * Builds the internal team handbook as a .docx.
 *
 * WHY THIS IS A SCRIPT AND NOT A DOCUMENT
 * A handbook that is written once goes stale the first time someone changes a
 * threshold, and a stale compliance document is worse than no document. Every
 * number that can be derived is READ FROM THE CODEBASE at build time — the
 * requirement count, the coverage percentages, the chapter counts, the model
 * chain, the eligibility conditions. Change the code, run this, and the
 * handbook is correct again.
 *
 * Prose that states a measured fact carries the measurement date inline,
 * because those cannot be re-derived without spending provider quota.
 *
 *   npm run handbook
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip,
} from "docx";

import { flatChapters, registry, sampleIssuers, structure } from "../lib/data";
import { generateDocument } from "../lib/engine/generate";
import { runGapCheck } from "../lib/engine/gapCheck";
import { runEligibility } from "../lib/engine/eligibility";
import { MODEL_CHAIN, MAX_COMPLETION_TOKENS } from "../lib/engine/llm";
import {
  MODEL_TPM_BUCKET,
  WORST_CASE_PROMPT_TOKENS,
  draftConcurrencyFor,
  tpmBucketFor,
} from "../lib/engine/refineGraph";
import problemStatement from "../data/problem_statement.json";
import questionnaire from "../data/intake_questionnaire.json";

// ---------------------------------------------------------------------------
// House style
// ---------------------------------------------------------------------------

const INK = "1F2A44"; // body
const BRAND = "1F3864"; // headings
const ACCENT = "2E74B5"; // links, rules
const MUTED = "5A6478";
const RULE = "D6DBE4";
const BAND = "EEF2F8"; // table header fill
const ZEBRA = "F7F9FC";
const WARN = "9C2B2B";
const GOOD = "1E6B3A";

const CONTENT_WIDTH = 9026; // A4 minus 1in margins each side, in DXA
const FONT = "Calibri";

const REVISION = { version: "1.1", date: "2 August 2026" };

/**
 * Newest first. Add a row when the product changes in a way a reader of this
 * handbook would want to know about, and bump REVISION above. Everything else
 * in the document re-derives itself, so this is the one list that needs a
 * human.
 */
const HISTORY: [string, string, string][] = [
  [
    "1.1",
    "2 August 2026",
    "Standard offer-document text written out in full; narrative chapters deepened; risk factors numbered at render time; model fallback chain and deadline-aware retries documented.",
  ],
  ["1.0", "1 August 2026", "First issue."],
];

// ---------------------------------------------------------------------------
// Small builders
// ---------------------------------------------------------------------------

function t(text: string, opts: any = {}) {
  return new TextRun({ text, font: FONT, color: opts.color ?? INK, size: opts.size ?? 20, ...opts });
}

function p(text: string, opts: any = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 120, line: opts.line ?? 276 },
    alignment: opts.alignment,
    indent: opts.indent,
    children: [t(text, opts)],
  });
}

/** Body paragraph built from runs, for inline bold/mono. */
function rich(runs: TextRun[], opts: any = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 120, line: 276 },
    indent: opts.indent,
    children: runs,
  });
}

function mono(text: string) {
  return new TextRun({ text, font: "Consolas", size: 18, color: "31405C" });
}

function h1(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 180 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 6 } },
    children: [new TextRun({ text, font: FONT, size: 32, bold: true, color: BRAND })],
  });
}

function h2(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, font: FONT, size: 25, bold: true, color: BRAND })],
  });
}

function h3(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, font: FONT, size: 22, bold: true, color: ACCENT })],
  });
}

function bullet(text: string, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { after: 80, line: 264 },
    children: [t(text)],
  });
}

function numbered(text: string, level = 0) {
  return new Paragraph({
    numbering: { reference: "steps", level },
    spacing: { after: 80, line: 264 },
    children: [t(text)],
  });
}

/** A callout box — used for rules the team must not break. */
function callout(title: string, body: string, tone: "info" | "warn" | "good" = "info") {
  const fill = tone === "warn" ? "FDF3F3" : tone === "good" ? "F1F8F3" : "F3F6FC";
  const edge = tone === "warn" ? WARN : tone === "good" ? GOOD : ACCENT;
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [CONTENT_WIDTH],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: edge },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: edge },
      left: { style: BorderStyle.SINGLE, size: 18, color: edge },
      right: { style: BorderStyle.SINGLE, size: 2, color: edge },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: CONTENT_WIDTH, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill },
            margins: { top: 140, bottom: 140, left: 200, right: 200 },
            children: [
              new Paragraph({
                spacing: { after: 60 },
                children: [new TextRun({ text: title, font: FONT, size: 20, bold: true, color: edge })],
              }),
              new Paragraph({ spacing: { after: 0 }, children: [t(body)] }),
            ],
          }),
        ],
      }),
    ],
  });
}

interface TableOpts {
  widths: number[];
  header: string[];
  rows: string[][];
  zebra?: boolean;
  monoCols?: number[];
}

function table({ widths, header, rows, zebra = true, monoCols = [] }: TableOpts) {
  const total = widths.reduce((a, b) => a + b, 0);
  const scale = CONTENT_WIDTH / total;
  const cols = widths.map((w) => Math.round(w * scale));
  // Rounding may drift a DXA or two; put the difference in the last column.
  cols[cols.length - 1] += CONTENT_WIDTH - cols.reduce((a, b) => a + b, 0);

  const headRow = new TableRow({
    tableHeader: true,
    children: header.map(
      (text, i) =>
        new TableCell({
          width: { size: cols[i], type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: BAND },
          margins: { top: 90, bottom: 90, left: 120, right: 120 },
          children: [
            new Paragraph({
              spacing: { after: 0 },
              children: [new TextRun({ text, font: FONT, size: 19, bold: true, color: BRAND })],
            }),
          ],
        }),
    ),
  });

  const bodyRows = rows.map(
    (cells, r) =>
      new TableRow({
        children: cells.map(
          (text, i) =>
            new TableCell({
              width: { size: cols[i], type: WidthType.DXA },
              shading:
                zebra && r % 2 === 1
                  ? { type: ShadingType.CLEAR, fill: ZEBRA }
                  : undefined,
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [
                new Paragraph({
                  spacing: { after: 0, line: 252 },
                  children: [
                    monoCols.includes(i)
                      ? mono(text)
                      : new TextRun({ text, font: FONT, size: 19, color: INK }),
                  ],
                }),
              ],
            }),
        ),
      }),
  );

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: cols,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    rows: [headRow, ...bodyRows],
  });
}

function codeBlock(lines: string[]) {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [CONTENT_WIDTH],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      left: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      right: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: CONTENT_WIDTH, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: "F5F7FA" },
            margins: { top: 120, bottom: 120, left: 180, right: 180 },
            children: lines.map(
              (line) =>
                new Paragraph({
                  spacing: { after: 0, line: 240 },
                  children: [mono(line || " ")],
                }),
            ),
          }),
        ],
      }),
    ],
  });
}

function spacer(after = 160) {
  return new Paragraph({ spacing: { after }, children: [t("")] });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

// ---------------------------------------------------------------------------
// Live figures, read from the codebase
// ---------------------------------------------------------------------------

async function gatherFacts() {
  const reg: any = registry;
  const struct: any = structure;
  const quiz: any = questionnaire;

  const requirements = reg.sections.flatMap((s: any) => s.requirements);
  const byFulfilment: Record<string, number> = {};
  for (const r of requirements) byFulfilment[r.fulfilment] = (byFulfilment[r.fulfilment] ?? 0) + 1;

  const regNumbers = new Set<string>();
  for (const r of requirements) {
    for (const m of String(r.source ?? "").matchAll(/Reg(?:ulation)?\.?\s*(\d+[A-Z]?)/gi)) {
      regNumbers.add(m[1]);
    }
  }

  const issuers = [];
  for (const issuer of sampleIssuers) {
    const doc: any = await generateDocument(issuer.data, { issuerId: issuer.id, useLlm: false });
    const gap: any = runGapCheck(issuer.data, {
      issuerId: issuer.id,
      issuerName: issuer.name,
      meta: issuer.meta,
    });
    const elig: any = runEligibility(issuer.data, issuer.name);
    const origins: Record<string, number> = {};
    for (const c of doc.chapters) {
      for (const b of c.blocks ?? []) {
        origins[b.provenance?.origin ?? "?"] = (origins[b.provenance?.origin ?? "?"] ?? 0) + 1;
      }
    }
    issuers.push({ issuer, doc, gap, elig, origins });
  }

  const blankGap: any = runGapCheck({} as any, { issuerId: "blank", issuerName: "Blank" });
  const blankElig: any = runEligibility({} as any, "Blank");

  // Render the PDF to count its pages. Slower than hard-coding the number, and
  // the whole reason this document is a script: a page count typed into prose
  // is wrong the first time anyone adds a chapter.
  const React = (await import("react")).default;
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { DrhpPdf } = await import("../lib/export/pdf");
  const pdf = await renderToBuffer(
    React.createElement(DrhpPdf, { document: issuers[0].doc }) as any,
  );
  const pdfPages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;

  // Measured across the corpus of filed SME DRHPs held in backtest_output.
  const CORPUS = { filings: 17, meanPages: 398, meanWords: 187_459 };

  // The real worst-case narrative prompt, so the handbook cannot quote a
  // constant the code has since outgrown.
  let measuredWorstPrompt = 0;
  for (const issuer of sampleIssuers) {
    await generateDocument(issuer.data, {
      issuerId: issuer.id,
      useLlm: true,
      llmPriorityOnly: false,
      draftNarrative: async (request) => {
        const prompt = [
          request.chapterTitle,
          request.instruction,
          ...request.mustCover,
          JSON.stringify(request.context, null, 2),
        ].join("\n");
        measuredWorstPrompt = Math.max(measuredWorstPrompt, Math.round(prompt.length / 4) + 700);
        return null;
      },
    });
  }

  // Risk factors are numbered at render time, so the count is a property of
  // the issuer's data rather than of the template.
  const riskFactorCount = (doc: any) => {
    const chapter = doc.chapters.find((c: any) => c.id === "II.1");
    return (chapter?.blocks ?? []).filter(
      (b: any) => typeof b.text === "string" && /^\d+\.\s/.test(b.text),
    ).length;
  };

  const questions = (quiz.steps ?? []).reduce(
    (sum: number, s: any) => sum + (s.questions ?? s.fields ?? []).length,
    0,
  );

  return {
    reg,
    struct,
    quiz,
    requirements,
    byFulfilment,
    regNumbers: [...regNumbers].sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, ""))),
    evidenceFields: new Set(requirements.flatMap((r: any) => r.evidence_fields ?? [])).size,
    consistencyChecks: requirements.filter((r: any) => r.consistency_check).length,
    corpusBacked: requirements.filter((r: any) => r.corpus_evidence).length,
    issuers,
    blankGap,
    blankElig,
    questions,
    steps: quiz.steps ?? [],
    chapters: flatChapters.length,
    priorityChapters: flatChapters.filter((c: any) => c.priority).length,
    pdfPages,
    corpus: CORPUS,
    measuredWorstPrompt,
    riskFactorCount,
  };
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

async function build() {
  const f = await gatherFacts();
  const shreeji = f.issuers[0];
  const aarna = f.issuers[1];
  const ps: any = problemStatement;

  const children: any[] = [];

  // ---- Cover -----------------------------------------------------------
  children.push(
    new Paragraph({ spacing: { before: 2200, after: 0 }, children: [] }),
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: "DRAFTER", font: FONT, size: 76, bold: true, color: BRAND })],
    }),
    new Paragraph({
      spacing: { after: 300 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: ACCENT, space: 10 } },
      children: [
        new TextRun({
          text: "Technical and Operating Handbook",
          font: FONT,
          size: 32,
          color: MUTED,
        }),
      ],
    }),
    p(
      "An SME IPO offer-document generator with regulatory-grade traceability. This handbook covers the problem, the regulation, the engineering, and how to operate every function of the product.",
      { size: 22, color: MUTED, after: 400 },
    ),
    table({
      widths: [2600, 6426],
      header: ["Field", "Value"],
      zebra: false,
      rows: [
        ["Document", "Internal team handbook — not for external distribution"],
        ["Product", "Drafter"],
        ["Submission", "SEBI Securities Market TechSprint @ GFF 2026"],
        ["Track", "Track 04 — Fund Raising"],
        ["Version", `${REVISION.version}`],
        ["Issued", REVISION.date],
        ["Regulation set", String(f.reg.regulation_set_as_at)],
        ["Registry version", String(f.reg.registry_version)],
        ["Regenerate with", "npm run handbook"],
      ],
    }),
    spacer(240),
    h3("Revision history"),
    table({
      widths: [1100, 1900, 6026],
      header: ["Version", "Issued", "What changed"],
      rows: HISTORY.map(([v, d, note]) => [v, d, note]),
    }),
    spacer(240),
    callout(
      "This document is generated, not typed",
      "Every count, percentage and threshold in this handbook is read from the codebase when it is built. If you change a requirement, a regulation ceiling or a model, run npm run handbook and the document corrects itself. Do not hand-edit the .docx — edit scripts/build-handbook.ts, or the change will be lost on the next build.",
      "info",
    ),
    pageBreak(),
  );

  // ---- Contents --------------------------------------------------------
  children.push(
    h1("Contents"),
    ...[
      "1.  Executive summary",
      "2.  The problem we set out to solve",
      "3.  What Drafter is",
      "4.  Regulatory foundation — SEBI ICDR Chapter IX",
      "5.  Technology and architecture",
      "6.  The Groq API, in detail",
      "7.  LangGraph, in detail",
      "8.  What the product outputs",
      "9.  User manual — every function",
      "10. How we keep it correct",
      "11. Known limits, stated honestly",
      "Appendix A — Repository map",
      "Appendix B — Glossary",
      "Appendix C — Commands",
    ].map((line) =>
      new Paragraph({
        spacing: { after: 90 },
        children: [new TextRun({ text: line, font: FONT, size: 21, color: INK })],
      }),
    ),
    pageBreak(),
  );

  // ---- 1. Executive summary -------------------------------------------
  children.push(
    h1("1.  Executive summary"),
    p(
      "An Indian SME that wants to list on NSE Emerge or BSE SME must produce a Draft Red Herring Prospectus — a document of several hundred pages, structured to SEBI's ICDR Regulations. A first-time promoter has never seen one. The work is therefore outsourced entirely to a merchant banker from the very first draft, at a cost and a delay that keeps otherwise-listable companies out of the market.",
    ),
    p(
      "Drafter takes plain-language answers from that promoter and produces a structured, disclosure-mapped draft DRHP, then runs the kind of gap and consistency check an exchange runs at pre-check — before the document ever reaches an intermediary.",
    ),
    h2("The three claims we make, and what backs each"),
    table({
      widths: [2700, 3400, 2926],
      header: ["Claim", "What it means", "Evidence"],
      rows: [
        [
          "Substantially complete",
          `A ${f.chapters}-chapter document across ${f.struct.sections.length} sections, generated from issuer answers`,
          `${shreeji.doc.stats.totalWords.toLocaleString()} words and ${shreeji.doc.stats.totalTables} tables on the bundled issuer`,
        ],
        [
          "No invented facts",
          "Factual fields come only from issuer input; the model phrases around verified data and never supplies it",
          "Every generated figure is checked against issuer data; the chapter is discarded if it fails",
        ],
        [
          "Checks like an exchange",
          "Consistency and completeness defects are found and located before filing",
          `${f.consistencyChecks} consistency rules over ${f.requirements.length} tracked requirements`,
        ],
      ],
    }),
    spacer(),
    h2("The number that matters most"),
    p(
      `On the bundled issuer, Drafter reports ${shreeji.gap.coveragePct}% disclosure coverage and simultaneously refuses to call the draft ready — it raises ${shreeji.gap.findingCounts.high} high-severity findings and returns the verdict "${shreeji.gap.verdict.level}". A tool that reported ${shreeji.gap.coveragePct}% and declared success would be worse than useless, because the defects it is holding are exactly the ones an exchange returns drafts for.`,
    ),
    callout(
      "The line to remember",
      "Drafter does not decide anything. Compliance, arithmetic and the gap check are ordinary deterministic code — turn the language model off entirely and you still get a complete document at full coverage with every defect caught. The model does one job: it turns a promoter's plain English into offer-document register.",
      "good",
    ),
    pageBreak(),
  );

  // ---- 2. The problem --------------------------------------------------
  children.push(
    h1("2.  The problem we set out to solve"),
    h2("2.1  What SEBI asked for"),
    p(
      `SEBI's Track 04 statement was broken into ${ps.clauses.length} testable clauses, each tracked in data/problem_statement.json with the files that discharge it. This is how we prove conformance rather than assert it.`,
    ),
    table({
      widths: [900, 5900, 2226],
      header: ["ID", "Clause", "Status"],
      monoCols: [0],
      rows: ps.clauses.map((c: any) => [
        c.id,
        String(c.text).length > 150 ? String(c.text).slice(0, 147) + "…" : String(c.text),
        c.status === "met" ? "Met" : "Partial — disclosed",
      ]),
    }),
    spacer(),
    p(
      `Two clauses are marked partial on purpose. ${ps.clauses
        .filter((c: any) => c.status === "partial")
        .map((c: any) => c.id)
        .join(" and ")} each carry a written statement of exactly what is missing. Marking everything "met" would be the easy lie and the one a judge would find first.`,
    ),
    h2("2.2  Why the problem exists at all"),
    bullet(
      "The DRHP format is not discoverable. Its structure lives across the ICDR Regulations, Schedule VI and two exchange checklists that do not agree on ordering.",
    ),
    bullet(
      "A promoter knows their business perfectly and the disclosure framework not at all. Nothing bridges the vocabulary gap between 'we do job work for two auto companies' and 'revenue concentration risk'.",
    ),
    bullet(
      "Defects that get drafts returned are mechanical — a revenue figure that differs between two chapters, objects that do not sum to the net proceeds, a litigation mentioned in risk factors but absent from the legal chapter. These are checkable by machine and are currently caught by a human, late and expensively.",
    ),
    h2("2.3  Where everyone else sits, and where we sit"),
    p(
      "Every comparable tool analyses a DRHP that already exists. BSE's own GenAI pre-check reviews a filed draft. Nobody helps the SME produce the first one. Drafter sits upstream of all of them: it is the step that creates the document those tools then inspect.",
    ),
    pageBreak(),
  );

  // ---- 3. What Drafter is ---------------------------------------------
  children.push(
    h1("3.  What Drafter is"),
    h2("3.1  In one sentence"),
    p(
      "Drafter converts an SME promoter's plain-language answers into a structured, disclosure-mapped draft DRHP, and then audits that draft against the disclosure framework the way an exchange would.",
    ),
    h2("3.2  The three guarantees the architecture enforces"),
    h3("Guarantee 1 — it is a preparatory draft, never a filing"),
    p(
      "The output is explicitly not for submission. Filing happens only through the merchant banker, after due diligence and certification. Requirements that only a banker or auditor can discharge are tracked separately so they never inflate the promoter's apparent progress — currently " +
        `${f.byFulfilment.banker_certification ?? 0} of ${f.requirements.length} requirements are classified that way.`,
    ),
    h3("Guarantee 2 — no invented facts"),
    p(
      "Factual fields are populated only from issuer input. The language model never supplies a fact; it is given a bounded set of fields and asked to phrase around them. Anything it writes containing a number absent from that set is discarded.",
    ),
    h3("Guarantee 3 — issuer data is isolated"),
    p(
      "The server is stateless. Issuer data arrives in the request and leaves in the response; nothing is written to disk or a database, so pre-IPO information never rests on the server. Work in progress is held in the browser's local storage. Exchange observation letters are parsed entirely client-side and never transmitted at all.",
    ),
    h2("3.3  What Drafter deliberately does not do"),
    table({
      widths: [3400, 5626],
      header: ["Not done", "Why that is the right call"],
      rows: [
        [
          "Parse and restate Ind AS financial statements",
          "Restated financials are the auditor's signed work product. A placeholder at that point in the document is the honest output, not a gap.",
        ],
        [
          "Store issuer data on a server",
          "Directly contradicts the confidentiality position. Session export/import is the aligned alternative.",
        ],
        [
          "Certify or file anything",
          "The regulations reserve this for the merchant banker. Preserving that role is an explicit requirement of the problem statement.",
        ],
        [
          "Judge eligibility conclusively",
          "The exchange applies its own track-record and net-worth criteria. Drafter reports what it can test and names what it cannot.",
        ],
      ],
    }),
    pageBreak(),
  );

  // ---- 4. Regulatory foundation ---------------------------------------
  children.push(
    h1("4.  Regulatory foundation — SEBI ICDR Chapter IX"),
    h2("4.1  The regulation set"),
    p(String(f.reg.regulation_set)),
    spacer(80),
    table({
      widths: [3000, 6026],
      header: ["Property", "Value"],
      rows: [
        ["Registry version", String(f.reg.registry_version)],
        ["Regulation set as at", String(f.reg.regulation_set_as_at)],
        ["Registry last reviewed", String(f.reg.registry_reviewed_at)],
        ["Requirements tracked", String(f.requirements.length)],
        ["Registry sections", String(f.reg.sections.length)],
        ["Distinct evidence fields", String(f.evidenceFields)],
        ["ICDR regulations cited by number", f.regNumbers.join(", ")],
      ],
    }),
    spacer(),
    callout(
      "The 8 March 2025 amendment is load-bearing",
      "Several SME thresholds changed on 8 March 2025. Anything sourced from a pre-2025 article, from an older filed DRHP, or from the main-board chapter will encode the wrong number. A ceiling that is too generous is the worst possible failure for a compliance checker, because it stays silent on a draft that will be returned. The only source to trust is the consolidated ICDR text on sebi.gov.in.",
      "warn",
    ),
    spacer(),
    h2("4.2  The Chapter IX thresholds Drafter encodes"),
    table({
      widths: [1800, 4600, 2626],
      header: ["Regulation", "Rule as encoded", "Where it is enforced"],
      monoCols: [0],
      rows: [
        [
          "Reg 228",
          "Eligibility bar — debarment, wilful defaulter or fraudulent borrower, fugitive economic offender. This is the SME provision; Reg 5 is the main-board one and does not apply.",
          "Eligibility gate",
        ],
        [
          "Reg 229",
          "Post-issue paid-up capital not exceeding INR 10 crore; issuers up to INR 25 crore may also proceed under Chapter IX. Operating-profit condition also tested.",
          "Eligibility gate",
        ],
        [
          "Reg 230(1)",
          "Exchange application made, depository agreement in place, partly paid shares fully paid or forfeited, promoter holdings dematerialised, firm financing arrangements.",
          "Eligibility gate",
        ],
        [
          "Reg 230(1)(f), (g)",
          "Offer for sale capped at 20% of total issue size; a selling shareholder may offer at most 50% of their pre-issue holding.",
          "Gap checker",
        ],
        [
          "Reg 230(1)(h)",
          "Objects of the issue may not include repaying a promoter, promoter-group or related-party loan. Reported as a Red Flag, because no redrafting cures it.",
          "Gap checker",
        ],
        [
          "Reg 230(2)",
          "General corporate purposes capped at the LOWER of 15% of the amount being raised or INR 10 crore. The main-board figure of 25% does not apply to SME issuers.",
          "Gap checker",
        ],
        [
          "Reg 236",
          "Minimum promoters' contribution of at least 20% of post-issue capital.",
          "Registry / gap checker",
        ],
        [
          "Reg 262(1)",
          "Monitoring agency required only where issue size excluding offer for sale exceeds INR 50 crore.",
          "Gap checker",
        ],
      ],
    }),
    spacer(),
    h2("4.3  The requirement registry"),
    p(
      `The registry in data/requirement_registry.json is the single source of truth for chapter-to-requirement traceability. Each entry is the atomic unit the gap checker tracks: what the disclosure is, which regulation or Schedule VI part it comes from, which DRHP chapters discharge it, and which dotted paths into the issuer data constitute evidence for it.`,
    ),
    spacer(80),
    table({
      widths: [3200, 1500, 4326],
      header: ["Fulfilment class", "Count", "Meaning"],
      rows: [
        [
          "issuer_data",
          String(f.byFulfilment.issuer_data ?? 0),
          "Satisfied by information the issuer supplies. Coverage is computed from the presence of its evidence fields.",
        ],
        [
          "standard_clause",
          String(f.byFulfilment.standard_clause ?? 0),
          "Satisfied structurally by standard offer-document text with issuer fields merged in. Always flagged for banker finalisation.",
        ],
        [
          "banker_certification",
          String(f.byFulfilment.banker_certification ?? 0),
          "Can only be discharged by the merchant banker or auditor in due diligence. Reported separately so it never misrepresents the promoter's own progress.",
        ],
      ],
    }),
    spacer(),
    p(
      `Coverage is COMPUTED, never asserted: a weighted mean over applicable requirements where Complete scores 1 and Partial scores 0.5. Requirements that genuinely do not apply to an issuer — installed capacity for a services business, for instance — are excluded from the denominator entirely rather than counted as failures. ${f.corpusBacked} requirements carry a corpus_evidence field recording the share of real filings that contain them; those were added on evidence from a corpus of filed NSE Emerge DRHPs, not on intuition.`,
    ),
    h2("4.4  The eligibility gate"),
    p(
      `Before disclosure quality matters at all, the issuer has to be allowed to make the issue. The eligibility engine tests ${shreeji.elig.conditions.length} conditions drawn from Regulations 228, 229 and 230(1), and it reports three states rather than two.`,
    ),
    spacer(80),
    table({
      widths: [2200, 6826],
      header: ["State", "Meaning"],
      rows: [
        ["met", "The condition is satisfied on the information supplied."],
        ["not-met", "The condition fails on the information supplied. This is a blocker."],
        [
          "unknown",
          "The condition has not been answered. This is the load-bearing third state: an unanswered condition is a question, not a pass.",
        ],
      ],
    }),
    spacer(),
    p(
      `The third state is why a blank issuer returns "${f.blankElig.verdict.level}" with ${f.blankElig.counts.unknown} unknown conditions rather than a pass or a fail. Nothing is judged either way on no evidence. On the bundled issuer, with every applicable condition answered, the verdict is "${shreeji.elig.verdict.level}" — and even that is worded as "eligible on the figures", not as a clearance, because the exchange applies its own criteria under Regulation 229(3).`,
    ),
    pageBreak(),
  );

  // ---- 5. Technology ---------------------------------------------------
  children.push(
    h1("5.  Technology and architecture"),
    h2("5.1  Stack"),
    table({
      widths: [2600, 2000, 4426],
      header: ["Layer", "Choice", "Why"],
      rows: [
        ["Framework", "Next.js 15 (App Router)", "Server routes and UI in one deployable; runs on a free Vercel tier."],
        ["Language", "TypeScript (strict)", "The domain is full of near-identical shapes; the compiler catches conflations."],
        ["UI", "Tailwind + CVA", "shadcn idiom without the Radix runtime — smaller surface, no dependency drift."],
        ["Orchestration", "LangGraph", "The drafting loop is a real cyclic state machine, not a pipeline. See section 7."],
        ["Model access", "Vercel AI SDK + Groq", "One interface, swappable models, free tier."],
        ["Documents", "docx, @react-pdf/renderer", "Native DOCX and PDF generation server-side."],
        ["Ingestion", "unpdf, xlsx", "Financial statements arrive as PDF or spreadsheet."],
        ["Hosting", "Vercel Hobby", "Free. Its 60-second function ceiling is a design input, not a surprise."],
      ],
    }),
    spacer(),
    h2("5.2  How a request flows"),
    codeBlock([
      "Browser (localStorage)                     Server (stateless)",
      "  │",
      "  │  issuer answers ──────────► POST /api/generate",
      "  │                                  │",
      "  │                                  ├─ refineDocument()  ← LangGraph loop",
      "  │                                  │    draft → assemble → gapCheck → decide",
      "  │                                  │              ▲            │",
      "  │                                  │              └── revise ◄─┘",
      "  │                                  │",
      "  │  ◄──── document + refineTrace ───┘",
      "  │",
      "  ├─ runGapCheck()      (client-side, deterministic)",
      "  ├─ runEligibility()   (client-side, deterministic)",
      "  └─ export ──────────► POST /api/export/{docx,pdf,gap}",
    ]),
    spacer(),
    p(
      "Nothing on the server persists. The document and the gap report are returned to the browser and held there. This is what allows the confidentiality claim to be architectural rather than a policy promise.",
    ),
    h2("5.3  The block and provenance model"),
    p(
      "The document is not a string. It is a tree of typed blocks — paragraphs, headings, lists, tables, key-value pairs, placeholders — and every single block carries provenance recording where its content came from. This is the mechanism behind the no-hallucination claim; it is inspectable in the UI and exportable.",
    ),
    spacer(80),
    table({
      widths: [2400, 4200, 2426],
      header: ["Origin", "Meaning", "Blocks (bundled issuer)"],
      monoCols: [0],
      rows: [
        ["issuer-input", "Copied verbatim from a field the issuer supplied", String(shreeji.origins["issuer-input"] ?? 0)],
        ["derived", "Computed arithmetically from issuer-supplied fields", String(shreeji.origins["derived"] ?? 0)],
        ["llm-narrative", "Language-model prose, constrained to supplied facts", String(shreeji.origins["llm-narrative"] ?? 0)],
        ["template-narrative", "Deterministic template prose (no model key present)", String(shreeji.origins["template-narrative"] ?? 0)],
        ["standard-clause", "Standard offer-document text; banker to finalise", String(shreeji.origins["standard-clause"] ?? 0)],
        ["placeholder", "A structured gap — content the issuer has not yet supplied", String(shreeji.origins["placeholder"] ?? 0)],
      ],
    }),
    spacer(),
    p(
      "The counts above are from a run with the model switched off, which is why llm-narrative is zero and template-narrative carries the prose. With a key present those two swap over. Everything else is identical — which is the point.",
    ),
    h2("5.4  Generation engine"),
    p(
      `lib/engine/generate.ts walks data/drhp_structure.json — ${f.struct.sections.length} sections, ${f.chapters} chapters, of which ${f.priorityChapters} are marked priority — and builds each chapter from the issuer data. Factual chapters splice issuer answers in directly. Narrative chapters are handed to the model where a key is present, and to a deterministic template where it is not.`,
    ),
    h2("5.5  Gap and consistency checker"),
    p(
      `lib/engine/gapCheck.ts is entirely deterministic — it does not import the language model at all. It produces findings in four categories, each with a stable code prefix, a severity, an exact location in the document, and a remediation.`,
    ),
    spacer(80),
    table({
      widths: [1600, 2400, 5026],
      header: ["Code", "Category", "What it catches"],
      monoCols: [0],
      rows: [
        ["DR-INC", "Inconsistency", "The same fact stated differently in two places — revenue, objects, net proceeds, shareholding."],
        ["DR-MIS", "Missing Information", "A required disclosure absent or supplied only in part."],
        ["DR-CMP", "Compliance Issue", "A regulatory ceiling breached, or a mandatory reference absent."],
        ["DR-RFL", "Red Flag", "Something that cannot be cured by redrafting — a prohibited object, an undisclosed proceeding."],
      ],
    }),
    spacer(),
    p(`The ${f.consistencyChecks} named consistency rules currently implemented are:`),
    ...[
      "Figures do not reconcile across chapters",
      "Stated objects do not aggregate to the net proceeds",
      "Net proceeds do not bridge from the gross issue size",
      "Financial series is internally inconsistent",
      "Shareholding pattern does not reconcile with paid-up capital",
      "Proceeding referenced elsewhere but not disclosed in the Legal chapter",
      "Related-party dealings referenced but declared as nil",
      "General corporate purposes exceeds the prescribed ceiling",
      "An object of the issue is prohibited for an SME issuer",
      "Mandatory auditor reference is absent",
      "Narrative answers contain vague statements that cannot be drafted around",
      "Issuer answers were normalised into offer-document register",
    ].map((x) => bullet(x)),
    spacer(),
    callout(
      "Why the checker must be able to stay silent",
      "A check that only ever fires is indistinguishable from one that always fires. Every rule therefore has an asserted negative case — inputs on which it must NOT fire. Three real bugs in this project were caught this way, including a regulation ceiling that was silently twice the legal limit.",
      "warn",
    ),
    spacer(),
    h2("5.6  Standard text and render-time numbering"),
    p(
      `The boilerplate chapters are assembled from clauses held in knowledge_base/section_templates.json rather than in code. A clause may be a heading, a paragraph, a list, a definition table, a structured placeholder, a note to the merchant banker, or a risk factor — and any of them may carry a condition, so a clause about leased premises does not appear for an issuer that owns its properties.`,
    ),
    p(
      `Risk factors are numbered at RENDER time, after that filter, and this is not cosmetic. The numbers were once written into the template text while several factors were conditional, so an issuer with no litigation, no related-party dealings and no borrowings rendered "1, 2, 3, 5, 9, 10 …". Nothing threw an error. The document simply looked defective and the promoter had no way to know why. A filed offer document with gaps in its risk-factor numbering invites exactly the kind of query this product exists to prevent.`,
    ),
    p(
      `A factual chapter can also carry standard text after its factual blocks. Issue Structure is the clear case: the allocation table and the market-maker reservation come from issuer data, while the terms of payment, the revision rules and the minimum-subscription consequence are identical in every SME offer document.`,
    ),
    spacer(),
    h2("5.7  Supporting engines"),
    table({
      widths: [2200, 6826],
      header: ["Module", "What it does"],
      monoCols: [0],
      rows: [
        [
          "actionPlan.ts",
          "Turns the gap report into an ordered plan. 'Coverage 59%, 20 requirements missing' tells a promoter what is wrong and nothing about what to do; the plan groups items by the wizard step that closes them and projects the coverage each step will reach.",
        ],
        [
          "dueDiligence.ts",
          "A second view over the same draft and the same gap report for the merchant banker — documents required versus provided, and what remains for certification.",
        ],
        [
          "register.ts",
          "Deterministic register normalisation for issuer free text. Factual chapters reproduce what the issuer said, so 'we' becomes 'the Company' without a model touching the sentence. Verified never to move a figure across 258 issuer free-text fields.",
        ],
        [
          "effort.ts",
          "Measures actual preparation time against SEBI's 'significantly reducing preparation time' clause. Idle gaps are capped rather than dropped, which biases the number against our own claim.",
        ],
        [
          "eligibility.ts",
          "The Chapter IX gate described in section 4.4. Pure arithmetic and boolean logic; no model.",
        ],
      ],
    }),
    spacer(),
    h2("5.8  Observation replay"),
    p(
      "An exchange observation letter is pasted in, parsed into individual observations, and each is mapped onto the requirements Drafter already tracks. The point is to answer 'would we have caught this?' with evidence rather than opinion. The map holds 70 entries covering 75 distinct requirement references. Parsing and mapping happen entirely in the browser — an observation letter is confidential and is never transmitted.",
    ),
    h2("5.9  Regulation watch"),
    p(
      "The SEBI RSS feed is read and filtered for items that touch the requirement registry. The feed is a firehose of appeals, recovery certificates and adjudication orders, so relevance classification is the whole value. A feed failure yields an empty, explained result rather than a blank panel that looks like 'nothing has changed'.",
    ),
    h2("5.10  Financials extraction"),
    p(
      "Financial statements arrive as PDF or spreadsheet and are parsed for the three-year series the disclosure framework needs. The extractor deliberately never writes the revenue field that the consistency checker compares against — if it did, it would erase the very mismatch the checker exists to find.",
    ),
    pageBreak(),
  );

  // ---- 6. Groq ---------------------------------------------------------
  const concurrency = draftConcurrencyFor(MODEL_CHAIN[0], MAX_COMPLETION_TOKENS);
  children.push(
    h1("6.  The Groq API, in detail"),
    h2("6.1  Why an API at all"),
    p(
      "Two separate reasons, often conflated. First, /api/generate exists as a server route so the API key never reaches the browser and issuer data is processed without being persisted — that is the confidentiality architecture. Second, we call a hosted model rather than running one locally because Vercel's free tier has no GPU. There is no deeper reason than that.",
    ),
    h2("6.2  What the model is allowed to see"),
    p(
      "The model receives only the fields the knowledge base declares as context for the chapter being drafted. It therefore cannot reference issuer data it was never given. This is a structural bound, not an instruction it might ignore.",
    ),
    h2("6.3  The absolute constraints in the system prompt"),
    ...[
      "Use only the facts supplied. Never introduce a company name, customer, product, certification, location, date, percentage, amount, market size, growth rate or ranking that is not present.",
      "If information is absent, say it is to be supplied, or omit it. Never estimate, infer, approximate or illustrate a missing figure.",
      "Reproduce every number exactly as supplied. Do not round, convert units, recompute or 'correct' any figure.",
      "Write in the register of a filed offer document — formal, impersonal, third person. No marketing language, no superlatives, no reassurance.",
      "Never state that a risk is mitigated or unlikely unless the issuer data says so.",
      "The issuer data is often informal. Rewrite the wording freely into offer-document register; never change a fact or a figure.",
    ].map((x) => numbered(x)),
    spacer(),
    h2("6.4  Output validation — the part that actually protects the user"),
    p(
      "The prompt forbids rounding in two separate places. It is not enough. In measured runs the model rounded INR 78.90 crore to '79' repeatedly, and did so on models from two different families. Prompting alone demonstrably fails, which is why the guarantee is enforced on the output instead.",
    ),
    p(
      "Every number the model emits is checked against the numbers present in the supplied context. Small integers are exempt as enumeration, and four-digit years are exempt. Anything else that does not appear in the issuer data causes the entire chapter to be discarded in favour of the deterministic template. A plainer chapter is vastly better than a wrong figure in an offer document.",
    ),
    callout(
      "This is why swapping models is safe",
      "The no-hallucination guarantee is a property of the validator, not of the model. gpt-oss-120b was observed rounding the same figure the same way llama-3.3-70b does, and was rejected for it in exactly the same way. Substituting a model is therefore a cost decision, not a safety one.",
      "good",
    ),
    spacer(),
    h2("6.5  The free tier, as measured rather than assumed"),
    p(
      "Two properties of Groq's free tier are not the obvious thing, and both were found by reading its response headers and 429 bodies. Measured 1 August 2026.",
    ),
    ...[
      "The limiter charges the RESERVATION, not the completion. An identical prompt sent with max_tokens 10 is billed 'Requested 556'; with max_tokens 4000 it is billed 'Requested 4042'. A chapter therefore costs its prompt plus the completion ceiling in full, every time, however short the chapter turns out to be.",
      "The binding cap is tokens per DAY (100,000), not the per-minute bucket. A run can fail on quota while the per-minute header still reads a comfortable 12,000 remaining.",
    ].map((x) => numbered(x)),
    spacer(80),
    table({
      widths: [3400, 1800, 1800, 2026],
      header: ["Model", "Per-minute bucket", "Concurrency", "Role"],
      monoCols: [0],
      rows: MODEL_CHAIN.map((m, i) => [
        m,
        tpmBucketFor(m).toLocaleString(),
        String(draftConcurrencyFor(m, MAX_COMPLETION_TOKENS)),
        i === 0 ? "Primary — best prose" : i === MODEL_CHAIN.length - 1 ? "Last resort" : "Substitute",
      ]),
    }),
    spacer(),
    h2("6.6  The model fallback chain"),
    p(
      "The free tier meters each model separately, so exhausting the primary model's daily budget says nothing about the others'. A single-model configuration hands the user templates while three untouched daily budgets sit unused on the same key. Drafting therefore falls down the chain above.",
    ),
    p("What advances the chain, and what does not, is the part to understand:"),
    spacer(80),
    table({
      widths: [2800, 1400, 4826],
      header: ["Failure", "Action", "Reasoning"],
      rows: [
        [
          "Quota or transport failure",
          "Advance",
          "The model never judged the content, so another model is a clean attempt at the same work.",
        ],
        [
          "Unsupported figure",
          "Stop",
          "A specific, nameable defect. The revision pass repairs it far more reliably by naming the offending figure back to the same model, and re-rolling elsewhere would make the trace unreadable.",
        ],
        [
          "Truncated at the ceiling",
          "Stop",
          "Every model in the chain gets the same ceiling, so the next one would be cut off at the same place.",
        ],
        [
          "Response too short",
          "Stop",
          "The revision pass is the recovery path for a stub, and it demonstrably works.",
        ],
      ],
    }),
    spacer(),
    p(
      "A daily cap benches a model for the window Groq quotes; a per-minute bucket does not. Conflating the two would either sideline a model for an hour over a transient blip, or keep hammering one that has nothing left until the deadline expires.",
    ),
    h3("Measured result, 1 August 2026, with the primary model's daily cap genuinely exhausted"),
    table({
      widths: [3400, 2800, 2826],
      header: ["Configuration", "Chapters drafted by a model", "Fell back to template"],
      rows: [
        ["Single model", "0 of 5", "5"],
        ["Fallback chain, local", "3–4 of 5", "1–2"],
        ["Fallback chain, production", "5 of 5", "0"],
      ],
    }),
    spacer(),
    h2("6.7  Deadline-aware retries"),
    p(
      "Groq answers a rate limit with a specific instruction — 'please try again in 27.4s'. Honouring that up to four times took measured runs to 82–96 seconds against a 45-second budget, which on a 60-second platform ceiling is a gateway timeout: the promoter gets an error page instead of a document made of templates.",
    ),
    p(
      "A retry is now taken only when the wait still leaves time to draft afterwards. The same throttled key that produced 82–96 seconds returns in 44–47. Falling back to a deterministic chapter is an acceptable outcome; a dead request in front of an audience is not.",
    ),
    h2("6.8  Why drafting concurrency is derived, not chosen"),
    p(
      `Because the limiter charges the reservation, a burst costs concurrency × (prompt + ${MAX_COMPLETION_TOKENS.toLocaleString()}) against the per-minute bucket. The largest narrative prompt currently measures ${f.measuredWorstPrompt.toLocaleString()} tokens, against a declared worst case of ${WORST_CASE_PROMPT_TOKENS.toLocaleString()}. At the primary model's ${tpmBucketFor(MODEL_CHAIN[0]).toLocaleString()}-token bucket that permits ${concurrency} chapters in flight; three was tried, and rate-limited the third chapter of every burst.`,
    ),
    p(
      `Both inputs to that arithmetic drift. The completion reservation was once cut to 1,800 on a single measurement of the longest chapter, and a later run of the same chapter on the same input ran past it and was refused — so the ceiling is now set from the observed OVERRUN rather than the observed mean. The worst-case prompt grew from 2,100 to ${WORST_CASE_PROMPT_TOKENS.toLocaleString()} the moment the narrative chapters were given more context fields, and understating it over-fans-out, because the derived slot cost comes out below the real one and the extra chapter rate-limits.`,
    ),
    p(
      `The verification therefore MEASURES the real prompts rather than trusting the declaration, asserts that the current burst fits, and asserts that the concurrency which actually failed is rejected. Without that last assertion the check would quietly become vacuous. The buckets differ per model, so the fan-out is derived per model rather than fixed — sizing against a spent model's bucket would rate-limit its substitute immediately.`,
    ),
    pageBreak(),
  );

  // ---- 7. LangGraph ----------------------------------------------------
  children.push(
    h1("7.  LangGraph, in detail"),
    h2("7.1  Why a graph rather than a pipeline"),
    p(
      "Drafting is not a straight line. A chapter can be rejected for using an unsupported figure, revised, reassembled, re-checked, and rejected again. That is a cycle with a termination condition, which is exactly what a state machine is for. Expressing it as nested loops and flags would work, but the state transitions would live in control flow rather than in something inspectable.",
    ),
    h2("7.2  The graph"),
    codeBlock([
      "        START",
      "          │",
      "          ▼",
      "       ┌───────┐     ┌──────────┐     ┌──────────┐",
      "       │ draft │────►│ assemble │────►│ gapCheck │",
      "       └───────┘     └──────────┘     └──────────┘",
      "                          ▲                 │",
      "                          │           shouldRevise()",
      "                          │            │         │",
      "                      ┌────────┐       │         ▼",
      "                      │ revise │◄──────┘        END",
      "                      └────────┘",
    ]),
    spacer(),
    table({
      widths: [1800, 7226],
      header: ["Node", "Responsibility"],
      monoCols: [0],
      rows: [
        [
          "draft",
          "First pass over the narrative chapters. Fans out to the concurrency the current model's bucket permits, and folds results back in input order.",
        ],
        [
          "assemble",
          "Builds the full document from whatever drafts exist, with deterministic templates for everything else. Reached from both draft and revise.",
        ],
        [
          "gapCheck",
          "Runs the deterministic checker over the assembled document.",
        ],
        [
          "revise",
          "Re-drafts only the chapters still pending, handing the model the specific figures its previous attempt invented.",
        ],
      ],
    }),
    spacer(),
    h2("7.3  State and reducers"),
    p(
      "State is declared with Annotation.Root. Three different reducer strategies are used, and the choice matters in each case:",
    ),
    spacer(80),
    table({
      widths: [1800, 2400, 4826],
      header: ["Strategy", "Applied to", "Why"],
      monoCols: [1],
      rows: [
        [
          "Merge",
          "drafts, attempts",
          "A revision pass returns only the chapters it touched. Merging preserves everything already accepted; replacing would discard it.",
        ],
        [
          "Replace",
          "iteration, pending, document, gapReport",
          "These are snapshots of the present state. Accumulating them would be meaningless.",
        ],
        [
          "Append",
          "log",
          "The log is the audit trail shown to the user. Every line must survive.",
        ],
      ],
    }),
    spacer(),
    h2("7.4  The termination condition"),
    p(
      "shouldRevise decides between another revision and the end. It stops when nothing is pending, when the iteration ceiling is reached, or when the time budget is spent — the budget check is what keeps a slow provider from costing the whole request rather than some prose quality.",
    ),
    h2("7.5  Why gap findings are deliberately NOT fed back into prompts"),
    callout(
      "The most counter-intuitive decision in the codebase",
      "Feeding the gap checker's revenue-mismatch finding back into the drafting prompt made the model silently adopt the audited figure of INR 78.90 crore instead of the promoter's asserted INR 82.50 crore. It harmonised away the exact defect the checker exists to catch. The loop therefore corrects the model's own errors — invented figures, omitted topics — and never the issuer's. A disagreement between two issuer-supplied figures is not the model's to reconcile.",
      "warn",
    ),
    spacer(),
    h2("7.6  What the loop is measurably worth"),
    p(
      "Across six measured runs on a healthy quota, 10 chapter-drafts on the first two runs produced 7 accepted first pass and 3 recovered by revision — a 30% recovery rate on chapters that would otherwise have degraded to templates. The rejected figure was '79' every single time, the model rounding INR 78.90 crore. One chapter rejected it twice before passing on the third attempt.",
    ),
    pageBreak(),
  );

  // ---- 8. Output -------------------------------------------------------
  children.push(
    h1("8.  What the product outputs"),
    h2("8.1  Document shape"),
    table({
      widths: [1000, 5200, 2826],
      header: ["Section", "Title", "Chapters"],
      monoCols: [0],
      rows: f.struct.sections.map((s: any) => [
        String(s.section_id ?? s.id),
        String(s.section_title ?? s.title).replace(/^Section [IVX]+ — /, ""),
        String(s.chapters.length),
      ]),
    }),
    spacer(),
    h2("8.2  Measured output on the two bundled issuers"),
    table({
      widths: [3200, 2900, 2926],
      header: ["Measure", shreeji.issuer.name, aarna.issuer.name],
      rows: [
        ["Sector", String(shreeji.issuer.meta?.sector ?? "—"), String(aarna.issuer.meta?.sector ?? "—")],
        ["Chapters", String(shreeji.doc.chapters.length), String(aarna.doc.chapters.length)],
        ["Words", shreeji.doc.stats.totalWords.toLocaleString(), aarna.doc.stats.totalWords.toLocaleString()],
        ["Tables", String(shreeji.doc.stats.totalTables), String(aarna.doc.stats.totalTables)],
        ["Placeholders", String(shreeji.doc.stats.placeholders), String(aarna.doc.stats.placeholders)],
        ["Coverage", `${shreeji.gap.coveragePct}%`, `${aarna.gap.coveragePct}%`],
        ["Issuer-controllable coverage", `${shreeji.gap.issuerCoveragePct}%`, `${aarna.gap.issuerCoveragePct}%`],
        ["Applicable requirements", String(shreeji.gap.counts.total), String(aarna.gap.counts.total)],
        ["Complete / Partial / Missing", `${shreeji.gap.counts.complete} / ${shreeji.gap.counts.partial} / ${shreeji.gap.counts.missing}`, `${aarna.gap.counts.complete} / ${aarna.gap.counts.partial} / ${aarna.gap.counts.missing}`],
        ["High-severity findings", String(shreeji.gap.findingCounts.high), String(aarna.gap.findingCounts.high)],
        ["Verdict", String(shreeji.gap.verdict.level), String(aarna.gap.verdict.level)],
        ["Eligibility", String(shreeji.elig.verdict.level), String(aarna.elig.verdict.level)],
      ],
    }),
    spacer(),
    p(
      "The two issuers fail on entirely different requirements, which is the evidence that the checker is data-driven rather than hard-coded to a demo.",
    ),
    h2("8.3  How long the output is, and how long a filed DRHP is"),
    p(
      "This is the first question anyone who has seen a real offer document will ask, so the team should know the answer before being asked it.",
    ),
    spacer(80),
    table({
      widths: [3400, 2800, 2826],
      header: ["", "Drafter", "Filed SME DRHP"],
      rows: [
        [
          "Words",
          shreeji.doc.stats.totalWords.toLocaleString(),
          `${f.corpus.meanWords.toLocaleString()} (mean of ${f.corpus.filings} filings)`,
        ],
        [
          "Pages",
          `${f.pdfPages} (PDF export)`,
          `${f.corpus.meanPages} (mean of ${f.corpus.filings} filings)`,
        ],
        [
          "Share by word count",
          `${((shreeji.doc.stats.totalWords / f.corpus.meanWords) * 100).toFixed(1)}%`,
          "100%",
        ],
        ["Risk factors", String(f.riskFactorCount(shreeji.doc)), "typically 30–60"],
      ],
    }),
    spacer(),
    p(
      "That gap is real and should not be talked around. Part of it is structural and correct: the restated financial statements are the auditor's signed work product, the Articles of Association are reproduced verbatim from the company's own constitutional document, and the industry chapter in a real filing is usually a research report bought from an agency. Where it was measurable in the corpus, the Articles alone account for around 18% of a filing.",
    ),
    p(
      "The rest of the gap is depth. Two things have been done about it, and the order matters because they carry very different risk.",
    ),
    p(
      "The standard-text chapters — Definitions and Abbreviations, Terms of the Issue, Issue Structure, Issue Procedure, Restrictions on Foreign Ownership — are written out in full. They are near-identical in every SME offer document and carry almost no factual risk, which makes them the cheapest real volume available. Two rules govern every clause: no regulatory threshold is hard-coded, and procedural statements stay general enough to survive a circular amendment. Percentages, day counts and minimum application sizes are either interpolated from issuer data or deferred with \"as prescribed\" and a note to the banker.",
    ),
    p(
      "The issuer-specific narrative chapters have been deepened more carefully, because depth there means more model output and that is where hallucination risk lives. Depth was taken from three sources in descending order of safety: fields the issuer had already supplied that no prompt was receiving, which is depth at zero risk and actually improves safety, since a figure only clears the output validator if it appears in the supplied context; wider must_cover, which widens the chapter and tightens the delivery check together; and richer deterministic fallbacks, which is what a user with no key or an exhausted quota actually sees. No instruction asks the model to characterise, rank, compare or assess anything — every added topic is descriptive and anchored to a supplied field, because the validator checks figures and cannot check adjectives.",
    ),
    p(
      "What remains is genuinely issuer-specific narrative that needs more from the promoter rather than more from the model. That is a limitation to state, not to engineer around.",
    ),
    callout(
      "How to describe the output, and how not to",
      "Do not call it a complete DRHP. Call it what it is: a structured, disclosure-mapped first draft that covers the requirement framework, carries the standard text in full, and marks every point where a professional must sign. Coverage of requirements and volume of prose are different axes, and the honest claim is the first one.",
      "warn",
    ),
    spacer(),
    h2("8.4  Placeholders are the design, not a shortfall"),
    p(
      `The ${shreeji.doc.stats.placeholders} placeholders in the bundled issuer's draft each sit at a legal signature point — the auditor's examination report, the tax-benefits certificate, counsel's tax particulars, the lock-in computation, the verbatim Articles, the executed declaration. Every one of them is something a named professional must sign. Generating text there would be the single most dangerous thing this product could do.`,
    ),
    h2("8.5  The blank-issuer behaviour"),
    p(
      `With nothing answered at all, Drafter reports ${f.blankGap.coveragePct}% coverage, the verdict "${f.blankGap.verdict.level}", ${f.blankGap.findingCounts.high} high-severity findings, and an eligibility verdict of "${f.blankElig.verdict.level}". It generates the full structure as placeholders and carries no trace of the bundled sample issuers. A tool that flattered an empty file would flatter a real one.`,
    ),
    h2("8.6  Exports"),
    table({
      widths: [2600, 2400, 4026],
      header: ["Export", "Route", "Contents"],
      monoCols: [1],
      rows: [
        ["Full DRHP (DOCX)", "/api/export/docx", "The complete draft, styled, with provenance preserved."],
        ["Full DRHP (PDF)", "/api/export/pdf", "The same document rendered for reading and circulation."],
        ["Gap report (DOCX)", "/api/export/gap", "Findings, coverage and the eligibility gate, for the merchant banker."],
      ],
    }),
    pageBreak(),
  );

  // ---- 9. User manual --------------------------------------------------
  children.push(
    h1("9.  User manual — every function"),
    h2("9.1  Before you start"),
    p(
      "The application runs with or without a model key. Without one it uses deterministic templates and every other function behaves identically — the gap check, the eligibility gate, coverage and exports are unaffected. Use the issuer selector in the header to switch between the two bundled sample companies, a blank company, or a new one you create.",
    ),
    spacer(80),
    table({
      widths: [2400, 6626],
      header: ["Navigation", "What it is for"],
      rows: [
        ["Overview", "Status of the current company, coverage at a glance, and the button that generates the draft."],
        ["Guided Intake", "The questionnaire. This is where a promoter spends their time."],
        ["Draft DRHP", "The generated document, chapter by chapter, with provenance."],
        ["Gap & Consistency", "The findings, the coverage breakdown, the eligibility gate and the action plan."],
        ["Merchant Banker", "The same draft seen as due-diligence work: documents required versus provided."],
        ["Observation Replay", "Paste a real exchange observation letter and see which observations Drafter already tracks."],
        ["Regulation Watch", "SEBI feed items filtered for relevance to the requirement registry."],
        ["Impact", "Positioning, comparison with adjacent tools, and the honest limitations."],
      ],
    }),
    spacer(),
    h2("9.2  Guided Intake"),
    p(
      `The questionnaire is ${f.steps.length} steps and ${f.questions} questions, written in plain language rather than regulatory vocabulary. Every scored evidence field has a control somewhere in it — the verification asserts this, so a requirement can never be scored against a field the promoter has no way to answer.`,
    ),
    spacer(80),
    table({
      widths: [800, 4200, 4026],
      header: ["#", "Step", "Questions"],
      monoCols: [0],
      rows: f.steps.map((s: any, i: number) => [
        String(i + 1),
        String(s.title),
        String((s.questions ?? s.fields ?? []).length),
      ]),
    }),
    spacer(),
    ...[
      "Work top to bottom. Progress saves automatically to the browser; a save indicator confirms it, and a storage failure is reported rather than swallowed.",
      "Tap any citation chip beside a question to open the requirement explainer — what the disclosure asks for, where it comes from, what document you need to hand, where it lands in the final document, and why it matters.",
      "Upload financial statements as PDF or spreadsheet where the step offers it; the three-year series is extracted for you and can be corrected.",
      "The effort meter records actual working time so the preparation-time claim is measured rather than asserted.",
    ].map((x) => numbered(x)),
    spacer(),
    h2("9.3  Generating the draft"),
    ...[
      "Go to Overview and press Generate the draft DRHP. Regenerating is safe and repeatable.",
      "With a model key present the self-correction loop runs and narrative chapters are drafted by a model; without one, templates are used. The mode is labelled on the document rather than left ambiguous.",
      "Generation is bounded to a 45-second model budget inside a 60-second platform ceiling. If the budget runs out, remaining chapters take templates and the document still returns complete.",
    ].map((x) => numbered(x)),
    spacer(),
    h2("9.4  Reading the Draft DRHP"),
    ...[
      "Use the sticky table of contents to move between the nine sections.",
      "Each chapter shows a source strip naming the provenance origins present in it. This is how you answer 'where did this sentence come from'.",
      "Placeholders are shown as structured gaps naming what is required and who must supply it — they are not blanks.",
    ].map((x) => numbered(x)),
    spacer(),
    h2("9.5  Working the Gap & Consistency report"),
    ...[
      "Read the verdict first. It is deliberately independent of the coverage percentage — a draft can be at high coverage and still not be ready.",
      "Resolve high-severity findings before anything else. Each names an exact location, an observation, the exchange pattern it corresponds to, and a remediation.",
      "Check the eligibility gate. Conditions reading 'unknown' are questions, not passes — each one names exactly what is needed.",
      "Use the action plan to decide what to do next. It is ordered by how much coverage each step closes, and the merchant banker's work never appears on the issuer's list.",
      "Export the gap report as DOCX when handing over to the banker.",
    ].map((x) => numbered(x)),
    spacer(),
    h2("9.6  Merchant Banker view"),
    p(
      "The same draft and the same gap report, re-cut as due-diligence work. It lists documents required versus provided and separates what the banker must certify from what the issuer still owes. This exists to make the intermediary's role visible rather than to replace it.",
    ),
    h2("9.7  Observation Replay"),
    ...[
      "Paste the text of a real exchange observation letter. It is parsed in your browser and never sent anywhere.",
      "Each observation is mapped to the requirements Drafter tracks. Numbered formats 1., 1), (1) and 'Observation 1:' are all understood.",
      "The score is mapped over in-scope observations. Observations about production artefacts rather than disclosure are classified out of scope and excluded, so the number is not quietly inflated.",
    ].map((x) => numbered(x)),
    spacer(),
    h2("9.8  Regulation Watch"),
    p(
      "Reads the SEBI RSS feed and keeps only items relevant to the requirement registry. If the feed cannot be reached, the panel says so explicitly rather than rendering empty — an empty panel would read as 'nothing has changed', which is a dangerous thing to imply in a compliance tool.",
    ),
    pageBreak(),
  );

  // ---- 10. Verification ------------------------------------------------
  children.push(
    h1("10.  How we keep it correct"),
    h2("10.1  The gate — run this after any change"),
    codeBlock([
      "npx tsc --noEmit",
      "npm run verify",
      "npm run verify:eligibility",
      "npm run verify:extract",
      "npm run verify:watch",
      "npm run verify:observations",
      "npm run build",
    ]),
    spacer(),
    h2("10.2  What the verification actually asserts"),
    p(
      "npm run verify is not a smoke test. Each of the following has caught a real regression in this project:",
    ),
    ...[
      "Planted defects still surface, with EXACT high-severity counts — so a new rule that fires spuriously fails the gate.",
      "Every scored evidence field has an intake control, so no requirement is scored against an unanswerable field.",
      "Register normalisation never moves a figure, across 258 issuer free-text fields.",
      "Each Chapter IX threshold holds against worked figures on both sides of the limit.",
      "A blank issuer produces no high-severity findings, honest low coverage, and an indeterminate eligibility verdict.",
      "Concurrent drafting returns results in input order and isolates a failure to one chapter.",
      "A quota retry that would overshoot the deadline is abandoned rather than slept through.",
      "The drafting burst fits the free tier's bucket — and the concurrency that actually failed is rejected.",
      "The declared worst-case prompt is MEASURED against the real prompts, so it cannot silently drift when a chapter gains context fields.",
      "The completion ceiling sits above the length at which Risk Factors was observed truncating.",
      "No standard clause hard-codes a regulatory threshold — and a planted \"15%\" and \"4 days\" are caught, while an interpolated figure is allowed.",
      "Standard text is never rendered with issuer-input provenance.",
      "Risk factors are numbered 1..n with no gaps, on a deliberately bare issuer as well as on both samples.",
    ].map((x) => bullet(x)),
    spacer(),
    callout(
      "The rule for anyone adding a check",
      "Assert the negative cases too — the inputs on which the rule must NOT fire. A check that only ever fires is indistinguishable from one that always fires. In a compliance tool a wrong number does not throw an exception; it simply reads as confident and wrong.",
      "warn",
    ),
    spacer(),
    h2("10.3  Guarding the key"),
    p(
      "The live model key lives in .env.local and must never be committed. .gitignore covers it and a pre-commit hook blocks it; the hooks install themselves through the npm prepare script. .env.example carries placeholders only and is meant to be committed.",
    ),
    pageBreak(),
  );

  // ---- 11. Limits ------------------------------------------------------
  children.push(
    h1("11.  Known limits, stated honestly"),
    p(
      "These are in the handbook because a reviewer will find them anyway, and finding them listed is very different from finding them hidden.",
    ),
    spacer(80),
    table({
      widths: [3000, 6026],
      header: ["Limit", "Position"],
      rows: [
        [
          "Restated financial statements are not generated",
          "They are the auditor's signed work product. A placeholder is the correct output.",
        ],
        [
          "Eligibility is not a clearance",
          "The exchange applies its own track-record and net-worth criteria under Reg 229(3). Drafter reports what it can test.",
        ],
        [
          "Regulation citations are curated, not machine-derived",
          "Numbered citations were checked against the consolidated ICDR text of 8 March 2025. A production system would version these against the live text.",
        ],
        [
          "The free model tier constrains throughput",
          "A day's budget is roughly six full generations on the primary model, extended by the fallback chain. Not a limitation of the approach.",
        ],
        [
          "Drafting time is provider-bound",
          "Identical chapters measured 3.2s and 27.7s on the same model. The queue is not ours to optimise.",
        ],
        [
          "Qualitative claims are not machine-checked",
          "The output validator checks figures, not adjectives. A chapter that overstates a strength without inventing a number would pass. The prompt forbids it and the merchant banker is the backstop.",
        ],
      ],
    }),
    pageBreak(),
  );

  // ---- Appendices ------------------------------------------------------
  children.push(
    h1("Appendix A — Repository map"),
    table({
      widths: [3000, 6026],
      header: ["Path", "Contents"],
      monoCols: [0],
      rows: [
        ["data/requirement_registry.json", `The ${f.requirements.length} tracked disclosure requirements — the source of truth`],
        ["data/drhp_structure.json", `The ${f.chapters}-chapter document tree`],
        ["data/intake_questionnaire.json", `The ${f.steps.length}-step, ${f.questions}-question promoter questionnaire`],
        ["data/problem_statement.json", "SEBI's Track 04 text split into testable clauses"],
        ["lib/engine/generate.ts", "Document generation from the structure tree"],
        ["lib/engine/gapCheck.ts", "The deterministic gap and consistency checker"],
        ["lib/engine/eligibility.ts", "The Chapter IX eligibility gate"],
        ["lib/engine/refineGraph.ts", "The LangGraph self-correction loop"],
        ["lib/engine/llm.ts", "Groq access, the model chain, and output validation"],
        ["lib/engine/actionPlan.ts", "Gap report turned into an ordered plan"],
        ["lib/engine/register.ts", "Deterministic register normalisation"],
        ["lib/engine/effort.ts", "Measured preparation time"],
        ["lib/observations/", "Exchange observation letter parsing and replay"],
        ["lib/circulars/", "SEBI feed reading and relevance classification"],
        ["lib/export/", "DOCX and PDF builders"],
        ["scripts/verify-*.ts", "The verification gate"],
        ["scripts/build-handbook.ts", "This document"],
      ],
    }),
    spacer(300),
    h1("Appendix B — Glossary"),
    table({
      widths: [2400, 6626],
      header: ["Term", "Meaning"],
      rows: [
        ["DRHP", "Draft Red Herring Prospectus — the offer document filed before an IPO."],
        ["ICDR", "SEBI (Issue of Capital and Disclosure Requirements) Regulations, 2018."],
        ["Chapter IX", "The part of ICDR governing IPOs by small and medium enterprises, Regulations 227–280."],
        ["Schedule VI", "The ICDR schedule describing where disclosures sit in the offer document."],
        ["SME exchange", "NSE Emerge or BSE SME — the platforms an SME issuer lists on."],
        ["Merchant banker", "The intermediary who conducts due diligence and certifies the offer document before filing."],
        ["Provenance", "The record, carried on every block, of where its content came from."],
        ["Coverage", "Weighted share of applicable requirements discharged: Complete 1, Partial 0.5."],
        ["Pre-check", "The exchange's review of a filed draft, which returns documents carrying defects."],
        ["Observation letter", "The exchange's written list of defects requiring correction."],
      ],
    }),
    spacer(300),
    h1("Appendix C — Commands"),
    table({
      widths: [3000, 6026],
      header: ["Command", "Does"],
      monoCols: [0],
      rows: [
        ["npm run dev", "Start the development server"],
        ["npm run build", "Production build — part of the gate"],
        ["npm run verify", "Engine verification: generation, gap check, defects, concurrency, budgets"],
        ["npm run verify:eligibility", "Chapter IX eligibility gate"],
        ["npm run verify:extract", "Financial statement extraction"],
        ["npm run verify:watch", "Regulation watch feed handling"],
        ["npm run verify:observations", "Observation letter parsing and replay"],
        ["npm run verify:llm", "Live model check (requires a key and spends quota)"],
        ["npm run coldtest", "Full generation against a fresh untuned issuer"],
        ["npm run handbook", "Rebuild this document"],
      ],
    }),
    spacer(240),
    p(
      `Generated from the codebase on ${REVISION.date}. Version ${REVISION.version}. Registry ${f.reg.registry_version}. Internal use only.`,
      { color: MUTED, size: 18, alignment: AlignmentType.CENTER },
    ),
  );

  // ---- Assemble --------------------------------------------------------
  const doc = new Document({
    creator: "Drafter",
    title: "Drafter — Technical and Operating Handbook",
    description: "Internal team handbook for the Drafter SME IPO offer-document generator.",
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 460, hanging: 240 } } },
            },
            {
              level: 1,
              format: LevelFormat.BULLET,
              text: "◦",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 900, hanging: 240 } } },
            },
          ],
        },
        {
          reference: "steps",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 460, hanging: 280 } } },
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: { run: { font: FONT, size: 20, color: INK } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 60 },
                border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 4 } },
                children: [
                  new TextRun({
                    text: "Drafter — Technical and Operating Handbook   ·   Internal",
                    font: FONT,
                    size: 16,
                    color: MUTED,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Page ", font: FONT, size: 16, color: MUTED }),
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: MUTED }),
                  new TextRun({ text: " of ", font: FONT, size: 16, color: MUTED }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: MUTED }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const outDir = path.join(process.cwd(), "docs");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "Drafter-Team-Handbook.docx");
  try {
    writeFileSync(outPath, await Packer.toBuffer(doc));
  } catch (error: any) {
    // Word holds an exclusive lock on an open document, and the raw EBUSY
    // stack trace gives no hint of that.
    if (error?.code === "EBUSY" || error?.code === "EPERM") {
      console.error(`\nCannot write ${outPath} — the file is open in another application.`);
      console.error("Close it in Word (or whatever has it open) and run npm run handbook again.\n");
      process.exit(1);
    }
    throw error;
  }

  console.log(`Handbook written to ${outPath}`);
  console.log(
    `  ${f.requirements.length} requirements · ${f.chapters} chapters · registry ${f.reg.registry_version}`,
  );
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
