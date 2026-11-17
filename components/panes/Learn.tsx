"use client";

import { useState, type ReactNode } from "react";
import type { PaneProps } from "@/components/app/Panes";
import { useApp } from "@/components/app/context";
import { PaneHead, Sect } from "@/components/ui";
import { SPECTRUM } from "@/lib/palettes";

const S = SPECTRUM;

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg width="30" height="26" viewBox="0 0 30 26" aria-hidden>
      {children}
    </svg>
  );
}

const ITEMS: { title: string; text: string; glyph: ReactNode }[] = [
  {
    title: "The brain holds your notes",
    text: "The brain is drawn on a real human brain. Each bright point on the cortex is one page of your wiki, and each folder takes its own patch of cortex, sized by how much it holds.",
    glyph: (
      <Glyph>
        {[[6, 10], [10, 7], [15, 6], [20, 8], [24, 11], [8, 15], [13, 13], [18, 14], [22, 16], [12, 18], [17, 19]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={1.3} fill={S[i % 8]} />
        ))}
        <path d="M10 7 13 13 18 14 20 8M8 15 13 13M18 14 22 16" stroke="#fff" strokeOpacity="0.35" strokeWidth="0.6" fill="none" />
      </Glyph>
    ),
  },
  {
    title: "The brainstem, cord and nerves hold your record",
    text: "Every passage of every note runs from the brainstem down the spinal cord and out along the nerves of a real body, in the order it was written: the oldest near the brain, the newest at the ends of the nerves.",
    glyph: (
      <Glyph>
        <path d="M15 2C14 8 16 14 15 24" stroke="#fff" strokeOpacity="0.8" strokeDasharray="1 1.6" fill="none" />
      </Glyph>
    ),
  },
  {
    title: "Clusters",
    text: "Slide Form from Anatomy to Layout and the points gather into one cluster per group. Group by folder, domain or type.",
    glyph: (
      <Glyph>
        {[[7, 9, 0], [9, 7, 0], [8, 11, 0], [19, 8, 3], [21, 10, 3], [18, 11, 3], [13, 18, 5], [15, 20, 5], [12, 21, 5], [16, 17, 5]].map(([x, y, c], i) => (
          <circle key={i} cx={x} cy={y} r={1.2} fill={S[c]} />
        ))}
      </Glyph>
    ),
  },
  {
    title: "Hubs",
    text: "A hub is a note many others link to. Its lines fan out across the brain; You lists your biggest hubs and what to work on next.",
    glyph: (
      <Glyph>
        {[[5, 5], [25, 6], [5, 21], [24, 20], [15, 3]].map(([x, y], i) => (
          <path key={i} d={`M15 13L${x} ${y}`} stroke={S[(i * 2) % 8]} strokeWidth="0.8" />
        ))}
        <circle cx="15" cy="13" r="2.2" fill="#ff5a5f" />
      </Glyph>
    ),
  },
  {
    title: "Colours and labels",
    text: "A point’s colour is its group, as the key at the bottom shows. Click a key to light that group; shift-click to add another. Labels name what is lit.",
    glyph: (
      <Glyph>
        <rect x="3" y="4" width="11" height="6" fill="none" stroke="#fff" strokeWidth="0.8" />
        <path d="M14 7 20 15" stroke="#fff" strokeOpacity="0.6" strokeWidth="0.6" />
        {[[20, 15, 0], [23, 19, 5], [17, 20, 2]].map(([x, y, c], i) => (
          <circle key={i} cx={x} cy={y} r={1.4} fill={S[c]} />
        ))}
      </Glyph>
    ),
  },
  {
    title: "Ghost links",
    text: "A link to a page that does not exist yet. Turn on Ghost links in View to see them as faint points outside the notes that name them.",
    glyph: (
      <Glyph>
        <circle cx="8" cy="13" r="1.6" fill={S[4]} />
        <path d="M9.5 13H20" stroke="#fff" strokeOpacity="0.7" strokeDasharray="1.5 1.5" />
        <circle cx="22.5" cy="13" r="2" fill="none" stroke="#fff" strokeWidth="0.8" />
      </Glyph>
    ),
  },
  {
    title: "Review",
    text: "Review gathers ghost links, notes nothing links to, missing fields and thin notes, so the brain gets tidier each time you write.",
    glyph: (
      <Glyph>
        <circle cx="7" cy="13" r="1.6" fill={S[2]} />
        <path d="M10 13h8M15 10l3 3-3 3" stroke="#fff" strokeWidth="0.8" fill="none" />
        <circle cx="23" cy="13" r="1.6" fill={S[3]} />
      </Glyph>
    ),
  },
];

