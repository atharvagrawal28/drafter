/**
 * Populates the fields introduced by the R3 corpus upgrade in both sample
 * issuers, so the 13 new requirements are genuinely exercised rather than
 * showing as permanently missing.
 *
 * The Aarna issuer is given a general-corporate-purposes allocation that
 * BREACHES the ICDR ceiling — a fourth planted defect, of a new kind
 * (a regulatory arithmetic breach rather than an inconsistency), which the new
 * percentage_cap check must catch.
 *
 * Run once: tsx scripts/extend-samples.ts
 */

import * as fs from "fs";

// ---------------------------------------------------------------------------
// Shreeji Auto Components — clean on all the new items.
// ---------------------------------------------------------------------------
const autocompPath = "data/sample_company_autocomp.json";
const autocomp = JSON.parse(fs.readFileSync(autocompPath, "utf8"));

autocomp.business.intellectual_property =
  "The Company holds a registered trademark for its word mark in class 12 (registration granted 2019). It holds no patents. Tooling designs used on the machining lines are maintained as confidential know-how and are not separately registered.";
autocomp.business.immovable_properties =
  "Rajkot Plant I at Plot 42, GIDC Industrial Estate is held on a 99-year lease from the Gujarat Industrial Development Corporation, with 87 years remaining. Rajkot Plant II at Plot 117, Metoda GIDC is held on a 99-year lease with 91 years remaining. The registered office is situated within Plant I. The Company owns no freehold immovable property.";
autocomp.business.kpis = [
  { name: "Revenue from operations (INR crore)", values: [61.2, 70.4, 78.9] },
  { name: "EBITDA margin (%)", values: [12.99, 13.67, 14.37] },
  { name: "Profit after tax margin (%)", values: [6.73, 7.64, 8.68] },
  { name: "Capacity utilisation (%)", values: [68, 74, 76] },
  { name: "Revenue from the top two customers (%)", values: [54, 52, 50] },
];

autocomp.financials.eps_3yr = [5.49, 7.17, 9.12];
autocomp.financials.ronw_3yr = [15.6, 16.9, 18.4];
autocomp.financials.contingent_liabilities =
  "Contingent liabilities as at 31 March 2026 comprise the disputed GST input-credit demand of INR 1.15 crore for FY 2023-24, which is under appeal, and bank guarantees of INR 0.42 crore issued in favour of customers.";

autocomp.issue.issue_expenses_breakup = [
  { head: "Fees of the Lead Manager and Underwriter", amount: 0.62 },
  { head: "Fees of the Registrar to the Issue", amount: 0.14 },
  { head: "Fees of legal advisors and auditors", amount: 0.28 },
  { head: "Advertising, printing and distribution", amount: 0.24 },
  { head: "Regulatory, listing and depository fees", amount: 0.22 },
];
autocomp.issue.working_capital_basis =
  "The incremental working-capital requirement has been estimated on the basis of holding periods of 62 days for trade receivables, 48 days for inventory and 41 days for trade payables, consistent with the levels observed in FY26, applied to the revenue projected following commissioning of the third machining line. The computation has been certified by the statutory auditor.";
autocomp.issue.monitoring_agency =
  "The Issue size does not exceed the threshold at which the appointment of a monitoring agency is mandatory under the ICDR Regulations. The Audit Committee will monitor the utilisation of the Net Proceeds and the Company will disclose any deviation in the manner required by the LODR Regulations.";

autocomp.management.subsidiaries =
  "The Company does not have any subsidiary as at the date of this Draft Red Herring Prospectus.";
autocomp.promoters.waca = 12.4;
autocomp.issue_structure.lead_manager_track_record = "";

fs.writeFileSync(autocompPath, JSON.stringify(autocomp, null, 2) + "\n");

// ---------------------------------------------------------------------------
// Aarna Specialty Chemicals — carries a NEW fourth planted defect:
// general corporate purposes at 28.9% of gross proceeds, above the 25% ceiling.
// ---------------------------------------------------------------------------
const specchemPath = "data/sample_company_specchem.json";
const specchem = JSON.parse(fs.readFileSync(specchemPath, "utf8"));

specchem.business.intellectual_property =
  "The Company holds two registered trademarks covering its additive product range. Formulations for the rheology modifier range are maintained as trade secrets and are not patented. The Company has applied for registration of one further mark, which is pending.";
