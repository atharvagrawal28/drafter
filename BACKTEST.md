# Backtest — Drafter against real filed SME DRHPs

Seven studies. A **corpus study** across 17 filed DRHPs and a **single-document deep dive** that
measure the draft against real filings; a **cold-start test** and an **intake reachability audit**
that measure the product against a promoter who has not been coached; a **citation audit** against
the ICDR text itself; and the **eligibility gate** and **action plan** that came out of asking what
the report was still failing to tell a first-time issuer.

Everything below is reproducible:

```bash
npx tsx scripts/corpus-analyse.ts backtest_output/corpus backtest_output
npx tsx scripts/backtest-extract.ts <path-to.pdf> backtest_output/extract
npx tsx scripts/backtest.ts backtest_output/extract backtest_output
```

---

# Part 1 — Corpus study (17 filed DRHPs)

| | |
|---|---|
| Documents | **17** filed SME DRHPs, 2024–2025 — **14 NSE Emerge + 3 BSE SME** |
| Volume | **6,765 pages · 3,186,809 words** |
| Typical filing | median **402 pages / 187,281 words** (range 255–550 pages) |

Issuers span manufacturing, specialty chemicals, software, engineering services, solar, electrodes
and events — deliberately not a single sector.

## What held up

**Structure.** 30 of Drafter's 34 chapters appear in **every** document in the corpus; all 34 appear
in at least 86%. The document tree is not an idealisation.

**Registry.** 72 of 73 scored disclosure requirements are evidenced in ≥70% of filings. Three are
excluded from that score: two are **prohibitions** (R5.11, R5.12), where absence is the compliant
state and a 0% hit rate is the corpus agreeing with the rule, and one (R2.9) is about how prose is
*written*, which a keyword probe cannot measure. No filing in the corpus breaches either
prohibition — which is what a corpus of cleared drafts should show.

**Both platforms.** No chapter differs by more than a third between NSE Emerge and BSE SME, so one
document tree serves both.

## What the corpus changed

The corpus was run as a **gap hunt**, not a confirmation exercise: it probed for content that real
filings contain and asked whether Drafter had anywhere to put it. Thirteen items appeared in
79–100% of filings with **no home in the registry**. All are now in, each carrying a
`corpus_evidence` field recording the share of filings that contain it:

| Added requirement | In corpus | Why it matters |
|---|---:|---|
| R9.4 Key Performance Indicators | 100% | SEBI's post-2022 KPI disclosure regime — a conspicuous omission to a securities-markets reader |
| R9.5 Weighted average cost of acquisition (WACA) | 100% | Also post-2022, and compared against the issue price |
| R9.6 Weighted average EPS / RoNW | 100% | Schedule VI requires the weighted average, not just per-year figures |
| R5.7 Monitoring agency | 100% | ICDR Reg 262 |
| R5.8 Working-capital requirement basis | 100% | Auditor-certified computation behind the working-capital object |
| R5.9 General corporate purposes ceiling | 100% | Reg 230(2) — see Part 5; the 25% figure this originally used was the main-board rule |
| R5.10 Issue-expenses break-up by head | 100% | — |
| R2.7 Intellectual property | 100% | — |
| R2.8 Immovable properties and tenure | 100% | — |
| R11.4 Lead manager's past-issue track record | 100% | — |
| R6.7 Our Subsidiaries (new chapter IV.9) | 86% | A subsidiary is consolidated; a group company is not — conflating them is a real disclosure error |
| R4.5 Capitalisation statement | 79% | — |
| R7.7 Summary of the Offer Document (new chapter I.4) | 57% | The first chapter an exchange reviewer reads |

**Registry: 60 → 73 requirements. Structure: 32 → 34 chapters.** Nothing was added on intuition;
every addition traces to a measured frequency in filed documents.

### A new class of check: regulatory arithmetic

