/**
 * Exchange observation replay — verification.
 *
 * The replay produces a percentage that describes how good Drafter's registry
 * is. That makes it the single most self-serving number in the product, so the
 * assertions below are written as the ways it could inflate itself:
 *
 *   - a requirement ID in the map that does not exist would silently downgrade
 *     a real match to "unmapped" (or, worse, be quietly dropped)
 *   - "out-of-scope" could become a dumping ground that removes hard
 *     observations from the denominator
 *   - an unparseable letter could return zero observations and read as clean
 *   - 0 in scope could round to 100%
 */

import { allRequirements } from "../lib/data";
import { parseObservations } from "../lib/observations/parse";
import { mapObservation, replayObservations, OBSERVATION_MAP } from "../lib/observations/replay";

const BOLD = "[1m";
const RESET = "[0m";
const GREEN = "[32m";
const RED = "[31m";
const DIM = "[2m";

let failures = 0;
function assert(condition: boolean, label: string, detail = "") {
  if (condition) {
    console.log(`  ${GREEN}PASS${RESET}  ${label}`);
  } else {
    failures += 1;
    console.log(`  ${RED}FAIL${RESET}  ${label}`);
    if (detail) console.log(`        ${DIM}${detail}${RESET}`);
  }
}

/**
 * A representative SME observation letter.
 *
 * Written to exercise the parser and mapper, NOT presented as a real letter
 * from a real issuer — exchange observation letters are not public documents.
 * The observation WORDING follows the patterns that recur across the 17 filed
 * DRHPs in the corpus and the exchanges' published SME checklists; the issuer
 * is fictional. The tool's actual value is on the banker's own letter, which
 * never leaves their browser.
 */
const SAMPLE_LETTER = `
BSE Limited
Ref: BSE/LIST/SME/2026-27/0148
Date: July 14, 2026

Dear Sir / Madam,

Sub: Observations on the Draft Red Herring Prospectus of Fictional Components Limited

1. The revenue from operations disclosed in the chapter "Our Business" does not reconcile with the figure presented in the Restated Financial Statements. Please reconcile and revise.
2. Please furnish the peer review certificate of the statutory auditor, valid as on the date of filing.
3. The Company shall disclose the outstanding litigation involving the Promoters, including tax proceedings, in the relevant section.
4. The amount proposed towards general corporate purposes exceeds the prescribed ceiling. Please revise the objects of the issue accordingly.
5. Kindly provide the written consent of the Registrar to the Issue.
6. Key performance indicators disclosed in the chapter on Basis for Issue Price are not certified. Please clarify in the said chapter.
7. The Company is advised to add a risk factor in respect of customer concentration, given that the top three customers account for a substantial share of revenue.
8. Please provide the duly signed tripartite agreement with the depositories.
9. The shareholding pattern does not disclose the build-up of the Promoters' shareholding since incorporation. Please disclose.
10. Please submit an undertaking from the Promoters confirming that they have not been declared wilful defaulters.
11. The Company shall confirm the arrangements made for the safekeeping of the physical share certificates at its branch offices.
`;

