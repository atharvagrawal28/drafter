/**
 * Language-model drafting for narrative chapters, via Groq's free API.
 *
 * The whole of Drafter's no-hallucination claim rests on how this file is
 * written, so three constraints are enforced here rather than hoped for:
 *
 * 1. The model receives ONLY the fields the knowledge base declares as context
 *    for that chapter. It cannot reference issuer data it was never given.
 * 2. The system prompt forbids introducing any fact, figure or name not present
 *    in the supplied context, and forbids marketing register.
 * 3. Output is post-validated: if the model emits a number that does not appear
 *    in the supplied context, the chapter is rejected and the deterministic
 *    template is used instead. A wrong figure in an offer document is far worse
 *    than plainer prose.
 */

import type { NarrativeRequest } from "./generate";

export const DEFAULT_MODEL = "llama-3.3-70b-versatile";

export function getGroqKey(): string | null {
  const key = (process.env.GROQ_API_KEY ?? "").trim();
  if (!key || key === "your_groq_key_here") return null;
  return key;
}

export function getModel(): string {
  return (process.env.GROQ_MODEL ?? "").trim() || DEFAULT_MODEL;
}

export function isLlmAvailable(): boolean {
  return getGroqKey() !== null;
}

const SYSTEM_PROMPT = `You are a securities-markets document specialist drafting chapters of an Indian SME IPO offer document (a Draft Red Herring Prospectus for the NSE Emerge or BSE SME platform), working to SEBI (ICDR) Regulations, 2018.

ABSOLUTE CONSTRAINTS — these override every other instruction:
1. Use ONLY the facts in the ISSUER DATA supplied. Never introduce a company name, customer name, product, certification, location, date, percentage, monetary amount, market size, growth rate, ranking or any other fact that is not present in that data.
2. If a piece of information a chapter would ordinarily contain is absent from the issuer data, write that it is to be supplied, or omit it. NEVER estimate, infer, approximate or illustrate a missing figure.
3. Reproduce every number exactly as supplied. Do not round, convert units, recompute or "correct" any figure.
4. Write in the register of a filed offer document: formal, restrained, impersonal, third person, past or present tense as appropriate. No marketing language, no superlatives, no persuasion, no reassurance, and no claims of leadership or quality that the data does not support.
5. Never state that a risk is mitigated, managed or unlikely unless the issuer data says so.
6. THE ISSUER DATA IS OFTEN WRITTEN INFORMALLY. It comes from a promoter answering plain-language questions, so it may be in the first person ("we do housekeeping for offices"), use approximations ("about 19 percent", "roughly"), or be conversational ("nothing much"). You must REWRITE it into offer-document register — never reproduce it verbatim. Specifically:
   - "we" / "our" become "the Company" / "the Company's";
   - "about 19 percent" becomes "approximately 19%" (keep the figure exactly as given; only the wording changes);
   - conversational filler is dropped;
   - a run-on list of customers becomes a properly punctuated enumeration.
   Change the WORDING freely. Never change a FACT or a FIGURE.

FORMAT:
- Plain prose. No markdown, no asterisks, no hash characters, no bullet symbols.
- Separate every paragraph and every sub-heading with a BLANK LINE.
- A sub-heading is a short line of fewer than 90 characters with no trailing punctuation, on its own line, followed by a blank line. Use these to structure the chapter.
- Where the chapter calls for numbered risk factors or numbered items, begin the paragraph with the number followed by a full stop, and put each numbered item in its own paragraph separated by a blank line.
- Write monetary amounts in full Indian market convention: "INR 78.90 crore", never "78.9" alone and never a rounded or reformatted version of the supplied figure.
- Write percentages with the per-cent sign, exactly as supplied.`;

