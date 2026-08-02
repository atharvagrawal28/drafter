/**
 * Self-correcting drafting loop, implemented as a LangGraph state machine.
 *
 * WHY A GRAPH IS JUSTIFIED HERE
 * -----------------------------
 * A single LLM call per chapter needs no orchestration framework, and Drafter
 * deliberately did not use one for that. This module is different: it is a
 * genuine cycle with a conditional edge and bounded iteration —
 *
 *      draft ──▶ validate ──▶ assemble ──▶ gapCheck ──▶ decide
 *                   ▲                                     │
 *                   └──────────── revise ◀────────────────┘
 *                            (while issues remain and
 *                             iterations < maxIterations)
 *
 * The loop exists because the first draft is measurably imperfect in two ways
 * that are automatically detectable:
 *
 *   1. FIGURE VIOLATIONS. The model occasionally writes a number that is not in
 *      the issuer data — usually by rounding (78.90 becomes "79") or by
 *      inventing a growth rate. Drafter's validator rejects the whole chapter
 *      for this, which is correct but wasteful: without a revision pass the
 *      chapter silently degrades to a deterministic template. Handing the
 *      offending figures back to the model recovers the chapter.
 *
 *   2. MUST-COVER OMISSIONS. A chapter may simply fail to discuss a topic the
 *      knowledge base requires (a litigation risk factor when litigation
 *      exists, say). That is checkable against `must_cover`.
 *
 * IMPORTANT — WHAT THE LOOP DELIBERATELY DOES NOT DO
 * --------------------------------------------------
 * It never revises prose in response to a Gap & Consistency finding.
 *
 * This was tested and then deliberately removed. Feeding the revenue-mismatch
 * finding to the model caused it to quietly adopt the audited figure (INR 78.90
 * crore) in the business chapter instead of the figure the promoter actually
 * asserted (INR 82.50 crore). Two things went wrong at once:
 *
 *   - The document and the report began contradicting each other. The report
 *     says "Our Business states INR 82.50 crore"; the chapter no longer did.
 *   - More seriously, the tool silently corrected the promoter's error rather
 *     than surfacing it. A drafter that harmonises away the very inconsistency
 *     its checker exists to catch is worse than no checker at all.
 *
 * So the division of labour is strict. The draft faithfully renders what the
 * issuer asserted. The Gap & Consistency Checker reads the ISSUER DATA — not
 * the prose — and reports the contradiction. Only genuine DRAFTING defects are
 * revised here: invented figures, and omitted must-cover topics. Disclosure
 * defects belong to the issuer and the merchant banker, and are reported, never
 * repaired.
 */

import { END, START, StateGraph, Annotation } from "@langchain/langgraph";
import { generateDocument, type GenerateOptions, type NarrativeRequest } from "./generate";
import { runGapCheck } from "./gapCheck";
import {
  draftChapter,
  firstAvailableModel,
  MAX_COMPLETION_TOKENS,
  type RevisionFeedback,
} from "./llm";
import { sectionTemplates } from "../data";
import type { DrhpDocument, GapReport, IssuerData } from "../types";
import { containsAny } from "./utils";

// ---------------------------------------------------------------------------
// Per-chapter drafting record
// ---------------------------------------------------------------------------

export interface ChapterAttempt {
  chapterId: string;
  chapterTitle: string;
  /** How many times the model was asked to draft this chapter (1 = first pass). */
  attempts: number;
  /** Final outcome for this chapter. */
  outcome: "accepted" | "accepted-after-revision" | "fell-back-to-template";
  /** Figures rejected on each attempt, in order. */
  rejectedFigures: string[][];
  /** must_cover topics still absent at the end. */
  missingTopics: string[];
  /** True when the last failure was a provider quota limit, not a content problem. */
  rateLimited?: boolean;
  /**
   * Which model actually drafted this chapter.
   *
   * Worth recording rather than inferring: when the primary model's day is spent
   * the chain silently substitutes another, and a reader comparing two chapters'
   * prose deserves to know they were not written by the same model.
   */
  model?: string;
  /** Accepted prose, if any. */
  text: string | null;
}

export interface RefineTrace {
  iterations: number;
  chapters: ChapterAttempt[];
  /** Human-readable log of what the loop did, surfaced in the UI. */
  log: string[];
  recoveredChapters: string[];
  fellBackChapters: string[];
  /** Chapters that fell back purely because of provider quota, not quality. */
  rateLimitedChapters: string[];
}

