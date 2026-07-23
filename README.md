# Drafter — SME IPO offer-document generation

[![verify](https://github.com/atharvagrawal28/drafter/actions/workflows/ci.yml/badge.svg)](https://github.com/atharvagrawal28/drafter/actions/workflows/ci.yml)

**Everyone else checks a DRHP that already exists. Drafter writes the first one.**

An AI-guided platform that turns an SME promoter's plain-language answers into a substantially
complete, correctly structured, **disclosure-mapped draft Red Herring Prospectus**, then runs an
**exchange-style Gap & Consistency check** over it before the merchant banker ever sees it.

Built for the **SEBI Securities Market TechSprint @ GFF 2026 — Track 04: Fund Raising**
by postgraduates in Securities Markets, NISM.

> **Drafter produces a preparatory draft. It is not a filing.** Submission is solely through the
> authorised merchant banker after due diligence and certification. All issuer data shipped with
> this prototype is fictional.

---

## Quick start

```bash
npm install && npm run dev
```

Open <http://localhost:3000>. **The app is fully functional with no API key** — narrative chapters
fall back to deterministic templates, so a live demo cannot fail.

To enable language-model drafting of the narrative chapters, create `.env.local`:

```bash
GROQ_API_KEY=gsk_your_free_key_here
GROQ_MODEL=llama-3.3-70b-versatile
```

Get a free key at <https://console.groq.com/keys>. The header shows which mode you are in.

### Verify the engine

```bash
npm run verify
```

Runs the generator, the gap checker and both exporters headlessly against both sample issuers and
asserts that **all six planted defects are still caught** with exact locations, that there are **no
false positives**, and that the DOCX and PDF exports still render. It also asserts two structural
properties: that **every scored evidence field has an intake control** — a requirement the wizard
cannot collect is one the issuer can never discharge — and that register normalisation **never moves
a figure**. Needs no API key. Run it after any change.

```bash
npm run verify:eligibility
```

Exercises the Chapter IX eligibility gate. Every condition is tested in three states — satisfied,
breached, and unanswered — and each numeric threshold is checked on **both** sides of the line: INR
9.90 crore and INR 25.10 crore post-issue capital; operating profit of exactly INR 1.00 crore against
INR 0.99 crore; two qualifying years against one. An unanswered condition must never read as a pass,
and a hard failure must outrank any number of unknowns.

```bash
npm run verify:extract
```

Builds a restated-financials spreadsheet in memory and asserts the extractor reads the three-year
series and the year headings correctly, that a row discharges only one line item, that an unlabelled
series is withheld rather than guessed, and that the promoter's own asserted revenue is never
overwritten by the audited figure.

```bash
npm run verify:watch          # add --live to also hit SEBI's feed
```

Tests Regulation Watch against fixture headlines rather than the live feed, because the feed carries
only ~30 items (about three days) and on most days the correct answer is "nothing relevant" — which
is indistinguishable from a classifier that never matches. The **negative** cases carry as much
weight as the positive ones: an appeal, a recovery certificate and an adjudication order that
mentions an SME public issue must all stay out of the panel.

```bash
npm run verify:llm
```

Exercises the live self-correction loop against your Groq key and asserts that no chapter falls back
for a quality reason, that no generated chapter contains a figure absent from the issuer data, and
that the planted defects still surface after refinement.

```bash
npm run backtest
```

Measures Drafter against a **real filed SME DRHP** — see [BACKTEST.md](BACKTEST.md).

### Deploy

```bash
npx vercel deploy
```

Add `GROQ_API_KEY` under *Project → Settings → Environment Variables* if you want live narrative
drafting in production (optional — template mode works identically). `npx vercel deploy --prod`
promotes to the production URL.

**Free-tier function limits are designed for, not discovered in production.** Vercel's Hobby plan
caps a function at **60 seconds**, and a higher `maxDuration` is rejected at build time rather than
degraded — so `/api/generate` declares 60 and gives model drafting a **45-second budget**. Past that
budget the self-correction loop stops calling the model and every remaining chapter takes the
deterministic template: a slow or rate-limited provider costs prose quality, never the request. With
the budget already spent the full 34-chapter document still returns in well under a second, and
labels itself template mode rather than claiming drafting it did not do. `npm run verify` asserts
this.

No environment variable is required to deploy. The app is fully functional without a key.

> Do not run `npm run build` while `npm run dev` is running — both write to `.next` and the dev
> server will start returning 500s. Stop the dev server first, or `rm -rf .next` to recover.

### How this stays correct

Most of what can break here is invisible to the eye: a regulation threshold edited from 15% to 25%,
an evidence field renamed so a requirement can never be discharged, a PDF section that only overflows
once it grows. Each of those has happened during this build. So the checks run themselves.

| When | What runs | Where |
|---|---|---|
| Every commit | No environment file may be staged; TypeScript must compile | `.githooks/pre-commit` |
| Every push | The full gate — engine, eligibility, extraction, regulation watch | `.githooks/pre-push` |
| Every push and PR to `main` | The same gate again, plus a production build, on a clean machine | `.github/workflows/ci.yml` |

The hooks install themselves: `npm install` runs a `prepare` script that points git at `.githooks`,
so a teammate who clones the repository gets the same guards without being told about them.

The secret guard is the one that matters most. This repository is developed with a live Groq key in
`.env.local`; `.gitignore` covers it, and the pre-commit hook refuses the commit outright if an
environment file is ever staged anyway. Both were tested by staging a fake key and confirming the
commit does not land.

---

## What it does

| # | Screen | What happens |
|---|--------|--------------|
| 1 | **Guided Intake** | Multi-step plain-language wizard. Every field is tagged with the DRHP chapter and disclosure requirement it feeds. Autosaves. Upload audited financials (XLSX/CSV/PDF) and Drafter reads the figures out of them. |
| 2 | **Draft DRHP** | All **34 chapters across Sections I–IX**, plus a prospectus cover page and sticky TOC. Every chapter shows the requirement IDs it discharges. Toggle the **disclosure trail** to see the provenance of every block. |
| 3 | **Gap & Consistency** | Opens with the **eligibility gate** — may this issuer make an SME IPO at all? Then an exchange-pre-check-styled report: coverage score, a ranked **action plan** with the coverage each step would add, per-requirement Complete/Partial/Missing, and findings with exact locations and the return pattern that would bounce the draft. |
| 4 | **Merchant Banker** | The same draft as due-diligence work product: documents required vs provided, chapter→requirement mapping, risk flags, and a version diff of the banker's amendments. |
| 5 | **Regulation Watch** | States the registry version and the date its rules were built against, then reads SEBI's public RSS feed and flags what has been published since. Rule-based classification, mapped to requirement IDs, with the matched terms shown. |
| 6 | **Impact** | How Drafter maps to the SEBI problem and scores on the TechSprint criteria, with an honest scope statement. |

Exports: **DOCX** and **PDF** of the full prospectus (34 pages, cover page, TOC, numbered sections,
ruled tables, headers/footers, page numbers) and the **gap report as a standalone compliance
checklist**.

---

## The wedge

| Player | What it does | Side of the pipeline |
|--------|--------------|----------------------|
| BSE GenAI DRHP pre-check | Checks a draft against exchange rules in <40 min (was 7 days) | Exchange gatekeeper |
| Invisigent, IPO dashboards | Review/analysis of an already-filed DRHP | Analysis (investor) |
| OnFinance AI | BFSI regulatory-compliance automation | Compliance ops |
| **Drafter** | **Promoter's plain answers → draft DRHP + gap check** | **Generation (issuer) — the gap** |

Drafter sits **upstream** of the exchange's own AI pre-check and targets the exact return patterns it
flags, so the draft clears pre-check instead of bouncing:

- **Unreconciled figures** — revenue in the business chapter vs the restated financials; objects vs
  net proceeds; shareholding vs paid-up capital.
- **Undisclosed related parties** — a promoter-connected dealing described anywhere in the issuer's
  own answers but declared as nil.
- **Missing auditor reference** — restated financials presented without the peer-reviewed auditor and
  firm registration number.

---

## Architecture

```
data/
  drhp_structure.json          9 sections, 34 chapters — the document tree (mode + priority)
  requirement_registry.json    76 disclosure requirements, each mapped to chapters + evidence fields
  intake_questionnaire.json    8-step plain-language wizard; every scored evidence field has a control
  sample_company_autocomp.json Shreeji Auto Components  — 2 planted defects
  sample_company_specchem.json Aarna Specialty Chemicals — 4 planted defects
knowledge_base/
  section_templates.json       Per-chapter drafting instructions + deterministic fallbacks
lib/
  types.ts                     The block model — every block carries provenance + requirement IDs
  engine/generate.ts           Walks the DRHP tree; factual builders, narrative, boilerplate
  engine/eligibility.ts        The gate — Reg 228, 229, 230(1), three-state per condition
  engine/gapCheck.ts           The trust layer — 11 consistency check types
  engine/actionPlan.ts         The gap report ranked into "what to do next"
  engine/llm.ts                Groq via the Vercel AI SDK, with output validation
  engine/dueDiligence.ts       Banker DD checklist + regulatory mapping
  export/docx.ts               Prospectus-formatted Word
  export/pdf.tsx               Prospectus-formatted PDF
app/api/                       generate · extract · status · export/{docx,pdf,gap}
```

### Validated against 17 real filed DRHPs

Drafter's structure and registry are not invented for a demo. They were measured against a corpus of
**17 filed SME DRHPs — 14 NSE Emerge and 3 BSE SME, 6,765 pages, 3.19 million words** — spanning manufacturing,
chemicals, software, engineering services, solar and events:

- **30 of 34 chapters** appear in *every* document in the corpus; all 34 in at least 86%.
- **72 of 73** scored disclosure requirements are evidenced in ≥70% of filings.
- **No chapter differs by more than a third** between NSE Emerge and BSE SME — one tree serves both.

More importantly, the corpus was run as a **gap hunt**, and it changed the product:

- **13 requirements added**, each appearing in 79–100% of real filings with no home in the registry
  — including SEBI's post-2022 **KPI** and **weighted average cost of acquisition** disclosures, the
  **monitoring agency**, and the **general-corporate-purposes ceiling**. Registry 60 → 76.
- **2 chapters added** — Summary of the Offer Document, and Our Subsidiaries. Structure 32 → 34.
- **3 citation defects fixed** after auditing the registry against the ICDR text itself — see Part 5
  of [BACKTEST.md](BACKTEST.md). The general-corporate-purposes ceiling had been carrying the
  main-board figure of 25% rather than Chapter IX's 15%-or-₹10-crore.
- **A new class of check**: `percentage_cap`, which catches a *regulatory arithmetic breach* (GCP
  above the ICDR ceiling) rather than an internal inconsistency.
- **A real defect fixed**: capacity disclosure appears in only 64% of filings because the rest are
  services businesses. Requirements are now **sector-conditional** — a software SME is no longer
  marked down for lacking a factory.

The corpus and single-document studies together also found and fixed three engine bugs that
synthetic fixtures could never have exposed. Full method, numbers and honest limitations:
**[BACKTEST.md](BACKTEST.md)**.

### The self-correction loop

When a Groq key is present, drafting runs through a **LangGraph** state machine with a genuine
conditional cycle:

```
draft ──▶ assemble ──▶ gapCheck ──▶ decide
   ▲                                  │
   └────────── revise ◀───────────────┘
        (while chapters remain defective
         and iterations < maxIterations)
```

The model occasionally rounds a figure (78.90 → "79") or omits a required topic. The validator
rejects such a chapter, and rather than silently degrading it to a template, the loop hands the
offending figures back to the model by name and redrafts. In testing this took narrative chapters
recovered from **2 of 4 falling back, to 0**.

It revises **drafting** defects only. It never revises prose in response to a Gap & Consistency
finding — that was built, tested, and deliberately removed, because feeding the revenue-mismatch
finding to the model made it quietly adopt the audited figure and paper over the promoter's error.
A drafter that harmonises away the inconsistency its own checker exists to catch is worse than no
checker. See the note at the top of `lib/engine/refineGraph.ts`.

**Five design decisions worth knowing:**

1. **Generation produces a structured document, not a string.** Every block carries `provenance`
   (issuer-input / derived / llm-narrative / template-narrative / standard-clause / placeholder) and
   the requirement IDs it discharges. The screen, the DOCX, the PDF and the gap report are four
   projections of that one model — which is what makes the disclosure trail machine-readable by
   construction rather than a claim.

2. **Coverage is computed, never asserted.** Each requirement declares `evidence_fields`; their
   presence in the issuer data decides Complete/Partial/Missing. The score moves as the wizard is
   filled in. It is also split into *overall* and *issuer-controllable* coverage, so the promoter's
   score is not depressed by work that is the banker's to do.

3. **The red-flag checks derive their conclusion from free text.** The litigation check reads the
   promoter's narrative answers, finds the proceeding, and then observes that the Legal chapter says
   "None pending" — rather than trusting a pre-set boolean. That is the behaviour that generalises to
   a real issuer who never sets a flag.

4. **The language model is fenced in.** It receives only the fields the knowledge base declares for
   that chapter, and its output is **post-validated**: if it emits a figure that does not appear in
   the supplied issuer data, the chapter is rejected and the deterministic template is used instead.
   A wrong number in an offer document is worse than plainer prose.

5. **Issuer data never rests on the server.** Pre-IPO data is price-sensitive. It lives in the
   browser session and is POSTed to stateless route handlers only when needed. That is the
   confidentiality guardrail — and it also means no database and no per-issuer marginal cost.

---

## 5-minute demo script

**0:00 — The problem (Overview screen).**
"SEBI's Track 04 problem is that preparing the IPO offer document is so complex and costly that SMEs
depend on intermediaries from day one. Months of merchant-banker, legal and compliance effort, at a
cost disproportionate to the capital raised." Point at the headline: *everyone else checks a DRHP
that already exists; Drafter writes the first one.* Note the live coverage panel — **91%**, computed
across 60 disclosure requirements, not hardcoded.
→ *Maps to: the SEBI problem statement; Market Impact.*

**0:45 — Guided Intake.**
Open **Guided Intake**. Scroll one step. "Plain language — 'what does your company make', not
'Schedule VI Part A clause 3'. Every field is tagged with the requirement it feeds." Show the
per-step progress in the left rail. Drop `sample_uploads/Shreeji_Restated_Financials.csv` on the
upload box in Step 3 — it reads six figures out of the spreadsheet and states which ones. Note it
populates the **audited** side only; it deliberately does not overwrite what the promoter asserted,
because reconciling those two is the point.
→ *Expected outcome #3 (simple enough for a first-time issuer); document intelligence.*

**1:45 — The draft (Draft DRHP).**
Click **Generate draft**, open **Draft DRHP**. Scroll the cover page — CIN, the issue, general risk,
both responsibility statements. Use the sticky TOC to jump to **III.4 Capital Structure**: real
tables — share capital build-up totalling back to the pre-issue capital, pre/post-issue shareholding
with computed percentages. "No invented numbers: factual chapters are built only from issuer data."
Point at the requirement chips under any chapter heading. Toggle **Show disclosure trail** — every
block reveals its source and the requirement IDs it discharges.
→ *Expected outcome #1; Technology Stack (traceability, not raw generation); SEBI supervision.*

**3:00 — The trust layer (Gap & Consistency).** *(the money shot)*
Open **Gap & Consistency**. "This is deliberately modelled on a BSE-style pre-check report, because
that is exactly what this draft has to survive next." Read the verdict: *2 issues would return this
draft at pre-check*. Walk **DR-INC-001**: business chapter says INR 82.50 crore, restated financials
say INR 78.90 crore — 4.6% apart, with both chapter locations linked. Then **DR-RFL-001**: the Legal
chapter says "None pending", but Drafter found a GST appeal referenced in the promoter's own business
notes. "The promoter never ticked a box. The checker read the narrative and caught the contradiction."
→ *Expected outcome #2; investor protection; the upstream-of-BSE positioning.*

**4:00 — Switch issuer (proves it is not hardcoded).**
Change the issuer selector to **Aarna Specialty Chemicals**. Same engine, different sector, and it
now fails on **three entirely different** requirements: objects short of net proceeds by INR 1.25
crore, related parties declared "Nil" while the business notes describe a promoter-owned tolling
arrangement, and a missing auditor reference. "One knowledge base, any issuer."
→ *Scalability; Feasibility.*

**4:30 — Merchant Banker + exports.**
Open **Merchant Banker**. "The intermediary is preserved, not removed." Show documents provided vs
outstanding, the chapter→requirement mapping, and the risk flags. Back on the draft, hit **DOCX** and
**PDF** — a 34-page prospectus-formatted document, plus the gap report as a standalone compliance
checklist. Close on **Impact**.
→ *Expected outcome #4; the honest scope statement.*

---

## Honest limitations (disclose these to judges)

A filed DRHP runs to 200–350 pages and only becomes filing-grade after a merchant banker's due
diligence and certification. No tool produces that unaided, and a securities-markets jury knows it.
What Drafter actually delivers, and what it does not:

**What is real**
- All 32 chapters of the SME DRHP tree are generated and navigable; the 13 priority chapters are
  fully drafted, the rest carry proper headings and structured placeholders.
- Factual chapters contain only issuer-supplied or arithmetically derived numbers.
- The gap checker computes coverage from evidence fields and catches all five planted defects across
  two issuers with zero false positives (`npm run verify`).
- DOCX and PDF exports are real 34-page prospectus-formatted documents.

**What is scoped for the prototype**
- Two **fictional** sample issuers. No real issuer data is used anywhere.
- The requirement registry is **curated and demo-versioned** (`2026-07-R4`, 76 requirements, 11
  consistency check types). It is representative, not an exhaustive reproduction of Schedule VI.
  The twelve citations that name a **regulation number** have been checked against the consolidated
  ICDR text as last amended on 8 March 2025 — see Part 5 of [BACKTEST.md](BACKTEST.md), which
  records three defects that audit found and fixed. The remaining citations name a Schedule VI
  heading, which describes where a disclosure sits in the offer document rather than which provision
  compels it; those are corpus-derived and remain unverified against the Schedule text.
- Financials extraction reads **labelled rows** — the three-year series and the year headings where
  the sheet has them, otherwise the latest-year figures. It reports what it is confident of, withholds
  an unlabelled series rather than guessing at it, and leaves the rest to the promoter.
- Industry statistics, market sizes and peer multiples are **deliberately not generated** — they
  cannot be derived from issuer data, so the chapter tells the banker to source and attribute them.
- The **eligibility gate** tests the conditions in Regulations 228, 229 and 230(1) that are decidable
  from the issuer's own figures and dated facts — the post-issue capital ceiling, the Reg 229(6)
  operating-profit test, the conversion and change-of-control cooling-off periods, and the general
  conditions. It does **not** test the SME exchange's own track-record and net-worth criteria under
  Reg 229(3), and it is a pre-screen rather than a clearance: eligibility is confirmed by the merchant
  banker in due diligence. An unanswered condition is reported as a question, never as a pass.
- Narrative quality with a Groq key is good but is prose *around* verified data; it is drafting
  assistance, not legal advice.
- Session-scoped storage (browser localStorage). No multi-user accounts, no audit log persistence.

**What Drafter never does**
Due diligence, verification of underlying records, certification, or filing. Those remain with the
merchant banker, the statutory auditor and legal counsel — by design, because that is the
accountability chain SEBI requires and the thing that makes the tool adoptable by the ecosystem
rather than adversarial to it.

---

## Path to production

Version the registry against the live ICDR text with per-item citations; add a vetted corpus of filed
SME DRHPs as a retrieval knowledge base; extend extraction to full restated statements with the
auditor's schedules; add multi-tenant issuer isolation and a persisted audit log of the disclosure
trail; extend the same engine to rights issues, mainboard migration and ongoing LODR disclosures —
the document tree changes, the machinery does not.

---

## Legacy prototype

The original Streamlit proof-of-concept is preserved under `legacy_streamlit/` for reference. It is
superseded by this Next.js application.
