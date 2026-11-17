"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useApp } from "./context";
import { Icon, Select, SwitchRow } from "@/components/ui";
import { fmtDate, typeLabel, type GroupBy } from "@/lib/brain";
import { ANSWERS, AXES, FORMS, insight, type AnswerKey, type AxisKey, type FormKey, type SizeKey } from "@/lib/table";

type Colour = GroupBy | "none";

export default function TableBuilder() {
  const { model, settings: s, set } = useApp();
  const [folded, setFolded] = useState(false);
  const grouping = model.groups[s.groupBy];

  const filters = useMemo(() => {
    const types = [...new Set(model.notes.map((n) => n.type))].sort();
    return [
      { value: "all", label: "All notes" },
      ...types.map((t) => ({ value: `type:${t}`, label: `Only ${typeLabel(t).toLowerCase()}` })),
      ...model.groups.folder.list.map((f) => ({ value: `folder:${f.key}`, label: `Only ${f.label}` })),
    ];
  }, [model]);

  const answer = ANSWERS.find((a) => a.value === s.tbAnswer);
  const said = useMemo(
    () => (s.tbAnswer ? insight(model, s.tbAnswer, grouping, { across: s.tbAcross, down: s.tbDown }) : ""),
    [model, s.tbAnswer, grouping, s.tbAcross, s.tbDown],
  );
  const timeAxis = (!!s.tbAnswer && s.tbAnswer !== "flow") || s.tbAcross === "month" || s.tbDown === "month" || s.tbAcross === "year" || s.tbDown === "year";
  const colour: Colour = s.tbMono ? "none" : s.groupBy;

  const pickForm = (f: FormKey) => {
    set("tbForm", f);
    set("tbAnswer", "");
  };
  const pickAnswer = (a: AnswerKey) => {
    // flow reads best between two kinds of thing; start it on folder → type
    if (a === "flow" && s.tbAnswer !== "flow" && (s.tbAcross === "month" || s.tbAcross === "year" || s.tbAcross === s.tbDown)) {
      set("tbAcross", "folder");
      set("tbDown", s.tbDown === "folder" || s.tbDown === "month" || s.tbDown === "year" ? "type" : s.tbDown);
    }
    set("tbAnswer", s.tbAnswer === a ? "" : a);
  };

  return (
    <aside className="tb" aria-label="Table builder">
      <div className="tb-top">
        <div>
          <div className="label">Table builder</div>
          <i className="dash" style={{ "--accent": "var(--l6)", width: 18 } as CSSProperties} />
        </div>
        <span style={{ display: "flex" }}>
          <button type="button" className="icon-button" aria-label={folded ? "Unfold" : "Fold"} aria-expanded={!folded} onClick={() => setFolded((f) => !f)}>
            <Icon name="chev" size={12} style={{ transform: folded ? undefined : "rotate(180deg)" }} />
          </button>
          <button type="button" className="icon-button" aria-label="Close the table builder" onClick={() => set("tableBuilder", false)}>
            <Icon name="close" size={12} />
          </button>
        </span>
      </div>

      {!folded && (
        <div className="tb-scroll">
          <section className="viz-section">
            <div className="label">Axes</div>
            {s.tbAnswer && s.tbAnswer !== "flow" ? (
              <p className="tb-note">Set by the answer. Choose a form to set them yourself.</p>
            ) : (
              <>
                <div className="pick">
                  <span>Across</span>
                  <Select<AxisKey> label="Across" value={s.tbAcross} options={AXES} onChange={(v) => set("tbAcross", v)} />
                </div>
                <div className="pick">
                  <span>Down</span>
                  <Select<AxisKey> label="Down" value={s.tbDown} options={AXES} onChange={(v) => set("tbDown", v)} />
                </div>
                <button
                  type="button"
                  className="link tb-swap"
                  onClick={() => {
                    set("tbAcross", s.tbDown);
                    set("tbDown", s.tbAcross);
                  }}
                >
                  Swap across and down
                </button>
              </>
            )}
            {timeAxis && model.dateMin != null && (
              <p className="tb-note">
                Only {fmtDate(model.dateMin)} to {fmtDate(model.dateMax)}, the charts’ time window.
              </p>
            )}
          </section>

          <section className="viz-section">
            <div className="label">What shows</div>
            <div className="pick">
              <span>Colour</span>
              <Select<Colour>
                label="Colour"
                value={colour}
                options={[
                  { value: "folder", label: "Folder" },
                  { value: "domain", label: "Domain" },
                  { value: "type", label: "Type" },
                  { value: "none", label: "None" },
                ]}
                onChange={(v) => {
                  if (v === "none") set("tbMono", true);
                  else {
                    set("tbMono", false);
                    set("groupBy", v);
                  }
                }}
              />
            </div>
            <div className="pick">
              <span>Size</span>
              <Select<SizeKey>
                label="Size"
                value={s.tbSize}
                options={[
                  { value: "same", label: "Same" },
                  { value: "words", label: "Length" },
                  { value: "links", label: "Links" },
                ]}
                onChange={(v) => set("tbSize", v)}
              />
            </div>
            <div className="pick">
              <span>Filter</span>
              <Select<string> label="Filter" value={s.tbFilter} options={filters} onChange={(v) => set("tbFilter", v)} />
            </div>
            <SwitchRow label="Hide unsorted" on={s.hideUnsorted} onChange={(v) => set("hideUnsorted", v)} />
          </section>

          <section className="viz-section">
            <div className="label">Form</div>
            <div className="tb-grid">
              {FORMS.map((f) => (
                <button key={f.value} type="button" title={f.hint} aria-pressed={!s.tbAnswer && s.tbForm === f.value} onClick={() => pickForm(f.value)}>
                  {f.label}
                </button>
              ))}
            </div>
          </section>

          <section className="viz-section">
            <div className="label">Answers</div>
            <div className="tb-grid">
              {ANSWERS.map((a) => (
                <button key={a.value} type="button" title={a.question} aria-pressed={s.tbAnswer === a.value} onClick={() => pickAnswer(a.value)}>
                  {a.label}
                </button>
              ))}
            </div>
            {answer && (
              <div className="tb-answer">
                <p className="tb-q">{answer.question}</p>
                <p>{said}</p>
              </div>
            )}
          </section>

          <section className="viz-section">
            <SwitchRow label="Counts" on={s.tbCounts} onChange={(v) => set("tbCounts", v)} />
            <SwitchRow label="Links" on={s.links} onChange={(v) => set("links", v)} />
          </section>
        </div>
      )}
    </aside>
  );
}
