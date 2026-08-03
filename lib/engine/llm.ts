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

/**
 * Ceiling on a single chapter's generated length.
 *
 * This is not only a length cap, it is a price. Groq's rate limiter charges the
 * RESERVATION rather than the tokens actually generated — a 40-token prompt sent
 * with max_tokens 4000 is billed "Requested 4042" — so every chapter costs this
 * whole number against both the per-minute bucket and the 100,000-token daily
 * cap, whether the model writes two thousand tokens or two hundred.
 *
 * 2,400 looks generous against a single measurement — Risk Factors came back at
 * ~1,123 tokens (675 words) and Our Business at ~700 — and it was briefly cut to
 * 1,800 on that basis, keeping what looked like a 60% margin.
 *
 * That was wrong, and the truncation check caught it: on a later run the same
 * Risk Factors chapter ran past 1,800 and was refused. Generated length varies
 * substantially between runs on identical input, so a ceiling sized against one
 * observation of the longest chapter is sized against noise. 2,400 has never
 * truncated across every run in this project's history; that is the evidence
 * that matters, not the mean.
 *
 * The saving was not worth it either: the tighter ceiling bought no extra
 * parallelism, only a higher chance of dropping the single most important
 * chapter in the document to a template.
 *
 * It is now 2,900 rather than 2,400, which is the largest reservation that
 * still fits two chapters in flight against the primary model's 12,000-token
 * bucket alongside a 3,100-token worst-case prompt. Deepening the narrative
 * chapters asks the model for materially more text, and a ceiling left at
 * 2,400 would have answered that by truncating and falling back to templates.
 * Raising it costs nothing that was being used.
 *
 * Truncation remains DETECTED rather than hoped against: a chapter cut off at
 * the ceiling comes back with finishReason "length" and is refused. Without that
 * check this regression would have shipped silently, since a half-finished
 * chapter still clears the 200-character floor and the figure validator.
 */
export const MAX_COMPLETION_TOKENS = 2900;

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

/**
 * Models to try, in order, when the one above runs out of quota.
 *
 * The free tier meters each model SEPARATELY: llama-3.3-70b-versatile has its
 * own 100,000-token day, and exhausting it says nothing about the others. A
 * single-model configuration therefore throws away three quarters of the daily
 * budget the same key already grants, and hands the user templates while paid-up
 * capacity sits unused.
 *
 * Order is capability first, then cost. 70b writes the best prose. gpt-oss-120b
 * is the strongest measured substitute — drafting Our Business in 3.2 seconds
 * against 70b's 6-12, and passing the figure validator on the same issuer data.
 * 8b-instant is last: it is the weakest writer, but a weak drafted chapter that
 * clears the validator still beats a template.
 *
 * Falling down this chain is safe precisely because quality is enforced on the
 * OUTPUT rather than assumed from the model. gpt-oss-120b was observed rounding
 * INR 78.90 crore to "79" exactly as 70b does, and was rejected for it exactly
 * as 70b is. The guarantee is a property of the validator, not of the model.
 */
export const MODEL_CHAIN = [
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "llama-3.1-8b-instant",
] as const;

/**
 * The chain to attempt, honouring an explicit GROQ_MODEL by promoting it to the
 * front rather than by discarding the fallbacks. Someone pinning a model wants
 * that model preferred; they do not want the request to fail when it is spent.
 */
export function getModelChain(): string[] {
  const configured = (process.env.GROQ_MODEL ?? "").trim();
  if (!configured) return [...MODEL_CHAIN];
  return [configured, ...MODEL_CHAIN.filter((model) => model !== configured)];
}

/**
 * Models known to be out of quota, and when they are worth trying again.
 *
 * A daily-cap rejection is not transient — Groq reports waits of minutes to
 * hours — so re-attempting the same exhausted model for every one of five
 * chapters wastes a round trip and a slice of the deadline each time. Recording
 * the exhaustion converts that into one wasted call per model per process.
 *
 * This is an optimisation and never a correctness requirement. Serverless
 * instances are recycled and this map goes with them; the only consequence is
 * one more probing call on a cold start, which then re-learns the same fact.
 */
