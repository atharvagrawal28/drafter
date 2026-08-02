/**
 * Engine verification harness.
 *
 * Runs the generator and the gap checker headlessly against both sample issuers
 * and asserts that every planted defect is still caught. Run it after any change
 * to the engine or the domain data:
 *
 *     npm run verify
 *
 * This exists because the demo depends on those defects appearing on stage. A
 * silent regression in the checker would not be visible until the recording.
 */

import { flatChapters, sampleIssuers } from "../lib/data";
import { runGapCheck } from "../lib/engine/gapCheck";
import { generateDocument } from "../lib/engine/generate";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

let failures = 0;

function assert(condition: boolean, message: string, detail?: string) {
  if (condition) {
    console.log(`  ${GREEN}PASS${RESET}  ${message}`);
  } else {
    failures += 1;
    console.log(`  ${RED}FAIL${RESET}  ${message}`);
    if (detail) console.log(`        ${DIM}${detail}${RESET}`);
  }
}

async function main() {
  console.log(`\n${BOLD}Drafter — engine verification${RESET}\n`);

  for (const issuer of sampleIssuers) {
    console.log(`${BOLD}${issuer.name}${RESET} ${DIM}(${issuer.sector})${RESET}`);

    // ---- Generation -------------------------------------------------
    const doc = await generateDocument(issuer.data, {
      issuerId: issuer.id,
      useLlm: false,
    });

    assert(doc.chapters.length === 34, `document has all 34 chapters (got ${doc.chapters.length})`);
    assert(doc.sections.length === 9, `document has all 9 sections (got ${doc.sections.length})`);
    assert(doc.stats.totalWords > 2500, `substantive draft generated (${doc.stats.totalWords} words)`);
    assert(doc.stats.totalTables >= 8, `factual tables rendered (${doc.stats.totalTables} tables)`);
    assert(doc.generationMode === "template", "template fallback engaged with no LLM key");

    const priorityChapters = doc.chapters.filter((c) => c.priority);
    const skeletonPriority = priorityChapters.filter((c) => c.status === "skeleton");
    assert(
      skeletonPriority.length === 0,
      `every priority chapter is drafted (${priorityChapters.length} priority chapters)`,
      skeletonPriority.map((c) => `${c.id} ${c.title}`).join(", "),
    );

    const unmapped = doc.chapters.filter((c) => c.requirementIds.length === 0);
    assert(
      unmapped.length === 0,
      "every chapter carries mapped requirement IDs",
      unmapped.map((c) => c.id).join(", "),
    );

    // No factual chapter may contain language-model prose.
    const contaminated = doc.chapters.filter(
      (c) => c.mode === "factual" && c.origins.includes("llm-narrative"),
    );
    assert(
      contaminated.length === 0,
      "no factual chapter contains language-model prose",
      contaminated.map((c) => c.id).join(", "),
    );

    // ---- Gap check --------------------------------------------------
    const report = runGapCheck(issuer.data, {
      issuerId: issuer.id,
      issuerName: issuer.name,
      meta: issuer.meta,
    });

    console.log(
      `  ${DIM}coverage ${report.coveragePct}% (issuer-controllable ${report.issuerCoveragePct}%) · ` +
        `${report.findings.length} findings · ${report.findingCounts.high} high${RESET}`,
    );

    assert(
      report.coveragePct > 0 && report.coveragePct <= 100,
      `coverage score is a computed percentage (${report.coveragePct}%)`,
    );

    // The heart of it: every planted defect must be caught, by the requirement
    // the sample data says should catch it.
    for (const defect of issuer.meta.planted_defects) {
      const expectedIds = (defect.should_be_caught_by ?? "")
        .split(/[^\w.]+/)
        .filter((token) => /^R\d/.test(token));

      const matched = report.findings.find(
        (finding) =>
          expectedIds.includes(finding.requirementId) &&
          finding.severity === "high" &&
          (finding.category === "Inconsistency" ||
            finding.category === "Red Flag" ||
            finding.category === "Compliance Issue"),
      );

      assert(
        Boolean(matched),
        `${defect.id} (${defect.type}) caught — expected via ${expectedIds.join(" / ")}`,
        matched ? undefined : `no finding raised. ${defect.where}`,
      );

      if (matched) {
        const locations = matched.locations.map((l) => `${l.chapterId} ${l.chapterTitle}`).join("; ");
        console.log(`        ${DIM}${matched.code} [${matched.severity}] ${matched.title}${RESET}`);
        console.log(`        ${DIM}location: ${locations}${RESET}`);
        assert(matched.locations.length > 0, `  ${defect.id} reports an exact location`);
        assert(
          Boolean(matched.exchangePattern),
          `  ${defect.id} carries the exchange-return pattern framing`,
        );
      }
    }

    // Guard against a checker that fires on everything: the clean axes must
    // stay clean, otherwise "it caught the defect" means nothing.
    const highCodes = report.findings.filter((f) => f.severity === "high");
    assert(
      highCodes.length === issuer.meta.planted_defects.length,
      `exactly ${issuer.meta.planted_defects.length} high-severity findings — no false positives ` +
        `(got ${highCodes.length})`,
      highCodes.map((f) => `${f.code} ${f.requirementId} ${f.title}`).join(" | "),
    );

    console.log("");
  }

  // ---- Exports -------------------------------------------------------
  // The PDF renderer fails in a position-dependent way when the document grows,
  // so it is verified here rather than discovered during a screen recording.
  console.log(`${BOLD}Exports${RESET}`);
  for (const issuer of sampleIssuers) {
    const doc = await generateDocument(issuer.data, { issuerId: issuer.id, useLlm: false });
    const report = runGapCheck(issuer.data, {
      issuerId: issuer.id,
      issuerName: issuer.name,
      meta: issuer.meta,
    });

    try {
      const React = (await import("react")).default;
      const { renderToBuffer } = await import("@react-pdf/renderer");
      const { DrhpPdf, GapPdf } = await import("../lib/export/pdf");

      const drhpPdf = await renderToBuffer(React.createElement(DrhpPdf, { document: doc }) as any);
      assert(drhpPdf.length > 50_000, `${issuer.id}: full DRHP renders to PDF (${drhpPdf.length} bytes)`);

      // The eligibility section is rendered too. react-pdf fails on layout, not
      // on types, and a new block of Views is exactly what has broken this
      // exporter before — so the export path that ships must be the one tested.
      const { runEligibility } = await import("../lib/engine/eligibility");
      const eligibility = runEligibility(issuer.data, issuer.name);
      const gapPdf = await renderToBuffer(
        React.createElement(GapPdf, { gapReport: report, eligibility }) as any,
      );
      assert(gapPdf.length > 10_000, `${issuer.id}: gap report renders to PDF with the eligibility gate (${gapPdf.length} bytes)`);
    } catch (error) {
      assert(false, `${issuer.id}: PDF export`, (error as Error).message);
    }

    try {
      const docx = await import("docx");
      const { buildDocx, buildGapDocx } = await import("../lib/export/docx");
      const drhpDocx = await buildDocx(docx, doc, report);
      assert(drhpDocx.length > 20_000, `${issuer.id}: full DRHP renders to DOCX (${drhpDocx.length} bytes)`);
      const { runEligibility: runElig } = await import("../lib/engine/eligibility");
      const gapDocx = await buildGapDocx(docx, report, undefined, runElig(issuer.data, issuer.name));
      assert(gapDocx.length > 10_000, `${issuer.id}: gap report renders to DOCX with the eligibility gate (${gapDocx.length} bytes)`);
    } catch (error) {
      assert(false, `${issuer.id}: DOCX export`, (error as Error).message);
    }
  }
  console.log("");

  // ---- A brand-new issuer must behave, not just not crash --------------
  // Every real user starts here: a blank form. It is the state most likely to
  // be reached in a demo and the least likely to be tested, and getting it
  // wrong is loud — a coverage score that flatters, or a page of red findings
  // before a single question is answered.
  console.log(`${BOLD}Blank issuer${RESET}`);
  {
    const { buildBlankIssuerData } = await import("../lib/data");
    const { runEligibility } = await import("../lib/engine/eligibility");
    const { buildActionPlan } = await import("../lib/engine/actionPlan");

    const blank = buildBlankIssuerData();
    const report = runGapCheck(blank, { issuerId: "blank" });

    // The single most important property. On an empty form everything is
    // missing; reporting any of it as a high-severity DEFECT would be crying
    // wolf, and would teach a first-time promoter to ignore the report.
    assert(
      report.findingCounts.high === 0,
      "no high-severity findings before a single question is answered",
      report.findings.filter((f) => f.severity === "high").map((f) => `${f.code} ${f.requirementId}`).join(", "),
    );
    assert(report.counts.defect === 0, `no requirement reads Defect (${report.counts.defect})`);
    assert(
      report.coveragePct < 25,
      `coverage is honestly low, not flattering (${report.coveragePct}%)`,
    );
    assert(report.verdict.level === "not-ready", `verdict is not-ready (${report.verdict.level})`);

    // No sample data may leak into a new company.
    const asText = JSON.stringify(blank);
    assert(
      !/Shreeji|Aarna|Rajesh|Meena|U29130GJ/i.test(asText),
      "carries no trace of the bundled sample issuers",
    );

    // Eligibility must ask, never assume.
    const eligibility = runEligibility(blank);
    assert(
      eligibility.verdict.level === "indeterminate",
      `eligibility is indeterminate, not a pass or a fail (${eligibility.verdict.level})`,
    );
    assert(
      eligibility.counts.notMet === 0 && eligibility.counts.met === 0,
      "nothing is judged either way on no evidence",
    );

    // The plan is what turns an empty form into a route forward.
    const plan = buildActionPlan(report);
    assert(plan.actions.length >= 5, `the action plan has real work in it (${plan.actions.length} steps)`);
    assert(
      plan.projectedCoverage > plan.currentCoverage + 40,
      `and shows substantial headroom (${plan.currentCoverage}% -> ${plan.projectedCoverage}%)`,
    );

    // And it must still produce a document rather than throwing.
    const doc = await generateDocument(blank, { issuerId: "blank", useLlm: false });
    assert(
      doc.chapters.length === flatChapters.length && doc.stats.placeholders > 20,
      `generates the full structure as placeholders (${doc.chapters.length} chapters, ${doc.stats.placeholders} placeholders)`,
    );

    // The blank record must cover every field the wizard can write, or a
    // question would have nowhere to store its answer.
    const { questionnaire } = await import("../lib/data");
    const { getPath } = await import("../lib/engine/utils");
    const orphans: string[] = [];
    for (const step of (questionnaire as any).steps ?? []) {
      for (const question of step.questions ?? []) {
        if (question.type === "upload") continue;
        for (const path of [question.path, ...(question.rows ?? []).map((r: any) => r.path)]) {
          if (getPath(blank, path) === undefined) orphans.push(path);
        }
      }
    }
    assert(orphans.length === 0, "every wizard field exists on the blank record", orphans.join(", "));
  }

  console.log("");

  // ---- The drafting budget must degrade, not hang ----------------------
  // Serverless platforms kill a request at a fixed ceiling (60s on Vercel
  // Hobby). The refine loop is bounded in iterations but not in time, because a
  // chapter can wait out a provider rate-limit window. An expired budget must
  // therefore produce a complete deterministic document immediately, rather
  // than a 504 and nothing at all.
  console.log(`${BOLD}Drafting budget${RESET}`);
  {
    const { refineDocument } = await import("../lib/engine/refineGraph");
    const started = Date.now();
    const { document, trace } = await refineDocument(sampleIssuers[0].data, {
      issuerId: "budget",
      maxIterations: 3,
      budgetMs: 1, // already expired
    });
    const elapsed = Date.now() - started;

    assert(elapsed < 5000, `an expired budget short-circuits (${elapsed}ms, no model calls)`);
    assert(
      document.stats.totalChapters === flatChapters.length && document.stats.totalWords > 5000,
      `still returns the complete document (${document.stats.totalChapters} chapters, ${document.stats.totalWords.toLocaleString()} words)`,
    );
    assert(
      document.llmUsed === false && document.generationMode === "template",
      "and labels itself template mode rather than claiming model drafting",
    );
    assert(
      trace.log.some((line) => line.includes("time budget spent")),
      "the trace records why it degraded",
    );
  }

  console.log("");

  // ---- The action plan must not promise what the score will not pay ----
  // The plan states an arithmetic claim to the user ("answer these and you
  // reach 97%"). It is computed from the same items the score is, so the two
  // can be checked against each other exactly — and if they ever diverge the
  // plan is lying in the most damaging possible way: quantitatively.
  console.log(`${BOLD}Action plan${RESET}`);
  {
    const { buildActionPlan } = await import("../lib/engine/actionPlan");

    for (const issuer of sampleIssuers) {
      const report = runGapCheck(issuer.data, { issuerId: issuer.id, meta: issuer.meta });
      const plan = buildActionPlan(report);

      assert(
        plan.currentCoverage === report.coveragePct,
        `${issuer.id}: the plan starts from the reported coverage (${plan.currentCoverage}%)`,
      );
      assert(
        plan.projectedCoverage >= plan.currentCoverage,
        `${issuer.id}: the projection never goes backwards`,
        `${plan.currentCoverage}% -> ${plan.projectedCoverage}%`,
      );
      if (plan.actions.length > 0) {
        const last = plan.actions[plan.actions.length - 1];
        assert(
          last.cumulativeCoverage === plan.projectedCoverage,
          `${issuer.id}: working down the list arrives exactly at the projection`,
          `last step reaches ${last.cumulativeCoverage}%, projection claims ${plan.projectedCoverage}%`,
        );
      }
      assert(
        plan.actions.every((action) => action.owner !== "banker"),
        `${issuer.id}: the banker's work is never on the issuer's list`,
      );
      assert(
        plan.actions.every((action) => action.fields.length > 0 && action.requirementIds.length > 0),
        `${issuer.id}: every action names both the questions and the requirements it closes`,
      );

      const monotonic = plan.actions.every(
        (action, index) => index === 0 || action.cumulativeCoverage >= plan.actions[index - 1].cumulativeCoverage,
      );
      assert(monotonic, `${issuer.id}: cumulative coverage only ever increases`);

      const labels = plan.actions.map((action) => action.label);
      assert(new Set(labels).size === labels.length, `${issuer.id}: no step appears twice`, labels.join(" | "));
    }

    // A materially incomplete issuer is where the plan earns its place, so it is
    // exercised on one rather than only on the near-complete samples.
    const sparse = JSON.parse(JSON.stringify(sampleIssuers[0].data));
    for (const [group, key] of [
      ["management", "remuneration"], ["management", "group_companies"], ["business", "kpis"],
      ["financials", "peer_comparison"], ["issue", "working_capital_basis"], ["dividend", "dividend_policy"],
    ] as const) {
      sparse[group][key] = "";
    }
    sparse.promoters.waca = null;

    const sparseReport = runGapCheck(sparse, { issuerId: "sparse" });
    const sparsePlan = buildActionPlan(sparseReport);
    assert(sparsePlan.actions.length >= 4, `a sparse issuer produces a multi-step plan (${sparsePlan.actions.length} steps)`);
    assert(
      sparsePlan.projectedCoverage > sparsePlan.currentCoverage,
      `and real headroom (${sparsePlan.currentCoverage}% -> ${sparsePlan.projectedCoverage}%)`,
    );
    assert(
      sparsePlan.actions[sparsePlan.actions.length - 1].cumulativeCoverage === sparsePlan.projectedCoverage,
      "and the steps still add up to exactly the projection",
    );
    // Every field named must be one the wizard can actually collect, or the
    // instruction "open step N" sends the promoter somewhere with no such box.
    assert(
      sparsePlan.actions.every((action) => action.stepNumber !== null),
      "every issuer action points at a real wizard step",
    );
  }

  console.log("");

  // ---- Chapter IX conditions verified against the ICDR text ------------
  // These three encode regulation thresholds rather than drafting practice, so
  // they are asserted against worked figures: an off-by-one here is a wrong
  // statement about the law, not a formatting slip.
  console.log(`${BOLD}Chapter IX thresholds${RESET}`);
  {
    const base = JSON.parse(JSON.stringify(sampleIssuers[0].data));
    const run = (data: any) => runGapCheck(data, { issuerId: "threshold-probe" });
    const high = (data: any) =>
      run(data).findings.filter((f) => f.severity === "high").map((f) => f.requirementId);
    const statusOf = (data: any, id: string) => run(data).items.find((i) => i.id === id)?.status;

    // Reg 262(1): a monitoring agency is required only above INR 50 crore.
    const small = { ...base, issue: { ...base.issue, issue_size: 24, monitoring_agency: "" } };
    const large = { ...base, issue: { ...base.issue, issue_size: 64, monitoring_agency: "" } };
    assert(statusOf(small, "R5.7") === "Not applicable", "Reg 262(1): no monitoring agency required at INR 24 crore");
    assert(statusOf(large, "R5.7") === "Missing", "Reg 262(1): monitoring agency required at INR 64 crore");

    // Reg 230(2): the lower of 15% and INR 10 crore.
    const gcpAt = (issueSize: number, gcp: number) =>
      high({
        ...base,
        issue: {
          ...base.issue,
          issue_size: issueSize,
          objects_breakup: [
            { purpose: "Funding capital expenditure", amount: issueSize - gcp - 1 },
            { purpose: "General corporate purposes", amount: gcp },
          ],
        },
      }).includes("R5.9");
    assert(!gcpAt(24, 3.5), "Reg 230(2): 3.50 of a 24.00 issue (14.6%) is within the ceiling");
    assert(gcpAt(24, 3.7), "Reg 230(2): 3.70 of a 24.00 issue (15.4%) breaches the percentage limb");
    assert(!gcpAt(200, 10), "Reg 230(2): 10.00 of a 200.00 issue is exactly the absolute limb");
    assert(gcpAt(200, 12), "Reg 230(2): 12.00 of a 200.00 issue breaches the absolute limb at 6%");

    // Reg 230(1)(f): the offer for sale component is capped at 20%.
    const ofsAt = (size: number) =>
      high({ ...base, issue: { ...base.issue, has_offer_for_sale: true, offer_for_sale_size: size } }).includes("R5.12");
    assert(!ofsAt(4.5), "Reg 230(1)(f): an OFS of 4.50 on a 24.00 issue (18.8%) is within the cap");
    assert(ofsAt(6), "Reg 230(1)(f): an OFS of 6.00 on a 24.00 issue (25%) breaches the cap");
    assert(
      statusOf({ ...base, issue: { ...base.issue, has_offer_for_sale: false } }, "R5.12") === "Not applicable",
      "Reg 230(1)(f): does not apply to a fresh issue only",
    );

    // Reg 230(1)(h): issue proceeds may not repay a promoter or related-party loan.
    const withObjects = (objects: any[]) => ({ ...base, issue: { ...base.issue, objects_breakup: objects } });
    assert(
      high(withObjects([{ purpose: "Repayment of unsecured loans availed from the promoters", amount: 4 }])).includes("R5.11"),
      "Reg 230(1)(h): repayment of a promoter loan is flagged",
    );
    assert(
      high(withObjects([{ purpose: "Repayment of an unsecured loan from a related party", amount: 2 }])).includes("R5.11"),
      "Reg 230(1)(h): related-party wording is flagged",
    );
    // Both limbs must be present in the SAME object, or the check over-fires.
    assert(
      !high(withObjects([{ purpose: "Repayment of borrowings availed from Indian Bank", amount: 4 }])).includes("R5.11"),
      "Reg 230(1)(h): repaying an ordinary bank borrowing is NOT flagged",
    );
    assert(
      !high(withObjects([{ purpose: "Purchase of plant and machinery", amount: 4, deployment: "FY27" }])).includes("R5.11"),
      "Reg 230(1)(h): an ordinary capex object is NOT flagged",
    );
  }

  console.log("");

  // ---- Every scored field must be reachable through the wizard ---------
  // A requirement whose evidence field has no input control can never be
  // discharged, however diligent the issuer is — it silently caps coverage and
  // makes the "substantially complete draft" claim untrue. This guards the
  // registry and the questionnaire against drifting apart again.
  console.log(`${BOLD}Intake reachability${RESET}`);
  {
    const registry = (await import("../data/requirement_registry.json")).default as any;
    const intake = (await import("../data/intake_questionnaire.json")).default as any;

    const asked = new Set<string>();
    const collect = (node: any): void => {
      if (!node) return;
      if (Array.isArray(node)) return node.forEach(collect);
      if (typeof node === "object") {
        if (typeof node.path === "string") asked.add(node.path);
        return Object.values(node).forEach(collect);
      }
    };
    collect(intake);

    const unreachable: string[] = [];
    let scored = 0;
    for (const section of registry.sections) {
      for (const requirement of section.requirements) {
        for (const field of requirement.evidence_fields ?? []) {
          scored += 1;
          if (!asked.has(field)) unreachable.push(`${field} (${requirement.id})`);
        }
      }
    }

    assert(
      unreachable.length === 0,
      `every scored evidence field has an intake control (${scored} references)`,
      unreachable.join(", "),
    );
  }

  console.log("");

  // ---- Concurrency must not cost determinism or isolation ---------------
  // The draft and revise nodes now fan out. Two properties make that safe, and
  // both are silent when broken: results must come back in INPUT order (the
  // refine trace is shown to the user, and a log whose lines reorder run to run
  // makes a reproducible pipeline look nondeterministic), and one chapter
  // throwing must not take its siblings down.
  console.log(`${BOLD}Draft concurrency${RESET}`);
  {
    const { mapWithConcurrency } = await import("../lib/engine/refineGraph");

    // Deliberately inverted delays: the last item finishes first.
    const delays = [60, 45, 30, 15, 1];
    const started: number[] = [];
    let inFlight = 0;
    let peak = 0;

    const results = await mapWithConcurrency(delays, 3, async (ms, index) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      started.push(index);
      await new Promise((resolve) => setTimeout(resolve, ms));
      inFlight -= 1;
      return index;
    });

    assert(
      results.join(",") === "0,1,2,3,4",
      `results come back in input order despite inverted completion order (${results.join(",")})`,
    );
    assert(peak <= 3, `never exceeds the concurrency limit (peak ${peak} in flight)`);
    assert(peak > 1, `and does actually run concurrently (peak ${peak})`);

    // A limit above the item count must not spawn idle workers or hang.
    const small = await mapWithConcurrency([1, 2], 10, async (n) => n * 2);
    assert(small.join(",") === "2,4", `a limit above the item count is safe (${small.join(",")})`);
    assert((await mapWithConcurrency([], 3, async () => 1)).length === 0, "an empty list returns empty");

    // Isolation: losing four good drafts because the fifth threw would be worse
    // than the sequential code this replaced.
    const mixed = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("chapter blew up");
      return n;
    });
    const failed = mixed.filter((r) => r !== null && typeof r === "object" && "__error" in (r as any));
    assert(failed.length === 1, `one failure is isolated (${failed.length} failed of ${mixed.length})`);
    assert(mixed[0] === 1 && mixed[2] === 3, "and its siblings still return their results");

    // The concurrency limit is not a free parameter. Groq's limiter charges the
    // RESERVATION, not the completion, so a burst costs concurrency x (prompt +
    // MAX_COMPLETION_TOKENS) against a 12,000-token bucket. Three in flight
    // exceeded it, which is why bursts came back with the first two chapters
    // drafted and the rest on templates. Anyone raising either number without
    // re-doing that arithmetic should be stopped here rather than by a 429 in
    // front of an audience.
    const { burstFitsFreeTier, burstTokenCost, draftConcurrencyFor, tpmBucketFor, MODEL_TPM_BUCKET } =
      await import("../lib/engine/refineGraph");
    const { MAX_COMPLETION_TOKENS } = await import("../lib/engine/llm");

    // Every model we might be pointed at must fit its OWN bucket. Tuning on
    // llama-3.3-70b's 12,000 and then switching GROQ_MODEL to a model with 8,000
    // is exactly the mistake this catches, and it is invisible in production:
    // chapters just come back as templates and the document looks flatter.
    for (const model of Object.keys(MODEL_TPM_BUCKET)) {
      const n = draftConcurrencyFor(model, MAX_COMPLETION_TOKENS);
      const cost = burstTokenCost(n, MAX_COMPLETION_TOKENS);
      assert(
        burstFitsFreeTier(n, MAX_COMPLETION_TOKENS, model),
        `${model}: ${n} in flight fits its bucket (${cost} of ${tpmBucketFor(model)})`,
      );
      assert(n >= 1, `${model}: never drafts nothing at all (${n})`);
    }

    // Not vacuous: one more slot than derived must overflow, or the derivation
    // is leaving free capacity on the table and the check proves nothing.
    for (const model of Object.keys(MODEL_TPM_BUCKET)) {
      const n = draftConcurrencyFor(model, MAX_COMPLETION_TOKENS);
      if (n >= 3) continue; // clamped by MAX_DRAFT_CONCURRENCY, not by tokens
      assert(
        !burstFitsFreeTier(n + 1, MAX_COMPLETION_TOKENS, model),
        `${model}: ${n + 1} in flight would overflow — the limit is the real one`,
      );
    }

    assert(
      tpmBucketFor("some-model-we-have-never-measured") <= 6_000,
      "an unmeasured model degrades to the smallest bucket, not the largest",
    );
    assert(
      draftConcurrencyFor("llama-3.3-70b-versatile", 4000) <
        draftConcurrencyFor("llama-3.3-70b-versatile", MAX_COMPLETION_TOKENS),
      "raising the completion reservation buys back fewer chapters in flight",
    );
    assert(
      draftConcurrencyFor("llama-3.3-70b-versatile", 100_000) === 1,
      "a reservation larger than the whole bucket still drafts one chapter",
    );

    // WORST_CASE_PROMPT_TOKENS is the other input to the concurrency
    // arithmetic, and understating it over-fans-out: the slot cost comes out
    // smaller than reality and the extra chapter 429s. It grows silently
    // whenever a chapter gains context fields or a longer instruction —
    // deepening the narrative chapters took Risk Factors from ~2,033 to
    // ~3,012 — so it is MEASURED here rather than trusted.
    const { WORST_CASE_PROMPT_TOKENS } = await import("../lib/engine/refineGraph");
    let measuredWorst = 0;
    let worstChapter = "";
    for (const issuer of sampleIssuers) {
      await generateDocument(issuer.data, {
        issuerId: issuer.id,
        useLlm: true,
        llmPriorityOnly: false,
        draftNarrative: async (request) => {
          const prompt = [
            request.chapterTitle,
            request.instruction,
            ...request.mustCover,
            JSON.stringify(request.context, null, 2),
          ].join("\n");
          // ~4 chars per token for English and JSON, plus the system prompt.
          const tokens = Math.round(prompt.length / 4) + 700;
          if (tokens > measuredWorst) {
            measuredWorst = tokens;
            worstChapter = `${issuer.id} ${request.chapterId}`;
          }
          return null;
        },
      });
    }
    assert(
      measuredWorst <= WORST_CASE_PROMPT_TOKENS,
      `the declared worst-case prompt still covers the real one (declared ${WORST_CASE_PROMPT_TOKENS}, measured ${measuredWorst} on ${worstChapter})`,
    );
    assert(
      measuredWorst > WORST_CASE_PROMPT_TOKENS * 0.6,
      `and is not so padded that it wastes the bucket (measured ${measuredWorst} against declared ${WORST_CASE_PROMPT_TOKENS})`,
    );

    // The reservation is priced, so the temptation is to keep it tight. That
    // temptation has already been acted on once and was wrong: Risk Factors
    // measured 675 words / ~1,123 tokens on one run, the ceiling was cut to
    // 1,800 on that single observation, and a later run of the SAME chapter on
    // the SAME input ran past 1,800 and was refused.
    //
    // Generated length varies far more between runs than one measurement
    // suggests, so the floor here is the OBSERVED OVERRUN, not the observed
    // mean. Anything at or below 1,800 is known to truncate Risk Factors — the
    // single most important chapter in the document — and truncation costs a
    // whole chapter to a template.
    const OBSERVED_TRUNCATION_AT = 1_800;
    assert(
      MAX_COMPLETION_TOKENS > OBSERVED_TRUNCATION_AT,
      `the completion ceiling is above the length that actually truncated Risk Factors (${MAX_COMPLETION_TOKENS} vs ${OBSERVED_TRUNCATION_AT})`,
    );
  }

  console.log("");

  // ---- A quota retry must never outlive the request budget --------------
  // Groq's free tier answers a 429 with "please try again in 27.4s", and the
  // retry loop used to honour that unconditionally — four times over. Measured
  // runs on a throttled key took 82-96s against a 45s budget, which on Vercel's
  // 60s ceiling is a 504: the promoter gets an error page instead of a document
  // made of templates. Waiting is only correct while there is time left to draft
  // afterwards, so the negative case is the one that matters here.
  console.log(`${BOLD}Retry deadline${RESET}`);
  {
    const { canAffordRetry, retryAfterMs, RETRY_HEADROOM_MS } = await import("../lib/engine/llm");

    const now = 1_000_000;
    assert(
      canAffordRetry(5_000, now + 5_000 + RETRY_HEADROOM_MS, now),
      "a wait that leaves exactly the drafting headroom is affordable",
    );
    assert(
      !canAffordRetry(5_000, now + 5_000 + RETRY_HEADROOM_MS - 1, now),
      "one millisecond less is not — the retry is abandoned to the template",
    );
    assert(
      !canAffordRetry(27_400, now + 30_000, now),
      "Groq's real 27.4s backoff is refused inside 30s remaining",
    );
    assert(
      !canAffordRetry(1_000, now - 1, now),
      "a deadline already past refuses even a one-second wait",
    );
    assert(
      canAffordRetry(600_000, undefined, now),
      "no declared deadline means the caller owns the clock (scripts, tests)",
    );

    // The wait being budgeted is the one the API actually asks for.
    const quota = new Error("Rate limit reached ... Please try again in 27.397s. Visit ...");
    const asked = retryAfterMs(quota, 0);
    assert(
      asked >= 27_398 && asked <= 28_400,
      `the parsed backoff is Groq's own figure, not a guess (${asked}ms)`,
    );
    assert(
      retryAfterMs(new Error("connection reset"), 3) <= 15_000,
      "an unparseable error still backs off within the 15s cap",
    );
  }

  console.log("");

  // ---- Model fallback chain ---------------------------------------------
  // The free tier meters each model separately, so exhausting llama-3.3-70b's
  // 100,000-token day says nothing about gpt-oss-120b's. Drafting templates
  // while three untouched daily budgets sit unused on the same key is the
  // failure this chain exists to prevent.
  //
  // The distinction that carries the weight: a DAY cap takes the model out of
  // rotation, a MINUTE bucket does not. Confusing the two either benches a model
  // for an hour over a transient blip, or hammers a model that has nothing left.
  console.log(`${BOLD}Model fallback chain${RESET}`);
  {
    const {
      MODEL_CHAIN,
      getModelChain,
      availableModels,
      firstAvailableModel,
      markExhausted,
      isExhausted,
      isDailyCap,
      parseRetryDuration,
      resetModelHealth,
    } = await import("../lib/engine/llm");
    const { draftConcurrencyFor } = await import("../lib/engine/refineGraph");
    const { MAX_COMPLETION_TOKENS } = await import("../lib/engine/llm");

    const savedModel = process.env.GROQ_MODEL;
    resetModelHealth();
    delete process.env.GROQ_MODEL;

    assert(MODEL_CHAIN.length >= 2, `the chain has somewhere to fall (${MODEL_CHAIN.length} models)`);
    assert(
      new Set(MODEL_CHAIN).size === MODEL_CHAIN.length,
      "no model appears twice — a duplicate would be retried against a quota already known spent",
    );

    // An explicit GROQ_MODEL is a preference, not an exclusion. Honouring it by
    // discarding the fallbacks would make pinning a model strictly worse than
    // not pinning one.
    process.env.GROQ_MODEL = "openai/gpt-oss-20b";
    const pinned = getModelChain();
    assert(pinned[0] === "openai/gpt-oss-20b", `an explicit GROQ_MODEL leads the chain (${pinned[0]})`);
    assert(
      pinned.length === MODEL_CHAIN.length,
      `and does not drop the fallbacks or duplicate itself (${pinned.length} of ${MODEL_CHAIN.length})`,
    );

    process.env.GROQ_MODEL = "some-model-we-have-never-heard-of";
    assert(
      getModelChain().length === MODEL_CHAIN.length + 1,
      "an unknown pinned model is tried first and the known chain still backs it up",
    );
    delete process.env.GROQ_MODEL;

    // Day caps bench a model; minute buckets must not.
    const dayCap = new Error(
      "Rate limit reached for model `llama-3.3-70b-versatile` ... on tokens per day (TPD): Limit 100000, Used 99963, Requested 556. Please try again in 9m45.6s.",
    );
    const minuteCap = new Error(
      "Rate limit reached ... on tokens per minute (TPM): Limit 12000. Please try again in 27.4s.",
    );
    assert(isDailyCap(dayCap), "a tokens-per-day rejection is recognised as a day cap");
    assert(
      !isDailyCap(minuteCap),
      "a tokens-per-minute rejection is NOT — it must not bench the model for an hour",
    );

    assert(parseRetryDuration("try again in 27.4s") === 27_400, "parses plain seconds");
    assert(parseRetryDuration("try again in 9m45.6s") === 585_600, "parses minutes and seconds");
    assert(parseRetryDuration("try again in 7h3m47.52s") === 25_427_520, "parses hours");
    assert(parseRetryDuration("no duration here") === null, "and reports nothing rather than zero");

    // Benching and recovery.
    const t0 = 1_000_000;
    markExhausted("llama-3.3-70b-versatile", 600_000, t0);
    assert(isExhausted("llama-3.3-70b-versatile", t0 + 1), "an exhausted model is out of rotation");
    assert(
      !isExhausted("openai/gpt-oss-120b", t0 + 1),
      "and its siblings are untouched — the quotas are separate",
    );
    assert(
      !isExhausted("llama-3.3-70b-versatile", t0 + 600_001),
      "and it returns once the quoted window has passed",
    );

    // The load-bearing integration: benching the primary must move both the
    // model AND the concurrency, because the substitute has a smaller bucket.
    resetModelHealth();
    const primary = firstAvailableModel(t0);
    const primaryConcurrency = draftConcurrencyFor(primary, MAX_COMPLETION_TOKENS);
    markExhausted(primary, 600_000, t0);
    const substitute = firstAvailableModel(t0 + 1);
    assert(substitute !== primary, `the chain moves off the spent model (${primary} -> ${substitute})`);
    assert(
      draftConcurrencyFor(substitute, MAX_COMPLETION_TOKENS) <= primaryConcurrency,
      "and re-sizes the fan-out to the substitute's own bucket rather than the spent model's",
    );

    // Everything spent must still produce a real attempt and a real error.
    resetModelHealth();
    for (const model of getModelChain()) markExhausted(model, 600_000, t0);
    const all = availableModels(t0 + 1);
    assert(all.length === 1, `with every model spent, one is still attempted (${all.length})`);
    assert(
      typeof firstAvailableModel(t0 + 1) === "string",
      "so the caller gets a provider error, never a silent no-op",
    );

    resetModelHealth();
    if (savedModel === undefined) delete process.env.GROQ_MODEL;
    else process.env.GROQ_MODEL = savedModel;
  }

  console.log("");

  // ---- Standard offer-document text -------------------------------------
  // The boilerplate chapters carry most of the document's bulk. Two things
  // have to hold, and both fail silently.
  //
  // First, none of it may assert a regulatory threshold. A percentage or a day
  // count written into standard text is a number nobody will re-derive, and it
  // goes stale the next time a circular moves — which is precisely how a
  // compliance tool ends up confidently wrong. Thresholds belong in issuer data
  // (interpolated, so a missing one reads "Awaiting …") or deferred to the
  // banker with "as prescribed".
  //
  // Second, none of it may be attributed to the issuer. Standard text the
  // issuer never wrote, rendered as issuer-input, would be a false assertion of
  // provenance in the one place this product claims to be trustworthy.
  console.log(`${BOLD}Standard offer-document text${RESET}`);
  {
    const { sectionTemplates, structure } = await import("../lib/data");
    const templates: any = sectionTemplates;
    const struct: any = structure;

    // A bare figure carrying a regulatory unit, outside {interpolation}.
    //
    // The trailing \b belongs ONLY on the word alternatives. Written as
    // `(?:%|days?|...)\b` it can never match a percentage at all, because there
    // is no word boundary after "%" — which is how the first version of this
    // check reported a clean scan while being blind to the single most likely
    // hard-coded threshold in an offer document. The planted case below is what
    // exposed that.
    const THRESHOLD = /(?<!\{)\b\d+(?:\.\d+)?\s*(?:%|(?:per ?cent|percent|days?|months?|crore|lakh)\b)/i;

    const offenders: string[] = [];
    const walk = (node: any, chapterId: string) => {
      if (Array.isArray(node)) return node.forEach((n) => walk(n, chapterId));
      if (!node || typeof node !== "object") return;
      for (const [key, value] of Object.entries(node)) {
        if (["p", "h", "note", "placeholder"].includes(key) && typeof value === "string") {
          const hit = value.match(THRESHOLD);
          if (hit) offenders.push(`${chapterId}: "${hit[0]}"`);
        } else {
          walk(value, chapterId);
        }
      }
    };
    for (const [chapterId, chapter] of Object.entries<any>(templates.chapters ?? {})) {
      walk(chapter.clauses ?? [], chapterId);
    }

    assert(
      offenders.length === 0,
      `no standard clause hard-codes a regulatory threshold${offenders.length ? ` (${offenders.slice(0, 3).join("; ")})` : ""}`,
    );

    // The check must be able to fire, or it proves nothing.
    const planted = [
      { p: "General corporate purposes may not exceed 15% of the amount being raised." },
      { p: "Refunds will be made within 4 days of the Bid/Issue Closing Date." },
    ];
    const plantedHits: string[] = [];
    walk(planted, "planted");
    for (const clause of planted) {
      const hit = clause.p.match(THRESHOLD);
      if (hit) plantedHits.push(hit[0]);
    }
    assert(
      plantedHits.length === 2,
      `and the check is not vacuous — it catches a planted "15%" and "4 days" (${plantedHits.join(", ")})`,
    );

    // Interpolated figures are the sanctioned way to state a number and must
    // NOT trip the check, or the rule would push authors towards hard-coding.
    assert(
      !THRESHOLD.test("aggregating to INR {issue.issue_size} crore"),
      "an interpolated figure is allowed — the rule bans assertions, not numbers",
    );

    // Every boilerplate chapter must be substantive rather than a stub.
    const boilerplate = struct.sections
      .flatMap((s: any) => s.chapters)
      .filter((c: any) => c.mode === "boilerplate");
    const stubs = boilerplate.filter((c: any) => {
      const clauses = templates.chapters?.[c.id]?.clauses;
      return !clauses || clauses.length < 4;
    });
    assert(
      stubs.length === 0,
      `every boilerplate chapter has real standard text${stubs.length ? ` (thin: ${stubs.map((c: any) => c.id).join(", ")})` : ` (${boilerplate.length} chapters)`}`,
    );

    // Provenance: standard text is never the issuer's word.
    const doc: any = await generateDocument(sampleIssuers[0].data, {
      issuerId: sampleIssuers[0].id,
      useLlm: false,
    });
    const standardChapters = ["I.1", "VII.1", "VII.3", "VII.4"];
    let misattributed = 0;
    let standardBlocks = 0;
    for (const id of standardChapters) {
      const chapter = doc.chapters.find((c: any) => c.id === id);
      for (const block of chapter?.blocks ?? []) {
        if (block.provenance?.origin === "standard-clause") standardBlocks += 1;
        if (block.provenance?.origin === "issuer-input") misattributed += 1;
      }
    }
    assert(
      misattributed === 0,
      `standard text is never attributed to the issuer (${misattributed} misattributed across ${standardChapters.length} chapters)`,
    );
    assert(
      standardBlocks > 40,
      `and it is substantial rather than a token clause (${standardBlocks} standard-clause blocks)`,
    );
  }

  console.log("");

  // ---- No dashes in prose the reader sees --------------------------------
  // An em dash is one of the most recognisable signs that a passage was
  // machine-written, and an offer document is the last place that should read
  // as though nobody wrote it. The system prompt asks the model to avoid them;
  // asking is not enough, which is the same lesson the figure validator exists
  // to teach, so output is normalised and the result checked here.
  console.log(`${BOLD}Prose punctuation${RESET}`);
  {
    const { normaliseDashes } = await import("../lib/engine/llm");

    assert(
      normaliseDashes("The Company operates two plants — both in Rajkot.") ===
        "The Company operates two plants, both in Rajkot.",
      "an appositive dash becomes a comma",
    );
    assert(
      normaliseDashes("Revenue rose — The Company attributes this to volume.") ===
        "Revenue rose. The Company attributes this to volume.",
      "a dash before a standalone clause becomes a full stop",
    );
    assert(
      !/[—–]/.test(normaliseDashes("a — b — c — d")),
      "no dash survives, however many there are",
    );

    // Digit ranges are correct typography, not a stylistic tic.
    assert(
      normaliseDashes("utilisation of 10–15% across 2023–24") === "utilisation of 10–15% across 2023–24",
      "a numeric range keeps its en dash",
    );

    // The check must be able to fail, or normalising proves nothing.
    assert(
      /[—–]/.test("The Company operates two plants — both in Rajkot."),
      "and the detector is not vacuous — it sees a dash in unnormalised prose",
    );

    // Nothing user-facing may ship one either. Code comments are exempt: they
    // are not on the website, and sweeping them would bury this signal.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(__dirname, "..");

    const surfaces: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx$/.test(entry.name)) surfaces.push(full);
      }
    };
    walk(path.join(root, "app"));
    walk(path.join(root, "components"));
    surfaces.push(path.join(root, "lib", "glossary.ts"), path.join(root, "lib", "roles.ts"));

    const offenders: string[] = [];
    for (const file of surfaces) {
      const source = fs.readFileSync(file, "utf8");
      const rel = path.relative(root, file).replace(/\\/g, "/");
      source.split("\n").forEach((line, index) => {
        if (!line.includes("—")) return;
        if (/^\s*(\*|\/\/|\/\*)/.test(line)) return; // code comment
        if (/\{\/\*/.test(line)) return; // JSX comment
        offenders.push(`${rel}:${index + 1}`);
      });
    }
    assert(
      offenders.length === 0,
      `no em dash in user-facing copy${offenders.length ? ` (${offenders.slice(0, 4).join(", ")})` : ` (${surfaces.length} files scanned)`}`,
    );
  }

  console.log("");

  // ---- Risk factors are numbered after filtering, not before ------------
  // Conditional risk factors used to carry hard-coded numbers, so an issuer
  // with no litigation, no related-party dealings and no borrowings rendered
  // "1, 2, 3, 5, 9, 10 …". Nothing threw; the document just looked defective,
  // and the promoter had no way to know why. Numbering now happens at render
  // time, after the `when` filter.
  console.log(`${BOLD}Risk factor numbering${RESET}`);
  {
    const numbersIn = (doc: any): number[] => {
      const chapter = doc.chapters.find((c: any) => c.id === "II.1");
      const found: number[] = [];
      for (const block of chapter?.blocks ?? []) {
        const match = typeof block.text === "string" ? block.text.match(/^(\d+)\.\s/) : null;
        if (match) found.push(Number(match[1]));
      }
      return found;
    };
    const contiguousFrom1 = (ns: number[]) => ns.every((n, i) => n === i + 1);

    // A deliberately bare issuer: no manufacturing, litigation, debt or
    // related parties, so most conditional factors are filtered out. This is
    // the case that exposed the defect.
    const lean: any = {
      identity: { company_name: "Lean Services Limited", cin: "U00000MH2020PLC000000" },
      business: { industry: "facilities management", business_description: "Services.", revenue_stated: 10 },
      issue: { face_value: 10, issue_size: 12 },
    };
    const leanDoc: any = await generateDocument(lean, { issuerId: "lean", useLlm: false });
    const leanNumbers = numbersIn(leanDoc);
    assert(
      leanNumbers.length > 10,
      `a bare issuer still gets a substantive risk factors chapter (${leanNumbers.length} factors)`,
    );
    assert(
      contiguousFrom1(leanNumbers),
      `and they run 1..n with no gaps where conditional factors were filtered (${leanNumbers.join(",")})`,
    );

    for (const issuer of sampleIssuers) {
      const doc: any = await generateDocument(issuer.data, { issuerId: issuer.id, useLlm: false });
      const ns = numbersIn(doc);
      assert(
        contiguousFrom1(ns) && ns.length > 20,
        `${issuer.id}: ${ns.length} risk factors, numbered 1..${ns[ns.length - 1]} with no gaps`,
      );
    }

    // The check must be able to fail, or it proves nothing about the renderer.
    assert(
      !contiguousFrom1([1, 2, 3, 5, 9]),
      "and the contiguity test is not vacuous — it rejects the 1,2,3,5,9 sequence this replaced",
    );
  }

  console.log("");

  // ---- Nothing may declare a fixed width wider than a phone -------------
  // An SME promoter in India is as likely to be on a 375px phone as at a desk,
  // and SEBI's clause asks for something "simple enough for a first-time issuer
  // to engage with". A page that scrolls sideways fails that on the screen most
  // of them will use.
  //
  // A browser is the real test and this is only a lint, but it catches the
  // mistake that actually happened: a header row of three buttons with no
  // `flex-wrap`, which pushed the whole intake page 45px wide the moment a
  // third button was added. Grepping for the shape is cheap and would have
  // caught it at the commit that introduced it.
  console.log(`${BOLD}Mobile safety${RESET}`);
  {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(__dirname, "..");

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx$/.test(entry.name)) files.push(full);
      }
    };
    walk(path.join(root, "components"));
    walk(path.join(root, "app"));

    // A row of buttons that cannot wrap is the exact defect that shipped.
    const rigidRows: string[] = [];
    // A fixed pixel width wider than the narrowest phone, not inside a
    // responsive prefix and not a max-width, cannot fit.
    const tooWide: string[] = [];

    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      const rel = path.relative(root, file).replace(/\\/g, "/");

      for (const match of source.matchAll(/className="([^"]*\bflex\b[^"]*)"/g)) {
        const classes = match[1];
        if (!/\bitems-(center|start|end)\b/.test(classes)) continue;
        if (/\bflex-wrap\b/.test(classes) || /\bflex-col\b/.test(classes)) continue;
        if (/\boverflow-x-auto\b/.test(classes) || /\btruncate\b/.test(classes)) continue;
        if (/\bgap-(2|3|4|5|6|8)\b/.test(classes) && /\bjustify-between\b/.test(classes)) continue;
        // Only flag rows that plausibly hold several controls.
        if (!/\bgap-(2|3|4)\b/.test(classes)) continue;
        rigidRows.push(`${rel}: ${classes.slice(0, 60)}`);
      }

      // Only a BARE `w-[Npx]` is a hard commitment. `min-w-[520px]` inside an
      // `overflow-x-auto` wrapper is the correct way to ship a wide table to a
      // phone — the table scrolls in its own container and the page does not —
      // and `max-w-` is a ceiling, not a floor. The lookbehind rejects anything
      // prefixed, which is why it covers both.
      for (const match of source.matchAll(/(?<![a-z-])w-\[(\d{3,4})px\]/g)) {
        const width = Number(match[1]);
        if (width <= 375) continue;
        const before = source.slice(Math.max(0, match.index! - 12), match.index!);
        if (/(sm|md|lg|xl):$/.test(before)) continue;
        tooWide.push(`${rel}: w-[${width}px]`);
      }
    }

    assert(
      tooWide.length === 0,
      `no unconditional fixed width exceeds a 375px phone (${files.length} components scanned)`,
      tooWide.slice(0, 5).join(", "),
    );

    // This one is advisory rather than absolute — plenty of two-item rows are
    // fine unwrapped — so it reports rather than fails, and names them.
    console.log(
      `  ${DIM}${rigidRows.length} non-wrapping flex rows with gaps; reviewed at 375px in the browser${RESET}`,
    );
  }

  console.log("");

  // ---- A time claim is only worth its methodology -----------------------
  // This is the one number in the product that flatters us, so it gets the
  // harshest treatment. Every assertion below is a way the meter could lie in
  // our favour, written down so it cannot start doing so quietly.
  console.log(`${BOLD}Effort meter${RESET}`);
  {
    const {
      emptyEffort,
      recordActivity,
      recordCoverage,
      recordDraft,
      summariseEffort,
      formatEffort,
      IDLE_CEILING_MS,
    } = await import("../lib/engine/effort");

    // Nothing measured must report nothing, not zero. "0 min to a draft" would
    // be the single most dishonest string this product could print.
    const fresh = summariseEffort(emptyEffort());
    assert(!fresh.measured, "an untouched log reports nothing measured");
    assert(fresh.activeLabel === null, "and no duration at all, rather than 0 min");
    assert(formatEffort(0) === null && formatEffort(null) === null, "zero never formats as a duration");

    // The clock starts on the first answer, not before it.
    const t0 = 1_000_000;
    let log = recordActivity(emptyEffort(), t0);
    assert(log.activeMs === 0 && log.interactions === 1, "the first answer accrues no elapsed time");
    assert(log.startedAt === t0, "and stamps the start");

    // Ordinary working rhythm accrues in full.
    log = recordActivity(log, t0 + 30_000);
    log = recordActivity(log, t0 + 75_000);
    assert(log.activeMs === 75_000, `continuous work accrues in full (${log.activeMs}ms)`);

    // The load-bearing negative case: an overnight gap must not become nine
    // hours of "effort", and must not be silently dropped either.
    const idled = recordActivity(log, t0 + 75_000 + 9 * 60 * 60 * 1000);
    assert(
      idled.activeMs === 75_000 + IDLE_CEILING_MS,
      `a 9-hour pause is capped at the ceiling, not counted in full (${idled.activeMs}ms)`,
    );
    assert(
      idled.activeMs > log.activeMs,
      "and is still counted — capping errs against our own claim, dropping would err for it",
    );

    // A clock that jumps backwards must not refund time.
    const backwards = recordActivity(idled, t0);
    assert(backwards.activeMs === idled.activeMs, "a backwards clock never subtracts effort");

    // Milestones are permanent. Deleting an answer must not let the promoter
    // re-earn a faster time for a threshold they already crossed.
    let milestoned = recordCoverage(log, 55);
    const at50 = milestoned.milestones.find((m) => m.threshold === 50)?.atActiveMs;
    assert(
      milestoned.milestones.map((m) => m.threshold).join(",") === "25,50",
      `crossing 55% stamps both 25 and 50 (${milestoned.milestones.map((m) => m.threshold).join(",")})`,
    );
    milestoned = recordCoverage({ ...milestoned, activeMs: 999_999 }, 30);
    assert(
      milestoned.milestones.find((m) => m.threshold === 50)?.atActiveMs === at50,
      "falling back below a threshold does not rewrite the time it was first reached",
    );
    assert(
      milestoned.milestones.length === 2,
      `and does not duplicate it (${milestoned.milestones.length} milestones)`,
    );
    assert(
      milestoned.milestones.every((m, i, all) => i === 0 || all[i - 1].threshold < m.threshold),
      "milestones stay in ascending order",
    );

    // The first draft is the milestone. A regeneration an hour later is not.
    const drafted = recordDraft({ ...log, activeMs: 60_000 });
    const redrafted = recordDraft({ ...drafted, activeMs: 3_600_000 });
    assert(drafted.firstDraftAtMs === 60_000, "the first draft is stamped");
    assert(redrafted.firstDraftAtMs === 60_000, "and regenerating never re-stamps it");

    // The methodology must actually disclose the limit, not gesture at it.
    const summary = summariseEffort(drafted);
    assert(summary.measured && summary.activeLabel !== null, "a used log reports a duration");
    assert(
      /due diligence/i.test(summary.methodology) && /overstates/i.test(summary.methodology),
      "the methodology names what is excluded and admits the bias",
    );
  }

  console.log("");

  // ---- The conformance claim must stay true as the code moves ----------
  // The Impact page tells a judge, clause by clause, which file discharges
  // which sentence of SEBI's problem statement. That mapping is the most
  // load-bearing prose in the repository and the easiest to falsify by
  // accident: rename one file and the page keeps confidently pointing at
  // something that is no longer there. So the citations are checked, not
  // trusted — the same treatment every other claim here gets.
  console.log(`${BOLD}Problem-statement conformance${RESET}`);
  {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { problemStatement } = await import("../lib/data");

    const root = path.resolve(__dirname, "..");
    const broken: string[] = [];
    let citations = 0;
    for (const clause of problemStatement.clauses) {
      for (const file of clause.files) {
        citations += 1;
        if (!fs.existsSync(path.join(root, file))) broken.push(`${clause.id} -> ${file}`);
      }
    }
    assert(
      broken.length === 0,
      `every file cited against a SEBI clause exists (${citations} citations across ${problemStatement.clauses.length} clauses)`,
      broken.join(", "),
    );

    // A clause with no evidence is a slogan. Requiring the field to be
    // substantial is crude, but it is enough to stop an empty string shipping.
    const thin = problemStatement.clauses.filter(
      (clause) => !clause.evidence || clause.evidence.trim().length < 60,
    );
    assert(thin.length === 0, "every clause carries substantive evidence", thin.map((c) => c.id).join(", "));

    // The honest-limits property. If every clause ever reads "met", either the
    // product became perfect or someone quietly upgraded the two clauses we
    // cannot yet prove — reducing preparation time, which needs a measured
    // drafting cycle, and full registry coverage, which needs the whole of
    // Schedule VI verified. This fails loudly rather than letting that slide.
    const partial = problemStatement.clauses.filter((clause) => clause.status === "partial");
    assert(
      partial.length >= 2,
      `the known limits are still disclosed (${partial.length} clauses marked partial: ${partial.map((c) => c.id).join(", ")})`,
    );
    assert(
      partial.every((clause) => /honest limit/i.test(clause.evidence)),
      "and each partial clause states what is missing, not just that something is",
    );
  }

  console.log("");

  // ---- Register normalisation must never move a figure -----------------
  // The normaliser rewrites issuer prose unattended, so its safety property is
  // asserted here rather than trusted. A changed pronoun is presentation; a
  // changed figure is a disclosure defect.
  console.log(`${BOLD}Register normalisation${RESET}`);
  {
    const { toFormalRegister, preservesFigures, normaliseIssuerProse } = await import(
      "../lib/engine/register"
    );

    const cases: [string, string][] = [
      ["We do housekeeping for offices.", "The Company does housekeeping for offices."],
      ["We have not lost a major client in four years.", "The Company has not lost a major client in four years."],
      ["We started in Chennai and now we also work in Bengaluru.", "The Company started in Chennai and now the Company also works in Bengaluru."],
      ["We sign yearly contracts with clients.", "The Company signs yearly contracts with clients."],
      ["All our offices are rented, we do not own any property.", "All its offices are rented, the Company does not own any property."],
      ["We sent a recovery notice to one client.", "The Company sent a recovery notice to one client."],
      ["We take our Chennai office on rent from the family trust.", "The Company takes its Chennai office on rent from the family trust."],
      ["Around 1,850 people work through us at 74 sites.", "Approximately 1,850 people work through the Company at 74 sites."],
      ["a hospital chain around 14 percent", "a hospital chain approximately 14%"],
      ["Right now we are in three cities.", "Currently the Company is in three cities."],
    ];

    for (const [input, expected] of cases) {
      const actual = toFormalRegister(input);
      assert(actual === expected, `normalises: "${input.slice(0, 46)}…"`, `got: "${actual}"`);
    }

    // Idempotence: the transform is applied at more than one layer.
    for (const [input] of cases) {
      const once = toFormalRegister(input);
      assert(toFormalRegister(once) === once, `idempotent: "${input.slice(0, 46)}…"`);
    }

    // The safety property, over every free-text field of every sample issuer.
    let scanned = 0;
    let drift = 0;
    const walk = (value: any): void => {
      if (typeof value === "string") {
        if (value.trim().length < 8) return;
        scanned += 1;
        if (!preservesFigures(value, toFormalRegister(value))) {
          drift += 1;
          console.log(`    ${RED}figure drift:${RESET} ${value.slice(0, 90)}`);
        }
        return;
      }
      if (Array.isArray(value)) return value.forEach(walk);
      if (value && typeof value === "object") return Object.values(value).forEach(walk);
    };
    for (const issuer of sampleIssuers) walk(issuer.data);
    walk((await import("../data/coldtest_facility.json")).default);
    assert(drift === 0, `no figure moved across ${scanned} issuer free-text fields`);

    assert(
      normaliseIssuerProse("") === "" && normaliseIssuerProse(null as any) === null,
      "normaliser passes empty and non-string input through untouched",
    );
  }

  console.log("");
  // ---- Cross-issuer: the two issuers must fail on DIFFERENT checks ----
  console.log(`${BOLD}Cross-issuer${RESET}`);
  const [a, b] = sampleIssuers.map((issuer) =>
    runGapCheck(issuer.data, { issuerId: issuer.id, meta: issuer.meta }),
  );
  const aHigh = new Set(a.findings.filter((f) => f.severity === "high").map((f) => f.requirementId));
  const bHigh = new Set(b.findings.filter((f) => f.severity === "high").map((f) => f.requirementId));
  const overlap = [...aHigh].filter((id) => bHigh.has(id));
  assert(
    overlap.length === 0,
    "the two issuers fail on entirely different requirements (proves the checker is data-driven)",
    `overlap: ${overlap.join(", ")}`,
  );

  console.log("");
  if (failures === 0) {
    console.log(`${GREEN}${BOLD}All engine checks passed.${RESET}\n`);
  } else {
    console.log(`${RED}${BOLD}${failures} check(s) failed.${RESET}\n`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`${RED}Verification harness crashed:${RESET}`, error);
  process.exitCode = 1;
});
