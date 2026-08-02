"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RefreshCw, Scale } from "lucide-react";
import { registry } from "@/lib/data";
import type { ClassifiedItem, Relevance, WatchResult } from "@/lib/circulars/types";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, CardContent } from "@/components/ui/primitives";

const LABEL: Record<Relevance, string> = {
  "chapter-ix": "Chapter IX, SME issues",
  icdr: "ICDR / offer documents",
  "market-wide": "Market-wide",
  "not-relevant": "Not relevant",
};

const TONE: Record<Relevance, string> = {
  "chapter-ix": "border-destructive/40 bg-destructive/[0.05]",
  icdr: "border-[hsl(var(--status-partial))]/40 bg-[hsl(var(--status-partial))]/[0.05]",
  "market-wide": "border-border bg-secondary/30",
  "not-relevant": "border-border",
};

function formatDate(iso: string | null): string {
  if (!iso) return "date not stated";
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function RegulationWatch() {
  const [watch, setWatch] = React.useState<WatchResult | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/circulars", { cache: "no-store" });
      if (!response.ok) throw new Error(`The circulars route returned ${response.status}.`);
      setWatch(await response.json());
    } catch (error) {
      // Never leave this null. The route itself fails soft — it returns 200
      // with an `error` string rather than throwing — so the only way to reach
      // here is a network failure or an offline browser. Setting null used to
      // render NOTHING below the rule-set card: no spinner, no error, no empty
      // state, because every one of those branches requires `watch`. A blank
      // panel during a demo reads as a broken product, which is worse than the
      // failure it is hiding. Synthesise a result that says what happened.
      setWatch({
        fetchedAt: new Date().toISOString(),
        registryVersion: registry.registry_version,
        regulationSetAsAt: (registry as any).regulation_set_as_at ?? "2025-03-08",
        source: "SEBI RSS (sebi.gov.in/sebirss.xml)",
        items: [],
        filteredOut: 0,
        totalFetched: 0,
        error:
          error instanceof Error
            ? `${error.message} This is a network failure between your browser and Drafter, not a problem with the rule set.`
            : "The feed could not be reached from this browser.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const asAt = (registry as any).regulation_set_as_at as string | undefined;
  const reviewed = (registry as any).registry_reviewed_at as string | undefined;
  const stale = watch?.items.filter((item) => item.newerThanRegistry && item.relevance !== "market-wide") ?? [];

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[24px] font-bold text-primary">Regulation Watch</h1>
          <p className="mt-1 max-w-3xl text-[13px] text-muted-foreground">
            Drafter holds an issuer to a <strong>versioned</strong> rule set. This page states which
            version that is, when it was built against the regulations, and what SEBI has published
            since, so the guardrail is checkable rather than asserted.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh
        </Button>
      </div>

      {/* ---- What Drafter is currently working from ------------------- */}
      <Card className="mb-5">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <Scale className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <h2 className="text-[14px] font-semibold text-primary">The rule set in force in this build</h2>
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-[max-content_1fr]">
                <dt className="text-muted-foreground">Registry version</dt>
                <dd className="font-mono font-medium">{registry.registry_version}</dd>
                <dt className="text-muted-foreground">Built against</dt>
                <dd>{registry.regulation_set}</dd>
                {asAt ? (
                  <>
                    <dt className="text-muted-foreground">Regulations as at</dt>
                    <dd className="font-medium">{formatDate(asAt)}</dd>
                  </>
                ) : null}
                {reviewed ? (
                  <>
                    <dt className="text-muted-foreground">Citations last reviewed</dt>
                    <dd>{formatDate(reviewed)}</dd>
                  </>
                ) : null}
              </dl>
              <p className="mt-3 text-[11.5px] text-muted-foreground">
                Citations naming a regulation number were checked against SEBI&rsquo;s consolidated
                ICDR text. Citations naming a Schedule VI heading describe where a disclosure sits in
                the offer document and are not regulation numbers.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---- Verdict --------------------------------------------------- */}
      {watch && !watch.error ? (
        <div
          className={cn(
            "mb-5 flex items-start gap-3 rounded-lg border-l-[3px] p-4",
            stale.length === 0
              ? "border-[hsl(var(--status-complete))] bg-[hsl(var(--status-complete))]/[0.06]"
              : "border-destructive bg-destructive/[0.06]",
          )}
        >
          {stale.length === 0 ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--status-complete))]" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          )}
          <div className="text-[13px]">
            <p
              className={cn(
                "font-semibold",
                stale.length === 0 ? "text-[hsl(var(--status-complete))]" : "text-destructive",
              )}
            >
              {stale.length === 0
                ? "Nothing in the current feed window supersedes this rule set."
                : `${stale.length} item${stale.length === 1 ? "" : "s"} published after ${formatDate(watch.regulationSetAsAt)} may bear on the rule set.`}
            </p>
            <p className="mt-1 text-muted-foreground">
              Read {watch.totalFetched} entries from SEBI&rsquo;s feed; {watch.filteredOut} were
              enforcement or case traffic with no bearing on drafting an offer document.
              {watch.items.length > 0
                ? ` ${watch.items.length} ${watch.items.length === 1 ? "is" : "are"} shown below.`
                : " None of the remainder touched the rules Drafter encodes."}
            </p>
          </div>
        </div>
      ) : null}

      {watch?.error ? (
        <div className="mb-5 rounded-lg border-l-[3px] border-[hsl(var(--status-partial))] bg-[hsl(var(--status-partial))]/[0.06] p-4 text-[13px]">
          <p className="font-semibold text-[hsl(var(--status-partial))]">
            SEBI&rsquo;s feed could not be read.
          </p>
          <p className="mt-1 text-muted-foreground">
            {watch.error} The rule set above is unaffected. This panel reports what is <em>new</em>,
            not what Drafter checks. Everything else in the product works normally.
          </p>
        </div>
      ) : null}

      {loading && !watch ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-6 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading SEBI&rsquo;s feed…
          </CardContent>
        </Card>
      ) : null}

      {/* ---- Items ------------------------------------------------------ */}
      <div className="space-y-2.5">
        {watch?.items.map((item) => (
          <WatchRow key={item.link + item.title} item={item} asAt={watch.regulationSetAsAt} />
        ))}
      </div>

      {watch && !watch.error && watch.items.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-[13px] text-muted-foreground">
            <p>
              SEBI&rsquo;s feed carries roughly the last thirty publications, about three days of
              output, most of it enforcement. A circular touching Chapter IX or the ICDR Regulations
              is rare in any given window, so an empty list here is the normal state and not a
              failure.
            </p>
            <p className="mt-2">
              What this panel is for is the day it is <em>not</em> empty.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <p className="mt-6 text-[11.5px] text-muted-foreground">
        Source: {watch?.source ?? "SEBI RSS"}. Classification is rule-based and reproducible, the
        matched terms are shown on every item so it can be judged and overruled. Drafter does not
        interpret a circular, and never edits the registry on its own: deciding what a change means
        is a job for the merchant banker.
      </p>
    </div>
  );
}