const exhaustedUntil = new Map<string, number>();

/** Parse "9m45.6s", "7h3m47.52s" or "27.4s" into milliseconds. */
export function parseRetryDuration(message: string): number | null {
  const match = message.match(/try again in ((?:\d+h)?(?:\d+m)?[\d.]+s?)/i);
  if (!match) return null;
  const parts = match[1].match(/(?:(\d+)h)?(?:(\d+)m)?([\d.]+)s?/);
  if (!parts) return null;
  const hours = Number(parts[1] ?? 0);
  const minutes = Number(parts[2] ?? 0);
  const seconds = Number(parts[3] ?? 0);
  const ms = ((hours * 60 + minutes) * 60 + seconds) * 1000;
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/** True when the 429 is the per-DAY cap rather than the per-minute bucket. */
export function isDailyCap(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /tokens per day|TPD|requests per day|RPD/i.test(message);
}

export function markExhausted(model: string, forMs: number, now: number = Date.now()): void {
  exhaustedUntil.set(model, now + forMs);
}

export function isExhausted(model: string, now: number = Date.now()): boolean {
  const until = exhaustedUntil.get(model);
  if (until === undefined) return false;
  if (now >= until) {
    exhaustedUntil.delete(model);
    return false;
  }
  return true;
}

/** Tests must not inherit another test's exhaustion state. */
export function resetModelHealth(): void {
  exhaustedUntil.clear();
}

/**
 * The chain minus anything known to be spent.
 *
 * Never returns empty: if every model is in cooldown the first is returned
 * anyway, so the caller makes a real attempt and gets a real error rather than
 * silently drafting nothing on stale bookkeeping.
 */
export function availableModels(now: number = Date.now()): string[] {
  const chain = getModelChain();
  const live = chain.filter((model) => !isExhausted(model, now));
  return live.length > 0 ? live : [chain[0]];
}

/** The model a drafting pass should size its concurrency against. */
export function firstAvailableModel(now: number = Date.now()): string {
  return availableModels(now)[0];
}

const SYSTEM_PROMPT = `You are a securities-markets document specialist drafting chapters of an Indian SME IPO offer document (a Draft Red Herring Prospectus for the NSE Emerge or BSE SME platform), working to SEBI (ICDR) Regulations, 2018.

ABSOLUTE CONSTRAINTS. These override every other instruction:
1. Use ONLY the facts in the ISSUER DATA supplied. Never introduce a company name, customer name, product, certification, location, date, percentage, monetary amount, market size, growth rate, ranking or any other fact that is not present in that data.
2. If a piece of information a chapter would ordinarily contain is absent from the issuer data, write that it is to be supplied, or omit it. NEVER estimate, infer, approximate or illustrate a missing figure.
3. Reproduce every number exactly as supplied. Do not round, convert units, recompute or "correct" any figure.
4. Write in the register of a filed offer document: formal, restrained, impersonal, third person, past or present tense as appropriate. No marketing language, no superlatives, no persuasion, no reassurance, and no claims of leadership or quality that the data does not support.
5. Never state that a risk is mitigated, managed or unlikely unless the issuer data says so.
6. THE ISSUER DATA IS OFTEN WRITTEN INFORMALLY. It comes from a promoter answering plain-language questions, so it may be in the first person ("we do housekeeping for offices"), use approximations ("about 19 percent", "roughly"), or be conversational ("nothing much"). You must REWRITE it into offer-document register, and never reproduce it verbatim. Specifically:
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
- Write percentages with the per-cent sign, exactly as supplied.
- Use ordinary punctuation only. Do NOT use em dashes or en dashes anywhere in the prose. Where you would reach for one, use a comma, a colon, a semicolon or a full stop instead. A filed offer document is written in plain sentences, and a dash is almost always a sentence that wanted splitting.`;

/**
 * Replace dashes in model prose with ordinary punctuation.
 *
 * The system prompt asks for this, and asking is not enough — the same lesson
 * the figure validator exists to enforce. Language models reach for an em dash
 * constantly, it is one of the most recognisable tells that a passage was
 * machine-written, and an offer document is the last place that should read as
 * though nobody wrote it.
 *
 * A capitalised word after the dash means the clause stands on its own and
 * wants a full stop. Everything else takes a comma, which is the safest
 * default: it can occasionally join two clauses that would read better apart,
 * but it never produces something ungrammatical.
 *
 * Ranges between digits keep an en dash, because "2023-24" and "10-15%" are
 * correct typography rather than a stylistic tic.
 */
export function normaliseDashes(text: string): string {
  return text
    .replace(/\s*—\s*([A-Z])/g, ". $1")
    .replace(/\s*—\s*/g, ", ")
    .replace(/(?<!\d)\s*–\s*(?!\d)/g, ", ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",");
}

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

/**
 * Re-run the figure guarantee over prose that was accepted earlier.
 *
 * Exported for the reference drafts, which are model output accepted at capture
 * time and replayed later. If the issuer fixture is edited afterwards, prose
 * that was faithful when written can quietly stop being faithful, and the
 * shipped capture becomes a chapter asserting a figure the data no longer
 * contains. Being accepted once is not a reason to stop checking.
 */
export function unsupportedFiguresFor(text: string, context: unknown): string[] {
  const allowed = new Set<string>();
  collectNumbers(context, allowed);
  return containsUnsupportedFigures(text, allowed);
}

export interface DraftResult {
  text: string | null;
  rejected?: string[];
  error?: string;
  /** True when the call failed purely on quota, not on content quality. */
  rateLimited?: boolean;
  /** True when the model ran into the completion ceiling and was cut off. */
  truncated?: boolean;
  /** Which model produced (or failed to produce) this chapter. */
  model?: string;
  /** True when this model's daily cap is spent, not merely its minute bucket. */
  exhausted?: boolean;
  /** True when every model in the chain was tried and none had quota. */
  chainExhausted?: boolean;
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
    `REVISION REQUIRED. Your previous draft of this chapter was rejected. Correct the following and redraft the chapter in full.`,
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
    `other, that is not yours to reconcile. State the one this chapter calls for and leave the`,
    `discrepancy to the disclosure check.`,
  );

  return parts.join("\n");
}

/**
 * Draft one chapter with ONE named model. The chain walk lives in its caller.
 */
async function draftWithModel(
  request: NarrativeRequest,
  model: string,
  feedback: RevisionFeedback | undefined,
  deadlineAt: number | undefined,
  key: string,
): Promise<DraftResult> {
  const { generateText } = await import("ai");
  const { createGroq } = await import("@ai-sdk/groq");

  const groq = createGroq({ apiKey: key });

  const prompt = [
    `CHAPTER TO DRAFT: ${request.chapterTitle}`,
    ``,
    `DRAFTING INSTRUCTION:`,
    request.instruction,
    ``,
    `THIS CHAPTER MUST COVER:`,
    ...request.mustCover.map((item) => `- ${item}`),
    ``,
    `ISSUER DATA (the complete set of facts you may use, nothing outside this):`,
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
        maxTokens: MAX_COMPLETION_TOKENS,
        maxRetries: 1, // our own backoff below is quota-aware; don't double up
      });

      // Normalise before validating, so every downstream check and the stored
      // chapter see exactly the prose the reader will.
      const text = normaliseDashes((result.text ?? "").trim());
      if (text.length < 200) return { text: null, model, error: "response too short" };

      // A chapter that hit the token ceiling stops mid-sentence. It would clear
      // every other check here — it is long enough, and its figures are drawn
      // from the issuer data — so without this it lands in the document as a
      // truncated paragraph. Prefer the complete deterministic template.
      if (result.finishReason === "length") {
        return { text: null, model, truncated: true, error: "model output hit the token ceiling" };
      }

      const allowed = new Set<string>();
      collectNumbers(request.context, allowed);

      const offenders = containsUnsupportedFigures(text, allowed);
      if (offenders.length > 0) {
        // Fail closed. An unverifiable figure in an offer document is a defect,
        // and the deterministic template is a perfectly good chapter.
        return {
          text: null,
          model,
          rejected: offenders,
          error: "unsupported figures in model output",
        };
      }

      return { text, model };
    } catch (error) {
      // A day-cap rejection is not worth waiting out — Groq quotes minutes to
      // hours — and not worth re-attempting per chapter. Record it and hand
      // straight to the next model in the chain.
      if (isDailyCap(error)) {
        const message = error instanceof Error ? error.message : String(error);
        markExhausted(model, parseRetryDuration(message) ?? 60 * 60 * 1000);
        return { text: null, model, rateLimited: true, exhausted: true, error: message };
      }

      if (isRateLimit(error) && attempt < maxQuotaRetries) {
        const wait = retryAfterMs(error, attempt);
        if (!canAffordRetry(wait, deadlineAt)) {
          // Abandon rather than sleep through the deadline. The caller may still
          // try a different model, which costs a round trip rather than a nap.
          return {
            text: null,
            model,
            rateLimited: true,
            error: `rate limited; ${Math.round(wait / 1000)}s retry window does not fit the remaining budget`,
          };
        }
        await sleep(wait);
        continue;
      }
      return {
        text: null,
        model,
        rateLimited: isRateLimit(error),
        error: error instanceof Error ? error.message : "generation failed",
      };
    }
  }

  return { text: null, model, rateLimited: true, error: "rate limited after retries" };
}

