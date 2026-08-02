# Drafter · Competitive Positioning & Pitch Notes

## The one-line wedge
Everyone else **analyses** an already-written DRHP. **Drafter generates** the first draft for the
SME issuer. Opposite ends of the pipeline, and the generation end is open.

## Landscape (as of mid-2026)
| Player | What it does | Side of the pipeline |
|--------|--------------|----------------------|
| **BSE GenAI DRHP pre-check** | Merchant banker uploads a draft DRHP; AI cross-checks vs SEBI/exchange rules; gap report in <40 min (was 7 days) | **Review / exchange gatekeeper** |
| **OnFinance AI (ComplianceOS + NeoGPT)** | BFSI regulatory-compliance automation (circulars, evidence, reporting); fine-tuned LLaMA 3.3 70B | Compliance ops, not DRHP drafting |
| **Invisigent** | DRHP/RHP review in minutes; change-detection across 300-page filings | **Analysis (investor/research)** |
| **IPO Dost / IPO dashboards** | Extract financials, red flags, promoter history from a filed DRHP | **Analysis (investor)** |
| **s45.ai** | DRHP-to-RHP drafting help | Advisory/services |
| **Drafter (us)** | SME promoter answers plain-language questions → substantially complete, disclosure-mapped **draft DRHP** + gap check → handed to the merchant banker | **Generation (issuer)**, the gap |

## Turn BSE's tool into our tailwind
BSE now auto-checks drafts, but **nobody helps the SME create a clean draft in the first place.**
Drafter sits **upstream** of BSE's checker and produces a first draft **pre-aligned to the exact
exchange-return patterns** BSE flags (missing auditor reference, unreconciled figures, undisclosed
related parties). So our draft clears pre-check instead of bouncing. Our Gap & Consistency report is
deliberately modelled on the BSE pre-check report format.

## Three differentiators to repeat in every pitch
1. **Issuer-facing & plain-language**, built for a promoter with no capital-markets expertise.
2. **Checklist-before-generation**, the disclosure requirement registry is the skeleton; generation
   fills it; every line is source-linked; no hallucinated facts. This is what a regulator can trust.
3. **Intermediary-preserving**, output is an explicit preparatory draft; the merchant banker still
   reviews, does due diligence, and certifies before any filing. Adoptable by the ecosystem, not
   adversarial to it.

## Map to the TechSprint evaluation criteria
- **Market Impact**, attacks the largest cost/time barrier to SME listings; widens the issuer pipeline.
- **Technology Stack**, LLM + RAG + document intelligence, but the differentiator is regulatory-grade
  traceability, not raw generation.
- **Feasibility**: all inputs (ICDR, exchange checklists, filed DRHPs) are public; no closed data.
- **Scalability**, one knowledge base serves every issuer; near-zero marginal cost; extends to rights
  issues, mainboard migration, ongoing disclosures.
- **SEBI Mandate**, market development (more SMEs listed) + investor protection (higher first-draft
  disclosure quality) + supervision (a structured, machine-readable disclosure trail).
