/**
 * Regulation Watch — verification.
 *
 * The live SEBI feed carries only about thirty items, roughly three days of
 * output, and an ICDR circular is rare in any given window. So the classifier
 * cannot be tested by pointing it at the feed and looking: on most days the
 * correct answer is "nothing relevant", which is indistinguishable from a
 * classifier that never matches anything.
 *
 * It is therefore tested against fixtures — titles in the style SEBI actually
 * publishes — with the NEGATIVE cases carrying at least as much weight as the
 * positive ones. A watch panel that cries wolf on every recovery certificate is
 * the failure mode that got the previous version of this feature ignored.
 *
 * Usage: tsx scripts/verify-watch.ts [--live]
 */

import { parseFeed, parseSebiDate } from "../lib/circulars/feed";
import { buildWatch, classify } from "../lib/circulars/relevance";
import type { FeedItem, Relevance } from "../lib/circulars/types";

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

const item = (title: string, description = ""): FeedItem => ({
  title,
  description,
  link: "https://www.sebi.gov.in/",
  rawDate: "23 Jul, 2026 +0530",
  publishedAt: "2026-07-23",
});

/** [title, expected relevance, requirement IDs that must be mapped] */
const CASES: [string, Relevance, string[]][] = [
  // -- must be surfaced, and mapped --------------------------------------
  [
    "Amendments to SEBI (Issue of Capital and Disclosure Requirements) Regulations, 2018 — Chapter IX",
    "chapter-ix",
    [],
  ],
  [
    "Revised framework for issues by Small and Medium Enterprises on the SME platform",
    "chapter-ix",
    [],
  ],
  [
    "Monitoring agency requirement for issue proceeds — clarification",
    "icdr",
    ["R5.7"],
  ],
  [
    "Disclosure of Key Performance Indicators in the offer document",
    "icdr",
    ["R9.4"],
  ],
  [
    "Cap on general corporate purposes in the objects of the issue",
    "icdr",
    ["R5.9"],
  ],
  [
    "Minimum promoters' contribution and lock-in — clarification for SME issues",
    "chapter-ix",
    ["R12.2"],
  ],
  [
    "Streamlining disclosure of related party transactions by listed entities",
    "market-wide",
    ["R6.2"],
  ],

  // -- must NOT be surfaced ---------------------------------------------
  ["Appeal No. 6949 of 2026 filed by Anand Mishra", "not-relevant", []],
  [
    "Completion of Recovery Certificate No. 3331 of 2021 issued to a defaulter in the matter of a company",
    "not-relevant",
    [],
  ],
  ["Adjudication Order in the matter of Eastern Financiers Limited", "not-relevant", []],
  ["Notice(s) of Attachment dated July 22, 2026 issued under RC No. 9186 of 2026", "not-relevant", []],
  ["Order in the matter of certain Investment Advisers", "not-relevant", []],
  ["Certification Requirements for Distribution of Specialized Investment Funds (SIFs)", "not-relevant", []],
  ["Request for Proposal for Sale of Properties in Pune, Maharashtra", "not-relevant", []],
];

async function main() {
  console.log(`\n${BOLD}Regulation Watch — classification${RESET}\n`);

  for (const [title, expected, requirementIds] of CASES) {
    const result = classify(item(title), "2025-03-08");
    assert(
      result.relevance === expected,
      `${expected.padEnd(13)} ${title.slice(0, 62)}`,
      `got "${result.relevance}"`,
    );
    for (const id of requirementIds) {
      assert(
        result.requirementIds.includes(id),
        `  maps to ${id}`,
        `mapped: ${result.requirementIds.join(", ") || "none"}`,
      );
    }
  }

  // An enforcement item that happens to mention an ICDR term must still be
  // excluded — the exclusion list is checked first for exactly this reason.
  console.log("");
  const trap = classify(
    item("Adjudication Order in the matter of a public issue by an SME company on the SME platform"),
    "2025-03-08",
  );
  assert(trap.relevance === "not-relevant", "enforcement wording beats topic wording", `got "${trap.relevance}"`);

  // ---- Date handling --------------------------------------------------
  console.log(`\n${BOLD}Date handling${RESET}`);
  assert(parseSebiDate("23 Jul, 2026 +0530") === "2026-07-23", "parses SEBI's non-standard date format");
  assert(parseSebiDate("08 Mar, 2025 +0530") === "2025-03-08", "parses a date on the registry boundary");
  assert(parseSebiDate("not a date") === null, "returns null rather than a wrong date");

  // An unparseable date must NOT be treated as newer than the registry, or the
  // panel raises a false alarm that the rule set is stale.
  const undated = classify(
    { ...item("Amendments to the ICDR Regulations"), publishedAt: null, rawDate: "" },
    "2025-03-08",
  );
  assert(!undated.newerThanRegistry, "an undated item is not claimed to be newer than the registry");

  const boundary = classify(
    { ...item("Amendments to the ICDR Regulations"), publishedAt: "2025-03-08" },
    "2025-03-08",
  );
  assert(!boundary.newerThanRegistry, "an item dated exactly as-at is not newer");

  // ---- Feed parsing ---------------------------------------------------
  console.log(`\n${BOLD}Feed parsing${RESET}`);
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>SEBI</title>
    <item><title><![CDATA[Amendments to the ICDR Regulations & Schedule VI]]></title>
      <link>https://www.sebi.gov.in/a.html</link>
      <description><![CDATA[<p>Chapter IX &amp; SME platform</p>]]></description>
      <pubDate>08 Mar, 2025 +0530</pubDate></item>
    <item><title>Appeal No. 1 of 2026</title><link>b</link><description/><pubDate>01 Jan, 2026 +0530</pubDate></item>
  </channel></rss>`;
  const parsed = parseFeed(xml);
  assert(parsed.length === 2, `parses both items (${parsed.length})`);
  assert(
    parsed[0].title === "Amendments to the ICDR Regulations & Schedule VI",
    "unwraps CDATA and decodes entities",
    parsed[0].title,
  );
  assert(parsed[0].description === "Chapter IX & SME platform", "strips markup from descriptions", parsed[0].description);
  assert(parsed[0].publishedAt === "2025-03-08", "reads pubDate");

  const watch = buildWatch(parsed);
  assert(watch.items.length === 1 && watch.filteredOut === 1, "the watch keeps 1 and filters 1");
  assert(watch.totalFetched === 2 && !!watch.registryVersion, "reports what it read and against which registry");

  // ---- Fails soft -----------------------------------------------------
  const failed = buildWatch([], "SEBI's feed did not respond in time.");
  assert(failed.items.length === 0 && !!failed.error, "a feed failure yields an empty, explained result");

  // ---- Optional live check --------------------------------------------
  if (process.argv.includes("--live")) {
    console.log(`\n${BOLD}Live feed${RESET}`);
    try {
      const { fetchFeed } = await import("../lib/circulars/feed");
      const live = await fetchFeed();
      assert(live.length > 0, `SEBI feed reachable (${live.length} items)`);
      assert(
        live.every((entry) => entry.title.length > 0),
        "every live item has a title",
      );
      const dated = live.filter((entry) => entry.publishedAt !== null).length;
      assert(dated / live.length > 0.9, `dates parse for ${dated}/${live.length} live items`);
    } catch (error) {
      console.log(`  ${DIM}skipped — ${(error as Error).message}${RESET}`);
    }
  }

  console.log("");
  if (failures === 0) console.log(`${GREEN}${BOLD}All regulation-watch checks passed.${RESET}\n`);
  else {
    console.log(`${RED}${BOLD}${failures} check(s) failed.${RESET}\n`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
