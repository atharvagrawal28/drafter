/**
 * Corpus analysis — Drafter against a body of real filed SME DRHPs.
 *
 * A single filing shows the structure is plausible. A corpus shows what is
 * UNIVERSAL (and therefore belongs in Drafter's tree), what is COMMON BUT
 * MISSING from Drafter, and what Drafter carries that real issuers rarely file.
 *
 * Four questions, in order of how much they can change the product:
 *
 *   1. Which of Drafter's chapters appear in what share of real filings?
 *   2. Which of Drafter's 60 requirements are evidenced, corpus-wide?
 *   3. WHAT DO REAL FILINGS CONTAIN THAT DRAFTER'S TREE HAS NO CHAPTER FOR?
 *      — this is the one that finds genuine gaps rather than confirming priors.
 *   4. How is a real DRHP's length actually distributed across its parts?
 *
 * Usage: tsx scripts/corpus-analyse.ts <corpus-dir> <out-dir>
 */

import * as fs from "fs";
import * as path from "path";
import { allRequirements, structure } from "../lib/data";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------
// Heading variants actually observed in filed documents.
// ---------------------------------------------------------------------------
const VARIANTS: Record<string, string[]> = {
  "I.1": ["definitions and abbreviations", "definitions abbreviations", "conventional and general terms"],
  "I.2": ["certain conventions", "presentation of financial", "use of financial information", "industry and market data"],
  "I.3": ["forward looking statements", "forward-looking statements"],
  "II.1": ["risk factors"],
  "III.1": ["the issue", "the offer", "issue details in brief", "offer details in brief"],
  "III.2": ["summary of financial information", "summary financial information", "restated financial information", "summary of our financial information"],
  "III.3": ["general information"],
  "III.4": ["capital structure"],
  "III.5": ["objects of the issue", "objects of the offer"],
  "III.6": ["basis for issue price", "basis for offer price"],
  "III.7": ["statement of possible tax benefits", "statement of special tax benefits", "statement of tax benefits"],
  "IV.1": ["industry overview", "our industry"],
  "IV.2": ["our business", "business overview"],
  "IV.3": ["key regulations and policies", "key industrial regulations", "applicable laws and regulations", "regulations and policies"],
  "IV.4": ["history and certain corporate matters", "history and corporate structure"],
  "IV.5": ["our management", "our management and organisation"],
  "IV.6": ["our promoters and promoter group", "our promoter and promoter group", "our promoters"],
  "IV.7": ["our group companies", "group companies"],
  "IV.8": ["dividend policy"],
  "V.1": ["restated financial statements", "financial statements as restated", "financial information of our company"],
  "V.2": ["management s discussion and analysis", "managements discussion and analysis", "management discussion and analysis"],
  "V.3": ["financial indebtedness"],
  "VI.1": ["outstanding litigation and material developments", "outstanding litigations and material developments", "outstanding litigation"],
  "VI.2": ["government and other approvals", "government and other statutory approvals"],
  "VI.3": ["other regulatory and statutory disclosures"],
  "VII.1": ["terms of the issue", "terms of the offer"],
  "VII.2": ["issue structure", "offer structure"],
  "VII.3": ["issue procedure", "offer procedure"],
  "VII.4": ["restrictions on foreign ownership", "foreign ownership of indian securities"],
  "VIII.1": ["main provisions of the articles of association", "main provision of articles of association", "articles of association"],
  "IX.1": ["material contracts and documents for inspection", "material contracts and documents"],
  "IX.2": ["declaration"],
};

/**
 * Chapters that real SME DRHPs commonly carry which Drafter's tree does NOT
 * have as a chapter of its own. Probed to see how common they really are —
 * anything appearing in most filings is a genuine gap in our structure.
 */
