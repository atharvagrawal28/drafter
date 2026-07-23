/**
 * Financials extraction — verification.
 *
 * The extractor writes straight into the issuer record, so a mis-read row does
 * not surface as an error, it surfaces as a wrong figure in an offer document.
 * This exercises it against a realistic restated-financials layout and against
 * rows designed to be mistaken for one.
 *
 * Usage: tsx scripts/verify-extract.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

let failures = 0;
function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ${GREEN}PASS${RESET}  ${label}`);
  } else {
    failures += 1;
    console.log(`  ${RED}FAIL${RESET}  ${label}`);
    if (detail) console.log(`        ${DIM}${detail}${RESET}`);
  }
}

/** A restated-financials sheet as an SME issuer's auditor would lay it out. */
const SHEET = [
  ["Sundaram Facility Services Limited"],
  ["Restated Statement of Profit and Loss", "", "", ""],
  ["(INR in crore)", "FY24", "FY25", "FY26"],
  ["Revenue from operations", "31.20", "38.75", "45.60"],
  ["Other income", "0.18", "0.22", "0.31"],
  ["EBITDA", "2.10", "2.94", "3.86"],
  ["Profit after tax", "0.94", "1.36", "1.88"],
  ["Earnings per share (basic)", "2.35", "3.40", "4.70"],
  ["Return on net worth (%)", "12.10", "14.30", "15.90"],
  ["Net worth", "7.76", "9.50", "11.83"],
  ["Total assets", "18.40", "22.90", "27.60"],
  ["Total borrowings", "2.10", "2.80", "3.40"],
  ["Net cash from operating activities", "1.02", "1.55", "2.11"],
  ["Number of employees", "1450"],
];

async function main() {
  console.log(`\n${BOLD}Financials extraction${RESET}\n`);

  const XLSX = await import("xlsx");
  const dir = join(tmpdir(), "drafter-verify-extract");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "restated.xlsx");

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(SHEET), "Restated");
  XLSX.writeFile(workbook, path);

  const buffer = readFileSync(path);
  const file = new File([new Uint8Array(buffer)], "restated.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const form = new FormData();
  form.append("file", file);

  const { POST } = await import("../app/api/extract/route");
  const response = await POST(new Request("http://localhost/api/extract", { method: "POST", body: form }) as any);
  const payload = await response.json();

  if (!response.ok) {
    assert(false, "extractor returns 200", JSON.stringify(payload));
    return;
  }

  const got = payload.extracted as Record<string, any>;
  for (const line of payload.log as string[]) console.log(`  ${DIM}${line}${RESET}`);
  console.log("");

  const eq = (path: string, expected: any) =>
    assert(
      JSON.stringify(got[path]) === JSON.stringify(expected),
      `${path} = ${JSON.stringify(expected)}`,
      `got ${JSON.stringify(got[path])}`,
    );

  eq("financials.years", ["FY24", "FY25", "FY26"]);
  eq("financials.revenue_3yr", [31.2, 38.75, 45.6]);
  eq("financials.pat_3yr", [0.94, 1.36, 1.88]);
  eq("financials.eps_3yr", [2.35, 3.4, 4.7]);
  eq("financials.ronw_3yr", [12.1, 14.3, 15.9]);
  eq("financials.networth_3yr", [7.76, 9.5, 11.83]);
  eq("financials.cash_flow_ops_3yr", [1.02, 1.55, 2.11]);
  eq("financials.ebitda_3yr", [2.1, 2.94, 3.86]);
  eq("financials.total_assets_3yr", [18.4, 22.9, 27.6]);
  eq("financials.borrowings_3yr", [2.1, 2.8, 3.4]);

  // Latest-year scalars must stay consistent with the tail of their series.
  eq("financials.revenue_latest_year", 45.6);
  eq("financials.pat_latest_year", 1.88);

  // A single-figure row must not become a series.
  assert(
    !("financials.employees_3yr" in got) && got["financials.years"].length === 3,
    "a one-cell row is not mistaken for a series",
  );

  // The promoter's own assertion must survive untouched — this is the field the
  // R2.4 revenue reconciliation compares against.
  assert(
    !("business.revenue_stated" in got),
    "extractor never writes business.revenue_stated (would erase the R2.4 defect)",
  );

  assert(payload.seriesFound >= 7, `reports the series count (${payload.seriesFound})`);

  // Now the same table with no header row: the series must be withheld rather
  // than guessed, because an unlabelled series cannot be printed.
  const headerless = SHEET.filter((row) => !row.includes("FY24"));
  const wb2 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet(headerless), "Restated");
  const path2 = join(dir, "headerless.xlsx");
  XLSX.writeFile(wb2, path2);
  const form2 = new FormData();
  form2.append("file", new File([new Uint8Array(readFileSync(path2))], "headerless.xlsx"));
  const response2 = await POST(new Request("http://localhost/api/extract", { method: "POST", body: form2 }) as any);
  const payload2 = await response2.json();
  console.log("");
  assert(
    payload2.extracted["financials.revenue_latest_year"] === 45.6,
    "headerless sheet still yields the latest-year figures",
  );
  assert(
    !("financials.years" in payload2.extracted),
    "headerless sheet reports no year labels rather than inventing them",
    JSON.stringify(payload2.extracted["financials.years"]),
  );

  console.log("");
  if (failures === 0) console.log(`${GREEN}${BOLD}All extraction checks passed.${RESET}\n`);
  else {
    console.log(`${RED}${BOLD}${failures} check(s) failed.${RESET}\n`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
