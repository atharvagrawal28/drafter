"use client";

/**
 * How Drafter works — the mechanism, not the pitch.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT THE IMPACT PAGE
 * /about answers "why does this product deserve to exist" — positioning,
 * comparison, what it deliberately does not do. This answers a different
 * question: what actually happens between a promoter typing an answer and a
 * draft chapter appearing, and why each stage is built the way it is.
 *
 * Every figure on this page is read from the CURRENT SESSION rather than
 * written into the copy. A page explaining a compliance tool cannot itself be
 * a set of unverifiable claims — and a number that updates as the user fills
 * in the intake is evidence, where the same number typed into a paragraph is
 * just marketing.
 */

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  ListChecks,
  Lock,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useDrafter } from "@/lib/store";
import { registry, flatChapters, questionnaire } from "@/lib/data";
import { cn } from "@/lib/utils";
import { Badge, Card, CardContent } from "@/components/ui/primitives";
import { Explain } from "@/components/ui/Explain";

interface Stage {
  id: string;
  step: string;
  title: string;
  icon: React.ReactNode;
  /** One line: what happens here. */
  what: string;
  /** The design decision and the reason for it. */
  why: string;
  /** The thing that would go wrong if it were built the obvious way. */
  otherwise: string;
  href: string;
  hrefLabel: string;
}