const CANDIDATE_GAPS: { key: string; label: string; probes: string[] }[] = [
  { key: "KPI", label: "Key Performance Indicators", probes: ["key performance indicators", "kpi of our company"] },
  { key: "SUMMARY", label: "Summary of the Offer Document", probes: ["summary of the offer document", "summary of offer document", "summary of the issue document"] },
  { key: "OBJECTS_MONITOR", label: "Monitoring agency / deployment monitoring", probes: ["monitoring agency", "monitoring of utilisation"] },
  { key: "BASIS_ALLOT", label: "Basis of allotment", probes: ["basis of allotment"] },
  { key: "OUR_SUBS", label: "Our Subsidiaries", probes: ["our subsidiaries", "subsidiaries of our company"] },
  { key: "RPT_CHAPTER", label: "Related Party Transactions (own chapter)", probes: ["related party transactions"] },
  { key: "CAPITALISATION", label: "Capitalisation statement", probes: ["capitalisation statement", "capitalization statement"] },
  { key: "ACC_RATIOS", label: "Accounting ratios (own section)", probes: ["accounting ratios"] },
  { key: "PROPERTY", label: "Our Property / immovable properties", probes: ["immovable propert", "our properties"] },
  { key: "IP", label: "Intellectual property", probes: ["intellectual property"] },
  { key: "EMPLOYEES", label: "Human resources / employees", probes: ["human resources", "our employees"] },
  { key: "CAPACITY", label: "Installed capacity and utilisation", probes: ["installed capacity", "capacity utilisation", "capacity utilization"] },
  { key: "WORKING_CAP", label: "Working capital requirement basis", probes: ["working capital requirement", "basis of working capital"] },
  { key: "GCP", label: "General corporate purposes", probes: ["general corporate purpose"] },
  { key: "ISSUE_EXPENSES", label: "Issue expenses breakdown", probes: ["issue related expenses", "offer related expenses", "issue expenses"] },
  { key: "PRE_IPO", label: "Pre-IPO placement", probes: ["pre ipo placement", "pre-ipo placement"] },
  { key: "WEIGHTED_EPS", label: "Weighted average EPS / RoNW table", probes: ["weighted average", "weighted average number of equity shares"] },
  { key: "WACA", label: "Weighted average cost of acquisition", probes: ["weighted average cost of acquisition", "waca"] },
  { key: "GREEN_SHOE", label: "Green shoe option", probes: ["green shoe"] },
  { key: "BRLM_TRACK", label: "Track record of lead manager", probes: ["track record of the past issues", "price information of past issues"] },
];

interface DocResult {
  name: string;
  pages: number;
  words: number;
  chapterHits: Record<string, boolean>;
  requirementHits: Record<string, boolean>;
  gapHits: Record<string, boolean>;
}

async function analyseOne(pdfPath: string, cacheDir: string): Promise<DocResult | null> {
  const name = path.basename(pdfPath, ".pdf");
  const cachePath = path.join(cacheDir, `${name}.txt`);

  let full: string;
  let pages = 0;

  if (fs.existsSync(cachePath)) {
    full = fs.readFileSync(cachePath, "utf8");
    pages = Number(fs.readFileSync(path.join(cacheDir, `${name}.pages`), "utf8")) || 0;
  } else {
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const buffer = new Uint8Array(fs.readFileSync(pdfPath));
      const pdf = await getDocumentProxy(buffer);
      pages = pdf.numPages;
      const { text } = await extractText(pdf, { mergePages: true });
      full = Array.isArray(text) ? text.join("\n") : String(text);
      fs.writeFileSync(cachePath, full);
      fs.writeFileSync(path.join(cacheDir, `${name}.pages`), String(pages));
    } catch (error) {
      console.log(`  ${RED}skip ${name}: ${(error as Error).message.slice(0, 80)}${RESET}`);
      return null;
    }
  }

  const haystack = norm(full);
  const words = full.split(/\s+/).filter(Boolean).length;

  const chapterHits: Record<string, boolean> = {};
  for (const section of structure.sections) {
    for (const chapter of section.chapters) {
      const probes = [norm(chapter.title), ...(VARIANTS[chapter.id] ?? []).map(norm)];
      chapterHits[chapter.id] = probes.some((probe) => haystack.includes(probe));
    }
  }

  const requirementHits: Record<string, boolean> = {};
  for (const requirement of allRequirements) {
    const probes = REQ_PROBES[requirement.id] ?? [];
    requirementHits[requirement.id] = probes.some((probe) => haystack.includes(norm(probe)));
  }

  const gapHits: Record<string, boolean> = {};
  for (const candidate of CANDIDATE_GAPS) {
    gapHits[candidate.key] = candidate.probes.some((probe) => haystack.includes(norm(probe)));
  }

  return { name, pages, words, chapterHits, requirementHits, gapHits };
}

