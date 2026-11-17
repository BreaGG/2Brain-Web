"use client";

import { useState } from "react";
import { useApp, ADD_ACCENT } from "@/components/app/context";
import type { PaneProps } from "@/components/app/Panes";
import { Icon, PaneHead, Sect } from "@/components/ui";
import WriteNote from "./WriteNote";

const today = () => new Date().toISOString().slice(0, 10);

const TEMPLATES: { kind: string; title: string; sub: string; type: string; body: string }[] = [
  { kind: "concept", title: "Concept", sub: "An idea, in your own words", type: "concept", body: "## Summary\n\nWhat it is, in two or three sentences.\n\n## Notes\n\n- Where it shows up: [[another-note]]\n- What it explains, and what it does not\n" },
  { kind: "person", title: "Person", sub: "Someone whose work you follow", type: "person", body: "## Who\n\nOne line on who they are.\n\n## Ideas of theirs I use\n\n- [[a-concept]]\n" },
  { kind: "source-summary", title: "Source", sub: "A book, paper, talk or article", type: "source-summary", body: "## Summary\n\nThe argument in a paragraph.\n\n## Takeaways\n\n- \n\n## Links\n\n- [[a-concept]]\n" },
  { kind: "synthesis", title: "Synthesis", sub: "Where several notes meet", type: "synthesis", body: "## Claim\n\nWhat you now think, and why.\n\n## Built from\n\n- [[note-one]]\n- [[note-two]]\n" },
];

function template(t: (typeof TEMPLATES)[number], domain: string) {
  return `# Title of the note\n\n**Type:** ${t.type}\n**Domain:** ${domain}\n**Sources:** [[a-source]]\n**Last updated:** ${today()}\n\n${t.body}`;
}

export default function Add({ onClose }: PaneProps) {
  const { repo, model, usingSample } = useApp();
  const [copied, setCopied] = useState<string | null>(null);
  const folders = model.groups.folder.list.filter((f) => !f.unsorted);
  const domain = folders[0]?.key ?? "research";

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600);
    } catch {
      setCopied(null);
    }
  };

  const gh = repo ? `https://github.com/${repo.owner}/${repo.repo}` : null;

  return (
    <>
      <PaneHead title="Add to your record" accent={ADD_ACCENT} onClose={onClose} />
      <div className="pane-body">
        <Sect label="Write a new note" accent={ADD_ACCENT}>
          <WriteNote />
        </Sect>
        <p style={{ fontSize: 12.5, marginTop: 14, color: "var(--dim)" }}>
          {usingSample
            ? "You are looking at the sample wiki. Set GITHUB_OWNER, GITHUB_REPO and GITHUB_TOKEN to read your own."
            : "Notes written straight in the repository appear here within five minutes; notes saved from here appear at once."}
          {gh && (
            <>
              {" "}
              <a className="link" href={`${gh}/tree/HEAD/wiki`} target="_blank" rel="noreferrer">
                Open the wiki on GitHub
              </a>
            </>
          )}
        </p>

        <Sect label="How a note is read" accent={ADD_ACCENT}>
          <p>
            Each Markdown file under <code style={{ fontFamily: "var(--mono)" }}>wiki/</code> is one note. The first heading is its title, the lines below set its place in the brain, and every{" "}
            <code style={{ fontFamily: "var(--mono)" }}>[[link]]</code> draws a line.
          </p>
          <div className="code">{`# Title\n\n**Type:** concept | person | source-summary | synthesis\n**Domain:** research / reading\n**Sources:** [[a-source]], [[another]]\n**Last updated:** ${today()}`}</div>
        </Sect>

        <Sect label="Or copy a template" accent={ADD_ACCENT}>
          {TEMPLATES.map((t) => (
            <details key={t.kind} className="acc">
              <summary>
                <b>{t.title}</b>
                <span>{t.sub}</span>
                <Icon name="chev" size={12} />
              </summary>
              <div className="acc-body">
                <div className="code">{template(t, domain)}</div>
                <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => copy(t.kind, template(t, domain))}>
                  <Icon name="copy" size={12} />
                  {copied === t.kind ? "Copied" : "Copy"}
                </button>
              </div>
            </details>
          ))}
        </Sect>

        <Sect label="Where it goes" accent={ADD_ACCENT}>
          <p style={{ marginBottom: 8 }}>Save the file in the folder it belongs to. The folder is its first group in the brain.</p>
          <div className="rows">
            {folders.map((f) => (
              <div key={f.key} className="row" style={{ fontSize: 13 }}>
                <span className="grow" style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                  wiki/{f.key}/
                </span>
                <span className="count">{f.notes} notes</span>
                {gh && (
                  <a className="link" style={{ fontSize: 12 }} href={`${gh}/tree/HEAD/wiki/${f.key}`} target="_blank" rel="noreferrer">
                    Open
                  </a>
                )}
              </div>
            ))}
          </div>
        </Sect>
      </div>
    </>
  );
}
