/**
 * What each role actually IS, rather than a label on a toggle.
 *
 * WHY THIS EXISTS
 * The promoter and the merchant banker are not two skins on the same screen.
 * They have different obligations, different vocabulary, and a different
 * relationship to the document: one is asserting facts about their own
 * company, the other is independently verifying those assertions and putting
 * their name to them. The regulations reserve filing to the second of them.
 *
 * Until now the role switched a value that changed almost nothing on screen,
 * which quietly misrepresented the product — the separation of duties is one
 * of the things Drafter is meant to preserve, so it has to be legible.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * It never hides a screen. De-emphasis, not removal: a promoter should be able
 * to look at the banker's workspace and understand what is coming, and a
 * reviewer should be able to see the whole product without hunting for a
 * toggle. `emphasis` orders and shades the navigation; it does not gate it.
 */

import type { Role } from "./store";

export type { Role };

export interface RoleProfile {
  id: Role;
  /** Short label for the toggle. */
  label: string;
  /** Who this is, in one line, addressed to the person in the seat. */
  identity: string;
  /** What this role is here to do. */
  purpose: string;
  /** The obligation the role carries, stated plainly. */
  obligation: string;
  /** Routes this role works in, most important first. */
  primary: string[];
  /** Routes that are context rather than work for this role. */
  secondary: string[];
  /** Verb for the main action, so the button reads correctly for the seat. */
  generateLabel: string;
}

export const ROLES: Record<Role, RoleProfile> = {
  promoter: {
    id: "promoter",
    label: "Promoter",
    identity: "You are the issuer.",
    purpose:
      "Answer plain-language questions about your company. Drafter assembles them into a disclosure-mapped draft and tells you what is still missing.",
    obligation:
      "Everything factual in the draft comes from your answers, and you are responsible for their accuracy. Nothing here is filed until your merchant banker has verified and certified it.",
    primary: ["/intake", "/document", "/gaps"],
    secondary: ["/how", "/trace", "/banker", "/observations", "/circulars", "/about"],
    generateLabel: "Generate draft",
  },
  banker: {
    id: "banker",
    label: "Merchant Banker",
    identity: "You are the certifying intermediary.",
    purpose:
      "Review the issuer's draft as work product — documents required against provided, chapter-to-requirement traceability, and the findings an exchange pre-check would raise.",
    obligation:
      "Drafter has verified nothing. Every figure traces to an issuer answer, not to evidence. Due diligence, certification and filing remain yours, and the draft is not signed off by anything here.",
    primary: ["/banker", "/gaps", "/document", "/trace", "/observations"],
    secondary: ["/intake", "/circulars", "/how", "/about"],
    generateLabel: "Regenerate draft",
  },
};

/** Emphasis for a nav route under the current role. */
export function navEmphasis(role: Role, href: string): "primary" | "secondary" {
  return ROLES[role].primary.includes(href) ? "primary" : "secondary";
}

/**
 * Navigation ordered for the role: primary routes in the role's own order,
 * then everything else in its declared order. Overview always leads, because
 * a home route that moves is disorienting.
 */
export function orderedNav<T extends { href: string }>(role: Role, items: T[]): T[] {
  const profile = ROLES[role];
  const rank = (href: string) => {
    if (href === "/") return -1;
    const p = profile.primary.indexOf(href);
    if (p >= 0) return p;
    const s = profile.secondary.indexOf(href);
    return 100 + (s >= 0 ? s : 50);
  };
  return [...items].sort((a, b) => rank(a.href) - rank(b.href));
}
