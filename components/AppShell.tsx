"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  BriefcaseBusiness,
  FileText,
  Info,
  Route,
  ListChecks,
  Loader2,
  MailWarning,
  Radar,
  Scale,
  ScrollText,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { BLANK_ISSUER_ID, sampleIssuers } from "@/lib/data";
import { useDrafter } from "@/lib/store";
import { ROLES, groupedNav, navEmphasis } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { Badge, Button, Segmented, Select } from "@/components/ui/primitives";
import { Explain } from "@/components/ui/Explain";

const NAV = [
  { href: "/", label: "Overview", icon: Building2 },
  { href: "/intake", label: "Guided Intake", icon: ListChecks },
  { href: "/document", label: "Draft DRHP", icon: ScrollText },
  { href: "/gaps", label: "Gap & Consistency", icon: ShieldCheck },
  { href: "/trace", label: "Drafting Record", icon: Radar },
  { href: "/banker", label: "Merchant Banker", icon: BriefcaseBusiness },
  { href: "/observations", label: "Observation Replay", icon: MailWarning },
  { href: "/circulars", label: "Regulation Watch", icon: Scale },
  { href: "/how", label: "How it works", icon: Route },
  { href: "/about", label: "Impact", icon: Info },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { role, setRole, issuerId, selectIssuer, gapReport, generate, generating, document, llmAvailable, llmModel } =
    useDrafter();

  return (
    <div className="flex min-h-screen flex-col">
      {/* ---------------------------------------------------------------- */}
      {/* Masthead                                                          */}
      {/* ---------------------------------------------------------------- */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-card/85 backdrop-blur-xl supports-[backdrop-filter]:bg-card/70">
        <div className="mx-auto flex h-[68px] max-w-[1600px] items-center gap-5 px-5 sm:px-7">
          <Link href="/" className="group flex shrink-0 items-center gap-3">
            {/* The seal. A brass hairline inside the ink block reads as a stamp
                rather than an app icon — and it is the only place the accent
                appears in the masthead. */}
            <span className="relative flex h-9 w-9 items-center justify-center rounded-[9px] bg-primary text-primary-foreground shadow-sm ring-1 ring-inset ring-accent/25 transition-shadow duration-200 ease-smooth group-hover:shadow-md">
              <FileText className="h-[17px] w-[17px]" />
            </span>
            <span className="hidden flex-col leading-none sm:flex">
              <span className="font-serif text-[19px] font-semibold tracking-[-0.015em] text-primary">
                Drafter
              </span>
              <span className="mt-[3px] text-[9.5px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                SME offer documents
              </span>
            </span>
          </Link>

          <div className="hidden h-7 w-px bg-border lg:block" />

          {/* Issuer selector — proves the engine is not hardcoded to one company */}
          <div className="hidden min-w-0 items-center gap-2 lg:flex">
            <span className="shrink-0 text-xs font-medium text-muted-foreground">Issuer</span>
            <Select
              value={issuerId}
              onChange={(event) => selectIssuer(event.target.value)}
              className="h-8 w-[280px] text-xs"
              aria-label="Select sample issuer"
            >
              {sampleIssuers.map((issuer) => (
                <option key={issuer.id} value={issuer.id}>
                  {issuer.name} · {issuer.sector}
                </option>
              ))}
              {/* The escape hatch from the demo. Without this the product can
                  only ever be pointed at the two bundled samples. */}
              <option value={BLANK_ISSUER_ID}>+ Start a new company…</option>
            </Select>
          </div>

          <div className="flex-1" />

          {/* Live coverage — recomputed from issuer data on every change */}
          <Link
            href="/gaps"
            className="hidden items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-1.5 shadow-xs transition-[border-color,box-shadow] duration-200 ease-smooth hover:border-input hover:shadow-sm md:flex"
            title="Disclosure coverage across the requirement registry"
          >
            <span className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {role === "banker" ? "Issuer coverage" : "Coverage"}
            </span>
            <span className="font-serif text-[17px] font-semibold leading-none tabular-nums text-primary">
              {gapReport.coveragePct}%
            </span>
            {gapReport.findingCounts.high > 0 ? (
              <Badge variant="defect">{gapReport.findingCounts.high} high</Badge>
            ) : (
              <Badge variant="complete">clear</Badge>
            )}
          </Link>

          <Segmented
            className="hidden sm:inline-flex"
            value={role}
            onChange={setRole}
            options={[
              { value: "promoter", label: "Promoter", icon: <UserRound className="h-3.5 w-3.5" /> },
              { value: "banker", label: "Merchant Banker", icon: <BriefcaseBusiness className="h-3.5 w-3.5" /> },
            ]}
          />

          <Button onClick={generate} disabled={generating} size="sm" className="shrink-0">
            {generating ? (
              <>
                <Loader2 className="animate-spin" />
                Drafting…
              </>
            ) : (
              <>
                <Sparkles />
                {document ? "Regenerate" : ROLES[role].generateLabel}
              </>
            )}
          </Button>
        </div>

        {/* ------------------------------------------------------------ */}
        {/* Primary navigation                                            */}
        {/* ------------------------------------------------------------ */}
        {/* Understand → Prepare → Verify, in that order, and the SAME order in
            both seats. The role changes weight and colour, never position: a
            navigation that rearranges itself costs the user the spatial memory
            they built in the first minute, and it camouflages the one thing
            that actually differs between the two roles.

            Nothing is hidden either — a promoter should be able to look ahead
            at the banker's workspace, and a reviewer should see the whole
            product without hunting for a toggle. */}
        <nav className="mx-auto flex max-w-[1600px] items-center gap-0.5 overflow-x-auto px-5 thin-scrollbar sm:px-7">
          {groupedNav(NAV).map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            const primaryForRole = item.href !== "/" && navEmphasis(role, item.href) === "primary";
            return (
              <React.Fragment key={item.href}>
                {item.startsGroup ? (
                  <span
                    aria-hidden
                    className="mx-1.5 h-3.5 w-px shrink-0 self-center bg-border"
                  />
                ) : null}
                <Link
                  href={item.href}
                  className={cn(
                    "relative flex shrink-0 items-center gap-1.5 px-3 pb-2.5 pt-1.5 text-[12.5px] tracking-[-0.005em] transition-colors duration-200 ease-smooth",
                    active
                      ? "font-medium text-primary"
                      : primaryForRole
                        ? "font-medium text-foreground/80 hover:text-foreground"
                        : "font-normal text-muted-foreground/75 hover:text-foreground",
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5 transition-colors", active && "text-accent")} />
                  {item.label}
                  {/* The rule is a child, not a border, so it can be inset and
                      rounded — a full-width border-bottom reads as a tab strip. */}
                  <span
                    className={cn(
                      "absolute inset-x-2 bottom-0 h-[2px] rounded-full transition-all duration-200 ease-smooth",
                      active ? "bg-accent opacity-100" : "bg-transparent opacity-0",
                    )}
                  />
                </Link>
              </React.Fragment>
            );
          })}
        </nav>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* Standing guardrail — visible on every screen, never dismissible   */}
      {/* ---------------------------------------------------------------- */}
      <div className="border-b border-accent/20 bg-accent/[0.055]">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2 text-[11px] sm:px-7">
          <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-[0.13em] text-accent">
            <span className="h-1 w-1 rounded-full bg-accent" />
            Preparatory draft
          </span>
          <span className="text-muted-foreground">
            Not for filing. Submission is solely through the authorised{" "}
            <Explain term="merchant banker" className="text-muted-foreground">
              merchant banker
            </Explain>{" "}
            after{" "}
            <Explain term="due diligence" className="text-muted-foreground">
              due diligence
            </Explain>{" "}
            and certification. All issuer data in this prototype is fictional.
          </span>
          <span className="ml-auto hidden items-center gap-1.5 text-muted-foreground lg:flex">
            {llmAvailable === null ? null : llmAvailable ? (
              <>
                <Sparkles className="h-3 w-3 text-accent" />
                Narrative drafting: {llmModel}
              </>
            ) : (
              <>
                <FileText className="h-3 w-3" />
                Narrative drafting: deterministic templates (no API key set)
              </>
            )}
          </span>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Role context — who you are in this seat, and what you carry       */}
      {/*                                                                   */}
      {/* The separation between the issuer who asserts and the intermediary */}
      {/* who verifies is one of the things this product exists to preserve, */}
      {/* so it is stated rather than implied by a toggle.                   */}
      {/* ---------------------------------------------------------------- */}
      <div
        className={cn(
          "border-b transition-colors duration-300 ease-smooth",
          role === "banker" ? "border-primary/15 bg-primary/[0.035]" : "border-border/70 bg-secondary/40",
        )}
      >
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-baseline gap-x-2.5 gap-y-1 px-5 py-[7px] text-[11px] sm:px-7">
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-[2.5px] text-[10px] font-semibold leading-none",
              role === "banker"
                ? "border-primary/25 bg-card text-primary"
                : "border-border bg-card text-secondary-foreground",
            )}
          >
            {role === "banker" ? (
              <BriefcaseBusiness className="h-[11px] w-[11px]" />
            ) : (
              <UserRound className="h-[11px] w-[11px]" />
            )}
            {ROLES[role].identity}
          </span>
          <span className="text-muted-foreground">{ROLES[role].obligation}</span>
        </div>
      </div>

      <main className="flex-1">{children}</main>

      <footer className="mt-4 border-t border-border bg-card">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-1.5 px-5 py-7 text-[11.5px] leading-relaxed text-muted-foreground sm:px-7">
          <p className="font-serif text-[13.5px] font-semibold text-foreground">
            Drafter — SEBI Securities Market TechSprint @ GFF 2026 · Track 04: Fund Raising
          </p>
          <p>
            Built by postgraduates in Securities Markets, NISM. Regulation set:
            SEBI (ICDR) Regulations, 2018 — Chapter IX and Schedule VI, as identified in the Impact view.
            Drafter produces a preparatory draft and does not replace the merchant banker&apos;s due
            diligence, review or certification.
          </p>
        </div>
      </footer>
    </div>
  );
}
