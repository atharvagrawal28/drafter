"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  FileWarning,
  Loader2,
  ListChecks,
  ScrollText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useDrafter } from "@/lib/store";
import { sampleIssuers } from "@/lib/data";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, CardContent, Progress } from "@/components/ui/primitives";
import { Explain } from "@/components/ui/Explain";

export default function OverviewPage() {
  const {
    gapReport,
    document,
    refineTrace,
    generate,
    generating,
    issuerId,
    issuerData,
    llmAvailable,
    llmModel,
  } = useDrafter();
  const issuer = sampleIssuers.find((candidate) => candidate.id === issuerId);

  // Distinct figures the output validator refused across the whole run.
  const rejectedFigures = React.useMemo(
    () =>
      Array.from(
        new Set(
          (refineTrace?.chapters ?? []).flatMap((chapter) => chapter.rejectedFigures.flat()).filter(Boolean),
        ),
      ),
    [refineTrace],
  );

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-12 sm:px-7 lg:py-16">
      {/* ---------------------------------------------------------------- */}
      {/* Hero                                                              */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid gap-10 lg:grid-cols-[1.35fr_1fr] lg:gap-12">
        <div>
          <Badge variant="accent" className="mb-5">
            SEBI Securities Market TechSprint @ GFF 2026 · Track 04
          </Badge>
          {/* Set in the serif at display size with negative tracking and tight
              leading. This one line has to carry the whole positioning, so it is
              typeset rather than merely styled. */}
          <h1 className="max-w-[19ch] font-serif text-[38px] font-semibold leading-[1.08] tracking-[-0.025em] text-primary [font-optical-sizing:auto] sm:text-[50px] lg:text-[54px]">
            Everyone else checks a DRHP that already exists.{" "}
            <span className="text-accent">Drafter writes the first one.</span>
          </h1>
          <p className="mt-6 max-w-[62ch] text-[15.5px] leading-[1.7] text-muted-foreground">
            An SME promoter answers plain-language questions. Drafter assembles a substantially
            complete, correctly structured, disclosure-mapped draft offer document across all nine
            sections of the SME DRHP — then runs an exchange-style gap and consistency check over it
            before the merchant banker ever sees it.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button onClick={generate} disabled={generating} size="lg">
              {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {document ? "Regenerate the draft" : "Generate the draft DRHP"}
            </Button>
            <Link href="/intake">
              <Button variant="outline" size="lg">
                <ListChecks />
                Open the guided intake
              </Button>
            </Link>
          </div>

          <p className="mt-5 text-[12.5px] leading-relaxed text-muted-foreground">
            Currently loaded: <span className="font-medium text-foreground">{issuer?.name}</span> —{" "}
            {issuer?.sector}. Switch issuers from the selector in the header to see the same engine
            run against a different sector.
          </p>
        </div>

        {/* Live coverage panel */}
        <Card className="self-start">
          <CardContent className="p-5">
            <div className="flex items-baseline justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                <Explain term="disclosure coverage">Disclosure coverage</Explain>
              </p>
              <span className="font-serif text-[38px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-primary [font-optical-sizing:auto]">
                {gapReport.coveragePct}%
              </span>
            </div>
            <Progress
              value={gapReport.coveragePct}
              className="mt-2"
              indicatorClassName={
                gapReport.coveragePct >= 85
                  ? "bg-[hsl(var(--status-complete))]"
                  : gapReport.coveragePct >= 60
                    ? "bg-[hsl(var(--status-partial))]"
                    : "bg-[hsl(var(--status-missing))]"
              }
            />
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              Computed live across {gapReport.counts.total} disclosure requirements — it moves as the
              intake is filled in. {gapReport.issuerCoveragePct}% on the items the issuer itself can
              discharge.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Stat label="Complete" value={gapReport.counts.complete} tone="complete" />
              <Stat label="Partial" value={gapReport.counts.partial} tone="partial" />
              <Stat label="Missing" value={gapReport.counts.missing} tone="missing" />
              <Stat label="Defects" value={gapReport.counts.defect} tone="defect" />
            </div>

            {gapReport.findingCounts.high > 0 ? (
              <Link href="/gaps">
                <div className="mt-4 rounded-md border-l-[3px] border-[hsl(var(--status-defect))] bg-[hsl(var(--status-defect))]/[0.07] p-3 transition-colors hover:bg-[hsl(var(--status-defect))]/[0.12]">
                  <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[hsl(var(--status-defect))]">
                    <FileWarning className="h-3.5 w-3.5" />
                    {gapReport.verdict.headline}
                  </p>
                  <p className="mt-1 text-[11.5px] text-muted-foreground">
                    Open the Gap &amp; Consistency report <ArrowRight className="inline h-3 w-3" />
                  </p>
                </div>
              </Link>
            ) : (
              <div className="mt-4 rounded-md border-l-[3px] border-[hsl(var(--status-complete))] bg-[hsl(var(--status-complete))]/[0.07] p-3">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[hsl(var(--status-complete))]">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {gapReport.verdict.headline}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* The four moves                                                    */}
      {/* ---------------------------------------------------------------- */}
      <div className="mt-16 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StepCard
          href="/intake"
          step="01"
          icon={<ListChecks className="h-5 w-5" />}
          title="Guided Intake"
          body="Plain-language questions, no capital-markets vocabulary. Every field is tagged with the DRHP chapter and the disclosure requirement it feeds. Financials can be uploaded and read automatically."
        />
        <StepCard
          href="/document"
          step="02"
          icon={<ScrollText className="h-5 w-5" />}
          title="Draft DRHP"
          body="All 34 chapters across Sections I–IX. Factual chapters are built as real tables from issuer data only. Narrative chapters are drafted in prospectus register. Every chapter shows its requirement IDs."
        />
        <StepCard
          href="/gaps"
          step="03"
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Gap & Consistency"
          body="Opens with the Chapter IX eligibility gate — may this issuer make the issue at all? Then cross-section reconciliation, red flags, a ranked action plan, and per-requirement status with exact locations."
        />
        <StepCard
          href="/banker"
          step="04"
          icon={<BriefcaseBusiness className="h-5 w-5" />}
          title="Merchant Banker"
          body="The same draft, seen as due-diligence work product: documents required against provided, chapter-to-requirement mapping, risk flags, and a version diff of the banker's amendments."
        />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Proof, shown only when there is some                              */}
      {/*                                                                   */}
      {/* Appears when the loop actually refused something the model wrote. */}
      {/* Claiming the guarantee on an empty run would be the same kind of  */}
      {/* unearned assertion the product exists to prevent.                  */}
      {/* ---------------------------------------------------------------- */}
      {rejectedFigures.length > 0 ? (
        <Link href="/trace" className="group mt-8 block">
          <Card className="border-[hsl(var(--status-defect))]/25 bg-[hsl(var(--status-defect))]/[0.035] transition-shadow duration-200 ease-smooth group-hover:shadow-md">
            <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 p-5">
              <ShieldCheck className="h-5 w-5 shrink-0 text-[hsl(var(--status-defect))]" />
              <div className="min-w-0 flex-1">
                <p className="font-serif text-[16px] font-semibold leading-snug text-[hsl(var(--status-defect))]">
                  Drafter refused {rejectedFigures.length === 1 ? "a figure" : `${rejectedFigures.length} figures`} its own
                  language model invented
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                  The model wrote{" "}
                  {rejectedFigures.map((figure, index) => (
                    <span key={figure}>
                      {index > 0 ? ", " : ""}
                      <span className="rounded border border-[hsl(var(--status-defect))]/30 bg-card px-1 py-0.5 font-mono text-[11.5px] font-semibold text-[hsl(var(--status-defect))]">
                        {figure}
                      </span>
                    </span>
                  ))}
                  , absent from this issuer&apos;s answers. Each affected chapter was thrown away and
                  redrafted rather than published.
                </p>
              </div>
              <span className="shrink-0 text-[12px] font-medium text-primary underline-offset-4 group-hover:underline">
                See the drafting record →
              </span>
            </CardContent>
          </Card>
        </Link>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Positioning + guardrails                                          */}
      {/* ---------------------------------------------------------------- */}
      <div className="mt-16 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <h2 className="font-serif text-[19px] font-bold text-primary">
              Drafter sits upstream of the exchange&apos;s own AI{" "}
              <Explain term="exchange pre-check">pre-check</Explain>
            </h2>
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
              BSE&apos;s GenAI DRHP pre-check has cut exchange review from around seven days to under
              forty minutes — but it acts on a draft that someone has already written. Nobody helps the
              SME write it. Drafter fills that gap, and deliberately targets the same return patterns
              the exchange flags, so a draft clears pre-check instead of bouncing:
            </p>
            <ul className="mt-4 space-y-2.5">
              {[
                ["Unreconciled figures", "Revenue in the business chapter against the restated financials; objects against net proceeds; shareholding against paid-up capital."],
                ["Undisclosed related parties", "A promoter-connected dealing described anywhere in the issuer's answers but declared as nil."],
                ["Missing auditor reference", "Restated financials presented without the peer-reviewed auditor and firm registration number."],
              ].map(([title, body]) => (
                <li key={title} className="flex gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--status-complete))]" />
                  <span className="text-[13px]">
                    <span className="font-semibold text-foreground">{title}.</span>{" "}
                    <span className="text-muted-foreground">{body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="font-serif text-[19px] font-bold text-primary">Guardrails, stated plainly</h2>
            <dl className="mt-3 space-y-3.5">
              {[
                ["Preparatory draft, never a filing", "Submission is solely through the authorised merchant banker after due diligence and certification. Drafter reduces early-stage dependence on intermediaries; it does not remove them."],
                ["No hallucinated facts", `Factual chapters are built only from issuer inputs. Narrative chapters phrase language around verified data, and any model output containing a figure absent from the issuer data is rejected in favour of a deterministic template.`],
                ["Checklist before generation", `The ${gapReport.counts.total}-item requirement registry and the DRHP tree are the skeleton; generation fills it. The regulation set is versioned and identified: ${gapReport.registryVersion}.`],
                ["Confidentiality by architecture", "Pre-IPO data is price-sensitive. Issuer data stays in your browser session and is never persisted server-side."],
              ].map(([term, description]) => (
                <div key={term}>
                  <dt className="text-[13px] font-semibold text-foreground">{term}</dt>
                  <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{description}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 rounded-md bg-secondary/60 p-3 text-[12px] text-muted-foreground">
              {llmAvailable === null
                ? "Checking drafting mode…"
                : llmAvailable
                  ? `Narrative drafting is live via ${llmModel}. Factual chapters are unaffected by the model either way.`
                  : "No language-model key is configured, so narrative chapters come from deterministic templates. The product is fully functional in this mode — that is by design, so a live demo cannot fail."}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "complete" | "partial" | "missing" | "defect";
}) {
  return (
    <div className="rounded-md border border-border/70 bg-secondary/30 px-3 py-2.5">
      <p className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-serif text-[23px] font-semibold leading-none tabular-nums [font-optical-sizing:auto]",
          tone === "complete" && "text-[hsl(var(--status-complete))]",
          tone === "partial" && "text-[hsl(var(--status-partial))]",
          tone === "missing" && "text-[hsl(var(--status-missing))]",
          tone === "defect" && "text-[hsl(var(--status-defect))]",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function StepCard({
  href,
  step,
  icon,
  title,
  body,
}: {
  href: string;
  step: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Link href={href} className="group">
      <Card className="h-full transition-[transform,box-shadow,border-color] duration-200 ease-smooth hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-secondary text-primary transition-colors duration-200 ease-smooth group-hover:bg-primary group-hover:text-primary-foreground">
              {icon}
            </span>
            <span className="font-mono text-[10px] font-medium tracking-[0.1em] text-muted-foreground/70">
              {step}
            </span>
          </div>
          <h3 className="mt-4 font-serif text-[17px] font-semibold tracking-[-0.01em] text-primary">
            {title}
          </h3>
          <p className="mt-2 text-[12.5px] leading-[1.65] text-muted-foreground">{body}</p>
          <span className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-accent">
            Open <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
