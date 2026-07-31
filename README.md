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

## What SEBI asked for, clause by clause

The Track 04 problem statement is recorded verbatim in
[`data/problem_statement.json`](data/problem_statement.json), split into the thirteen clauses that
impose a requirement. Each one names the files that discharge it and the number that proves it, and
`npm run verify` asserts that every cited file still exists — so this table cannot quietly rot.

| # | SEBI's words | Discharged by | Proof |
|---|---|---|---|
| PS-1 | capture their business, financial, **and legal** particulars | 8-step wizard; financials read out of the issuer's own workbook | **125** evidence-field references, all reachable — nothing in the registry is uncollectable |
| PS-2 | generate a **well-organised, disclosure-ready** draft offer document | 34 chapters, Sections I–IX; prospectus-formatted DOCX + PDF | 9,975 words, 26 tables, 49KB DOCX, 140KB PDF |
| PS-3 | accessible to promoters **without specialist knowledge** | Plain questions + a register normaliser that lifts them into prospectus prose | No figure moved across **258** free-text fields; transform is idempotent |
| PS-4 | checks for **accuracy and completeness** | Two mechanisms: weighted coverage over 76 requirements; 11 cross-chapter consistency checks | Planted defects surface with the **exact** high-severity count (2 and 4) — a false positive fails the build |
| PS-5 | **preserve the role of authorised intermediaries** in review and certification | 7 placeholders sitting exactly at signature points; 14-item DD checklist ending at DD-14 Certification | Standing non-dismissible "not for filing" banner on every screen |
| PS-6 | a **substantially complete** draft | Coverage computed as a weighted mean over applicable requirements | 97% / 95% on the samples, **14%** on a blank form — the score moves with the evidence |
| PS-7 | significantly **reducing preparation time** | An effort meter that times active promoter effort, stamps each coverage milestone and the first draft | ⚠️ **Partial** — measures drafting effort in Drafter, not the auditor/legal/DD cycle. Pauses are counted at the cap, so the figure *overstates* effort |
| PS-8 | lowering dependence on intermediaries **at the early drafting stage** | Promoter and banker are separate roles; the split falls where SEBI puts it | Eligibility answered before any fee is committed |
| PS-9 | more accessible **for smaller enterprises** | The Chapter IX gate answers "may I list at all?" first | Reg 229(6) checked at the boundary — ₹1.00cr counts, ₹0.99cr does not round up |
| PS-10 | **all material disclosure requirements** under SEBI's SME IPO framework | Versioned registry + **Observation Replay**, which tests it against a real exchange letter | ⚠️ **Partial** — 76 requirements, curated not exhaustive; validated against 17 real filed DRHPs; unmatched observations count *against* the score |
| PS-11 | flag **gaps or inconsistencies** | Both, separately: Complete/Partial/Missing + coded findings with exact chapter locations | Working down the action plan arrives *exactly* at the projected coverage |
| PS-12 | simple enough for a **first-time issuer** | Start a new company from a blank form; findings suppressed until they mean something | **Zero** high-severity findings on an untouched form |
| PS-13 | broadening the pipeline of SMEs that can **confidently** pursue a listing | Three-state conditions — met, not met, or unknown; an unknown never reads as a pass | Every unknown states exactly what would resolve it |

Two clauses are marked partial on purpose, and `npm run verify` fails if that ever silently becomes
thirteen green ticks. A jury of securities-markets people would not believe a perfect score, and it
would not deserve to be believed.

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

**The token budget is measured against the provider's own limiter, not estimated.** Two things about
Groq's free tier are not the obvious thing, and both were found by reading its headers and its 429
bodies rather than by assuming:

1. The limiter charges the **reservation, not the completion**. A 40-token prompt sent with
   `max_tokens: 4000` is billed `Requested 4042` even if the model writes twenty words. So a chapter
   costs its prompt plus `MAX_COMPLETION_TOKENS` in full, every time, whatever its length.
2. The binding cap is **tokens per day (100,000)**, not the per-minute bucket — a run can fail on
   quota while `x-ratelimit-remaining-tokens` reads a comfortable 12,000.

