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
