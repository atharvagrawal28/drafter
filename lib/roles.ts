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
 * It never hides a screen, and it never moves one. De-emphasis, not removal: a
 * promoter should be able to look at the banker's workspace and understand
 * what is coming, and a reviewer should be able to see the whole product
 * without hunting for a toggle. The role shades the navigation; the ORDER is
 * fixed in NAV_ORDER below and is the same in both seats.
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
  /**
   * Routes this role works in. Drives emphasis only — never order, which is
   * fixed in NAV_ORDER and identical in both seats.
   */
  primary: string[];
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
    generateLabel: "Regenerate draft",
  },
};

/** Emphasis for a nav route under the current role. */
export function navEmphasis(role: Role, href: string): "primary" | "secondary" {
  return ROLES[role].primary.includes(href) ? "primary" : "secondary";
}

/**
 * The three kinds of destination in this product.
 *
 * Ordering the navigation by "whatever this seat works in first" was wrong,
 * and visibly so: in the banker's seat it pushed Guided Intake to seventh and
 * left How it works ninth in both roles, so a first-time visitor met the work
 * before the explanation of what the work is.
 *
 * These groups run in the order someone actually meets them — understand the
 * product, do the work, then check the work — and the sequence inside "work"
 * is the pipeline itself, which is the same order as the numbered cards on the
 * Overview.
 */
export type NavGroup = "orient" | "work" | "assure";

export const NAV_GROUP_LABEL: Record<NavGroup, string> = {
  orient: "Understand",
  work: "Prepare",
  assure: "Verify",
};

/**
 * The order is deliberately IDENTICAL in both roles.
 *
 * A navigation that rearranges itself under the user costs them the spatial
 * memory they build in the first minute, and it makes the difference between
 * the two seats harder to see rather than easier: when everything moves, the
 * thing that actually changed is camouflaged. The role changes weight, colour
 * and the standing obligation strip — not position.
 */
export const NAV_ORDER: { href: string; group: NavGroup }[] = [
  { href: "/", group: "orient" },
  { href: "/how", group: "orient" },
  { href: "/about", group: "orient" },

  { href: "/intake", group: "work" },
  { href: "/document", group: "work" },
  { href: "/gaps", group: "work" },
  { href: "/banker", group: "work" },

  { href: "/trace", group: "assure" },
  { href: "/observations", group: "assure" },
  { href: "/circulars", group: "assure" },
];

export function navGroup(href: string): NavGroup {
  return NAV_ORDER.find((item) => item.href === href)?.group ?? "work";
}

/**
 * Navigation in the fixed sequence above, annotated with its group and with
 * whether a group boundary falls immediately before it.
 */
export function groupedNav<T extends { href: string }>(
  items: T[],
): (T & { group: NavGroup; startsGroup: boolean })[] {
  const ordered = NAV_ORDER.map((entry) => {
    const item = items.find((candidate) => candidate.href === entry.href);
    return item ? { ...item, group: entry.group } : null;
  }).filter((entry): entry is T & { group: NavGroup } => entry !== null);

  // Anything not placed above still appears, rather than vanishing from the
  // product because someone forgot to add it to the order.
  for (const item of items) {
    if (!ordered.some((entry) => entry.href === item.href)) {
      ordered.push({ ...item, group: "work" as const });
    }
  }

  return ordered.map((entry, index) => ({
    ...entry,
    startsGroup: index > 0 && entry.group !== ordered[index - 1].group,
  }));
}
