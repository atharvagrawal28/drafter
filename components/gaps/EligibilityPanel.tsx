"use client";

import * as React from "react";
import { CheckCircle2, ChevronDown, CircleHelp, Gavel, XCircle } from "lucide-react";
import { useDrafter } from "@/lib/store";
import type { ConditionState, EligibilityCondition } from "@/lib/engine/eligibility";
import { cn } from "@/lib/utils";
import { Badge, Card, CardContent } from "@/components/ui/primitives";
import { Explain } from "@/components/ui/Explain";

const STATE_META: Record<
  ConditionState,
  { label: string; icon: typeof CheckCircle2; tone: string; ring: string }
> = {
  met: {
    label: "Satisfied",
    icon: CheckCircle2,
    tone: "text-[hsl(var(--status-complete))]",
    ring: "border-[hsl(var(--status-complete))]/30",
  },
  "not-met": {
    label: "Not satisfied",
    icon: XCircle,
    tone: "text-[hsl(var(--status-defect))]",
    ring: "border-[hsl(var(--status-defect))]/40 bg-[hsl(var(--status-defect))]/[0.04]",
  },
  unknown: {
    label: "Not yet answerable",
    icon: CircleHelp,
    tone: "text-[hsl(var(--status-partial))]",
    ring: "border-[hsl(var(--status-partial))]/30",
  },
};

const VERDICT_META = {
  ineligible: {
    tone: "text-[hsl(var(--status-defect))]",
    frame: "border-[hsl(var(--status-defect))] bg-[hsl(var(--status-defect))]/[0.07]",
    icon: XCircle,
  },
  indeterminate: {
    tone: "text-[hsl(var(--status-partial))]",
    frame: "border-[hsl(var(--status-partial))] bg-[hsl(var(--status-partial))]/[0.07]",
    icon: CircleHelp,
  },
  "eligible-on-the-figures": {
    tone: "text-[hsl(var(--status-complete))]",
    frame: "border-[hsl(var(--status-complete))] bg-[hsl(var(--status-complete))]/[0.07]",
    icon: CheckCircle2,
  },
} as const;

/**
 * The eligibility gate, shown above the disclosure report.
 *
 * Order is the argument. A promoter reading a 59%-coverage score learns what to
 * write next; a promoter reading "Regulation 229(6) is not satisfied" learns
 * that writing anything is premature. The second fact has to come first, and it
 * has to be legible without opening anything.
 */
export function EligibilityPanel() {
  const { eligibility } = useDrafter();

  // Derived, not initialised. The store hydrates from localStorage after the
  // first render, so seeding this from the verdict once would leave a failing
  // issuer's conditions collapsed — the one case where they must be open.
  // `override` records an explicit click and otherwise stays out of the way.
  const [override, setOverride] = React.useState<boolean | null>(null);
  const open = override ?? eligibility.verdict.level !== "eligible-on-the-figures";
  const setOpen = (next: boolean | ((value: boolean) => boolean)) =>
    setOverride(typeof next === "function" ? next(open) : next);

  const meta = VERDICT_META[eligibility.verdict.level];
  const Icon = meta.icon;

  const blocking = eligibility.conditions.filter((c) => c.applicable && c.state === "not-met");
  const unanswered = eligibility.conditions.filter((c) => c.applicable && c.state === "unknown");
  const ordered = [
    ...blocking,
    ...unanswered,
    ...eligibility.conditions.filter((c) => !blocking.includes(c) && !unanswered.includes(c)),
  ];

  return (
    <Card className="mb-6 overflow-hidden">
      <div className={cn("border-l-[3px] p-5", meta.frame)}>
        <div className="flex items-start gap-3">
          <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", meta.tone)} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Explain term="eligibility gate">Eligibility gate</Explain> ·{" "}
                <Explain term="Chapter IX">Chapter IX</Explain>
              </span>
              <Badge variant="secondary">Reg 228 · 229 · 230(1)</Badge>
            </div>
            <h2 className={cn("mt-1.5 font-serif text-[19px] font-bold leading-snug", meta.tone)}>
              {eligibility.verdict.headline}
            </h2>
            <p className="mt-1.5 max-w-4xl text-[13px] leading-relaxed text-muted-foreground">
              {eligibility.verdict.detail}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px]">
              <Tally count={eligibility.counts.met} label="satisfied" tone="text-[hsl(var(--status-complete))]" />
              <Tally count={eligibility.counts.notMet} label="not satisfied" tone="text-[hsl(var(--status-defect))]" />
              <Tally count={eligibility.counts.unknown} label="unanswered" tone="text-[hsl(var(--status-partial))]" />
              {eligibility.counts.notApplicable > 0 ? (
                <Tally count={eligibility.counts.notApplicable} label="not applicable" tone="text-muted-foreground" />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <CardContent className="p-0">
        <button
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center justify-between border-t border-border px-5 py-2.5 text-left text-[12.5px] font-medium hover:bg-secondary/40"
        >
          <span className="flex items-center gap-2">
            <Gavel className="h-3.5 w-3.5 text-muted-foreground" />
            {open ? "Hide" : "Show"} the {eligibility.conditions.length} conditions, each with the provision it tests
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
        </button>

        {open ? (
          <div className="space-y-2 border-t border-border p-4">
            {ordered.map((condition) => (
              <ConditionRow key={condition.id} condition={condition} />
            ))}
            <p className="px-1 pt-2 text-[11.5px] leading-relaxed text-muted-foreground">
              Assessed against {eligibility.regulationSet}. The SME exchange applies its own track-record
              and net-worth criteria under Regulation 229(3), which are not tested here. Eligibility is
              confirmed by the merchant banker in due diligence — this is a pre-screen, so that a
              disqualifying condition is found in week one rather than month three.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Tally({ count, label, tone }: { count: number; label: string; tone: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={cn("text-[15px] font-bold tabular-nums", count === 0 ? "text-muted-foreground" : tone)}>
        {count}
      </span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function ConditionRow({ condition }: { condition: EligibilityCondition }) {
  const meta = STATE_META[condition.state];
  const Icon = meta.icon;
  const dimmed = !condition.applicable;

  return (
    <div className={cn("rounded-lg border p-3.5", dimmed ? "border-border opacity-60" : meta.ring)}>
      <div className="flex items-start gap-2.5">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", dimmed ? "text-muted-foreground" : meta.tone)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10.5px] font-semibold text-muted-foreground">{condition.source}</span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                dimmed ? "text-muted-foreground" : meta.tone,
              )}
            >
              {dimmed ? "Not applicable" : meta.label}
            </span>
          </div>

          <p className="mt-1 text-[12.5px] leading-relaxed">{condition.requirement}</p>
          <p className="mt-1.5 text-[12.5px] font-medium leading-relaxed">{condition.finding}</p>

          {condition.values?.length ? (
            <div className="mt-2 overflow-x-auto">
              <table className="text-[11.5px]">
                <tbody>
                  {condition.values.map((value) => (
                    <tr key={value.label}>
                      <td className="py-0.5 pr-4 text-muted-foreground">{value.label}</td>
                      <td className="py-0.5 font-medium tabular-nums">{value.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {condition.action ? (
            <p className="mt-2 rounded border-l-2 border-border bg-secondary/40 py-1.5 pl-2.5 pr-2 text-[11.5px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">What to do: </span>
              {condition.action}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
