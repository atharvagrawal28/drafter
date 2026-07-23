/**
 * DOCX export — a prospectus-formatted Word document built from the same block
 * model the on-screen view renders. Cover page, table of contents, numbered
 * sections, ruled tables, headers/footers and page numbers.
 *
 * The `docx` library is loaded dynamically inside the route handler so it never
 * enters the client bundle.
 */

import type { Block, DrhpDocument, GapReport, TableBlock } from "../types";
import type { DDItem } from "../engine/dueDiligence";
import type { EligibilityReport } from "../engine/eligibility";

// The docx types are resolved at runtime via dynamic import in the route.
type Docx = typeof import("docx");

/** Bare date for the prospectus cover, which carries a date and never a time. */
function coverDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

const SERIF = "Georgia";
const SANS = "Calibri";
const NAVY = "1B2E4A";
const GOLD = "9C6B1E";
const GREY = "5B6472";
const RULE = "C9D2DE";

export async function buildDocx(
  docx: Docx,
  document: DrhpDocument,
  gapReport: GapReport,
): Promise<Buffer> {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
    PageNumber,
    Header,
    Footer,
    PageBreak,
    ShadingType,
    TabStopType,
    TabStopPosition,
  } = docx;

  // ----- helpers -----------------------------------------------------
  const shade = (fill: string) => ({ type: ShadingType.CLEAR, color: "auto", fill });

  const cellBorders = {
    top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
    left: { style: BorderStyle.SINGLE, size: 4, color: RULE },
    right: { style: BorderStyle.SINGLE, size: 4, color: RULE },
  };

  function bodyPara(text: string, opts: { italics?: boolean; color?: string; size?: number } = {}) {
    return new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 140, line: 276 },
      children: [
        new TextRun({
          text,
          font: SERIF,
          size: opts.size ?? 21,
          italics: opts.italics,
          color: opts.color,
        }),
      ],
    });
  }

  function renderTable(block: TableBlock): (InstanceType<typeof Table> | InstanceType<typeof Paragraph>)[] {
    const out: (InstanceType<typeof Table> | InstanceType<typeof Paragraph>)[] = [];

    if (block.caption) {
      out.push(
        new Paragraph({
          spacing: { before: 120, after: 80 },
          children: [new TextRun({ text: block.caption, font: SANS, size: 18, bold: true, color: NAVY, allCaps: true })],
        }),
      );
    }

    const headerRow = new TableRow({
      tableHeader: true,
      children: block.columns.map(
        (column) =>
          new TableCell({
            shading: shade("E7ECF3"),
            borders: cellBorders,
            margins: { top: 40, bottom: 40, left: 80, right: 80 },
            children: [
              new Paragraph({
                alignment: column.numeric ? AlignmentType.RIGHT : AlignmentType.LEFT,
                children: [new TextRun({ text: column.header, font: SANS, size: 17, bold: true, color: NAVY })],
              }),
            ],
          }),
      ),
    });

    const bodyRows = block.rows.map((row, rowIndex) => {
      const isTotal = block.totalRowIndices?.includes(rowIndex);
      return new TableRow({
        children: row.map((cell, cellIndex) => {
          const column = block.columns[cellIndex];
          return new TableCell({
            shading: isTotal ? shade("EEF1F6") : undefined,
            borders: cellBorders,
            margins: { top: 30, bottom: 30, left: 80, right: 80 },
            children: [
              new Paragraph({
                alignment: column?.numeric ? AlignmentType.RIGHT : AlignmentType.LEFT,
                children: [new TextRun({ text: cell, font: SERIF, size: 18, bold: isTotal })],
              }),
            ],
          });
        }),
      });
    });

    out.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...bodyRows],
      }),
    );

    for (const note of block.notes ?? []) {
      out.push(
        new Paragraph({
          spacing: { before: 60, after: 120 },
          children: [new TextRun({ text: note, font: SANS, size: 16, italics: true, color: GREY })],
        }),
      );
    }
    out.push(new Paragraph({ spacing: { after: 80 }, children: [] }));

    return out;
  }

  function renderBlock(block: Block): (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] {
    switch (block.kind) {
      case "heading":
        return [
          new Paragraph({
            spacing: { before: 200, after: 100 },
            children: [
              new TextRun({
                text: block.text,
                font: SERIF,
                size: block.level === 2 ? 24 : 22,
                bold: true,
                color: NAVY,
              }),
            ],
          }),
        ];
      case "para":
        return [bodyPara(block.text)];
      case "list":
        return block.items.map(
          (item) =>
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { after: 80 },
              bullet: block.ordered ? undefined : { level: 0 },
              numbering: undefined,
              indent: { left: 360, hanging: 200 },
              children: [new TextRun({ text: `${block.ordered ? "•  " : ""}${item}`, font: SERIF, size: 20 })],
            }),
        );
      case "table":
        return renderTable(block);
      case "placeholder":
        return [
          new Paragraph({
            spacing: { before: 100, after: 40 },
            shading: shade("FBF3F2"),
            border: {
              left: { style: BorderStyle.SINGLE, size: 18, color: "C0504D", space: 8 },
            },
            children: [
              new TextRun({ text: "[ TO BE SUPPLIED ]  ", font: SANS, size: 16, bold: true, color: "9C2A26" }),
              new TextRun({ text: block.text, font: SERIF, size: 20 }),
            ],
          }),
          ...block.requiredInputs.map(
            (input) =>
              new Paragraph({
                spacing: { after: 40 },
                indent: { left: 460 },
                children: [new TextRun({ text: `–  ${input}`, font: SANS, size: 17, color: GREY })],
              }),
          ),
        ];
      case "callout":
        return [
          new Paragraph({
            spacing: { before: 120, after: 120 },
            shading: shade(block.tone === "attention" ? "FBF6EC" : "F1F4F8"),
            border: {
              left: { style: BorderStyle.SINGLE, size: 18, color: block.tone === "attention" ? GOLD : RULE, space: 8 },
            },
            children: [
              ...(block.title
                ? [new TextRun({ text: `${block.title}: `, font: SANS, size: 17, bold: true, color: GOLD })]
                : []),
              new TextRun({ text: block.text, font: SANS, size: 18, color: GREY }),
            ],
          }),
        ];
      default:
        return [];
    }
  }

  // ----- Cover page --------------------------------------------------
  const cover = document.cover;
  const coverChildren = [
    center(new TextRun({ text: cover.documentLabel, font: SANS, size: 20, bold: true, color: GOLD, allCaps: true })),
    center(
      new TextRun({
        text: `Dated ${coverDate(document.generatedAt)} · Please read section 26 of the Companies Act, 2013`,
        font: SANS,
        size: 15,
        color: GREY,
      }),
      60,
    ),
    center(new TextRun({ text: cover.issueTypeLine, font: SANS, size: 15, color: GREY }), 40),
    spacer(200),
    center(new TextRun({ text: cover.companyName, font: SERIF, size: 40, bold: true, color: NAVY }), 120),
    center(new TextRun({ text: `CIN: ${cover.cin}`, font: SERIF, size: 19, color: GREY }), 60),
    center(new TextRun({ text: cover.incorporationLine, font: SERIF, size: 19, color: GREY }), 20),
    spacer(120),
    center(new TextRun({ text: `Registered office: ${cover.registeredOffice}`, font: SERIF, size: 18 }), 30),
    center(new TextRun({ text: cover.contactLine, font: SERIF, size: 17, color: GREY }), 20),
    center(new TextRun({ text: `Company Secretary and Compliance Officer: ${cover.companySecretary}`, font: SERIF, size: 18 }), 30),
    center(new TextRun({ text: `Promoters: ${cover.promoters}`, font: SERIF, size: 18 }), 20),
    spacer(160),
    center(new TextRun({ text: "THE ISSUE", font: SANS, size: 18, bold: true, color: NAVY }), 60),
    center(new TextRun({ text: cover.issueLine, font: SERIF, size: 20, bold: true }), 40),
    center(new TextRun({ text: cover.priceLine, font: SERIF, size: 19 }), 30),
    center(new TextRun({ text: cover.platformLine, font: SERIF, size: 17, color: GREY }), 20),
    spacer(160),
    labelledStatement("GENERAL RISK", cover.generalRisk),
    labelledStatement("ISSUER'S ABSOLUTE RESPONSIBILITY", cover.issuerResponsibility),
    labelledStatement("LEAD MANAGER'S RESPONSIBILITY", cover.lmResponsibility),
    spacer(120),
    threeColParties(cover.leadManager, cover.registrar, cover.marketMaker),
    spacer(120),
    center(new TextRun({ text: "PREPARATORY DRAFT GENERATED BY DRAFTER — NOT FOR FILING", font: SANS, size: 16, bold: true, color: GOLD }), 20),
    center(
      new TextRun({
        text: `Regulation set ${document.regulationSetVersion} · ${document.generationMode === "llm" ? `Narrative drafted by ${document.llmModel}` : "Narrative from deterministic templates"}`,
        font: SANS,
        size: 14,
        color: GREY,
      }),
      20,
    ),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  function center(run: InstanceType<typeof TextRun>, after = 0) {
    return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after }, children: [run] });
  }
  function spacer(after: number) {
    return new Paragraph({ spacing: { after }, children: [] });
  }
  function labelledStatement(label: string, text: string) {
    return new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 80, after: 100 },
      children: [
        new TextRun({ text: `${label}:  `, font: SANS, size: 15, bold: true, color: NAVY }),
        new TextRun({ text, font: SERIF, size: 17 }),
      ],
    });
  }
  function threeColParties(lm: string, registrar: string, mm: string) {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
        bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
        left: { style: BorderStyle.NONE, size: 0, color: "auto" },
        right: { style: BorderStyle.NONE, size: 0, color: "auto" },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
      },
      rows: [
        new TableRow({
          children: [
            ["LEAD MANAGER", lm],
            ["REGISTRAR TO THE ISSUE", registrar],
            ["MARKET MAKER", mm],
          ].map(
            ([label, value]) =>
              new TableCell({
                borders: { top: cellBorders.top, bottom: { style: BorderStyle.NONE, size: 0, color: "auto" }, left: { style: BorderStyle.NONE, size: 0, color: "auto" }, right: { style: BorderStyle.NONE, size: 0, color: "auto" } },
                children: [
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80 }, children: [new TextRun({ text: label, font: SANS, size: 13, bold: true, color: GREY })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: value, font: SERIF, size: 17, bold: true })] }),
                ],
              }),
          ),
        }),
      ],
    });
  }

  // ----- Table of contents (static list; Word can refresh page refs) --
  const tocChildren = [
    new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: "TABLE OF CONTENTS", font: SERIF, size: 28, bold: true, color: NAVY })] }),
  ];
  for (const section of document.sections) {
    tocChildren.push(
      new Paragraph({
        spacing: { before: 120, after: 40 },
        children: [new TextRun({ text: section.title, font: SANS, size: 18, bold: true, color: NAVY })],
      }),
    );
    for (const chapterId of section.chapterIds) {
      const chapter = document.chapters.find((candidate) => candidate.id === chapterId);
      if (!chapter) continue;
      tocChildren.push(
        new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX, leader: "dot" }],
          spacing: { after: 20 },
          indent: { left: 220 },
          children: [
            new TextRun({ text: `${chapter.id}   ${chapter.title}`, font: SERIF, size: 19 }),
            new TextRun({ text: `\t${statusWord(chapter.status)}`, font: SANS, size: 15, color: GREY }),
          ],
        }),
      );
    }
  }
  tocChildren.push(new Paragraph({ children: [new PageBreak()] }));

  // ----- Body --------------------------------------------------------
  const bodyChildren: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];
  for (const section of document.sections) {
    bodyChildren.push(
      new Paragraph({
        spacing: { before: 240, after: 120 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: NAVY, space: 4 } },
        children: [new TextRun({ text: section.title, font: SERIF, size: 28, bold: true, color: NAVY, allCaps: true })],
      }),
    );

    for (const chapterId of section.chapterIds) {
      const chapter = document.chapters.find((candidate) => candidate.id === chapterId);
      if (!chapter) continue;

      bodyChildren.push(
        new Paragraph({
          spacing: { before: 200, after: 40 },
          children: [new TextRun({ text: `CHAPTER ${chapter.id}`, font: SANS, size: 16, bold: true, color: GOLD })],
        }),
        new Paragraph({
          spacing: { after: 40 },
          children: [new TextRun({ text: chapter.title, font: SERIF, size: 26, bold: true, color: NAVY })],
        }),
        new Paragraph({
          spacing: { after: 140 },
          children: [
            new TextRun({ text: "Maps to disclosure requirements: ", font: SANS, size: 15, italics: true, color: GREY }),
            new TextRun({ text: chapter.requirementIds.join(", ") || "—", font: SANS, size: 15, color: GREY }),
          ],
        }),
      );

      for (const block of chapter.blocks) {
        bodyChildren.push(...renderBlock(block));
      }
    }
  }

  function statusWord(status: string) {
    return status === "generated" ? "Drafted" : status === "partial" ? "Partial" : "Skeleton";
  }

  // ----- Assemble ----------------------------------------------------
  const doc = new Document({
    creator: "Drafter",
    title: `${document.issuerName} — Draft Red Herring Prospectus`,
    description: "Preparatory draft generated by Drafter. Not for filing.",
    styles: { default: { document: { run: { font: SERIF, size: 21 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1200, bottom: 1200, left: 1200, right: 1200 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: `${document.issuerName} — Draft Red Herring Prospectus`, font: SANS, size: 14, color: GREY }),
                ],
                border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 4 } },
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 4 } },
                children: [
                  new TextRun({ text: "Preparatory draft — not for filing    ·    Page ", font: SANS, size: 14, color: GREY }),
                  new TextRun({ children: [PageNumber.CURRENT], font: SANS, size: 14, color: GREY }),
                  new TextRun({ text: " of ", font: SANS, size: 14, color: GREY }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: SANS, size: 14, color: GREY }),
                ],
              }),
            ],
          }),
        },
        children: [...coverChildren, ...tocChildren, ...bodyChildren],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

