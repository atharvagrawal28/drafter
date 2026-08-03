/**
 * Replaying a captured drafting run, so the default experience costs nothing.
 *
 * WHY THIS EXISTS
 * The deployed app is public and the "Generate draft" button spends a shared
 * free-tier quota. Measured: five narrative chapters at
 * WORST_CASE_PROMPT_TOKENS + MAX_COMPLETION_TOKENS each is 30,000 tokens
 * reserved per run, against a 100,000 token daily cap. Three visitors exhaust
 * the day. The fourth does not see an error, because the fallback is doing its
 * job: they see a complete document whose narrative quietly came from
 * deterministic templates, with a Drafting Record showing every chapter
 * degraded. That is the worst outcome available, since it is indistinguishable
 * from success unless you know what to look for.
 *
 * There is a second problem stacked on the first. The Drafting Record is the
 * screen that shows the model being caught inventing a figure, and it is empty
 * until somebody presses a button and waits 45 seconds. A visitor who reads for
 * two minutes and leaves never sees it at all.
 *
 * So a real run against each bundled sample is captured ahead of time and
 * replayed on load. No provider call, no wait, no quota.
 *
 * WHAT IS ACTUALLY STORED, AND WHY IT IS NOT THE DOCUMENT
 * Only the trace of what the loop did. The trace already carries each chapter's
 * accepted prose in `ChapterAttempt.text`, which is exactly what
 * `draftNarrative` has to hand back, so there is one copy of the prose and no
 * second place for it to drift. Everything else is regenerated deterministically
 * in the browser at load time from the issuer data, by the same
 * `generateDocument` the live path uses.
 *
 * That split is deliberate, and it is not just about file size:
 *
 *   the factual chapters, every table, and every computed figure are produced
 *   fresh, so they cannot drift away from the engine that a reviewer is about
 *   to read the source of
 *
 *   the only thing replayed is the part that genuinely came from a model and
 *   genuinely cannot be recomputed
 *
 * A stored document would have been a snapshot that slowly stopped matching the
 * code. This cannot: change the generator and the reference draft changes with
 * it, because it IS the generator, running now, over prose captured then.
 *
 * HONESTY
 * A replayed draft must never present itself as something that just happened.
 * `capturedAt` and the models used are carried through to the interface, and
 * the Drafting Record says which of the two it is showing.
 */

import { generateDocument, type NarrativeRequest } from "./generate";
import type { RefineTrace } from "./refineGraph";
import type { DrhpDocument, IssuerData } from "../types";

import autocomp from "@/data/reference_drafts/autocomp.json";
import specchem from "@/data/reference_drafts/specchem.json";

export interface ReferenceDraft {
  issuerId: string;
  /** ISO date of the run this was captured from. */
  capturedAt: string;
  /** Models that actually wrote the accepted chapters, in the order used. */
  models: string[];
  /**
   * What the loop did, verbatim from the captured run. The accepted prose lives
   * in `trace.chapters[].text`, so this is also the replay source.
   */
  trace: RefineTrace;
}

/** Accepted prose from a captured run, keyed by chapter id. */
function draftedChapters(reference: ReferenceDraft): Record<string, string> {
  const drafts: Record<string, string> = {};
  for (const chapter of reference.trace.chapters) {
    // A chapter that fell back to a template has no text, and must stay that
    // way on replay: handing back an empty string would present a template as
    // though a model had written it.
    if (chapter.text?.trim()) drafts[chapter.chapterId] = chapter.text;
  }
  return drafts;
}

const REFERENCE_DRAFTS: Record<string, ReferenceDraft> = {
  autocomp: autocomp as unknown as ReferenceDraft,
  specchem: specchem as unknown as ReferenceDraft,
};

export function hasReferenceDraft(issuerId: string): boolean {
  return issuerId in REFERENCE_DRAFTS;
}

export function getReferenceDraft(issuerId: string): ReferenceDraft | null {
  return REFERENCE_DRAFTS[issuerId] ?? null;
}

/**
 * Rebuild the document for a bundled sample, using captured narrative prose.
 *
 * Returns null for an issuer with no capture, which is the correct answer for a
 * real company started from a blank form: there is nothing to replay, and
 * inventing something would be exactly the failure this product exists to
 * prevent.
 */
export async function buildReferenceDocument(
  issuerId: string,
  issuerData: IssuerData,
): Promise<{ document: DrhpDocument; trace: RefineTrace; capturedAt: string } | null> {
  const reference = getReferenceDraft(issuerId);
  if (!reference) return null;

  const drafts = draftedChapters(reference);
  const document = await generateDocument(issuerData, {
    issuerId,
    useLlm: true,
    llmModel: reference.models[0],
    // The replay itself. A chapter with no captured text returns null, which
    // the generator already handles by taking its deterministic template, so a
    // partial capture degrades exactly the way a partial live run does.
    draftNarrative: async (request: NarrativeRequest) => drafts[request.chapterId] ?? null,
    llmPriorityOnly: true,
  });

  return { document, trace: reference.trace, capturedAt: reference.capturedAt };
}
