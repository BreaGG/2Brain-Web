"use client";

import { useEffect, useMemo, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useApp, ADD_ACCENT } from "@/components/app/context";
import { Dot, Icon, Select } from "@/components/ui";
import NoteEditor, { NotePicker, type EditMode, type PickNote } from "./NoteEditor";
import { writeNote, type WriteResult } from "@/app/actions";
import { singularType, typeLabel } from "@/lib/brain";

export const KEY_STORE = "2brain.writeKey";

/** Each kind of note starts with its section headings and room to write under each. */
export const STARTERS: Record<string, string> = {
  concept: "## Summary\n\n## Notes",
  person: "## Who\n\n## Ideas of theirs I use",
  "source-summary": "## Summary\n\n## Takeaways",
  synthesis: "## Claim\n\n## Built from",
};

export const MODE_STORE = "2brain.editMode";

const PREFIX: Record<string, string> = { concept: "concept", person: "person", "source-summary": "source", synthesis: "synthesis" };

export function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export default function WriteNote() {
  const { model, writable, repo, usingSample, demo, openNote, setFocus, colorOf } = useApp();
  const router = useRouter();
  const [pending, start] = useTransition();

  const folders = useMemo(() => model.groups.folder.list.filter((f) => f.key !== "root").map((f) => f.key), [model]);
  const types = useMemo(() => {
    const t = new Set(["concept", "person", "source-summary", "synthesis", ...model.notes.map((n) => n.type).filter((x) => x !== "meta" && x !== "page")]);
    return [...t];
  }, [model]);
  const pickNotes = useMemo<PickNote[]>(
    () =>
      model.notes
        .filter((n) => !n.isIndex)
        .map((n) => ({ slug: n.id, short: n.id.split("/").pop()!, title: n.title, color: colorOf(n.i), kind: singularType(n.type) })),
    [model, colorOf],
  );

  const [title, setTitle] = useState("");
  const [type, setType] = useState("concept");
  const [folder, setFolder] = useState(folders[0] ?? "notes");
  const [newFolder, setNewFolder] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [domains, setDomains] = useState("");
  const [sources, setSources] = useState<PickNote[]>([]);
  const [picking, setPicking] = useState(false);
  const [body, setBody] = useState(STARTERS.concept);
  const [bodyTouched, setBodyTouched] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  const [mode, setModeState] = useState<EditMode>("normal");
  const setMode = (m: EditMode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_STORE, m);
    } catch {
      /* per-device preference only */
    }
  };
  const [key, setKey] = useState("");
  const [remember, setRemember] = useState(true);
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [result, setResult] = useState<WriteResult | null>(null);
  const [waitFor, setWaitFor] = useState<string | null>(null);

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

  const realFolder = folder === "__new" ? slugify(newFolder).replace(/-+/g, "-") : folder;
  const autoSlug = `${PREFIX[type] ? `${PREFIX[type]}-` : ""}${slugify(title)}`.replace(/-$/, "");
  const fileSlug = slugTouched ? slug : autoSlug;
  const taken = !!fileSlug && model.bySlug.has(`${realFolder}/${fileSlug}`);
  const path = `wiki/${realFolder || "…"}/${fileSlug || "…"}.md`;

  // once the new note is in the record, open it
  useEffect(() => {
    if (!waitFor) return;
    const i = model.bySlug.get(waitFor);
    if (i != null) {
      setWaitFor(null);
      openNote(i);
    }
  }, [model, waitFor, openNote]);

  if (!writable) {
    return (
      <div className="write-off">
        <p>
          <b>Writing to your wiki is off.</b>{" "}
          {demo
            ? "You are looking at the demo brain; go back to yours to write."
            : usingSample
              ? "This copy shows the sample wiki. Set GITHUB_OWNER, GITHUB_REPO and GITHUB_TOKEN to connect yours."
              : "To write new notes from here, add a WIKI_WRITE_KEY of your choosing to the site's environment variables and make sure GITHUB_TOKEN can write to the repository's contents."}
        </p>
      </div>
    );
  }

  const submit = () => {
    setResult(null);
    const input = {
      key,
      title,
      type,
      folder: realFolder,
      slug: fileSlug,
      domains: (domains || realFolder.split("/")[0]).split(/[,/]/).map((d) => d.trim()).filter(Boolean),
      sources: sources.map((s) => s.short),
      body,
    };
    start(async () => {
      const res = await writeNote(input);
      setResult(res);
      if (res.ok) {
        try {
          if (remember) localStorage.setItem(KEY_STORE, key);
          else localStorage.removeItem(KEY_STORE);
        } catch {
          /* ignore */
        }
        setFocus({ kind: "none" });
        setWaitFor(res.slug);
        setTitle("");
        setSlugTouched(false);
        setBodyTouched(false);
        setBody(STARTERS[type] ?? "");
        setLoadKey((k) => k + 1);
        setSources([]);
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

  const canSave = !!title.trim() && !!realFolder && !!fileSlug && !taken && !!key && !pending;

  return (
    <form
      className="write"
      style={{ "--accent": ADD_ACCENT } as CSSProperties}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) submit();
      }}
    >
      <label className="write-field">
        <span className="label">Title</span>
        <input className="write-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What the note is about" maxLength={200} required />
      </label>

      <div className="write-row">
        <label className="write-field">
          <span className="label">Type</span>
          <Select
            label="Type"
            value={type}
            options={types.map((t) => ({ value: t, label: typeLabel(t).replace(/s$/, "") }))}
            onChange={(t) => {
              setType(t);
              if (!bodyTouched) {
                setBody(STARTERS[t] ?? "");
                setLoadKey((k) => k + 1);
              }
            }}
          />
        </label>
        <label className="write-field">
          <span className="label">Folder</span>
          <Select label="Folder" value={folder} options={[...folders.map((f) => ({ value: f, label: f })), { value: "__new", label: "New folder…" }]} onChange={setFolder} />
        </label>
      </div>
      {folder === "__new" && (
        <label className="write-field">
          <span className="label">New folder</span>
          <input className="field-input" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="e.g. projects" />
        </label>
      )}

      <div className="write-field">
        <span className="label">Sources · the notes this one draws on</span>
        <div className="chips">
          {sources.map((src) => (
            <span key={src.slug} className="chip">
              <Dot c={src.color} />
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
        <NoteEditor
          value={body}
          loadKey={loadKey}
          mode={mode}
          onMode={setMode}
          notes={pickNotes}
          onChange={(md) => {
            setBodyTouched(true);
            setBody(md);
          }}
        />
      </div>

      <details className="write-more" open={taken || undefined}>
        <summary>
          More details <span>file name and domain</span>
          <Icon name="chev" size={11} />
        </summary>
        <label className="write-field">
          <span className="label">File</span>
          <span className="write-path">
            <span>wiki/{realFolder || "…"}/</span>
            <input
              value={fileSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
              }}
              aria-label="File name"
              placeholder="file-name"
            />
            <span>.md</span>
          </span>
        </label>
        <label className="write-field">
          <span className="label">Domain</span>
          <input className="field-input" value={domains} onChange={(e) => setDomains(e.target.value)} placeholder={realFolder.split("/")[0] || "research"} />
        </label>
      </details>
      {taken && <small className="write-warn">A note called “{fileSlug}” already exists in {realFolder}. Change the title or the file name.</small>}

      {!hasStoredKey && (
        <div className="write-row">
          <label className="write-field">
            <span className="label">Write key</span>
            <input className="field-input" type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="current-password" placeholder="WIKI_WRITE_KEY" />
          </label>
          <label className="write-remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember on this device
          </label>
        </div>
      )}

      <div className="write-acts">
        <span className="write-dest">
          Saves {path} to {repo ? `${repo.owner}/${repo.repo}` : "the wiki"} and adds it to wiki/{realFolder || "…"}/index.md, in one commit.
        </span>
        <button type="submit" className="btn solid" disabled={!canSave}>
          {pending ? "Saving…" : "Save to GitHub"}
        </button>
      </div>
      {hasStoredKey && (
        <button
          type="button"
          className="link write-forget"
          onClick={() => {
            try {
              localStorage.removeItem(KEY_STORE);
            } catch {
              /* ignore */
            }
            setKey("");
            setHasStoredKey(false);
          }}
        >
          Forget the write key on this device
        </button>
      )}

      {result && (
        <div className={`write-result${result.ok ? " ok" : " bad"}`} role="status">
          {result.ok ? (
            <>
              <b>Saved.</b> {result.path} is in your wiki and indexed in {result.indexed.join(" and ")}.{" "}
              <a className="link" href={result.commitUrl} target="_blank" rel="noreferrer">
                See the commit <Icon name="out" size={10} />
              </a>
              {waitFor && <span className="write-wait"> Opening it once the brain has caught up…</span>}
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
