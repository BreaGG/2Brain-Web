"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useApp } from "@/components/app/context";
import type { PaneProps } from "@/components/app/Panes";
import { Dot, Icon, PaneHead, Sect } from "@/components/ui";
import { buildSlugMap } from "@/lib/parser";
import { capital, fmtDate, fmtInt, singularType } from "@/lib/brain";
import EditNote from "./EditNote";

export const WIKI = "#wiki=";

/**
 * Turn [[folder/slug|label]] into markdown links the renderer can recognise.
 * An unlabelled link shows the note's title; "[[slug]] — Title" collapses to one link.
 */
export function linkify(md: string, titleOf: (target: string) => string | null) {
  return md.replace(/\[\[([^\]]+)\]\](?:([ \t]+[—–-][ \t]+)([^\n]*))?/g, (_, inner: string, sep?: string, rest?: string) => {
    const [target, label] = inner.split("|");
    const t = target.trim();
    const title = titleOf(t);
    const text = (label ?? title ?? t.split("/").pop() ?? t).trim().replace(/[[\]]/g, "");
    const link = `[${text}](${WIKI}${encodeURIComponent(t)})`;
    if (sep == null) return link;
    return title && rest?.trim() === title ? link : `${link}${sep}${rest}`;
  });
}

export default function Reader({ onClose }: PaneProps) {
  const { model, noteIdx, openNote, colorOf, settings, repo, writable, demo } = useApp();
  const root = useRef<HTMLDivElement>(null);
  const slugMap = useMemo(() => buildSlugMap(model.pages), [model]);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    root.current?.closest(".pane")?.scrollTo({ top: 0 });
  }, [noteIdx, editing]);

  if (noteIdx == null) return null;
  const n = model.notes[noteIdx];
  const page = model.pages[noteIdx];
  const g = model.groups[settings.groupBy];
  const color = colorOf(noteIdx);

  const resolve = (target: string): number | null => {
    const short = target.split("/").pop()!;
    const s = slugMap.get(target) ?? slugMap.get(short);
    return s != null ? (model.bySlug.get(s) ?? null) : null;
  };

  const List = ({ ids }: { ids: number[] }) => (
    <div className="rows">
      {ids.map((j) => (
        <button key={j} type="button" className="row" onClick={() => openNote(j)}>
          <Dot c={colorOf(j)} />
          <span className="grow">{model.notes[j].title}</span>
          <span className="count">{singularType(model.notes[j].type)}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div ref={root} style={{ "--accent": color } as CSSProperties}>
      <PaneHead
        title={n.title}
        accent={color}
        onClose={onClose}
        tools={
          writable && !demo && editing !== n.id ? (
            <button type="button" className="btn reader-edit" onClick={() => setEditing(n.id)} title="Edit this note and save it to GitHub">
              Edit
            </button>
          ) : undefined
        }
      />
      {editing === n.id ? (
        <div className="pane-body">
          <EditNote i={noteIdx} accent={color} onDone={() => setEditing(null)} />
        </div>
      ) : (
        <div className="pane-body">
          <div className="reader-meta label">
            <span>
              <Dot c={color} />
              {g.list[g.of[noteIdx]]?.label}
            </span>
            <span>{singularType(n.type)}</span>
            {n.domains
              .filter((d) => d !== "uncategorized" && capital(d) !== g.list[g.of[noteIdx]]?.label)
              .map((d) => (
                <span key={d}>{capital(d)}</span>
              ))}
            <span>{n.date ? `Updated ${fmtDate(n.date)}` : "Undated"}</span>
            <span>{fmtInt(n.words)} words</span>
          </div>

          {page.sources.length > 0 && (
            <div className="reader-sources">
              <span className="label">Sources · {page.sources.length}</span>
              <div className="rows">
                {page.sources.map((s) => {
                  const j = resolve(s);
                  return j != null ? (
                    <button key={s} type="button" className="row wrap" onClick={() => openNote(j)} title={model.notes[j].id}>
                      <Dot c={colorOf(j)} />
                      <span className="grow">{model.notes[j].title}</span>
                      <span className="count">{singularType(model.notes[j].type)}</span>
                    </button>
                  ) : (
                    <div key={s} className="row wrap" style={{ color: "var(--dim)" }} title="Not written yet">
                      <Dot c="transparent" hollow />
                      <span className="grow">{s}</span>
                      <span className="count">Not written</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <article className="prose">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              urlTransform={(url) => (url.startsWith(WIKI) ? url : defaultUrlTransform(url))}
              components={{
                a({ href, children }) {
                  if (href?.startsWith(WIKI)) {
                    const target = decodeURIComponent(href.slice(WIKI.length));
                    const j = resolve(target);
                    if (j == null)
                      return (
                        <span className="wl ghost" title="Not written yet">
                          {children as ReactNode}
                        </span>
                      );
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
              {linkify(page.bodyContent, (t) => {
                const j = resolve(t);
                return j == null ? null : model.notes[j].title;
              })}
            </ReactMarkdown>
          </article>

          {n.out.length > 0 && (
            <Sect label={`Links out · ${n.out.length}`} accent={color}>
              <List ids={n.out} />
            </Sect>
          )}
          {n.in.length > 0 && (
            <Sect label={`Links in · ${n.in.length}`} accent={color}>
              <List ids={n.in} />
            </Sect>
          )}
          {n.ghosts.length > 0 && (
            <Sect label={`Not written yet · ${n.ghosts.length}`} accent={color}>
              <div className="rows">
                {n.ghosts.map((s) => (
                  <div key={s} className="row" style={{ color: "var(--dim)" }}>
                    <Dot c="transparent" hollow />
                    <span className="grow">{s}</span>
                  </div>
                ))}
              </div>
            </Sect>
          )}

          <div style={{ display: "flex", gap: 18, marginTop: 28, fontSize: 12.5 }}>
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: "var(--dim)",
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {page.path}
            </span>
            {repo && (
              <a
                className="link"
                href={`https://github.com/${repo.owner}/${repo.repo}/blob/HEAD/${page.path}`}
                target="_blank"
                rel="noreferrer"
                style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
              >
                Edit on GitHub <Icon name="out" size={11} />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