const LINES: { name: string; tip: string; draw: ReactNode }[] = [
  {
    name: "Link",
    tip: "One note names another with [[double brackets]]. The line takes the colour of each end.",
    draw: <path d="M4 12C20 6 40 6 64 10" stroke="url(#lg1)" strokeWidth="1.2" fill="none" />,
  },
  {
    name: "Bridge",
    tip: "A link between notes in two different folders. Bridges are what make a group part of the whole brain.",
    draw: <path d="M4 14C22 2 44 2 64 12" stroke="url(#lg2)" strokeWidth="1.2" fill="none" />,
  },
  {
    name: "Hub link",
    tip: "One of the many lines that meet at a hub. Hubs are listed in You.",
    draw: (
      <g>
        {[4, 9, 14].map((y, i) => (
          <path key={i} d={`M8 10L60 ${y}`} stroke={S[i * 2 + 1]} strokeWidth="0.9" strokeDasharray="2 2" />
        ))}
        <circle cx="8" cy="10" r="2.4" fill={S[3]} />
      </g>
    ),
  },
  {
    name: "Ghost link",
    tip: "Names a page that has not been written yet. Shown only when Ghost links is on in View.",
    draw: (
      <g>
        <path d="M6 10H56" stroke="#fff" strokeOpacity="0.6" strokeDasharray="2 2" />
        <circle cx="60" cy="10" r="2.6" fill="none" stroke="#fff" />
      </g>
    ),
  },
];

export default function Learn({ accent, onClose }: PaneProps) {
  const [tip, setTip] = useState<number | null>(null);
  const { model } = useApp();
  return (
    <>
      <PaneHead title="How your brain works" accent={accent} onClose={onClose} />
      <div className="pane-body">
        <p className="lede">The brain draws your notes above your record, and the lines show how they connect. It is built from the {model.notes.length} pages of your wiki.</p>
        {ITEMS.map((it) => (
          <div key={it.title} className="learn-item">
            {it.glyph}
            <div>
              <b>{it.title}</b>
              <p>{it.text}</p>
            </div>
          </div>
        ))}

        <Sect label="Getting around" accent={accent}>
          <p>Drag to turn the brain and right-drag to move it. On a trackpad, slide two fingers to turn it and pinch to zoom; a mouse wheel zooms. Point at a dot to see its note; click to open it. Opening the general index lights the whole spinal column, the core of the wiki.</p>
          <p style={{ marginTop: 8 }}>Double-click anywhere on the brain to clear what is lit. Esc closes what opened last, one at a time.</p>
          <p style={{ marginTop: 8 }}>
            <b>⌘K</b> searches notes and runs commands, <b>/</b> finds in the brain, <b>V</b> opens View and <b>B</b> focuses the brain, setting the body aside.
          </p>
        </Sect>

        <Sect label="The lines" accent={accent}>
          <p style={{ marginBottom: 10 }}>Point at a line to read what it joins.</p>
          <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
            <defs>
              <linearGradient id="lg1" x1="0" x2="1">
                <stop offset="0" stopColor={S[5]} />
                <stop offset="1" stopColor={S[4]} />
              </linearGradient>
              <linearGradient id="lg2" x1="0" x2="1">
                <stop offset="0" stopColor={S[1]} />
                <stop offset="1" stopColor={S[6]} />
              </linearGradient>
            </defs>
          </svg>
          <div className="lines">
            {LINES.map((l, k) => (
              <button
                key={l.name}
                type="button"
                className="line-key"
                aria-pressed={tip === k}
                onMouseEnter={() => setTip(k)}
                onFocus={() => setTip(k)}
                onClick={() => setTip(k)}
              >
                <svg width="68" height="20" viewBox="0 0 68 20" aria-hidden>
                  {l.draw}
                </svg>
                <span>{l.name}</span>
              </button>
            ))}
          </div>
          {tip != null && <div className="line-tip">{LINES[tip].tip}</div>}
        </Sect>

        <Sect label="The anatomy" accent={accent}>
          <p>
            The brain and the nervous system are drawn on points taken from real anatomy: Z-Anatomy, the libre 3D atlas of anatomy (CC BY-SA 4.0), built on BodyParts3D © The Database Center for Life Science (CC BY-SA 2.1 Japan),
            with point layouts derived by mindcorpus (CC BY-SA 4.0).{" "}
            <a className="link" href="/anatomy/ATTRIBUTION.md" target="_blank" rel="noreferrer">
              Full credit and licence
            </a>
            .
          </p>
        </Sect>
      </div>
    </>
  );
}
