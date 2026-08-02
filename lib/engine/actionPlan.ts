/**
 * The gap report, turned into a plan.
 *
 * WHY THIS EXISTS
 * A promoter looking at "coverage 59%, 20 requirements missing" has been told
 * what is wrong and nothing about what to do. The 20 items are not equal: some
 * are one field away from complete, some need an auditor, some need the
 * merchant banker, and some sit behind a single wizard step that would close
 * six requirements in one sitting.
 *
 * So this ranks the remaining work by **coverage gained per question asked**,
 * groups it by the intake step where the answers actually live, and states the
 * arithmetic: answer these six questions and the score moves from 59% to 71%.
 *
 * THE PROJECTION IS COMPUTED THE SAME WAY THE SCORE IS
 * ----------------------------------------------------
 * `coveragePct` is a weighted mean over applicable requirements — Complete 1,
 * Partial 0.5, everything else 0. The projection re-runs exactly that formula
 * with the affected items set to Complete, rather than estimating. If the two
 * ever disagreed, the plan would be promising a number the report would then
 * refuse to show, which is the fastest way to lose a user's trust in both.
 *
 * WHAT IT WILL NOT DO
 * It does not tell the issuer to do the banker's or the auditor's work. Items
 * whose fulfilment is `banker_certification` are surfaced as a separate,
 * clearly-labelled list — visible, because the promoter needs to chase them,
 * but never mixed into "questions you can answer now".
 */

import { questionnaire } from "../data";
import type { GapReport, RequirementResult, RequirementStatus } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActionOwner = "issuer" | "banker" | "drafter";

export interface ActionField {
  path: string;
  /** The question as the wizard asks it, so the action is followable. */
  label: string;
}

export interface Action {
  id: string;
  /** Where the answers live, e.g. "Step 5 · The Issue & Capital Structure". */
  label: string;
  stepNumber: number | null;
  owner: ActionOwner;
  fields: ActionField[];
  requirementIds: string[];
  /** Percentage points of overall coverage this action would add. */
  coverageGain: number;
  /** Overall coverage once this action and everything above it is done. */
  cumulativeCoverage: number;
}

export interface ActionPlan {
  currentCoverage: number;
  /** Coverage if every issuer action in the plan were completed. */
  projectedCoverage: number;
  actions: Action[];
  /** Items only the merchant banker or auditor can discharge. */
  bankerActions: Action[];
  /** Requirements with no evidence field left outstanding — nothing to do. */
  alreadyComplete: number;
}

// ---------------------------------------------------------------------------
// Coverage arithmetic — kept identical to gapCheck's
// ---------------------------------------------------------------------------

function weightFor(status: RequirementStatus): number {
  if (status === "Complete") return 1;
  if (status === "Partial") return 0.5;
  return 0;
}

/**
 * Coverage as an exact percentage, NOT rounded.
 *
 * Rounding here and then differencing loses every gain below one point: a step
 * worth 1.35pp reads as "+0pp", which tells the promoter their work is pointless.
 * Round once, at the edge, for display.
 */
