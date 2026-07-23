import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Financials extraction.
 *
 * Reads an uploaded Excel, CSV or PDF and pulls out the summary figures Drafter
 * needs — at minimum the latest-year revenue, which then feeds the gap check.
 * The extractor is deliberately conservative: it reports what it is confident of
 * and leaves the rest to the promoter, because a wrong figure lifted from a
 * spreadsheet is worse than no figure.
 *
 * Nothing is persisted. The file is parsed in memory and discarded.
 */

interface Extracted {
  [path: string]: number | string | number[] | string[];
}

/**
 * Uploaded financials populate the AUDITED side of the record only.
 *
 * In particular the revenue figure must never overwrite
 * `business.revenue_stated` — that field is what the promoter asserted in the
 * business chapter, and the whole point of the R2.4 reconciliation is to
 * compare the two. Overwriting the assertion with the audited figure would
 * silently erase a genuine inconsistency instead of reporting it.
 *
 * `series` captures the whole three-year row, not just its last cell. An offer
 * document is a three-year document — the restated statements (R4.1), the
 * capitalisation statement (R4.5), the weighted-average EPS and RoNW (R9.6) and
 * the MD&A (R10.1) are all series disclosures, and none of them can be
 * discharged from a single latest-year figure. Reading the series the promoter
 * has already uploaded is far better than asking them to key it in again.
 */
const LABELS: {
  latest?: string;
  series?: string;
  keywords: string[];
  kind: "money" | "ratio" | "text";
}[] = [
  { latest: "financials.revenue_latest_year", series: "financials.revenue_3yr", keywords: ["revenue from operations", "total revenue", "revenue", "total income", "turnover", "sales"], kind: "money" },
  { latest: "financials.pat_latest_year", series: "financials.pat_3yr", keywords: ["profit after tax", "pat", "net profit", "profit for the year"], kind: "money" },
  { latest: "financials.eps", series: "financials.eps_3yr", keywords: ["earnings per share", "eps", "basic eps"], kind: "ratio" },
  { latest: "financials.ronw_pct", series: "financials.ronw_3yr", keywords: ["return on net worth", "ronw", "ronw %", "return on equity"], kind: "ratio" },
  { latest: "financials.nav_per_share", keywords: ["net asset value", "nav per share", "nav", "book value per share"], kind: "ratio" },
  { series: "financials.networth_3yr", keywords: ["net worth", "networth", "shareholders funds", "shareholders' funds", "total equity"], kind: "money" },
  { series: "financials.cash_flow_ops_3yr", keywords: ["net cash from operating activities", "cash flow from operations", "cash generated from operations", "net cash generated from operating"], kind: "money" },
  { series: "financials.ebitda_3yr", keywords: ["ebitda", "operating profit"], kind: "money" },
  { series: "financials.total_assets_3yr", keywords: ["total assets"], kind: "money" },
  { series: "financials.borrowings_3yr", keywords: ["total borrowings", "borrowings"], kind: "money" },
];

/**
 * Column headers of a financial table, e.g. ["FY24", "FY25", "FY26"].
 *
 * The series is meaningless without them: "31.2, 38.75, 45.6" needs to be
 * labelled before it can be printed in a restated statement. Only a row whose
 * cells are predominantly year-like is accepted, so an ordinary data row is
 * never mistaken for a header.
 */
const YEAR_PATTERNS = [
  /^fy\s?\d{2,4}(-\d{2,4})?$/i,
  /^\d{4}-\d{2,4}$/,
  /^(19|20)\d{2}$/,
  /^(31|30)[\s.\/-]*(st)?\s*(march|mar|dec|december)[\s.,\/-]*(19|20)?\d{2,4}$/i,
  /^(march|mar|dec|december)[\s.,\/-]*(31|30)?[\s.,\/-]*(19|20)?\d{2,4}$/i,
];

