"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useApp } from "@/components/app/context";
import type { PaneProps } from "@/components/app/Panes";
import { Dot, Icon, PaneHead, Sect } from "@/components/ui";
import { buildSlugMap } from "@/lib/parser";
import { singularType } from "@/lib/brain";
import { KEY_STORE } from "./WriteNote";
import { WIKI, linkify } from "./Reader";

interface Turn {
  q: string;
  read: number[];
  text: string;
  state: "reading" | "writing" | "done" | "error";
  error?: string;
}

const SUGGESTIONS = ["What do I keep coming back to?", "What have I learned about training?", "Which ideas connect my projects and my reading?"];

export default function Ask({ accent, onClose }: PaneProps) {
  const { model, askable, demo, usingSample, openNote, colorOf, lightSet, askSeed } = useApp();
  const slugMap = useMemo(() => buildSlugMap(model.pages), [model]);
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [key, setKey] = useState("");
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const busy = turns[0]?.state === "reading" || turns[0]?.state === "writing";

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
    return () => abort.current?.abort();
  }, []);

  const resolve = (target: string): number | null => {
    const t = target.split("|")[0].trim();
    const s = slugMap.get(t) ?? slugMap.get(t.split("/").pop()!);
    return s != null ? (model.bySlug.get(s) ?? null) : null;
  };
  const cited = (text: string) => [...new Set([...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => resolve(m[1])).filter((i): i is number => i != null))];

  const ask = async (question: string) => {
    const text = question.replace(/\s+/g, " ").trim();
    if (text.length < 3 || busy) return;
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setTurns((t) => [{ q: text, read: [], text: "", state: "reading" } as Turn, ...t].slice(0, 8));
    const patch = (f: (t: Turn) => Turn) => setTurns((all) => [f(all[0]), ...all.slice(1)]);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, key }), signal: ctl.signal });
      if (!res.ok || !res.body) {
        const e = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
        if (e.code === "bad-key") {
          try {
            localStorage.removeItem(KEY_STORE);
          } catch {
            /* ignore */
          }
          setHasStoredKey(false);
        }
        patch((t) => ({ ...t, state: "error", error: e.error ?? `The server said ${res.status}.` }));
        return;
      }
      try {
        localStorage.setItem(KEY_STORE, key);
      } catch {
        /* ignore */
      }
      setHasStoredKey(true);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let answer = "";
      let readIds: number[] = [];
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as { type: string; ids?: string[]; text?: string; error?: string; more?: boolean };
          if (ev.type === "read") {
            const ids = (ev.ids ?? []).map((s) => model.bySlug.get(s)).filter((i): i is number => i != null);
            readIds = ev.more ? [...new Set([...readIds, ...ids])] : ids;
            const all = readIds;
            patch((t) => ({ ...t, read: all, state: "writing" }));
            if (all.length) lightSet(all, "the notes read for your question", "ask");
          } else if (ev.type === "reset") {
            answer = "";
            patch((t) => ({ ...t, text: "" }));
          } else if (ev.type === "text") {
            answer += ev.text ?? "";
            const a = answer;
            patch((t) => ({ ...t, text: a, state: "writing" }));
          } else if (ev.type === "done") {
            const used = cited(answer);
            patch((t) => ({ ...t, state: "done" }));
            if (used.length) lightSet(used, "the notes in the answer", "ask");
          } else if (ev.type === "error") {
            patch((t) => ({ ...t, state: "error", error: ev.error }));
          }
        }
      }
      patch((t) => (t.state === "writing" || t.state === "reading" ? { ...t, state: "done" } : t));
    } catch (e) {
      if ((e as Error).name === "AbortError") patch((t) => ({ ...t, state: "error", error: "Stopped." }));
      else patch((t) => ({ ...t, state: "error", error: "The answer could not be fetched. Check your connection and try again." }));
    }
  };

  // a question handed over from the find bar or ⌘K
  const seeded = useRef<number | null>(null);
  useEffect(() => {
    if (!askSeed || seeded.current === askSeed.n) return;
    seeded.current = askSeed.n;
    setQ(askSeed.q);
    if (askSeed.q.trim().length > 2 && askable && key) void ask(askSeed.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askSeed, key]);

  const md = (text: string) => (
    <article className="prose ask-answer">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (url.startsWith(WIKI) ? url : defaultUrlTransform(url))}
        components={{
          a({ href, children }) {
            if (href?.startsWith(WIKI)) {
              const j = resolve(decodeURIComponent(href.slice(WIKI.length)));
              if (j == null) return <span className="wl ghost">{children as ReactNode}</span>;
              return (
                <a
                  className="wl"
                  href={`/wiki/${model.notes[j].id}`}
                  style={{ textDecorationColor: colorOf(j) }}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                    e.preventDefault();
                    openNote(j);
                  }}
                >
                  {children as ReactNode}
                </a>
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children as ReactNode}
              </a>
            );
          },
        }}
      >
        {linkify(text, (t) => {
          const j = resolve(t);
          return j == null ? null : model.notes[j].title;
        })}
      </ReactMarkdown>
    </article>
  );

  const List = ({ ids }: { ids: number[] }) => (
    <div className="rows">
      {ids.map((j) => (
        <button key={j} type="button" className="row" onClick={() => openNote(j)} style={{ "--c": colorOf(j) } as CSSProperties}>
          <Dot c={colorOf(j)} />
          <span className="grow">{model.notes[j].title}</span>
          <span className="count">{singularType(model.notes[j].type)}</span>
        </button>
      ))}
    </div>
  );

  if (!askable) {
    return (
      <>
        <PaneHead title="Ask your brain" accent={accent} onClose={onClose} />
        <div className="pane-body">
          <p className="lede">Ask a question in your own words; Claude reads the notes closest to it and answers with links to them, lighting them in the brain.</p>
          <div className="write-off" style={{ marginTop: 16 }}>
            <p>
              <b>Asking is off.</b>{" "}
              {demo
                ? "You are looking at the demo brain; go back to yours to ask."
                : usingSample
                  ? "This copy shows the sample wiki."
                  : "To turn it on, add an ANTHROPIC_API_KEY (from console.anthropic.com) and a WIKI_WRITE_KEY of your choosing to the site's environment variables. Each question is billed to that API key."}
            </p>
          </div>
        </div>
      </>
    );
  }

  const now = turns[0];
  return (
    <>
      <PaneHead title="Ask your brain" accent={accent} onClose={onClose} />
      <div className="pane-body">
        <form
          className="ask-form"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(q);
          }}
        >
          <textarea
            className="field-input ask-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(q);
              }
            }}
            placeholder="Ask anything about what you have written…"
            rows={2}
            maxLength={1000}
            aria-label="Your question"
          />
          {!hasStoredKey && (
            <input className="field-input" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Write key (WIKI_WRITE_KEY)" aria-label="Write key" autoComplete="current-password" />
          )}
          <div className="ask-acts">
            <span className="write-dest">Claude reads the notes closest to your question. Each question is billed to the site's API key.</span>
            {busy ? (
              <button type="button" className="btn" onClick={() => abort.current?.abort()}>
                Stop
              </button>
            ) : (
              <button type="submit" className="btn solid" disabled={q.trim().length < 3 || !key}>
                Ask
              </button>
            )}
          </div>
        </form>

        {!turns.length && (
          <div className="ask-suggest">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => setQ(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        {now && (
          <section className="ask-turn" aria-live="polite">
            <p className="ask-q">{now.q}</p>
            {now.state === "reading" && <p className="ask-status label">Choosing the notes to read…</p>}
            {now.state === "writing" && !now.text && <p className="ask-status label">Reading {now.read.length} notes…</p>}
            {now.text && md(now.text)}
            {now.state === "error" && <p className="write-result bad">{now.error}</p>}
            {now.state === "done" && cited(now.text).length > 0 && (
              <Sect label={`In the answer · ${cited(now.text).length}`} accent={accent} aside={<button type="button" className="link" onClick={() => lightSet(cited(now.text), "the notes in the answer", "ask")}>Light them</button>}>
                <List ids={cited(now.text)} />
              </Sect>
            )}
            {now.read.length > 0 && now.state !== "reading" && (
              <details className="ask-read">
                <summary>
                  Read for this question · {now.read.length} <Icon name="chev" size={11} />
                </summary>
                <List ids={now.read} />
              </details>
            )}
          </section>
        )}

        {turns.length > 1 && (
          <Sect label="Earlier" accent={accent}>
            {turns.slice(1).map((t, k) => (
              <details key={k} className="ask-earlier">
                <summary>{t.q}</summary>
                {t.text ? md(t.text) : <p className="write-dest">{t.error}</p>}
              </details>
            ))}
          </Sect>
        )}
      </div>
    </>
  );
}
