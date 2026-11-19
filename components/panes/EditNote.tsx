"use client";

import { useEffect, useMemo, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app/context";
import { Dot, Icon, Select } from "@/components/ui";
import NoteEditor, { NotePicker, type EditMode, type PickNote } from "./NoteEditor";
import { KEY_STORE, MODE_STORE } from "./WriteNote";
import { editNote, type WriteResult } from "@/app/actions";
import { buildSlugMap } from "@/lib/parser";
import { singularType, typeLabel } from "@/lib/brain";

/** Edit a note that is already in the wiki, in the same editor that writes new ones. */
export default function EditNote({ i, accent, onDone }: { i: number; accent: string; onDone: () => void }) {
  const { model, repo, colorOf, openNote } = useApp();
  const router = useRouter();
  const [pending, start] = useTransition();
  const note = model.notes[i];
  const page = model.pages[i];
  const slugMap = useMemo(() => buildSlugMap(model.pages), [model]);

  const pickNotes = useMemo<PickNote[]>(
    () =>
      model.notes
        .filter((n) => !n.isIndex && n.i !== i)
        .map((n) => ({ slug: n.id, short: n.id.split("/").pop()!, title: n.title, color: colorOf(n.i), kind: singularType(n.type) })),
    [model, colorOf, i],
  );
  const types = useMemo(() => [...new Set(["concept", "person", "source-summary", "synthesis", note.type, ...model.notes.map((n) => n.type)])], [model, note.type]);

  // what the note holds now: the editor starts from exactly this
  const start0 = useMemo(() => {
    const sources: PickNote[] = page.sources.map((s) => {
      const id = slugMap.get(s);
      const j = id != null ? model.bySlug.get(id) : undefined;
      return j != null
        ? { slug: model.notes[j].id, short: s, title: model.notes[j].title, color: colorOf(j), kind: singularType(model.notes[j].type) }
        : { slug: s, short: s, title: s, color: "transparent", kind: "Not written" };
    });
    return {
      base: page.rawContent,
      title: page.title,
      type: note.type,
      domains: page.domain.filter((d) => d !== "uncategorized").join(", "),
      sources,
      body: page.bodyContent,
    };
    // the starting point is fixed when the editor opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  const [title, setTitle] = useState(start0.title);
  const [type, setType] = useState(start0.type);
  const [domains, setDomains] = useState(start0.domains);
  const [sources, setSources] = useState<PickNote[]>(start0.sources);
  const [picking, setPicking] = useState(false);
  const [body, setBody] = useState(start0.body);
  const [mode, setModeState] = useState<EditMode>("normal");
  const [key, setKey] = useState("");
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [result, setResult] = useState<WriteResult | null>(null);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(MODE_STORE) === "markdown") setModeState("markdown");
      const k = localStorage.getItem(KEY_STORE);
      if (k) {
        setKey(k);
        setHasStoredKey(true);
      }
    } catch {
      /* storage unavailable: the key is asked each time */
    }
  }, []);

  // once the brain has the saved version, close the editor on it
  useEffect(() => {
    if (!waiting) return;
    const j = model.bySlug.get(note.id);
    if (j != null && model.pages[j].rawContent !== start0.base) {
      setWaiting(false);
      onDone();
      openNote(j);
    }
  }, [model, waiting, note.id, start0.base, onDone, openNote]);

  // tables and raw HTML do not survive the Normal editor, so such notes stay in Markdown
  const rich = /^\s*\|.*\|\s*$/m.test(start0.body) || /<\/?[a-z][^>]*>/i.test(start0.body);
  useEffect(() => {
    if (rich) setModeState("markdown");
  }, [rich, mode]);

  const setMode = (m: EditMode) => {
    if (rich && m === "normal") return;
    setModeState(m);
    try {
      localStorage.setItem(MODE_STORE, m);
    } catch {
      /* per-device preference only */
    }
  };

  const domainList = domains.split(/[,/]/).map((d) => d.trim().toLowerCase()).filter(Boolean);
  const changed =
    title.trim() !== start0.title ||
    type !== start0.type ||
    domainList.join("/") !== start0.domains.split(/[,/]/).map((d) => d.trim().toLowerCase()).filter(Boolean).join("/") ||
    sources.map((s) => s.short).join("|") !== start0.sources.map((s) => s.short).join("|") ||
    body.trim() !== start0.body.trim();
  const canSave = changed && !!title.trim() && !!key && !pending && !waiting;

  const submit = () => {
    setResult(null);
    start(async () => {
      const res = await editNote({ key, id: note.id, base: start0.base, title, type, domains: domainList, sources: sources.map((s) => s.short), body });
      setResult(res);
      if (res.ok) {
        try {
          localStorage.setItem(KEY_STORE, key);
        } catch {
          /* ignore */
        }
        setWaiting(true);
        router.refresh();
      } else if (res.code === "bad-key") {
        try {
          localStorage.removeItem(KEY_STORE);
        } catch {
          /* ignore */
        }
        setHasStoredKey(false);
      }
    });
  };

  return (
    <form
      className="write edit"
      style={{ "--accent": accent } as CSSProperties}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) submit();
      }}
    >
      <label className="write-field">
        <span className="label">Title</span>
        <input className="write-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
      </label>

      <div className="write-row">
        <label className="write-field">
          <span className="label">Type</span>
          <Select label="Type" value={type} options={types.map((t) => ({ value: t, label: typeLabel(t).replace(/s$/, "") }))} onChange={setType} />
        </label>
        <label className="write-field">
          <span className="label">Domain</span>
          <input className="field-input" value={domains} onChange={(e) => setDomains(e.target.value)} placeholder={note.folder.split("/")[0]} />
        </label>
      </div>

      <div className="write-field">
        <span className="label">Sources</span>
        <div className="chips">
          {sources.map((src) => (
            <span key={src.slug} className="chip">
              <Dot c={src.color} hollow={src.color === "transparent"} />
              {src.title}
              <button type="button" aria-label={`Remove ${src.title}`} onClick={() => setSources((l) => l.filter((x) => x.slug !== src.slug))}>
                <Icon name="close" size={9} />
              </button>
            </span>
          ))}
          <button type="button" className="chip add" aria-expanded={picking} onClick={() => setPicking((p) => !p)}>
            <Icon name="plus" size={10} /> Add a source
          </button>
        </div>
        {picking && (
          <NotePicker
            notes={pickNotes.filter((n) => !sources.some((x) => x.slug === n.slug))}
            prefer={(n) => n.kind === "Source"}
            placeholder="Find the book, paper or note it draws on"
            onClose={() => setPicking(false)}
            onPick={(n) => {
              setSources((l) => [...l, n]);
              setPicking(false);
            }}
          />
        )}
      </div>

      <div className="write-field">
        <NoteEditor value={body} loadKey={i} mode={rich ? "markdown" : mode} onMode={setMode} notes={pickNotes} onChange={setBody} />
        {rich && <small className="write-warn">This note has tables or HTML, so it opens in Markdown to keep them exactly as they are.</small>}
      </div>

      {!hasStoredKey && (
        <label className="write-field">
          <span className="label">Write key</span>
          <input className="field-input" type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="current-password" placeholder="WIKI_WRITE_KEY" />
        </label>
      )}

      <div className="write-acts">
        <span className="write-dest">
          Saves {page.path} to {repo ? `${repo.owner}/${repo.repo}` : "the wiki"} in one commit
          {title.trim() !== start0.title ? ", with its new title in the folder index" : ""}.
        </span>
        <span style={{ display: "inline-flex", gap: 8 }}>
          <button type="button" className="btn" onClick={onDone} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className="btn solid" disabled={!canSave}>
            {pending ? "Saving…" : waiting ? "Saved" : "Save changes"}
          </button>
        </span>
      </div>

      {result && (
        <div className={`write-result${result.ok ? " ok" : " bad"}`} role="status">
          {result.ok ? (
            <>
              <b>Saved.</b> {result.path} is updated{result.indexed.length ? ` and so is ${result.indexed.join(", ")}` : ""}.{" "}
              <a className="link" href={result.commitUrl} target="_blank" rel="noreferrer">
                See the commit <Icon name="out" size={10} />
              </a>
              {waiting && <span className="write-wait"> Showing it once the brain has caught up…</span>}
            </>
          ) : (
            <>
              <b>Not saved.</b> {result.error}
            </>
          )}
        </div>
      )}
    </form>
  );
}