function coverageOf(items: RequirementResult[], completed: Set<string>): number {
  const applicable = items.filter((item) => item.status !== "Not applicable");
  if (!applicable.length) return 0;
  const total = applicable.reduce(
    (sum, item) => sum + (completed.has(item.id) ? 1 : weightFor(item.status)),
    0,
  );
  return (total / applicable.length) * 100;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

// ---------------------------------------------------------------------------
// Field → wizard step
// ---------------------------------------------------------------------------

interface QuestionIndexEntry {
  stepNumber: number;
  stepTitle: string;
  label: string;
}

/** Every issuer-data path the wizard can write, and where it asks for it. */
function buildQuestionIndex(): Map<string, QuestionIndexEntry> {
  const index = new Map<string, QuestionIndexEntry>();

  for (const step of (questionnaire as any).steps ?? []) {
    for (const question of step.questions ?? []) {
      const record = (path: string, label: string) => {
        if (!index.has(path)) {
          index.set(path, { stepNumber: step.step, stepTitle: step.title, label });
        }
      };
      if (question.path) record(question.path, question.label);
      // A series question owns one field per metric, each with its own label.
      for (const row of question.rows ?? []) record(row.path, `${question.label}: ${row.label}`);
    }
  }

  return index;
}

const QUESTIONS = buildQuestionIndex();

function humanisePath(path: string): string {
  const parts = path.split(".");
  const leaf = parts[parts.length - 1].replace(/_/g, " ");
  return leaf.charAt(0).toUpperCase() + leaf.slice(1);
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

export function buildActionPlan(report: GapReport): ActionPlan {
  const outstanding = report.items.filter(
    (item) =>
      item.status !== "Not applicable" &&
      item.status !== "Complete" &&
      item.fieldsMissing.length > 0,
  );

  /** Group key → the fields, requirements and metadata for one action. */
  interface Bucket {
    stepNumber: number | null;
    label: string;
    owner: ActionOwner;
    fields: Map<string, string>;
    requirementIds: Set<string>;
  }

  const buckets = new Map<string, Bucket>();

  for (const item of outstanding) {
    // Who has to act. The registry already records this; the plan just refuses
    // to put the banker's work on the promoter's list.
    const owner: ActionOwner =
      item.fulfilment === "banker_certification"
        ? "banker"
        : item.fulfilment === "standard_clause"
          ? "drafter"
          : "issuer";

    for (const path of item.fieldsMissing) {
      const question = QUESTIONS.get(path);
      // Group by wizard step whenever the wizard asks for the field, whatever
      // the fulfilment is. A standard clause still needs the issuer's own
      // particulars merged into it, and those are asked for on the same screen
      // as everything else — keying those separately split one step into two
      // identically-labelled actions.
      const key =
        owner === "banker" ? "banker" : question ? `step-${question.stepNumber}` : `other-${path.split(".")[0]}`;

      if (!buckets.has(key)) {
        buckets.set(key, {
          stepNumber: question?.stepNumber ?? null,
          label:
            owner === "banker"
              ? "Reserved to the merchant banker or auditor"
              : question
                ? `Step ${question.stepNumber} · ${question.stepTitle}`
                : `Other: ${humanisePath(path.split(".")[0])}`,
          owner,
          fields: new Map(),
          requirementIds: new Set(),
        });
      }

      const bucket = buckets.get(key)!;
      bucket.fields.set(path, question?.label ?? humanisePath(path));
      bucket.requirementIds.add(item.id);
    }
  }

  // ---- Coverage gain, computed per bucket ----------------------------
  //
  // A requirement only completes when ALL of its missing fields are supplied,
  // and its fields can be spread across several steps. So a bucket is credited
  // only with the requirements it finishes on its own — anything it merely
  // advances is credited to the step that closes it. That is why the gains sum
  // to the projection rather than overshooting it, which a naive per-bucket
  // count would do.
  const current = report.coveragePct;
  const claimed = new Set<string>();

  const draft = Array.from(buckets.entries()).map(([id, bucket]) => {
    const fieldPaths = new Set(bucket.fields.keys());
    const finished = Array.from(bucket.requirementIds).filter((requirementId) => {
      const item = report.items.find((candidate) => candidate.id === requirementId)!;
      return item.fieldsMissing.every((path) => fieldPaths.has(path));
    });
    return { id, bucket, finished };
  });

  // Rank by coverage gained per question asked — the honest definition of
  // "what should I do first", rather than by raw gain, which would always send
  // the promoter to the largest step regardless of effort.
  const ranked = draft
    .map((entry) => {
      const standalone = coverageOf(report.items, new Set(entry.finished)) - current;
      return { ...entry, standalone, efficiency: standalone / Math.max(entry.bucket.fields.size, 1) };
    })
    .sort((a, b) => {
      if (a.bucket.owner !== b.bucket.owner) return a.bucket.owner === "banker" ? 1 : -1;
      if (b.efficiency !== a.efficiency) return b.efficiency - a.efficiency;
      return b.standalone - a.standalone;
    });

  const actions: Action[] = [];
  const bankerActions: Action[] = [];
  let running = current;

  // Fields supplied by this action AND every action above it. A requirement
  // whose evidence is spread across two steps completes at the second one —
  // crediting it to neither, as a per-bucket test does, made the final
  // cumulative fall short of the projection by exactly those requirements.
  const coveredFields = new Set<string>();

  for (const entry of ranked) {
    // MARGINAL gain, in rank order — what this step adds once everything above
    // it is done. Ranking on standalone gain and then displaying standalone
    // gain against a cumulative total made the two columns disagree: a step
    // could show "+1pp" beside a total that had moved seven points.
    const before = running;
    for (const path of entry.bucket.fields.keys()) coveredFields.add(path);
    for (const item of outstanding) {
      if (item.fieldsMissing.every((path) => coveredFields.has(path))) claimed.add(item.id);
    }
    running = coverageOf(report.items, new Set(claimed));

    const action: Action = {
      id: entry.id,
      label: entry.bucket.label,
      stepNumber: entry.bucket.stepNumber,
      owner: entry.bucket.owner,
      fields: Array.from(entry.bucket.fields, ([path, label]) => ({ path, label })),
      requirementIds: Array.from(entry.bucket.requirementIds).sort(),
      coverageGain: round1(running - before),
      cumulativeCoverage: Math.round(running),
    };

    if (entry.bucket.owner === "banker") bankerActions.push(action);
    else actions.push(action);
  }

  // The projection counts only what the issuer can actually do. Including the
  // banker's items would advertise a number the promoter cannot reach alone.
  const issuerFields = new Set(actions.flatMap((action) => action.fields.map((field) => field.path)));
  const reachable = new Set(
    report.items
      .filter(
        (item) =>
          item.status !== "Not applicable" &&
          item.status !== "Complete" &&
          item.fieldsMissing.length > 0 &&
          item.fieldsMissing.every((path) => issuerFields.has(path)),
      )
      .map((item) => item.id),
  );

  return {
    currentCoverage: Math.round(current),
    projectedCoverage: Math.round(coverageOf(report.items, reachable)),
    actions,
    bankerActions,
    alreadyComplete: report.counts.complete,
  };
}
