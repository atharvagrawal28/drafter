"use client";

import * as React from "react";
import { AlertTriangle, Check, FileWarning, Pencil, RotateCcw } from "lucide-react";
import type { Block, ProvenanceOrigin } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge, Button, Textarea } from "@/components/ui/primitives";

/**
 * Human labels for provenance. Shown on demand rather than always, so the
 * document reads as a document — but one click away, because the traceability
 * is the point of the product.
 */
export const ORIGIN_LABEL: Record<ProvenanceOrigin, string> = {
  "issuer-input": "From issuer data",
  derived: "Computed from issuer data",
  "llm-narrative": "Language-model prose, constrained to issuer data",
  "template-narrative": "Deterministic template",
  "standard-clause": "Standard clause — banker to finalise",
  placeholder: "Not yet supplied",
};

export const ORIGIN_TONE: Record<ProvenanceOrigin, string> = {
  "issuer-input": "text-[hsl(var(--status-complete))]",
  derived: "text-[hsl(var(--status-complete))]",
  "llm-narrative": "text-accent",
  "template-narrative": "text-muted-foreground",
  "standard-clause": "text-muted-foreground",
  placeholder: "text-[hsl(var(--status-missing))]",
};

interface BlockRendererProps {
  block: Block;
  index: number;
  chapterId: string;
  showProvenance: boolean;
  editable?: boolean;
  edited?: boolean;
  onEdit?: (index: number, original: string, edited: string) => void;
  onRevert?: (index: number) => void;
}

