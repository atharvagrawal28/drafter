"use client";

/**
 * What the self-correction loop actually did, on screen.
 *
 * WHY THIS EXISTS
 * The most consequential thing this product does is reject its own model's
 * output. A chapter that used a figure absent from the issuer's data is thrown
 * away and redrafted, and if it cannot be repaired it degrades to a
 * deterministic template. Until now that happened entirely out of sight: the
 * loop returned a full trace, the API passed it to the browser, and nothing
 * rendered it. The user was being asked to take the single most important
 * safety property on trust.
 *
 * The rejected FIGURES are the centrepiece rather than a footnote. "The model
 * wrote 79 where your data says 78.90, so the chapter was thrown away" is the
 * whole argument for this architecture, and it is far more convincing than any
 * claim about prompting.
 */

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleSlash,
  FileText,
  Repeat,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useDrafter } from "@/lib/store";
import type { ChapterAttempt } from "@/lib/engine/refineGraph";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, CardContent, EmptyState } from "@/components/ui/primitives";
import { Explain } from "@/components/ui/Explain";

const OUTCOME = {
  accepted: {
    label: "Accepted first pass",
    icon: CheckCircle2,
    tone: "text-[hsl(var(--status-complete))]",
    badge: "complete" as const,
  },
  "accepted-after-revision": {
    label: "Recovered on revision",
    icon: RotateCcw,
    tone: "text-[hsl(var(--status-partial))]",
    badge: "partial" as const,
  },
  "fell-back-to-template": {
    label: "Fell back to template",
    icon: CircleSlash,
    tone: "text-muted-foreground",
    badge: "outline" as const,
  },
} as const;