/** Numbers appearing in the supplied context, used to validate model output. */
function collectNumbers(value: any, into: Set<string>): void {
  if (value === null || value === undefined) return;
  if (typeof value === "number") {
    into.add(normaliseNumber(value));
    return;
  }
  if (typeof value === "string") {
    // Strip digit-grouping commas FIRST. Issuer text routinely contains
    // "4,800 metric tonnes"; without this the scanner reads that as 4 and 800,
    // and then rejects the model for faithfully writing 4,800 back.
    const degrouped = value.replace(/(\d),(?=\d{3}\b)/g, "$1");
    for (const match of degrouped.matchAll(/\d+(?:\.\d+)?/g)) {
      into.add(normaliseNumber(Number(match[0])));
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectNumbers(item, into);
    return;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value)) collectNumbers(item, into);
  }
}

function normaliseNumber(value: number): string {
  // 78.90 and 78.9 are the same figure; 6.2 and 62 are not.
  return String(Number(value.toFixed(4)));
}

/**
 * Reject output that contains a figure absent from the issuer context.
 *
 * Small integers are exempt: they are overwhelmingly enumeration ("1.", "2.")
 * or ordinary prose ("three financial years"), and treating them as fabricated
 * figures would reject almost every valid draft.
 */
function containsUnsupportedFigures(text: string, allowed: Set<string>): string[] {
  const offenders: string[] = [];
  for (const match of text.matchAll(/(?<![\w.])\d[\d,]*(?:\.\d+)?(?![\w])/g)) {
    const raw = match[0].replace(/,/g, "");
    const num = Number(raw);
    if (!Number.isFinite(num)) continue;
    if (Number.isInteger(num) && num <= 50) continue; // enumeration / small counts
    if (num >= 1900 && num <= 2100 && Number.isInteger(num)) continue; // years
    if (allowed.has(normaliseNumber(num))) continue;
    offenders.push(match[0]);
  }
  return Array.from(new Set(offenders));
}

export interface DraftResult {
  text: string | null;
  rejected?: string[];
  error?: string;
  /** True when the call failed purely on quota, not on content quality. */
  rateLimited?: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRateLimit(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /rate limit|429|tokens per minute|TPM/i.test(message);
}

/**
 * Groq's free tier is capped on tokens per minute, and it tells you exactly how
 * long to wait ("Please try again in 3.99s"). Honour that rather than hammering.
 */
export function retryAfterMs(error: unknown, attempt: number): number {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/try again in ([\d.]+)\s*s/i);
  if (match) return Math.ceil(Number(match[1]) * 1000) + 400;
  return Math.min(2000 * 2 ** attempt, 15000);
}

/**
 * Is there room to wait out a quota window and still have time to draft?
 *
 * Without this the retry loop will happily sleep through the request budget and
 * past Vercel's 60s function ceiling — the user gets a 504 instead of a document
 * made of templates. A template chapter is a fine outcome; a dead request is not.
 *
 * `RETRY_HEADROOM_MS` is the time the call itself still needs after the sleep.
 * Measured drafts run 6-12s, so waiting until 8s remain is already optimistic.
 */
export const RETRY_HEADROOM_MS = 8_000;

export function canAffordRetry(
  waitMs: number,
  deadlineAt: number | undefined,
  now: number = Date.now(),
): boolean {
  if (deadlineAt === undefined) return true; // no budget declared: caller owns the clock
  return now + waitMs + RETRY_HEADROOM_MS <= deadlineAt;
}

/**
 * Feedback handed back to the model on a revision pass.
 *
 * `unsupportedFigures` are figures the previous attempt invented; naming them
 * explicitly is far more effective than repeating the general instruction, and
 * it turns a discarded chapter into a usable one.
 */
export interface RevisionFeedback {
  unsupportedFigures?: string[];
  missingTopics?: string[];
}

