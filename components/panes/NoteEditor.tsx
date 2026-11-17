"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { htmlToMd, mdToHtml } from "@/lib/markdown-io";
import { Dot } from "@/components/ui";

export interface PickNote {
  slug: string; // full id, e.g. research/concept-x
  short: string; // file name without folder
  title: string;
  color: string;
  kind: string;
}

export type EditMode = "normal" | "markdown";

/** A [[wiki link]] shown as a chip with the note's title. */
const WikiLink = Node.create({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      slug: { default: "", parseHTML: (el) => el.getAttribute("data-wiki") ?? "" },
      label: { default: "", parseHTML: (el) => el.textContent ?? "" },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-wiki]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-wiki": node.attrs.slug, class: "wl-chip", title: node.attrs.slug }), node.attrs.label || node.attrs.slug];
  },
  renderText({ node }) {
    return node.attrs.label || node.attrs.slug;
  },
});

/* ── a small search over the notes, used for links and sources ─────────── */

export function NotePicker({
  notes,
  onPick,
  onClose,
  placeholder = "Find a note by its title",
  prefer,
}: {
  notes: PickNote[];
  onPick: (n: PickNote) => void;
  onClose?: () => void;
  placeholder?: string;
  prefer?: (n: PickNote) => boolean;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const hits = notes.filter((n) => !t || n.title.toLowerCase().includes(t) || n.short.includes(t));
    hits.sort((a, b) => Number(prefer?.(b) ?? 0) - Number(prefer?.(a) ?? 0) || a.title.localeCompare(b.title));
    return hits.slice(0, 8);
  }, [q, notes, prefer]);
  useEffect(() => setSel(0), [q]);
  return (
    <div className="pick-pop" role="dialog" aria-label="Choose a note">
      <input
        autoFocus
        value={q}
        placeholder={placeholder}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSel((s) => Math.min(list.length - 1, s + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSel((s) => Math.max(0, s - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (list[sel]) onPick(list[sel]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose?.();
          }
        }}
      />
      <div className="pick-list">
        {list.map((n, k) => (
          <button key={n.slug} type="button" aria-selected={k === sel} onMouseEnter={() => setSel(k)} onClick={() => onPick(n)}>
            <Dot c={n.color} />
            <span>{n.title}</span>
            <small>{n.kind}</small>
          </button>
        ))}
        {!list.length && <p>No note matches.</p>}
      </div>
    </div>
  );
}

/* ── toolbar ──────────────────────────────────────────────────────────── */

function Tool({ label, title, active, disabled, onClick, children }: { label: string; title?: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className="tool"
      aria-label={label}
      title={title ?? label}
      aria-pressed={active ?? undefined}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const svg = (d: ReactNode) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
    {d}
  </svg>
);
const ICONS = {
  bullets: svg(
    <>
      <circle cx="3" cy="4" r="0.9" fill="currentColor" />
      <circle cx="3" cy="8" r="0.9" fill="currentColor" />
      <circle cx="3" cy="12" r="0.9" fill="currentColor" />
      <path d="M6 4h8M6 8h8M6 12h8" />
    </>,
  ),
  numbers: svg(
    <>
      <path d="M6 4h8M6 8h8M6 12h8" />
      <text x="0.6" y="5.6" fontSize="4.6" fill="currentColor" stroke="none">1</text>
      <text x="0.6" y="9.6" fontSize="4.6" fill="currentColor" stroke="none">2</text>
      <text x="0.6" y="13.6" fontSize="4.6" fill="currentColor" stroke="none">3</text>
    </>,
  ),
  quote: svg(<path d="M3 3v10M6 5h7M6 8h7M6 11h5" />),
  code: svg(<path d="M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4" />),
  link: svg(<path d="M6.5 9.5 9.5 6.5M7 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 0 1 4.5 9l1-1" />),
  note: svg(
    <>
      <circle cx="5" cy="8" r="2" />
      <circle cx="12" cy="4" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <path d="M6.8 7.1 10.6 4.8M6.8 8.9l3.8 2.3" />
    </>,
  ),
  rule: svg(<path d="M2 8h12" />),
  undo: svg(<path d="M5 3 2 6l3 3M2 6h7a4 4 0 0 1 0 8H6" />),
  redo: svg(<path d="m11 3 3 3-3 3M14 6H7a4 4 0 0 0 0 8h3" />),
};

/* ── markdown mode: the same buttons wrap the selection in Markdown ───── */

function mdEdit(ta: HTMLTextAreaElement, kind: string, extra?: string): string {
  const v = ta.value;
  const a = ta.selectionStart;
  const b = ta.selectionEnd;
  const sel = v.slice(a, b);
  const lineStart = v.lastIndexOf("\n", a - 1) + 1;
  const wrap = (l: string, r = l, fallback = "text") => {
    const text = sel || fallback;
    const out = v.slice(0, a) + l + text + r + v.slice(b);
    requestAnimationFrame(() => ta.setSelectionRange(a + l.length, a + l.length + text.length));
    return out;
  };
  const prefix = (p: string) => {
    const end = b;
    const block = v.slice(lineStart, end);
    const lines = block.split("\n").map((l, i) => (p === "1. " ? `${i + 1}. ` : p) + l);
    const out = v.slice(0, lineStart) + lines.join("\n") + v.slice(end);
    requestAnimationFrame(() => ta.setSelectionRange(lineStart, lineStart + lines.join("\n").length));
    return out;
  };
  switch (kind) {
    case "bold":
      return wrap("**");
    case "italic":
      return wrap("*");
    case "strike":
      return wrap("~~");
    case "code":
      return wrap("`", "`", "code");
    case "h2":
      return prefix("## ");
    case "h3":
      return prefix("### ");
    case "bullets":
      return prefix("- ");
    case "numbers":
      return prefix("1. ");
    case "quote":
      return prefix("> ");
    case "rule":
      return v.slice(0, b) + "\n\n---\n\n" + v.slice(b);
    case "link":
      return wrap("[", `](${extra || "https://"})`, "link text");
    case "note":
      return v.slice(0, a) + `[[${extra}]]` + v.slice(b);
  }
  return v;
}

/** An empty paragraph after a heading with nothing under it, so there is somewhere to type. */
const withGaps = (html: string) => html.replace(/(<\/h[23]>)\s*(?=<h[23]|$)/g, "$1<p></p>");

/* ── the editor ───────────────────────────────────────────────────────── */

export default function NoteEditor({
  value,
  onChange,
  loadKey,
  mode,
  onMode,
  notes,
  label = "Note",
}: {
  label?: string;
  value: string;
  onChange: (md: string) => void;
  /** Bump to load `value` into the editor from outside (a starter, a reset). */
  loadKey: number;
  mode: EditMode;
  onMode: (m: EditMode) => void;
  notes: PickNote[];
}) {
  const titleOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of notes) {
      m.set(n.slug, n.title);
      if (!m.has(n.short)) m.set(n.short, n.title);
    }
    return (s: string) => m.get(s) ?? m.get(s.split("/").pop()!) ?? null;
  }, [notes]);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [pop, setPop] = useState<null | "link" | "note">(null);
  const [url, setUrl] = useState("");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        underline: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      Placeholder.configure({
        placeholder: ({ node }) => (node.type.name === "heading" ? "Heading" : "Write here. Select text and use the buttons above to style it."),
      }),
      WikiLink,
    ],
    content: withGaps(mdToHtml(value, titleOf)),
    editorProps: { attributes: { class: "rich", "aria-label": "Note", role: "textbox", "aria-multiline": "true" } },
    onUpdate: ({ editor: e }) => changeRef.current(htmlToMd(e.getHTML())),
  });

  // load from outside
  const loaded = useRef(loadKey);
  useEffect(() => {
    if (!editor || loaded.current === loadKey) return;
    loaded.current = loadKey;
    editor.commands.setContent(withGaps(mdToHtml(value, titleOf)), { emitUpdate: false });
  }, [loadKey, editor, value, titleOf]);

  const st = useEditorState({
    editor,
    selector: ({ editor: e }: { editor: Editor | null }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            strike: e.isActive("strike"),
            code: e.isActive("code"),
            h2: e.isActive("heading", { level: 2 }),
            h3: e.isActive("heading", { level: 3 }),
            bullets: e.isActive("bulletList"),
            numbers: e.isActive("orderedList"),
            quote: e.isActive("blockquote"),
            link: e.isActive("link"),
            undo: e.can().undo(),
            redo: e.can().redo(),
          }
        : null,
  });

  const switchTo = (m: EditMode) => {
    if (m === mode) return;
    if (m === "normal" && editor) editor.commands.setContent(withGaps(mdToHtml(value, titleOf)), { emitUpdate: false });
    setPop(null);
    onMode(m);
  };

  const md = (kind: string, extra?: string) => {
    const ta = taRef.current;
    if (!ta) return;
    onChange(mdEdit(ta, kind, extra));
    ta.focus();
  };

  const run = (kind: string) => {
    if (mode === "markdown") return md(kind);
    if (!editor) return;
    const c = editor.chain().focus();
    if (kind === "bold") c.toggleBold().run();
    else if (kind === "italic") c.toggleItalic().run();
    else if (kind === "strike") c.toggleStrike().run();
    else if (kind === "code") c.toggleCode().run();
    else if (kind === "h2") c.toggleHeading({ level: 2 }).run();
    else if (kind === "h3") c.toggleHeading({ level: 3 }).run();
    else if (kind === "bullets") c.toggleBulletList().run();
    else if (kind === "numbers") c.toggleOrderedList().run();
    else if (kind === "quote") c.toggleBlockquote().run();
    else if (kind === "rule") c.setHorizontalRule().run();
    else if (kind === "undo") c.undo().run();
    else if (kind === "redo") c.redo().run();
  };

  const openLink = () => {
    if (mode === "normal" && editor?.isActive("link")) {
      setUrl((editor.getAttributes("link").href as string) ?? "");
    } else setUrl("");
    setPop((p) => (p === "link" ? null : "link"));
  };

  const applyLink = () => {
    const href = url.trim() ? (/^[a-z]+:/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`) : "";
    setPop(null);
    if (mode === "markdown") return md("link", href || "https://");
    if (!editor) return;
    const c = editor.chain().focus().extendMarkRange("link");
    if (!href) return c.unsetLink().run();
    if (editor.state.selection.empty && !editor.isActive("link")) {
      c.insertContent({ type: "text", text: url.trim(), marks: [{ type: "link", attrs: { href } }] }).run();
    } else c.setLink({ href }).run();
  };

  const linkNote = (n: PickNote) => {
    setPop(null);
    if (mode === "markdown") return md("note", n.short);
    editor?.chain().focus().insertContent([{ type: "wikiLink", attrs: { slug: n.short, label: n.title } }, { type: "text", text: " " }]).run();
  };

  const on = (k: keyof NonNullable<typeof st>) => (mode === "normal" ? !!st?.[k] : undefined);

  return (
    <div className="editor-wrap">
      <div className="editor-head">
        <span className="label">{label}</span>
        <div className="mode" role="group" aria-label="Editing mode">
          <button type="button" aria-pressed={mode === "normal"} onClick={() => switchTo("normal")} title="Write normally, with buttons for styles">
            Normal
          </button>
          <button type="button" aria-pressed={mode === "markdown"} onClick={() => switchTo("markdown")} title="Write the Markdown yourself">
            Markdown
          </button>
        </div>
      </div>
    <div className={`editor${mode === "markdown" ? " md" : ""}`}>
      <div className="toolbar" role="toolbar" aria-label="Formatting">
        <div className="tools">
          <Tool label="Heading" title="Heading" active={on("h2")} onClick={() => run("h2")}>
            <b className="tg">H</b>
          </Tool>
          <Tool label="Subheading" title="Subheading" active={on("h3")} onClick={() => run("h3")}>
            <b className="tg small">H</b>
          </Tool>
          <i className="sep" />
          <Tool label="Bold" title="Bold (⌘B)" active={on("bold")} onClick={() => run("bold")}>
            <b className="tg">B</b>
          </Tool>
          <Tool label="Italic" title="Italic (⌘I)" active={on("italic")} onClick={() => run("italic")}>
            <i className="tg it">I</i>
          </Tool>
          <Tool label="Strikethrough" active={on("strike")} onClick={() => run("strike")}>
            <s className="tg">S</s>
          </Tool>
          <i className="sep" />
          <Tool label="Bulleted list" active={on("bullets")} onClick={() => run("bullets")}>
            {ICONS.bullets}
          </Tool>
          <Tool label="Numbered list" active={on("numbers")} onClick={() => run("numbers")}>
            {ICONS.numbers}
          </Tool>
          <Tool label="Quote" active={on("quote")} onClick={() => run("quote")}>
            {ICONS.quote}
          </Tool>
          <Tool label="Code" active={on("code")} onClick={() => run("code")}>
            {ICONS.code}
          </Tool>
          <Tool label="Divider" onClick={() => run("rule")}>
            {ICONS.rule}
          </Tool>
          <i className="sep" />
          <Tool label="Link to a web page" active={on("link") || pop === "link"} onClick={openLink}>
            {ICONS.link}
          </Tool>
          <Tool label="Link to one of your notes" title="Link to one of your notes" active={pop === "note"} onClick={() => setPop((p) => (p === "note" ? null : "note"))}>
            {ICONS.note}
            <span className="tool-word">Note</span>
          </Tool>
          {mode === "normal" && (
            <>
              <i className="sep" />
              <Tool label="Undo" title="Undo (⌘Z)" disabled={!st?.undo} onClick={() => run("undo")}>
                {ICONS.undo}
              </Tool>
              <Tool label="Redo" title="Redo (⇧⌘Z)" disabled={!st?.redo} onClick={() => run("redo")}>
                {ICONS.redo}
              </Tool>
            </>
          )}
        </div>
      </div>

      {pop === "link" && (
        <div className="pick-pop link-pop">
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a web address"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setPop(null);
              }
            }}
          />
          <div className="link-acts">
            <button type="button" className="btn solid" onClick={applyLink}>
              {url.trim() ? "Add link" : "Remove link"}
            </button>
          </div>
        </div>
      )}
      {pop === "note" && <NotePicker notes={notes} onPick={linkNote} onClose={() => setPop(null)} />}

      {mode === "normal" ? (
        <EditorContent editor={editor} className="rich-wrap" />
      ) : (
        <textarea ref={taRef} className="write-body" value={value} onChange={(e) => onChange(e.target.value)} rows={14} spellCheck aria-label="Note in Markdown" />
      )}
      <p className="editor-hint">
        {mode === "normal"
          ? "Select text and use the buttons to style it. “Note” links to another note in your brain."
          : "Markdown: **bold**, *italic*, ## heading, - list, [text](https://…), [[note-file-name]]."}
      </p>
    </div>
    </div>
  );
}
