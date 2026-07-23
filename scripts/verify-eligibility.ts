/**
 * Eligibility gate — verification.
 *
 * This is the highest-stakes output in the product. Telling an eligible issuer
 * they cannot list would stop a legitimate fundraise; telling an ineligible one
 * they can would send them into months of drafting and a returned filing. So
 * every condition is exercised in three states — satisfied, breached, and not
 * answered — and the boundary of each numeric test is checked on both sides.
 *
 * Usage: tsx scripts/verify-eligibility.ts
 */

import { sampleIssuers } from "../lib/data";
import { runEligibility } from "../lib/engine/eligibility";
import type { ConditionState } from "../lib/engine/eligibility";
import type { IssuerData } from "../lib/types";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

let failures = 0;
function assert(condition: boolean, label: string, detail?: string) {
  if (condition) console.log(`  ${GREEN}PASS${RESET}  ${label}`);
  else {
    failures += 1;
    console.log(`  ${RED}FAIL${RESET}  ${label}`);
    if (detail) console.log(`        ${DIM}${detail}${RESET}`);
  }
}

/** An issuer that satisfies everything, as a baseline to perturb. */
const CLEAN: IssuerData = {
  identity: { company_name: "Baseline Limited" },
  issue: { pre_issue_capital: 7_500_000, fresh_issue_shares: 2_400_000, face_value: 10 },
  financials: { years: ["FY24", "FY25", "FY26"], ebitda_3yr: [1.4, 2.1, 2.8] },
  promoters: { promoter_disqualification_confirmation: true },
  eligibility: {
    converted_from_firm: false,
    promoter_change_last_year: false,
    exchange_application: true,
    depository_agreement: true,
    no_partly_paid_shares: true,
    promoter_shares_demat: true,
    firm_financing_arrangements: true,
  },
};

const clone = (patch: any = {}): IssuerData =>
  JSON.parse(JSON.stringify({ ...CLEAN, ...patch, issue: { ...CLEAN.issue, ...(patch.issue ?? {}) },
    financials: { ...CLEAN.financials, ...(patch.financials ?? {}) },
    promoters: { ...CLEAN.promoters, ...(patch.promoters ?? {}) },
    eligibility: { ...CLEAN.eligibility, ...(patch.eligibility ?? {}) } }));

const stateOf = (data: IssuerData, id: string): ConditionState | undefined =>
  runEligibility(data).conditions.find((c) => c.id === id)?.state;