R5.9 introduced a `percentage_cap` check — the ICDR ceiling on general corporate purposes. This is a
different kind of defect from anything Drafter previously caught: not an internal inconsistency, but
a **breach of a regulatory limit that is arithmetically provable from the issuer's own numbers**.

A fourth defect was planted in the Aarna issuer to exercise it (GCP at 26.7% against the 25%
ceiling), carefully weighted so the existing objects-shortfall defect survives unchanged — two
independent defects now sit in the same table, which is realistic.

### A real product defect the corpus exposed

Installed-capacity disclosure appears in only **64%** of filings. That is not 36% of issuers omitting
it — it is 36% of them being **services businesses with no plant**. Drafter was marking a software
SME down for lacking a factory.

Requirements can now declare an **applicability gate**. Where it does not apply, the item is reported
as *Not applicable* and leaves the coverage denominator entirely — it is not an obligation that can
be met or missed. R2.5 (capacity) and R3.2 (raw-material risk) are now sector-conditional.

This matters beyond tidiness: a coverage score that penalises an entire class of issuer for
obligations they do not have would discredit the number the moment a services SME used the product.

---

# Part 2 — Single-document deep dive

## The benchmark document

| | |
|---|---|
| Issuer | **Himalayan Solar Limited** (CIN U40100HR2015PLC056609) |
| Document | Draft Red Herring Prospectus dated **26 September 2025** |
| Platform | NSE Emerge, 100% book-built, fresh issue + offer for sale |
| Size | **365 pages · 186,553 words** |
| Source | [NSE archives](https://nsearchives.nseindia.com/emerge/corporates/content/Registration_27092025052000_DRHP_HimalayanSolar_NSE_26092025.pdf) — public regulatory filing |

This is a genuinely filed document from a real issuer, chosen after the fact and not
cherry-picked. Only **factual particulars** were extracted into `data/backtest_himalayan.json`
(name, CIN, financial figures, objects, auditors). No drafting language from the filing was copied
into Drafter's output — the generated draft is entirely Drafter's own text.

---

## Result 1 — Structural coverage: 32/32 (100%)

Every chapter in Drafter's document tree appears in the real filing.

Five appear under a variant heading, which is the expected result — issuers do not use identical
wording, and counting those as misses would have understated coverage:

| Drafter chapter | Filed as |
|---|---|
| I.2 Presentation of Financial, Industry and Market Data | "Certain Conventions…" |
| III.7 Statement of Special Tax Benefits | "Statement of Possible Tax Benefits" |
| IV.3 Key Regulations and Policies | "Applicable Laws and Regulations" |
| VII.4 Restrictions on Foreign Ownership | "…Foreign Ownership of Indian Securities" |
| VIII.1 Main Provisions of the Articles of Association | "Articles of Association" |

**What this establishes:** `drhp_structure.json` is not an idealised tree invented for a demo. It is
the shape of a document that a merchant banker actually filed and an exchange actually accepted.

## Result 2 — Requirement validity: 59/60 (98%)

Of the 60 disclosure requirements in Drafter's registry, **59 are evidenced in the filed document**.

The single miss — R10.2, "significant factors affecting the results of operations" — is a keyword
artefact, not an omission: the filing carries an MD&A chapter that discusses exactly this under
different phrasing.

**What this establishes:** the registry is not inventing obligations, and it is not padded. A real
SME issuer, advised by a real merchant banker, addressed essentially every item Drafter tracks.
That is the strongest available evidence that the checklist Drafter holds promoters to is the right
one.

## Result 3 — Substance: the honest number

Drafter generated **7,633 words across 32 chapters with 14 tables** from the extracted facts,
against **186,553 words** filed. That is **~4%** of the filed word count, and the reason matters
more than the ratio.

Where the real document's 186,553 words actually sit:

| Part of the filing | Pages | Words | Share | Does Drafter generate it? |
|---|---:|---:|---:|---|
| Business, industry, management, MD&A | 128 | 57,801 | 31.0% | **Yes** — this is Drafter's core |
| Risk factors, intro, capital structure | 63 | 36,323 | 19.5% | **Yes** |
| Terms of issue + issue procedure | 50 | 35,413 | 19.0% | Standard clauses — generated, marked for the banker |
| Restated financial statements (auditor) | 60 | 23,823 | 12.8% | **No, by design** — the auditor's certified annexure |
| Litigation, approvals, regulatory disclosures | 22 | 11,685 | 6.3% | **Yes**, from issuer data |
| Front matter + definitions | 17 | 11,559 | 6.2% | **Yes** |
| Articles of association + declaration | 25 | 9,949 | 5.3% | **No, by design** — verbatim constitutional extract |

**Two structural reasons the gap is not what it looks like:**

1. **~18% of the filed document is content Drafter deliberately refuses to generate.** The restated
   financial statements are the auditor's certified work product, and the Articles of Association
   must be a verbatim extract. Paraphrasing either would be a material misstatement, so Drafter
   emits a structured placeholder naming exactly what the Company Secretary and auditor must supply.

2. **The fact set here was deliberately partial.** Only about a third of Drafter's input fields could
   be extracted from the PDF (customers, capacity, suppliers, board, litigation and net proceeds were
   not machine-extractable in the time available). Drafter therefore emitted **22 explicit
   placeholders** rather than padding — 20 chapters fully drafted, 9 partial, 3 skeleton. Given a
   complete intake, the same engine produces ~9,300 words for the sample issuers.

**So the defensible claim is not "Drafter writes 95% of a DRHP."** It is: *Drafter stands up the
complete structure, generates the narrative and factual chapters that constitute roughly half the
filed document by volume, and precisely names the remainder as work for the auditor, the Company
Secretary and the merchant banker.* That is a substantially complete **draft**, which is exactly
what the SEBI problem statement asks for and exactly what the honest-scope section of the pitch
claims.

## Result 4 — What Drafter would have told this promoter

Running the Gap & Consistency Checker over the real issuer's extracted data:

- **coverage 43%** (issuer-controllable 46%) — correctly low, because the fact set is partial
- **42 findings**, of which **1 high**
- complete 18 · partial 15 · missing 26 · defect 1

The high-severity finding is **DR-CMP-001 — mandatory auditor reference absent**, because the
auditor's ICAI firm registration number was not among the extracted fields. On the real filing the
FRN *is* present, so this is a true positive against the data Drafter was given, and a correct
prompt: it is precisely the "missing auditor reference" pattern the exchange returns drafts for.

The remaining findings are completeness gaps — customer concentration, installed capacity, supplier
concentration, lead manager particulars — each naming the exact field required. That is the report a
promoter would take to their banker, and it is derived, not scripted.

---

## Bugs this backtest found and fixed

Backtesting against real data did what synthetic fixtures could not — both sample issuers have
complete data, so neither exercised these paths.

**1. Phantom-zero reconciliation (fixed).** `Number(null)` is `0`, and `0` is finite. Every numeric
consistency check therefore fired against absent fields, producing:

> "Objects of the Issue lists 3 utilisations aggregating INR 40.17 crore, against Net proceeds of
> the issue of **INR 0.00 crore**."

That is nonsense: the issuer had not yet stated net proceeds, because at DRHP stage the price band
is `[●]`. A checker that fabricates a zero and then reports a discrepancy against it would destroy
its own credibility on the first real document it ever saw. All five numeric checks now distinguish
*absent* from *zero* via a `num()` helper, and stay silent when a field is not yet supplied. Defect
count on this issuer fell from 2 to 1, and the surviving finding is genuine.

**2. Digit-grouping in figure validation (fixed).** The anti-hallucination validator scanned issuer
text with `/\d+(\.\d+)?/`, reading "4,800 metric tonnes" as *two* numbers (4 and 800). The model
then correctly wrote "4,800" and was wrongly rejected for inventing a figure — burning revision
cycles and, on the free tier, tripping the rate limit. Grouping commas are now stripped before
scanning.

Both fixes are permanently guarded by `npm run verify` and `npm run verify:llm`.

---

# Part 3 — Cold-start test (an untuned synthetic issuer)

Parts 1 and 2 measure Drafter against filings that are already written in prospectus register. That
flatters it. Part 3 asks the harder question: **what comes out when a first-time promoter fills the
intake the way a first-time promoter actually would?**

```bash
npm run coldtest           # deterministic templates
npm run coldtest -- --llm  # language-model drafting
```

`data/coldtest_facility.json` is a services issuer — Sundaram Facility Services Limited, facility
management, no manufacturing — written deliberately badly: casual first person ("We do housekeeping
for offices"), several fields blank, the customer list typed as a run-on sentence, litigation
described as "Nothing much", and one realistic data-entry slip (₹4,560 lakh keyed into a field
labelled crore). **No defects are planted.** Anything the checker reports is therefore either a
genuine catch or a false positive, and both are informative.

## What held up

| | |
|---|---|
| Sector gate | Correct. R2.5 (installed capacity) and R3.2 (raw-material risk) both marked **Not applicable** for a services business, and excluded from the coverage denominator |
| Coverage | 59% — an honest number for an issuer this incomplete, not a flattering one |
| False positives | **None.** Every missing-information finding named the exact field required |
| Unit slip | Caught, and named: *"Figures differ by exactly 100 times — this looks like a lakh entered where crore was expected"* |

## What it found, and what changed

**1. Unit errors were reported uselessly.** The checker's first output on the lakh/crore slip was
"9,900% apart" — arithmetically true and of no use to a promoter. `detectUnitScale` now tests for an
exact power-of-ten relationship (within 1%) and names the likely cause. Lakh/crore confusion is
probably the single most common data-entry error in Indian filings.

**2. A services company was told it had raw-material risk.** The registry correctly gated R3.2 off,
but the *risk-factor template* still emitted "dependent on the price of its principal raw materials".
The gate and the template disagreed. The template is now gated on the same flag, with a manpower-cost
risk factor for the services case.

**3. Casual promoter prose reached the document verbatim.** The draft opened *"We do housekeeping,
security and facility upkeep…"*. That is not a prospectus.

The first attempt at a remedy was to tell the issuer to enable language-model drafting. Running
`npm run coldtest -- --llm` showed that claim was **half true**: the model does lift casual input into
proper register without touching a figure —

> *"The Company is engaged in the provision of facility management services… The Company earns revenue
> through the signing of yearly or two-year contracts with clients, with monthly billing based on the
> number of people deployed, plus a service margin."*

— but the *factual* chapters splice issuer answers in directly, by design, and never call the model at
all. First-person prose survived into eight places in the LLM run, and would survive in every run with
no API key. So the fix had to be deterministic.

`lib/engine/register.ts` performs a bounded set of substitutions that change only person and register:
`we do` → `the Company does`, `our` → `its`, `about 19 percent` → `approximately 19%`. Its safety
property — **no digit is ever added, removed or altered** — is asserted by `preservesFigures()` and
exercised in `npm run verify` over every free-text field of every sample issuer (254 fields, zero
drift), plus ten worked cases and an idempotence check.

**4. Two risk-factor templates fused free text mid-sentence.** With the prose now readable, a worse
defect became visible underneath: `Its five largest customers are {business.top_customers}` produced
*"Its five largest customers are The Company's biggest is a Chennai IT park operator…"*. Both clauses
now introduce the issuer's own words with a colon instead of splicing them into a sentence that
already has a subject.

## The line Drafter will not cross

After all four fixes, five casual phrases remain in the draft: "nothing much", "a few big", "they pay
on time". These are **not** left in by oversight. Reading "Nothing much" as "there are no outstanding
proceedings against the Company" is an inference about a legal fact, not a rewording — and Drafter does
not make those inferences.

So `register_check` now splits its markers by who can fix them, and reports accordingly:

- markers the normaliser handled → **low**, *"Issuer answers were normalised into offer-document
  register"*, with the banker asked to read the affected chapters against the originals;
- vague statements only the issuer can resolve → **medium**, *"Narrative answers contain vague
  statements that cannot be drafted around"*, asking for the specific position — a count, an amount, a
  date, or an express nil statement.

That split is the honest version of a claim the tool was previously overstating.

## Limitations of Part 3

- **One synthetic issuer.** It is written to be realistically bad, but it is one document, and it was
  written by the same hand that fixed what it found.
- **The normaliser is a normaliser, not a rewriter.** A verb conjoined to an inflected one is left
  alone — "the Company signs contracts and bill monthly". Inflecting it would require knowing the word
  is a verb; guessing wrong turns "and security" into "and securities". A grammar slip is recoverable;
  a changed word is not.
- **Groq's free tier caps at 100,000 tokens per day.** A day of corpus and verification runs exhausts
  it, after which every narrative chapter falls back to templates. The fallback is correct and is
  classified as `rateLimited` rather than as a quality failure — but it is the reason the deterministic
  path had to be the floor rather than the fallback.

---

# Part 4 — Intake reachability

A gap the first three parts could not have found, because all three feed Drafter issuer data
directly rather than through the product.

The registry scores **79 evidence fields**. The wizard collected **61**, and the financials extractor
wrote only latest-year scalars. **26 fields had no input control at all** — a promoter could not
supply them except by editing JSON, so the requirements that depend on them were unfillable no matter
how diligent the issuer was. That is not a scoring artefact; it silently caps coverage and makes the
"substantially complete draft" claim untrue.

| Cluster | Fields | Requirements blocked |
|---|---|---|
| Three-year financial series | `revenue_3yr`, `pat_3yr`, `networth_3yr`, `eps_3yr`, `ronw_3yr`, `cash_flow_ops_3yr`, `years` | R4.1, R4.4, R4.5, R9.6, R10.1 |
| Capital structure | `share_capital_history`, `shareholding_pattern` | R5.1 |
| Promoter confirmations | `waca`, `promoter_contribution_pct`, `lock_in_confirmation`, `promoter_disqualification_confirmation`, `promoter_names` | R9.5, R12.1, R12.2, R12.3 |
| Issue mechanics | `monitoring_agency`, `working_capital_basis`, `issue_expenses_breakup`, `market_maker_reservation_shares` | R5.6–R5.10, R8.2 |
| Narrative disclosures | `intellectual_property`, `immovable_properties`, `kpis`, `peer_comparison`, `remuneration`, `subsidiaries`, `lead_manager_track_record`, `special_tax_benefits_certificate` | R2.7, R2.8, R6.6, R6.7, R9.3, R9.4, R11.4, R13.2 |

**All 26 are now reachable, and `npm run verify` asserts it** — the registry and the questionnaire
cannot drift apart again without failing the build gate.

## What changed

**The extractor reads the series, not just the last cell.** An offer document is a three-year
document, and none of the restated-statement, capitalisation or weighted-average disclosures can be
discharged from a single latest-year figure. It now detects the column headers (`FY24 FY25 FY26`,
`2023-24`, `31 March 2024`) and captures ten series. Two safety rules, both verified:

- a series is withheld unless it lines up with the detected headers — an unlabelled series cannot be
  printed in a restated statement, so it is not guessed at;
- a row discharges **one** line item, the most specific match. Writing the test first caught a real
  collision: `Return on net worth (%)` contains `net worth`, and was populating the RoNW series and
  then being read a second time as the net-worth series — putting a percentage into a rupee field.

`npm run verify:extract` runs this against a realistic restated-financials sheet and a headerless
variant of the same sheet.

**Three new input types.** A metrics × years grid for the series; a generic repeating-row editor for
share capital history, shareholding pattern and issue expenses, with a live total that visibly
reconciles against the figure the checker compares it to; and a three-state confirmation.

The third state is the point of that last one. `lock_in_confirmation` and
`promoter_disqualification_confirmation` are eligibility conditions for the issue itself. A checkbox
would make "not yet settled with the merchant banker" indistinguishable from "no", so the control
offers *Yes, confirmed* / *No* / *Not yet confirmed*, and an unanswered confirmation reports as an
outstanding disclosure rather than a denial.

---

# Part 5 — Citation audit against the ICDR text

Parts 1–4 measure Drafter against filings and against itself. None of them can catch the failure mode
that matters most: **the registry citing the wrong rule.** Frequency across 14 filings proves an item
belongs in an offer document; it says nothing about which regulation mandates it, or whether that
regulation still says what the registry claims.

So the registry was checked against the primary source — the consolidated
[SEBI (ICDR) Regulations, 2018, last amended 8 March 2025](https://www.sebi.gov.in/legal/regulations/mar-2025/securities-and-exchange-board-of-india-issue-of-capital-and-disclosure-requirements-regulations-2018-last-amended-on-march-8-2025-_93559.html),
Chapter IX (Regulations 227–280), not a summary of it.

## Confirmed correct

| Requirement | Cited | Actual heading in the ICDR text |
|---|---|---|
| R5.6 | Reg 261 | market making through SME exchange stock brokers ✓ |
| R8.2 | Reg 253 | Allocation in the net offer ✓ |
| R8.5 | Reg 260, 261 | Underwriting; market making ✓ |
| R12.2 | Reg 236, 238 | Minimum promoters' contribution (at least 20% of post-issue capital); Lock-in ✓ |

## Three defects, all now fixed

**1. The general corporate purposes ceiling was the wrong rule, and out of date.**

The registry cited **Reg 7(2) — 25%**. That is the *main board* provision. Chapter IX has its own,
and it was tightened by the March 2025 amendment:

> Reg 230(2): the amount for general corporate purposes … shall not exceed **fifteen** per cent. of
> the amount being raised by the issuer **or ₹10 crores, whichever is less**.

A ceiling nearly twice as generous as the real one is the worst possible error in a compliance
checker: it stays silent on a draft that will be returned. The check now evaluates **both limbs** and
reports which one binds — the absolute limb starts binding above a gross issue of about ₹67 crore, so
a percentage-only test would clear an oversized allocation on a larger SME issue.

This reclassified one of the sample issuers. Under the old 25% reading, Shreeji Auto Components was
compliant at 16.7%; under Reg 230(2) it was not. Its objects were rebalanced so it remains a
two-defect fixture, and the deliberate breach in the other issuer now reads against the correct
ceiling.

**2. Drafter was demanding a monitoring agency from every issuer.**

> Reg 262(1): **if the issue size, excluding the size of offer for sale by selling shareholders,
> exceeds ₹50 crores**, the issuer shall make arrangements for the use of proceeds to be monitored…

Both sample issuers (₹24 crore, ₹22.5 crore) and the cold-start issuer (₹12.6 crore) are far below
that. Drafter was reporting a missing monitoring agency for all three — a false positive against the
regulation itself, and exactly the kind of finding that teaches a first-time issuer to distrust the
tool. The applicability gate now supports a **numeric threshold** as well as a boolean, and R5.7 is
excused below ₹50 crore. An absent or unparseable issue size leaves the requirement in force: the
gate excuses an issuer only on a figure it can actually see.

**3. R12.3 cited the main-board eligibility bar.** The registry cited Reg 5; for a Chapter IX issuer
the provision is **Reg 228**, and its wording is now "wilful defaulter **or a fraudulent borrower**".
Both corrected.

## Two conditions Drafter was not checking at all

The March 2025 amendment inserted new clauses into Reg 230(1) that no amount of corpus study would
have surfaced, because the corpus predates them:

- **R5.11 — Reg 230(1)(h)**: the objects must not include repayment, directly or indirectly, of a
  loan from a promoter, the promoter group or a related party. This is reported as a **Red Flag**,
  not a disclosure gap, because it is a condition of *eligibility* — no redrafting fixes it. The
  check requires a repayment term **and** a connected-party term in the *same* object, so "repayment
  of borrowings availed from Indian Bank" and "purchase of plant and machinery" are not flagged;
  both negative cases are asserted.
- **R5.12 — Reg 230(1)(f) and (g)**: an offer for sale component may not exceed 20% of the total
  issue size, and no selling shareholder may offer more than half of their pre-issue holding. Gated
  off entirely for a fresh-issue-only issuer.

Registry is now **R4: 76 requirements, 11 check types**, and `npm run verify` asserts each threshold
against worked figures — ₹24 crore vs ₹64 crore for the monitoring agency, 14.6% vs 15.4% and the
₹10 crore limb for the GCP ceiling, 18.8% vs 25% for the offer for sale.

## What this audit does NOT establish

Only the citations that **name a regulation number** were verifiable this way, and there are twelve
of them. The remaining sixty-odd cite a Schedule VI heading — "ICDR Sch VI (SME) — Our Business" —
which describes *where in the offer document* a disclosure sits, not which provision compels it.
Those are corpus-derived and remain unverified against the Schedule text. They are unlikely to be
*wrong* in the sense the GCP ceiling was wrong, since they were drawn from filings that cleared the
exchange, but they are descriptions rather than authorities and should not be presented as citations.

---

# Part 6 — The eligibility gate

Parts 1 to 5 all ask the same underlying question: is this draft any good? Part 6 exists because
there is a prior question nobody's tool was answering.

**A promoter's first question is not "is my draft complete?" — it is "can I even do this?"** Drafter
would previously generate a full 34-chapter offer document for an issuer that Chapter IX disqualifies
outright. Three months and several lakh rupees later, a merchant banker would be the one to say so.

## What it tests

Read from the consolidated ICDR text, not from a summary of it:

| Condition | Provision | Decidable from |
|---|---|---|
| Post-issue paid-up capital ≤ INR 25 crore | Reg 229(1), 229(2) | pre-issue shares × face value, plus the fresh issue |
| Operating profit ≥ INR 1 crore in 2 of the last 3 years | **Reg 229(6)**, inserted 8 Mar 2025 | the EBITDA series |
| One full financial year since conversion from a firm | Reg 229(4) | a dated confirmation |
| One year since a change of promoter or a >50% acquisition | Reg 229(5) | a dated confirmation |
| Not debarred; no wilful defaulter, fraudulent borrower or fugitive economic offender | Reg 228 | promoter and director declarations |
| Exchange application, depository agreement, no partly paid shares, promoter shares in demat, firm financing for 75% of the non-issue project cost | Reg 230(1)(a)–(e) | five confirmations |

**Regulation 229(6) is the one that will surprise people.** It did not exist before 8 March 2025, and
it is measured on operating profit — EBITDA — rather than on profit after tax. A promoter looking at
three profitable years can still fail it. The finding says so explicitly, because that specific
confusion is what will cause the failure to be discovered late.

## Three states, never two

Every condition returns `met`, `not-met` or **`unknown`**, and the third one carries the design.

Collapsing it would be dishonest in whichever direction it collapsed. Treating silence as failure
tells an eligible issuer to give up. Treating silence as success lets a disqualified one spend months
drafting. So an unknown is reported as a question with the exact information needed to resolve it,
and the overall verdict is **never** "eligible" while any mandatory condition is unanswered.

The verification run asserts this contract directly: an empty issuer is *indeterminate*, not
ineligible; nothing is ever reported as failed on no evidence; every unknown names its own remedy;
and a single hard failure outranks any number of unknowns. Each numeric threshold is checked on both
sides of the line — INR 9.90 crore against INR 25.10 crore, EBITDA of exactly INR 1.00 crore against
INR 0.99 crore, two qualifying years against one.

## What it is not

It is a pre-screen, not a clearance. The SME exchange applies its own track-record and net-worth
criteria under Regulation 229(3), which are not tested. Eligibility is confirmed by the merchant
banker in due diligence. The value is one of timing: a disqualifying condition found in week one
instead of month three.

---

# Part 7 — From report to plan

A coverage score of 59% tells a promoter that something is wrong and nothing about what to do. The
twenty outstanding requirements are not equal: some are one field from complete, some need the
auditor, and some sit behind a single wizard step that would close ten requirements in one sitting.

So the report now ranks the remaining work by **coverage gained per question asked** — cheapest real
progress first, rather than the largest pile of work — groups it by the intake step where the answers
actually live, and states the arithmetic. On the cold-start issuer:

```
coverage 59%  ->  projected 90%
  +1.4pp -> 60%   Step 8 · Indebtedness & Dividend            (1 question,  closes 1)
  +8.3pp -> 69%   Step 5 · The Issue & Capital Structure      (7 questions, closes 10)
  +8.3pp -> 77%   Step 6 · Management & Governance            (7 questions, closes 7)
  ...
  [banker]        Reserved to the merchant banker or auditor  (6 items)
```

Two things make this trustworthy rather than decorative.

**The projection is computed with the same weighted formula that produces the score** — Complete 1,
Partial 0.5, over applicable requirements — with the affected items set to Complete. It is not an
estimate. `npm run verify` asserts that working down the list arrives at *exactly* the projected
figure, that cumulative coverage only increases, and that no step appears twice.

**It never puts the banker's work on the promoter's list.** Items whose fulfilment is
`banker_certification` are shown separately and excluded from the projection, because no amount of
work by the promoter closes them. They are still surfaced — they are on the critical path and are
commonly the last thing to arrive — but as *chase this*, not *answer this*.

Both were harder to get right than they look. Rounding coverage before differencing made every step
worth under a percentage point read as "+0pp", telling the promoter their work was pointless; gains
are now computed on exact percentages and rounded once, for display. And crediting a requirement only
to the step that could close it alone left requirements whose evidence spans two steps credited to
neither, so the final cumulative fell short of the projection it was supposed to meet.

---

## Honest limitations of this backtest

- **17 documents, not a random sample.** Both SME platforms are now represented (14 NSE Emerge,
  3 BSE SME), and section 5 of `npm run corpus` reports that no chapter differs by more than a third
  between them — one document tree serves both. But the sample is still what was publicly reachable,
  not a random draw, and three BSE filings is a thin basis for a claim about BSE house style.
- **Keyword probes, not semantics.** Both the structural map and the requirement-evidence check use
  keyword matching over extracted text. Treat "71/73 evidenced" as "essentially all", not as a
  precise measurement. Two items remain weakly matched: R7.7 (57%, genuinely absent as a titled
  chapter in older filings) and R2.5 (64%, which is the sector-conditionality finding above, not a
  miss).
- **Frequency is not authority.** That an item appears in 100% of filings is strong evidence it
  belongs in the registry; it is not a substitute for citing the ICDR provision that mandates it.
  The `source` field on each requirement still needs verification against the live regulation by a
  domain reader — that remains the highest-value review task on the project.
- **Partial extraction.** The comparison in Result 3 is against a deliberately incomplete fact set.
  It measures how Drafter behaves with partial data — which is the realistic case — not its ceiling.
- **No output-quality judgement.** This backtest measures coverage and structure. It does **not**
  claim Drafter's prose matches the quality of merchant-banker-drafted text, and nothing here should
  be read as saying the generated draft is filing-grade. It is not; it is a preparatory draft.

## Artefacts

`backtest_output/` contains the generated draft for this real issuer, so it can be opened next to
the actual filing:

- `Drafter_Himalayan_Solar_Draft.docx`
- `Drafter_Himalayan_Solar_Draft.pdf`
- `backtest-result.json` — the full machine-readable result