// ---------------------------------------------------------------------------
// Graph state
// ---------------------------------------------------------------------------

const RefineState = Annotation.Root({
  issuerData: Annotation<IssuerData>(),
  issuerId: Annotation<string>(),
  maxIterations: Annotation<number>(),
  llmModel: Annotation<string | undefined>(),
  /**
   * Wall-clock deadline (epoch ms) after which no further model calls are made.
   *
   * The loop is unbounded in time even though it is bounded in iterations: each
   * chapter can wait out a provider rate-limit window, and a serverless
   * platform will kill the request long before the graph notices. On Vercel's
   * Hobby plan the ceiling is 60 seconds, so without this a demo on a
   * rate-limited key returns a 504 and nothing at all — strictly worse than the
   * deterministic draft the request would otherwise have produced.
   *
   * Past the deadline, drafting stops and every remaining chapter takes the
   * template. Degradation, not failure.
   */
  deadlineAt: Annotation<number | undefined>(),

  iteration: Annotation<number>({ reducer: (_, next) => next, default: () => 0 }),
  /** chapterId -> accepted prose */
  drafts: Annotation<Record<string, string>>({
    reducer: (previous, next) => ({ ...previous, ...next }),
    default: () => ({}),
  }),
  /** chapterId -> attempt record */
  attempts: Annotation<Record<string, ChapterAttempt>>({
    reducer: (previous, next) => ({ ...previous, ...next }),
    default: () => ({}),
  }),
  /** Chapters still needing a revision pass. */
  pending: Annotation<string[]>({ reducer: (_, next) => next, default: () => [] }),

  document: Annotation<DrhpDocument | null>({ reducer: (_, next) => next, default: () => null }),
  gapReport: Annotation<GapReport | null>({ reducer: (_, next) => next, default: () => null }),
  log: Annotation<string[]>({
    reducer: (previous, next) => [...previous, ...next],
    default: () => [],
  }),
});

type RefineStateType = typeof RefineState.State;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Narrative chapters that carry a knowledge-base instruction and are priority. */
function narrativeChapterIds(): string[] {
  const chapters = sectionTemplates.chapters ?? {};
  return Object.keys(chapters).filter((id) => chapters[id]?.mode === "narrative");
}

/**
 * Which `must_cover` topics does this draft appear to omit?
 *
 * Deliberately shallow — it looks for the distinctive words of each topic. It
 * is a prompt for the model to try again, not a semantic judgement, so a false
 * positive costs one extra call and a false negative costs nothing.
 */
function findMissingTopics(text: string, mustCover: string[], data: IssuerData): string[] {
  if (!text) return mustCover;
  const missing: string[] = [];

  for (const topic of mustCover) {
    // Only require a litigation topic when the issuer actually has litigation.
    if (/litigation|proceeding/i.test(topic)) {
      const litigation = data?.legal?.litigation;
      const hasLitigation =
        typeof litigation === "string" && litigation.trim() && !/^(nil|none)/i.test(litigation.trim());
      if (!hasLitigation) continue;
    }
    if (/related-party|related party/i.test(topic)) {
      const related = data?.management?.related_parties;
      const hasRelated =
        typeof related === "string" && related.trim() && !/^(nil|none)/i.test(related.trim());
      if (!hasRelated) continue;
    }

    // Distinctive words from the topic phrase, ignoring filler.
    const keywords = topic
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((word) => word.length > 4 && !["where", "which", "their", "including", "applicable"].includes(word));
    if (!keywords.length) continue;

    const hit = containsAny(text, keywords);
    if (hit.length === 0) missing.push(topic);
  }

  return missing;
}

/** Build the NarrativeRequest for a chapter from the knowledge base. */
function buildRequest(chapterId: string, data: IssuerData): NarrativeRequest | null {
  const kb = (sectionTemplates.chapters ?? {})[chapterId];
  if (!kb?.instruction) return null;

  const context: Record<string, any> = {};
  for (const field of (kb.context_fields as string[]) ?? []) {
    const value = field.split(".").reduce<any>((acc, key) => (acc == null ? acc : acc[key]), data);
    if (value !== null && value !== undefined && !(typeof value === "string" && !value.trim())) {
      context[field] = value;
    }
  }

  return {
    chapterId,
    chapterTitle: kb.title ?? chapterId,
    instruction: kb.instruction,
    mustCover: (kb.must_cover as string[]) ?? [],
    context,
  };
}

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------

