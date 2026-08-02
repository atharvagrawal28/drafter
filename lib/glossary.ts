/**
 * Plain-language definitions of the capital-markets vocabulary this product
 * unavoidably uses.
 *
 * WHY THIS EXISTS
 * SEBI's problem statement asks for something "accessible to promoters without
 * specialist knowledge" and "simple enough for a first-time issuer to engage
 * with". A promoter who has never seen an offer document meets perhaps thirty
 * terms in this interface — coverage, net proceeds, lock-in, related party,
 * market maker — and every one of them is a point where they either ask
 * somebody or guess. Neither is what the clause asks for.
 *
 * HOW THESE ARE WRITTEN
 * `plain` is the definition, addressed to someone who runs a business and has
 * never raised capital. No term is defined using another term from this file
 * without that term also being explained inline. Sentences are short. Nothing
 * is hedged into uselessness.
 *
 * `matters` answers the question the promoter actually has, which is never
 * "what is this" but "why am I being asked about it".
 *
 * `regulation` is stated only where a specific provision governs the term, and
 * is the SME provision — Chapter IX — not the main-board equivalent.
 */

export interface GlossaryEntry {
  /** Canonical term, as displayed in the panel heading. */
  term: string;
  /** Other spellings and abbreviations that should resolve to this entry. */
  aliases?: string[];
  /** The definition, for someone with no capital-markets background. */
  plain: string;
  /** Why the promoter is being asked about it at all. */
  matters?: string;
  /** The governing provision, where one specific provision governs. */
  regulation?: string;
}

