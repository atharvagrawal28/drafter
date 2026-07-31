import { NextRequest, NextResponse } from "next/server";
import { generateDocument, type NarrativeRequest } from "@/lib/engine/generate";
import { draftChapter, getModel, isLlmAvailable } from "@/lib/engine/llm";
import { refineDocument } from "@/lib/engine/refineGraph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 60 seconds is the ceiling on Vercel's Hobby plan, and this project is built
 * to run on free tiers. Asking for more is not a smaller risk — the platform
 * rejects the value at build time, so a higher number does not degrade, it
 * fails to deploy.
 */
export const maxDuration = 60;

/**
 * Model calls stop here, leaving the remainder of the window to assemble the
 * document, run the gap check and serialise the response. The loop then falls
 * back to deterministic templates for whatever it did not reach, so a slow or
 * rate-limited provider costs prose quality rather than the whole request.
 */
const DRAFTING_BUDGET_MS = 45_000;

/**
 * Generate the DRHP.
 *
 * Stateless by design: the issuer data arrives in the request, the document goes
 * back in the response, and nothing is written to disk or to a database. Pre-IPO
 * data therefore never rests on the server.
 *
 * Three paths, in descending order of capability, each degrading safely into the
 * next so a live demo cannot fail:
 *
 *   1. `refine`   — LangGraph self-correction loop (key present, default).
 *   2. `llm`      — single-pass drafting (key present, `refine: false`).
 *   3. `template` — deterministic templates (no key, or anything above threw).
 */
export async function POST(request: NextRequest) {
  // Absolute, and taken once: if the refine path burns time and then throws,
  // single-pass drafting inherits what is left rather than starting a fresh 45s.
  const deadlineAt = Date.now() + DRAFTING_BUDGET_MS;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const issuerData = body?.issuerData;
  if (!issuerData || typeof issuerData !== "object") {
    return NextResponse.json({ error: "issuerData is required" }, { status: 400 });
  }

  const issuerId = body?.issuerId ?? "custom";
  const llmAvailable = isLlmAvailable();
  const useLlm = llmAvailable && body?.useLlm !== false;
  const useRefine = useLlm && body?.refine !== false;

  // ---- Path 1: self-correcting loop ---------------------------------
  if (useRefine) {
    try {
      const { document, trace } = await refineDocument(issuerData, {
        issuerId,
        llmModel: getModel(),
        maxIterations: Number(body?.maxIterations) || 3,
        budgetMs: DRAFTING_BUDGET_MS,
      });
      return NextResponse.json({ document, refineTrace: trace, mode: "refine" });
    } catch (error) {
      // Fall through to single-pass rather than failing the request.
      console.error("[generate] refine loop failed, falling back:", error);
    }
  }

  // ---- Path 2: single-pass drafting ---------------------------------
  const rejections: { chapterId: string; figures: string[] }[] = [];
  const draftNarrative = useLlm
    ? async (narrativeRequest: NarrativeRequest) => {
        const result = await draftChapter(narrativeRequest, undefined, deadlineAt);
        if (result.rejected?.length) {
          rejections.push({ chapterId: narrativeRequest.chapterId, figures: result.rejected });
        }
        return result.text;
      }
    : undefined;

  try {
    const document = await generateDocument(issuerData, {
      issuerId,
      useLlm,
      llmModel: useLlm ? getModel() : undefined,
      draftNarrative,
      llmPriorityOnly: true,
    });

    return NextResponse.json({
      document,
      rejectedForUnsupportedFigures: rejections,
      mode: useLlm ? "llm" : "template",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed" },
      { status: 500 },
    );
  }
}