export interface RefineResult {
  document: DrhpDocument;
  gapReport: GapReport;
  trace: RefineTrace;
}

/** True once the drafting budget for this request has been spent. */
function outOfTime(state: RefineStateType): boolean {
  return state.deadlineAt !== undefined && Date.now() >= state.deadlineAt;
}

/**
 * How many chapters may be in flight at once.
 *
 * Five narrative chapters drafted one after another cost 40-50 seconds against
 * a 60-second platform ceiling, which is why production runs were finishing on
 * a single iteration with a third of the document dumped to templates: the
 * budget was gone before the revision pass could start.
 *
 * The ceiling on this number is the free tier's per-minute token bucket, and
 * the arithmetic is not the obvious one. Groq's limiter charges the RESERVATION,
 * not the completion: a request carrying max_tokens 4000 over a 40-token prompt
 * is billed "Requested 4042" against the bucket even if the model writes twenty
 * words. So a chapter costs its prompt plus MAX_COMPLETION_TOKENS in full,
 * regardless of how long the chapter turns out to be.
 *
 * Measured against the bundled issuer (prompt tokens per chapter, plus the 2,400
 * reserved), and a 12,000-token bucket:
 *
 *     II.1  ~2,033 + 2,400 = 4,433      three in flight = ~12,300  EXCEEDS
 *     IV.2  ~1,629 + 2,400 = 4,029      two   in flight = ~ 8,500  fits
 *     IV.1  ~1,454 + 2,400 = 3,854
 *     V.2   ~1,262 + 2,400 = 3,662
 *
 * Three was the first guess and it is wrong: the third chapter of every burst
 * was 429ing, which is why runs came back with two chapters drafted and the rest
 * on templates. Two fits the bucket with roughly 3,500 tokens of headroom — the
 * bucket refills at ~200/second, so that gap is refilled inside the time one
 * draft takes, and the pipeline stays saturated without ever queueing on quota.
 *
 * `verify-engine.ts` asserts this fits. Raising either this number or
 * MAX_COMPLETION_TOKENS without re-doing the arithmetic will fail the gate.
 */
/**
 * The per-minute token bucket each model gets on Groq's free tier, read from
 * that model's own `x-ratelimit-limit-tokens` header rather than assumed.
 *
 * These are NOT the same across models, which is the trap: a concurrency tuned
 * on llama-3.3-70b's 12,000 silently 429s two chapters out of every burst the
 * moment `GROQ_MODEL` points at gpt-oss-120b's 8,000. The default is the
 * smallest observed bucket, so an unknown model degrades to safe rather than
 * to broken.
 */
export const MODEL_TPM_BUCKET: Record<string, number> = {
  "llama-3.3-70b-versatile": 12_000,
  "openai/gpt-oss-120b": 8_000,
  "openai/gpt-oss-20b": 8_000,
  "llama-3.1-8b-instant": 6_000,
};

export const DEFAULT_TPM_BUCKET = 6_000;

/**
 * The largest prompt among the narrative chapters, measured, rounded up.
 *
 * This grows whenever a chapter is given more context fields or a longer
 * instruction, and understating it silently over-fans-out: the derived
 * concurrency is computed from a slot cost that is smaller than the real one,
 * and the extra chapter 429s. It was 2,100 when Risk Factors carried 21 context
 * fields; deepening the narrative chapters took that chapter to 3,012.
 *
 * `verify-engine.ts` measures the real prompts and fails if this understates
 * them, so it cannot drift again unnoticed.
 */
export const WORST_CASE_PROMPT_TOKENS = 3_100;

/** Never fan out beyond this, whatever the arithmetic allows. */
export const MAX_DRAFT_CONCURRENCY = 3;

export function tpmBucketFor(model: string): number {
  return MODEL_TPM_BUCKET[model] ?? DEFAULT_TPM_BUCKET;
}

export function burstTokenCost(concurrency: number, maxCompletionTokens: number): number {
  return concurrency * (WORST_CASE_PROMPT_TOKENS + maxCompletionTokens);
}

