/**
 * Capture a real drafting run per sample issuer, for replay without quota.
 *
 *   npm run capture:reference            both samples
 *   npm run capture:reference autocomp   one of them
 *
 * The output lands in data/reference_drafts/ and IS committed: it is what the
 * deployed app serves on load, so it has to travel with the code. See
 * lib/engine/referenceDraft.ts for why only the narrative prose is stored.
 *
 * WHY THE BUDGET IS NOT RAISED HERE
 * It would be easy to give the loop five minutes locally and capture a better
 * document than production can produce in its 45-second window. That would make
 * the reference draft a thing the live path cannot reproduce, and the whole
 * point is that pressing "Generate draft" runs the same work again. So the
 * capture runs against the SAME budget the route uses. What is shipped is a
 * representative run, not a best-of.
 *
 * WHAT THIS REFUSES TO WRITE
 * A capture whose trace records no rejected figures is not an error, but it is
 * a bad thing to ship, because the rejection is the single most valuable thing
 * on the Drafting Record. The script says so loudly and leaves the existing
 * file alone unless --force is passed, so a re-run cannot silently replace a
 * good capture with a duller one.
 */

import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { sampleIssuers } from "../lib/data";
import { refineDocument } from "../lib/engine/refineGraph";
import { getModel, isLlmAvailable, resetModelHealth } from "../lib/engine/llm";

config({ path: ".env.local" });

const OUT_DIR = path.join(process.cwd(), "data", "reference_drafts");
const BUDGET_MS = 45_000; // identical to app/api/generate/route.ts

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.find((arg) => !arg.startsWith("--"));

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

async function capture(issuerId: string) {
  const issuer = sampleIssuers.find((candidate) => candidate.id === issuerId);
  if (!issuer) throw new Error(`Unknown issuer: ${issuerId}`);

  console.log(`\n${bold(issuer.name)}  (${issuerId})`);
  resetModelHealth();

  const startedAt = Date.now();
  const { trace } = await refineDocument(issuer.data, {
    issuerId,
    llmModel: getModel(),
    maxIterations: 3,
    budgetMs: BUDGET_MS,
  });
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  const captured = trace.chapters.filter((chapter) => chapter.text?.trim());
  // rejectedFigures is per attempt, so it is an array of arrays.
  const rejected = trace.chapters.flatMap((chapter) => (chapter.rejectedFigures ?? []).flat());
  const models = [...new Set(trace.chapters.map((chapter) => chapter.model).filter(Boolean))];

  console.log(`  ${elapsed}s, ${captured.length} of ${trace.chapters.length} chapters drafted`);
  console.log(`  models: ${models.join(", ") || "(none)"}`);
  console.log(
    `  accepted first pass ${trace.chapters.filter((c) => c.outcome === "accepted").length}` +
      `, recovered ${trace.recoveredChapters.length}` +
      `, fell back ${trace.fellBackChapters.length}`,
  );

  const outPath = path.join(OUT_DIR, `${issuerId}.json`);
  const exists = fs.existsSync(outPath);

  if (!captured.length) {
    console.log(red(`  REFUSED: nothing was drafted. Check the key and the daily cap.`));
    return false;
  }

  if (rejected.length) {
    console.log(green(`  rejected figures: ${rejected.join(", ")}`));
  } else {
    console.log(
      yellow(
        `  No figure was rejected in this run. The Drafting Record is at its most\n` +
          `  convincing when it shows the model being caught, and whether that\n` +
          `  happens is up to the model, so re-running is worth a try.`,
      ),
    );
  }

  // Compare against what is already shipped rather than against perfection: the
  // guard exists to stop a re-run replacing a good capture with a duller one,
  // not to stop it improving on an equally dull one.
  //
  // "Better" here means better AS A RECORD OF THE LOOP WORKING, which is not
  // the same as a cleaner run, and getting that backwards has already cost one
  // good capture. An earlier version of this guard ranked on rejected figures
  // and fallbacks only, so a run where all five chapters were accepted first
  // pass silently replaced one where a chapter had been caught missing a
  // required topic, redrafted, and accepted from a different model after the
  // first ran out of quota. The second is the flawless run. The first is the
  // one that shows there is a loop at all.
  const value = (counts: { rejected: number; recovered: number; fellBack: number }) =>
    [counts.rejected, counts.recovered, -counts.fellBack];

  const mine = {
    rejected: rejected.length,
    recovered: trace.recoveredChapters.length,
    fellBack: trace.fellBackChapters.length,
  };

  if (!force && exists) {
    const previous = JSON.parse(fs.readFileSync(outPath, "utf8")) as {
      trace: { chapters: { rejectedFigures?: string[][]; outcome: string }[] };
    };
    const theirs = {
      rejected: previous.trace.chapters.flatMap((c) => (c.rejectedFigures ?? []).flat()).length,
      recovered: previous.trace.chapters.filter((c) => c.outcome === "accepted-after-revision")
        .length,
      fellBack: previous.trace.chapters.filter((c) => c.outcome === "fell-back-to-template").length,
    };

    const [a, b] = [value(mine), value(theirs)];
    const worse = a.some((score, index) => score < b[index]) && !a.some((s, i) => s > b[i]);
    if (worse) {
      console.log(
        yellow(
          `  Keeping the existing ${issuerId}.json, which shows more of the loop working\n` +
            `  (${theirs.rejected} refused, ${theirs.recovered} recovered, ${theirs.fellBack} fell back` +
            ` against ${mine.rejected}/${mine.recovered}/${mine.fellBack}).\n` +
            `  Pass --force to overwrite it anyway.`,
        ),
      );
      return false;
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        issuerId,
        capturedAt: new Date().toISOString(),
        models,
        // The prose rides along inside trace.chapters[].text. Storing it a
        // second time here would create two copies that can disagree.
        trace,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
  console.log(green(`  wrote data/reference_drafts/${issuerId}.json (${kb} KB)`));
  return true;
}

async function main() {
  if (!isLlmAvailable()) {
    console.log(red("\nNo GROQ_API_KEY. A reference draft has to come from a real run.\n"));
    process.exit(1);
  }

  console.log(bold("\nCapturing reference drafts"));
  console.log(`Budget ${BUDGET_MS / 1000}s per issuer, the same one the route uses.`);

  const targets = only ? [only] : sampleIssuers.map((issuer) => issuer.id);
  let written = 0;
  for (const [index, issuerId] of targets.entries()) {
    // Back-to-back captures share the per-minute token bucket, and the second
    // one pays for the first: the initial run of this script rate-limited
    // Risk Factors out of the specchem capture entirely, three attempts in a
    // row, and shipped it as a template. The minute is cheap; the capture is
    // not, and it is the thing visitors see by default.
    if (index > 0) {
      console.log(`\n  waiting 65s for the per-minute token bucket to refill`);
      await new Promise((resolve) => setTimeout(resolve, 65_000));
    }
    if (await capture(issuerId)) written += 1;
  }

  console.log(`\n${written} of ${targets.length} captured.\n`);
  if (written < targets.length) process.exit(1);
}

main().catch((error) => {
  console.error(red(`\nCapture failed: ${error?.message ?? error}\n`));
  process.exit(1);
});