Together those set the drafting concurrency. Measured prompts run 1,262–2,033 tokens per chapter, so
a burst costs `concurrency x (prompt + 2,400)` against a 12,000-token bucket: three in flight comes
to ~12,300 and 429s the third chapter, which is exactly why runs were returning two drafted chapters
and the rest on templates. Two fits at ~8,500 with headroom the bucket refills (~200 tokens/second)
before the next draft finishes. `npm run verify` asserts the burst fits — **and asserts that the
concurrency of 3 which actually failed is rejected**, so the check cannot quietly become vacuous if
either number is raised later.

**Quota is spread across four models, because the free tier meters each one separately.** Exhausting
`llama-3.3-70b-versatile`'s 100,000-token day says nothing about `gpt-oss-120b`'s, so a single-model
configuration hands the user templates while three untouched daily budgets sit unused on the same
key. Drafting falls down a chain — 70b, then `gpt-oss-120b`, then `gpt-oss-20b`, then
`llama-3.1-8b-instant` — and only on **quota** failures. An unsupported figure does not advance the
chain: that is a specific, nameable defect the revision pass repairs by naming the figure back to the
same model, and silently re-rolling elsewhere would make the refine trace unreadable.

Measured with 70b's daily cap genuinely exhausted:

| | chapters drafted by a model | fell back to template |
|---|---|---|
| single model | 0 of 5 | 5 |
| fallback chain | 3–4 of 5 | 1–2 |

A day cap benches a model for the window Groq quotes; a *minute* bucket does not, or a transient blip
would sideline a model for an hour. The chain re-sizes its own fan-out when it moves, because the
substitute's bucket is smaller (8,000, not 12,000). Each chapter records which model wrote it, and
the loop's log says so — a reader comparing two chapters' prose deserves to know they had different
authors.

Falling down the chain is only safe because quality is enforced on the **output** rather than assumed
from the model. `gpt-oss-120b` was observed rounding INR 78.90 crore to "79" exactly as 70b does, and
was rejected for it exactly as 70b is. The no-hallucination guarantee is a property of the validator,
not of the model — which is what makes substituting models a cost decision rather than a safety one.

Quota retries are deadline-aware for the same reason. Groq answers a 429 with "please try again in
27.4s"; honouring that up to four times took measured runs to 82–96 seconds against a 45-second
budget, which on a 60-second ceiling is a 504. A retry is now only taken when the wait still leaves
time to draft afterwards. The same throttled key that produced 82–96s now returns in 44–47s, on
templates where it must. Falling back to a deterministic chapter is an acceptable outcome; a dead
request in front of an audience is not.

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
| 5 | **Observation Replay** | Paste the observation letter the exchange returned on a draft. Each observation is mapped to the requirement and chapter that would have raised it first, or reported as a **registry gap**. The only check on this product that does not come from this product. Runs entirely client-side — the letter never leaves the browser. |
| 6 | **Regulation Watch** | States the registry version and the date its rules were built against, then reads SEBI's public RSS feed and flags what has been published since. Rule-based classification, mapped to requirement IDs, with the matched terms shown. |
| 7 | **Impact** | Clause-by-clause conformance against SEBI's problem statement, with the file and measured number behind each claim, plus an honest scope statement. |

Exports: **DOCX** and **PDF** of the full prospectus — 34 chapters over **36 PDF pages** (Word
paginates tighter, around 27), with a cover page, TOC, numbered sections, ruled tables,
headers/footers and page numbers — plus the **gap report as a standalone compliance checklist**.

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

## Demo script

Roughly **7 minutes** as written. Two beats are marked **[cut for 5]** — drop them and the story
still lands. Every figure below is real output, asserted by `npm run verify`; if one has drifted the
verify run will say so before a judge does.

