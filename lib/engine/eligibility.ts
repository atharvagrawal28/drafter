/**
 * SME IPO eligibility gate — Chapter IX, Regulations 228, 229 and 230(1).
 *
 * WHY THIS IS THE FIRST THING DRAFTER SHOULD ANSWER
 * -------------------------------------------------
 * Everything else in this product helps a promoter draft an offer document.
 * None of it matters if the issuer cannot make the issue at all — and that is
 * a question of arithmetic and dated facts, not of judgement. A promoter who
 * spends three months and several lakh rupees on a draft, only to be told by a
 * merchant banker that Regulation 229(6) rules them out for another year, has
 * been failed by every tool they used.
 *
 * So this runs BEFORE drafting is worth doing, and it is deliberately blunt.
 *
 * THE THREE-STATE RESULT MATTERS AS MUCH AS THE RULES
 * --------------------------------------------------
 * Each condition returns `met`, `not-met` or `unknown`, never a boolean.
 *
 *   - `not-met`  the issuer is disqualified on a figure or a fact it supplied.
 *   - `unknown`  Drafter has not been given what it needs to judge.
 *
 * Collapsing these would be dishonest in whichever direction it collapsed.
 * Treating silence as failure would tell a perfectly eligible issuer to give
 * up; treating silence as success would let a disqualified one spend months
 * drafting. An `unknown` is reported as a question the issuer must answer, and
 * the overall verdict is never "eligible" while any mandatory condition is
 * unknown.
 *
 * NOTHING HERE IS ADVICE. Eligibility is confirmed by the merchant banker and
 * the exchange. This reports what the issuer's own figures imply against the
 * regulation text, with the provision cited, so the question can be taken to
 * the banker early instead of late.
 */

import type { IssuerData } from "../types";
import { getPath, isPresent, round } from "./utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConditionState = "met" | "not-met" | "unknown";

export interface EligibilityCondition {
  id: string;
  /** The regulation this tests, cited exactly. */
  source: string;
  /** Plain-language statement of what must be true. */
  requirement: string;
  state: ConditionState;
  /** What the issuer's data actually shows. */
  finding: string;
  /** What to do about it — supply a figure, or wait, or restructure. */
  action?: string;
  /** Figures behind the determination, for the comparison table. */
  values?: { label: string; value: string }[];
  /**
   * A condition that only bites in certain circumstances (conversion from a
   * partnership, a recent change of promoter). Not applicable is not a pass.
   */
  applicable: boolean;
}

