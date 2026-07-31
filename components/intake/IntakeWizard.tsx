"use client";

import * as React from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  FileSpreadsheet,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useDrafter } from "@/lib/store";
import { BLANK_ISSUER_ID, questionnaire, getRequirement } from "@/lib/data";
import { isPresent } from "@/lib/engine/utils";
import { EffortMeter } from "./EffortMeter";
import { cn } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Progress,
  Textarea,
} from "@/components/ui/primitives";

interface RowColumn {
  key: string;
  label: string;
  type: "text" | "number";
  width?: string;
}

interface SeriesRow {
  path: string;
  label: string;
}

interface Question {
  path: string;
  label: string;
  type: string;
  help?: string;
  /** `series` — one issuer field per metric, sharing the year columns. */
  rows?: SeriesRow[];
  /** `rows` — a repeating table of records. */
  columns?: RowColumn[];
  totalKey?: string;
}

interface Step {
  step: number;
  title: string;
  help: string;
  feeds: string[];
  questions: Question[];
}

const STEPS = questionnaire.steps as Step[];

/**
 * Every issuer field a question owns.
 *
 * A `series` question writes seven fields, not one, so step progress has to
 * count them individually — otherwise the rail would report a step complete
 * while five of the disclosures it feeds were still empty.
 */
function ownedPaths(question: Question): string[] {
  if (question.type === "upload") return [];
  if (question.type === "series") return [question.path, ...(question.rows ?? []).map((row) => row.path)];
  return [question.path];
}

