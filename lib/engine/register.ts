/**
 * Deterministic register normalisation for issuer free text.
 *
 * WHY THIS EXISTS
 * A first-time promoter answers the intake in the first person — "We do
 * housekeeping for offices", "All our offices are rented". The language model
 * rewrites that into offer-document register for the NARRATIVE chapters, but
 * the FACTUAL chapters splice issuer answers into the draft directly, by
 * design: those chapters must reproduce what the issuer said, not an LLM's
 * paraphrase of it. The result was first-person prose surviving into the
 * document — and, because the factual path never calls the model, it survived
 * with no key configured too.
 *
 * So the fix has to be deterministic. This module performs a bounded set of
 * grammatical substitutions that change only PERSON and REGISTER:
 *
 *   we / our / us  ->  the Company / its / the Company
 *   we have        ->  the Company has        (auxiliary agreement)
 *   we sign        ->  the Company signs      (third-person inflection)
 *   about 19 percent -> approximately 19%     (register, figure untouched)
 *
 * THE SAFETY PROPERTY, and it is the whole point: no digit is ever added,
 * removed or altered. `preservesFigures()` asserts this and is exercised by
 * the engine verification run. A register fix that silently moved a figure
 * would be far worse than the casual prose it replaced.
 *
 * DELIBERATE LIMITS — this is a normaliser, not a rewriter:
 *  - A verb conjoined to an inflected one is left alone ("the Company signs
 *    contracts and bill monthly"). Inflecting it would require knowing the
 *    word is a verb; guessing wrong turns "and security" into "and
 *    securities", which corrupts meaning. A grammar slip is recoverable, a
 *    changed word is not.
 *  - Vague content ("Nothing much.", "nothing major") is NOT rewritten.
 *    Deciding that "Nothing much" means "no outstanding litigation" is an
 *    inference about a legal fact, and Drafter does not make those. The
 *    disclosure check flags it for the issuer instead.
 */

/** "we <x>" where x is irregular in the third person singular. */
const IRREGULAR_PRESENT: Record<string, string> = {
  have: "has",
  are: "is",
  were: "was",
  do: "does",
  go: "goes",
  say: "says",
};

/** Never inflected: they are already invariant after a singular subject. */
const INVARIANT_AFTER_SUBJECT = new Set([
  "will", "would", "can", "could", "may", "might", "must", "shall", "should",
  "had", "did", "has", "was", "is", "does", "need", "used", "want",
]);

/**
 * Irregular past forms. A past-tense verb must not be inflected — "we sent"
 * becomes "the Company sent", never "the Company sents". Regular pasts are
 * caught by the -ed test; these are the ones that are not.
 */
const IRREGULAR_PAST = new Set([
  "sent", "went", "took", "made", "got", "saw", "gave", "began", "grew",
  "built", "bought", "brought", "held", "kept", "left", "met", "paid", "put",
  "ran", "said", "sold", "spent", "stood", "taught", "told", "won", "wrote",
  "came", "became", "chose", "drew", "fell", "found", "knew", "led", "lost",
  "set", "shut", "thought", "understood", "drove", "read", "let", "cut",
]);

/** Adverbs that commonly sit between the subject and its verb. */
const INTERVENING_ADVERBS = new Set([
  "also", "mostly", "currently", "now", "generally", "typically", "only",
  "then", "usually", "always", "never", "still", "already", "often",
  "primarily", "mainly", "largely", "further", "additionally", "recently",
  "directly", "normally", "regularly", "sometimes",
]);

