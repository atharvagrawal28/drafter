"use client";

import Link from "next/link";
import {
  Building2,
  Cpu,
  FileCheck2,
  Landmark,
  Layers,
  Scale,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { problemStatement, registry, sampleIssuers } from "@/lib/data";
import { Badge, Card, CardContent } from "@/components/ui/primitives";

export default function AboutPage() {
  const requirementCount = registry.sections.reduce(
    (total, section) => total + section.requirements.length,
    0,
  );
  const metCount = problemStatement.clauses.filter((c) => c.status === "met").length;

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6">
      <Badge variant="accent" className="mb-3">
        Impact & how Drafter scores on the TechSprint criteria
      </Badge>
      <h1 className="font-serif text-[32px] font-bold leading-tight text-primary">
        Widening the pipeline of SMEs that can confidently list
      </h1>
      <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
        SEBI&apos;s problem statement is direct: preparing the IPO offer document is complex and
        costly — months of merchant-banker, legal and compliance effort, at a cost disproportionate to
        the capital an SME raises. Lean promoter teams with no capital-markets expertise cannot
        navigate the disclosure framework alone, so they depend on intermediaries from the very
        outset. SEBI wants that first step simplified — <span className="font-medium text-foreground">without</span>{" "}
        removing the intermediary&apos;s review and certification. Drafter is built to exactly that
        brief.
      </p>

      {/* ------------------------------------------------------------------ */}
      {/* Clause-by-clause conformance                                        */}
      {/*                                                                     */}
      {/* The most useful thing this page can do is let a reader check the    */}
      {/* claim instead of believing it. SEBI's words on the left; the file   */}
      {/* and the measured number on the right. Two clauses are honestly      */}
      {/* partial — a table of thirteen green ticks would not be credible to  */}
      {/* a securities-markets jury, and would not deserve to be.             */}
      {/* ------------------------------------------------------------------ */}
      <Card className="mt-8">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-[20px] font-bold text-primary">
                Clause-by-clause conformance
              </h2>
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                {problemStatement.source} — &ldquo;{problemStatement.title}&rdquo;
              </p>
            </div>
            <Badge variant="secondary">
              {metCount} of {problemStatement.clauses.length} met · {problemStatement.clauses.length - metCount} partial
            </Badge>
          </div>

          <div className="mt-5 space-y-3">
            {problemStatement.clauses.map((clause) => (
              <div
                key={clause.id}
                className="rounded-md border border-border bg-card p-4 transition-[border-color] duration-200 ease-smooth hover:border-input"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] font-medium text-muted-foreground">
                    {clause.id}
                  </span>
                  <Badge variant={clause.status === "met" ? "complete" : "partial"}>
                    {clause.status === "met" ? "met" : "partial — see evidence"}
                  </Badge>
                  <span className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                    {clause.origin}
                  </span>
                </div>

                {/* SEBI's own words, marked as a quotation so there is never a
                    question about which text is theirs and which is ours. */}
                <blockquote className="mt-2.5 border-l-2 border-accent/50 pl-3 font-serif text-[14px] italic leading-relaxed text-foreground">
                  &ldquo;{clause.text}&rdquo;
                </blockquote>

                <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                  {clause.discharged_by}
                </p>

                <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">Evidence — </span>
                  {clause.evidence}
                </p>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {clause.files.map((file) => (
                    <code
                      key={file}
                      className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground"
                    >
                      {file}
                    </code>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* The wedge */}
      <Card className="mt-8">
        <CardContent className="p-6">
          <h2 className="font-serif text-[20px] font-bold text-primary">The wedge: generation, not analysis</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-4 font-semibold">Tool</th>
                  <th className="py-2 pr-4 font-semibold">What it does</th>
                  <th className="py-2 font-semibold">Side of the pipeline</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                {[
                  ["BSE GenAI DRHP pre-check", "Checks a draft DRHP against exchange rules in under 40 minutes", "Exchange gatekeeper"],
                  ["Invisigent, IPO dashboards", "Review / analysis of an already-filed DRHP", "Analysis (investor)"],
                  ["OnFinance AI", "BFSI regulatory-compliance automation", "Compliance ops"],
                  ["Drafter (us)", "Turns a promoter's plain answers into a draft DRHP + gap check", "Generation (issuer) — the gap"],
                ].map((row, index) => (
                  <tr key={index} className={index === 3 ? "border-t border-border bg-accent/[0.05] font-medium text-foreground" : "border-t border-border/60"}>
                    <td className="py-2 pr-4">{row[0]}</td>
                    <td className="py-2 pr-4">{row[1]}</td>
                    <td className="py-2">{row[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
            Everyone else acts on a document that already exists. Drafter sits <span className="font-medium text-foreground">upstream</span> of
            the exchange&apos;s own pre-check and produces a first draft pre-aligned to the exact
            return patterns it flags — unreconciled figures, undisclosed related parties, missing
            auditor reference — so the draft clears pre-check instead of bouncing.
          </p>
        </CardContent>
      </Card>

      {/* Criteria */}
      <h2 className="mt-10 font-serif text-[22px] font-bold text-primary">How Drafter scores</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <CriterionCard
          icon={<TrendingUp className="h-5 w-5" />}
          title="Market Impact"
          body="Attacks the single largest cost-and-time barrier to SME listing — first-draft offer-document preparation. By making a substantially complete draft reachable without heavy early intermediary spend, it widens the pool of SMEs that can credibly begin the process."
        />
        <CriterionCard
          icon={<Cpu className="h-5 w-5" />}
          title="Technology Stack"
          body="LLM + RAG + document intelligence — but the differentiator is regulatory-grade traceability, not raw generation. Every generated block records its provenance and the requirement IDs it discharges, and any model output with an unverifiable figure is rejected."
        />
        <CriterionCard
          icon={<FileCheck2 className="h-5 w-5" />}
          title="Feasibility"
          body="Every input is public: the ICDR SME provisions, the exchange checklists, and filed DRHPs. No closed or paid data, and no paid dependency. The whole product runs on free tiers and deploys on Vercel."
        />
        <CriterionCard
          icon={<Layers className="h-5 w-5" />}
          title="Scalability"
          body={`One knowledge base — ${requirementCount} disclosure requirements across the full DRHP tree — serves every issuer, at near-zero marginal cost. The same engine ran unchanged against two issuers in different sectors. It extends to rights issues, mainboard migration and ongoing disclosures.`}
        />
      </div>

      {/* SEBI mandate */}
      <Card className="mt-8">
        <CardContent className="p-6">
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            <h2 className="font-serif text-[20px] font-bold text-primary">Alignment with the SEBI mandate</h2>
          </div>
          <div className="mt-4 grid gap-5 sm:grid-cols-3">
            <MandateItem
              icon={<Building2 className="h-4 w-4" />}
              title="Market development"
              body="More SMEs able to prepare a credible draft means a broader listing pipeline and deeper participation in public markets."
            />
            <MandateItem
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Investor protection"
              body="Higher first-draft disclosure quality and automated consistency checks reduce the risk of material omissions reaching investors."
            />
            <MandateItem
              icon={<Scale className="h-4 w-4" />}
              title="Supervision"
              body="Every block is mapped to a requirement ID and carries its provenance — a structured, machine-readable disclosure trail a supervisor could consume."
            />
          </div>
        </CardContent>
      </Card>

      {/* Honest scope */}
      <Card className="mt-8 border-accent/30 bg-accent/[0.04]">
        <CardContent className="p-6">
          <h2 className="font-serif text-[20px] font-bold text-primary">Honest scope</h2>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
            A filed DRHP runs to 200–350 pages and only becomes filing-grade after a merchant
            banker&apos;s due diligence and certification. No tool produces that unaided, and a
            securities-markets jury knows it. Drafter&apos;s claim is precise and defensible: a{" "}
            <span className="font-medium text-foreground">substantially complete, correctly structured,
            disclosure-mapped DRHP draft</span> with automated gap and consistency checks, pre-aligned
            to the exchange&apos;s own AI pre-check, with the merchant banker preserved as the
            certifier. It is a preparatory draft, never a filing.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              ["What Drafter does", "Assembles all 34 chapters from the real SME DRHP tree; fills factual chapters from issuer data as real tables; drafts narrative chapters in prospectus register; runs an exchange-style gap and consistency check; exports prospectus-formatted DOCX and PDF."],
              ["What Drafter does not do", "It does not conduct due diligence, verify the underlying records, compute promoter lock-in, draft the full financial statements, or certify anything. Those remain with the merchant banker, the auditor and legal counsel."],
              ["Prototype limits", "Two fictional sample issuers; a curated (not exhaustive) requirement registry versioned as a demo; financials extraction reads summary figures, not full statements; industry statistics are deliberately left for the banker to source and attribute."],
              ["Path to production", "Version the registry against the live ICDR text; add a vetted DRHP corpus as a retrieval knowledge base; expand extraction to full restated statements; add multi-user issuer isolation and an audit log of the disclosure trail."],
            ].map(([title, body]) => (
              <div key={title} className="rounded-md border border-border bg-card p-4">
                <p className="text-[13px] font-semibold text-foreground">{title}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="mt-8 flex flex-wrap gap-3">
        {sampleIssuers.map((issuer) => (
          <Link key={issuer.id} href="/document">
            <Badge variant="secondary" className="px-3 py-1.5 text-[12px]">
              Sample issuer: {issuer.name} · {issuer.sector}
            </Badge>
          </Link>
        ))}
      </div>
    </div>
  );
}

function CriterionCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-primary">{icon}</span>
          <h3 className="font-serif text-[16px] font-bold text-primary">{title}</h3>
        </div>
        <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

function MandateItem({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-foreground">
        <span className="text-accent">{icon}</span>
        {title}
      </p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