/**
 * How many chapters may be in flight at once, for this model.
 *
 * Derived rather than configured, because the inputs are all measurable and the
 * failure mode of getting it wrong is invisible: chapters come back as templates
 * and the document merely looks a bit flatter. Groq charges the RESERVATION, not
 * the completion, so one chapter costs its prompt plus MAX_COMPLETION_TOKENS in
 * full and a burst is simply that times the fan-out.
 *
 * At 2,900 reserved and a 3,100-token worst-case prompt, each slot costs 6,000:
 *
 *     llama-3.3-70b-versatile   12,000 bucket -> 2 in flight (12,000)
 *     openai/gpt-oss-120b        8,000 bucket -> 1 in flight ( 6,000)
 *     llama-3.1-8b-instant       6,000 bucket -> 1 in flight ( 6,000)
 *
 * The reservation and the fan-out trade against each other directly, and the
 * reservation wins: dropping it would buy a third slot on the primary model,
 * but 1,800 is the length at which Risk Factors was observed truncating, and
 * losing that chapter to a template costs far more than the parallelism. The
 * ceiling is instead set as high as concurrency 2 permits, which is what lets
 * the deepened chapters run long without being cut off.
 *
 * Always at least 1: a bucket too small for even one chapter is a quota problem
 * for the retry logic to report, not a reason to draft nothing at all.
 */
export function draftConcurrencyFor(model: string, maxCompletionTokens: number): number {
  const perSlot = WORST_CASE_PROMPT_TOKENS + maxCompletionTokens;
  const fits = Math.floor(tpmBucketFor(model) / perSlot);
  return Math.max(1, Math.min(MAX_DRAFT_CONCURRENCY, fits));
}

export function burstFitsFreeTier(
  concurrency: number,
  maxCompletionTokens: number,
  model: string,
): boolean {
  return burstTokenCost(concurrency, maxCompletionTokens) <= tpmBucketFor(model);
}

/**
 * Run `task` over `items` with at most `limit` in flight.
 *
 * Results come back in INPUT order regardless of completion order. That matters
 * more than it looks: the refine trace is shown to the user and asserted in
 * tests, and a log whose line order changed run to run would make a
 * reproducible pipeline look like a nondeterministic one.
 *
 * A rejected task does not cancel its siblings. Chapters are independent, and
 * losing four good drafts because the fifth threw would be strictly worse than
 * the sequential behaviour this replaces.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<(R | { __error: unknown })[]> {
  const results = new Array<R | { __error: unknown }>(items.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        results[index] = await task(items[index], index);
      } catch (error) {
        results[index] = { __error: error };
      }
    }
  };

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker);
  await Promise.all(workers);
  return results;
}

/** Narrow a `mapWithConcurrency` slot to a successful result. */
function ok<R>(value: R | { __error: unknown }): value is R {
  return !(value !== null && typeof value === "object" && "__error" in (value as any));
}

