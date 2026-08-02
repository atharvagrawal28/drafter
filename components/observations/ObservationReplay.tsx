"use client";

import * as React from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, FileWarning, Info, MinusCircle } from "lucide-react";
import { getRequirement } from "@/lib/data";
import { parseObservations } from "@/lib/observations/parse";
import { replayObservations } from "@/lib/observations/replay";
import type { MappedObservation } from "@/lib/observations/types";
import { Badge, Button, Card, CardContent } from "@/components/ui/primitives";

const SAMPLE = `1. The revenue from operations disclosed in the chapter "Our Business" does not reconcile with the figure presented in the Restated Financial Statements. Please reconcile and revise.
2. Please furnish the peer review certificate of the statutory auditor, valid as on the date of filing.
3. The Company shall disclose the outstanding litigation involving the Promoters, including tax proceedings, in the relevant section.
4. The amount proposed towards general corporate purposes exceeds the prescribed ceiling. Please revise the objects of the issue accordingly.
5. Kindly provide the written consent of the Registrar to the Issue.
6. The Company is advised to add a risk factor in respect of customer concentration, given that the top three customers account for a substantial share of revenue.
7. The shareholding pattern does not disclose the build-up of the Promoters' shareholding since incorporation. Please disclose.
8. The Company shall confirm the arrangements made for the safekeeping of the physical share certificates at its branch offices.`;

const VERDICT_META = {
  mapped: {
    label: "Drafter checks this",
    icon: CheckCircle2,
    badge: "complete" as const,
  },
  "out-of-scope": {
    label: "Document to be produced, not Drafter's to draft",
    icon: MinusCircle,
    badge: "outline" as const,
  },
  unmapped: {
    label: "Not in the registry, a gap",
    icon: AlertTriangle,
    badge: "defect" as const,
  },
};