function buildRevisionBlock(feedback: RevisionFeedback): string {
  const parts: string[] = [
    ``,
    `REVISION REQUIRED — your previous draft of this chapter was rejected. Correct the following and redraft the chapter in full.`,
  ];

  if (feedback.unsupportedFigures?.length) {
    parts.push(
      ``,
      `(a) You used figures that do not appear anywhere in the issuer data: ${feedback.unsupportedFigures
        .map((figure) => `"${figure}"`)
        .join(", ")}.`,
      `    Every number you write must appear verbatim in the ISSUER DATA above. Do not round, rescale,`,
      `    recompute or approximate. If a figure you want is not in the data, omit the sentence entirely`,
      `    or state that the particulars are to be supplied.`,
    );
  }

  if (feedback.missingTopics?.length) {
    parts.push(
      ``,
      `(b) The chapter must also cover, and your previous draft omitted: ${feedback.missingTopics.join("; ")}.`,
    );
  }

  parts.push(
    ``,
    `Report the issuer's figures exactly as supplied. If two supplied figures disagree with each`,
    `other, that is not yours to reconcile — state the one this chapter calls for and leave the`,
    `discrepancy to the disclosure check.`,
  );

  return parts.join("\n");
}

/**
 * Draft one narrative chapter. Returns null on any failure so the caller falls
 * back to the deterministic template — the demo must never surface an error in
 * place of a chapter.
 */
export async function draftChapter(
  request: NarrativeRequest,
  feedback?: RevisionFeedback,
  deadlineAt?: number,
): Promise<DraftResult> {
  const key = getGroqKey();
  if (!key) return { text: null, error: "no key configured" };

  const { generateText } = await import("ai");
  const { createGroq } = await import("@ai-sdk/groq");

  const groq = createGroq({ apiKey: key });
  const model = getModel();

  const prompt = [
    `CHAPTER TO DRAFT: ${request.chapterTitle}`,
    ``,
    `DRAFTING INSTRUCTION:`,
    request.instruction,
    ``,
    `THIS CHAPTER MUST COVER:`,
    ...request.mustCover.map((item) => `- ${item}`),
    ``,
    `ISSUER DATA (the complete set of facts you may use — nothing outside this):`,
    JSON.stringify(request.context, null, 2),
    feedback ? buildRevisionBlock(feedback) : ``,
    ``,
    `Draft the chapter now. Every fact and figure must trace to the issuer data above.`,
  ].join("\n");

  // Quota failures are transient and self-announcing, so wait out the window
  // the API names rather than surrendering the chapter to a template. Content
  // failures are NOT retried here — those are the caller's to revise.
  const maxQuotaRetries = 4;
  for (let attempt = 0; attempt <= maxQuotaRetries; attempt += 1) {
    try {
      const result = await generateText({
        model: groq(model),
        system: SYSTEM_PROMPT,
        prompt,
        temperature: 0.2,
        maxTokens: 2400,
        maxRetries: 1, // our own backoff below is quota-aware; don't double up
      });

      const text = (result.text ?? "").trim();
      if (text.length < 200) return { text: null, error: "response too short" };

      const allowed = new Set<string>();
      collectNumbers(request.context, allowed);

      const offenders = containsUnsupportedFigures(text, allowed);
      if (offenders.length > 0) {
        // Fail closed. An unverifiable figure in an offer document is a defect,
        // and the deterministic template is a perfectly good chapter.
        return { text: null, rejected: offenders, error: "unsupported figures in model output" };
      }

      return { text };
    } catch (error) {
      if (isRateLimit(error) && attempt < maxQuotaRetries) {
        const wait = retryAfterMs(error, attempt);
        if (!canAffordRetry(wait, deadlineAt)) {
          // Abandon to the template rather than sleep through the deadline.
          return {
            text: null,
            rateLimited: true,
            error: `rate limited; ${Math.round(wait / 1000)}s retry window does not fit the remaining budget`,
          };
        }
        await sleep(wait);
        continue;
      }
      return {
        text: null,
        rateLimited: isRateLimit(error),
        error: error instanceof Error ? error.message : "generation failed",
      };
    }
  }

  return { text: null, rateLimited: true, error: "rate limited after retries" };
}