export function HowItWorks() {
  const { gapReport, document, refineTrace, issuerData } = useDrafter();
  const [active, setActive] = React.useState(0);

  const reg: any = registry;
  const quiz: any = questionnaire;
  const requirementCount = reg.sections.flatMap((s: any) => s.requirements).length;
  const questionCount = (quiz.steps ?? []).reduce(
    (sum: number, step: any) => sum + (step.questions ?? step.fields ?? []).length,
    0,
  );

  const rejected = Array.from(
    new Set((refineTrace?.chapters ?? []).flatMap((c) => c.rejectedFigures.flat()).filter(Boolean)),
  );

  // Live counts, so each stage shows the state of THIS session.
  const answered = countAnswered(issuerData);

  const STAGES: Stage[] = [
    {
      id: "ask",
      step: "01",
      title: "Ask, in plain language",
      icon: <ListChecks className="h-4 w-4" />,
      what: `${questionCount} questions across ${(quiz.steps ?? []).length} steps, written the way a promoter would describe their own business — not in regulatory vocabulary.`,
      why: "Every question is tagged with the disclosure requirement and the DRHP chapter it feeds, so an answer is never collected without a reason it can be shown.",
      otherwise:
        "A questionnaire written from the regulations asks a promoter about 'the aggregate of the pre-issue paid-up capital'. They stop, ring somebody, and the tool has failed at the first screen.",
      href: "/intake",
      hrefLabel: "Open the intake",
    },
    {
      id: "assemble",
      step: "02",
      title: "Assemble the document",
      icon: <ScrollText className="h-4 w-4" />,
      what: `${flatChapters.length} chapters across nine sections, built from a structure file rather than hard-coded. Factual chapters become real tables from issuer answers; standard text is written out in full.`,
      why: "The document is a tree of typed blocks, and every block carries provenance recording where its content came from — an issuer answer, a calculation, standard text, or the model.",
      otherwise:
        "A document built as one long string can be read but never audited. You could not answer 'where did this sentence come from' without asking whoever wrote the prompt.",
      href: "/document",
      hrefLabel: "Read the draft",
    },
    {
      id: "refuse",
      step: "03",
      title: "Refuse what the model invents",
      icon: <ShieldAlert className="h-4 w-4" />,
      what: "Every figure the language model writes is checked against the issuer data it was given. A number that appears nowhere in that data causes the entire chapter to be discarded and redrafted.",
      why: "The prompt forbids rounding in two separate places, and models round anyway — INR 78.90 crore comes back as 79. Prompting is a request; validation is a guarantee.",
      otherwise:
        "Trusting the instruction means a wrong figure reaches an offer document, reads as confident, and is caught — if at all — by the exchange, weeks later.",
      href: "/trace",
      hrefLabel: "See what was refused",
    },
    {
      id: "check",
      step: "04",
      title: "Check it like an exchange would",
      icon: <ShieldCheck className="h-4 w-4" />,
      what: `${requirementCount} tracked disclosure requirements, a Chapter IX eligibility gate, and cross-section consistency rules — all deterministic code with no model involved.`,
      why: "Compliance must not depend on a language model being in a good mood. Turn the model off entirely and the coverage score, the eligibility verdict and every finding are identical.",
      otherwise:
        "A checker that asks a model whether a document is compliant produces a different answer on Tuesday, and cannot tell you which rule it applied.",
      href: "/gaps",
      hrefLabel: "Open the gap report",
    },
    {
      id: "hand-over",
      step: "05",
      title: "Hand it to the merchant banker",
      icon: <BriefcaseBusiness className="h-4 w-4" />,
      what: "The same draft and the same findings, re-cut as due-diligence work: documents required against provided, and what remains for certification.",
      why: "Requirements only a banker or auditor can discharge are tracked separately, so they never inflate the promoter's apparent progress. Filing is theirs and the regulations reserve it to them.",
      otherwise:
        "A tool that reports 100% because it counted the auditor's unsigned certificate as complete has told the promoter they are finished when they have not started.",
      href: "/banker",
      hrefLabel: "Open the banker view",
    },
  ];

  const stage = STAGES[active];

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-10 sm:px-7">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        How it works
      </p>
      <h1 className="mt-1.5 font-serif text-[30px] font-bold leading-[1.15] tracking-[-0.02em] text-primary">
        From a promoter&apos;s answer to a disclosure-mapped draft
      </h1>
      <p className="mt-2.5 max-w-3xl text-[13.5px] leading-relaxed text-muted-foreground">
        Five stages. Every number below is read from the session you are looking at right now, so this
        page cannot describe a version of the product that does not exist.
      </p>

      {/* ---- Live state of this session --------------------------------- */}
      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <Metric value={String(answered)} label="Answers supplied" />
        <Metric value={`${gapReport.coveragePct}%`} label="Disclosure coverage" />
        <Metric
          value={document ? String(document.chapters.length) : "—"}
          label={document ? "Chapters drafted" : "No draft yet"}
        />
        <Metric
          value={rejected.length > 0 ? String(rejected.length) : document ? "0" : "—"}
          label="Figures refused"
          tone={rejected.length > 0 ? "text-[hsl(var(--status-defect))]" : undefined}
        />
      </div>

      {/* ---- The pipeline ----------------------------------------------- */}
      <div className="mt-8 flex flex-wrap items-stretch gap-2">
        {STAGES.map((item, index) => {
          const selected = index === active;
          return (
            <React.Fragment key={item.id}>
              <button
                type="button"
                onClick={() => setActive(index)}
                aria-pressed={selected}
                className={cn(
                  "flex min-w-[150px] flex-1 flex-col items-start gap-1.5 rounded-lg border px-3.5 py-3 text-left transition-all duration-200 ease-smooth",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  selected
                    ? "border-accent/40 bg-accent/[0.07] shadow-sm"
                    : "border-border bg-card shadow-xs hover:border-input hover:shadow-sm",
                )}
              >
                <span
                  className={cn(
                    "flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-[0.1em]",
                    selected ? "text-accent" : "text-muted-foreground",
                  )}
                >
                  {item.step}
                  {item.icon}
                </span>
                <span
                  className={cn(
                    "text-[12.5px] font-semibold leading-snug",
                    selected ? "text-primary" : "text-foreground",
                  )}
                >
                  {item.title}
                </span>
              </button>
              {index < STAGES.length - 1 ? (
                <ArrowRight className="hidden h-4 w-4 shrink-0 self-center text-muted-foreground/40 xl:block" />
              ) : null}
            </React.Fragment>
          );
        })}
      </div>

      {/* ---- Selected stage --------------------------------------------- */}
      <Card className="mt-4 animate-fade-in" key={stage.id}>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="accent">Stage {stage.step}</Badge>
            <h2 className="font-serif text-[21px] font-bold leading-snug text-primary">
              {stage.title}
            </h2>
          </div>

          <dl className="mt-5 grid gap-5 lg:grid-cols-3">
            <Facet term="What happens" body={stage.what} />
            <Facet term="Why it is built this way" body={stage.why} />
            <Facet term="What would go wrong otherwise" body={stage.otherwise} tone="warn" />
          </dl>

          <Link
            href={stage.href}
            className="mt-5 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary underline-offset-4 hover:underline"
          >
            {stage.hrefLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardContent>
      </Card>

      {/* ---- What cannot happen ----------------------------------------- */}
      <h2 className="mt-12 font-serif text-[21px] font-bold text-primary">
        Three things that cannot happen
      </h2>
      <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
        Stated as constraints rather than promises, because each is enforced by the way the product is
        built rather than by anyone remembering.
      </p>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <Constraint
          icon={<ShieldAlert className="h-4 w-4" />}
          title="It cannot invent a fact"
          body="The model only ever sees the fields the knowledge base declares for the chapter it is drafting, so it cannot reference issuer data it was never given. Anything numeric it writes is checked against that data before the chapter is accepted."
        />
        <Constraint
          icon={<Lock className="h-4 w-4" />}
          title="Your data cannot rest on our server"
          body="The generation route is stateless. Issuer data arrives in the request and leaves in the response; nothing is written to a disk or a database. Work in progress lives in your browser, and an exchange observation letter is parsed without ever being transmitted."
        />
        <Constraint
          icon={<CheckCircle2 className="h-4 w-4" />}
          title="It cannot file anything"
          body={
            <>
              The output is a preparatory draft. Submission is solely through the authorised{" "}
              <Explain term="merchant banker">merchant banker</Explain> after{" "}
              <Explain term="due diligence">due diligence</Explain> and certification — a separation
              the regulations require and this product is built to preserve.
            </>
          }
        />
      </div>

      <p className="mt-8 text-[12px] leading-relaxed text-muted-foreground">
        For positioning against the tools that review an already-filed DRHP, and for the limitations we
        disclose rather than hide, see{" "}
        <Link href="/about" className="text-primary underline underline-offset-2">
          Impact
        </Link>
        .
      </p>
    </div>
  );
}

