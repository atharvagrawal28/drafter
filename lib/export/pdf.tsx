/**
 * PDF export — a prospectus-styled PDF built with @react-pdf/renderer from the
 * same block model as the on-screen view and the DOCX. Rendered to a Buffer in
 * the route handler; never imported on the client.
 *
 * IMPORTANT RENDERING CONSTRAINT
 * ------------------------------
 * react-pdf crashes ("unsupported number: -8.8e+21") inside its border-clipping
 * maths whenever a bordered element straddles a page break. In a 30-page
 * document that is not an edge case — it is guaranteed, and which element it
 * hits shifts with any content change, so it cannot be fixed by tuning one
 * component.
 *
 * Therefore this file draws NO borders anywhere. Every rule, grid line and
 * separator is a filled View (a 1pt-tall or 1pt-wide block of colour). Filled
 * backgrounds go through a different, safe render path, so the document
 * paginates freely no matter how the content grows.
 */

import * as React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { Block, DrhpDocument, GapReport, TableBlock, TableColumn } from "../types";
import type { EligibilityReport } from "../engine/eligibility";

const NAVY = "#1B2E4A";
const GOLD = "#9C6B1E";
const GREY = "#5B6472";
const RULE = "#C9D2DE";
const RED = "#9C2A26";
const GREEN = "#2E6B4A";

const styles = StyleSheet.create({
  page: {
    paddingTop: 54,
    paddingBottom: 62,
    paddingHorizontal: 54,
    fontFamily: "Times-Roman",
    fontSize: 10,
    color: "#1A2333",
    lineHeight: 1.5,
  },
  footer: { position: "absolute", bottom: 28, left: 54, right: 54 },
  footerRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 5 },
  footerText: { fontSize: 8, color: GREY, fontFamily: "Helvetica" },

  sectionTitle: { fontFamily: "Times-Bold", fontSize: 16, color: NAVY, textTransform: "uppercase", paddingBottom: 4 },
  chapterKicker: { fontFamily: "Helvetica-Bold", fontSize: 8, color: GOLD, marginTop: 12 },
  chapterTitle: { fontFamily: "Times-Bold", fontSize: 15, color: NAVY, marginTop: 2 },
  chapterMap: { fontFamily: "Helvetica-Oblique", fontSize: 8, color: GREY, marginTop: 2, marginBottom: 8 },
  h2: { fontFamily: "Times-Bold", fontSize: 11.5, color: NAVY, marginTop: 10, marginBottom: 3 },
  para: { textAlign: "justify", marginBottom: 6 },
  listItem: { textAlign: "justify", marginBottom: 3, paddingLeft: 12 },

  caption: { fontFamily: "Helvetica-Bold", fontSize: 8, color: NAVY, textTransform: "uppercase", marginBottom: 3, marginTop: 4 },
  table: { marginBottom: 8 },
  tr: { flexDirection: "row" },
  headerRow: { backgroundColor: "#E7ECF3" },
  totalRow: { backgroundColor: "#EEF1F6" },
  th: { padding: 3, fontFamily: "Helvetica-Bold", fontSize: 7.5, color: NAVY },
  td: { padding: 3, fontSize: 8 },
  tdTotal: { fontFamily: "Times-Bold" },
  note: { fontFamily: "Helvetica-Oblique", fontSize: 7.5, color: GREY, marginBottom: 6 },

  railRow: { flexDirection: "row", marginVertical: 5 },
  rail: { width: 3 },
  railBody: { flex: 1, padding: 6 },
  placeholderTag: { fontFamily: "Helvetica-Bold", fontSize: 7.5, color: RED, marginBottom: 2 },
  calloutTitle: { fontFamily: "Helvetica-Bold", fontSize: 7.5, color: GOLD, marginBottom: 2 },
});

// ---------------------------------------------------------------------------
// Filled-rule primitives (never borders — see the note at the top of the file)
// ---------------------------------------------------------------------------