const ENTRIES: GlossaryEntry[] = [
  {
    term: "DRHP",
    aliases: ["draft red herring prospectus", "offer document", "draft offer document"],
    plain:
      "The Draft Red Herring Prospectus — the document a company files before an IPO that tells investors everything material about the business. It is called a draft because the final price is not in it yet.",
    matters:
      "This is the document Drafter is helping you produce. It is the single largest piece of work in an SME listing.",
  },
  {
    term: "ICDR Regulations",
    aliases: ["icdr", "sebi icdr"],
    plain:
      "SEBI's rulebook for raising capital from the public — the Issue of Capital and Disclosure Requirements Regulations, 2018. It sets out what an offer document must contain.",
    matters: "Every disclosure requirement Drafter tracks comes from these regulations or from the exchange checklists.",
  },
  {
    term: "Chapter IX",
    aliases: ["chapter 9"],
    plain:
      "The part of the ICDR Regulations written specifically for small and medium enterprises, covering Regulations 227 to 280. Its thresholds are different from — and usually easier than — the ones for a main-board listing.",
    matters: "If your company lists on the SME platform, this chapter governs you, not the main-board rules.",
    regulation: "ICDR Regulations 227–280",
  },
  {
    term: "SME platform",
    aliases: ["nse emerge", "bse sme", "sme exchange"],
    plain:
      "The separate segment of a stock exchange for smaller companies — NSE Emerge or BSE SME. Listing requirements are lighter than the main board, and the minimum investment size is larger.",
    matters: "Which platform you list on decides which checklist applies on top of the ICDR Regulations.",
  },
  {
    term: "Merchant banker",
    aliases: ["lead manager", "book running lead manager", "brlm", "intermediary"],
    plain:
      "The SEBI-registered firm that manages your IPO. They check everything in the offer document, certify it, and file it. Nothing reaches the exchange except through them.",
    matters:
      "Drafter prepares a draft for them to work from. It does not replace them, and the regulations do not allow it to.",
  },
  {
    term: "Due diligence",
    plain:
      "The merchant banker's independent verification of everything the company says about itself — reading the contracts, the approvals, the minute books, and the auditor's papers.",
    matters:
      "Some requirements can only ever be discharged by this process. Drafter reports those separately so they never look like your unfinished work.",
  },
  {
    term: "Disclosure coverage",
    aliases: ["coverage"],
    plain:
      "How much of the required disclosure framework your answers currently satisfy, as a percentage. A requirement fully answered counts one; partly answered counts a half.",
    matters:
      "It is computed from your actual answers, not estimated. It moves as you fill in the intake, and it is not a quality score — a high coverage draft can still carry defects.",
  },
  {
    term: "Exchange pre-check",
    aliases: ["pre-check", "observation letter", "observations"],
    plain:
      "The exchange's review of a filed draft. Where it finds problems it issues an observation letter — a written list of things to fix before the issue can proceed.",
    matters:
      "Each round of observations costs weeks. Drafter runs the same kinds of check first, so the fixable things are fixed before filing.",
  },
  {
    term: "Restated financial statements",
    aliases: ["restated financials"],
    plain:
      "Your last three years of accounts, re-presented in one consistent format and re-examined by your auditor specifically for the offer document.",
    matters:
      "Drafter deliberately does not generate these. They are your auditor's signed work, and a placeholder here is the correct output, not a gap.",
  },
  {
    term: "Objects of the issue",
    aliases: ["objects"],
    plain: "What you will actually spend the money on, item by item, with an amount against each.",
    matters:
      "The amounts must add up to the net proceeds. If they do not, that is one of the first things an exchange queries.",
  },
  {
    term: "Net proceeds",
    plain:
      "The money you actually keep — the total raised, less the costs of the issue such as the merchant banker's fees, the registrar, printing and listing charges.",
    matters: "Your objects of the issue are funded from this figure, not from the headline issue size.",
  },
  {
    term: "Fresh issue",
    plain: "New shares created and sold by the company. This money comes into the company.",
    matters: "Contrast with an offer for sale, where the money goes to the selling shareholder instead.",
  },
  {
    term: "Offer for sale",
    aliases: ["ofs"],
    plain:
      "Existing shareholders selling some of their shares in the IPO. The company receives none of this money — it goes to the sellers.",
    matters:
      "For an SME issue this is capped, and a selling shareholder may only offer part of what they hold.",
    regulation: "ICDR Regulation 230(1)(f), (g)",
  },
  {
    term: "General corporate purposes",
    aliases: ["gcp"],
    plain:
      "The portion of the money not tied to a specific, described object — a general-purpose bucket.",
    matters:
      "It is capped for SME issuers at the lower of 15% of the amount raised or INR 10 crore. Exceeding it is arithmetic, and the exchange checks it directly.",
    regulation: "ICDR Regulation 230(2)",
  },
  {
    term: "Promoter",
    aliases: ["promoters"],
    plain:
      "The person or people who control the company — usually the founders and their family. It is a legal status, not a job title.",
    matters:
      "Promoters carry obligations an ordinary shareholder does not, including a minimum contribution to the issue and a lock-in on their shares.",
  },
  {
    term: "Promoter group",
    plain:
      "The promoters plus the relatives and companies connected to them, as defined by the regulations. The definition is wider than most people expect.",
    matters:
      "Transactions with anyone in this group must be disclosed. Missing one is a common reason drafts come back.",
  },
  {
    term: "Related party",
    aliases: ["related-party transactions", "related party transactions"],
    plain:
      "Anyone connected to the company through control or family — a promoter, a director, their relatives, or a business any of them controls. A transaction with them is a related-party transaction.",
    matters:
      "Buying from a company your brother owns is perfectly legal, but it must be disclosed. Declaring nil while your own answers describe such a dealing is a defect Drafter flags.",
  },
  {
    term: "Lock-in",
    plain:
      "A period after listing during which certain shares cannot be sold. Promoters' shares are locked in for longer than everyone else's.",
    matters: "It exists so promoters stay committed after raising public money.",
    regulation: "ICDR Regulation 236 and following",
  },
  {
    term: "Minimum promoters' contribution",
    plain:
      "The promoters must themselves hold at least a set share of the company after the issue — for an SME issue, at least 20% of the post-issue capital.",
    matters: "If the promoters would fall below this after the issue, the issue cannot proceed as structured.",
    regulation: "ICDR Regulation 236",
  },
  {
    term: "Post-issue paid-up capital",
    aliases: ["paid-up capital"],
    plain:
      "The face value of all your shares added together, after the new shares from the IPO are counted. It is not the market value and not the money raised.",
    matters:
      "It decides whether you may use the SME route at all. Chapter IX is available up to INR 25 crore of post-issue capital.",
    regulation: "ICDR Regulation 229",
  },
  {
    term: "Face value",
    plain:
      "The nominal value printed on a share, commonly INR 10. It is an accounting figure and has almost nothing to do with what the share is worth.",
    matters: "The issue price is usually well above face value; the difference is the premium.",
  },
  {
    term: "Price band",
    plain:
      "The range of prices within which investors may bid, for example INR 95 to INR 100. The final price is fixed after bidding closes.",
    matters: "A fixed-price issue has no band — the price is stated up front instead.",
  },
  {
    term: "Market maker",
    plain:
      "A broker who undertakes to keep quoting both a buy and a sell price for your shares after listing, so a small investor can always trade.",
    matters:
      "Market making is compulsory for an SME listing, and a portion of the issue is reserved for the market maker.",
    regulation: "ICDR Regulation 261",
  },
  {
    term: "Monitoring agency",
    plain:
      "An independent agency appointed to watch how the money raised is actually spent, and to report on it.",
    matters:
      "It is required only for larger SME issues — where the issue size excluding any offer for sale exceeds INR 50 crore.",
    regulation: "ICDR Regulation 262(1)",
  },
  {
    term: "ASBA",
    aliases: ["application supported by blocked amount", "upi mandate"],
    plain:
      "The way IPO applications are paid for. The money is blocked in the investor's own bank account rather than transferred, and is only taken if shares are actually allotted.",
    matters: "Investors keep the interest, and refunds become an unblocking instruction rather than a cheque.",
  },
  {
    term: "Registrar to the issue",
    aliases: ["registrar", "rta"],
    plain:
      "The firm that processes all the applications, decides who gets how many shares, and instructs the banks to unblock the rest.",
  },
  {
    term: "Underwriter",
    plain:
      "A firm that commits to buy any part of the issue the public does not take up, so the issue does not fail for want of subscription.",
    matters: "An SME issue must be fully underwritten.",
    regulation: "ICDR Regulation 260",
  },
  {
    term: "Eligibility gate",
    aliases: ["eligibility"],
    plain:
      "The set of conditions a company must satisfy before it may make an SME issue at all — things like not being a wilful defaulter, having applied to an exchange, and holding promoter shares in demat form.",
    matters:
      "These come before disclosure quality. A company that fails one of them cannot fix it by writing a better document.",
    regulation: "ICDR Regulations 228, 229 and 230(1)",
  },
  {
    term: "Provenance",
    plain:
      "The record, kept against every paragraph and table in the draft, of where its content came from — your answer, a calculation from your answers, standard text, or the language model.",
    matters:
      "It is how you can check any sentence in the document without taking anyone's word for it, including ours.",
  },
  {
    term: "Placeholder",
    plain:
      "A marked gap in the draft naming exactly what is still needed and who must supply it — usually your auditor, your counsel, or the merchant banker.",
    matters:
      "These are not failures. They sit where a named professional must sign, and generating text there would be the most dangerous thing this product could do.",
  },
  {
    term: "Standard clause",
    aliases: ["standard text"],
    plain:
      "Text that is near-identical in every offer document — definitions, the application procedure, the terms of the issue. Drafter writes it out in full.",
    matters: "It is still the merchant banker's to settle, so it is marked as such rather than presented as yours.",
  },
  {
    term: "Working capital",
    plain:
      "The money tied up in running the business day to day — stock on the floor and money customers owe you, less what you owe suppliers.",
    matters: "It is one of the most common objects of an SME issue, and the basis of the estimate must be explained.",
  },
];

/** Lookup by term or alias, case- and punctuation-insensitive. */
const INDEX = new Map<string, GlossaryEntry>();
for (const entry of ENTRIES) {
  const keys = [entry.term, ...(entry.aliases ?? [])];
  for (const key of keys) INDEX.set(normalise(key), entry);
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function lookupTerm(term: string): GlossaryEntry | undefined {
  return INDEX.get(normalise(term));
}

export const glossary = ENTRIES;

/** Every term and alias, longest first — so "promoter group" wins over "promoter". */
export const glossaryKeys = Array.from(INDEX.keys()).sort((a, b) => b.length - a.length);