function WatchRow({ item, asAt }: { item: ClassifiedItem; asAt: string }) {
  return (
    <div className={cn("rounded-lg border p-4", TONE[item.relevance])}>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <Badge variant={item.relevance === "chapter-ix" ? "defect" : "secondary"}>
          {LABEL[item.relevance]}
        </Badge>
        {item.newerThanRegistry ? (
          <span className="rounded border border-destructive/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
            after {formatDate(asAt)}
          </span>
        ) : null}
        <span className="text-[11.5px] text-muted-foreground">{formatDate(item.publishedAt)}</span>
      </div>

      <a
        href={item.link}
        target="_blank"
        rel="noreferrer noopener"
        className="group inline-flex items-start gap-1.5 text-[13.5px] font-medium text-primary hover:underline"
      >
        <span>{item.title}</span>
        <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 opacity-50 group-hover:opacity-100" />
      </a>

      {item.description ? (
        <p className="mt-1.5 line-clamp-3 text-[12px] text-muted-foreground">{item.description}</p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px]">
        {item.requirementIds.length > 0 ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground">May bear on:</span>
            {item.requirementIds.map((id) => (
              <span key={id} className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] font-medium">
                {id}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-muted-foreground">No requirement mapped, read it and judge.</span>
        )}
        {item.matchedTerms.length > 0 ? (
          <span className="text-muted-foreground">
            matched: <span className="italic">{item.matchedTerms.join(", ")}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