function isYearToken(cell: string): boolean {
  const value = cell.replace(/[*†#()]/g, "").trim();
  if (!value) return false;
  return YEAR_PATTERNS.some((pattern) => pattern.test(value));
}

function detectYears(rows: string[][]): string[] | null {
  for (const row of rows) {
    const cells = row.slice(1).map((cell) => String(cell ?? "").trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const yearCells = cells.filter(isYearToken);
    // Predominantly year-like, and at least two — otherwise it is a data row
    // that happens to contain something that parses as a year.
    if (yearCells.length >= 2 && yearCells.length >= cells.length - 1) {
      return yearCells.slice(-3);
    }
  }
  return null;
}

/**
 * The single line item a row label refers to, or null.
 *
 * Specificity beats declaration order: an exact label beats a prefix, which
 * beats a substring, and a longer keyword beats a shorter one. That is what
 * keeps "Return on net worth" out of the net-worth series.
 */
function bestMatch(label: string): (typeof LABELS)[number] | null {
  let best: { spec: (typeof LABELS)[number]; score: number; length: number } | null = null;

  for (const spec of LABELS) {
    for (const keyword of spec.keywords) {
      const score = label === keyword ? 3 : label.startsWith(keyword) ? 2 : label.includes(keyword) ? 1 : 0;
      if (score === 0) continue;
      if (!best || score > best.score || (score === best.score && keyword.length > best.length)) {
        best = { spec, score, length: keyword.length };
      }
    }
  }

  return best?.spec ?? null;
}

function parseNumberToken(token: string): number | null {
  const cleaned = token.replace(/[,()₹%]/g, "").replace(/inr/gi, "").trim();
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return token.includes("(") ? -num : num;
}

/**
 * From a row like ["Revenue from operations", "61.20", "70.40", "78.90"] take
 * both the latest-year figure and the series. DRHP tables are laid out
 * oldest-to-newest left to right, so the last numeric cell is the latest year
 * and the last three are the restated period.
 */
function extractFromRows(rows: string[][]): { extracted: Extracted; log: string[] } {
  const extracted: Extracted = {};
  const log: string[] = [];

  const years = detectYears(rows);
  if (years) {
    extracted["financials.years"] = years;
    log.push(`Read column headers → ${years.join(", ")}`);
  }

  for (const row of rows) {
    if (!row.length) continue;
    const label = String(row[0] ?? "").toLowerCase().trim();
    if (!label) continue;

    // A row discharges at most ONE line item, and it is the most specific match.
    // "Return on net worth (%)" contains "net worth", so without this it would
    // populate the RoNW series and then be read a second time as the net-worth
    // series — putting a percentage into a rupee field.
    const spec = bestMatch(label);
    {
      if (!spec) continue;
      const targets = [spec.latest, spec.series].filter(Boolean) as string[];
      if (targets.every((path) => path in extracted)) continue;

      const numbers = row
        .slice(1)
        .map((cell) => parseNumberToken(String(cell)))
        .filter((value): value is number => value !== null);
      if (!numbers.length) continue;

      const latest = numbers[numbers.length - 1];
      const parts: string[] = [];

      if (spec.latest && !(spec.latest in extracted)) {
        extracted[spec.latest] = latest;
        parts.push(`${spec.latest} = ${latest}`);
      }

      // A series needs at least two periods to be one, and must line up with
      // the detected headers — a four-figure row under three year columns is
      // carrying something extra (a total, a variance) and is not trustworthy.
      if (spec.series && !(spec.series in extracted) && numbers.length >= 2) {
        const wanted = years?.length ?? 3;
        if (numbers.length >= wanted) {
          const series = numbers.slice(-wanted);
          extracted[spec.series] = series;
          parts.push(`${spec.series} = [${series.join(", ")}]`);
        }
      }

      if (parts.length) log.push(`Matched "${row[0]}" → ${parts.join("; ")}`);
    }
  }

  return { extracted, log };
}

/** Fallback for unstructured PDF text: scan lines for a labelled figure. */
function extractFromText(text: string): { extracted: Extracted; log: string[] } {
  const lines = text.split(/\n+/);
  const rows = lines.map((line) => {
    const numbers = line.match(/\(?[\d,]+\.?\d*\)?/g) ?? [];
    const label = line.replace(/\(?[\d,]+\.?\d*\)?/g, "").trim();
    return [label, ...numbers];
  });
  return extractFromRows(rows);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file supplied" }, { status: 400 });
  }

  const name = (file as File).name ?? "upload";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const buffer = Buffer.from(await (file as File).arrayBuffer());

  try {
    let result: { extracted: Extracted; log: string[] };

    if (ext === "xlsx" || ext === "xls" || ext === "csv") {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const rows: string[][] = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const sheetRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false });
        for (const row of sheetRows) rows.push((row as any[]).map((cell) => String(cell ?? "")));
      }
      result = extractFromRows(rows);
    } else if (ext === "pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractText(pdf, { mergePages: true });
      result = extractFromText(Array.isArray(text) ? text.join("\n") : text);
    } else {
      return NextResponse.json(
        { error: `Unsupported file type ".${ext}". Upload an Excel, CSV or PDF.` },
        { status: 415 },
      );
    }

    const revenueFound = "financials.revenue_latest_year" in result.extracted;
    const seriesFound = Object.keys(result.extracted).filter((path) => path.endsWith("_3yr")).length;
    const yearsFound = (result.extracted["financials.years"] as string[] | undefined)?.length ?? 0;

    return NextResponse.json({
      filename: name,
      extracted: result.extracted,
      fieldsFound: Object.keys(result.extracted).length,
      revenueFound,
      seriesFound,
      log: result.log,
      note: revenueFound
        ? `Read ${Object.keys(result.extracted).length} field(s) from ${name}` +
          (seriesFound
            ? `, including ${seriesFound} ${yearsFound ? `${yearsFound}-year` : "multi-year"} series, which discharge the restated-financials, capitalisation and weighted-average disclosures`
            : `, including the latest-year revenue, which now feeds the gap check`) +
          `. Verify every figure against the source document.`
        : `Parsed ${name} but could not confidently identify the revenue line. Key the summary figures in manually — a wrong figure lifted automatically is worse than one you enter yourself.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Could not read ${name}: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 500 },
    );
  }
}
