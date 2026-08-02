/**
 * Shared helpers for the generation engine and the gap checker.
 *
 * Everything here is deterministic and side-effect free so the engine can be
 * exercised from a plain Node script (`npm run verify`) without a browser.
 */

// ---------------------------------------------------------------------------
// Path access — the registry addresses issuer data by dotted path
// ---------------------------------------------------------------------------

/** Read a dotted path such as `business.revenue_stated` out of issuer data. */
export function getPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  return path.split(".").reduce((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return acc[key];
  }, obj);
}

/** Write a dotted path into an object, creating intermediate objects. */
export function setPath(obj: any, path: string, value: any): void {
  const keys = path.split(".");
  const last = keys.pop()!;
  let cursor = obj;
  for (const key of keys) {
    if (typeof cursor[key] !== "object" || cursor[key] === null) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[last] = value;
}

/**
 * Is a value meaningfully supplied?
 *
 * This is the single definition of "the issuer answered this", so it decides
 * every Complete/Partial/Missing verdict in the gap report. Empty strings,
 * empty arrays, nulls and whitespace all count as absent. Zero and `false` are
 * genuine answers and count as present.
 */
export function isPresent(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return !Number.isNaN(value);
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

/** Is this text an explicit denial such as "Nil" or "None"? */
export function isExplicitNil(value: any): boolean {
  if (typeof value !== "string") return false;
  const normalised = value
    .trim()
    .toLowerCase()
    .replace(/[.\s]+$/g, "");
  return [
    "nil",
    "none",
    "none pending",
    "not applicable",
    "n/a",
    "na",
    "no",
    "nil.",
    "none.",
    "there are none",
    "no pending litigation",
    "no related party transactions",
  ].includes(normalised);
}

// ---------------------------------------------------------------------------
// Number formatting — Indian conventions
// ---------------------------------------------------------------------------

/**
 * Group digits in the Indian system (last three, then pairs):
 * 7500000 -> "75,00,000". Offer documents use this throughout, and getting it
 * wrong is immediately visible to a securities-markets reader.
 */
export function formatIndianNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "–";
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return String(value);

  const negative = num < 0;
  const [intPart, decPart] = Math.abs(num).toString().split(".");

  let grouped: string;
  if (intPart.length <= 3) {
    grouped = intPart;
  } else {
    const lastThree = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree;
  }

  const out = decPart ? `${grouped}.${decPart}` : grouped;
  return negative ? `(${out})` : out;
}

/**
 * Format a rupee-crore amount to exactly two decimals with Indian grouping.
 *
 * The grouping is applied to the integer part and the decimals appended
 * directly — routing "21.00" through formatIndianNumber would coerce it back to
 * a Number and drop the trailing zeros, and a money figure in an offer document
 * must always carry two decimals.
 */
export function formatCrore(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "–";
  const num = Number(value);
  const negative = num < 0;
  const [intPart, decPart] = Math.abs(num).toFixed(2).split(".");
  const grouped =
    intPart.length <= 3
      ? intPart
      : intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + intPart.slice(-3);
  const out = `${grouped}.${decPart}`;
  return negative ? `(${out})` : out;
}

/**
 * Render a monetary amount with its unit in Indian convention:
 * money(19.75, "INR crore") -> "INR 19.75 crore".
 *
 * The registry stores the unit as a single string ("INR crore"); naively
 * prefixing it produces "INR crore 19.75", which reads wrong to anyone in this
 * market.
 */
export function money(value: number | null | undefined, unit?: string): string {
  const amount = formatCrore(value);
  if (!unit) return amount;
  const trimmed = unit.trim();
  const match = trimmed.match(/^(INR|Rs\.?|₹)\s*(.*)$/i);
  if (match) {
    const [, currency, scale] = match;
    return scale ? `${currency} ${amount} ${scale}` : `${currency} ${amount}`;
  }
  return `${amount} ${trimmed}`;
}

/** Format a percentage to one decimal place. */
export function formatPct(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "–";
  return `${Number(value).toFixed(decimals)}%`;
}

/** Percentage difference of `a` from `b`, guarding against division by zero. */
export function pctDiff(a: number, b: number): number {
  const denominator = Math.abs(b) < 1e-9 ? 1e-9 : Math.abs(b);
  return (Math.abs(a - b) / denominator) * 100;
}

/** Sum a numeric key across an array of objects. */
export function sumBy<T>(rows: T[], key: keyof T | string): number {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((total, row) => {
    const raw = (row as any)?.[key];
    const num = Number(raw);
    return total + (Number.isFinite(num) ? num : 0);
  }, 0);
}

/** Round to `places` decimals, avoiding floating-point noise like 22.499999. */
export function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/** Count words in a block of prose, for the per-chapter statistics. */
export function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Sentence-safe truncation for summaries and chips. */
export function truncate(text: string, max: number): string {
  if (!text || text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Split a semi-structured answer into individual entries.
 * Promoters type lists as "1) A — 28% 2) B — 22%" or as newline/semicolon
 * separated text; all three shapes are common and all must render as a list.
 */
export function splitEntries(text: string | null | undefined): string[] {
  if (!text || typeof text !== "string") return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Numbered form: "1) ... 2) ..." or "1. ... 2. ..."
  if (/(^|\s)\d+[).]\s/.test(trimmed)) {
    return trimmed
      .split(/(?:^|\s)\d+[).]\s+/)
      .map((s) => s.trim().replace(/[;.]$/, ""))
      .filter(Boolean);
  }

  // Newline or semicolon separated
  if (trimmed.includes("\n") || trimmed.includes(";")) {
    return trimmed
      .split(/[\n;]+/)
      .map((s) => s.trim().replace(/[;.]$/, ""))
      .filter(Boolean);
  }

  return [trimmed];
}

/** Title-case a sentence fragment for use as a heading. */
export function toSentence(text: string): string {
  if (!text) return "";
  const trimmed = text.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** Ensure prose ends with a full stop. */
export function ensurePeriod(text: string): string {
  const trimmed = (text || "").trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : trimmed + ".";
}

/**
 * Case-insensitive scan for concept keywords, used by the red-flag checks to
 * detect a matter referenced in free text but absent from the formal answer.
 */
export function containsAny(haystack: string | null | undefined, needles: string[]): string[] {
  if (!haystack || typeof haystack !== "string") return [];
  const lower = haystack.toLowerCase();
  return needles.filter((needle) => lower.includes(needle.toLowerCase()));
}
