# Drafter · Team Guide

For the team running the prototype and recording the demo before **9 August 2026**.
You do not need to write code. This covers running it, checking it still works, and what to say.

---

## 1. Run it (≈3 minutes)

Install **Node.js 20+** from <https://nodejs.org> (take the LTS installer), then open a terminal in
this folder:

```bash
npm install && npm run dev
```

A server starts at <http://localhost:3000>. That is the prototype.

**It works with no API key.** Narrative chapters come from built-in templates. That is deliberate, 
a live demo cannot fail because of a rate limit or a dead network.

*Optional, for richer narrative prose:* get a free key at <https://console.groq.com/keys>, create a
file called `.env.local` in this folder containing:

```
GROQ_API_KEY=gsk_...your key...
```

Restart `npm run dev`. The header will show which mode you are in.

---

## 2. Check it still works (30 seconds)

After **any** change, run:

```bash
npm run verify
```

This is the safety net. It generates both sample issuers, runs the gap checker and both exporters
headlessly, and asserts:

- all **32 chapters** generate, every priority chapter is drafted;
- **all five planted defects** are caught, with exact locations;
- **no false positives**, exactly the expected number of high-severity findings;
- the two issuers fail on **entirely different** requirements (proving nothing is hardcoded);
- the DOCX and PDF exports still render.

If it prints `All engine checks passed.` you are safe to record. If anything says `FAIL`, paste the
output into Claude Code and ask it to fix that specific check.

---

## 3. The demo flow

The full 5-minute script, with what to say and which TechSprint criterion each beat scores, is in
**`README.md` → "5-minute demo script"**. Rehearse from there.

Short version, six screens in order:

1. **Overview**: the problem, and the one-line wedge.
2. **Guided Intake**, plain language; drop `sample_uploads/Shreeji_Restated_Financials.csv` on the
   upload box in Step 3.
3. **Draft DRHP**: cover page, sticky TOC, real capital-structure tables, requirement chips, and the
   **Show disclosure trail** toggle.
4. **Gap & Consistency**, *the money shot.* Both planted defects, with locations and the
   exchange-return pattern.
5. **Switch issuer** (header selector) → **Aarna Specialty Chemicals**, three different defects,
   same engine.
6. **Merchant Banker** + hit **DOCX** and **PDF**. Close on **Impact**.

**Recording tips**
- Use a **1280×800** window. The sticky TOC needs ≥1024px width to show.
- Click **Generate draft** once before recording so the draft is already there, then regenerate on
  camera if you want to show the progress state.
- The issuer selector resets the session, switch issuers *before* you start narrating that segment.

---

## 4. Answering "is this real, or a demo?"

Be direct. The honesty is the strongest part of the pitch.

- **The registry is the skeleton; generation fills it.** 60 disclosure requirements, each mapped to
  chapters and to the evidence fields that discharge it. Coverage is *computed* from what the issuer
  actually supplied, show them the number move as you fill the wizard.
- **Factual chapters cannot hallucinate.** They are built in code from issuer data. If a number is
  not supplied, a placeholder appears saying what is needed. It is never invented.
- **The language model is fenced in.** It only sees the fields declared for that chapter, and if it
  emits a figure that is not in the issuer data, that chapter is thrown away and the deterministic
  template is used instead.
- **The banker is preserved as certifier.** Output is explicitly a preparatory draft. The
  accountability chain SEBI requires is unchanged.
- **Scope honestly.** A filed DRHP is 200–350 pages and needs due diligence and certification. Our
  claim is a substantially complete, correctly structured, disclosure-mapped *draft*, pre-aligned to
  the exchange's own pre-check. The full limitations list is at the end of `README.md`, read it
  before the Q&A so nothing surprises you.

---

## 5. Deploying

```bash
npx vercel deploy
```

Follow the prompts (link to your Vercel account, accept the defaults). You get a URL. Use
`npx vercel deploy --prod` for the production URL you put in the submission.

If you want live narrative drafting on the deployed site, add `GROQ_API_KEY` in the Vercel dashboard
under *Project → Settings → Environment Variables*, then redeploy.

> **Gotcha:** never run `npm run build` while `npm run dev` is running. They share the `.next`
> folder and the dev server will start returning errors. Stop the dev server first. To recover,
> delete the `.next` folder and run `npm run dev` again.

---

## 6. If something breaks

Paste this into Claude Code:

```
I'm preparing the Drafter prototype for a demo. Something isn't working. Here's the error:
<paste the whole error>. Read README.md, fix it with the smallest possible change, then run
`npm run verify` and confirm all five planted defects are still caught.
```

---

## 7. Where things live

| You want to change | Edit |
|--------------------|------|
| The disclosure requirements | `data/requirement_registry.json` |
| The document's chapters/structure | `data/drhp_structure.json` |
| The wizard questions | `data/intake_questionnaire.json` |
| The sample issuers | `data/sample_company_*.json` |
| Drafting instructions / standard clauses | `knowledge_base/section_templates.json` |

The first four are plain JSON and are the **domain lead's** territory, sanity-checking the registry
against the real ICDR SME schedule is the highest-value non-coding work anyone on the team can do,
and it is the NISM edge the judges will probe.