export function BlockRenderer({
  block,
  index,
  chapterId,
  showProvenance,
  editable = false,
  edited = false,
  onEdit,
  onRevert,
}: BlockRendererProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");

  const provenanceStrip = showProvenance ? (
    <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px]">
      <span className={cn("font-medium uppercase tracking-wider", ORIGIN_TONE[block.provenance.origin])}>
        {ORIGIN_LABEL[block.provenance.origin]}
      </span>
      {block.provenance.fields?.length ? (
        <span className="font-mono text-muted-foreground">
          {block.provenance.fields.slice(0, 4).join(" · ")}
          {block.provenance.fields.length > 4 ? ` +${block.provenance.fields.length - 4}` : ""}
        </span>
      ) : null}
      {block.provenance.requirementIds?.length ? (
        <span className="text-muted-foreground">→ {block.provenance.requirementIds.join(", ")}</span>
      ) : null}
    </div>
  ) : null;

  switch (block.kind) {
    // ------------------------------------------------------------------
    case "heading":
      return (
        <div className="mt-7 first:mt-0">
          {provenanceStrip}
          <h3 className={block.level === 2 ? "prospectus-h2" : "prospectus-h3"}>{block.text}</h3>
        </div>
      );

    // ------------------------------------------------------------------
    case "para": {
      const startEdit = () => {
        setDraft(block.text);
        setEditing(true);
      };

      if (editing) {
        return (
          <div className="my-4 rounded-md border border-accent/50 bg-accent/[0.04] p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-accent">
              Merchant-banker amendment
            </p>
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={Math.max(4, Math.ceil(draft.length / 90))}
              className="font-serif text-[14px] leading-relaxed"
            />
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  onEdit?.(index, block.text, draft);
                  setEditing(false);
                }}
              >
                <Check /> Save amendment
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        );
      }

      return (
        <div className={cn("group relative", edited && "border-l-2 border-accent pl-3")}>
          {provenanceStrip}
          <p>{block.text}</p>
          {block.provenance.note && showProvenance ? (
            <p className="-mt-2 mb-4 font-sans text-[11px] italic text-muted-foreground">
              {block.provenance.note}
            </p>
          ) : null}
          {editable ? (
            <div className="absolute -right-1 top-0 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              {edited ? (
                <Button size="sm" variant="ghost" onClick={() => onRevert?.(index)} title="Revert to the promoter's draft">
                  <RotateCcw />
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={startEdit} title="Amend this paragraph">
                <Pencil />
              </Button>
            </div>
          ) : null}
        </div>
      );
    }

    // ------------------------------------------------------------------
    case "list":
      return (
        <div className="mb-4">
          {provenanceStrip}
          {block.ordered ? (
            <ol className="ml-5 list-decimal space-y-1.5 text-justify">
              {block.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ol>
          ) : (
            <ul className="ml-5 list-disc space-y-1.5 text-justify">
              {block.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      );

    // ------------------------------------------------------------------
    case "table":
      return (
        <figure className="mb-6 mt-4">
          {provenanceStrip}
          {block.caption ? (
            <figcaption className="mb-2 font-sans text-[12px] font-semibold uppercase tracking-wider text-primary">
              {block.caption}
            </figcaption>
          ) : null}
          <div className="overflow-x-auto">
            <table className="prospectus-table">
              <thead>
                <tr>
                  {block.columns.map((column, i) => (
                    <th key={i} className={column.numeric ? "numeric" : undefined}>
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className={block.totalRowIndices?.includes(rowIndex) ? "total-row" : undefined}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className={block.columns[cellIndex]?.numeric ? "numeric" : undefined}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {block.notes?.length ? (
            <div className="mt-2 space-y-1">
              {block.notes.map((note, i) => (
                <p key={i} className="font-sans text-[11.5px] leading-relaxed text-muted-foreground">
                  {note}
                </p>
              ))}
            </div>
          ) : null}
        </figure>
      );

    // ------------------------------------------------------------------
    case "placeholder":
      return (
        <div className="my-4 rounded-md border border-dashed border-[hsl(var(--status-missing))]/45 bg-[hsl(var(--status-missing))]/[0.05] p-4">
          <div className="mb-2 flex items-center gap-2">
            <FileWarning className="h-4 w-4 text-[hsl(var(--status-missing))]" />
            <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--status-missing))]">
              To be supplied
            </span>
            {block.provenance.requirementIds?.length ? (
              <span className="font-sans text-[10px] text-muted-foreground">
                {block.provenance.requirementIds.join(", ")}
              </span>
            ) : null}
          </div>
          <p className="mb-2 font-sans text-[13px] font-medium text-foreground">{block.text}</p>
          {block.requiredInputs.length ? (
            <ul className="ml-4 list-disc space-y-1 font-sans text-[12px] text-muted-foreground">
              {block.requiredInputs.map((input, i) => (
                <li key={i}>{input}</li>
              ))}
            </ul>
          ) : null}
        </div>
      );

    // ------------------------------------------------------------------
    case "callout":
      return (
        <aside
          className={cn(
            "my-5 rounded-md border-l-[3px] p-4 font-sans text-[12.5px] leading-relaxed",
            block.tone === "attention"
              ? "border-accent bg-accent/[0.06] text-foreground"
              : "border-border bg-secondary/50 text-muted-foreground",
          )}
        >
          {block.title ? (
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
              <AlertTriangle className="h-3.5 w-3.5" />
              {block.title}
            </p>
          ) : null}
          <p>{block.text}</p>
        </aside>
      );

    default:
      return null;
  }
}

/** Small legend explaining the provenance colours, shown above the document. */
export function ProvenanceLegend() {
  const entries: ProvenanceOrigin[] = [
    "issuer-input",
    "derived",
    "llm-narrative",
    "template-narrative",
    "standard-clause",
    "placeholder",
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {entries.map((origin) => (
        <span key={origin} className="flex items-center gap-1.5 text-[11px]">
          <span className={cn("h-1.5 w-1.5 rounded-full bg-current", ORIGIN_TONE[origin])} />
          <span className="text-muted-foreground">{ORIGIN_LABEL[origin]}</span>
        </span>
      ))}
    </div>
  );
}

export function StatusChip({ status }: { status: "generated" | "partial" | "skeleton" }) {
  if (status === "generated") return <Badge variant="complete">Drafted</Badge>;
  if (status === "partial") return <Badge variant="partial">Partial</Badge>;
  return <Badge variant="missing">Skeleton</Badge>;
}
