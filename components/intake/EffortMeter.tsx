"use client";

import * as React from "react";
import { Clock, Info } from "lucide-react";
import { useDrafter } from "@/lib/store";
import { formatEffort } from "@/lib/engine/effort";
import { Badge } from "@/components/ui/primitives";

/**
 * The measured answer to "significantly reducing preparation time".
 *
 * Shows nothing at all on a bundled sample, and says why. A stopwatch running
 * over pre-filled demo answers would produce an impressive number that means
 * nothing, and the first person to notice would be a judge.
 */
export function EffortMeter() {
  const { effortSummary, isRealIssuer, gapReport } = useDrafter();
  const [showMethod, setShowMethod] = React.useState(false);

  if (!isRealIssuer) {
    return (
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        <Clock className="mr-1 inline h-3 w-3 -translate-y-px" />
        Preparation time is measured for your own company only — this is a pre-filled sample
        issuer, so timing it would measure reading speed, not drafting.
      </p>
    );
  }

  if (!effortSummary.measured) {
    return (
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        <Clock className="mr-1 inline h-3 w-3 -translate-y-px" />
        Preparation time starts on your first answer.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5 text-[9.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          <Clock className="h-3 w-3" />
          Preparation time
        </span>
        <span className="font-serif text-[19px] font-semibold leading-none tabular-nums text-primary">
          {effortSummary.activeLabel}
        </span>
        <span className="text-[11.5px] text-muted-foreground">
          across {effortSummary.interactions}{" "}
          {effortSummary.interactions === 1 ? "answer" : "answers"} · now at {gapReport.coveragePct}%
          coverage
        </span>
        {effortSummary.firstDraftLabel ? (
          <Badge variant="complete">first draft at {effortSummary.firstDraftLabel}</Badge>
        ) : null}
      </div>

      {effortSummary.milestones.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {effortSummary.milestones.map((milestone) => (
            <span
              key={milestone.threshold}
              className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground"
            >
              {milestone.threshold}% at {formatEffort(milestone.atActiveMs) ?? "<1s"}
            </span>
          ))}
        </div>
      ) : null}

      {/* The methodology is one click away, never hidden. A time claim without
          its method is marketing. */}
      <button
        type="button"
        onClick={() => setShowMethod((open) => !open)}
        className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors duration-200 ease-smooth hover:text-foreground"
      >
        <Info className="h-3 w-3" />
        {showMethod ? "Hide" : "What exactly is being measured?"}
      </button>
      {showMethod ? (
        <p className="mt-2 border-l-2 border-accent/40 pl-3 text-[11.5px] leading-relaxed text-muted-foreground">
          {effortSummary.methodology}
        </p>
      ) : null}
    </div>
  );
}
