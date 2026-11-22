"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useApp, ADD_ACCENT } from "@/components/app/context";
import { Icon, Select } from "@/components/ui";
import SignIn from "@/components/app/SignIn";

interface Draft {
  path: string;
  content: string;
  before: string | null;
}

type Step = { kind: "read" | "write" | "note"; text: string; isNew?: boolean };

const ACCEPT = ".pdf,.html,.htm,.md,.markdown,.txt,application/pdf,text/html,text/markdown,text/plain";
const MAX = 4 * 1024 * 1024;

/** Turn a PDF or a saved web page into wiki pages, following the wiki's own ingest guide. */
export default function ImportSource({ hideSignIn = false }: { hideSignIn?: boolean }) {
  const { model, repo, askable, openNote, setFocus, auth, refreshAuth } = useApp();
  const owner = !!auth?.owner;
  const router = useRouter();
  const domains = useMemo(() => model.groups.folder.list.filter((f) => f.key !== "root" && !f.unsorted).map((f) => f.key), [model]);
  const [file, setFile] = useState<File | null>(null);
  const [domain, setDomain] = useState(domains[0] ?? "research");
  const [phase, setPhase] = useState<"idle" | "working" | "review" | "saving" | "saved">("idle");
  const [steps, setSteps] = useState<Step[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [summary, setSummary] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sourcePath, setSourcePath] = useState("");
  const [commitUrl, setCommitUrl] = useState<string | null>(null);
  const [waitFor, setWaitFor] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  // once the saved pages are in the brain, open the source summary
  useEffect(() => {
    if (!waitFor) return;
    const i = model.bySlug.get(waitFor);
    if (i != null) {
      setWaitFor(null);
      openNote(i);
    }
  }, [model, waitFor, openNote]);

  if (!askable) {
    return (
      <div className="write-off">
        <p>
          <b>Importing is off.</b> It needs the wiki on GitHub and an ANTHROPIC_API_KEY in the site&rsquo;s environment variables. Claude reads the file and drafts the pages; each import is billed to that API key.
        </p>
      </div>
    );
  }

  const badKey = () => void refreshAuth();

  const start = async () => {
    if (!file) return;
    if (file.size > MAX) return setError("The file is over 4 MB. Try a smaller one.");
    setError(null);
    setSteps([]);
    setDrafts([]);
    setWarnings([]);
    setSummary("");
    setCommitUrl(null);
    setPhase("working");
    const ctl = new AbortController();
    abort.current = ctl;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("domain", domain);
    try {
      const res = await fetch("/api/ingest", { method: "POST", body: fd, signal: ctl.signal });
      if (!res.ok || !res.body) {
        const e = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
        if (e.code === "signed-out") badKey();
        setError(e.error ?? `The server said ${res.status}.`);
        setPhase("idle");
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let staged = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "start") setSourcePath(ev.sourcePath);
          else if (ev.type === "read") setSteps((s) => [...s, { kind: "read", text: ev.path }]);
          else if (ev.type === "write") setSteps((s) => [...s, { kind: "write", text: ev.path, isNew: ev.isNew }]);
          else if (ev.type === "note") setSteps((s) => [...s, { kind: "note", text: ev.text }]);
          else if (ev.type === "staged") {
            staged = true;
            setDrafts(ev.files);
            setSummary(ev.summary ?? "");
            setWarnings(ev.warnings ?? []);
            setPhase("review");
          } else if (ev.type === "error") {
            setError(ev.error);
          }
        }
      }
      if (!staged) setPhase("idle");
    } catch (e) {
      setError((e as Error).name === "AbortError" ? "Stopped." : "The import could not be finished. Check your connection and try again.");
      setPhase("idle");
    }
  };

  const save = async () => {
    if (!file || !drafts.length) return;
    setPhase("saving");
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("domain", domain);
    fd.set("files", JSON.stringify(drafts));
    fd.set("title", file.name.replace(/\.[a-z]+$/i, ""));
    const res = await fetch("/api/ingest/commit", { method: "POST", body: fd }).catch(() => null);
    const out = res ? ((await res.json().catch(() => ({}))) as { ok?: boolean; commitUrl?: string; code?: string; error?: string }) : { error: "No connection." };
    if (!out.ok) {
      if (out.code === "signed-out") badKey();
      setError(out.error ?? "The import could not be saved.");
      setPhase("review");
      return;
    }
    setCommitUrl(out.commitUrl ?? null);
    setPhase("saved");
    setFocus({ kind: "none" });
    const summaryPage = drafts.find((d) => /-summary\.md$/.test(d.path)) ?? drafts.find((d) => d.before == null) ?? drafts[0];
    setWaitFor(summaryPage.path.replace(/^wiki\//, "").replace(/\.md$/, ""));
    router.refresh();
  };

  const reset = () => {
    setPhase("idle");
    setFile(null);
    setDrafts([]);
    setSteps([]);
    setError(null);
  };

  const working = phase === "working";
  return (
    <div className="write import">
      {(phase === "idle" || working) && (
        <>
          <label className={`drop${file ? " has" : ""}`}>
            <input
              type="file"
              accept={ACCEPT}
              disabled={working}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError(null);
              }}
            />
            <Icon name="doc" size={16} />
            <span>{file ? <b>{file.name}</b> : "Choose a PDF, a web page saved as HTML, or a Markdown or text file"}</span>
            {file && <span className="label">{(file.size / 1024).toFixed(0)} KB</span>}
          </label>
          <div className="write-row">
            <label className="write-field">
              <span className="label">Section</span>
              <Select label="Section" value={domain} options={domains.map((d) => ({ value: d, label: d }))} onChange={setDomain} />
            </label>
          </div>
          {!hideSignIn && <SignIn why="import sources into your wiki" />}
          <div className="write-acts">
            <span className="write-dest">
              Claude reads it and drafts the pages your wiki&rsquo;s guide asks for: a source summary, the people and ideas it touches, the section index and the log. You review them before anything is saved.
            </span>
            {working ? (
              <button type="button" className="btn" onClick={() => abort.current?.abort()}>
                Stop
              </button>
            ) : (
              <button type="button" className="btn solid" disabled={!file || !owner} onClick={start}>
                Make notes
              </button>
            )}
          </div>
        </>
      )}

      {(working || steps.length > 0) && phase !== "saved" && (
        <ol className="import-steps" aria-live="polite">
          {steps.map((s, k) => (
            <li key={k} className={s.kind}>
              {s.kind === "read" ? (
                <>
                  <span className="label">Read</span> {s.text}
                </>
              ) : s.kind === "write" ? (
                <>
                  <span className="label">{s.isNew ? "New" : "Updated"}</span> {s.text}
                </>
              ) : (
                <span className="note">
                  <ReactMarkdown skipHtml allowedElements={["strong", "em", "code", "p"]} unwrapDisallowed components={{ p: ({ children }) => <>{children}</> }}>
                    {s.text}
                  </ReactMarkdown>
                </span>
              )}
            </li>
          ))}
          {working && <li className="ask-status label">{steps.length ? "Working…" : "Reading the file…"}</li>}
        </ol>
      )}

      {(phase === "review" || phase === "saving") && (
        <div className="import-review">
          {summary && (
            <div className="prose import-summary">
              <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                {summary}
              </ReactMarkdown>
            </div>
          )}
          {warnings.map((w) => (
            <small key={w} className="write-warn">
              {w}
            </small>
          ))}
          <div className="label" style={{ marginTop: 6 }}>
            {drafts.length} page{drafts.length === 1 ? "" : "s"} to save, with the file at {sourcePath}
          </div>
          {drafts.map((d) => (
            <details key={d.path} className="import-file">
              <summary>
                <span className={`tag ${d.before == null ? "new" : "upd"}`}>{d.before == null ? "New" : "Updated"}</span>
                <span className="grow">{d.path}</span>
                <Icon name="chev" size={11} />
              </summary>
              <pre>{d.content}</pre>
            </details>
          ))}
          <div className="write-acts">
            <span className="write-dest">Saves everything to {repo ? `${repo.owner}/${repo.repo}` : "the wiki"} in one commit.</span>
            <span style={{ display: "inline-flex", gap: 8 }}>
              <button type="button" className="btn" onClick={reset} disabled={phase === "saving"}>
                Discard
              </button>
              <button type="button" className="btn solid" onClick={save} disabled={phase === "saving"}>
                {phase === "saving" ? "Saving…" : "Save to GitHub"}
              </button>
            </span>
          </div>
        </div>
      )}

      {phase === "saved" && (
        <div className="write-result ok" role="status">
          <b>Saved.</b> {drafts.length} pages and the source are in your wiki.{" "}
          {commitUrl && (
            <a className="link" href={commitUrl} target="_blank" rel="noreferrer">
              See the commit <Icon name="out" size={10} />
            </a>
          )}
          {waitFor && <span className="write-wait"> Opening the summary once the brain has caught up…</span>}{" "}
          <button type="button" className="link" onClick={reset}>
            Import another
          </button>
        </div>
      )}

      {error && (
        <div className="write-result bad" role="status">
          <b>Not done.</b> {error}
        </div>
      )}
    </div>
  );
}