export function buildRefineGraph() {
  // -------------------------------------------------------------- draft
  // First pass: draft every narrative chapter once.
  async function draft(state: RefineStateType): Promise<Partial<RefineStateType>> {
    const drafts: Record<string, string> = {};
    const attempts: Record<string, ChapterAttempt> = {};
    const pending: string[] = [];
    const log: string[] = [];

    const jobs = narrativeChapterIds()
      .map((chapterId) => ({ chapterId, request: buildRequest(chapterId, state.issuerData) }))
      .filter((job): job is { chapterId: string; request: NarrativeRequest } => job.request !== null);

    // Fan out. The deadline is re-checked as each slot is picked up rather than
    // once up front, so a budget that expires mid-flight still stops the
    // chapters that have not started.
    // Size the fan-out against the model that will actually be used. If the
    // configured model's day is already spent, the chain has moved on and its
    // 12,000-token bucket is not the one we are drawing against.
    const concurrency = draftConcurrencyFor(firstAvailableModel(), MAX_COMPLETION_TOKENS);
    const outcomes = await mapWithConcurrency(jobs, concurrency, async (job) => {
      if (outOfTime(state)) return { skipped: true as const };
      return { skipped: false as const, result: await draftChapter(job.request, undefined, state.deadlineAt) };
    });

    // Fold results back in INPUT order. Execution was concurrent; the trace the
    // user reads must not be.
    let budgetSpent = false;
    for (const [index, job] of jobs.entries()) {
      const outcome = outcomes[index];

      if (!ok(outcome) || outcome.skipped) {
        if (!budgetSpent) {
          budgetSpent = true;
          log.push(
            `time budget spent, so remaining chapters take the deterministic template rather than risking a timeout`,
          );
        }
        continue;
      }

      const { result } = outcome;
      const record: ChapterAttempt = {
        chapterId: job.chapterId,
        chapterTitle: job.request.chapterTitle,
        attempts: 1,
        outcome: "fell-back-to-template",
        rejectedFigures: [],
        missingTopics: [],
        model: result.model,
        text: null,
      };

      if (result.text) {
        const missing = findMissingTopics(result.text, job.request.mustCover, state.issuerData);
        record.missingTopics = missing;
        if (missing.length === 0) {
          record.outcome = "accepted";
          record.text = result.text;
          drafts[job.chapterId] = result.text;
          log.push(
            `${job.chapterId}: accepted on first pass${result.model ? ` (${result.model})` : ""}.`,
          );
        } else {
          pending.push(job.chapterId);
          log.push(
            `${job.chapterId}: first pass omitted ${missing.length} required topic(s), queued for revision.`,
          );
        }
      } else {
        record.rejectedFigures.push(result.rejected ?? []);
        record.rateLimited = result.rateLimited;
        pending.push(job.chapterId);
        log.push(
          result.rejected?.length
            ? `${job.chapterId}: first pass used unsupported figure(s) ${result.rejected.join(", ")}, queued for revision.`
            : result.chainExhausted
              ? `${job.chapterId}: every model in the fallback chain is out of quota, queued for retry.`
              : result.rateLimited
                ? `${job.chapterId}: provider rate limit hit, queued for retry.`
                : `${job.chapterId}: first pass failed (${result.error ?? "unknown"}), queued for revision.`,
        );
      }

      attempts[job.chapterId] = record;
    }

    return { drafts, attempts, pending, iteration: 1, log };
  }

  // ------------------------------------------------------------- revise
  // Redraft only the chapters that failed, handing back specific feedback.
  async function revise(state: RefineStateType): Promise<Partial<RefineStateType>> {
    const drafts: Record<string, string> = {};
    const attempts: Record<string, ChapterAttempt> = {};
    const stillPending: string[] = [];
    const log: string[] = [];

    // NOTE: gap findings are deliberately NOT fed back into the prompt — see the
    // note at the top of this file. Only drafting defects are revised.
    const jobs = state.pending
      .map((chapterId) => ({
        chapterId,
        request: buildRequest(chapterId, state.issuerData),
        previous: state.attempts[chapterId],
      }))
      .filter(
        (job): job is { chapterId: string; request: NarrativeRequest; previous: ChapterAttempt } =>
          job.request !== null && job.previous !== undefined,
      );

    // Revisions fan out too. This is where the loop earns its place — a measured
    // 30% of chapter-drafts are recovered here — so making it cheap in wall
    // clock is what lets it run at all inside a 60-second platform ceiling.
    // Size the fan-out against the model that will actually be used. If the
    // configured model's day is already spent, the chain has moved on and its
    // 12,000-token bucket is not the one we are drawing against.
    const concurrency = draftConcurrencyFor(firstAvailableModel(), MAX_COMPLETION_TOKENS);
    const outcomes = await mapWithConcurrency(jobs, concurrency, async (job) => {
      if (outOfTime(state)) return { skipped: true as const };
      const feedback: RevisionFeedback = {
        unsupportedFigures: job.previous.rejectedFigures[job.previous.rejectedFigures.length - 1],
        missingTopics: job.previous.missingTopics,
      };
      return { skipped: false as const, result: await draftChapter(job.request, feedback, state.deadlineAt) };
    });

    for (const [index, job] of jobs.entries()) {
      const outcome = outcomes[index];
      const { chapterId, request, previous } = job;

      if (!ok(outcome) || outcome.skipped) {
        // Budget gone before this chapter started. It keeps its previous state
        // and stays pending, so the document falls back to its template.
        stillPending.push(chapterId);
        continue;
      }

      const { result } = outcome;
      const record: ChapterAttempt = {
        ...previous,
        attempts: previous.attempts + 1,
        rejectedFigures: [...previous.rejectedFigures],
        model: result.model ?? previous.model,
      };

      if (result.text) {
        const missing = findMissingTopics(result.text, request.mustCover, state.issuerData);
        record.missingTopics = missing;
        if (missing.length === 0) {
          record.outcome = "accepted-after-revision";
          record.text = result.text;
          drafts[chapterId] = result.text;
          log.push(
            `${chapterId}: recovered on revision ${record.attempts}${result.model ? ` (${result.model})` : ""}.`,
          );
        } else {
          stillPending.push(chapterId);
          log.push(`${chapterId}: revision ${record.attempts} still omits ${missing.length} topic(s).`);
        }
      } else {
        record.rejectedFigures.push(result.rejected ?? []);
        record.rateLimited = result.rateLimited;
        stillPending.push(chapterId);
        log.push(
          result.rejected?.length
            ? `${chapterId}: revision ${record.attempts} again used unsupported figure(s) ${result.rejected.join(", ")}.`
            : result.rateLimited
              ? `${chapterId}: provider rate limit hit on revision ${record.attempts}.`
              : `${chapterId}: revision ${record.attempts} failed (${result.error ?? "unknown"}).`,
        );
      }

      attempts[chapterId] = record;
    }

    return {
      drafts,
      attempts,
      pending: stillPending,
      iteration: state.iteration + 1,
      log,
    };
  }

  // ----------------------------------------------------------- assemble
  // Build the full document, serving the accepted drafts to the generator.
  // Chapters with no accepted draft receive null and fall back to templates.
  async function assemble(state: RefineStateType): Promise<Partial<RefineStateType>> {
    const options: GenerateOptions = {
      issuerId: state.issuerId,
      useLlm: true,
      llmModel: state.llmModel,
      llmPriorityOnly: false,
      draftNarrative: async (request) => state.drafts[request.chapterId] ?? null,
    };
    const document = await generateDocument(state.issuerData, options);
    return { document };
  }

  // ----------------------------------------------------------- gapCheck
  async function gapCheck(state: RefineStateType): Promise<Partial<RefineStateType>> {
    const gapReport = runGapCheck(state.issuerData, {
      issuerId: state.issuerId,
      issuerName: state.issuerData?.identity?.company_name,
    });
    return { gapReport };
  }

  // ------------------------------------------------------------- decide
  function shouldRevise(state: RefineStateType): "revise" | typeof END {
    if (state.pending.length === 0) return END;
    if (state.iteration >= state.maxIterations) return END;
    // A revision pass costs at least one more model call per pending chapter.
    // With the budget gone, return the draft that already exists.
    if (outOfTime(state)) return END;
    return "revise";
  }

  const graph = new StateGraph(RefineState)
    .addNode("draft", draft)
    .addNode("assemble", assemble)
    .addNode("gapCheck", gapCheck)
    .addNode("revise", revise)
    .addEdge(START, "draft")
    .addEdge("draft", "assemble")
    .addEdge("assemble", "gapCheck")
    // The cycle: gapCheck decides whether to revise or stop.
    .addConditionalEdges("gapCheck", shouldRevise, { revise: "revise", [END]: END })
    // A revision re-enters assembly, which re-checks — closing the loop.
    .addEdge("revise", "assemble");

  return graph.compile();
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function refineDocument(
  issuerData: IssuerData,
  options: {
    issuerId: string;
    llmModel?: string;
    maxIterations?: number;
    /** Wall-clock budget for model calls. Past it, chapters take the template. */
    budgetMs?: number;
  },
): Promise<RefineResult> {
  const app = buildRefineGraph();

  const finalState = (await app.invoke({
    issuerData,
    issuerId: options.issuerId,
    llmModel: options.llmModel,
    maxIterations: options.maxIterations ?? 3,
    deadlineAt: options.budgetMs ? Date.now() + options.budgetMs : undefined,
  })) as RefineStateType;

  const chapters = Object.values(finalState.attempts ?? {});

  const trace: RefineTrace = {
    iterations: finalState.iteration ?? 0,
    chapters,
    log: finalState.log ?? [],
    recoveredChapters: chapters
      .filter((chapter) => chapter.outcome === "accepted-after-revision")
      .map((chapter) => chapter.chapterId),
    fellBackChapters: chapters
      .filter((chapter) => chapter.outcome === "fell-back-to-template")
      .map((chapter) => chapter.chapterId),
    rateLimitedChapters: chapters
      .filter((chapter) => chapter.outcome === "fell-back-to-template" && chapter.rateLimited)
      .map((chapter) => chapter.chapterId),
  };

  return {
    document: finalState.document!,
    gapReport: finalState.gapReport!,
    trace,
  };
}
