"use client";

import { useState, type CSSProperties } from "react";
import { useApp } from "./context";
import { Icon, Range, Select, SwitchRow } from "@/components/ui";
import { PALETTES, THEMES, groupCss, paletteGradient, type PaletteId, type ThemeId } from "@/lib/palettes";
import type { GroupBy } from "@/lib/brain";
import type { GroupLayout, LabelMode, LabelSize, RecordOrder } from "@/lib/settings";

/* a small brain over a spine, in the theme's ground and the data colours */
const MINI_BRAIN = [
  [20, 9], [26, 7], [32, 8], [38, 10], [16, 14], [22, 13], [28, 12], [34, 13], [40, 15], [18, 19], [24, 18], [30, 17], [36, 19], [22, 23], [28, 22], [34, 23],
];
const MINI_SPINE = [[28, 27], [28, 31], [28, 35], [27, 39], [28, 43]];

function ThemeTile({ id, label, bg, palette, on, onPick }: { id: ThemeId; label: string; bg: string; palette: PaletteId; on: boolean; onPick: (id: ThemeId) => void }) {
  return (
    <button type="button" className="theme-tile" aria-pressed={on} onClick={() => onPick(id)} title={`${label} theme`}>
      <svg viewBox="0 0 56 46" aria-hidden style={{ background: bg }}>
        <defs>
          <radialGradient id={`ground-${id}`} cx="50%" cy="100%" r="70%">
            <stop offset="0" stopColor="#fff" stopOpacity="0.12" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="56" height="46" fill={`url(#ground-${id})`} />
        {MINI_SPINE.map(([x, y], k) => (
          <circle key={`s${k}`} cx={x} cy={y} r={0.9} fill="#fff" opacity={0.75 - k * 0.1} />
        ))}
        {MINI_BRAIN.map(([x, y], k) => (
          <circle key={k} cx={x} cy={y} r={1.5} fill={groupCss(palette, k % 8, 8)} />
        ))}
      </svg>
      <span>{label}</span>
    </button>
  );
}