function Metric({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-3.5">
        <p
          className={cn(
            "font-serif text-[24px] font-semibold leading-none tabular-nums text-primary",
            tone,
          )}
        >
          {value}
        </p>
        <p className="mt-1.5 text-[11px] text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function Facet({
  term,
  body,
  tone,
}: {
  term: string;
  body: string;
  tone?: "warn";
}) {
  return (
    <div>
      <dt
        className={cn(
          "text-[10px] font-semibold uppercase tracking-[0.13em]",
          tone === "warn" ? "text-[hsl(var(--status-missing))]" : "text-muted-foreground",
        )}
      >
        {term}
      </dt>
      <dd className="mt-1.5 text-[13px] leading-[1.6] text-foreground">{body}</dd>
    </div>
  );
}

function Constraint({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-accent">
          {icon}
          <h3 className="font-serif text-[15px] font-semibold text-primary">{title}</h3>
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

/** How many issuer fields carry a real answer, for the live session metric. */
function countAnswered(data: any): number {
  let count = 0;
  const walk = (value: any) => {
    if (value === null || value === undefined || value === "") return;
    if (Array.isArray(value)) {
      if (value.length > 0) count += 1;
      return;
    }
    if (typeof value === "object") {
      for (const child of Object.values(value)) walk(child);
      return;
    }
    count += 1;
  };
  walk(data);
  return count;
}
