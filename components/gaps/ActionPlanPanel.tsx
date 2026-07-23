"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, ListTodo, TrendingUp } from "lucide-react";
import { useDrafter } from "@/lib/store";
import type { Action } from "@/lib/engine/actionPlan";
import { cn } from "@/lib/utils";
import { Badge, Card, CardContent, Progress } from "@/components/ui/primitives";

/**
 * "What do I do next?" — the question the coverage score does not answer.
 *
 * Ranked by coverage gained per question asked, so the top of the list is the
 * cheapest real progress rather than the biggest pile of work. Every number
 * here is computed with the same weighted formula that produces the score
 * itself, so the promise and the scoreboard cannot drift apart.
 */
export function ActionPlanPanel() {
  const { actionPlan } = useDrafter();
  const { actions, bankerActions, currentCoverage, projectedCoverage } = actionPlan;

  if (actions.length === 0 && bankerActions.length === 0) {
    return (
      <Card className="mb-6">
        <CardContent className="flex items-start gap-3 p-5">
          <ListTodo className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--status-complete))]" />
          <div className="text-[13px]">
            <p className="font-semibold text-[hsl(var(--status-complete))]">
              Nothing outstanding that Drafter can point you at.
            </p>
            <p className="mt-1 text-muted-foreground">
              Every applicable requirement with a collectable evidence field is discharged. What
              remains is review — the merchant banker&rsquo;s due diligence and the auditor&rsquo;s
              certifications.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const headroom = projectedCoverage - currentCoverage;

  return (
    <Card className="mb-6">
      <CardContent className="p-0">
        <div className="border-b border-border p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-primary" />
                <h2 className="font-serif text-[17px] font-bold text-primary">What to do next</h2>
              </div>
              <p className="mt-1 max-w-2xl text-[12.5px] text-muted-foreground">
                Ranked by coverage gained per question asked — the cheapest real progress first, not
                the biggest pile of work. Each figure is computed with the same weighted formula that
                produces the score above.
              </p>
            </div>

            {headroom > 0 ? (
              <div className="shrink-0 rounded-lg border border-border bg-secondary/40 px-4 py-2.5">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Answering everything below
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-[20px] font-bold tabular-nums text-muted-foreground">
                    {currentCoverage}%
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span className="text-[26px] font-bold tabular-nums text-[hsl(var(--status-complete))]">
                    {projectedCoverage}%
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          {headroom > 0 ? (
            <div className="mt-4">
              <Progress value={currentCoverage} className="h-2" />
              <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                {actions.reduce((sum, action) => sum + action.fields.length, 0)} questions across{" "}
                {actions.length} step{actions.length === 1 ? "" : "s"} stand between this draft and{" "}
                {projectedCoverage}% coverage.
              </p>
            </div>
          ) : null}
        </div>

        <ol className="divide-y divide-border">
          {actions.map((action, index) => (
            <ActionRow key={action.id} action={action} rank={index + 1} />
          ))}
        </ol>

        {bankerActions.length > 0 ? (
          <div className="border-t border-border bg-secondary/30 p-5">
            <div className="flex items-start gap-3">
              <BriefcaseBusiness className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <h3 className="text-[13px] font-semibold">Not yours to do — chase, don&rsquo;t draft</h3>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {bankerActions.reduce((sum, action) => sum + action.fields.length, 0)} item
                  {bankerActions.reduce((sum, action) => sum + action.fields.length, 0) === 1 ? "" : "s"}{" "}
                  are reserved to the merchant banker or the statutory auditor. They are excluded from
                  the projection above, because no amount of work by the promoter closes them — but
                  they are on the critical path, and they are commonly the last thing to arrive.
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {bankerActions
                    .flatMap((action) => action.fields)
                    .slice(0, 10)
                    .map((field) => (
                      <span
                        key={field.path}
                        className="rounded border border-border bg-background px-2 py-1 text-[11px]"
                      >
                        {field.label}
                      </span>
                    ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ActionRow({ action, rank }: { action: Action; rank: number }) {
  const [open, setOpen] = React.useState(rank <= 2);

  return (
    <li className="p-4">
      <button onClick={() => setOpen((value) => !value)} className="flex w-full items-start gap-3 text-left">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
          {rank}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[13.5px] font-semibold">{action.label}</span>
            <span className="text-[11.5px] text-muted-foreground">
              {action.fields.length} question{action.fields.length === 1 ? "" : "s"} · closes{" "}
              {action.requirementIds.length} requirement{action.requirementIds.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
                action.coverageGain >= 1
                  ? "bg-[hsl(var(--status-complete))]/[0.12] text-[hsl(var(--status-complete))]"
                  : "bg-secondary text-muted-foreground",
              )}
            >
              +{action.coverageGain.toFixed(1)} pp
            </span>
            <span className="text-[11.5px] text-muted-foreground">
              takes coverage to <span className="font-semibold tabular-nums">{action.cumulativeCoverage}%</span>
            </span>
            {action.stepNumber !== null ? (
              <Link
                href="/intake"
                onClick={(event) => event.stopPropagation()}
                className="text-[11.5px] font-medium text-primary hover:underline"
              >
                Open step {action.stepNumber} →
              </Link>
            ) : null}
          </div>
        </div>
      </button>

      {open ? (
        <div className="ml-9 mt-3 space-y-1.5">
          {action.fields.map((field) => (
            <div key={field.path} className="flex items-start gap-2 text-[12px]">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
              <span className="flex-1">{field.label}</span>
            </div>
          ))}
          <div className="flex flex-wrap gap-1 pt-1">
            {action.requirementIds.map((id) => (
              <Badge key={id} variant="outline">
                {id}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </li>
  );
}