/**
 * Draft one narrative chapter, falling down the model chain on quota failures.
 *
 * Returns null text on any failure so the caller falls back to the deterministic
 * template — the demo must never surface an error in place of a chapter.
 *
 * What does and does not advance to the next model matters:
 *
 *   quota / transport failure -> ADVANCE. The model never judged the content, so
 *       another model is a clean attempt at the same work.
 *   unsupported figures       -> STOP. The model produced a specific, nameable
 *       defect, and the revision pass repairs that far more reliably by naming
 *       the offending figure back to the same model. Silently re-rolling on a
 *       different model would also make the refine trace incomprehensible.
 *   truncated at the ceiling  -> STOP. A length problem is about our reservation,
 *       not the model; every model in the chain gets the same ceiling, so the
 *       next one down would be cut off at exactly the same place.
 *   too short                 -> STOP, but for a different reason: the revision
 *       pass is the recovery path for a model that returned a stub, and it
 *       demonstrably works — a chapter the smallest model stubbed on the first
 *       pass came back accepted on revision 2. Advancing the chain here would
 *       spend a second model's quota on work the loop already recovers.
 */
export async function draftChapter(
  request: NarrativeRequest,
  feedback?: RevisionFeedback,
  deadlineAt?: number,
): Promise<DraftResult> {
  const key = getGroqKey();
  if (!key) return { text: null, error: "no key configured" };

  const chain = availableModels();
  let last: DraftResult = { text: null, rateLimited: true, error: "no model attempted" };

  for (const model of chain) {
    // Each hop costs a round trip. Spending the budget discovering that four
    // models are all rate-limited leaves nothing to assemble the document with.
    if (deadlineAt !== undefined && Date.now() + RETRY_HEADROOM_MS >= deadlineAt) {
      return { ...last, error: `${last.error ?? "quota"}; budget exhausted before trying ${model}` };
    }

    const result = await draftWithModel(request, model, feedback, deadlineAt, key);
    if (result.text !== null) return result;

    // A judgement about the content, not about availability. Do not re-roll.
    if (result.rejected?.length || result.truncated || !result.rateLimited) return result;

    last = result;
  }

  return { ...last, chainExhausted: true };
}
