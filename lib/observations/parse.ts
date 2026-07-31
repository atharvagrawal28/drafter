/**
 * Split a pasted exchange observation letter into individual observations.
 *
 * Runs entirely in the browser. An observation letter names an unlisted issuer
 * and the defects in its draft offer document — it is about as price-sensitive
 * as a document gets, and there is no reason for it to reach a server to be
 * split on its numbering. Same guardrail as the rest of the session state.
 *
 * Exchanges do not share a house style, so the parser recognises the numbering
 * forms that actually appear rather than one canonical shape: "1.", "1)",
 * "(1)", "1(a)", "i.", "a)", and an explicit "Observation 3:". What it will not
 * do is guess — a letter it cannot split returns one observation containing the
 * whole text, which reads obviously wrong to the user rather than silently
 * dropping half their letter.
 */

import type { ParsedObservation } from "./types";

/**
 * Lines that are letterhead, salutation or sign-off rather than observations.
 * Kept deliberately short: over-filtering silently deletes a real observation,
 * which is far worse than showing one line of letterhead.
 */
const BOILERPLATE = [
  /^(dear|to|from|ref|date|subject|sub|re)\b[:.]?/i,
  /^(yours|thanking you|for and on behalf|encl|cc)\b/i,
  /^(national stock exchange|bse limited|bombay stock exchange)\b/i,
  /^page \d+/i,
];

/**
 * An enumerator at the start of a line. The trailing lookahead requires
 * whitespace then a letter, so "1997 was a good year" is not read as item 1997
 * and "(i) the Company" is.
 */
const ENUMERATOR =
  /^\s{0,8}(?:observation\s+)?(\(?(?:\d{1,3}(?:\.\d{1,2})?|[ivxl]{1,5}|[a-z])\)?)\s*[.):\]]\s+(?=[A-Za-z"“'(])/i;

/**
 * Roman/alpha enumerators are ambiguous — "I." starts a sentence as often as it
 * starts a list. They are only accepted once a numeric list has already begun,
 * which is how they appear in practice: 1, 2, 3(a), 3(b).
 */
function isNumeric(label: string): boolean {
  return /^\(?\d/.test(label);
}

export function parseObservations(raw: string): ParsedObservation[] {
  if (!raw || typeof raw !== "string") return [];

  const lines = raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !BOILERPLATE.some((pattern) => pattern.test(line)));

  const items: ParsedObservation[] = [];
  let seenNumeric = false;

  for (const line of lines) {
    const match = line.match(ENUMERATOR);
    const label = match?.[1]?.replace(/[()]/g, "");

    const startsItem =
      match !== null && label !== undefined && (isNumeric(label) || seenNumeric);

    if (startsItem) {
      if (isNumeric(label!)) seenNumeric = true;
      items.push({ label: label!, text: line.slice(match![0].length).trim() });
      continue;
    }

    // A continuation of the observation above. Exchange letters wrap freely and
    // the operative clause is as often on the second line as the first, so
    // dropping continuations would throw away most of the matchable text.
    if (items.length > 0) {
      items[items.length - 1].text = `${items[items.length - 1].text} ${line}`.trim();
    }
  }

  // Nothing recognisable as a list. Return the letter as a single observation
  // rather than an empty result: a visibly unsplit block tells the user the
  // parse failed, whereas "0 observations found" reads like a clean letter.
  if (items.length === 0) {
    const text = lines.join(" ").trim();
    return text ? [{ label: "1", text }] : [];
  }

  // Fragments shorter than this cannot carry a matchable requirement and are
  // almost always a stray heading that happened to start with a numeral.
  return items.filter((item) => item.text.length >= 15);
}
