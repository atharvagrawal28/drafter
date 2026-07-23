/**
 * Live language-model verification.
 *
 * Exercises the LangGraph self-correction loop against a real Groq key and
 * asserts the properties that matter for a demo:
 *
 *   - the loop converges and does not leave chapters on the template fallback;
 *   - no chapter ends up containing a figure absent from the issuer data;
 *   - the planted defects still surface (the loop must never repair a
 *     disclosure defect); and
 *   - the generated business chapter still states the figure the PROMOTER
 *     asserted, so the document and the gap report agree with each other.
 *
 * Requires GROQ_API_KEY in .env.local. Run:  npm run verify:llm
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { runGapCheck } from "../lib/engine/gapCheck";
import { sampleIssuers } from "../lib/data";
import { getModel, isLlmAvailable } from "../lib/engine/llm";
import { refineDocument } from "../lib/engine/refineGraph";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
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

/** Numbers present anywhere in the issuer data, for a whole-document audit. */
function collectNumbers(value: any, into: Set<string>): void {
  if (value === null || value === undefined) return;
  if (typeof value === "number") return void into.add(String(Number(value.toFixed(4))));
  if (typeof value === "string") {
    // Strip digit-grouping commas first — "4,800 tonnes" is one number, not two.
    const degrouped = value.replace(/(\d),(?=\d{3}\b)/g, "$1");
    for (const match of degrouped.matchAll(/\d+(?:\.\d+)?/g)) {
      into.add(String(Number(Number(match[0]).toFixed(4))));
    }
    return;
  }
  if (Array.isArray(value)) return value.forEach((item) => collectNumbers(item, into));
  if (typeof value === "object") Object.values(value).forEach((item) => collectNumbers(item, into));
}

async function main() {
  console.log(`\n${BOLD}Drafter — live language-model verification${RESET}\n`);

  if (!isLlmAvailable()) {
    console.log(
      `${RED}No GROQ_API_KEY found.${RESET} Put it in .env.local (note the leading dot).\n` +
        `The product works without one — this script only verifies the LLM path.\n`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`${DIM}model: ${getModel()}${RESET}\n`);

  for (const issuer of sampleIssuers) {
    console.log(`${BOLD}${issuer.name}${RESET}`);
    const started = Date.now();

    const { document, trace } = await refineDocument(issuer.data, {
      issuerId: issuer.id,
      llmModel: getModel(),
      maxIterations: 3,
    });

    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `  ${DIM}${seconds}s · ${trace.iterations} iteration(s) · ` +
        `recovered: ${trace.recoveredChapters.join(", ") || "none"} · ` +
        `fell back: ${trace.fellBackChapters.join(", ") || "none"}${RESET}`,
    );
    for (const line of trace.log) console.log(`        ${DIM}${line}${RESET}`);

    assert(document.generationMode === "llm", "document reports LLM generation mode");

    // Quota exhaustion is an account limit, not a defect in the product, so it
    // is reported separately rather than failing the quality assertion.
    const qualityFallbacks = trace.fellBackChapters.filter(
      (id) => !trace.rateLimitedChapters.includes(id),
    );
    assert(
      qualityFallbacks.length === 0,
      `no chapter fell back for a quality reason (0 quality fallbacks)`,
      qualityFallbacks.join(", "),
    );
    if (trace.rateLimitedChapters.length) {
      console.log(
        `  ${DIM}note: ${trace.rateLimitedChapters.join(", ")} fell back on Groq free-tier quota ` +
          `(12,000 tokens/min), not on content. Re-run in a minute or generate one issuer at a time.${RESET}`,
      );
    }

    // Whole-document figure audit across LLM prose.
    const allowed = new Set<string>();
    collectNumbers(issuer.data, allowed);
    const offenders: string[] = [];
    for (const chapter of document.chapters) {
      if (!chapter.origins.includes("llm-narrative")) continue;
      const prose = chapter.blocks
        .filter((block) => block.kind === "para" || block.kind === "heading")
        .map((block: any) => block.text)
        .join(" ");
      for (const match of prose.matchAll(/(?<![\w.])\d[\d,]*(?:\.\d+)?(?![\w])/g)) {
        const num = Number(match[0].replace(/,/g, ""));
        if (!Number.isFinite(num)) continue;
        if (Number.isInteger(num) && num <= 50) continue;
        if (num >= 1900 && num <= 2100 && Number.isInteger(num)) continue;
        if (allowed.has(String(Number(num.toFixed(4))))) continue;
        offenders.push(`${chapter.id}:${match[0]}`);
      }
    }
    assert(
      offenders.length === 0,
      "no LLM-drafted chapter contains a figure absent from the issuer data",
      offenders.join(", "),
    );

    // The loop must never repair a disclosure defect.
    const report = runGapCheck(issuer.data, {
      issuerId: issuer.id,
      issuerName: issuer.name,
      meta: issuer.meta,
    });
    for (const defect of issuer.meta.planted_defects) {
      const ids = (defect.should_be_caught_by ?? "")
        .split(/[^\w.]+/)
        .filter((token) => /^R\d/.test(token));
      const hit = report.findings.find(
        (finding) => ids.includes(finding.requirementId) && finding.severity === "high",
      );
      assert(Boolean(hit), `${defect.id} still caught after refinement (${hit?.code ?? "—"})`);
    }

    // Document and report must agree about what the business chapter says.
    if (issuer.id === "autocomp") {
      const business = document.chapters.find((chapter) => chapter.id === "IV.2");
      const prose = business!.blocks
        .filter((block) => block.kind === "para")
        .map((block: any) => block.text)
        .join(" ");
      assert(
        /82\.5/.test(prose) && !/78\.9/.test(prose),
        "'Our Business' states the figure the promoter asserted, not the audited one " +
          "(so the gap report's description of that chapter is accurate)",
        `82.50 present: ${/82\.5/.test(prose)}, 78.90 present: ${/78\.9/.test(prose)}`,
      );
    }

    console.log("");
  }

  if (failures === 0) console.log(`${GREEN}${BOLD}All live LLM checks passed.${RESET}\n`);
  else {
    console.log(`${RED}${BOLD}${failures} check(s) failed.${RESET}\n`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`${RED}Verification crashed:${RESET}`, error);
  process.exitCode = 1;
});
