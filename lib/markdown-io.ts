/* Markdown ↔ HTML for the note editor. The wiki stores Markdown; the editor
 * shows HTML. [[wiki links]] travel as <span data-wiki="slug">Title</span>. */

import { marked } from "marked";
import TurndownService from "turndown";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Replace [[links]] outside code with editor chips. */
function chips(md: string, titleOf: (slug: string) => string | null) {
  const swap = (text: string) =>
    text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target: string, label?: string) => {
      const slug = target.trim();
      const title = (label ?? titleOf(slug) ?? slug.split("/").pop() ?? slug).trim();
      return `<span data-wiki="${esc(slug)}">${esc(title)}</span>`;
    });
  // leave fenced and inline code alone
  return md
    .split(/(```[\s\S]*?```)/g)
    .map((part) => (part.startsWith("```") ? part : part.split(/(`[^`\n]*`)/g).map((p) => (p.startsWith("`") ? p : swap(p))).join("")))
    .join("");
}

export function mdToHtml(md: string, titleOf: (slug: string) => string | null = () => null): string {
  const html = marked.parse(chips(md, titleOf), { async: false, gfm: true, breaks: false }) as string;
  return html.trim() || "<p></p>";
}

let td: TurndownService | null = null;

function turndown() {
  if (td) return td;
  td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced", emDelimiter: "*", strongDelimiter: "**", hr: "---" });
  td.addRule("wiki", {
    filter: (node) => node.nodeName === "SPAN" && (node as HTMLElement).hasAttribute("data-wiki"),
    replacement: (_c, node) => `[[${(node as HTMLElement).getAttribute("data-wiki")}]]`,
  });
  td.addRule("strike", {
    filter: ["s", "del"],
    replacement: (c) => `~~${c}~~`,
  });
  // "- item" rather than turndown's "-   item"
  td.addRule("listItem", {
    filter: "li",
    replacement: (content, node) => {
      const parent = node.parentNode as HTMLElement;
      let prefix = "- ";
      if (parent.nodeName === "OL") {
        const start = Number(parent.getAttribute("start") || 1);
        prefix = `${start + Array.prototype.indexOf.call(parent.children, node)}. `;
      }
      const body = content.replace(/^\n+/, "").replace(/\n+$/, "\n").replace(/\n(?=.)/g, `\n${" ".repeat(prefix.length)}`);
      return prefix + body + (node.nextSibling && !/\n$/.test(body) ? "\n" : "");
    },
  });
  return td;
}

export function htmlToMd(html: string): string {
  return turndown()
    .turndown(html)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