export function DraftingRecord() {
  const { refineTrace, document, generate, generating, llmAvailable } = useDrafter();

  if (!refineTrace) {
    return (
      <div className="mx-auto max-w-[1100px] px-5 py-10 sm:px-7">
        <Header />
        <div className="mt-6">
          <EmptyState
            icon={<FileText className="h-7 w-7" />}
            title={
              document
                ? "This draft was built without the self-correction loop"
                : "No draft has been generated yet"
            }
            description={
              document
                ? "The current document came from Drafter's deterministic templates, either because no model key is configured or because the loop was not used. Templates need no correction — every figure in them is copied or computed from issuer data, so there is nothing for a validator to catch."
                : "Generate the draft and the loop's full working — every attempt, every rejected figure, every chapter that degraded and why — is recorded here."
            }
            action={
              <Button onClick={generate} disabled={generating}>
                <Sparkles />
                {generating ? "Drafting…" : "Generate the draft"}
              </Button>
            }
          />
          {llmAvailable === false ? (
            <p className="mt-4 text-center text-[12px] text-muted-foreground">
              No model key is configured, so drafting runs on deterministic templates. The document,
              the coverage score and every check behave identically — only the prose register differs.
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  const chapters = refineTrace.chapters ?? [];
  const recovered = chapters.filter((c) => c.outcome === "accepted-after-revision");
  const firstPass = chapters.filter((c) => c.outcome === "accepted");
  const fellBack = chapters.filter((c) => c.outcome === "fell-back-to-template");

  // Every distinct figure the validator refused, across every attempt.
  const rejected = Array.from(
    new Set(chapters.flatMap((c) => c.rejectedFigures.flat()).filter(Boolean)),
  );

  const models = Array.from(new Set(chapters.map((c) => c.model).filter(Boolean))) as string[];

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-10 sm:px-7">
      <Header />

      {/* ---- Headline counts ------------------------------------------- */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat
          value={firstPass.length}
          label="Accepted first pass"
          hint="Drafted, checked and kept without change."
          tone="text-[hsl(var(--status-complete))]"
        />
        <Stat
          value={recovered.length}
          label="Recovered by the loop"
          hint="Rejected, redrafted, then accepted — chapters that would otherwise be templates."
          tone="text-[hsl(var(--status-partial))]"
        />
        <Stat
          value={fellBack.length}
          label="Degraded to template"
          hint="Could not be repaired in the time available. Plainer prose, identical facts."
          tone="text-muted-foreground"
        />
      </div>

      {/* ---- The figures the validator refused -------------------------- */}
      {rejected.length > 0 ? (
        <Card className="mt-4 border-[hsl(var(--status-defect))]/25 bg-[hsl(var(--status-defect))]/[0.04]">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--status-defect))]" />
              <div className="min-w-0">
                <h2 className="font-serif text-[17px] font-bold leading-snug text-[hsl(var(--status-defect))]">
                  {rejected.length === 1
                    ? "One figure was invented and refused"
                    : `${rejected.length} figures were invented and refused`}
                </h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-foreground">
                  The language model wrote{" "}
                  {rejected.map((figure, index) => (
                    <React.Fragment key={figure}>
                      {index > 0 ? ", " : ""}
                      <span className="rounded border border-[hsl(var(--status-defect))]/30 bg-card px-1.5 py-0.5 font-mono text-[12px] font-semibold text-[hsl(var(--status-defect))]">
                        {figure}
                      </span>
                    </React.Fragment>
                  ))}
                  {rejected.length === 1 ? " — a figure that appears" : " — figures that appear"}{" "}
                  nowhere in the issuer data it was given. Each affected chapter was discarded and
                  redrafted rather than published.
                </p>
                <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                  The instruction not to round is stated twice in the prompt, and models round anyway.
                  That is why the guarantee is enforced on the output instead of asked for in the
                  prompt — and why it holds when the model is substituted.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ---- The loop -------------------------------------------------- */}
      <Card className="mt-4">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-[17px] font-semibold text-primary">
              The loop ran {refineTrace.iterations}{" "}
              {refineTrace.iterations === 1 ? "pass" : "passes"}
            </h2>
            {models.length > 0 ? (
              <span className="text-[11.5px] text-muted-foreground">
                {models.length === 1 ? "Model: " : "Models used: "}
                <span className="font-mono text-[11px] text-foreground">{models.join(", ")}</span>
              </span>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px]">
            <Node label="Draft" done />
            <Arrow />
            <Node label="Assemble" done />
            <Arrow />
            <Node label="Gap check" done />
            <Arrow />
            <Node
              label={recovered.length > 0 ? "Revise" : "Decide"}
              done={recovered.length > 0}
              accent={recovered.length > 0}
            />
            {recovered.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/[0.08] px-2.5 py-1 text-[11px] font-medium text-accent">
                <Repeat className="h-3 w-3" />
                looped back {refineTrace.iterations - 1}×
              </span>
            ) : null}
          </div>

          <p className="mt-3.5 max-w-3xl text-[12.5px] leading-relaxed text-muted-foreground">
            Findings from the gap check are deliberately <strong>not</strong> fed back into the
            drafting prompt. When they were, the model quietly adopted the audited figure over the
            promoter&apos;s asserted one — harmonising away the very inconsistency the checker exists
            to catch. The loop corrects the model&apos;s own errors, never the issuer&apos;s.
          </p>
        </CardContent>
      </Card>

      {/* ---- Per chapter ------------------------------------------------ */}
      <h2 className="mt-8 font-serif text-[19px] font-semibold text-primary">Chapter by chapter</h2>
      <div className="mt-3 space-y-2">
        {chapters.map((chapter) => (
          <ChapterRow key={chapter.chapterId} chapter={chapter} />
        ))}
      </div>

      {/* ---- Raw log ---------------------------------------------------- */}
      {refineTrace.log?.length ? (
        <>
          <h2 className="mt-8 font-serif text-[19px] font-semibold text-primary">
            The loop&apos;s own log
          </h2>
          <Card className="mt-3">
            <CardContent className="p-0">
              <ol className="divide-y divide-border/70">
                {refineTrace.log.map((line, index) => (
                  <li
                    key={index}
                    className="flex gap-3 px-4 py-2 font-mono text-[11.5px] leading-relaxed text-foreground"
                  >
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">{line}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </>
      ) : null}

      <p className="mt-6 text-[12px] text-muted-foreground">
        Every chapter in the{" "}
        <Link href="/document" className="text-primary underline underline-offset-2">
          draft document
        </Link>{" "}
        also carries its own <Explain term="provenance">provenance</Explain>, so any single sentence
        can be traced to the answer it came from. Chapters that degraded to a{" "}
        <Explain term="standard clause">template</Explain> contain the same facts as those the model
        wrote — only the prose is plainer.
      </p>
    </div>
  );
}

function Header() {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        Drafting record
      </p>
      <h1 className="mt-1.5 font-serif text-[30px] font-bold leading-[1.15] tracking-[-0.02em] text-primary">
        How this draft was made
      </h1>
      <p className="mt-2.5 max-w-3xl text-[13.5px] leading-relaxed text-muted-foreground">
        Drafter checks the language model&apos;s output before it reaches the document. Any figure
        that does not appear in the issuer&apos;s own answers causes the whole chapter to be thrown
        away and redrafted. This is the complete record of that work — including what was refused.
      </p>
    </div>
  );
}

function Stat({
  value,
  label,
  hint,
  tone,
}: {
  value: number;
  label: string;
  hint: string;
  tone: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-baseline gap-2">
          <span className={cn("font-serif text-[30px] font-semibold leading-none tabular-nums", tone)}>
            {value}
          </span>
          <span className="text-[11.5px] font-medium text-foreground">{label}</span>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function Node({ label, done, accent }: { label: string; done?: boolean; accent?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-medium",
        accent
          ? "border-accent/30 bg-accent/[0.08] text-accent"
          : done
            ? "border-border bg-card text-foreground shadow-xs"
            : "border-dashed border-border text-muted-foreground",
      )}
    >
      {done && !accent ? <ShieldCheck className="h-3 w-3 text-[hsl(var(--status-complete))]" /> : null}
      {label}
    </span>
  );
}

const Arrow = () => <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />;

function ChapterRow({ chapter }: { chapter: ChapterAttempt }) {
  const meta = OUTCOME[chapter.outcome];
  const Icon = meta.icon;
  const figures = chapter.rejectedFigures.flat().filter(Boolean);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", meta.tone)} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">{chapter.chapterId}</span>
              <span className="text-[13.5px] font-semibold text-foreground">
                {chapter.chapterTitle}
              </span>
              <Badge variant={meta.badge}>{meta.label}</Badge>
              {chapter.attempts > 1 ? (
                <Badge variant="outline">
                  {chapter.attempts} attempts
                </Badge>
              ) : null}
            </div>

            {figures.length > 0 ? (
              <p className="mt-2 text-[12.5px] leading-relaxed text-foreground">
                Refused for using{" "}
                {figures.map((figure, index) => (
                  <React.Fragment key={`${figure}-${index}`}>
                    {index > 0 ? ", " : ""}
                    <span className="rounded border border-[hsl(var(--status-defect))]/30 bg-[hsl(var(--status-defect))]/[0.06] px-1 py-0.5 font-mono text-[11.5px] font-semibold text-[hsl(var(--status-defect))]">
                      {figure}
                    </span>
                  </React.Fragment>
                ))}
                , absent from the issuer data supplied for this chapter.
              </p>
            ) : null}

            {chapter.missingTopics?.length ? (
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                Still to cover: {chapter.missingTopics.join("; ")}.
              </p>
            ) : null}

            {chapter.rateLimited && chapter.outcome === "fell-back-to-template" ? (
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                Degraded on provider quota rather than on content. The facts in this chapter are
                unchanged — only the prose is the deterministic template.
              </p>
            ) : null}
          </div>

          {chapter.model ? (
            <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
              {chapter.model}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
