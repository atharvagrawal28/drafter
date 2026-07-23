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
import { draftChapter, type RevisionFeedback } from "./llm";
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

export function buildRefineGraph() {
  // -------------------------------------------------------------- draft
  // First pass: draft every narrative chapter once.
  async function draft(state: RefineStateType): Promise<Partial<RefineStateType>> {
    const ids = narrativeChapterIds();
    const drafts: Record<string, string> = {};
    const attempts: Record<string, ChapterAttempt> = {};
    const pending: string[] = [];
    const log: string[] = [];

    let budgetSpent = false;

    for (const chapterId of ids) {
      const request = buildRequest(chapterId, state.issuerData);
      if (!request) continue;

      if (outOfTime(state)) {
        if (!budgetSpent) {
          budgetSpent = true;
          log.push(
            `time budget spent — remaining chapters take the deterministic template rather than risking a timeout`,
          );
        }
        continue;
      }

      const result = await draftChapter(request);
      const record: ChapterAttempt = {
        chapterId,
        chapterTitle: request.chapterTitle,
        attempts: 1,
        outcome: "fell-back-to-template",
        rejectedFigures: [],
        missingTopics: [],
        text: null,
      };

      if (result.text) {
        const missing = findMissingTopics(result.text, request.mustCover, state.issuerData);
        record.missingTopics = missing;
        if (missing.length === 0) {
          record.outcome = "accepted";
          record.text = result.text;
          drafts[chapterId] = result.text;
          log.push(`${chapterId}: accepted on first pass.`);
        } else {
          pending.push(chapterId);
          log.push(`${chapterId}: first pass omitted ${missing.length} required topic(s) — queued for revision.`);
        }
      } else {
        record.rejectedFigures.push(result.rejected ?? []);
        record.rateLimited = result.rateLimited;
        pending.push(chapterId);
        log.push(
          result.rejected?.length
            ? `${chapterId}: first pass used unsupported figure(s) ${result.rejected.join(", ")} — queued for revision.`
            : result.rateLimited
              ? `${chapterId}: provider rate limit hit — queued for retry.`
              : `${chapterId}: first pass failed (${result.error ?? "unknown"}) — queued for revision.`,
        );
      }

      attempts[chapterId] = record;
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
    for (const chapterId of state.pending) {
      const request = buildRequest(chapterId, state.issuerData);
      const previous = state.attempts[chapterId];
      if (!request || !previous) continue;

      if (outOfTime(state)) continue;

      const feedback: RevisionFeedback = {
        unsupportedFigures: previous.rejectedFigures[previous.rejectedFigures.length - 1],
        missingTopics: previous.missingTopics,
      };

      const result = await draftChapter(request, feedback);
      const record: ChapterAttempt = {
        ...previous,
        attempts: previous.attempts + 1,
        rejectedFigures: [...previous.rejectedFigures],
      };

      if (result.text) {
        const missing = findMissingTopics(result.text, request.mustCover, state.issuerData);
        record.missingTopics = missing;
        if (missing.length === 0) {
          record.outcome = "accepted-after-revision";
          record.text = result.text;
          drafts[chapterId] = result.text;
          log.push(`${chapterId}: recovered on revision ${record.attempts}.`);
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