// ---------------------------------------------------------------------------
// Standalone gap / compliance report DOCX
// ---------------------------------------------------------------------------

export async function buildGapDocx(
  docx: Docx,
  gapReport: GapReport,
  dueDiligence?: DDItem[],
  eligibility?: EligibilityReport,
): Promise<Buffer> {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, Header, Footer, PageNumber } = docx;
  const shade = (fill: string) => ({ type: ShadingType.CLEAR, color: "auto", fill });
  const cellBorders = {
    top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
    left: { style: BorderStyle.SINGLE, size: 4, color: RULE },
    right: { style: BorderStyle.SINGLE, size: 4, color: RULE },
  };

  const children: any[] = [];

  children.push(
    new Paragraph({ children: [new TextRun({ text: "GAP & CONSISTENCY REPORT", font: SANS, size: 20, bold: true, color: GOLD })] }),
    new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: gapReport.issuerName, font: SERIF, size: 34, bold: true, color: NAVY })] }),
    new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: "Modelled on an exchange pre-check report. A preparatory aid; not the merchant banker's due-diligence review or the exchange's examination.", font: SANS, size: 17, italics: true, color: GREY })] }),
  );

  // Verdict box
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: shade(gapReport.verdict.level === "substantially-complete" ? "EAF3EE" : "FBF1EC"),
              borders: cellBorders,
              margins: { top: 120, bottom: 120, left: 160, right: 160 },
              children: [
                new Paragraph({ children: [new TextRun({ text: gapReport.verdict.headline, font: SERIF, size: 22, bold: true, color: NAVY })] }),
                new Paragraph({ spacing: { before: 60 }, children: [new TextRun({ text: gapReport.verdict.detail, font: SERIF, size: 18 })] }),
              ],
            }),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { after: 160 }, children: [] }),
  );

  // Eligibility gate.
  //
  // Placed before the coverage summary deliberately. A banker opening this
  // document needs to know whether the issuer may make the issue at all before
  // reading how complete the draft is — the second question is moot if the
  // answer to the first is no.
  if (eligibility) {
    const level = eligibility.verdict.level;
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                shading: shade(level === "ineligible" ? "F7E8E6" : level === "indeterminate" ? "FBF3E6" : "EAF3EE"),
                borders: cellBorders,
                margins: { top: 120, bottom: 120, left: 160, right: 160 },
                children: [
                  new Paragraph({ children: [new TextRun({ text: "ELIGIBILITY GATE — CHAPTER IX", font: SANS, size: 16, bold: true, color: GOLD })] }),
                  new Paragraph({ spacing: { before: 60 }, children: [new TextRun({ text: eligibility.verdict.headline, font: SERIF, size: 22, bold: true, color: NAVY })] }),
                  new Paragraph({ spacing: { before: 60 }, children: [new TextRun({ text: eligibility.verdict.detail, font: SERIF, size: 18 })] }),
                  new Paragraph({
                    spacing: { before: 60 },
                    children: [new TextRun({
                      text: `${eligibility.counts.met} satisfied · ${eligibility.counts.notMet} not satisfied · ${eligibility.counts.unknown} unanswered · ${eligibility.counts.notApplicable} not applicable`,
                      font: SANS, size: 16, color: GREY,
                    })],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      new Paragraph({ spacing: { after: 120 }, children: [] }),
    );

    // Only the conditions that need attention are itemised. A banker does not
    // need eight paragraphs confirming that shares are in demat form.
    const attention = eligibility.conditions.filter((c) => c.applicable && c.state !== "met");
    for (const condition of attention) {
      children.push(
        new Paragraph({
          spacing: { before: 100, after: 20 },
          children: [
            new TextRun({ text: `${condition.source}  `, font: SANS, size: 17, bold: true, color: condition.state === "not-met" ? "9C2A26" : NAVY }),
            new TextRun({ text: condition.state === "not-met" ? "NOT SATISFIED" : "NOT YET ANSWERABLE", font: SANS, size: 15, bold: true, color: GREY }),
          ],
        }),
        new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: condition.requirement, font: SERIF, size: 18 })] }),
        new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: condition.finding, font: SERIF, size: 18, bold: true })] }),
      );
      if (condition.values?.length) {
        children.push(
          new Paragraph({
            spacing: { after: 20 },
            children: [new TextRun({ text: condition.values.map((v) => `${v.label}: ${v.value}`).join("   |   "), font: SANS, size: 16, color: GREY })],
          }),
        );
      }
      if (condition.action) {
        children.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({ text: "What to do: ", font: SANS, size: 16, bold: true }),
              new TextRun({ text: condition.action, font: SANS, size: 16 }),
            ],
          }),
        );
      }
    }

    children.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: `Assessed against ${eligibility.regulationSet}. The SME exchange applies its own track-record and net-worth criteria under Regulation 229(3), which are not tested here.`, font: SANS, size: 15, italics: true, color: GREY })],
      }),
    );
  }

  // Score table
  children.push(
    new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: "Summary", font: SERIF, size: 24, bold: true, color: NAVY })] }),
    scoreTable(),
    new Paragraph({ spacing: { after: 160 }, children: [] }),
  );

  function scoreTable() {
    const rows = [
      ["Overall coverage", `${gapReport.coveragePct}%`],
      ["Issuer-controllable coverage", `${gapReport.issuerCoveragePct}%`],
      ["Requirements complete", `${gapReport.counts.complete} of ${gapReport.counts.total}`],
      ["Partial", String(gapReport.counts.partial)],
      ["Missing", String(gapReport.counts.missing)],
      ["Defects (consistency / disclosure)", String(gapReport.counts.defect)],
      ["High-severity findings", String(gapReport.findingCounts.high)],
    ];
    return new Table({
      width: { size: 70, type: WidthType.PERCENTAGE },
      rows: rows.map(
        ([label, value]) =>
          new TableRow({
            children: [
              new TableCell({ borders: cellBorders, margins: { top: 30, bottom: 30, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: label, font: SERIF, size: 18 })] })] }),
              new TableCell({ borders: cellBorders, margins: { top: 30, bottom: 30, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: value, font: SERIF, size: 18, bold: true })] })] }),
            ],
          }),
      ),
    });
  }

  // Findings
  children.push(new Paragraph({ spacing: { before: 100, after: 100 }, children: [new TextRun({ text: `Findings (${gapReport.findings.length})`, font: SERIF, size: 24, bold: true, color: NAVY })] }));
  for (const finding of gapReport.findings) {
    children.push(
      new Paragraph({
        spacing: { before: 140, after: 20 },
        children: [
          new TextRun({ text: `${finding.code}  `, font: SANS, size: 18, bold: true, color: finding.severity === "high" ? "9C2A26" : NAVY }),
          new TextRun({ text: `[${finding.severity.toUpperCase()}] `, font: SANS, size: 15, bold: true, color: GREY }),
          new TextRun({ text: finding.category, font: SANS, size: 15, color: GREY }),
          new TextRun({ text: `   ${finding.requirementId}`, font: SANS, size: 14, color: GREY }),
        ],
      }),
      new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: finding.title, font: SERIF, size: 20, bold: true })] }),
      new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 30 }, children: [new TextRun({ text: finding.observation, font: SERIF, size: 18 })] }),
      new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: "Location: ", font: SANS, size: 15, bold: true, color: GREY }), new TextRun({ text: finding.locations.map((l) => `${l.chapterId} ${l.chapterTitle}`).join("; "), font: SANS, size: 15, color: GREY })] }),
    );
    if (finding.exchangePattern) {
      children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 30 }, children: [new TextRun({ text: "Why the exchange returns this: ", font: SANS, size: 15, bold: true, color: "9C2A26" }), new TextRun({ text: finding.exchangePattern, font: SANS, size: 15, color: GREY })] }));
    }
    children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 60 }, children: [new TextRun({ text: "How to fix: ", font: SANS, size: 15, bold: true }), new TextRun({ text: finding.remediation, font: SERIF, size: 18 })] }));
  }

  // Requirement register table
  children.push(new Paragraph({ spacing: { before: 160, after: 100 }, children: [new TextRun({ text: "Requirement register", font: SERIF, size: 24, bold: true, color: NAVY })] }));
  const registerHeader = new TableRow({
    tableHeader: true,
    children: ["ID", "Requirement", "Status", "Source"].map(
      (header, index) =>
        new TableCell({
          shading: shade("E7ECF3"),
          borders: cellBorders,
          margins: { top: 40, bottom: 40, left: 80, right: 80 },
          width: { size: [8, 54, 12, 26][index], type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: header, font: SANS, size: 16, bold: true, color: NAVY })] })],
        }),
    ),
  });
  const registerRows = gapReport.items.map(
    (item) =>
      new TableRow({
        children: [
          cell(item.id, 16, true),
          cell(item.requirement, 16),
          cell(item.status, 16, true, item.status === "Defect" ? "9C2A26" : item.status === "Complete" ? "2E6B4A" : GREY),
          cell(item.source, 15),
        ],
      }),
  );
  function cell(text: string, size: number, bold = false, color?: string) {
    return new TableCell({
      borders: cellBorders,
      margins: { top: 24, bottom: 24, left: 80, right: 80 },
      children: [new Paragraph({ children: [new TextRun({ text, font: SERIF, size, bold, color })] })],
    });
  }
  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [registerHeader, ...registerRows] }));

  // Optional DD checklist
  if (dueDiligence?.length) {
    children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [new TextRun({ text: "Due-diligence document checklist", font: SERIF, size: 24, bold: true, color: NAVY })] }));
    const ddHeader = new TableRow({
      tableHeader: true,
      children: ["Ref", "Document", "Responsibility", "Status"].map(
        (header) =>
          new TableCell({ shading: shade("E7ECF3"), borders: cellBorders, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: header, font: SANS, size: 16, bold: true, color: NAVY })] })] }),
      ),
    });
    const ddRows = dueDiligence.map(
      (item) =>
        new TableRow({
          children: [
            cell(item.id, 15, true),
            cell(item.document, 16),
            cell(item.responsibility, 15),
            cell(item.status === "provided" ? "Provided" : item.status === "outstanding" ? "Outstanding" : "Banker/auditor", 15, true, item.status === "provided" ? "2E6B4A" : GREY),
          ],
        }),
    );
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [ddHeader, ...ddRows] }));
  }

  children.push(
    new Paragraph({
      spacing: { before: 200 },
      children: [new TextRun({ text: `Regulation set ${gapReport.registryVersion}. ${gapReport.regulationSet}`, font: SANS, size: 14, italics: true, color: GREY })],
    }),
  );

  const doc = new Document({
    creator: "Drafter",
    title: `${gapReport.issuerName} — Gap & Consistency Report`,
    sections: [
      {
        properties: { page: { margin: { top: 1200, bottom: 1200, left: 1200, right: 1200 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 4 } },
                children: [
                  new TextRun({ text: "Drafter Gap & Consistency Report    ·    Page ", font: SANS, size: 14, color: GREY }),
                  new TextRun({ children: [PageNumber.CURRENT], font: SANS, size: 14, color: GREY }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