specchem.business.immovable_properties =
  "The manufacturing facility at Plot D-22, MIDC Tarapur is held under a lease from the Maharashtra Industrial Development Corporation expiring in 2061. Part of the adjoining premises is leased from the Managing Director in his personal capacity at an annual rent of INR 0.36 crore. The corporate office at Andheri (East), Mumbai is held on a five-year commercial lease.";
specchem.business.kpis = [
  { name: "Revenue from operations (INR crore)", values: [38.6, 46.9, 54.3] },
  { name: "EBITDA margin (%)", values: [14.02, 14.88, 15.51] },
  { name: "Profit after tax margin (%)", values: [6.94, 7.91, 8.58] },
  { name: "Capacity utilisation (%)", values: [61, 68, 74] },
  { name: "Revenue from contract manufacturing (%)", values: [0, 19, 24] },
];

specchem.financials.eps_3yr = [4.47, 6.18, 7.77];
specchem.financials.ronw_3yr = [15.6, 17.7, 18.2];
specchem.financials.contingent_liabilities =
  "Contingent liabilities as at 31 March 2026 comprise the income-tax demand of INR 0.18 crore for AY 2023-24 paid under protest and under appeal, and the claim of INR 0.42 crore in the civil recovery suit pending before the Civil Judge, Palghar.";

specchem.issue.issue_expenses_breakup = [
  { head: "Fees of the Lead Manager and Underwriter", amount: 0.6 },
  { head: "Fees of the Registrar to the Issue", amount: 0.15 },
  { head: "Fees of legal advisors and auditors", amount: 0.3 },
  { head: "Advertising, printing and distribution", amount: 0.25 },
  { head: "Regulatory, listing and depository fees", amount: 0.2 },
];
specchem.issue.working_capital_basis =
  "The incremental working-capital requirement has been estimated on the basis of holding periods of 71 days for trade receivables, 55 days for inventory and 38 days for trade payables, applied to the revenue projected following commissioning of the fourth reactor train.";
specchem.issue.monitoring_agency = "";

// PLANTED DEFECT 4 — general corporate purposes above the ICDR ceiling.
//
// The re-weighting below is deliberate and constrained: the four amounts must
// still total INR 19.75 crore so that DEFECT-1 (objects short of the stated
// INR 21.00 crore net proceeds by INR 1.25 crore) survives EXACTLY as
// described, while general corporate purposes rises to INR 6.00 crore —
// 26.7% of the INR 22.50 crore gross issue size, above the 25% ceiling.
// Two independent defects now sit in the same table, which is realistic.
specchem.issue.objects_breakup = [
  { purpose: "Installation of a fourth reactor train and associated utilities at Tarapur", amount: 7.0, deployment: "FY27" },
  { purpose: "Upgradation of the effluent treatment and solvent recovery facility", amount: 3.5, deployment: "FY27" },
  { purpose: "Funding incremental working capital requirements", amount: 3.25, deployment: "FY27 and FY28" },
  { purpose: "General corporate purposes", amount: 6.0, deployment: "FY27" },
];

specchem.management.subsidiaries =
  "The Company does not have any subsidiary as at the date of this Draft Red Herring Prospectus.";
specchem.promoters.waca = 18.7;
specchem.issue_structure.lead_manager_track_record = "";

specchem.meta.planted_defects.push({
  id: "DEFECT-4",
  type: "gcp_ceiling_breach",
  where:
    "Objects of the Issue (Chapter III.5) allocates INR 6.00 crore to general corporate purposes against a gross issue size of INR 22.50 crore — 26.7%, above the 25% ceiling prescribed under the ICDR Regulations.",
  should_be_caught_by: "R5.9 percentage_cap",
});

fs.writeFileSync(specchemPath, JSON.stringify(specchem, null, 2) + "\n");

// ---------------------------------------------------------------------------
console.log("Extended both sample issuers with R3 fields.");
const objects = specchem.issue.objects_breakup;
const total = objects.reduce((s: number, o: any) => s + o.amount, 0);
const gcp = objects.find((o: any) => /general corporate/i.test(o.purpose)).amount;
console.log(`  Aarna objects total: INR ${total.toFixed(2)} cr vs net proceeds INR ${specchem.issue.net_proceeds} cr`);
console.log(`  Aarna GCP: INR ${gcp.toFixed(2)} cr = ${((gcp / specchem.issue.issue_size) * 100).toFixed(1)}% of gross (ceiling 25%)`);
