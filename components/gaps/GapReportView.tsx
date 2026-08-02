"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FileDown,
  Filter,
  Info,
  Loader2,
  MapPin,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useDrafter } from "@/lib/store";
import type { Finding, FindingCategory, FindingSeverity, RequirementStatus } from "@/lib/types";
import { cn, formatTimestamp } from "@/lib/utils";
import { Badge, Button, Card, CardContent, Progress, Select } from "@/components/ui/primitives";
import { downloadBlob } from "@/components/document/DocumentView";
import { ActionPlanPanel } from "./ActionPlanPanel";
import { EligibilityPanel } from "./EligibilityPanel";

const SEVERITY_META: Record<FindingSeverity, { label: string; tone: string; badge: "defect" | "partial" | "outline" }> =
  {
    high: { label: "High", tone: "text-[hsl(var(--status-defect))]", badge: "defect" },
    medium: { label: "Medium", tone: "text-[hsl(var(--status-partial))]", badge: "partial" },
    low: { label: "Low", tone: "text-muted-foreground", badge: "outline" },
  };

const STATUS_BADGE: Record<RequirementStatus, "complete" | "partial" | "missing" | "defect" | "outline"> = {
  Complete: "complete",
  Partial: "partial",
  Missing: "missing",
  Defect: "defect",
  // Sector-conditional and inapplicable to this issuer — shown neutrally,
  // because it is not a gap and does not count against the coverage score.
  "Not applicable": "outline",
};