/** Bare date for the prospectus cover, which carries a date and never a time. */
function coverDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function HRule({ color = RULE, height = 1, style }: { color?: string; height?: number; style?: any }) {
  return <View style={[{ height, backgroundColor: color }, style]} />;
}

function VRule({ color = RULE }: { color?: string }) {
  return <View style={{ width: 1, flexShrink: 0, backgroundColor: color }} />;
}

/**
 * A table drawn entirely from filled rules.
 *
 * Columns use proportional flex rather than percentage widths so the 1pt
 * vertical rules between cells cannot push the row past 100% and wrap.
 * Every row is `wrap={false}` so a row is never split mid-height.
 */
function SafeTable({
  columns,
  rows,
  totalRowIndices,
  cellStyle,
}: {
  columns: TableColumn[];
  rows: string[][];
  totalRowIndices?: number[];
  cellStyle?: (rowIndex: number, colIndex: number) => any;
}) {
  return (
    <View>
      <HRule />
      <View style={[styles.tr, styles.headerRow]} wrap={false}>
        {columns.map((column, index) => (
          <React.Fragment key={index}>
            {index > 0 ? <VRule /> : null}
            <Text
              style={[
                styles.th,
                { flexGrow: column.width ?? 1, flexBasis: 0, textAlign: column.numeric ? "right" : "left" },
              ]}
            >
              {column.header}
            </Text>
          </React.Fragment>
        ))}
      </View>
      <HRule />
      {rows.map((row, rowIndex) => {
        const isTotal = totalRowIndices?.includes(rowIndex);
        return (
          <React.Fragment key={rowIndex}>
            <View style={[styles.tr, isTotal ? styles.totalRow : {}]} wrap={false}>
              {row.map((cell, colIndex) => (
                <React.Fragment key={colIndex}>
                  {colIndex > 0 ? <VRule /> : null}
                  <Text
                    style={[
                      styles.td,
                      {
                        flexGrow: columns[colIndex]?.width ?? 1,
                        flexBasis: 0,
                        textAlign: columns[colIndex]?.numeric ? "right" : "left",
                      },
                      isTotal ? styles.tdTotal : {},
                      cellStyle?.(rowIndex, colIndex) ?? {},
                    ]}
                  >
                    {cell}
                  </Text>
                </React.Fragment>
              ))}
            </View>
            <HRule />
          </React.Fragment>
        );
      })}
    </View>
  );
}

function TableView({ block }: { block: TableBlock }) {
  return (
    <View style={styles.table}>
      {block.caption ? <Text style={styles.caption}>{block.caption}</Text> : null}
      <SafeTable columns={block.columns} rows={block.rows} totalRowIndices={block.totalRowIndices} />
      {block.notes?.map((note, index) => (
        <Text key={index} style={styles.note}>
          {note}
        </Text>
      ))}
    </View>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "heading":
      return <Text style={styles.h2}>{block.text}</Text>;
    case "para":
      return <Text style={styles.para}>{block.text}</Text>;
    case "list":
      return (
        <View>
          {block.items.map((item, index) => (
            <Text key={index} style={styles.listItem}>
              •  {item}
            </Text>
          ))}
        </View>
      );
    case "table":
      return <TableView block={block} />;
    case "placeholder":
      return (
        <View style={[styles.railRow, { backgroundColor: "#FBF3F2" }]} wrap={false}>
          <View style={[styles.rail, { backgroundColor: RED }]} />
          <View style={styles.railBody}>
            <Text style={styles.placeholderTag}>[ TO BE SUPPLIED ]</Text>
            <Text style={{ fontFamily: "Times-Bold", marginBottom: 2 }}>{block.text}</Text>
            {block.requiredInputs.map((input, index) => (
              <Text key={index} style={{ fontSize: 8, color: GREY, paddingLeft: 8 }}>
                –  {input}
              </Text>
            ))}
          </View>
        </View>
      );
    case "callout":
      return (
        <View style={[styles.railRow, { backgroundColor: block.tone === "attention" ? "#FBF6EC" : "#F1F4F8" }]} wrap={false}>
          <View style={[styles.rail, { backgroundColor: block.tone === "attention" ? GOLD : RULE }]} />
          <View style={styles.railBody}>
            {block.title ? <Text style={styles.calloutTitle}>{block.title}</Text> : null}
            <Text style={{ fontSize: 8.5, color: GREY }}>{block.text}</Text>
          </View>
        </View>
      );
    default:
      return null;
  }
}