export function IntakeWizard() {
  const { issuerData, updateField, getField, generate, generating, gapReport, resetIssuer, startNewIssuer, applyExtraction, uploadNote, issuerId } =
    useDrafter();
  const isNewIssuer = issuerId === BLANK_ISSUER_ID;
  const [active, setActive] = React.useState(0);
  const step = STEPS[active];

  // Per-step completion, so the rail shows real progress.
  const stepProgress = React.useMemo(
    () =>
      STEPS.map((candidate) => {
        const fields = candidate.questions.flatMap(ownedPaths);
        const done = fields.filter((path) => isPresent(getField(path))).length;
        return { total: fields.length, done };
      }),
    [getField, issuerData], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const overallDone = stepProgress.reduce((sum, progress) => sum + progress.done, 0);
  const overallTotal = stepProgress.reduce((sum, progress) => sum + progress.total, 0);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[24px] font-bold text-primary">Guided Intake</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
            {questionnaire.note.split(".")[0]}. Answer in plain language — every field is tagged with
            the DRHP chapter and disclosure requirement it feeds, and your answers autosave.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isNewIssuer ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={startNewIssuer}
              title="Clear every answer and start again"
            >
              <RotateCcw /> Clear all answers
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={resetIssuer} title="Reload the sample issuer's answers">
                <RotateCcw /> Reset sample
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={startNewIssuer}
                title="Start from a blank form for your own company"
              >
                <Plus /> New company
              </Button>
            </>
          )}
          <Button onClick={generate} disabled={generating} size="sm">
            {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
            Generate draft
          </Button>
        </div>
      </div>

      {/* The measured half of "significantly reducing preparation time" */}
      <div className="mb-6">
        <EffortMeter />
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Step rail */}
        <aside className="lg:sticky lg:top-[168px] lg:self-start">
          <Card>
            <CardContent className="p-3">
              <div className="mb-3 px-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Overall
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums text-primary">
                    {overallTotal ? Math.round((overallDone / overallTotal) * 100) : 0}%
                  </span>
                </div>
                <Progress value={overallTotal ? (overallDone / overallTotal) * 100 : 0} className="mt-1.5" />
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {overallDone} of {overallTotal} fields answered · coverage {gapReport.coveragePct}%
                </p>
              </div>

              <div className="space-y-0.5">
                {STEPS.map((candidate, index) => {
                  const progress = stepProgress[index];
                  const complete = progress.total > 0 && progress.done === progress.total;
                  const isActive = index === active;
                  return (
                    <button
                      key={candidate.step}
                      onClick={() => setActive(index)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                        isActive ? "bg-secondary" : "hover:bg-secondary/50",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                          complete
                            ? "bg-[hsl(var(--status-complete))] text-white"
                            : isActive
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-muted-foreground",
                        )}
                      >
                        {complete ? <Check className="h-3.5 w-3.5" /> : candidate.step}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-[12.5px] font-medium",
                            isActive ? "text-primary" : "text-foreground",
                          )}
                        >
                          {candidate.title}
                        </span>
                        <span className="text-[10.5px] text-muted-foreground">
                          {progress.done}/{progress.total} fields
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </aside>

        {/* Step form */}
        <div className="min-w-0">
          <Card>
            <CardContent className="p-6">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Step {step.step} of {STEPS.length}</Badge>
                    <span className="text-[11px] text-muted-foreground">Feeds:</span>
                    {step.feeds.map((id) => (
                      <span
                        key={id}
                        className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-medium"
                        title={getRequirement(id)?.requirement}
                      >
                        {id}
                      </span>
                    ))}
                  </div>
                  <h2 className="mt-2 font-serif text-[20px] font-bold text-primary">{step.title}</h2>
                  <p className="mt-1 text-[13px] text-muted-foreground">{step.help}</p>
                </div>
              </div>

              <div className="space-y-5">
                {step.questions.map((question) => (
                  <QuestionField
                    key={question.path}
                    question={question}
                    value={getField(question.path)}
                    onChange={(value) => updateField(question.path, value)}
                    getField={getField}
                    updateField={updateField}
                    onExtract={applyExtraction}
                    uploadNote={uploadNote}
                  />
                ))}
              </div>

              <div className="mt-8 flex items-center justify-between border-t border-border pt-4">
                <Button
                  variant="outline"
                  onClick={() => setActive((index) => Math.max(0, index - 1))}
                  disabled={active === 0}
                >
                  <ChevronLeft /> Previous
                </Button>
                {active < STEPS.length - 1 ? (
                  <Button onClick={() => setActive((index) => Math.min(STEPS.length - 1, index + 1))}>
                    Next: {STEPS[active + 1].title} <ChevronRight />
                  </Button>
                ) : (
                  <Button onClick={generate} disabled={generating}>
                    {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
                    Generate the draft DRHP
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question field
// ---------------------------------------------------------------------------

function QuestionField({
  question,
  value,
  onChange,
  getField,
  updateField,
  onExtract,
  uploadNote,
}: {
  question: Question;
  value: any;
  onChange: (value: any) => void;
  getField: (path: string) => any;
  updateField: (path: string, value: any) => void;
  onExtract: (updates: Record<string, any>, note: string) => void;
  uploadNote: string | null;
}) {
  // A multi-field question is only "filled" when every field it owns is.
  const owned = ownedPaths(question);
  const filled = owned.length > 0 && owned.every((path) => isPresent(getField(path)));

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <Label htmlFor={question.path} className="text-[13px]">
          {question.label}
        </Label>
        {filled ? (
          <CircleDot className="h-3 w-3 text-[hsl(var(--status-complete))]" />
        ) : (
          <span className="h-3 w-3 rounded-full border border-border" />
        )}
      </div>
      {question.help && question.type !== "upload" ? (
        <p className="mb-1.5 text-[11.5px] text-muted-foreground">{question.help}</p>
      ) : null}

      {question.type === "textarea" ? (
        <Textarea
          id={question.path}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
        />
      ) : question.type === "number" ? (
        <Input
          id={question.path}
          type="number"
          step="any"
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))}
          className="max-w-[240px]"
        />
      ) : question.type === "upload" ? (
        <FinancialsUpload help={question.help} onExtract={onExtract} uploadNote={uploadNote} />
      ) : question.type === "objects" ? (
        <ObjectsEditor value={value} onChange={onChange} />
      ) : question.type === "rows" ? (
        <RowsEditor
          columns={question.columns ?? []}
          totalKey={question.totalKey}
          value={value}
          onChange={onChange}
        />
      ) : question.type === "confirm" ? (
        <ConfirmField value={value} onChange={onChange} />
      ) : question.type === "series" ? (
        <SeriesEditor question={question} getField={getField} updateField={updateField} />
      ) : (
        <Input id={question.path} type="text" value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirmation
// ---------------------------------------------------------------------------

/**
 * A three-state confirmation: yes, no, or not yet answered.
 *
 * The third state is the important one. These fields carry eligibility
 * confirmations — lock-in, debarment — and an unanswered confirmation must
 * report as an outstanding disclosure, not as a denial. A plain checkbox would
 * make "not yet decided" indistinguishable from "no".
 */
function ConfirmField({ value, onChange }: { value: any; onChange: (value: any) => void }) {
  const options: { label: string; next: boolean | null }[] = [
    { label: "Yes, confirmed", next: true },
    { label: "No", next: false },
    { label: "Not yet confirmed", next: null },
  ];
  const current = value === true ? true : value === false ? false : null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = current === option.next;
        return (
          <button
            key={option.label}
            type="button"
            onClick={() => onChange(option.next)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              active
                ? option.next === true
                  ? "border-[hsl(var(--status-complete))] bg-[hsl(var(--status-complete))]/[0.1] text-[hsl(var(--status-complete))]"
                  : option.next === false
                    ? "border-destructive bg-destructive/[0.08] text-destructive"
                    : "border-[hsl(var(--status-partial))] bg-[hsl(var(--status-partial))]/[0.1] text-[hsl(var(--status-partial))]"
                : "border-border text-muted-foreground hover:bg-secondary",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Three-year series
// ---------------------------------------------------------------------------

/**
 * Metrics down the side, financial years across the top.
 *
 * The year labels are themselves an issuer field (`financials.years`): a series
 * of three numbers cannot be printed in a restated statement without them, so
 * they are captured rather than assumed. The financials upload fills this whole
 * grid in one step; typing into it is the fallback.
 */
function SeriesEditor({
  question,
  getField,
  updateField,
}: {
  question: Question;
  getField: (path: string) => any;
  updateField: (path: string, value: any) => void;
}) {
  const years: string[] = Array.isArray(getField(question.path)) ? getField(question.path) : [];
  const columns = Math.max(years.length, 3);
  const rows = question.rows ?? [];

  const setYear = (index: number, next: string) => {
    const updated = Array.from({ length: columns }, (_, i) => years[i] ?? "");
    updated[index] = next;
    updateField(question.path, updated.some((year) => year.trim()) ? updated : []);
  };

  const setCell = (path: string, index: number, next: string) => {
    const existing: any[] = Array.isArray(getField(path)) ? getField(path) : [];
    const updated = Array.from({ length: columns }, (_, i) => existing[i] ?? null);
    updated[index] = next === "" ? null : Number(next);
    updateField(path, updated.every((cell) => cell === null) ? [] : updated);
  };

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[520px] text-[12.5px]">
        <thead>
          <tr className="border-b border-border bg-secondary/50 text-left">
            <th className="px-3 py-2 font-medium">Metric</th>
            {Array.from({ length: columns }, (_, index) => (
              <th key={index} className="w-28 px-2 py-1.5">
                <Input
                  value={years[index] ?? ""}
                  placeholder={`Year ${index + 1}`}
                  onChange={(event) => setYear(index, event.target.value)}
                  className="h-7 border-transparent bg-transparent text-center text-[12px] font-medium shadow-none focus-visible:border-input"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const series: any[] = Array.isArray(getField(row.path)) ? getField(row.path) : [];
            return (
              <tr key={row.path} className="border-b border-border last:border-0">
                <td className="px-3 py-1.5">{row.label}</td>
                {Array.from({ length: columns }, (_, index) => (
                  <td key={index} className="px-2 py-1.5">
                    <Input
                      type="number"
                      step="any"
                      value={series[index] ?? ""}
                      onChange={(event) => setCell(row.path, index, event.target.value)}
                      className="h-8 border-transparent text-right shadow-none focus-visible:border-input"
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic repeating-row editor
// ---------------------------------------------------------------------------

/**
 * A repeating table of records, driven entirely by the column spec in the
 * questionnaire — share capital history, shareholding pattern, issue expenses.
 * Each writes a differently shaped record, and none of them can be expressed as
 * a paragraph of prose without losing the reconciliation the checker performs
 * over it.
 */
function RowsEditor({
  columns,
  totalKey,
  value,
  onChange,
}: {
  columns: RowColumn[];
  totalKey?: string;
  value: Record<string, any>[] | undefined;
  onChange: (value: Record<string, any>[]) => void;
}) {
  const rows = Array.isArray(value) ? value : [];
  const total = totalKey ? rows.reduce((sum, row) => sum + (Number(row[totalKey]) || 0), 0) : null;

  const update = (index: number, key: string, next: any) =>
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: next } : row)));

  const blank = () => Object.fromEntries(columns.map((column) => [column.key, column.type === "number" ? 0 : ""]));

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[520px] text-[12.5px]">
        <thead>
          <tr className="border-b border-border bg-secondary/50 text-left">
            {columns.map((column) => (
              <th
                key={column.key}
                className="px-3 py-2 font-medium"
                style={column.width ? { width: column.width } : undefined}
              >
                {column.label}
              </th>
            ))}
            <th className="w-10 px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-border last:border-0">
              {columns.map((column) => (
                <td key={column.key} className="px-2 py-1.5">
                  <Input
                    type={column.type === "number" ? "number" : "text"}
                    step={column.type === "number" ? "any" : undefined}
                    value={row[column.key] ?? ""}
                    onChange={(event) =>
                      update(
                        index,
                        column.key,
                        column.type === "number"
                          ? event.target.value === ""
                            ? ""
                            : Number(event.target.value)
                          : event.target.value,
                      )
                    }
                    className={cn(
                      "h-8 border-transparent shadow-none focus-visible:border-input",
                      column.type === "number" && "text-right",
                    )}
                  />
                </td>
              ))}
              <td className="px-2 py-1.5 text-center">
                <button
                  onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        {total !== null && rows.length > 0 ? (
          <tfoot>
            <tr className="bg-secondary/40">
              <td className="px-3 py-2 font-semibold" colSpan={columns.length - 1}>
                Total
              </td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">
                {total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </td>
              <td></td>
            </tr>
          </tfoot>
        ) : null}
      </table>
      <div className="border-t border-border p-2">
        <Button variant="ghost" size="sm" onClick={() => onChange([...rows, blank()])}>
          <Plus /> Add row
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Financials upload
// ---------------------------------------------------------------------------

function FinancialsUpload({
  help,
  onExtract,
  uploadNote,
}: {
  help?: string;
  onExtract: (updates: Record<string, any>, note: string) => void;
  uploadNote: string | null;
}) {
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ ok: boolean; message: string; log?: string[] } | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/extract", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Extraction failed");

      if (payload.fieldsFound > 0) {
        onExtract(payload.extracted, payload.note);
        setResult({ ok: payload.revenueFound, message: payload.note, log: payload.log });
      } else {
        setResult({ ok: false, message: payload.note });
      }
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : "Extraction failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {help ? <p className="mb-2 text-[11.5px] text-muted-foreground">{help}</p> : null}
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-secondary/30 px-6 py-8 text-center"
      >
        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        ) : (
          <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
        )}
        <p className="mt-2 text-[13px] font-medium">
          {busy ? "Reading your financials…" : "Drop an Excel, CSV or PDF here"}
        </p>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          Drafter reads the three-year series and the year headings, and fills the table below
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          <Upload /> Choose file
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {result ? (
        <div
          className={cn(
            "mt-2 rounded-md border-l-[3px] p-3 text-[12px]",
            result.ok
              ? "border-[hsl(var(--status-complete))] bg-[hsl(var(--status-complete))]/[0.06]"
              : "border-[hsl(var(--status-partial))] bg-[hsl(var(--status-partial))]/[0.06]",
          )}
        >
          <p className={result.ok ? "font-medium text-[hsl(var(--status-complete))]" : "font-medium text-[hsl(var(--status-partial))]"}>
            {result.message}
          </p>
          {result.log?.length ? (
            <ul className="mt-1.5 space-y-0.5 font-mono text-[10.5px] text-muted-foreground">
              {result.log.map((entry, index) => (
                <li key={index}>{entry}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : uploadNote ? (
        <p className="mt-2 text-[11.5px] text-muted-foreground">{uploadNote}</p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Objects of the issue editor
// ---------------------------------------------------------------------------

interface ObjectRow {
  purpose: string;
  amount: number;
  deployment?: string;
}

function ObjectsEditor({ value, onChange }: { value: ObjectRow[] | undefined; onChange: (value: ObjectRow[]) => void }) {
  const rows: ObjectRow[] = Array.isArray(value) ? value : [];
  const total = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  const update = (index: number, patch: Partial<ObjectRow>) => {
    const next = rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row));
    onChange(next);
  };

  return (
    <div className="rounded-md border border-border">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-border bg-secondary/50 text-left">
            <th className="px-3 py-2 font-medium">Purpose</th>
            <th className="w-32 px-3 py-2 font-medium">Amount (INR cr)</th>
            <th className="w-28 px-3 py-2 font-medium">Deployment</th>
            <th className="w-10 px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-border last:border-0">
              <td className="px-2 py-1.5">
                <Input
                  value={row.purpose ?? ""}
                  onChange={(event) => update(index, { purpose: event.target.value })}
                  className="h-8 border-transparent shadow-none focus-visible:border-input"
                />
              </td>
              <td className="px-2 py-1.5">
                <Input
                  type="number"
                  step="any"
                  value={row.amount ?? ""}
                  onChange={(event) => update(index, { amount: Number(event.target.value) })}
                  className="h-8 border-transparent text-right shadow-none focus-visible:border-input"
                />
              </td>
              <td className="px-2 py-1.5">
                <Input
                  value={row.deployment ?? ""}
                  onChange={(event) => update(index, { deployment: event.target.value })}
                  className="h-8 border-transparent shadow-none focus-visible:border-input"
                />
              </td>
              <td className="px-2 py-1.5 text-center">
                <button
                  onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-secondary/40">
            <td className="px-3 py-2 font-semibold">Total</td>
            <td className="px-3 py-2 text-right font-semibold tabular-nums">{total.toFixed(2)}</td>
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      </table>
      <div className="border-t border-border p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange([...rows, { purpose: "", amount: 0, deployment: "" }])}
        >
          <Plus /> Add object
        </Button>
      </div>
    </div>
  );
}