export default function ViewPanel({ onClose }: { onClose: () => void }) {
  const { settings: s, set, resetSettings, model, startTour, demo, setDemo, usingSample } = useApp();
  const [more, setMore] = useState(() => {
    try {
      return localStorage.getItem("2brain.view.more") === "1";
    } catch {
      return false;
    }
  });
  const toggleMore = () =>
    setMore((m) => {
      try {
        localStorage.setItem("2brain.view.more", m ? "0" : "1");
      } catch {
        /* per-browser convenience only */
      }
      return !m;
    });

  return (
    <aside className="viz-menu" aria-label="View">
      <div className="viz-top">
        <div>
          <div className="label">View</div>
          <i className="dash" style={{ "--accent": "var(--l0)" } as CSSProperties} />
        </div>
        <button type="button" className="icon-button" aria-label="Close view" onClick={onClose}>
          <Icon name="close" size={12} />
        </button>
      </div>

      <div className="viz-scroll">
        <section className="viz-section">
          <div className="label">Appearance</div>
          <div className="theme-tiles" role="group" aria-label="Colour theme">
            {THEMES.map((t) => (
              <ThemeTile key={t.id} id={t.id} label={t.label} bg={t.bg} palette={s.palette} on={s.theme === t.id} onPick={(v) => set("theme", v)} />
            ))}
          </div>
          {more && (
            <div className="ground" title="Ground glow behind the body">
              <Range className="range" label="Ground glow" min={0} max={100} value={s.ground} onChange={(v) => set("ground", v)} />
            </div>
          )}
        </section>

        <section className="viz-section">
          <div className="label">Data colours</div>
          {PALETTES.map((p) => (
            <button key={p.id} type="button" className="palette" aria-pressed={s.palette === p.id} onClick={() => set("palette", p.id)}>
              <span>{p.label}</span>
              <span className="swatches">
                <i className="bar" style={{ background: paletteGradient(p.id) }} />
                {Array.from({ length: 8 }, (_, k) => (
                  <i key={k} className="sw" style={{ background: groupCss(p.id, k, 8) }} />
                ))}
              </span>
            </button>
          ))}
        </section>

        <section className="viz-section">
          <div className="label">Form</div>
          <div className="range-ends">
            <span>Anatomy</span>
            <Range label="Form, from anatomy to layout" min={0} max={100} value={Math.round(s.form * 100)} onChange={(v) => set("form", v / 100)} />
            <span>Layout</span>
          </div>
          <div className="pick">
            <span>Order</span>
            <Select<RecordOrder>
              label="Order of the record"
              value={s.order}
              options={[
                { value: "oldest", label: "Oldest first" },
                { value: "newest", label: "Newest first" },
              ]}
              onChange={(v) => set("order", v)}
            />
          </div>
          <SwitchRow label="Focus brain" on={s.focusBrain} onChange={(v) => set("focusBrain", v)} />
          <SwitchRow label="Cosmos" on={s.cosmos} onChange={(v) => set("cosmos", v)} />
          <SwitchRow label="Table builder" on={s.tableBuilder} onChange={(v) => set("tableBuilder", v)} />
        </section>

        {more && (
          <section className="viz-section">
            <div className="label">Show</div>
            <SwitchRow label="Notes" on={s.notes} onChange={(v) => set("notes", v)} />
            <SwitchRow label="Record" on={s.record} onChange={(v) => set("record", v)} />
            <SwitchRow label="Ghost links" note={model.ghostSlugs.length} on={s.ghosts} onChange={(v) => set("ghosts", v)} />
          </section>
        )}

        <section className="viz-section">
          <div className="label">Groups</div>
          <div className="pick">
            <span>Group by</span>
            <Select<GroupBy>
              label="Group by"
              value={s.groupBy}
              options={[
                { value: "folder", label: "Folder" },
                { value: "domain", label: "Domain" },
                { value: "type", label: "Type" },
              ]}
              onChange={(v) => set("groupBy", v)}
            />
          </div>
          <div className="pick">
            <span>↳ Layout</span>
            <Select<GroupLayout>
              label="Layout"
              value={s.groupLayout}
              options={[
                { value: "spheres", label: "Spheres" },
                { value: "tree", label: "Folder tree" },
              ]}
              onChange={(v) => {
                set("groupLayout", v);
                if (s.form < 0.5 && !s.tableBuilder) set("form", 1);
              }}
            />
          </div>
          <SwitchRow label="Split" on={s.split} onChange={(v) => set("split", v)} />
          {more && (
          <div className="pick">
            <span>Labels</span>
            <span className="pick-pair">
              <Select<LabelMode>
                label="Labels"
                value={s.labels}
                options={[
                  { value: "lit", label: "What is lit" },
                  { value: "all", label: "All groups" },
                  { value: "none", label: "None" },
                ]}
                onChange={(v) => set("labels", v)}
              />
              <Select<LabelSize>
                label="Label size"
                value={s.labelSize}
                options={[
                  { value: "auto", label: "Auto" },
                  { value: "small", label: "Small" },
                  { value: "large", label: "Large" },
                ]}
                onChange={(v) => set("labelSize", v)}
              />
            </span>
          </div>
          )}
          <SwitchRow label="Hide unsorted" on={s.hideUnsorted} onChange={(v) => set("hideUnsorted", v)} />
        </section>

        <section className="viz-section">
          <div className="label">Motion</div>
          <SwitchRow label="Turning" on={s.turning} onChange={(v) => set("turning", v)} />
          <div className="range-row">
            <span>Speed</span>
            <span className="num">{s.speed}%</span>
            <Range label="Turning speed" min={10} max={300} step={10} value={s.speed} onChange={(v) => set("speed", v)} />
          </div>
          {more && <SwitchRow label="Limit rotation" on={s.limitRotation} onChange={(v) => set("limitRotation", v)} />}
        </section>

        {more && (
        <section className="viz-section">
          <div className="label">Drawn</div>
          <SwitchRow label="Links" on={s.links} onChange={(v) => set("links", v)} />
          <SwitchRow label="Tracts" on={s.tracts} onChange={(v) => set("tracts", v)} />
          <SwitchRow label="Scaffold" note="threads through each note’s passages" on={s.scaffold} onChange={(v) => set("scaffold", v)} />
          <div className="switch-row">
            <span>Brain outline</span>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="num">{s.outlineOpacity}%</span>
              <button
                type="button"
                role="switch"
                aria-checked={s.outline}
                aria-label="Brain outline"
                className="switch"
                onClick={() => set("outline", !s.outline)}
              >
                <span className="knob" />
              </button>
            </span>
          </div>
          <Range label="Brain outline strength" min={0} max={200} step={5} value={s.outlineOpacity} onChange={(v) => set("outlineOpacity", v)} />
          <div className="range-row">
            <span>Point size</span>
            <span className="num">{s.pointSize}%</span>
            <Range label="Point size" min={30} max={300} step={5} value={s.pointSize} onChange={(v) => set("pointSize", v)} />
          </div>
        </section>
        )}

        <div className="viz-more">
          <button type="button" className="link" onClick={toggleMore}>
            {more ? "Fewer options" : "More options"}
          </button>
        </div>
      </div>

      <div className="viz-foot">
        <button
          type="button"
          className="link"
          onClick={() => {
            onClose();
            startTour();
          }}
        >
          Walkthrough
        </button>
        {(!usingSample || demo) && (
          <button type="button" className="link" onClick={() => setDemo(!demo)}>
            {demo ? "Show your brain" : "Show a demo brain"}
          </button>
        )}
        <button type="button" className="link" onClick={resetSettings}>
          Reset
        </button>
      </div>
    </aside>
  );
}
