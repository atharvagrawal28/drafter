/**
 * Backtest step 1 — read a real filed SME DRHP and profile it.
 *
 * Extracts the full text of an actual filed document so we can compare
 * Drafter's generated draft against it: which chapters it contains, how long
 * each one is, and which of Drafter's 60 disclosure requirements it evidences.
 *
 * Usage: tsx scripts/backtest-extract.ts <path-to.pdf> <out-dir>
 */

import * as fs from "fs";
import * as path from "path";
import { structure } from "../lib/data";

async function main() {
  const pdfPath = process.argv[2];
  const outDir = process.argv[3];
  if (!pdfPath || !outDir) {
    console.error("usage: tsx scripts/backtest-extract.ts <pdf> <outdir>");
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const { extractText, getDocumentProxy } = await import("unpdf");
  const buffer = new Uint8Array(fs.readFileSync(pdfPath));
  const pdf = await getDocumentProxy(buffer);

  console.log(`pages: ${pdf.numPages}`);

  // Page-by-page so we can locate chapters by page number.
  const { text } = await extractText(pdf, { mergePages: false });
  const pages: string[] = Array.isArray(text) ? text : [String(text)];

  fs.writeFileSync(path.join(outDir, "pages.json"), JSON.stringify(pages));
  const full = pages.join("\n\n");
  fs.writeFileSync(path.join(outDir, "full.txt"), full);

  console.log(`characters: ${full.length.toLocaleString()}`);
  console.log(`words: ${full.split(/\s+/).filter(Boolean).length.toLocaleString()}`);

  // ---- Locate each of our chapter titles in the real document ----------
  // A real DRHP prints chapter titles in caps as section headers. We look for
  // the title on a page and take the LAST occurrence outside the first 15
  // pages (the TOC repeats every title early on).
  const chapters = structure.sections.flatMap((section) =>
    section.chapters.map((chapter) => ({ ...chapter, sectionId: section.id })),
  );

  const found: Record<string, { page: number | null; occurrences: number }> = {};
  for (const chapter of chapters) {
    const needle = chapter.title.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
    let hits: number[] = [];
    pages.forEach((page, index) => {
      const haystack = page.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ");
      if (haystack.includes(needle)) hits.push(index + 1);
    });
    const beyondToc = hits.filter((page) => page > 12);
    found[chapter.id] = {
      page: beyondToc.length ? beyondToc[0] : hits.length ? hits[0] : null,
      occurrences: hits.length,
    };
  }

  fs.writeFileSync(path.join(outDir, "chapter-map.json"), JSON.stringify(found, null, 2));

  const present = Object.values(found).filter((entry) => entry.page !== null).length;
  console.log(`\nDrafter chapters located in the real document: ${present}/${chapters.length}`);
  for (const chapter of chapters) {
    const entry = found[chapter.id];
    console.log(
      `  ${chapter.id.padEnd(7)} ${entry.page ? `p.${String(entry.page).padStart(3)}` : "  — "}  ${chapter.title}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
