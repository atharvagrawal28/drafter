"use client";

/**
 * Session state for the Drafter workspace.
 *
 * Deliberately client-side. Pre-IPO issuer data is price-sensitive, so it lives
 * in the browser session and is only ever POSTed to a stateless route handler
 * when the language model is invoked — nothing is persisted server-side. That
 * is the confidentiality guardrail, and it also means the app has no database
 * and therefore no per-issuer marginal cost.
 *
 * The gap report is derived, not stored: it recomputes from issuer data on every
 * change, so the coverage score moves live as the wizard is filled in.
 */

import * as React from "react";
import { BLANK_ISSUER_ID, buildBlankIssuerData, cloneIssuerData, getSampleIssuer, sampleIssuers } from "./data";
import { buildActionPlan, type ActionPlan } from "./engine/actionPlan";
import { runEligibility, type EligibilityReport } from "./engine/eligibility";
import { runGapCheck } from "./engine/gapCheck";
import { generateDocument } from "./engine/generate";
import { getPath, setPath } from "./engine/utils";
import type { DrhpDocument, GapReport, IssuerData } from "./types";

const STORAGE_KEY = "drafter.session.v1";

export type Role = "promoter" | "banker";

/** A merchant-banker edit to a single generated paragraph. */
export interface BankerEdit {
  chapterId: string;
  blockIndex: number;
  original: string;
  edited: string;
  editedAt: string;
}

interface SessionState {
  role: Role;
  issuerId: string;
  issuerData: IssuerData;
  document: DrhpDocument | null;
  bankerEdits: Record<string, BankerEdit>;
  /** Provenance note for uploaded financials, shown next to extracted figures. */
  uploadNote: string | null;
}

interface DrafterContextValue extends SessionState {
  gapReport: GapReport;
  eligibility: EligibilityReport;
  actionPlan: ActionPlan;
  generating: boolean;
  generationError: string | null;
  llmAvailable: boolean | null;
  llmModel: string | null;
  hydrated: boolean;

  setRole: (role: Role) => void;
  selectIssuer: (issuerId: string) => void;
  updateField: (path: string, value: any) => void;
  getField: (path: string) => any;
  generate: () => Promise<void>;
  applyExtraction: (updates: Record<string, any>, note: string) => void;
  setBankerEdit: (chapterId: string, blockIndex: number, original: string, edited: string) => void;
  clearBankerEdit: (chapterId: string, blockIndex: number) => void;
  resetIssuer: () => void;
  /** Discard the loaded issuer and start a blank one for a real company. */
  startNewIssuer: () => void;
}

const DrafterContext = React.createContext<DrafterContextValue | null>(null);

function initialState(): SessionState {
  const issuer = sampleIssuers[0];
  return {
    role: "promoter",
    issuerId: issuer.id,
    issuerData: cloneIssuerData(issuer.data),
    document: null,
    bankerEdits: {},
    uploadNote: null,
  };
}

