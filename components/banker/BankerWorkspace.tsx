"use client";

import * as React from "react";
import {
  BriefcaseBusiness,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  FileDown,
  GitCompareArrows,
  Loader2,
  ScrollText,
  ShieldAlert,
  UserCog,
} from "lucide-react";
import { useDrafter } from "@/lib/store";
import {
  buildDueDiligence,
  buildRegulatoryMap,
  dueDiligenceSummary,
  type DDItem,
} from "@/lib/engine/dueDiligence";
import { getRequirement } from "@/lib/data";
import { cn, formatTimestamp } from "@/lib/utils";
import { Badge, Button, Card, CardContent, EmptyState } from "@/components/ui/primitives";
import { downloadBlob } from "@/components/document/DocumentView";

type Tab = "checklist" | "mapping" | "risks" | "diff";

export function BankerWorkspace() {
  const { issuerData, gapReport, document, bankerEdits, setRole, clearBankerEdit, generate, generating } =
    useDrafter();
  const [tab, setTab] = React.useState<Tab>("checklist");
  const [exporting, setExporting] = React.useState(false);

  React.useEffect(() => {
    // Entering the workspace puts the whole app in banker mode so document edits
    // are available there too.
    setRole("banker");
  }, [setRole]);

  const ddItems = React.useMemo(() => buildDueDiligence(issuerData), [issuerData]);
  const ddSummary = dueDiligenceSummary(ddItems);
  const regulatoryMap = React.useMemo(() => buildRegulatoryMap(gapReport), [gapReport]);
  const riskFindings = gapReport.findings.filter((finding) => finding.severity !== "low");
  const edits = Object.values(bankerEdits);

  async function exportChecklist() {
    setExporting(true);
    try {
      const response = await fetch("/api/export/gap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gapReport, document, dueDiligence: ddItems }),
      });
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      downloadBlob(blob, `${gapReport.issuerName.replace(/[^\w]+/g, "_")}_DD_Checklist.docx`);
    } catch (error) {
      alert(`Export failed: ${error instanceof Error ? error.message : "unknown"}`);
    } finally {
      setExporting(false);
    }
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: "checklist", label: "Due-diligence checklist", icon: <ClipboardCheck className="h-3.5 w-3.5" />, count: ddSummary.total },
    { id: "mapping", label: "Regulatory mapping", icon: <ScrollText className="h-3.5 w-3.5" />, count: regulatoryMap.length },
    { id: "risks", label: "Risk flags", icon: <ShieldAlert className="h-3.5 w-3.5" />, count: riskFindings.length },
    { id: "diff", label: "Version diff", icon: <GitCompareArrows className="h-3.5 w-3.5" />, count: edits.length },
  ];

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BriefcaseBusiness className="h-5 w-5 text-primary" />
            <h1 className="font-serif text-[24px] font-bold text-primary">Merchant-Banker Workspace</h1>
          </div>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
            The same preparatory draft, seen as due-diligence work product. Drafter does the
            first-draft assembly and the gap check; the merchant banker retains the review, due
            diligence and certification that SEBI requires. Reviewing {gapReport.issuerName}.
          </p>
        </div>
        <Button onClick={exportChecklist} disabled={exporting} variant="outline">
          {exporting ? <Loader2 className="animate-spin" /> : <FileDown />}
          Export DD checklist
        </Button>
      </div>

      {/* Accountability banner */}
      <div className="mb-6 rounded-lg border-l-4 border-accent bg-accent/[0.06] p-4">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-accent">
          <UserCog className="h-4 w-4" />
          The intermediary role is preserved, not removed
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          This draft is a preparatory document. It is not a filing and may be submitted only by the
          authorised merchant banker after due diligence and certification. Drafter reduces the
          early-stage effort of first-draft preparation; the accountability chain, banker due
          diligence, auditor certification, exchange examination and SEBI oversight, is unchanged.
        </p>
      </div>

      {/* Summary tiles */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <SummaryTile label="Documents provided" value={ddSummary.provided} total={ddSummary.total} tone="complete" />
        <SummaryTile label="Outstanding from issuer" value={ddSummary.outstanding} total={ddSummary.total} tone="partial" />
        <SummaryTile label="Banker / auditor to obtain" value={ddSummary.bankerToObtain} total={ddSummary.total} tone="neutral" />
        <SummaryTile label="Open risk flags" value={riskFindings.length} tone={riskFindings.length ? "defect" : "complete"} />
      </div>

      {/* Tabs */}
      <div className="mb-5 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors",
              tab === item.id
                ? "border-accent text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined ? (
              <span className="ml-0.5 rounded-full bg-secondary px-1.5 text-[10px] font-semibold">
                {item.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "checklist" ? <ChecklistTab items={ddItems} /> : null}
      {tab === "mapping" ? <MappingTab map={regulatoryMap} /> : null}
      {tab === "risks" ? <RisksTab findings={riskFindings} /> : null}
      {tab === "diff" ? (
        <DiffTab
          edits={edits}
          hasDoc={Boolean(document)}
          onRevert={clearBankerEdit}
          onGenerate={generate}
          generating={generating}
        />
      ) : null}

      <p className="mt-6 text-[11px] text-muted-foreground">
        Workspace derived from regulation set {gapReport.registryVersion} ·{" "}
        {formatTimestamp(gapReport.generatedAt)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ChecklistTab({ items }: { items: DDItem[] }) {
  const STATUS_META = {
    provided: { label: "Provided", badge: "complete" as const, icon: <CheckCircle2 className="h-4 w-4 text-[hsl(var(--status-complete))]" /> },
    outstanding: { label: "Outstanding", badge: "partial" as const, icon: <CircleAlert className="h-4 w-4 text-[hsl(var(--status-partial))]" /> },
    "banker-to-obtain": { label: "Banker / auditor", badge: "outline" as const, icon: <UserCog className="h-4 w-4 text-muted-foreground" /> },
  };

  const RESPONSIBILITY_LABEL = {
    issuer: "Issuer",
    auditor: "Statutory auditor",
    "lead-manager": "Lead manager",
    "legal-counsel": "Legal counsel",
  };

  return (
    <Card>
      <div className="divide-y divide-border">
        {items.map((item) => {
          const meta = STATUS_META[item.status];
          return (
            <div key={item.id} className="flex items-start gap-3 p-4">
              <div className="mt-0.5">{meta.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] font-semibold text-muted-foreground">{item.id}</span>
                  <span className="text-[13.5px] font-medium text-foreground">{item.document}</span>
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground">{item.note}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary">{item.category}</Badge>
                  <span className="text-[10.5px] text-muted-foreground">
                    Responsibility: {RESPONSIBILITY_LABEL[item.responsibility]}
                  </span>
                  {item.requirementIds.map((id) => (
                    <span
                      key={id}
                      className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px]"
                      title={getRequirement(id)?.requirement}
                    >
                      {id}
                    </span>
                  ))}
                </div>
              </div>
              <Badge variant={meta.badge}>{meta.label}</Badge>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function MappingTab({ map }: { map: ReturnType<typeof buildRegulatoryMap> }) {
  return (
    <div className="space-y-3">
      {map.map((entry) => {
        const full = entry.satisfied === entry.total;
        return (
          <Card key={entry.chapterId}>
            <CardContent className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-bold text-accent">{entry.chapterId}</span>
                  <span className="text-[14px] font-semibold text-foreground">{entry.chapterTitle}</span>
                  <span className="text-[11px] text-muted-foreground">· {entry.sectionTitle}</span>
                </div>
                <Badge variant={full ? "complete" : "partial"}>
                  {entry.satisfied}/{entry.total} satisfied
                </Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <tbody>
                    {entry.requirements.map((requirement) => (
                      <tr key={requirement.id} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 pr-3 align-top">
                          <span className="font-mono text-[11px] font-semibold text-muted-foreground">
                            {requirement.id}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3">{requirement.requirement}</td>
                        <td className="py-1.5 pr-3 align-top">
                          <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                            {requirement.source}
                          </span>
                        </td>
                        <td className="py-1.5 text-right align-top">
                          <StatusPill status={requirement.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, "complete" | "partial" | "missing" | "defect"> = {
    Complete: "complete",
    Partial: "partial",
    Missing: "missing",
    Defect: "defect",
  };
  return <Badge variant={map[status] ?? "outline"}>{status}</Badge>;
}

// ---------------------------------------------------------------------------

function RisksTab({ findings }: { findings: ReturnType<typeof useDrafter>["gapReport"]["findings"] }) {
  if (!findings.length) {
    return (
      <EmptyState
        icon={<CheckCircle2 className="h-8 w-8 text-[hsl(var(--status-complete))]" />}
        title="No open risk flags"
        description="No inconsistencies, undisclosed matters or compliance issues were detected across the disclosure registry. Ordinary completeness gaps are tracked in the Gap & Consistency report."
      />
    );
  }

  return (
    <div className="space-y-3">
      {findings.map((finding) => (
        <Card key={finding.code} className="border-l-4 border-l-[hsl(var(--status-defect))]">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] font-bold">{finding.code}</span>
              <Badge variant={finding.severity === "high" ? "defect" : "partial"}>{finding.severity}</Badge>
              <Badge variant="secondary">{finding.category}</Badge>
              <span className="text-[13.5px] font-semibold">{finding.title}</span>
            </div>
            <p className="mt-1.5 text-[12.5px] text-muted-foreground">{finding.observation}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="font-medium text-muted-foreground">Location:</span>
              {finding.locations.map((location) => (
                <a
                  key={location.chapterId}
                  href={`/document#ch-${location.chapterId.replace(/\./g, "-")}`}
                  className="rounded border border-border bg-secondary px-1.5 py-0.5 font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  {location.chapterId} · {location.chapterTitle}
                </a>
              ))}
            </div>
            <p className="mt-2 text-[12px]">
              <span className="font-semibold">Banker action: </span>
              <span className="text-muted-foreground">{finding.remediation}</span>
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function DiffTab({
  edits,
  hasDoc,
  onRevert,
  onGenerate,
  generating,
}: {
  edits: ReturnType<typeof useDrafter>["bankerEdits"] extends Record<string, infer T> ? T[] : never;
  hasDoc: boolean;
  onRevert: (chapterId: string, blockIndex: number) => void;
  onGenerate: () => void;
  generating: boolean;
}) {
  if (!hasDoc) {
    return (
      <EmptyState
        icon={<ScrollText className="h-8 w-8" />}
        title="Generate the draft first"
        description="The version diff tracks the merchant banker's amendments against the promoter's generated draft. Generate the draft, then amend any paragraph from the Draft DRHP view."
        action={
          <Button onClick={onGenerate} disabled={generating}>
            {generating ? <Loader2 className="animate-spin" /> : <ScrollText />}
            Generate the draft
          </Button>
        }
      />
    );
  }

  if (!edits.length) {
    return (
      <EmptyState
        icon={<GitCompareArrows className="h-8 w-8" />}
        title="No banker amendments yet"
        description="Open the Draft DRHP view in Merchant Banker mode and hover any paragraph to amend it. Every amendment is tracked here as a before-and-after diff, so the promoter can see exactly what the banker changed."
      />
    );
  }

  return (
    <div className="space-y-3">
      {edits.map((edit) => (
        <Card key={`${edit.chapterId}:${edit.blockIndex}`}>
          <CardContent className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[11px] font-semibold text-accent">
                Chapter {edit.chapterId} · paragraph {edit.blockIndex + 1}
              </span>
              <Button variant="ghost" size="sm" onClick={() => onRevert(edit.chapterId, edit.blockIndex)}>
                Revert
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border border-[hsl(var(--status-missing))]/30 bg-[hsl(var(--status-missing))]/[0.04] p-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--status-missing))]">
                  Promoter draft
                </p>
                <p className="font-serif text-[13px] leading-relaxed text-muted-foreground">{edit.original}</p>
              </div>
              <div className="rounded-md border border-[hsl(var(--status-complete))]/30 bg-[hsl(var(--status-complete))]/[0.04] p-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--status-complete))]">
                  Banker amendment
                </p>
                <p className="font-serif text-[13px] leading-relaxed text-foreground">{edit.edited}</p>
              </div>
            </div>
            <p className="mt-2 text-[10.5px] text-muted-foreground">Amended {formatTimestamp(edit.editedAt)}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function SummaryTile({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total?: number;
  tone: "complete" | "partial" | "defect" | "neutral";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p
          className={cn(
            "mt-1 font-serif text-[26px] font-bold tabular-nums",
            tone === "complete" && "text-[hsl(var(--status-complete))]",
            tone === "partial" && "text-[hsl(var(--status-partial))]",
            tone === "defect" && "text-[hsl(var(--status-defect))]",
            tone === "neutral" && "text-primary",
          )}
        >
          {value}
          {total !== undefined ? <span className="text-[15px] text-muted-foreground"> / {total}</span> : null}
        </p>
      </CardContent>
    </Card>
  );
}