async function main() {
  console.log(`\n${BOLD}Exchange observation replay${RESET}\n`);

  // ---- The map must point at requirements that exist -------------------
  // Written first because it caught eight wrong IDs on its first run: the
  // registry has MD&A at R10.1 and dividend at R13.1, not where a reasonable
  // guess would put them. A dead ID does not throw — it silently turns a
  // correct match into "unmapped" and quietly lowers the score.
  console.log(`${BOLD}Registry references${RESET}`);
  {
    const known = new Set(allRequirements.map((requirement) => requirement.id));
    const dead: string[] = [];
    let total = 0;
    for (const topic of OBSERVATION_MAP) {
      for (const id of topic.requirementIds) {
        total += 1;
        if (!known.has(id)) dead.push(`${id} (${topic.terms[0]})`);
      }
    }
    assert(dead.length === 0, `every mapped requirement ID exists (${total} references)`, dead.join(", "));

    const lowercase = OBSERVATION_MAP.flatMap((topic) =>
      topic.terms.filter((term) => term !== term.toLowerCase()),
    );
    assert(
      lowercase.length === 0,
      "every term is lowercase — matching is done on lowercased text",
      lowercase.join(", "),
    );
  }
  console.log("");

  // ---- Parsing ---------------------------------------------------------
  console.log(`${BOLD}Letter parsing${RESET}`);
  {
    const parsed = parseObservations(SAMPLE_LETTER);
    assert(parsed.length === 11, `splits the letter into 11 observations (got ${parsed.length})`);
    assert(
      parsed[0].text.startsWith("The revenue from operations"),
      "the first observation starts at the text, not the numeral",
      parsed[0]?.text?.slice(0, 60),
    );
    assert(
      !parsed.some((item) => /^(dear|sub|ref|date|bse limited)/i.test(item.text)),
      "letterhead and salutation are not read as observations",
    );

    // Continuation lines carry the operative clause as often as the first line.
    const wrapped = parseObservations(
      "1. The Company shall disclose the details of\nthe outstanding litigation involving the Promoters.\n2. Please revise the risk factors.",
    );
    assert(wrapped.length === 2, `wrapped lines merge into their observation (got ${wrapped.length})`);
    assert(
      wrapped[0].text.includes("outstanding litigation"),
      "and the continuation text is kept",
      wrapped[0]?.text,
    );

    // Other numbering styles exchanges actually use.
    assert(parseObservations("(1) First item here please\n(2) Second item here please").length === 2, "handles (1) (2)");
    assert(parseObservations("1) First item here please\n2) Second item here please").length === 2, "handles 1) 2)");
    assert(
      parseObservations("Observation 1: First item here\nObservation 2: Second item here").length === 2,
      "handles 'Observation 1:'",
    );

    // A year at the start of a line is not observation number 1997.
    const prose = parseObservations("1997 was the year of incorporation of the Company and it has grown since.");
    assert(prose.length === 1 && prose[0].text.startsWith("1997"), "a leading year is not read as an enumerator");

    // The honest failure mode: an unsplittable letter returns the whole text as
    // one visibly-wrong observation rather than an empty, clean-looking result.
    const unsplittable = parseObservations("The Company shall reconcile its revenue figures across chapters.");
    assert(unsplittable.length === 1, "an unnumbered letter yields one observation, not zero");
    assert(parseObservations("").length === 0 && parseObservations(null as any).length === 0, "empty input yields nothing");
  }
  console.log("");

  // ---- Mapping ---------------------------------------------------------
  console.log(`${BOLD}Observation mapping${RESET}`);
  {
    const revenue = mapObservation({ label: "1", text: "The revenue from operations disclosed in Our Business does not reconcile with the Restated Financial Statements." });
    assert(revenue.verdict === "mapped", `a reconciliation observation maps (${revenue.verdict})`);
    assert(revenue.requirementIds.includes("R2.4"), `to R2.4 (${revenue.requirementIds.join(", ")})`);
    assert(revenue.chapters.length > 0, `and names the chapters (${revenue.chapters.join(", ")})`);

    const gcp = mapObservation({ label: "4", text: "The amount proposed towards general corporate purposes exceeds the prescribed ceiling." });
    assert(gcp.requirementIds.includes("R5.9"), `the GCP ceiling maps to R5.9 (${gcp.requirementIds.join(", ")})`);

    // --- The precedence that decides whether the score is honest --------
    const certificate = mapObservation({ label: "2", text: "Please furnish the peer review certificate of the statutory auditor." });
    assert(certificate.verdict === "out-of-scope", `producing a certificate is out of scope (${certificate.verdict})`);
    assert(certificate.requirementIds.length === 0, "and claims no requirement credit for it");

    // The same subject matter, phrased as a DISCLOSURE, must stay in scope.
    // Getting this backwards would let Drafter disown a third of a real letter.
    const disclose = mapObservation({ label: "2b", text: "The Company shall disclose the name of the peer-reviewed statutory auditor and its firm registration number." });
    assert(disclose.verdict === "mapped", `the same subject as a disclosure stays IN scope (${disclose.verdict})`);
    assert(disclose.requirementIds.includes("R4.3"), `and maps to R4.3 (${disclose.requirementIds.join(", ")})`);

    const consent = mapObservation({ label: "5", text: "Kindly provide the written consent of the Registrar to the Issue." });
    assert(consent.verdict === "out-of-scope", `a consent letter is out of scope (${consent.verdict})`);

    // A genuine registry gap must be reported, never absorbed.
    const gap = mapObservation({ label: "99", text: "The Company shall confirm the arrangements made for the safekeeping of the physical share certificates at the branch." });
    assert(gap.verdict === "unmapped", `an unrecognised observation is reported unmapped (${gap.verdict})`);
    assert(gap.requirementIds.length === 0, "with no requirement invented for it");

    // Every verdict must be auditable.
    assert(revenue.matchedTerms.length > 0, `a mapped observation shows its terms (${revenue.matchedTerms.join(", ")})`);
    assert(certificate.matchedTerms.length > 0, `so does an out-of-scope one (${certificate.matchedTerms.join(", ")})`);
  }
  console.log("");

  // ---- The report arithmetic -------------------------------------------
  console.log(`${BOLD}Replay report${RESET}`);
  {
    const report = replayObservations(parseObservations(SAMPLE_LETTER));
    console.log(
      `  ${DIM}${report.counts.total} observations — ${report.counts.mapped} mapped, ` +
        `${report.counts.outOfScope} out of scope, ${report.counts.unmapped} unmapped ` +
        `→ ${report.coveragePct}% of in-scope${RESET}`,
    );

    assert(
      report.counts.mapped + report.counts.outOfScope + report.counts.unmapped === report.counts.total,
      "every observation lands in exactly one bucket",
    );

    const inScope = report.counts.mapped + report.counts.unmapped;
    assert(
      report.coveragePct === Math.round((report.counts.mapped / inScope) * 100),
      `coverage is over IN-SCOPE observations only (${report.coveragePct}%)`,
    );
    assert(
      report.counts.outOfScope === 4,
      `the four document demands are excluded from the denominator (${report.counts.outOfScope})`,
    );
    assert(
      report.counts.unmapped >= 1,
      `the registry gap is reported, not absorbed (${report.counts.unmapped} unmapped)`,
    );
    // A perfect score on a fixture we wrote ourselves would prove nothing. The
    // letter deliberately contains an observation the registry does not cover,
    // and the number has to show it.
    assert(
      report.coveragePct !== null && report.coveragePct < 100,
      `and drags the score below perfect (${report.coveragePct}%)`,
    );
    assert(
      report.coveragePct !== null && report.coveragePct >= 75,
      `while still covering most of a realistic letter (${report.coveragePct}%)`,
    );

    // 0/0 is not 100%.
    const allOutOfScope = replayObservations([
      { label: "1", text: "Please provide the duly signed tripartite agreement with the depositories." },
    ]);
    assert(allOutOfScope.coveragePct === null, "a letter with nothing in scope scores null, not 100%");

    const empty = replayObservations([]);
    assert(empty.coveragePct === null && empty.counts.total === 0, "an empty replay scores null");

    assert(report.requirementIds.length > 0, `the letter is reduced to requirement IDs (${report.requirementIds.length})`);
    assert(Boolean(report.registryVersion), `and stamped with the registry version (${report.registryVersion})`);
  }

  console.log("");
  if (failures > 0) {
    console.log(`${RED}${BOLD}${failures} observation check(s) failed.${RESET}\n`);
    process.exit(1);
  }
  console.log(`${GREEN}${BOLD}All observation checks passed.${RESET}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