export function DrafterProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<SessionState>(initialState);
  const [hydrated, setHydrated] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [generationError, setGenerationError] = React.useState<string | null>(null);
  const [llmAvailable, setLlmAvailable] = React.useState<boolean | null>(null);
  const [llmModel, setLlmModel] = React.useState<string | null>(null);

  // ---- Hydrate from the previous session ------------------------------
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SessionState>;
        if (parsed.issuerData && parsed.issuerId) {
          setState((current) => ({
            ...current,
            role: parsed.role ?? current.role,
            issuerId: parsed.issuerId!,
            issuerData: parsed.issuerData!,
            document: parsed.document ?? null,
            bankerEdits: parsed.bankerEdits ?? {},
            uploadNote: parsed.uploadNote ?? null,
          }));
        }
      }
    } catch {
      // A corrupt or unavailable store must never block the app from starting.
    }
    setHydrated(true);
  }, []);

  // ---- Autosave --------------------------------------------------------
  React.useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Quota exceeded — the session simply will not survive a reload.
    }
  }, [state, hydrated]);

  // ---- Probe whether a language-model key is configured ----------------
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/status")
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        setLlmAvailable(Boolean(payload.llmAvailable));
        setLlmModel(payload.model ?? null);
      })
      .catch(() => {
        if (!cancelled) setLlmAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Derived gap report ---------------------------------------------
  const gapReport = React.useMemo(() => {
    const issuer = sampleIssuers.find((candidate) => candidate.id === state.issuerId);
    return runGapCheck(state.issuerData, {
      issuerId: state.issuerId,
      issuerName: state.issuerData?.identity?.company_name ?? issuer?.name,
      meta: issuer?.meta,
    });
  }, [state.issuerData, state.issuerId]);

  /**
   * Eligibility is derived separately from the gap report, because it answers a
   * different question. The gap report asks "is this draft complete?"; this asks
   * "may this issuer make the issue at all?" — and if the answer is no, the
   * completeness of the draft is beside the point.
   */
  const eligibility = React.useMemo(
    () =>
      runEligibility(
        state.issuerData,
        state.issuerData?.identity?.company_name ??
          sampleIssuers.find((candidate) => candidate.id === state.issuerId)?.name,
      ),
    [state.issuerData, state.issuerId],
  );

  /** What to do next, ranked — derived from the same report the score is. */
  const actionPlan = React.useMemo(() => buildActionPlan(gapReport), [gapReport]);

  // ---- Actions ---------------------------------------------------------
  const setRole = React.useCallback((role: Role) => {
    setState((current) => ({ ...current, role }));
  }, []);

  /**
   * Start a real company from nothing.
   *
   * Deliberately a separate action from `selectIssuer`, which always loads a
   * bundled sample. Without this, Drafter can only ever be pointed at the two
   * demo issuers — which is the difference between a product and a showcase.
   */
  const startNewIssuer = React.useCallback(() => {
    setState({
      role: "promoter",
      issuerId: BLANK_ISSUER_ID,
      issuerData: buildBlankIssuerData(),
      document: null,
      bankerEdits: {},
      uploadNote: null,
    });
    setGenerationError(null);
  }, []);

  const selectIssuer = React.useCallback((issuerId: string) => {
    if (issuerId === BLANK_ISSUER_ID) return startNewIssuer();
    const issuer = getSampleIssuer(issuerId);
    setState({
      role: "promoter",
      issuerId: issuer.id,
      issuerData: cloneIssuerData(issuer.data),
      document: null,
      bankerEdits: {},
      uploadNote: null,
    });
    setGenerationError(null);
  }, [startNewIssuer]);

  const updateField = React.useCallback((path: string, value: any) => {
    setState((current) => {
      const next = JSON.parse(JSON.stringify(current.issuerData));
      setPath(next, path, value);
      return { ...current, issuerData: next };
    });
  }, []);

  const getField = React.useCallback(
    (path: string) => getPath(state.issuerData, path),
    [state.issuerData],
  );

  const applyExtraction = React.useCallback((updates: Record<string, any>, note: string) => {
    setState((current) => {
      const next = JSON.parse(JSON.stringify(current.issuerData));
      for (const [path, value] of Object.entries(updates)) setPath(next, path, value);
      return { ...current, issuerData: next, uploadNote: note };
    });
  }, []);

  /**
   * Generate the document.
   *
   * Tries the server route first so the language model is used when a key is
   * configured. If that fails for any reason — no key, rate limit, network, cold
   * start — it falls back to generating deterministically in the browser. The
   * demo therefore cannot fail to produce a document.
   */
  const generate = React.useCallback(async () => {
    setGenerating(true);
    setGenerationError(null);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issuerData: state.issuerData, issuerId: state.issuerId }),
      });
      if (!response.ok) throw new Error(`Generation route returned ${response.status}`);
      const payload = await response.json();
      if (!payload?.document?.chapters?.length) throw new Error("Malformed generation response");
      setState((current) => ({ ...current, document: payload.document }));
    } catch (error) {
      const fallback = await generateDocument(state.issuerData, {
        issuerId: state.issuerId,
        useLlm: false,
      });
      setState((current) => ({ ...current, document: fallback }));
      setGenerationError(
        `Language-model drafting was unavailable, so the draft was generated from Drafter's ` +
          `deterministic templates. Factual chapters are identical either way. ` +
          `(${error instanceof Error ? error.message : "unknown error"})`,
      );
    } finally {
      setGenerating(false);
    }
  }, [state.issuerData, state.issuerId]);

  const setBankerEdit = React.useCallback(
    (chapterId: string, blockIndex: number, original: string, edited: string) => {
      const key = `${chapterId}:${blockIndex}`;
      setState((current) => {
        const next = { ...current.bankerEdits };
        if (edited.trim() === original.trim()) delete next[key];
        else
          next[key] = {
            chapterId,
            blockIndex,
            original,
            edited,
            editedAt: new Date().toISOString(),
          };
        return { ...current, bankerEdits: next };
      });
    },
    [],
  );

  const clearBankerEdit = React.useCallback((chapterId: string, blockIndex: number) => {
    const key = `${chapterId}:${blockIndex}`;
    setState((current) => {
      const next = { ...current.bankerEdits };
      delete next[key];
      return { ...current, bankerEdits: next };
    });
  }, []);

  const resetIssuer = React.useCallback(() => {
    selectIssuer(state.issuerId);
  }, [selectIssuer, state.issuerId]);

  const value: DrafterContextValue = {
    ...state,
    gapReport,
    eligibility,
    actionPlan,
    generating,
    generationError,
    llmAvailable,
    llmModel,
    hydrated,
    setRole,
    selectIssuer,
    updateField,
    getField,
    generate,
    applyExtraction,
    setBankerEdit,
    clearBankerEdit,
    resetIssuer,
    startNewIssuer,
  };

  return <DrafterContext.Provider value={value}>{children}</DrafterContext.Provider>;
}

export function useDrafter(): DrafterContextValue {
  const context = React.useContext(DrafterContext);
  if (!context) throw new Error("useDrafter must be used within a DrafterProvider");
  return context;
}

/** Apply stored banker edits over a generated document, for the banker view. */
export function applyBankerEdits(
  document: DrhpDocument,
  edits: Record<string, BankerEdit>,
): DrhpDocument {
  if (!Object.keys(edits).length) return document;
  return {
    ...document,
    chapters: document.chapters.map((chapter) => ({
      ...chapter,
      blocks: chapter.blocks.map((block, index) => {
        const edit = edits[`${chapter.id}:${index}`];
        if (!edit || block.kind !== "para") return block;
        return {
          ...block,
          text: edit.edited,
          provenance: {
            ...block.provenance,
            note: "Amended by the merchant banker during review.",
          },
        };
      }),
    })),
  };
}
