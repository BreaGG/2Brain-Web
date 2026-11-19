import "server-only";
import type { ParsedPage } from "./types";

/* ───────────────────────────────────────────────────────────────────────────
 * Ask your brain: choose the notes a question is about, and build what Claude
 * reads to answer it from them. The catalog of every note goes in the system
 * prompt (stable, so it is cached between questions); the notes chosen for
 * this question go in the user turn with the question.
 * ─────────────────────────────────────────────────────────────────────────── */

export const ASK_MODEL = "claude-sonnet-5-5";

/** How many notes are read in full for one question, and how much of each. */
const PICK = 14;
const PER_NOTE = 9_000; // characters
const TOTAL = 80_000; // characters across all of them

const STOP = new Set(
  (
    "a an and are as at be but by do does for from had has have how i if in into is it its me my of on or our so than that the their them then there these they this to was we were what when where which who why will with you your " +
    "a al algo como con cual cuales cuando de del el ella ellas ellos en era es esa ese eso esta este esto fue hay la las le lo los mas me mi mis muy no nos o para pero por que se si sin sobre su sus te tengo tiene tu un una uno y ya yo"
  ).split(" "),
);

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// a rough stem: long words are matched by their first five letters, so "disciplina" finds
// "discipline" and "training" finds "trained", across the wiki's two languages
const terms = (s: string) => [...new Set(fold(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t)).map((t) => (t.length >= 6 ? t.slice(0, 5) : t)))];

/** The notes most about the question: words in the title count most, then the file name, then the text. */
export function pickNotes(pages: ParsedPage[], question: string): ParsedPage[] {
  const q = terms(question);
  if (!q.length) return [];
  const scored = pages.map((p) => {
    const title = fold(p.title);
    const slug = fold(p.slug);
    const body = fold(p.bodyContent);
    let s = 0;
    for (const t of q) {
      if (title.includes(t)) s += 6;
      if (slug.includes(t)) s += 3;
      let n = 0;
      let at = body.indexOf(t);
      while (at >= 0 && n < 40) {
        n++;
        at = body.indexOf(t, at + t.length);
      }
      if (n) s += 1 + Math.log2(1 + n);
    }
    // a little weight for notes that hold more of the question's words at all
    const covered = q.filter((t) => title.includes(t) || body.includes(t)).length;
    s *= 0.6 + 0.4 * (covered / q.length);
    return { p, s };
  });
  return scored
    // index pages are lists of titles, which the catalog already holds
    .filter((x) => x.s > 0 && !/(^|\/)index$/.test(x.p.slug))
    .sort((a, b) => b.s - a.s)
    .slice(0, PICK)
    .map((x) => x.p);
}

/** Every note in one line each, so the answer can point to notes it did not read in full. */
export function catalog(pages: ParsedPage[]) {
  return [...pages]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((p) => `- [[${p.slug}]] — ${p.title} (${p.type})`)
    .join("\n");
}

export function systemPrompt(pages: ParsedPage[]) {
  return `You answer questions about a personal knowledge base, a wiki of markdown notes the person wrote. You are shown the notes most related to each question, in full or nearly so, and a catalog of every note.

How to answer:
- Answer from the notes. When they do not say, say that plainly, and say which notes come closest; do not fill gaps from general knowledge without saying that is what you are doing.
- Cite as you go: put the note's link right after the claim it supports, written exactly as [[folder/note-id]] using the ids from the notes or the catalog. Cite only notes that exist.
- Reply in the language of the question.
- Be brief: a few short paragraphs or a short list, under about 250 words, unless the question asks for more. Plain markdown, no headings.
- If the catalog lists notes that look relevant and were not shown to you (the notes are chosen by matching words, so a question in another language or in other words can miss some), call read_notes with their ids before you write anything. Read at most eight, and only when what you were shown is not enough.

Catalog of every note:
${catalog(pages)}`;
}

/** The question with the chosen notes laid out above it. */
export function userTurn(question: string, notes: ParsedPage[]) {
  let budget = TOTAL;
  const blocks = notes.map((p) => {
    const room = Math.max(1_000, Math.min(PER_NOTE, budget));
    const body = p.bodyContent.length > room ? `${p.bodyContent.slice(0, room)}\n[…the rest of this note is not shown]` : p.bodyContent;
    budget -= body.length;
    return `<note id="${p.slug}" title="${p.title.replace(/"/g, "'")}" type="${p.type}" updated="${p.lastUpdated || "undated"}">\n${body}\n</note>`;
  });
  const read = blocks.length ? `The notes most related to the question:\n\n${blocks.join("\n\n")}` : "No note matched the question's words; answer from the catalog if you can, and say so.";
  return `${read}\n\nQuestion: ${question}`;
}

/** The text of notes Claude asked to read, laid out as in the question. */
export function notesBlock(notes: ParsedPage[]) {
  if (!notes.length) return "None of those ids is a note in the wiki.";
  return notes
    .map((p) => {
      const body = p.bodyContent.length > PER_NOTE ? `${p.bodyContent.slice(0, PER_NOTE)}\n[…the rest of this note is not shown]` : p.bodyContent;
      return `<note id="${p.slug}" title="${p.title.replace(/"/g, "'")}" type="${p.type}" updated="${p.lastUpdated || "undated"}">\n${body}\n</note>`;
    })
    .join("\n\n");
}
