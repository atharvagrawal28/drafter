import { NextResponse } from "next/server";
import { getModel, isLlmAvailable } from "@/lib/engine/llm";
import { registry } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tells the client whether language-model drafting is configured, so the UI can
 * state which mode it is in rather than leaving the judge to guess. The key
 * itself is never exposed.
 */
export async function GET() {
  const available = isLlmAvailable();
  return NextResponse.json({
    llmAvailable: available,
    model: available ? getModel() : null,
    registryVersion: registry.registry_version,
    regulationSet: registry.regulation_set,
  });
}