export function ObservationReplay() {
  const [text, setText] = React.useState("");
  const [submitted, setSubmitted] = React.useState("");

  const report = React.useMemo(
    () => (submitted ? replayObservations(parseObservations(submitted)) : null),
    [submitted],
  );

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6">
      <Badge variant="accent" className="mb-3">
        Closing the loop, exchange observations back onto the registry
      </Badge>
      <h1 className="font-serif text-[30px] font-bold leading-tight text-primary">
        Observation replay
      </h1>
      <p className="mt-4 max-w-3xl text-[14.5px] leading-relaxed text-muted-foreground">
        Every other claim Drafter makes about its requirement registry is
        self-referential, the registry says the draft is complete because the registry says so.
        This is the one check that comes from outside. Paste the observation letter the exchange
        returned on a draft offer document and Drafter maps each observation to the requirement and
        chapter it belongs to, then reports how much of the letter it would have raised{" "}
        <span className="font-medium text-foreground">before</span> the exchange did.
      </p>

      <Card className="mt-6 border-accent/30 bg-accent/[0.04]">
        <CardContent className="flex gap-3 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Your letter stays in this browser.</span>{" "}
            Parsing and mapping run entirely client-side, an observation letter names an unlisted
            issuer and the defects in its draft, so there is no reason for it to reach a server to
            be split on its numbering. Nothing is uploaded, stored or logged.
          </p>
        </CardContent>
      </Card>

      <div className="mt-6">
        <label htmlFor="letter" className="text-[13px] font-semibold text-foreground">
          Observation letter
        </label>
        <textarea
          id="letter"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={12}
          placeholder="Paste the numbered observations from the exchange letter…"
          className="mt-2 w-full rounded-lg border border-border bg-card p-3.5 font-mono text-[12.5px] leading-relaxed text-foreground shadow-xs outline-none transition-[border-color,box-shadow] duration-200 ease-smooth placeholder:text-muted-foreground/70 focus:border-input focus:shadow-sm"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => setSubmitted(text)} disabled={text.trim().length === 0} size="sm">
            <ArrowRight /> Replay against the registry
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setText(SAMPLE);
              setSubmitted(SAMPLE);
            }}
          >
            <FileWarning /> Load a representative letter
          </Button>
          {submitted ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setText("");
                setSubmitted("");
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      {report ? (
        <>
          {/* Headline */}
          <Card className="mt-8">
            <CardContent className="p-6">
              <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
                <div>
                  <p className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Raised by Drafter first
                  </p>
                  <p className="mt-1 font-serif text-[38px] font-bold leading-none tabular-nums text-primary">
                    {report.coveragePct === null ? "–" : `${report.coveragePct}%`}
                  </p>
                  <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                    of in-scope observations
                  </p>
                </div>
                <div className="grid gap-1.5 text-[12.5px]">
                  <Row label="Observations read" value={report.counts.total} />
                  <Row label="Mapped to a requirement Drafter checks" value={report.counts.mapped} tone="good" />
                  <Row label="Registry gaps, not covered" value={report.counts.unmapped} tone={report.counts.unmapped > 0 ? "bad" : undefined} />
                  <Row label="Documents to produce, outside scope" value={report.counts.outOfScope} tone="muted" />
                </div>
              </div>

              <p className="mt-5 border-t border-border pt-4 text-[11.5px] leading-relaxed text-muted-foreground">
                The percentage is computed over in-scope observations only. Document-production
                items, a consent, a peer review certificate, an executed agreement, are removed
                from the denominator rather than counted as successes, because Drafter does not
                produce them and should not take credit for them. Registry gaps stay in the
                denominator and pull the number down; they are the most useful thing this screen
                finds. Registry {report.registryVersion}.
              </p>
            </CardContent>
          </Card>

          {/* Observation by observation */}
          <h2 className="mt-8 font-serif text-[20px] font-bold text-primary">
            Observation by observation
          </h2>
          <div className="mt-4 space-y-3">
            {report.observations.map((observation, index) => (
              <ObservationCard key={`${observation.label}-${index}`} observation={observation} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "good" | "bad" | "muted";
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        className={
          tone === "good"
            ? "w-7 text-right font-serif text-[16px] font-semibold tabular-nums text-[hsl(var(--status-complete))]"
            : tone === "bad"
              ? "w-7 text-right font-serif text-[16px] font-semibold tabular-nums text-[hsl(var(--status-defect))]"
              : "w-7 text-right font-serif text-[16px] font-semibold tabular-nums text-muted-foreground"
        }
      >
        {value}
      </span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function ObservationCard({ observation }: { observation: MappedObservation }) {
  const meta = VERDICT_META[observation.verdict];
  const Icon = meta.icon;

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] font-medium text-muted-foreground">
          {observation.label}
        </span>
        <Badge variant={meta.badge}>
          <Icon className="h-3 w-3" />
          {meta.label}
        </Badge>
        {observation.chapters.map((chapter) => (
          <span key={chapter} className="font-mono text-[10.5px] text-muted-foreground">
            → {chapter}
          </span>
        ))}
      </div>

      <p className="mt-2.5 text-[13px] leading-relaxed text-foreground">{observation.text}</p>

      {observation.requirementIds.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {observation.requirementIds.map((id) => (
            <p key={id} className="text-[12px] leading-relaxed text-muted-foreground">
              <code className="rounded border border-border bg-secondary px-1 py-0.5 font-mono text-[10.5px]">
                {id}
              </code>{" "}
              {getRequirement(id)?.requirement}
            </p>
          ))}
        </div>
      ) : null}

      {observation.verdict === "unmapped" ? (
        <p className="mt-3 border-l-2 border-[hsl(var(--status-defect))]/40 pl-3 text-[12px] leading-relaxed text-muted-foreground">
          No requirement in the registry would have prompted the issuer for this. Recorded as a
          gap rather than absorbed, this is what the replay is for.
        </p>
      ) : null}

      {observation.matchedTerms.length > 0 ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Matched on:{" "}
          {observation.matchedTerms.map((term) => (
            <code key={term} className="mr-1 rounded bg-secondary px-1 py-0.5 font-mono text-[10px]">
              {term}
            </code>
          ))}
        </p>
      ) : null}
    </div>
  );
}
