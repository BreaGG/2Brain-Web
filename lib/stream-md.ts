/* ───────────────────────────────────────────────────────────────────────────
 * Markdown that is still arriving. While an answer streams in, its tail can end
 * half way through a link or an emphasis ("[[personal/concept-", "**building"),
 * and the renderer shows those marks as plain text until they close. settled()
 * holds back the unfinished tail, so only finished markup is ever on screen.
 * ─────────────────────────────────────────────────────────────────────────── */

/** The part of a streaming markdown text that is safe to render now. */
export function settled(text: string): string {
  let t = text.replace(/[*_`]+$/, "");

  // a wiki link that has opened but not closed: [[folder/no…
  const wiki = t.lastIndexOf("[[");
  if (wiki >= 0 && t.indexOf("]]", wiki) < 0) t = t.slice(0, wiki);

  // a markdown link that has not finished: [label… or [label](http…
  const open = t.lastIndexOf("[");
  if (open >= 0) {
    const rest = t.slice(open);
    const done = /^\[[^\]]*\]\([^)]*\)/.test(rest) || /^\[\[[^\]]*\]\]/.test(rest);
    const plain = /^\[[^\]]*\](?!\()/.test(rest) && rest.length > rest.indexOf("]") + 1;
    if (!done && !plain) t = t.slice(0, open);
  }

  // inline code that has opened but not closed
  if ((t.match(/`/g) ?? []).length % 2 === 1) t = t.slice(0, t.lastIndexOf("`"));

  // bold and italic markers left open: drop the opening marker, keep the words
  for (const mark of ["**", "__"]) {
    const n = t.split(mark).length - 1;
    if (n % 2 === 1) {
      const at = t.lastIndexOf(mark);
      t = t.slice(0, at) + t.slice(at + mark.length);
    }
  }
  // a lone * or _ that opens emphasis: one that starts a word and is not closed yet
  for (const mark of ["*", "_"]) {
    const opener = new RegExp(`(^|[\\s(])\\${mark}(?=\\S)(?![^\\${mark}]*\\${mark})`);
    const m = t.match(opener);
    if (m && m.index != null && !/^\s*[*_-]\s/.test(t.slice(m.index))) {
      const at = m.index + m[1].length;
      t = t.slice(0, at) + t.slice(at + 1);
    }
  }

  // a marker hanging at the very end (the first half of ** or a list bullet's star)
  return t.replace(/[*_`[]+$/, "");
}
