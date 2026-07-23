/**
 * Marks the sector-conditional requirements, and sets the corresponding flag on
 * the sample issuers.
 *
 * Evidence: in the 14-document corpus, installed-capacity disclosure appears in
 * only 64% of filings — not because those issuers omitted it, but because they
 * are services businesses (software, events, engineering services) with no
 * plant. Treating capacity as unconditionally mandatory would mark a software
 * SME down for lacking a factory, which is wrong and would visibly discredit the
 * coverage score for a whole class of issuers.
 *
 * Run once: tsx scripts/apply-applicability.ts
 */

import * as fs from "fs";

const REGISTRY = "data/requirement_registry.json";
const registry = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));

const CONDITIONAL: Record<string, { field: string; reason: string }> = {
  "R2.5": {
    field: "business.has_manufacturing",
    reason:
      "Not applicable: the issuer has indicated it does not operate manufacturing facilities. Installed capacity and utilisation are disclosures specific to manufacturing issuers.",
  },
  "R3.2": {
    field: "business.has_manufacturing",
    reason:
      "Not applicable: the issuer has indicated it does not operate manufacturing facilities, so raw-material price volatility is not a principal risk. Supplier concentration, where relevant to a services business, is captured under the general internal risk factors.",
  },
};

let applied = 0;
for (const section of registry.sections) {
  for (const requirement of section.requirements) {
    const spec = CONDITIONAL[requirement.id];
    if (!spec) continue;
    requirement.applicability = spec;
    requirement.corpus_evidence =
      (requirement.corpus_evidence ? requirement.corpus_evidence + " " : "") +
      "Appears in 64% of the 14-document corpus; the balance are services issuers with no manufacturing operations, which is why this requirement is sector-conditional.";
    applied += 1;
  }
}

registry.fulfilment_legend.not_applicable =
  "Some requirements are sector-conditional. Where the issuer indicates the requirement does not apply (for example installed capacity for a services business), it is reported as 'Not applicable' and excluded from the coverage denominator entirely — it is not an obligation that can be met or missed.";

fs.writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + "\n");

// ---- Sample issuers: both are manufacturers -------------------------------
for (const file of ["data/sample_company_autocomp.json", "data/sample_company_specchem.json"]) {
  const issuer = JSON.parse(fs.readFileSync(file, "utf8"));
  issuer.business.has_manufacturing = true;
  fs.writeFileSync(file, JSON.stringify(issuer, null, 2) + "\n");
}

// The real-DRHP backtest fixture: Himalayan Solar manufactures solar modules.
const backtestPath = "data/backtest_himalayan.json";
if (fs.existsSync(backtestPath)) {
  const backtest = JSON.parse(fs.readFileSync(backtestPath, "utf8"));
  backtest.business.has_manufacturing = true;
  fs.writeFileSync(backtestPath, JSON.stringify(backtest, null, 2) + "\n");
}

console.log(`Marked ${applied} requirements as sector-conditional.`);
console.log("Set business.has_manufacturing on both sample issuers and the backtest fixture.");
