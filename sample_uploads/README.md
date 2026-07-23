# Sample financial uploads

Drop either file into **Guided Intake → Step 3 → Upload audited financials** to
see Drafter read the figures out of a real spreadsheet and feed them into the
gap check.

| File | Issuer |
|------|--------|
| `Shreeji_Restated_Financials.csv` | Shreeji Auto Components Limited |
| `Aarna_Restated_Financials.csv` | Aarna Specialty Chemicals Limited |

The extractor reads the **last numeric column** of each labelled row, because
restated tables are laid out oldest-to-newest left to right.

Uploading these populates the **audited** side of the record only
(`financials.*`). It deliberately does **not** overwrite
`business.revenue_stated` — that field holds what the promoter asserted in the
business chapter, and requirement **R2.4** exists to reconcile the two. For
Shreeji the promoter asserted INR 82.50 crore while the audited statements show
INR 78.90 crore, so uploading the real financials makes the planted
inconsistency *more* visible, not less.

Both files are fictional.