function main() {
  console.log(`\n${BOLD}Eligibility gate${RESET}\n`);

  // ---- The clean baseline --------------------------------------------
  const clean = runEligibility(CLEAN);
  assert(clean.verdict.level === "eligible-on-the-figures", "a fully answered, compliant issuer is eligible", clean.verdict.headline);
  assert(clean.counts.notMet === 0 && clean.counts.unknown === 0, "with nothing failed and nothing unknown");
  assert(
    clean.verdict.detail.includes("not a clearance"),
    "and the verdict still says it is not a clearance",
  );

  // ---- Reg 229(1)/(2): the capital ceiling, both sides of the line ----
  console.log(`\n${BOLD}Reg 229 — post-issue capital ceiling${RESET}`);
  // (7,500,000 + 2,400,000) x 10 = INR 9.90 crore
  assert(stateOf(CLEAN, "REG-229-1") === "met", "INR 9.90 crore post-issue capital is within Reg 229(1)");
  // 24,000,000 x 10 = INR 24 crore — over 229(1) but inside 229(2)
  assert(
    stateOf(clone({ issue: { pre_issue_capital: 21_600_000 } }), "REG-229-1") === "met",
    "INR 24.00 crore is above Reg 229(1) but still within Chapter IX under 229(2)",
  );
  // 25,100,000 x 10 = INR 25.10 crore — over the Chapter IX ceiling
  assert(
    stateOf(clone({ issue: { pre_issue_capital: 22_700_000 } }), "REG-229-1") === "not-met",
    "INR 25.10 crore exceeds the Chapter IX ceiling",
  );
  assert(
    stateOf(clone({ issue: { face_value: null } }), "REG-229-1") === "unknown",
    "a missing face value yields unknown, not a pass",
  );

  // ---- Reg 229(6): the operating-profit test --------------------------
  console.log(`\n${BOLD}Reg 229(6) — operating profit${RESET}`);
  const ebitda = (series: (number | null)[]) => stateOf(clone({ financials: { ebitda_3yr: series } }), "REG-229-6");
  assert(ebitda([1.4, 2.1, 2.8]) === "met", "three qualifying years passes");
  assert(ebitda([0.4, 1.0, 2.8]) === "met", "exactly INR 1.00 crore counts — the test is 'at least'");
  assert(ebitda([0.4, 0.9, 2.8]) === "not-met", "one qualifying year fails");
  assert(ebitda([0.4, 0.5, 0.6]) === "not-met", "no qualifying year fails");
  assert(ebitda([0.99, 1.01, 0.5]) === "not-met", "0.99 does not round up to the threshold");
  assert(ebitda([2.0, 3.0]) === "unknown", "only two years supplied cannot answer a three-year test");
  assert(ebitda([]) === "unknown", "no data yields unknown");
  // A loss-making year must not be silently dropped.
  assert(ebitda([-1.2, 1.5, 1.8]) === "met", "a loss year is counted, and two good years still pass");
  assert(ebitda([-1.2, -0.5, 1.8]) === "not-met", "two loss years fail");

  // The most consequential message in the product — it must name the rule.
  const failed = runEligibility(clone({ financials: { ebitda_3yr: [0.4, 0.9, 2.8] } }));
  const condition = failed.conditions.find((c) => c.id === "REG-229-6")!;
  assert(condition.source.includes("229(6)"), "the failing condition cites Reg 229(6)");
  assert(
    (condition.action ?? "").includes("not profit after tax"),
    "and warns that EBITDA is not profit after tax — the confusion that causes this",
  );
  assert(failed.verdict.level === "ineligible", "and the overall verdict is ineligible");

  // ---- Reg 229(4) and 229(5): conditional gates -----------------------
  console.log(`\n${BOLD}Reg 229(4), 229(5) — conditional gates${RESET}`);
  assert(
    runEligibility(CLEAN).conditions.find((c) => c.id === "REG-229-4")!.applicable === false,
    "conversion cooling-off does not apply to a company incorporated as such",
  );
  assert(
    stateOf(clone({ eligibility: { converted_from_firm: true, full_year_since_conversion: false } }), "REG-229-4") === "not-met",
    "a firm converted less than a full financial year ago fails",
  );
  assert(
    stateOf(clone({ eligibility: { converted_from_firm: true, full_year_since_conversion: true } }), "REG-229-4") === "met",
    "a firm converted more than a full financial year ago passes",
  );
  assert(
    stateOf(clone({ eligibility: { converted_from_firm: true } }), "REG-229-4") === "unknown",
    "converted, but the elapsed period unstated, is unknown",
  );
  assert(
    stateOf(clone({ eligibility: { promoter_change_last_year: true } }), "REG-229-5") === "not-met",
    "a change of promoter within the last year fails",
  );

  // ---- Reg 228 and Reg 230(1) -----------------------------------------
  console.log(`\n${BOLD}Reg 228, Reg 230(1) — confirmations${RESET}`);
  assert(
    stateOf(clone({ promoters: { promoter_disqualification_confirmation: false } }), "REG-228") === "not-met",
    "an admitted disqualification fails",
  );
  assert(
    stateOf(clone({ promoters: { promoter_disqualification_confirmation: null } }), "REG-228") === "unknown",
    "an unanswered disqualification is unknown, never a pass",
  );
  for (const [id, path] of [
    ["REG-230-1-A", "exchange_application"],
    ["REG-230-1-B", "depository_agreement"],
    ["REG-230-1-C", "no_partly_paid_shares"],
    ["REG-230-1-D", "promoter_shares_demat"],
    ["REG-230-1-E", "firm_financing_arrangements"],
  ] as const) {
    assert(stateOf(clone({ eligibility: { [path]: false } }), id) === "not-met", `${id}: answered no fails`);
    assert(stateOf(clone({ eligibility: { [path]: null } }), id) === "unknown", `${id}: unanswered is unknown`);
  }

  // ---- The three-state contract ---------------------------------------
  console.log(`\n${BOLD}The three-state contract${RESET}`);
  const empty = runEligibility({});
  assert(empty.verdict.level === "indeterminate", "an empty issuer is indeterminate, not ineligible");
  assert(empty.counts.notMet === 0, "and nothing is reported as failed on no evidence", JSON.stringify(empty.counts));
  assert(
    empty.conditions.every((c) => c.state !== "unknown" || !!c.action),
    "every unknown condition says exactly what is needed to resolve it",
  );

  // A failure anywhere outranks any number of unknowns.
  const mixed = runEligibility(clone({ financials: { ebitda_3yr: [0.1, 0.2, 0.3] }, eligibility: { depository_agreement: null } }));
  assert(mixed.verdict.level === "ineligible", "a hard failure outranks an unknown in the verdict");

  // ---- The shipped sample issuers -------------------------------------
  console.log(`\n${BOLD}Shipped sample issuers${RESET}`);
  for (const issuer of sampleIssuers) {
    const report = runEligibility(issuer.data, issuer.name);
    console.log(
      `  ${DIM}${issuer.name}: ${report.verdict.level} — ` +
        `${report.counts.met} met, ${report.counts.notMet} failed, ${report.counts.unknown} unknown${RESET}`,
    );
    assert(
      report.conditions.length > 0 && report.verdict.headline.length > 0,
      `${issuer.id}: produces a complete eligibility report`,
    );
  }

  console.log("");
  if (failures === 0) console.log(`${GREEN}${BOLD}All eligibility checks passed.${RESET}\n`);
  else {
    console.log(`${RED}${BOLD}${failures} check(s) failed.${RESET}\n`);
    process.exitCode = 1;
  }
}

main();