export function GapReportView() {
  const { gapReport, document, eligibility } = useDrafter();
  const [categoryFilter, setCategoryFilter] = React.useState<FindingCategory | "all">("all");
  const [statusFilter, setStatusFilter] = React.useState<RequirementStatus | "all">("all");
  const [exporting, setExporting] = React.useState(false);

  const filteredFindings = gapReport.findings.filter(
    (finding) => categoryFilter === "all" || finding.category === categoryFilter,
  );

  const filteredItems = gapReport.items.filter(
    (item) => statusFilter === "all" || item.status === statusFilter,
  );

  async function exportGapReport() {
    setExporting(true);
    try {
      const response = await fetch("/api/export/gap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gapReport, document, eligibility }),
      });
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      downloadBlob(blob, `${gapReport.issuerName.replace(/[^\w]+/g, "_")}_Gap_Report.docx`);
    } catch (error) {
      alert(`Export failed: ${error instanceof Error ? error.message : "unknown"}`);
    } finally {
      setExporting(false);
    }
  }

  const verdictTone =
    gapReport.verdict.level === "attention"
      ? "border-[hsl(var(--status-defect))] bg-[hsl(var(--status-defect))]/[0.06]"
      : gapReport.verdict.level === "not-ready"
        ? "border-[hsl(var(--status-partial))] bg-[hsl(var(--status-partial))]/[0.06]"
        : "border-[hsl(var(--status-complete))] bg-[hsl(var(--status-complete))]/[0.06]";

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      {/* Report masthead, reads like an exchange pre-check report */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="font-serif text-[24px] font-bold text-primary">
              Gap &amp; Consistency Report
            </h1>
          </div>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
            Modelled on an exchange pre-check report: compliance issues, inconsistencies and missing
            information, each with the return pattern that would bounce the draft, and its exact
            location in the document. Runs on {gapReport.issuerName}.
          </p>
        </div>
        <Button onClick={exportGapReport} disabled={exporting} variant="outline">
          {exporting ? <Loader2 className="animate-spin" /> : <FileDown />}
          Export compliance checklist
        </Button>
      </div>

      {/* Eligibility comes first: whether the issuer MAY make the issue at all
          outranks how complete the draft is. */}
      <EligibilityPanel />

      {/* Verdict banner */}
      <div className={cn("mb-6 rounded-lg border-l-4 p-4", verdictTone)}>
        <div className="flex items-start gap-3">
          {gapReport.verdict.level === "substantially-complete" ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--status-complete))]" />
          ) : (
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--status-defect))]" />
          )}
          <div>
            <p className="text-[15px] font-semibold text-foreground">{gapReport.verdict.headline}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {gapReport.verdict.detail}
            </p>
          </div>
        </div>
      </div>

      {/* Score strip */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Overall coverage
            </p>
            <p className="font-serif text-[30px] font-bold tabular-nums text-primary">
              {gapReport.coveragePct}%
            </p>
            <Progress
              value={gapReport.coveragePct}
              className="mt-1"
              indicatorClassName={
                gapReport.coveragePct >= 85
                  ? "bg-[hsl(var(--status-complete))]"
                  : "bg-[hsl(var(--status-partial))]"
              }
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Weighted across {gapReport.counts.total} requirements
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Issuer-controllable
            </p>
            <p className="font-serif text-[30px] font-bold tabular-nums text-primary">
              {gapReport.issuerCoveragePct}%
            </p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Excludes {gapReport.counts.bankerDependent} items reserved to the banker or auditor
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Pre-check findings
            </p>
            <p className="font-serif text-[30px] font-bold tabular-nums text-primary">
              {gapReport.findings.length}
            </p>
            <div className="mt-1.5 flex gap-1.5">
              {gapReport.findingCounts.high > 0 ? (
                <Badge variant="defect">{gapReport.findingCounts.high} high</Badge>
              ) : null}
              {gapReport.findingCounts.medium > 0 ? (
                <Badge variant="partial">{gapReport.findingCounts.medium} medium</Badge>
              ) : null}
              {gapReport.findingCounts.low > 0 ? (
                <Badge variant="outline">{gapReport.findingCounts.low} low</Badge>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Requirement status
            </p>
            <div className="mt-2 space-y-1 text-[12px]">
              <StatusLine label="Complete" value={gapReport.counts.complete} tone="complete" />
              <StatusLine label="Partial" value={gapReport.counts.partial} tone="partial" />
              <StatusLine label="Missing" value={gapReport.counts.missing} tone="missing" />
              <StatusLine label="Defect" value={gapReport.counts.defect} tone="defect" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* The score says what is wrong; this says what to do about it, and in
          what order. It sits between them deliberately. */}
      <ActionPlanPanel />

      {/* Findings */}
      <div className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-serif text-[18px] font-bold text-primary">
            <AlertTriangle className="h-4 w-4 text-accent" />
            Findings ({filteredFindings.length})
          </h2>
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <Select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value as FindingCategory | "all")}
              className="h-8 w-[190px] text-xs"
            >
              <option value="all">All categories</option>
              <option value="Inconsistency">Inconsistency ({gapReport.findingCounts.byCategory.Inconsistency})</option>
              <option value="Red Flag">Red Flag ({gapReport.findingCounts.byCategory["Red Flag"]})</option>
              <option value="Compliance Issue">
                Compliance Issue ({gapReport.findingCounts.byCategory["Compliance Issue"]})
              </option>
              <option value="Missing Information">
                Missing Information ({gapReport.findingCounts.byCategory["Missing Information"]})
              </option>
            </Select>
          </div>
        </div>

        {filteredFindings.length === 0 ? (
          <Card>
            <CardContent className="flex items-center gap-3 p-6">
              <CheckCircle2 className="h-5 w-5 text-[hsl(var(--status-complete))]" />
              <p className="text-[13px] text-muted-foreground">
                No findings in this category. Any inconsistency or undisclosed matter would appear here
                with its exact location.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredFindings.map((finding) => (
              <FindingCard key={finding.code} finding={finding} />
            ))}
          </div>
        )}
      </div>

      {/* Requirement register */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-[18px] font-bold text-primary">
            {/* The denominator is the whole registry, not counts.total, which is the
                APPLICABLE subset used as the coverage denominator. The register lists
                every requirement including the not-applicable ones, so pairing the two
                read "76 of 74". */}
            Requirement register ({filteredItems.length} of {gapReport.items.length})
          </h2>
          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as RequirementStatus | "all")}
            className="h-8 w-[170px] text-xs"
          >
            <option value="all">All statuses</option>
            <option value="Complete">Complete</option>
            <option value="Partial">Partial</option>
            <option value="Missing">Missing</option>
            <option value="Defect">Defect</option>
          </Select>
        </div>

        <Card>
          <div className="divide-y divide-border">
            {filteredItems.map((item) => (
              <details key={item.id} className="group">
                <summary className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-secondary/40">
                  <span className="font-mono text-[11px] font-semibold text-muted-foreground">{item.id}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">{item.requirement}</span>
                  {item.fulfilment === "banker_certification" ? (
                    <Badge variant="outline">banker</Badge>
                  ) : item.fulfilment === "standard_clause" ? (
                    <Badge variant="outline">standard</Badge>
                  ) : null}
                  <Badge variant={STATUS_BADGE[item.status]}>{item.status}</Badge>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-2 bg-secondary/20 px-4 py-3 text-[12px]">
                  <p className="text-muted-foreground">{item.detail}</p>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11.5px]">
                    <span>
                      <span className="font-semibold text-foreground">Source:</span>{" "}
                      <span className="text-muted-foreground">{item.source}</span>
                    </span>
                    <span>
                      <span className="font-semibold text-foreground">Evidence:</span>{" "}
                      <span className="text-muted-foreground">{item.evidence}</span>
                    </span>
                    <span>
                      <span className="font-semibold text-foreground">Chapters:</span>{" "}
                      <span className="text-muted-foreground">
                        {item.chapters.map((chapterId, index) => (
                          <span key={chapterId}>
                            {chapterId} {item.chapterTitles[index]}
                            {index < item.chapters.length - 1 ? "; " : ""}
                          </span>
                        ))}
                      </span>
                    </span>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </Card>
      </div>

      <p className="mt-6 flex items-start gap-2 rounded-md bg-secondary/50 p-3 text-[11.5px] text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Report generated {formatTimestamp(gapReport.generatedAt)} against regulation set{" "}
          {gapReport.registryVersion}. {gapReport.regulationSet} This report is a preparatory aid; it
          does not constitute the merchant banker&apos;s due-diligence review or the exchange&apos;s
          own examination.
        </span>
      </p>
    </div>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const meta = SEVERITY_META[finding.severity];
  return (
    <Card
      className={cn(
        "overflow-hidden border-l-4",
        finding.severity === "high"
          ? "border-l-[hsl(var(--status-defect))]"
          : finding.severity === "medium"
            ? "border-l-[hsl(var(--status-partial))]"
            : "border-l-border",
      )}
    >
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] font-bold text-foreground">{finding.code}</span>
          <Badge variant={meta.badge}>{meta.label}</Badge>
          <Badge variant="secondary">{finding.category}</Badge>
          {finding.planted ? (
            <Badge variant="accent" title="A deliberately planted defect in this sample issuer">
              planted defect
            </Badge>
          ) : null}
          <span className="font-mono text-[10px] text-muted-foreground">{finding.requirementId}</span>
        </div>

        <h3 className="mt-2 text-[14.5px] font-semibold text-foreground">{finding.title}</h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{finding.observation}</p>

        {finding.values?.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <tbody>
                {finding.values.map((value, index) => (
                  <tr key={index} className="border-b border-border/60 last:border-0">
                    <td className="py-1 pr-4 font-medium text-foreground">{value.label}</td>
                    <td className="py-1 font-mono tabular-nums text-muted-foreground">{value.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-medium text-muted-foreground">Location:</span>
          {finding.locations.map((location) => (
            <a
              key={location.chapterId}
              href={`/document#ch-${location.chapterId.replace(/\./g, "-")}`}
              className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {location.chapterId} · {location.chapterTitle}
            </a>
          ))}
        </div>

        {finding.exchangePattern ? (
          <p className="mt-3 rounded-md bg-[hsl(var(--status-defect))]/[0.05] p-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-[hsl(var(--status-defect))]">
              Why the exchange returns this:{" "}
            </span>
            {finding.exchangePattern}
          </p>
        ) : null}

        <p className="mt-2 text-[12px] leading-relaxed">
          <span className="font-semibold text-foreground">How to fix: </span>
          <span className="text-muted-foreground">{finding.remediation}</span>
        </p>
      </CardContent>
    </Card>
  );
}

function StatusLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "complete" | "partial" | "missing" | "defect";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            tone === "complete" && "bg-[hsl(var(--status-complete))]",
            tone === "partial" && "bg-[hsl(var(--status-partial))]",
            tone === "missing" && "bg-[hsl(var(--status-missing))]",
            tone === "defect" && "bg-[hsl(var(--status-defect))]",
          )}
        />
        <span className="text-muted-foreground">{label}</span>
      </span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
