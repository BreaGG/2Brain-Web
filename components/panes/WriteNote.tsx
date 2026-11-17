"use client";

import { useEffect, useMemo, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useApp, ADD_ACCENT } from "@/components/app/context";
import { Icon, Select } from "@/components/ui";
import { writeNote, type WriteResult } from "@/app/actions";
import { typeLabel } from "@/lib/brain";

const KEY_STORE = "2brain.writeKey";

export const STARTERS: Record<string, string> = {
  concept: "## Summary\n\nWhat it is, in two or three sentences.\n\n## Notes\n\n- Where it shows up: [[another-note]]\n",
  person: "## Who\n\nOne line on who they are.\n\n## Ideas of theirs I use\n\n- [[a-concept]]\n",
  "source-summary": "## Summary\n\nThe argument in a paragraph.\n\n## Takeaways\n\n- \n",
  synthesis: "## Claim\n\nWhat you now think, and why.\n\n## Built from\n\n- [[note-one]]\n- [[note-two]]\n",
};

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
  const { model, writable, repo, usingSample, demo, openNote, setFocus } = useApp();
  const router = useRouter();
  const [pending, start] = useTransition();

  const folders = useMemo(() => model.groups.folder.list.filter((f) => f.key !== "root").map((f) => f.key), [model]);
  const types = useMemo(() => {
    const t = new Set(["concept", "person", "source-summary", "synthesis", ...model.notes.map((n) => n.type).filter((x) => x !== "meta" && x !== "page")]);
    return [...t];
  }, [model]);
  const sourceSlugs = useMemo(() => model.notes.filter((n) => n.type.startsWith("source")).map((n) => n.id.split("/").pop()!), [model]);

  const [title, setTitle] = useState("");
  const [type, setType] = useState("concept");
  const [folder, setFolder] = useState(folders[0] ?? "notes");
  const [newFolder, setNewFolder] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [domains, setDomains] = useState("");
  const [sources, setSources] = useState("");
  const [body, setBody] = useState(STARTERS.concept);
  const [bodyTouched, setBodyTouched] = useState(false);
  const [key, setKey] = useState("");
  const [remember, setRemember] = useState(true);
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [result, setResult] = useState<WriteResult | null>(null);
  const [waitFor, setWaitFor] = useState<string | null>(null);

  useEffect(() => {
    try {
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
      sources: sources.split(/[,\s]+/).map((s) => s.trim().replace(/^\[\[|\]\]$/g, "")).filter(Boolean),
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
        setSources("");
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
              if (!bodyTouched) setBody(STARTERS[t] ?? "");
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
        {taken && <small className="write-warn">A note with this file name already exists in {realFolder}.</small>}
      </label>

      <div className="write-row">
        <label className="write-field">
          <span className="label">Domain</span>
          <input className="field-input" value={domains} onChange={(e) => setDomains(e.target.value)} placeholder={realFolder.split("/")[0] || "research"} />
        </label>
        <label className="write-field">
          <span className="label">Sources</span>
          <input className="field-input" list="write-sources" value={sources} onChange={(e) => setSources(e.target.value)} placeholder="source-…, source-…" />
          <datalist id="write-sources">
            {sourceSlugs.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
      </div>

      <label className="write-field">
        <span className="label">Note · Markdown, [[links]] to other notes</span>
        <textarea
          className="write-body"
          value={body}
          onChange={(e) => {
            setBodyTouched(true);
            setBody(e.target.value);
          }}
          rows={12}
          spellCheck
        />
      </label>

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
