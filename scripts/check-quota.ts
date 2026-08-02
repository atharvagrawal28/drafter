/**
 * Is there enough model quota left to record the demo?
 *
 * WHY THIS EXISTS
 * The free tier meters each model separately and the binding cap is tokens per
 * DAY, not per minute — a run can fail on quota while the per-minute header
 * still reads a comfortable 12,000. Rehearsing a demo four or five times is
 * enough to exhaust the primary model, and the failure is silent in the worst
 * possible way: the document still generates, the narrative chapters just come
 * back as deterministic templates. The recording looks fine and the AI story
 * has quietly disappeared from it.
 *
 * Run this immediately before recording.
 *
 *   npm run check:quota
 *
 * The probe reserves a large completion deliberately. Groq checks the limit
 * against the RESERVATION but deducts the ACTUAL completion, so an oversized
 * request either reports the exact remaining budget or costs about forty
 * tokens. Both outcomes are cheap; only one is informative.
 */

import { config } from "dotenv";
import { MODEL_CHAIN } from "../lib/engine/llm";

config({ path: ".env.local" });

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

/** A full generation costs roughly this much against the daily budget. */
const TOKENS_PER_GENERATION = 16_000;

interface Probe {
  model: string;
  ok: boolean;
  limit?: number;
  used?: number;
  retryIn?: string;
  note?: string;
}

async function probe(model: string, key: string): Promise<Probe> {
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with exactly one word: ok" }],
        max_tokens: 4000,
      }),
    });

    const body: any = await response.json();
    const message: string = body?.error?.message ?? "";

    if (/does not exist|not found|decommissioned/i.test(message)) {
      return { model, ok: false, note: "model unavailable on this key" };
    }

    const used = message.match(/Used (\d+)/);
    const limit = message.match(/Limit (\d+)/);
    const again = message.match(/try again in ([\dhms.]+)/i);

    if (used && limit) {
      return {
        model,
        ok: false,
        used: Number(used[1]),
        limit: Number(limit[1]),
        retryIn: again?.[1],
      };
    }

    if (response.ok) return { model, ok: true };

    // A 413 means the reservation exceeded the per-minute bucket, which tells
    // us nothing about the daily budget — the model is still usable.
    if (response.status === 413) return { model, ok: true, note: "per-minute bucket is smaller than the probe" };

    return { model, ok: false, note: `HTTP ${response.status}` };
  } catch (error) {
    return { model, ok: false, note: error instanceof Error ? error.message : "request failed" };
  }
}

async function main() {
  const key = (process.env.GROQ_API_KEY ?? "").trim();
  if (!key || key === "your_groq_key_here") {
    console.log(`\n${RED}${BOLD}No GROQ_API_KEY configured.${RESET}`);
    console.log(`Drafting will run on deterministic templates. The document, the coverage score`);
    console.log(`and every check behave identically — but there will be no narrative drafting`);
    console.log(`to record, and the Drafting Record will be empty.\n`);
    process.exit(1);
  }

  console.log(`\n${BOLD}Model quota — check this immediately before recording${RESET}\n`);

  const results: Probe[] = [];
  for (const model of MODEL_CHAIN) {
    results.push(await probe(model, key));
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  for (const result of results) {
    if (result.ok) {
      console.log(
        `  ${GREEN}available${RESET}  ${result.model.padEnd(40)}` +
          (result.note ? ` ${DIM}${result.note}${RESET}` : ""),
      );
    } else if (result.limit !== undefined && result.used !== undefined) {
      const left = result.limit - result.used;
      const runs = Math.floor(left / TOKENS_PER_GENERATION);
      console.log(
        `  ${RED}spent${RESET}      ${result.model.padEnd(40)} ` +
          `${left.toLocaleString()} of ${result.limit.toLocaleString()} tokens left` +
          (runs > 0 ? ` ${DIM}(~${runs} generations)${RESET}` : ` ${DIM}(none)${RESET}`) +
          (result.retryIn ? ` ${DIM}· frees in ${result.retryIn}${RESET}` : ""),
      );
    } else {
      console.log(`  ${YELLOW}unknown${RESET}    ${result.model.padEnd(40)} ${DIM}${result.note}${RESET}`);
    }
  }

  const live = results.filter((r) => r.ok);
  console.log("");

  if (live.length === 0) {
    console.log(`${RED}${BOLD}Do not record now.${RESET}`);
    console.log(`Every model in the chain is out of quota. Narrative chapters would come back as`);
    console.log(`deterministic templates and the Drafting Record would be empty — the recording`);
    console.log(`would look fine and quietly contain none of the drafting.\n`);
    process.exit(1);
  }

  if (live.length < MODEL_CHAIN.length) {
    console.log(`${YELLOW}${BOLD}Usable, with less headroom than usual.${RESET}`);
    console.log(
      `${live.length} of ${MODEL_CHAIN.length} models have quota. Drafting will fall down the chain,`,
    );
    console.log(`so chapters may be written by different models — which is worth narrating rather`);
    console.log(`than hiding. Record the drafting beat first.\n`);
    process.exit(0);
  }

  console.log(`${GREEN}${BOLD}Good to record.${RESET}`);
  console.log(`All ${MODEL_CHAIN.length} models have quota. Record the drafting beat first anyway —`);
  console.log(`it is the only part of the demo that cannot be re-shot for free.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