const REQ_PROBES: Record<string, string[]> = {
  "R1.1": ["corporate identification number", "registered office"],
  "R1.2": ["main objects", "memorandum of association"],
  "R1.3": ["lead manager", "registrar to the issue"],
  "R1.4": ["compliance officer"],
  "R2.1": ["our business"],
  "R2.2": ["industry overview", "our industry"],
  "R2.3": ["customer concentration", "top customers", "our top 10 customers", "revenue from our top"],
  "R2.4": ["revenue from operations"],
  "R2.5": ["installed capacity", "manufacturing facility"],
  "R2.6": ["employees"],
  "R3.1": ["internal risk", "risk factors"],
  "R3.2": ["raw material"],
  "R3.3": [
    "customer concentration",
    "depend on our customers",
    "loss of any of our customers",
    "limited number of customers",
    "few customers",
    "top customers",
    "loss of one or more",
    "dependent on a limited number",
    "significant portion of our revenue",
    "substantial portion of our revenue",
  ],
  "R3.4": ["outstanding litigation"],
  "R3.5": ["external risk", "issue related risk", "offer related risk"],
  "R4.1": ["restated financial", "statement of profit and loss"],
  "R4.2": ["earnings per share", "return on net worth", "net asset value"],
  "R4.3": ["peer review", "statutory auditor"],
  "R4.4": ["revenue from operations"],
  "R5.1": ["shareholding pattern", "capital structure"],
  "R5.2": ["issue size", "face value"],
  "R5.3": ["objects of the issue", "objects of the offer"],
  "R5.4": ["net proceeds"],
  "R5.5": ["issue related expenses", "offer related expenses", "issue expenses"],
  "R5.6": ["market maker", "market making"],
  "R6.1": ["board of directors", "key managerial personnel"],
  "R6.2": ["related party transactions"],
  "R6.3": ["outstanding litigation", "material developments"],
  "R6.4": ["group companies"],
  "R6.5": ["audit committee", "nomination and remuneration committee"],
  "R6.6": ["remuneration"],
  "R7.1": ["draft red herring prospectus", "draft prospectus"],
  "R7.2": ["absolute responsibility"],
  "R7.3": ["general risk"],
  "R7.4": ["definitions and abbreviations", "abbreviations"],
  "R7.5": ["certain conventions", "presentation of financial"],
  "R7.6": ["forward looking statements", "forward-looking statements"],
  "R8.1": ["the issue", "fresh issue"],
  "R8.2": ["issue structure", "retail individual"],
  "R8.3": ["terms of the issue", "ranking of equity shares"],
  "R8.4": ["issue procedure", "asba"],
  "R8.5": ["underwriting", "market making"],
  "R9.1": ["qualitative factors"],
  "R9.2": ["quantitative factors"],
  "R9.3": ["comparison with listed", "peer group", "industry peer"],
  "R10.1": ["management s discussion", "management discussion"],
  "R10.2": ["significant factors affecting", "factors affecting our results"],
  "R10.3": ["financial indebtedness"],
  "R11.1": ["government and other approvals"],
  "R11.2": ["key regulations", "applicable laws and regulations"],
  "R11.3": ["disclaimer clause"],
  "R12.1": ["our promoters", "promoter group"],
  "R12.2": ["promoter s contribution", "promoters contribution", "lock in"],
  "R12.3": ["wilful defaulter", "willful defaulter"],
  "R13.1": ["dividend policy"],
  "R13.2": ["statement of possible tax benefits", "special tax benefits"],
  "R14.1": ["articles of association"],
  "R14.2": ["material contracts", "documents for inspection"],
  "R15.1": ["declaration"],
  "R16.1": ["foreign ownership", "fema"],

  // ---- Added in registry R3, each derived from this corpus. The probes are
  // the same ones that measured the gap in the first place, so re-running the
  // analysis confirms the additions rather than assuming them.
  "R2.7": ["intellectual property"],
  "R2.8": ["immovable propert", "our properties"],
  "R4.5": ["capitalisation statement", "capitalization statement"],
  "R5.7": ["monitoring agency", "monitoring of utilisation"],
  "R5.8": ["working capital requirement", "basis of working capital"],
  "R5.9": ["general corporate purpose"],
  "R5.10": ["issue related expenses", "offer related expenses", "issue expenses"],
  "R6.7": ["our subsidiaries", "subsidiaries of our company", "does not have any subsidiar"],
  "R7.7": ["summary of the offer document", "summary of offer document", "summary of the issue document"],
  "R9.4": ["key performance indicators", "kpi of our company"],
  "R9.5": ["weighted average cost of acquisition", "waca"],
  "R9.6": ["weighted average", "weighted average number of equity shares"],
  "R11.4": ["track record of the past issues", "price information of past issues"],
};