**0:00 — The problem (Overview).**
"SEBI's Track 04 problem is that preparing the IPO offer document is so complex and costly that SMEs
depend on intermediaries from day one — months of merchant-banker, legal and compliance effort, at a
cost disproportionate to the capital raised." Point at the headline: *everyone else checks a DRHP
that already exists; Drafter writes the first one.* Note the coverage panel — **97%**, a computed
weighted mean over **76** disclosure requirements, not a hardcoded number.
→ *The problem statement; Market Impact.*

**0:30 — "May I list at all?" (Gap & Consistency → the eligibility gate).**
Before anything else, the gate. "This is the question an SME actually asks first, and today it gets
answered only after they have engaged advisers." Eight Chapter IX conditions under Reg 228, 229 and
230, each **met / not met / unknown** — and an unknown never reads as a pass; it states exactly what
would resolve it. Call out **Reg 229(6)** — operating profit of at least ₹1 crore in two of the last
three years, inserted 8 March 2025. "This is the condition that disqualifies most aspirants, and
Drafter checks it before a rupee of fees is committed."
→ *Expected outcome: accessible for smaller enterprises; broadening the pipeline.*

**1:15 — Guided Intake.**
"Plain language — 'do you have any court cases', not 'Schedule VI Part A clause 11'. Every field is
tagged with the requirement it feeds." Show the per-step progress in the left rail. Drop
`sample_uploads/Shreeji_Restated_Financials.csv` on the upload box: it reads the column headers
(FY24, FY25, FY26), then **11 fields including 5 three-year series** — revenue, EBITDA, PAT, EPS and
return on net worth — and prints the label it matched for each, so nothing is silently guessed.

Land the setup for the money shot: **"the audited sheet says revenue of ₹78.90 crore."** The
extractor populates the **audited** side only and deliberately does not overwrite what the promoter
asserted elsewhere — because reconciling those two is exactly what the next-but-one screen does.
→ *Capturing business, financial and legal particulars; document intelligence.*

**2:00 — The draft (Draft DRHP).**
**Generate draft**, then open it. Scroll the cover page — CIN, the issue, general risk, both
responsibility statements. Jump via the sticky TOC to **III.4 Capital Structure**: share capital
build-up totalling back to the pre-issue capital, pre/post-issue shareholding with computed
percentages. "No invented numbers — factual chapters are built only from issuer data." Toggle
**Show disclosure trail**: every block reveals its provenance and the requirement IDs it discharges.
Then scroll to a **placeholder** and land the line: *"There are seven of these, and every one sits
where the law needs a named professional to sign — the auditor's examination report, counsel's tax
particulars, the executed declaration page. Drafter stops exactly there."*
→ *A well-organised, disclosure-ready draft; preserving the intermediary; traceability over raw generation.*

**3:00 — The trust layer (Gap & Consistency).** *(the money shot)*
"Deliberately modelled on a BSE-style pre-check report, because that is what this draft has to
survive next." Verdict: **2 issues would return this draft at pre-check**.
- **DR-INC-001** — Our Business (IV.2) states **₹82.50 crore**; Restated Financials (V.1) shows
  **₹78.90 crore** — the figure that came off the spreadsheet two minutes ago. A gap of **₹3.60
  crore (4.6%)**, both chapters linked.
- **DR-RFL-001** — the Legal chapter says *"None pending"*, but Drafter found a matter *"currently
  under appeal before the Appellate Authority"* in the promoter's own business notes. **"The
  promoter never ticked a box. The checker read the narrative and caught the contradiction."**

Then the **action plan**: what to answer next, ranked by the coverage each answer buys — and working
down the list arrives *exactly* at the projected number.
→ *Flagging gaps AND inconsistencies; investor protection; upstream of BSE's own pre-check.*

**4:15 — Switch issuer (proves it is data-driven).** **[cut for 5]**
Selector → **Aarna Specialty Chemicals**. Same engine, different sector, **four entirely different**
failures: objects aggregating ₹19.75 crore against ₹21.00 crore of net proceeds (**₹1.25 crore
unallocated**); related parties declared "Nil" while the notes describe a promoter-owned tolling
arrangement; a missing auditor reference; and **₹6.00 crore to general corporate purposes — 26.7% of
a ₹22.50 crore issue, against a Reg 230(2) ceiling of ₹3.38 crore**. Read that last one out: it
shows the regulation, the arithmetic and which limb binds. "One knowledge base, any issuer."
→ *Scalability; Feasibility.*

