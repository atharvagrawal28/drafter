"use client";

/**
 * Inline definition affordance for capital-markets vocabulary.
 *
 * WHY IT IS BUILT THIS WAY
 * A tooltip that only opens on hover is invisible to a promoter on a phone,
 * and invisible to anyone using a keyboard. This opens on hover, on focus AND
 * on tap, closes on Escape and on outside click, and is announced through
 * `aria-describedby` so a screen reader reaches the definition rather than a
 * bare "i" character.
 *
 * It renders as a dotted underline plus a small superscript marker rather than
 * a coloured pill. The accent in this design system means "regulatory
 * guardrail"; spending it on thirty inline definitions would drain the one
 * signal that has to stay loud.
 *
 * The panel is width-constrained with min(), never a fixed pixel width, so it
 * cannot push the page sideways on a 375px phone — the failure the mobile
 * lint in verify-engine.ts exists to catch.
 */

import * as React from "react";
import { lookupTerm, type GlossaryEntry } from "@/lib/glossary";
import { cn } from "@/lib/utils";

let counter = 0;

export function Explain({
  term,
  children,
  className,
}: {
  /** Glossary term or alias. Falls back to the visible text when omitted. */
  term?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const [align, setAlign] = React.useState<"start" | "end">("start");
  const wrapRef = React.useRef<HTMLSpanElement>(null);
  const panelRef = React.useRef<HTMLSpanElement>(null);
  const id = React.useMemo(() => `explain-${(counter += 1)}`, []);

  /**
   * Flip to right-aligned when a left-aligned panel would run off the screen.
   *
   * Measured rather than passed in as a prop: an author cannot know where a
   * given term will sit once the text reflows, and a term near the right edge
   * of a phone is exactly where a definition is most needed and most likely to
   * be pushed out of view.
   */
  React.useLayoutEffect(() => {
    if (!open || !panelRef.current) return;
    setAlign("start");
    const rect = panelRef.current.getBoundingClientRect();
    const margin = 12;
    if (rect.right > window.innerWidth - margin) setAlign("end");
  }, [open]);

  const key = term ?? (typeof children === "string" ? children : "");
  const entry: GlossaryEntry | undefined = lookupTerm(key);

  // An unknown term must not render a dead control that opens an empty box.
  React.useEffect(() => {
    if (!entry && key) {
      // Surfaces a typo in a term name during development rather than shipping
      // a definition affordance that explains nothing.
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[Explain] no glossary entry for "${key}"`);
      }
    }
  }, [entry, key]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setPinned(false);
      }
    };
    const onClick = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setPinned(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  if (!entry) return <>{children}</>;

  return (
    <span ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => !pinned && setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned && setOpen(false)}
        onClick={() => {
          setPinned((p) => !p);
          setOpen(true);
        }}
        className={cn(
          "group/ex inline items-baseline gap-[3px] rounded-[3px] text-left underline decoration-dotted decoration-from-font underline-offset-[3px]",
          "decoration-muted-foreground/45 transition-colors duration-150 ease-smooth",
          "hover:decoration-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          className,
        )}
      >
        {children}
        <span
          aria-hidden
          className="ml-[3px] inline-flex h-[11px] w-[11px] translate-y-[-1px] items-center justify-center rounded-full border border-muted-foreground/35 align-middle text-[7.5px] font-bold leading-none text-muted-foreground/70 transition-colors duration-150 group-hover/ex:border-accent/50 group-hover/ex:text-accent"
        >
          i
        </span>
      </button>

      {open ? (
        <span
          ref={panelRef}
          role="tooltip"
          id={id}
          className={cn(
            "absolute z-50 mt-1.5 block w-max max-w-[min(21rem,calc(100vw-2.5rem))] rounded-lg border border-border bg-card p-3.5 text-left shadow-lg",
            "animate-fade-in",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          <span className="block font-serif text-[13.5px] font-semibold leading-tight text-primary">
            {entry.term}
          </span>
          <span className="mt-1.5 block text-[12.5px] leading-[1.55] text-foreground">
            {entry.plain}
          </span>
          {entry.matters ? (
            <span className="mt-2 block border-t border-border/70 pt-2 text-[12px] leading-[1.5] text-muted-foreground">
              <span className="font-medium text-secondary-foreground">Why it matters. </span>
              {entry.matters}
            </span>
          ) : null}
          {entry.regulation ? (
            <span className="mt-2 block font-mono text-[10.5px] uppercase tracking-[0.06em] text-accent">
              {entry.regulation}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