async function main() {
  const corpusDir = process.argv[2];
  const outDir = process.argv[3] ?? corpusDir;
  const cacheDir = path.join(outDir, "text-cache");
  fs.mkdirSync(cacheDir, { recursive: true });

  const pdfs = fs
    .readdirSync(corpusDir)
    .filter((file) => file.endsWith(".pdf"))
    .map((file) => path.join(corpusDir, file));

  console.log(`\n${BOLD}Drafter corpus analysis${RESET}`);
  console.log(`${DIM}${pdfs.length} filed SME DRHPs${RESET}\n`);

  const results: DocResult[] = [];
  for (const pdf of pdfs) {
    process.stdout.write(`  reading ${path.basename(pdf, ".pdf")}… `);
    const result = await analyseOne(pdf, cacheDir);
    if (result) {
      results.push(result);
      console.log(`${DIM}${result.pages} pp, ${result.words.toLocaleString()} w${RESET}`);
    }
  }

  const n = results.length;
  console.log(`\n${DIM}corpus: ${n} documents · ${results.reduce((s, r) => s + r.pages, 0).toLocaleString()} pages · ` +
    `${results.reduce((s, r) => s + r.words, 0).toLocaleString()} words${RESET}\n`);

  const pct = (count: number) => Math.round((count / n) * 100);
  const bar = (p: number, w = 20) => "█".repeat(Math.round((p / 100) * w)) + "░".repeat(w - Math.round((p / 100) * w));

  // ---- 1. Chapter coverage ------------------------------------------
  console.log(`${BOLD}1. Drafter's chapters, as a share of real filings that contain them${RESET}`);
  const chapterStats: { id: string; title: string; count: number; pct: number }[] = [];
  for (const section of structure.sections) {
    for (const chapter of section.chapters) {
      const count = results.filter((r) => r.chapterHits[chapter.id]).length;
      chapterStats.push({ id: chapter.id, title: chapter.title, count, pct: pct(count) });
    }
  }
  for (const stat of chapterStats) {
    const colour = stat.pct === 100 ? GREEN : stat.pct >= 70 ? YELLOW : RED;
    console.log(
      `  ${colour}${bar(stat.pct)}${RESET} ${String(stat.pct).padStart(3)}%  ${stat.id.padEnd(7)} ${stat.title.slice(0, 58)}`,
    );
  }
  const universal = chapterStats.filter((s) => s.pct === 100).length;
  console.log(`  ${DIM}${universal}/${chapterStats.length} of Drafter's chapters appear in EVERY filing in the corpus.${RESET}\n`);

  // ---- 2. Requirement coverage --------------------------------------
  console.log(`${BOLD}2. Drafter's requirements, as a share of filings evidencing them${RESET}`);
  const reqStats = allRequirements.map((requirement) => {
    const count = results.filter((r) => r.requirementHits[requirement.id]).length;
    return { id: requirement.id, text: requirement.requirement, count, pct: pct(count) };
  });
  // Not every requirement SHOULD show up in a filed document.
  //
  // A prohibition is discharged by the absence of the thing it prohibits: no
  // compliant filing proposes to repay a promoter loan out of issue proceeds,
  // so a 0% hit rate on R5.11 is the corpus AGREEING with the rule, not
  // evidence that the rule does not belong. And register (R2.9) is a property
  // of how the prose is written, which a keyword probe cannot see at all.
  // Scoring these alongside disclosure requirements would report the checker's
  // correct behaviour as a gap.
  const expectedAbsent = new Set(
    allRequirements.filter((r) => r.corpus_probe === "absence-expected").map((r) => r.id),
  );
  const notProbeable = new Set(
    allRequirements.filter((r) => r.corpus_probe === "not-keyword-detectable").map((r) => r.id),
  );
  const excluded = new Set([...expectedAbsent, ...notProbeable]);

  const scored = reqStats.filter((s) => !excluded.has(s.id));
  const weak = scored.filter((s) => s.pct < 70).sort((a, b) => a.pct - b.pct);
  const strong = scored.filter((s) => s.pct >= 70).length;
  console.log(`  ${GREEN}${strong}/${scored.length}${RESET} disclosure requirements evidenced in ≥70% of filings.`);
  if (weak.length) {
    console.log(`  ${YELLOW}Weakly evidenced — review whether the probe or the requirement is at fault:${RESET}`);
    for (const stat of weak) {
      console.log(`    ${String(stat.pct).padStart(3)}%  ${stat.id.padEnd(7)} ${stat.text.slice(0, 66)}`);
    }
  }

  const absent = reqStats.filter((s) => expectedAbsent.has(s.id));
  if (absent.length) {
    const violations = absent.filter((s) => s.count > 0);
    console.log(
      `  ${DIM}Excluded from the score — ${absent.length} prohibition(s), where absence is the compliant state:${RESET}`,
    );
    for (const stat of absent) {
      const colour = stat.count === 0 ? GREEN : RED;
      console.log(
        `    ${colour}${stat.count === 0 ? "none found" : stat.count + " filing(s) hit"}${RESET}  ` +
          `${stat.id.padEnd(7)} ${stat.text.slice(0, 60)}`,
      );
    }
    if (violations.length === 0) {
      console.log(`  ${DIM}No filing in the corpus breaches these, which is what a corpus of cleared drafts should show.${RESET}`);
    }
  }
  if (notProbeable.size) {
    console.log(
      `  ${DIM}Excluded from the score — ${notProbeable.size} requirement(s) about how prose is WRITTEN,` +
        ` which a keyword probe cannot measure: ${[...notProbeable].join(", ")}.${RESET}`,
    );
  }
  console.log("");

  // ---- 3. GAPS: what real filings have that Drafter does not ---------
  console.log(`${BOLD}3. ${CYAN}Present in real filings — does Drafter have a home for it?${RESET}`);
  const gapStats = CANDIDATE_GAPS.map((candidate) => {
    const count = results.filter((r) => r.gapHits[candidate.key]).length;
    return { ...candidate, count, pct: pct(count) };
  }).sort((a, b) => b.pct - a.pct);

  for (const stat of gapStats) {
    const colour = stat.pct >= 90 ? RED : stat.pct >= 60 ? YELLOW : DIM;
    console.log(`  ${colour}${bar(stat.pct)}${RESET} ${String(stat.pct).padStart(3)}%  ${stat.label}`);
  }
  console.log(
    `  ${DIM}Items at ≥90% are effectively universal in real filings. Any of those without a` +
      ` dedicated chapter or requirement in Drafter is a genuine structural gap.${RESET}\n`,
  );

  // ---- 4. Length distribution ---------------------------------------
  const lengths = results.map((r) => r.words).sort((a, b) => a - b);
  const pageCounts = results.map((r) => r.pages).sort((a, b) => a - b);
  const median = (arr: number[]) => arr[Math.floor(arr.length / 2)];
  console.log(`${BOLD}4. What a filed SME DRHP actually weighs${RESET}`);
  console.log(`  pages   min ${pageCounts[0]} · median ${median(pageCounts)} · max ${pageCounts[pageCounts.length - 1]}`);
  console.log(`  words   min ${lengths[0].toLocaleString()} · median ${median(lengths).toLocaleString()} · max ${lengths[lengths.length - 1].toLocaleString()}`);
  console.log("");

  // ---- 5. Does the house style differ between the two SME platforms? ---
  // Drafter is positioned upstream of BSE's pre-check, so a corpus drawn only
  // from NSE Emerge would be arguing about a document it had never seen. This
  // compares chapter presence across the two platforms: a chapter that is
  // universal on one and rare on the other is a house-style difference the
  // generator has to accommodate, not a gap.
  const bse = results.filter((r) => /_bse$/.test(r.name));
  const nse = results.filter((r) => !/_bse$/.test(r.name));
  console.log(`${BOLD}5. ${CYAN}NSE Emerge vs BSE SME — does the house style differ?${RESET}`);
  console.log(`  ${DIM}${nse.length} NSE Emerge · ${bse.length} BSE SME${RESET}`);

  if (bse.length === 0) {
    console.log(`  ${RED}No BSE SME filing in the corpus — the comparison cannot be made.${RESET}\n`);
  } else {
    const share = (docs: DocResult[], id: string) =>
      docs.length === 0 ? 0 : Math.round((docs.filter((r) => r.chapterHits[id]).length / docs.length) * 100);

    const divergent = chapterStats
      .map((stat) => ({ ...stat, nse: share(nse, stat.id), bse: share(bse, stat.id) }))
      .filter((stat) => Math.abs(stat.nse - stat.bse) >= 34)
      .sort((a, b) => Math.abs(b.nse - b.bse) - Math.abs(a.nse - a.bse));

    if (divergent.length === 0) {
      console.log(
        `  ${GREEN}No chapter differs by more than a third between the platforms.${RESET}\n` +
          `  ${DIM}Both follow Schedule VI closely enough that one document tree serves both.${RESET}\n`,
      );
    } else {
      for (const stat of divergent) {
        console.log(
          `  ${YELLOW}${String(stat.nse).padStart(3)}% NSE  vs ${String(stat.bse).padStart(3)}% BSE${RESET}  ` +
            `${stat.id.padEnd(7)} ${stat.title.slice(0, 52)}`,
        );
      }
      console.log(`  ${DIM}A wide split means the chapter is house style, not a Schedule VI requirement.${RESET}\n`);
    }
  }

  fs.writeFileSync(
    path.join(outDir, "corpus-result.json"),
    JSON.stringify(
      {
        documents: results.map((r) => ({ name: r.name, pages: r.pages, words: r.words })),
        chapterStats,
        requirementStats: reqStats,
        gapStats,
        lengths: { pages: pageCounts, words: lengths },
      },
      null,
      2,
    ),
  );
  console.log(`${GREEN}Wrote corpus-result.json to ${outDir}${RESET}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
