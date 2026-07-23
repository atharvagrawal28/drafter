/**
 * Cold-start quality test.
 *
 * Runs the full pipeline against an issuer written the way a first-time promoter
 * actually would — and reports what a critical reader would notice, rather than
 * asserting success. The point is to FIND problems, so it prints the output for
 * judgement instead of pass/fail on properties we already know hold.
 *
 * Usage: tsx scripts/coldtest.ts [--llm]
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import coldIssuer from "../data/coldtest_facility.json";
import { generateDocument } from "../lib/engine/generate";
import { runEligibility } from "../lib/engine/eligibility";
import { runGapCheck } from "../lib/engine/gapCheck";
import { getModel, isLlmAvailable } from "../lib/engine/llm";
import { refineDocument } from "../lib/engine/refineGraph";
import type { DrhpDocument, IssuerData } from "../lib/types";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

const data = coldIssuer as unknown as IssuerData;
const useLlm = process.argv.includes("--llm") && isLlmAvailable();

async function main() {
  console.log(`\n${BOLD}Cold-start quality test — ${(coldIssuer as any).meta.case_name}${RESET}`);
  console.log(`${DIM}${(coldIssuer as any).meta.sector} · services business (no manufacturing)${RESET}`);
  console.log(`${DIM}mode: ${useLlm ? "LLM (" + getModel() + ")" : "deterministic templates"}${RESET}\n`);

  let doc: DrhpDocument;
  if (useLlm) {
    const result = await refineDocument(data, { issuerId: "coldtest", llmModel: getModel(), maxIterations: 2 });
    doc = result.document;
    console.log(`${DIM}refine: ${result.trace.iterations} iteration(s), fell back: ${result.trace.fellBackChapters.join(", ") || "none"}${RESET}`);
    for (const line of result.trace.log) console.log(`  ${DIM}${line}${RESET}`);
    console.log("");
  } else {
    doc = await generateDocument(data, { issuerId: "coldtest", useLlm: false });
  }

  const report = runGapCheck(data, { issuerId: "coldtest", issuerName: (coldIssuer as any).meta.case_name });

  // ---- 1. Shape ------------------------------------------------------
  console.log(`${BOLD}1. What came out${RESET}`);
  console.log(`  ${doc.stats.totalChapters} chapters · ${doc.stats.totalWords.toLocaleString()} words · ${doc.stats.totalTables} tables`);
  console.log(`  drafted ${doc.stats.generatedChapters} · partial ${doc.stats.partialChapters} · skeleton ${doc.stats.skeletonChapters} · placeholders ${doc.stats.placeholders}`);
  console.log(`  coverage ${report.coveragePct}% (issuer-controllable ${report.issuerCoveragePct}%)`);
  console.log(`  complete ${report.counts.complete} · partial ${report.counts.partial} · missing ${report.counts.missing} · defect ${report.counts.defect} · n/a ${report.counts.notApplicable}`);

  // ---- 1b. Eligibility -----------------------------------------------
  const eligibility = runEligibility(data, (coldIssuer as any).meta.case_name);
  console.log(`
${BOLD}1b. Can this issuer make an SME IPO at all?${RESET}`);
  const tone = eligibility.verdict.level === "ineligible" ? RED : eligibility.verdict.level === "indeterminate" ? YELLOW : GREEN;
  console.log(`  ${tone}${eligibility.verdict.headline}${RESET}`);
  console.log(`  ${DIM}${eligibility.counts.met} satisfied · ${eligibility.counts.notMet} failed · ${eligibility.counts.unknown} unanswered · ${eligibility.counts.notApplicable} n/a${RESET}`);
  for (const condition of eligibility.conditions.filter((c) => c.applicable && c.state !== "met")) {
    const colour = condition.state === "not-met" ? RED : YELLOW;
    console.log(`  ${colour}${condition.source}${RESET} ${condition.finding.replace(/\s+/g, " ").slice(0, 150)}`);
  }

  // ---- 2. Sector gate ------------------------------------------------
  console.log(`\n${BOLD}2. Sector-conditional gate (services issuer)${RESET}`);
  const na = report.items.filter((i) => i.status === "Not applicable");
  if (na.length === 0) {
    console.log(`  ${RED}NOTHING marked not-applicable — the gate did not fire for a services business.${RESET}`);
  } else {
    for (const item of na) console.log(`  ${GREEN}n/a${RESET} ${item.id} ${item.requirement.slice(0, 70)}`);
  }

  // ---- 3. Findings, judged -------------------------------------------
  console.log(`\n${BOLD}3. Findings — are these real, or noise?${RESET}`);
  console.log(`  ${report.findings.length} total · ${report.findingCounts.high} high · ${report.findingCounts.medium} medium · ${report.findingCounts.low} low`);
  for (const finding of report.findings.filter((f) => f.severity !== "low")) {
    const colour = finding.severity === "high" ? RED : YELLOW;
    console.log(`\n  ${colour}${finding.code} [${finding.severity}]${RESET} ${finding.title}`);
    console.log(`    ${DIM}${finding.observation.replace(/\s+/g, " ").slice(0, 230)}${RESET}`);
  }

  // ---- 4. Read the actual prose --------------------------------------
  console.log(`\n${BOLD}4. ${CYAN}Does the prose read like an offer document?${RESET}`);
  for (const id of ["IV.2", "II.1"]) {
    const chapter = doc.chapters.find((c) => c.id === id)!;
    console.log(`\n  ${BOLD}— ${id} ${chapter.title} (${chapter.origins.join("/")})${RESET}`);
    const paras = chapter.blocks.filter((b: any) => b.kind === "para") as any[];
    for (const para of paras.slice(0, 3)) {
      console.log(`    ${para.text.replace(/\s+/g, " ").slice(0, 300)}`);
      console.log("");
    }
  }

  // ---- 5. Leakage of casual register ---------------------------------
  console.log(`${BOLD}5. Did casual promoter language leak into the document?${RESET}`);
  const CASUAL = [
    "we do ", "right now", "nothing much", "we sign", "we mostly", "we take our",
    "a few big", "they pay on time", "we have not lost", "roughly", "about 1,850",
    "we also work", "our biggest is",
  ];
  const leaks: string[] = [];
  for (const chapter of doc.chapters) {
    const prose = chapter.blocks
      .filter((b: any) => b.kind === "para" || b.kind === "list")
      .map((b: any) => (b.kind === "list" ? b.items.join(" ") : b.text))
      .join(" ")
      .toLowerCase();
    for (const phrase of CASUAL) {
      if (prose.includes(phrase)) leaks.push(`${chapter.id}: "${phrase}"`);
    }
  }
  if (leaks.length === 0) console.log(`  ${GREEN}none detected${RESET}`);
  else {
    console.log(`  ${YELLOW}${leaks.length} casual phrase(s) reproduced verbatim in the draft:${RESET}`);
    for (const leak of leaks.slice(0, 12)) console.log(`    ${leak}`);
  }

  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