**4:55 — Observation Replay (the outside check).**
"Everything so far is self-referential — the registry says the draft is complete because the registry
says so. This is the one check that comes from outside." Paste an exchange observation letter; each
observation is mapped to the requirement and chapter that would have raised it first. Point at the
**registry gap** — an observation nothing in the registry covers — and say the important part out
loud: *"it counts against our own score. Dropping it would have made the number look better."*
Note the client-side guarantee: the letter never leaves the browser.
→ *All material disclosure requirements — measured against ground truth, not asserted.*

**5:45 — Start a new company (this is a product, not a demo).** **[cut for 5]**
Issuer selector → **+ Start a new company**. A blank form for a real issuer — and note what it does
*not* do: no wall of red. **Zero** high-severity findings before a single question is answered,
coverage honestly **14%**, eligibility *indeterminate* rather than a false pass. Answer two or three
fields and the **preparation-time meter** starts: active effort, the time each coverage milestone was
crossed, the time to first draft. Open "what exactly is being measured?" — *"pauses are counted at
the cap, so this figure overstates our own effort. And it measures drafting inside Drafter, not the
auditor's restatement or the banker's due diligence."*
→ *Simple enough for a first-time issuer; reducing preparation time, measured rather than claimed.*

**6:30 — Merchant Banker, exports, close.**
Open **Merchant Banker**: "the intermediary is preserved, not removed." Documents provided vs
outstanding across a **14-item due-diligence checklist assigned by owner** — 6 issuer, 4 auditor,
4 lead manager, 1 legal counsel — ending at DD-14, Certification. Export **DOCX** and **PDF**:
34 chapters, 36 PDF pages, prospectus formatting, plus the gap report as a standalone compliance
checklist. Close on **Impact** — the clause-by-clause conformance table, and the two clauses marked
**partial** on purpose. *"Eleven of thirteen met. We are telling you which two aren't, and why."*
→ *The honest scope statement — and the reason to believe the other eleven.*

---

## Honest limitations (disclose these to judges)

A filed DRHP runs to 200–350 pages and only becomes filing-grade after a merchant banker's due
diligence and certification. No tool produces that unaided, and a securities-markets jury knows it.
What Drafter actually delivers, and what it does not:

**What is real**
- All 34 chapters of the SME DRHP tree are generated and navigable; the 14 priority chapters are
  fully drafted, the rest carry proper headings and structured placeholders. The remaining
  placeholders — 7 for the first sample issuer, 8 for the second — each sit where the law requires a
  named professional to sign: the auditor's examination report and tax-benefits certificate,
  counsel's tax particulars, the lock-in computation, the verbatim Articles, the executed
  declaration page.
- Factual chapters contain only issuer-supplied or arithmetically derived numbers.
- The gap checker computes coverage from evidence fields and catches all six planted defects across
  two issuers with the **exact** high-severity counts — 2 and 4 — so a false positive fails the
  build as loudly as a miss (`npm run verify`).
- DOCX and PDF exports are real prospectus-formatted documents: 34 chapters over 36 PDF pages.
- Preparation time is **measured**, not asserted, and the measurement is biased against our own
  claim (pauses counted at the cap).

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
- **Observation Replay** works on any letter a merchant banker pastes, but the letter shipped behind
  "Load a representative letter" is **fictional**. Exchange observation letters are not public
  documents; the wording follows the patterns that recur across the 17-DRHP corpus and the exchanges'
  published SME checklists, and the issuer is invented. Say so if asked. The number that would
  actually mean something comes from a real letter, and the tool is built to accept one.
- The **preparation-time meter** measures active promoter effort inside Drafter — from the first
  answer, with pauses over 120s counted at the cap so the figure overstates rather than flatters. It
  is not a measurement of the full offer-document preparation cycle, most of which is the auditor's
  restatement, counsel's litigation review and the banker's due diligence.
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
