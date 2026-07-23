import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names, resolving conflicts in favour of the last one. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Render an ISO timestamp as "22 July 2026, 14:32". */
export function formatTimestamp(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Render an ISO timestamp as a bare date, e.g. "22 July 2026".
 *
 * Used on the prospectus cover page, which carries a date and never a time.
 * Built from parts rather than by trimming a locale string, because `en-IN`
 * joins date and time with "at" rather than a comma.
 */
export function formatDate(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Stable slug for anchor links, e.g. "III.5" -> "ch-III-5". */
export function chapterAnchor(chapterId: string): string {
  return `ch-${chapterId.replace(/\./g, "-")}`;
}
