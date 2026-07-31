/**
 * The effort meter — how long it actually takes to reach a draft.
 *
 * SEBI's outcome clause asks for a solution that "significantly reduc[es]
 * preparation time", and characterises the status quo as "often spanning
 * several months". That is a measurable claim, and until now Drafter answered
 * it with an adjective. This records the other side of the comparison.
 *
 * Three design decisions carry the honesty of the number:
 *
 *  1. **Only a real company is measured.** The bundled samples arrive at 97%
 *     coverage already filled in. Timing those would produce "97% in zero
 *     seconds", which is not a fast tool, it is an unread demo. The meter runs
 *     for the blank issuer and reports "not measured" otherwise.
 *
 *  2. **Idle time is capped, not excluded.** A promoter who leaves the tab open
 *     overnight did not work overnight, so a gap longer than the ceiling is
 *     counted as the ceiling rather than in full. But it is counted, not
 *     dropped — which means the meter slightly OVERSTATES effort. Every
 *     rounding decision here runs against our own claim on purpose; a
 *     measurement that flatters the person who wrote it is worth nothing.
 *
 *  3. **Nothing is reported until something is measured.** An empty log reports
 *     no duration at all rather than "0 min", because zero would read as a
 *     result rather than an absence.
 *
 * What this measures is stated precisely wherever it is shown: active promoter
 * effort inside Drafter to reach a given coverage. It is NOT the full offer
 * document preparation cycle, which also contains the auditor's restatement,
 * legal counsel's litigation review and the merchant banker's due diligence.
 * Those are unchanged by this tool and are most of the several months.
 */

/** A gap longer than this is counted as this much, not in full. */
export const IDLE_CEILING_MS = 120_000;

/** Coverage thresholds worth stamping a time against. */
export const MILESTONE_THRESHOLDS = [25, 50, 75, 90] as const;

export interface EffortMilestone {
  /** The threshold crossed, not the exact coverage at the time. */
  threshold: number;
  /** Active effort accumulated when it was crossed. */
  atActiveMs: number;
  /** How many field edits it took to get there. */
  atInteractions: number;
}

export interface EffortLog {
  /** Epoch ms of the first recorded interaction; null until one happens. */
  startedAt: number | null;
  /** Epoch ms of the most recent interaction, for accruing the next gap. */
  lastTickAt: number | null;
  /** Accumulated active effort, idle-capped. */
  activeMs: number;
  /** Field edits recorded. */
  interactions: number;
  /** Thresholds crossed, ascending, each recorded once. */
  milestones: EffortMilestone[];
  /** Active effort when the first draft was generated; null until then. */
  firstDraftAtMs: number | null;
}

export function emptyEffort(): EffortLog {
  return {
    startedAt: null,
    lastTickAt: null,
    activeMs: 0,
    interactions: 0,
    milestones: [],
    firstDraftAtMs: null,
  };
}

/**
 * Accrue the time since the last interaction and count this one.
 *
 * The first interaction accrues nothing — there is no earlier point to measure
 * from, and inventing one would start the clock before the promoter did.
 */
export function recordActivity(log: EffortLog, now: number = Date.now()): EffortLog {
  if (log.lastTickAt === null) {
    return { ...log, startedAt: now, lastTickAt: now, interactions: log.interactions + 1 };
  }

  // A clock that has gone backwards (system time change, a restored session
  // from a different machine) must not subtract from the total.
  const gap = Math.max(0, now - log.lastTickAt);

  return {
    ...log,
    lastTickAt: now,
    activeMs: log.activeMs + Math.min(gap, IDLE_CEILING_MS),
    interactions: log.interactions + 1,
  };
}

/**
 * Stamp the current effort against any coverage threshold newly crossed.
 *
 * Milestones are permanent. If the promoter later deletes an answer and
 * coverage falls back under 50%, the time at which they first reached 50%
 * still happened, and re-stamping it on the way back up would report the
 * detour rather than the achievement.
 */
export function recordCoverage(log: EffortLog, coveragePct: number): EffortLog {
  const already = new Set(log.milestones.map((milestone) => milestone.threshold));
  const crossed = MILESTONE_THRESHOLDS.filter(
    (threshold) => coveragePct >= threshold && !already.has(threshold),
  );
  if (crossed.length === 0) return log;

  return {
    ...log,
    milestones: [
      ...log.milestones,
      ...crossed.map((threshold) => ({
        threshold,
        atActiveMs: log.activeMs,
        atInteractions: log.interactions,
      })),
    ].sort((a, b) => a.threshold - b.threshold),
  };
}

/** Stamp the first generated draft. Only the first — later regenerations are not the milestone. */
export function recordDraft(log: EffortLog): EffortLog {
  if (log.firstDraftAtMs !== null) return log;
  return { ...log, firstDraftAtMs: log.activeMs };
}

/**
 * Render a duration for a reader.
 *
 * Returns null rather than "0 min" for an unmeasured log, so a caller cannot
 * accidentally print a zero that reads like a result.
 */
export function formatEffort(ms: number | null): string | null {
  if (ms === null || ms <= 0) return null;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60} min`;
}

export interface EffortSummary {
  /** False when there is nothing to report — a caller must say so, not print zeroes. */
  measured: boolean;
  activeLabel: string | null;
  firstDraftLabel: string | null;
  interactions: number;
  milestones: EffortMilestone[];
  /** What the number does and does not cover, for display next to it. */
  methodology: string;
}

export function summariseEffort(log: EffortLog): EffortSummary {
  return {
    measured: log.interactions > 0,
    activeLabel: formatEffort(log.activeMs),
    firstDraftLabel: formatEffort(log.firstDraftAtMs),
    interactions: log.interactions,
    milestones: log.milestones,
    methodology:
      `Active promoter effort inside Drafter, measured from the first answer. Pauses longer than ` +
      `${IDLE_CEILING_MS / 1000} seconds are counted as ${IDLE_CEILING_MS / 1000} seconds rather than ` +
      `discarded, so this figure if anything overstates the time taken. It does not include the ` +
      `auditor's restatement, legal counsel's litigation review or the merchant banker's due ` +
      `diligence, which are unchanged by this tool.`,
  };
}
