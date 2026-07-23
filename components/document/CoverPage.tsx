"use client";

import type { CoverPage as CoverPageType, DrhpDocument } from "@/lib/types";
import { formatDate, formatTimestamp } from "@/lib/utils";

/**
 * The DRHP cover page.
 *
 * Laid out to match a filed SME offer document: the "Draft Red Herring
 * Prospectus" rubric, issuer identity block, the issue line, the general risk
 * statement, and the twin responsibility statements of the issuer and the lead
 * manager. Everything is issuer data — nothing here is decorative.
 */
export function CoverPage({ cover, document }: { cover: CoverPageType; document: DrhpDocument }) {
  return (
    <section
      id="ch-COVER"
      className="scroll-mt-36 border border-border bg-paper px-8 py-10 shadow-sm sm:px-14 sm:py-14"
    >
      <div className="prospectus mx-auto max-w-3xl">
        {/* Rubric */}
        <div className="text-center">
          <p className="font-sans text-[10px] uppercase tracking-[0.35em] text-muted-foreground">
            {cover.documentLabel}
          </p>
          <p className="mt-1 font-sans text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Dated {formatDate(document.generatedAt)} · Please read section 26 of the Companies Act, 2013
          </p>
          <p className="mt-0.5 font-sans text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {cover.issueTypeLine}
          </p>
        </div>

        <div className="my-8 border-t border-double border-t-2 border-ink/25" />

        {/* Issuer identity */}
        <div className="text-center">
          <h1 className="prospectus-h1 !text-[30px] leading-tight">{cover.companyName}</h1>
          <p className="mt-3 text-[13px] text-muted-foreground">
            Corporate Identification Number: {cover.cin}
          </p>
          <p className="text-[13px] text-muted-foreground">{cover.incorporationLine}</p>
        </div>

        <div className="mx-auto my-7 max-w-xl space-y-1.5 text-center text-[13px]">
          <p>
            <span className="font-semibold">Registered office:</span> {cover.registeredOffice}
          </p>
          {cover.corporateOffice && cover.corporateOffice !== cover.registeredOffice ? (
            <p>
              <span className="font-semibold">Corporate office:</span> {cover.corporateOffice}
            </p>
          ) : null}
          {cover.contactLine ? <p className="text-muted-foreground">{cover.contactLine}</p> : null}
          <p>
            <span className="font-semibold">Company Secretary and Compliance Officer:</span>{" "}
            {cover.companySecretary}
          </p>
          <p>
            <span className="font-semibold">Promoters:</span> {cover.promoters}
          </p>
        </div>

        <div className="my-8 border-t border-ink/20" />

        {/* The issue */}
        <div className="bg-secondary/40 px-6 py-5 text-center">
          <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
            The Issue
          </p>
          <p className="mt-2 text-[15px] font-semibold leading-relaxed">{cover.issueLine}</p>
          <p className="mt-2 text-[13px]">{cover.priceLine}</p>
          <p className="mt-2 text-[12px] text-muted-foreground">{cover.platformLine}</p>
        </div>

        {/* Mandatory statements */}
        <div className="mt-8 space-y-5 text-[12.5px] leading-relaxed">
          <div>
            <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[0.16em]">
              General Risk
            </p>
            <p className="text-justify">{cover.generalRisk}</p>
          </div>
          <div>
            <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[0.16em]">
              Issuer&apos;s Absolute Responsibility
            </p>
            <p className="text-justify">{cover.issuerResponsibility}</p>
          </div>
          <div>
            <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[0.16em]">
              Lead Manager&apos;s Responsibility
            </p>
            <p className="text-justify">{cover.lmResponsibility}</p>
          </div>
        </div>

        {/* Intermediaries */}
        <div className="mt-9 grid gap-5 border-t border-ink/20 pt-6 sm:grid-cols-3">
          {[
            ["Lead Manager", cover.leadManager],
            ["Registrar to the Issue", cover.registrar],
            ["Market Maker", cover.marketMaker],
          ].map(([label, value]) => (
            <div key={label} className="text-center">
              <p className="font-sans text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {label}
              </p>
              <p className="mt-1 text-[13px] font-semibold">{value}</p>
            </div>
          ))}
        </div>

        {/* Prototype watermark — honest about what this document is */}
        <div className="mt-10 border-t border-dashed border-accent/40 pt-4 text-center">
          <p className="font-sans text-[10px] uppercase tracking-[0.18em] text-accent">
            Preparatory draft generated by Drafter — not for filing
          </p>
          <p className="mt-1 font-sans text-[10px] text-muted-foreground">
            Regulation set {document.regulationSetVersion} · Generated{" "}
            {formatTimestamp(document.generatedAt)} ·{" "}
            {document.generationMode === "llm"
              ? `Narrative drafted by ${document.llmModel}`
              : "Narrative from deterministic templates"}
          </p>
        </div>
      </div>
    </section>
  );
}
