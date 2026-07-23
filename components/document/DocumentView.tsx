"use client";

import * as React from "react";
import {
  AlertTriangle,
  ChevronRight,
  Eye,
  EyeOff,
  FileDown,
  Loader2,
  ScrollText,
} from "lucide-react";
import type { DrhpDocument, Finding, GapReport } from "@/lib/types";
import { applyBankerEdits, useDrafter } from "@/lib/store";
import { chapterAnchor, cn } from "@/lib/utils";
import { Badge, Button, EmptyState } from "@/components/ui/primitives";
import { BlockRenderer, ProvenanceLegend, StatusChip } from "./BlockRenderer";
import { CoverPage } from "./CoverPage";

export function DocumentView() {
  const {
    document: rawDocument,
    gapReport,
    generate,
    generating,
    role,
    bankerEdits,
    setBankerEdit,
    clearBankerEdit,
  } = useDrafter();

  const [showProvenance, setShowProvenance] = React.useState(false);
  const [activeChapter, setActiveChapter] = React.useState<string>("COVER");
  const [exporting, setExporting] = React.useState<string | null>(null);

  const document = React.useMemo(
    () => (rawDocument ? applyBankerEdits(rawDocument, bankerEdits) : null),
    [rawDocument, bankerEdits],
  );

  // Findings indexed by the chapter they are located in, so each chapter can
  // show the pre-check issues that sit inside it.
  const findingsByChapter = React.useMemo(() => {
    const map: Record<string, Finding[]> = {};
    for (const finding of gapReport.findings) {
      if (finding.severity === "low") continue; // keep the document readable
      for (const location of finding.locations) {
        (map[location.chapterId] ??= []).push(finding);
      }
    }
    return map;
  }, [gapReport]);

  // Track the chapter currently in view to highlight the TOC.
  React.useEffect(() => {
    if (!document) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) setActiveChapter(visible.target.id.replace(/^ch-/, "").replace(/-/g, "."));
      },
      { rootMargin: "-140px 0px -70% 0px", threshold: 0 },
    );
    const nodes = window.document.querySelectorAll("[data-chapter-anchor]");
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [document]);

  async function handleExport(kind: "docx" | "pdf") {
    if (!document) return;
    setExporting(kind);
    try {
      const response = await fetch(`/api/export/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document, gapReport }),
      });
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      downloadBlob(
        blob,
        `${document.issuerName.replace(/[^\w]+/g, "_")}_Draft_DRHP.${kind}`,
      );
    } catch (error) {
      alert(`Export failed: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      setExporting(null);
    }
  }

  if (!document) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={<ScrollText className="h-8 w-8" />}
          title="No draft generated yet"
          description="Drafter builds the document from the SME DRHP structure — Sections I to IX, 34 chapters — filling each chapter from the issuer data you supply in the guided intake."
          action={
            <Button onClick={generate} disabled={generating}>
              {generating ? <Loader2 className="animate-spin" /> : <ScrollText />}
              Generate the draft DRHP
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1600px] gap-8 px-4 py-6 sm:px-6">
      {/* ---------------------------------------------------------------- */}
      {/* Sticky table of contents                                          */}
      {/* ---------------------------------------------------------------- */}
      <aside className="no-print sticky top-[152px] hidden h-[calc(100vh-180px)] w-[300px] shrink-0 overflow-y-auto thin-scrollbar lg:block">
        <TableOfContents
          document={document}
          activeChapter={activeChapter}
          findingsByChapter={findingsByChapter}
        />
      </aside>

      {/* ---------------------------------------------------------------- */}
      {/* Document                                                          */}
      {/* ---------------------------------------------------------------- */}
      <div className="min-w-0 flex-1">
        {/* Toolbar */}
        <div className="no-print mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="secondary">{document.stats.totalChapters} chapters</Badge>
            <Badge variant="secondary">{document.stats.totalWords.toLocaleString("en-IN")} words</Badge>
            <Badge variant="secondary">{document.stats.totalTables} tables</Badge>
            {document.stats.placeholders > 0 ? (
              <Badge variant="partial">{document.stats.placeholders} items to supply</Badge>
            ) : null}
          </div>

          <div className="flex-1" />

          <Button
            variant={showProvenance ? "default" : "outline"}
            size="sm"
            onClick={() => setShowProvenance((value) => !value)}
            title="Show the source of every block — the disclosure trail"
          >
            {showProvenance ? <EyeOff /> : <Eye />}
            {showProvenance ? "Hide" : "Show"} disclosure trail
          </Button>

          <Button variant="outline" size="sm" onClick={() => handleExport("docx")} disabled={exporting !== null}>
            {exporting === "docx" ? <Loader2 className="animate-spin" /> : <FileDown />}
            DOCX
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("pdf")} disabled={exporting !== null}>
            {exporting === "pdf" ? <Loader2 className="animate-spin" /> : <FileDown />}
            PDF
          </Button>
        </div>

        {showProvenance ? (
          <div className="no-print mb-5 rounded-lg border border-border bg-card p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
              Disclosure trail
            </p>
            <ProvenanceLegend />
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              Every block records where its content came from and which disclosure requirements it
              discharges. This is what makes the draft auditable — and it is the same structure a
              supervisor could consume as machine-readable data.
            </p>
          </div>
        ) : null}

        {role === "banker" ? (
          <div className="no-print mb-5 rounded-lg border border-accent/40 bg-accent/[0.06] p-3 text-[12.5px]">
            <p className="font-semibold text-accent">Merchant-banker review mode</p>
            <p className="mt-0.5 text-muted-foreground">
              Hover any paragraph to amend it. Amendments are tracked separately from the promoter&apos;s
              draft and are listed in the Merchant Banker workspace as a version diff.
            </p>
          </div>
        ) : null}

        <CoverPage cover={document.cover} document={document} />

        {/* Sections and chapters */}
        {document.sections.map((section) => (
          <section key={section.id} className="mt-10">
            <div className="mb-5 border-b-2 border-primary pb-2">
              <h2 className="font-serif text-[21px] font-bold uppercase tracking-[0.04em] text-primary">
                {section.title}
              </h2>
            </div>

            {section.chapterIds.map((chapterId) => {
              const chapter = document.chapters.find((candidate) => candidate.id === chapterId);
              if (!chapter) return null;
              const findings = findingsByChapter[chapter.id] ?? [];

              return (
                <article
                  key={chapter.id}
                  id={chapterAnchor(chapter.id)}
                  data-chapter-anchor
                  className="mb-8 scroll-mt-40 border border-border bg-paper px-6 py-7 shadow-sm sm:px-10 sm:py-9"
                >
                  {/* Chapter header */}
                  <header className="mb-6 border-b border-border pb-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-sans text-[11px] font-bold uppercase tracking-[0.16em] text-accent">
                        Chapter {chapter.id}
                      </span>
                      <StatusChip status={chapter.status} />
                      <Badge variant="outline">{chapter.mode}</Badge>
                      {chapter.priority ? <Badge variant="accent">priority</Badge> : null}
                    </div>
                    <h3 className="prospectus-h1 mt-2 !text-[22px]">{chapter.title}</h3>

                    {/* Requirement mapping — shown on every chapter, always */}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className="font-sans text-[10.5px] uppercase tracking-wider text-muted-foreground">
                        Maps to disclosure requirements
                      </span>
                      {chapter.requirementIds.map((id) => (
                        <span
                          key={id}
                          className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-medium text-secondary-foreground"
                        >
                          {id}
                        </span>
                      ))}
                    </div>
                  </header>

                  {/* Pre-check findings located in this chapter */}
                  {findings.length ? (
                    <div className="no-print mb-6 space-y-2">
                      {findings.map((finding) => (
                        <div
                          key={finding.code}
                          className={cn(
                            "rounded-md border-l-[3px] p-3 font-sans",
                            finding.severity === "high"
                              ? "border-[hsl(var(--status-defect))] bg-[hsl(var(--status-defect))]/[0.06]"
                              : "border-[hsl(var(--status-partial))] bg-[hsl(var(--status-partial))]/[0.06]",
                          )}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <AlertTriangle
                              className={cn(
                                "h-3.5 w-3.5",
                                finding.severity === "high"
                                  ? "text-[hsl(var(--status-defect))]"
                                  : "text-[hsl(var(--status-partial))]",
                              )}
                            />
                            <span className="font-mono text-[10px] font-semibold">{finding.code}</span>
                            <Badge variant={finding.severity === "high" ? "defect" : "partial"}>
                              {finding.category}
                            </Badge>
                            <span className="text-[12.5px] font-semibold">{finding.title}</span>
                          </div>
                          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                            {finding.observation}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {/* Chapter body */}
                  <div className="prospectus">
                    {chapter.blocks.map((block, index) => (
                      <BlockRenderer
                        key={index}
                        block={block}
                        index={index}
                        chapterId={chapter.id}
                        showProvenance={showProvenance}
                        editable={role === "banker" && block.kind === "para"}
                        edited={Boolean(bankerEdits[`${chapter.id}:${index}`])}
                        onEdit={(blockIndex, original, edited) =>
                          setBankerEdit(chapter.id, blockIndex, original, edited)
                        }
                        onRevert={(blockIndex) => clearBankerEdit(chapter.id, blockIndex)}
                      />
                    ))}
                  </div>
                </article>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table of contents
// ---------------------------------------------------------------------------

function TableOfContents({
  document,
  activeChapter,
  findingsByChapter,
}: {
  document: DrhpDocument;
  activeChapter: string;
  findingsByChapter: Record<string, Finding[]>;
}) {
  return (
    <nav className="rounded-lg border border-border bg-card p-3">
      <p className="mb-2 px-2 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
        Table of Contents
      </p>

      <a
        href="#ch-COVER"
        className={cn(
          "mb-1 flex items-center gap-1.5 rounded px-2 py-1.5 text-[12px] font-medium transition-colors",
          activeChapter === "COVER"
            ? "bg-secondary text-primary"
            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
        )}
      >
        <ChevronRight className="h-3 w-3" />
        Cover Page
      </a>

      {document.sections.map((section) => (
        <div key={section.id} className="mb-2">
          <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            {section.title}
          </p>
          {section.chapterIds.map((chapterId) => {
            const chapter = document.chapters.find((candidate) => candidate.id === chapterId);
            if (!chapter) return null;
            const active = activeChapter === chapter.id;
            const highFindings = (findingsByChapter[chapter.id] ?? []).filter(
              (finding) => finding.severity === "high",
            ).length;

            return (
              <a
                key={chapter.id}
                href={`#${chapterAnchor(chapter.id)}`}
                className={cn(
                  "flex items-start gap-2 rounded px-2 py-1.5 text-[12px] leading-snug transition-colors",
                  active
                    ? "bg-secondary font-medium text-primary"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                    chapter.status === "generated"
                      ? "bg-[hsl(var(--status-complete))]"
                      : chapter.status === "partial"
                        ? "bg-[hsl(var(--status-partial))]"
                        : "bg-[hsl(var(--status-missing))]",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-[10px] text-muted-foreground">{chapter.id}</span>{" "}
                  {chapter.title}
                </span>
                {highFindings > 0 ? (
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--status-defect))] text-[9px] font-bold text-white">
                    {highFindings}
                  </span>
                ) : null}
              </a>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
