"use client";

import * as React from "react";
import { BookOpen, X } from "lucide-react";
import { getRequirement, structure } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * Make a regulation citation legible to someone who has never read one.
 *
 * The wizard used to render bare mono chips — "R5.9" — with the requirement
 * text in a `title` attribute. That is invisible on a phone, invisible to a
 * keyboard, and even on hover it answers the wrong question. A first-time
 * promoter does not need the requirement restated; they need to know what
 * happens to them if they get it wrong.
 *
 * SEBI's clause is explicit that the solution "must be accessible to promoters
 * without specialist knowledge". An unexplained regulation number is the exact
 * opposite of that, and it appears on every step of the intake.
 *
 * Nothing here is invented. Everything shown is a field that already exists on
 * the requirement — what it asks for, the provision behind it, where it lands
 * in the document, and, for the twelve requirements that carry one, the
 * exchange-return pattern. Where there is no recorded consequence the panel
 * says what is actually true — the requirement reads Missing and the coverage
 * score falls — rather than inventing a scarier one.
 */
export function RequirementExplainer({ ids, className }: { ids: string[]; className?: string }) {
  const [open, setOpen] = React.useState<string | null>(null);

  if (ids.length === 0) return null;

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        {ids.map((id) => {
          const requirement = getRequirement(id);
          if (!requirement) return null;
          const active = open === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setOpen(active ? null : id)}
              aria-expanded={active}
              className={cn(
                "inline-flex items-center gap-1 rounded border px-1.5 py-[3px] font-mono text-[10.5px] font-medium transition-colors duration-200 ease-smooth",
                active
                  ? "border-accent/40 bg-accent/[0.1] text-accent"
                  : "border-border bg-secondary text-muted-foreground hover:border-input hover:text-foreground",
              )}
              title="What is this, and why does it matter?"
            >
              {id}
              <BookOpen className="h-2.5 w-2.5 opacity-60" />
            </button>
          );
        })}
      </div>

      {open ? <ExplainerPanel id={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function ExplainerPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const requirement = getRequirement(id);
  if (!requirement) return null;

  const chapters = (requirement.chapters ?? [])
    .map((chapterId) => {
      for (const section of structure.sections) {
        const chapter = section.chapters.find((candidate) => candidate.id === chapterId);
        if (chapter) return `${chapter.id} ${chapter.title}`;
      }
      return chapterId;
    })
    .slice(0, 4);

  const pattern = (requirement as any).consistency_check?.exchange_pattern as string | undefined;

  return (
    <div className="mt-2.5 rounded-lg border border-accent/25 bg-accent/[0.035] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[10.5px] font-semibold text-accent">{id}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close explanation"
          className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <Field label="What this asks for">{requirement.requirement}</Field>

      <Field label="Where it comes from">
        <span className="font-medium text-foreground">{requirement.source}</span>
        {requirement.mandatory ? " — mandatory." : " — required where applicable."}
      </Field>

      <Field label="What you need to hand">{requirement.evidence}</Field>

      {chapters.length > 0 ? (
        <Field label="Where it lands in the document">{chapters.join(" · ")}</Field>
      ) : null}

      {/* The only field that is genuinely a consequence. Present on the twelve
          requirements that carry a consistency check; the rest get the honest
          answer rather than a manufactured warning. */}
      <Field label="Why it matters">
        {pattern ?? (
          <>
            Leave this blank and the requirement reads <strong>Missing</strong> in the gap report and
            your coverage score falls. It is not a defect — it is an unanswered question, and the
            action plan will tell you what answering it is worth.
          </>
        )}
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2.5">
      <p className="text-[9.5px] font-medium uppercase tracking-[0.13em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