const CONTRACTIONS: [RegExp, string][] = [
  [/\bwe're\b/gi, "we are"],
  [/\bwe've\b/gi, "we have"],
  [/\bwe'll\b/gi, "we will"],
  [/\bwe'd\b/gi, "we would"],
  [/\bdon't\b/gi, "do not"],
  [/\bdoesn't\b/gi, "does not"],
  [/\bdidn't\b/gi, "did not"],
  [/\bhaven't\b/gi, "have not"],
  [/\bhasn't\b/gi, "has not"],
  [/\bcan't\b/gi, "cannot"],
  [/\bcouldn't\b/gi, "could not"],
  [/\bwon't\b/gi, "will not"],
  [/\bisn't\b/gi, "is not"],
  [/\baren't\b/gi, "are not"],
  [/\bwasn't\b/gi, "was not"],
];

/** Third-person singular form of a bare present-tense verb. */
function thirdPerson(verb: string): string {
  if (/(?:s|sh|ch|x|z|o)$/.test(verb)) return `${verb}es`;
  if (/[^aeiou]y$/.test(verb)) return `${verb.slice(0, -1)}ies`;
  return `${verb}s`;
}

/** True when the token must be left exactly as it is. */
function isInvariant(word: string): boolean {
  if (INVARIANT_AFTER_SUBJECT.has(word)) return true;
  if (IRREGULAR_PAST.has(word)) return true;
  if (/ed$/.test(word)) return true; // regular past tense: "started", "added"
  if (/^not$/.test(word)) return true;
  return false;
}

/**
 * Rewrite "we [adverb] <verb>" as "the Company [adverb] <verb-s>".
 *
 * Capitalisation is taken from the pronoun itself: promoters capitalise at the
 * start of a sentence, so "We" -> "The Company" and "we" -> "the Company"
 * reproduces sentence casing without having to parse sentence boundaries.
 */
function rewriteSubject(text: string): string {
  return text.replace(
    /\b(We|we)\b(?:(\s+)([A-Za-z]+))?(?:(\s+)([A-Za-z]+))?/g,
    (_match, pronoun: string, gap1: string, word1: string, gap2: string, word2: string) => {
      const subject = pronoun === "We" ? "The Company" : "the Company";

      if (!word1) return subject;

      const lower1 = word1.toLowerCase();

      // "we also work" — carry the adverb through and inflect the next word.
      if (INTERVENING_ADVERBS.has(lower1) && word2) {
        const lower2 = word2.toLowerCase();
        if (IRREGULAR_PRESENT[lower2]) {
          return `${subject}${gap1}${word1}${gap2}${IRREGULAR_PRESENT[lower2]}`;
        }
        if (isInvariant(lower2) || word2 !== lower2) {
          return `${subject}${gap1}${word1}${gap2}${word2}`;
        }
        return `${subject}${gap1}${word1}${gap2}${thirdPerson(word2)}`;
      }

      if (IRREGULAR_PRESENT[lower1]) {
        return `${subject}${gap1}${IRREGULAR_PRESENT[lower1]}${gap2 ?? ""}${word2 ?? ""}`;
      }

      // A capitalised or invariant token is not a bare present-tense verb.
      if (isInvariant(lower1) || word1 !== lower1) {
        return `${subject}${gap1}${word1}${gap2 ?? ""}${word2 ?? ""}`;
      }

      return `${subject}${gap1}${thirdPerson(word1)}${gap2 ?? ""}${word2 ?? ""}`;
    },
  );
}

/**
 * Normalise issuer free text into offer-document register.
 *
 * Idempotent: running it twice produces the same text, so it is safe to apply
 * at more than one layer.
 */
export function toFormalRegister(input: string): string {
  if (!input) return input;
  let text = input;

  for (const [pattern, replacement] of CONTRACTIONS) {
    text = text.replace(pattern, replacement);
  }

  text = rewriteSubject(text);

  // Possessive. Sentence-initial reads better as the full noun phrase; mid
  // sentence "its" avoids "the Company does the Company's own payroll".
  text = text.replace(/\bOur\b/g, "The Company's");
  text = text.replace(/\bour\b/g, "its");
  text = text.replace(/\bOurs\b/g, "The Company's");
  text = text.replace(/\bours\b/g, "the Company's");
  text = text.replace(/\bourselves\b/gi, "itself");

  // Object pronoun. Lowercase only, so the country abbreviation is untouched.
  text = text.replace(/\bus\b/g, "the Company");

  // Register of approximation — the qualifier changes, the figure does not.
  text = text.replace(/\b(about|around|roughly)\s+(?=\d)/gi, (m) =>
    /^[A-Z]/.test(m) ? "Approximately " : "approximately ",
  );
  text = text.replace(/(\d)\s*per\s?cent\b/gi, "$1%");

  // Conversational time adverbials. "Currently" carries the same meaning and is
  // the word a filed document uses; nothing stronger is substituted, because
  // "as at the date of this Draft Red Herring Prospectus" would be an assertion
  // about currency that the issuer has not actually made.
  text = text.replace(/\b[Rr]ight now\b/g, (m) => (m[0] === "R" ? "Currently" : "currently"));
  text = text.replace(/\b[Aa]s of now\b/g, (m) => (m[0] === "A" ? "Currently" : "currently"));
  text = text.replace(/\b[Tt]hese days\b/g, (m) => (m[0] === "T" ? "Currently" : "currently"));

  return text.replace(/\s+/g, " ").trim();
}

/**
 * Every number token in `after` must appear, in the same order, in `before`.
 *
 * This is the guarantee that makes the normaliser safe to run unattended over
 * issuer disclosures, and it is asserted in the engine verification run.
 */
export function preservesFigures(before: string, after: string): boolean {
  const digits = (text: string) => (text.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[.,]$/, ""));
  const a = digits(before);
  const b = digits(after);
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

/**
 * Apply normalisation, but fall back to the original if the safety property
 * fails. Prose that reads casually is a presentation problem; a figure that
 * moved is a disclosure defect, so the normaliser fails closed.
 */
export function normaliseIssuerProse(input: string): string {
  if (!input || typeof input !== "string") return input;
  const out = toFormalRegister(input);
  return preservesFigures(input, out) ? out : input;
}
