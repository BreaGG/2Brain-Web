"use client";

import type { CSSProperties } from "react";
import { useApp } from "./context";
import { Icon, Range, Select, SwitchRow } from "@/components/ui";
import { PALETTES, THEMES, paletteGradient, type ThemeId } from "@/lib/palettes";
import type { GroupBy } from "@/lib/brain";
import type { GroupLayout, LabelMode, LabelSize } from "@/lib/settings";

export default function ViewPanel({ onClose }: { onClose: () => void }) {
  const { settings: s, set, resetSettings, model } = useApp();

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
          <div className="pick">
            <span>Colour theme</span>
            <Select<ThemeId>
              label="Colour theme"
              value={s.theme}
              options={THEMES.map((t) => ({ value: t.id, label: t.label }))}
              onChange={(v) => set("theme", v)}
            />
          </div>
          <div className="ground" title="Ground glow behind the body">
            <Range className="range" label="Ground glow" min={0} max={100} value={s.ground} onChange={(v) => set("ground", v)} />
          </div>
        </section>

        <section className="viz-section">
          <div className="label">Data colours</div>
          {PALETTES.map((p) => (
            <button key={p.id} type="button" className="palette" aria-pressed={s.palette === p.id} onClick={() => set("palette", p.id)}>
              <span>{p.label}</span>
              <i style={{ background: paletteGradient(p.id) }} />
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
          <SwitchRow label="Focus brain" on={s.focusBrain} onChange={(v) => set("focusBrain", v)} />
          <SwitchRow label="Table builder" on={s.tableBuilder} onChange={(v) => set("tableBuilder", v)} />
          <SwitchRow label="Notes" on={s.notes} onChange={(v) => set("notes", v)} />
          <SwitchRow label="Record" on={s.record} onChange={(v) => set("record", v)} />
          <SwitchRow label="Ghost links" note={model.ghostSlugs.length} on={s.ghosts} onChange={(v) => set("ghosts", v)} />
        </section>

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
        </section>

        <section className="viz-section">
          <div className="label">Drawn</div>
          <SwitchRow label="Links" on={s.links} onChange={(v) => set("links", v)} />
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

        <section className="viz-section" style={{ flexDirection: "row", justifyContent: "flex-end", gap: 16, fontSize: "var(--t1)" }}>
          <button type="button" className="link" onClick={resetSettings}>
            Reset
          </button>
        </section>
      </div>
    </aside>
  );
}