function Footer({ left }: { left: string }) {
  return (
    <View style={styles.footer} fixed>
      <HRule />
      <View style={styles.footerRow}>
        <Text style={styles.footerText}>{left}</Text>
        <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Full DRHP
// ---------------------------------------------------------------------------

export function DrhpPdf({ document }: { document: DrhpDocument }) {
  const cover = document.cover;

  return (
    <Document title={`${document.issuerName} — Draft Red Herring Prospectus`} author="Drafter">
      {/* Cover */}
      <Page size="A4" style={styles.page}>
        <Footer left="Preparatory draft — not for filing" />

        <View style={{ alignItems: "center", marginTop: 20 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10, color: GOLD, letterSpacing: 2 }}>
            {cover.documentLabel}
          </Text>
          <Text style={{ fontSize: 8, color: GREY, marginTop: 4 }}>
            Dated {coverDate(document.generatedAt)} · Please read section 26 of the Companies Act, 2013
          </Text>
          <Text style={{ fontSize: 8, color: GREY, marginTop: 2 }}>{cover.issueTypeLine}</Text>
        </View>

        <HRule color="#2A3A55" height={1.5} style={{ marginVertical: 18 }} />

        <View style={{ alignItems: "center" }}>
          <Text style={{ fontFamily: "Times-Bold", fontSize: 24, color: NAVY, textAlign: "center" }}>
            {cover.companyName}
          </Text>
          <Text style={{ fontSize: 10, color: GREY, marginTop: 6 }}>CIN: {cover.cin}</Text>
          <Text style={{ fontSize: 10, color: GREY, marginTop: 2, textAlign: "center" }}>{cover.incorporationLine}</Text>
        </View>

        <View style={{ alignItems: "center", marginTop: 14 }}>
          <Text style={{ fontSize: 9, textAlign: "center" }}>Registered office: {cover.registeredOffice}</Text>
          {cover.contactLine ? (
            <Text style={{ fontSize: 8.5, color: GREY, marginTop: 3, textAlign: "center" }}>{cover.contactLine}</Text>
          ) : null}
          <Text style={{ fontSize: 9, marginTop: 3, textAlign: "center" }}>
            Company Secretary and Compliance Officer: {cover.companySecretary}
          </Text>
          <Text style={{ fontSize: 9, marginTop: 2, textAlign: "center" }}>Promoters: {cover.promoters}</Text>
        </View>

        <View style={{ backgroundColor: "#EEF2F7", padding: 12, marginTop: 18, alignItems: "center" }}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9, color: NAVY, letterSpacing: 1 }}>THE ISSUE</Text>
          <Text style={{ fontFamily: "Times-Bold", fontSize: 11, marginTop: 4, textAlign: "center" }}>{cover.issueLine}</Text>
          <Text style={{ fontSize: 10, marginTop: 3 }}>{cover.priceLine}</Text>
          <Text style={{ fontSize: 8.5, color: GREY, marginTop: 3, textAlign: "center" }}>{cover.platformLine}</Text>
        </View>

        <View style={{ marginTop: 16 }}>
          {[
            ["GENERAL RISK", cover.generalRisk],
            ["ISSUER'S ABSOLUTE RESPONSIBILITY", cover.issuerResponsibility],
            ["LEAD MANAGER'S RESPONSIBILITY", cover.lmResponsibility],
          ].map(([label, text]) => (
            <View key={label} style={{ marginBottom: 8 }}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 7.5, color: NAVY }}>{label}</Text>
              <Text style={{ fontSize: 8.5, textAlign: "justify", marginTop: 1 }}>{text}</Text>
            </View>
          ))}
        </View>

        <HRule style={{ marginTop: 8 }} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 8 }}>
          {[
            ["LEAD MANAGER", cover.leadManager],
            ["REGISTRAR", cover.registrar],
            ["MARKET MAKER", cover.marketMaker],
          ].map(([label, value]) => (
            <View key={label} style={{ width: "32%", alignItems: "center" }}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 7, color: GREY }}>{label}</Text>
              <Text style={{ fontFamily: "Times-Bold", fontSize: 9, marginTop: 2, textAlign: "center" }}>{value}</Text>
            </View>
          ))}
        </View>

        <HRule color={GOLD} style={{ marginTop: 16 }} />
        <View style={{ paddingTop: 6, alignItems: "center" }}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8, color: GOLD }}>
            PREPARATORY DRAFT GENERATED BY DRAFTER — NOT FOR FILING
          </Text>
          <Text style={{ fontSize: 7, color: GREY, marginTop: 2, textAlign: "center" }}>
            Regulation set {document.regulationSetVersion} ·{" "}
            {document.generationMode === "llm"
              ? `Narrative drafted by ${document.llmModel}`
              : "Narrative from deterministic templates"}
          </Text>
        </View>
      </Page>

      {/* Table of contents */}
      <Page size="A4" style={styles.page}>
        <Footer left="Preparatory draft — not for filing" />
        <Text style={{ fontFamily: "Times-Bold", fontSize: 18, color: NAVY, marginBottom: 12 }}>TABLE OF CONTENTS</Text>
        {document.sections.map((section) => (
          <View key={section.id}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9, color: NAVY, marginTop: 8, marginBottom: 3 }}>
              {section.title}
            </Text>
            {section.chapterIds.map((chapterId) => {
              const chapter = document.chapters.find((candidate) => candidate.id === chapterId);
              if (!chapter) return null;
              return (
                <View
                  key={chapter.id}
                  style={{ flexDirection: "row", justifyContent: "space-between", paddingLeft: 10, marginBottom: 2 }}
                  wrap={false}
                >
                  <Text style={{ fontSize: 9.5 }}>
                    {chapter.id}   {chapter.title}
                  </Text>
                  <Text style={{ fontFamily: "Helvetica", fontSize: 8, color: GREY }}>
                    {chapter.status === "generated" ? "Drafted" : chapter.status === "partial" ? "Partial" : "Skeleton"}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
      </Page>

      {/* Body — one Page per section.
          A real prospectus starts each section on a new page, and it keeps each
          Page's node tree small enough for react-pdf to lay out reliably: a
          single Page holding all 34 chapters overflows its layout engine and
          produces invalid geometry. */}
      {document.sections.map((section) => (
        <Page key={section.id} size="A4" style={styles.page}>
          <Footer left="Preparatory draft — not for filing" />
          <View>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <HRule color={NAVY} height={1.5} style={{ marginBottom: 10 }} />
          </View>
          {section.chapterIds.map((chapterId) => {
            const chapter = document.chapters.find((candidate) => candidate.id === chapterId);
            if (!chapter) return null;
            return (
              <View key={chapter.id}>
                <Text style={styles.chapterKicker}>CHAPTER {chapter.id}</Text>
                <Text style={styles.chapterTitle}>{chapter.title}</Text>
                <Text style={styles.chapterMap}>
                  Maps to disclosure requirements: {chapter.requirementIds.join(", ") || "—"}
                </Text>
                {chapter.blocks.map((block, index) => (
                  <BlockView key={index} block={block} />
                ))}
              </View>
            );
          })}
        </Page>
      ))}
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Standalone gap report PDF
// ---------------------------------------------------------------------------

export function GapPdf({ gapReport, eligibility }: { gapReport: GapReport; eligibility?: EligibilityReport }) {
  const summaryColumns: TableColumn[] = [
    { header: "Particulars", width: 70 },
    { header: "Value", numeric: true, width: 30 },
  ];
  const summaryRows = [
    ["Overall coverage", `${gapReport.coveragePct}%`],
    ["Issuer-controllable coverage", `${gapReport.issuerCoveragePct}%`],
    ["Requirements complete", `${gapReport.counts.complete} of ${gapReport.counts.total}`],
    ["Partial", String(gapReport.counts.partial)],
    ["Missing", String(gapReport.counts.missing)],
    ["Defects (consistency / disclosure)", String(gapReport.counts.defect)],
    ["High-severity findings", String(gapReport.findingCounts.high)],
  ];

  const registerColumns: TableColumn[] = [
    { header: "ID", width: 10 },
    { header: "Requirement", width: 56 },
    { header: "Status", width: 14 },
    { header: "Section", width: 20 },
  ];
  const registerRows = gapReport.items.map((item) => [
    item.id,
    item.requirement,
    item.status,
    item.sectionTitle,
  ]);

  return (
    <Document title={`${gapReport.issuerName} — Gap & Consistency Report`} author="Drafter">
      <Page size="A4" style={styles.page}>
        <Footer left="Drafter Gap & Consistency Report" />

        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10, color: GOLD }}>GAP &amp; CONSISTENCY REPORT</Text>
        <Text style={{ fontFamily: "Times-Bold", fontSize: 20, color: NAVY, marginTop: 2 }}>{gapReport.issuerName}</Text>
        <Text style={{ fontFamily: "Helvetica-Oblique", fontSize: 8.5, color: GREY, marginTop: 3, marginBottom: 10 }}>
          Modelled on an exchange pre-check report. A preparatory aid; not the merchant banker&apos;s due-diligence review
          or the exchange&apos;s examination.
        </Text>

        <View
          style={{
            backgroundColor: gapReport.verdict.level === "substantially-complete" ? "#EAF3EE" : "#FBF1EC",
            padding: 10,
            marginBottom: 12,
          }}
        >
          <Text style={{ fontFamily: "Times-Bold", fontSize: 12, color: NAVY }}>{gapReport.verdict.headline}</Text>
          <Text style={{ fontSize: 9, marginTop: 3 }}>{gapReport.verdict.detail}</Text>
        </View>

        {/* Eligibility gate — before the coverage summary, because whether the
            issuer MAY make the issue outranks how complete the draft is. */}
        {eligibility ? (
          <View>
            <View
              style={{
                backgroundColor:
                  eligibility.verdict.level === "ineligible"
                    ? "#F7E8E6"
                    : eligibility.verdict.level === "indeterminate"
                      ? "#FBF3E6"
                      : "#EAF3EE",
                padding: 10,
                marginBottom: 8,
              }}
            >
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8, color: GOLD }}>
                ELIGIBILITY GATE — CHAPTER IX
              </Text>
              <Text style={{ fontFamily: "Times-Bold", fontSize: 12, color: NAVY, marginTop: 3 }}>
                {eligibility.verdict.headline}
              </Text>
              <Text style={{ fontSize: 9, marginTop: 3 }}>{eligibility.verdict.detail}</Text>
              <Text style={{ fontSize: 8, color: GREY, marginTop: 4 }}>
                {eligibility.counts.met} satisfied &middot; {eligibility.counts.notMet} not satisfied &middot;{" "}
                {eligibility.counts.unknown} unanswered &middot; {eligibility.counts.notApplicable} not applicable
              </Text>
            </View>

            {eligibility.conditions
              .filter((condition) => condition.applicable && condition.state !== "met")
              .map((condition) => (
                <View key={condition.id} style={{ marginBottom: 7 }} wrap={false}>
                  <Text style={{ marginBottom: 1 }}>
                    <Text
                      style={{
                        fontFamily: "Helvetica-Bold",
                        fontSize: 9,
                        color: condition.state === "not-met" ? RED : NAVY,
                      }}
                    >
                      {condition.source}{"  "}
                    </Text>
                    <Text style={{ fontFamily: "Helvetica", fontSize: 8, color: GREY }}>
                      {condition.state === "not-met" ? "NOT SATISFIED" : "NOT YET ANSWERABLE"}
                    </Text>
                  </Text>
                  <Text style={{ fontSize: 8.5, textAlign: "justify", marginBottom: 1 }}>{condition.requirement}</Text>
                  <Text style={{ fontFamily: "Times-Bold", fontSize: 9, marginBottom: 1 }}>{condition.finding}</Text>
                  {condition.values?.length ? (
                    <Text style={{ fontSize: 8, color: GREY, marginBottom: 1 }}>
                      {condition.values.map((value) => `${value.label}: ${value.value}`).join("   |   ")}
                    </Text>
                  ) : null}
                  {condition.action ? (
                    <Text style={{ fontSize: 8, marginBottom: 1 }}>
                      <Text style={{ fontFamily: "Helvetica-Bold" }}>What to do: </Text>
                      {condition.action}
                    </Text>
                  ) : null}
                </View>
              ))}

            <Text style={{ fontFamily: "Helvetica-Oblique", fontSize: 7.5, color: GREY, marginBottom: 10 }}>
              Assessed against {eligibility.regulationSet}. The SME exchange applies its own track-record and net-worth
              criteria under Regulation 229(3), which are not tested here.
            </Text>
          </View>
        ) : null}

        <Text style={styles.h2}>Summary</Text>
        <View style={styles.table}>
          <SafeTable columns={summaryColumns} rows={summaryRows} />
        </View>

        <Text style={styles.h2}>Findings ({gapReport.findings.length})</Text>
        {gapReport.findings.map((finding) => (
          <View key={finding.code} style={{ marginBottom: 8 }} wrap={false}>
            <Text style={{ marginBottom: 1 }}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9.5, color: finding.severity === "high" ? RED : NAVY }}>
                {finding.code}{"  "}
              </Text>
              <Text style={{ fontFamily: "Helvetica", fontSize: 8, color: GREY }}>
                [{finding.severity.toUpperCase()}] {finding.category} · {finding.requirementId}
              </Text>
            </Text>
            <Text style={{ fontFamily: "Times-Bold", fontSize: 10, marginBottom: 1 }}>{finding.title}</Text>
            <Text style={{ fontSize: 8.5, textAlign: "justify", marginBottom: 1 }}>{finding.observation}</Text>
            <Text style={{ fontSize: 8, color: GREY, marginBottom: 1 }}>
              Location: {finding.locations.map((l) => `${l.chapterId} ${l.chapterTitle}`).join("; ")}
            </Text>
            {finding.exchangePattern ? (
              <Text style={{ fontSize: 8, color: GREY, marginBottom: 1 }}>
                <Text style={{ fontFamily: "Helvetica-Bold", color: RED }}>Why the exchange returns this: </Text>
                {finding.exchangePattern}
              </Text>
            ) : null}
            <Text style={{ fontSize: 8.5 }}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>How to fix: </Text>
              {finding.remediation}
            </Text>
          </View>
        ))}

        <Text style={styles.h2}>Requirement register</Text>
        <View style={styles.table}>
          <SafeTable
            columns={registerColumns}
            rows={registerRows}
            cellStyle={(rowIndex, colIndex) => {
              if (colIndex !== 2) return {};
              const status = gapReport.items[rowIndex]?.status;
              if (status === "Defect") return { color: RED, fontFamily: "Times-Bold" };
              if (status === "Complete") return { color: GREEN };
              return { color: GREY };
            }}
          />
        </View>

        <Text style={{ fontFamily: "Helvetica-Oblique", fontSize: 7.5, color: GREY, marginTop: 10 }}>
          Regulation set {gapReport.registryVersion}. {gapReport.regulationSet}
        </Text>
      </Page>
    </Document>
  );
}