export interface EligibilityReport {
  issuerName: string;
  generatedAt: string;
  regulationSet: string;
  conditions: EligibilityCondition[];
  counts: { met: number; notMet: number; unknown: number; notApplicable: number };
  verdict: {
    level: "ineligible" | "indeterminate" | "eligible-on-the-figures";
    headline: string;
    detail: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function num(data: IssuerData, path: string): number | null {
  const raw = getPath(data, path);
  if (!isPresent(raw)) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** Explicit true/false only. `null` and absent both mean "not answered". */
function bool(data: IssuerData, path: string): boolean | null {
  const raw = getPath(data, path);
  return raw === true ? true : raw === false ? false : null;
}

function crore(value: number): string {
  return `INR ${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} crore`;
}

/**
 * A confirmation the issuer either gives or does not.
 *
 * These are the Regulation 230(1) housekeeping conditions — a depository
 * agreement, shares in demat form, no partly paid shares. Each is trivially
 * true for a well-advised issuer and quietly fatal for one that has not got to
 * it yet, which is exactly why they belong on a pre-screen rather than in a
 * banker's email three months in.
 */
function confirmation(
  data: IssuerData,
  spec: { id: string; path: string; source: string; requirement: string; whenFalse: string; whenMissing: string },
): EligibilityCondition {
  const answer = bool(data, spec.path);
  if (answer === true) {
    return { ...spec, applicable: true, state: "met", finding: "Confirmed by the issuer." };
  }
  if (answer === false) {
    return { ...spec, applicable: true, state: "not-met", finding: spec.whenFalse, action: spec.whenMissing };
  }
  return {
    ...spec,
    applicable: true,
    state: "unknown",
    finding: "Not yet answered.",
    action: spec.whenMissing,
  };
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

export function runEligibility(data: IssuerData, issuerName?: string): EligibilityReport {
  const conditions: EligibilityCondition[] = [];

  // ---- Reg 229(1)/(2): post-issue paid-up capital ceiling ------------
  {
    const preShares = num(data, "issue.pre_issue_capital");
    const freshShares = num(data, "issue.fresh_issue_shares");
    const faceValue = num(data, "issue.face_value");

    const base = {
      id: "REG-229-1",
      source: "ICDR Reg 229(1) and 229(2)",
      requirement:
        "Post-issue paid-up capital must not exceed INR 25 crore. Up to INR 10 crore the issuer falls squarely within Chapter IX; between INR 10 crore and INR 25 crore it may still issue under this Chapter.",
      applicable: true,
    };

    if (preShares === null || freshShares === null || faceValue === null) {
      conditions.push({
        ...base,
        state: "unknown",
        finding:
          "Cannot be computed. Post-issue paid-up capital needs the shares outstanding before the issue, the new shares being issued, and the face value.",
        action: "Supply the pre-issue share count, the fresh issue size in shares, and the face value per share.",
      });
    } else {
      const postIssueCapital = ((preShares + freshShares) * faceValue) / 1e7; // crore
      const values = [
        { label: "Shares outstanding before the issue", value: preShares.toLocaleString("en-IN") },
        { label: "New shares to be issued", value: freshShares.toLocaleString("en-IN") },
        { label: "Face value per share", value: `INR ${faceValue}` },
        { label: "Post-issue paid-up capital", value: crore(round(postIssueCapital)) },
      ];

      if (postIssueCapital > 25) {
        conditions.push({
          ...base,
          state: "not-met",
          finding: `Post-issue paid-up capital works out at ${crore(round(postIssueCapital))}, above the INR 25 crore ceiling for Chapter IX.`,
          action:
            "An issue of this size is a main-board issue under Chapter II, not an SME issue. Either reduce the issue, or take advice on a main-board listing. the disclosure regime is materially heavier.",
          values,
        });
      } else {
        conditions.push({
          ...base,
          state: "met",
          finding:
            postIssueCapital > 10
              ? `Post-issue paid-up capital works out at ${crore(round(postIssueCapital))}. Above INR 10 crore, so the issue proceeds under Regulation 229(2) rather than 229(1), but within Chapter IX.`
              : `Post-issue paid-up capital works out at ${crore(round(postIssueCapital))}, within the INR 10 crore threshold in Regulation 229(1).`,
          values,
        });
      }
    }
  }

  // ---- Reg 229(6): the operating-profit test (new, 8 March 2025) -----
  // The condition most likely to surprise a promoter, because it did not exist
  // before March 2025 and it is measured on EBITDA rather than on PAT.
  {
    const base = {
      id: "REG-229-6",
      source: "ICDR Reg 229(6), inserted w.e.f. 8 March 2025",
      requirement:
        "Operating profit (earnings before interest, depreciation and tax) from operations of at least INR 1 crore in at least two of the three preceding financial years.",
      applicable: true,
    };

    const ebitda = getPath(data, "financials.ebitda_3yr");
    const years: string[] = Array.isArray(getPath(data, "financials.years")) ? getPath(data, "financials.years") : [];

    const series: number[] = Array.isArray(ebitda)
      ? ebitda.filter((v: any) => v !== null && v !== undefined && Number.isFinite(Number(v))).map(Number)
      : [];

    if (series.length < 3) {
      conditions.push({
        ...base,
        state: "unknown",
        finding:
          series.length === 0
            ? "Operating profit has not been supplied for any year, so the test cannot be run."
            : `Operating profit supplied for ${series.length} of the three preceding financial years.`,
        action:
          "Supply EBITDA, meaning operating profit before interest, depreciation and tax, for each of the last three financial years. Your auditor can derive it from the restated statements, and the financials upload reads it automatically from a labelled row.",
        values: series.map((value, index) => ({
          label: years[index] ?? `Year ${index + 1}`,
          value: crore(value),
        })),
      });
    } else {
      const qualifying = series.filter((value) => value >= 1);
      const values = series.map((value, index) => ({
        label: years[index] ?? `Year ${index + 1}`,
        value: `${crore(value)}${value >= 1 ? "  ✓" : ""}`,
      }));

      if (qualifying.length >= 2) {
        conditions.push({
          ...base,
          state: "met",
          finding: `Operating profit was INR 1 crore or more in ${qualifying.length} of the last three financial years.`,
          values,
        });
      } else {
        conditions.push({
          ...base,
          state: "not-met",
          finding:
            `Operating profit reached INR 1 crore in ${qualifying.length === 0 ? "none" : "only one"} of the last three financial years. ` +
            `Regulation 229(6) requires at least two.`,
          action:
            "This condition cannot be drafted around and it cannot be waived. The issue must wait until two of the three most recent financial years each show at least INR 1 crore of operating profit. Confirm the computation with your auditor first. It is EBITDA from operations, not profit after tax, and the two are easily confused.",
          values,
        });
      }
    }
  }

  // ---- Reg 229(4): one full financial year since conversion ----------
  {
    const converted = bool(data, "eligibility.converted_from_firm");
    const base = {
      id: "REG-229-4",
      source: "ICDR Reg 229(4)",
      requirement:
        "An issuer converted from a proprietorship, partnership firm or LLP must have existed as a company for at least one full financial year before the draft offer document is filed.",
    };

    if (converted === false) {
      conditions.push({
        ...base,
        applicable: false,
        state: "met",
        finding: "The issuer was incorporated as a company and was not converted from a firm, so this does not apply.",
      });
    } else if (converted === null) {
      conditions.push({
        ...base,
        applicable: true,
        state: "unknown",
        finding: "Not yet answered.",
        action: "State whether the company was converted from a proprietorship, partnership firm or LLP.",
      });
    } else {
      const complete = bool(data, "eligibility.full_year_since_conversion");
      conditions.push({
        ...base,
        applicable: true,
        state: complete === true ? "met" : complete === false ? "not-met" : "unknown",
        finding:
          complete === true
            ? "The issuer confirms a full financial year has passed since conversion."
            : complete === false
              ? "A full financial year has not yet passed since conversion, so the draft offer document cannot be filed."
              : "The issuer was converted from a firm, but it is not stated whether a full financial year has since passed.",
        action:
          complete === false
            ? "The filing must wait until one complete financial year has elapsed after conversion. The restated financial statements prepared post-conversion must also follow Schedule III of the Companies Act, 2013."
            : complete === null
              ? "Confirm whether a full financial year has elapsed since conversion."
              : undefined,
      });
    }
  }

  // ---- Reg 229(5): one year since a change of control -----------------
  {
    const changed = bool(data, "eligibility.promoter_change_last_year");
    const base = {
      id: "REG-229-5",
      source: "ICDR Reg 229(5)",
      requirement:
        "Where there has been a complete change of promoter, or new promoters have acquired more than 50% of the shareholding, the draft offer document may be filed only after one year from that change.",
    };

    if (changed === false) {
      conditions.push({
        ...base,
        applicable: false,
        state: "met",
        finding: "No complete change of promoter, and no new promoter has acquired more than 50%.",
      });
    } else if (changed === null) {
      conditions.push({
        ...base,
        applicable: true,
        state: "unknown",
        finding: "Not yet answered.",
        action:
          "State whether there has been a complete change of promoter, or an acquisition of more than 50% of the shareholding by new promoters, within the last year.",
      });
    } else {
      conditions.push({
        ...base,
        applicable: true,
        state: "not-met",
        finding:
          "A change of promoter or an acquisition of more than 50% of the shareholding has occurred within the last year.",
        action:
          "The draft offer document may not be filed until one year has passed from the date of the final change. Fix that date with your merchant banker. the year runs from the change, not from the financial year end.",
      });
    }
  }

  // ---- Reg 228: entities not eligible ---------------------------------
  conditions.push(
    confirmation(data, {
      id: "REG-228",
      path: "promoters.promoter_disqualification_confirmation",
      source: "ICDR Reg 228",
      requirement:
        "Neither the issuer nor any of its promoters, promoter group, directors or selling shareholders is debarred from accessing the capital market; none is a wilful defaulter or fraudulent borrower; and no promoter or director is a fugitive economic offender.",
      whenFalse:
        "The issuer has indicated that one or more of these disqualifications applies. Regulation 228 makes the issuer ineligible.",
      whenMissing:
        "This is an eligibility condition, not a disclosure. Obtain written declarations from every promoter and director and have the merchant banker verify them in due diligence.",
    }),
  );

  // ---- Reg 230(1): general conditions ---------------------------------
  const GENERAL: {
    id: string;
    path: string;
    requirement: string;
    whenFalse: string;
    whenMissing: string;
  }[] = [
    {
      id: "REG-230-1-A",
      path: "eligibility.exchange_application",
      requirement:
        "An application has been made to one or more SME exchanges for listing, and one has been chosen as the designated stock exchange.",
      whenFalse: "No application has been made to an SME exchange.",
      whenMissing:
        "Apply to the SME platform you intend to list on and record which exchange is the designated stock exchange.",
    },
    {
      id: "REG-230-1-B",
      path: "eligibility.depository_agreement",
      requirement:
        "The issuer has entered into an agreement with a depository for dematerialisation of its specified securities, both issued and proposed.",
      whenFalse: "No depository agreement is in place.",
      whenMissing: "Execute the tripartite agreement with a depository and the registrar.",
    },
    {
      id: "REG-230-1-C",
      path: "eligibility.no_partly_paid_shares",
      requirement: "All existing partly paid-up equity shares have been fully paid up, or forfeited.",
      whenFalse: "Partly paid-up equity shares remain outstanding.",
      whenMissing: "Call and receive the balance on any partly paid shares, or forfeit them, before filing.",
    },
    {
      id: "REG-230-1-D",
      path: "eligibility.promoter_shares_demat",
      requirement: "All specified securities held by the promoters are held in dematerialised form.",
      whenFalse: "Some promoter holdings are not in dematerialised form.",
      whenMissing: "Dematerialise every promoter holding before filing.",
    },
    {
      id: "REG-230-1-E",
      path: "eligibility.firm_financing_arrangements",
      requirement:
        "Firm arrangements of finance, through verifiable means, are in place for 75% of the stated means of finance for any project funded from the issue proceeds, excluding the issue itself and identifiable internal accruals.",
      whenFalse:
        "Firm financing arrangements are not in place for 75% of the stated means of finance excluding the issue proceeds.",
      whenMissing:
        "Obtain sanction letters or equivalent verifiable evidence for 75% of the project cost that the issue is not funding. Where a bank or financial institution part-funds the project, the sanction letter details must be disclosed in the offer document.",
    },
  ];

  for (const spec of GENERAL) {
    conditions.push(
      confirmation(data, {
        ...spec,
        source: `ICDR Reg 230(1)(${spec.id.slice(-1).toLowerCase()})`,
      }),
    );
  }

  // ---- Verdict ---------------------------------------------------------
  const applicable = conditions.filter((c) => c.applicable);
  const notMet = applicable.filter((c) => c.state === "not-met");
  const unknown = applicable.filter((c) => c.state === "unknown");
  const met = applicable.filter((c) => c.state === "met");

  let verdict: EligibilityReport["verdict"];
  if (notMet.length > 0) {
    const blocking = notMet.map((c) => c.source.replace("ICDR ", "")).join(", ");
    verdict = {
      level: "ineligible",
      headline:
        notMet.length === 1
          ? "On the figures supplied, this issuer is not currently eligible for an SME IPO."
          : `On the figures supplied, this issuer fails ${notMet.length} eligibility conditions.`,
      detail:
        `${blocking} ${notMet.length === 1 ? "is" : "are"} not satisfied. Eligibility is a gate, not a disclosure. ` +
        `no amount of drafting changes it, and a draft filed in this state is returned. ` +
        `Read the conditions below, then take them to a merchant banker before spending further on the issue.`,
    };
  } else if (unknown.length > 0) {
    verdict = {
      level: "indeterminate",
      headline: `${unknown.length} eligibility condition${unknown.length === 1 ? "" : "s"} cannot yet be judged.`,
      detail:
        `Nothing supplied so far disqualifies this issuer, and ${met.length} condition${met.length === 1 ? " is" : "s are"} satisfied. ` +
        `But eligibility cannot be confirmed while any condition is unanswered. An unanswered condition is a question, not a pass. ` +
        `Each one below names exactly what is needed.`,
    };
  } else {
    verdict = {
      level: "eligible-on-the-figures",
      headline: "Every eligibility condition Drafter can test is satisfied.",
      detail:
        `All ${met.length} applicable conditions under Regulations 228, 229 and 230(1) are met on the information supplied. ` +
        `This is not a clearance: the SME exchange applies its own track-record and net-worth criteria under Regulation 229(3), ` +
        `and eligibility is confirmed by the merchant banker in due diligence. It does mean nothing in the ICDR gate is standing in the way.`,
    };
  }

  return {
    issuerName: issuerName ?? getPath(data, "identity.company_name") ?? "the issuer",
    generatedAt: new Date().toISOString(),
    regulationSet:
      "SEBI (ICDR) Regulations, 2018, Chapter IX, Regulations 228, 229 and 230(1), as last amended on 8 March 2025",
    conditions,
    counts: {
      met: met.length,
      notMet: notMet.length,
      unknown: unknown.length,
      notApplicable: conditions.length - applicable.length,
    },
    verdict,
  };
}
