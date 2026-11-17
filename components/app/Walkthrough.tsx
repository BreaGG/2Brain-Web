"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useApp, type AppApi } from "./context";
import { Icon } from "@/components/ui";
import type { Settings } from "@/lib/settings";

interface Step {
  title: string;
  text: string;
  apply: (app: AppApi, base: Settings, hub: number | null) => void;
}

/** Settings for a step: the user's own, with the tour's view laid over them. */
const view = (app: AppApi, base: Settings, over: Partial<Settings>) =>
  app.replaceSettings({ ...base, turning: true, focusBrain: false, tableBuilder: false, form: 0, split: false, ...over });

const STEPS: Step[] = [
  {
    title: "This is your brain",
    text: "Every note in your wiki is a bright point on the cortex of a real human brain. Each folder takes its own patch of cortex.",
    apply: (app, base) => {
      app.openPane(null);
      app.setFocus({ kind: "none" });
      view(app, base, {});
    },
  },
  {
    title: "The record runs down the body",
    text: "Every passage of every note runs from the brainstem down the spinal cord and out along the nerves, in the order it was written.",
    apply: (app, base) => view(app, base, { order: base.order }),
  },
  {
    title: "Focus the brain",
    text: "Set the body aside to look at the brain alone. Press B, or use the brain button at the top right.",
    apply: (app, base) => view(app, base, { focusBrain: true }),
  },
  {
    title: "Open a note",
    text: "Click any point to read its note beside the brain. Its links light up and tracts of light run to every note it names.",
    apply: (app, base, hub) => {
      view(app, base, { focusBrain: true, turning: false });
      if (hub != null) app.openNote(hub);
    },
  },
  {
    title: "From anatomy to layout",
    text: "Slide Form to Layout and the points gather into one cloud per group. Group by folder, domain or type.",
    apply: (app, base) => {
      app.openPane(null);
      app.setFocus({ kind: "none" });
      view(app, base, { form: 1, groupLayout: "spheres" });
    },
  },
  {
    title: "The folder tree",
    text: "Or lay the wiki out as a tree: every folder a branch, every note a leaf with its record round it.",
    apply: (app, base) => view(app, base, { form: 1, groupLayout: "tree" }),
  },
  {
    title: "The table builder: waves",
    text: "The table builder turns the record into charts made of its own points. Waves shows when each area was active.",
    apply: (app, base) => view(app, base, { tableBuilder: true, form: 1, tbAnswer: "waves" }),
  },
  {
    title: "The table builder: clock",
    text: "Clock asks what your rhythm is by weekday and season. Every answer comes with its question and what the record says.",
    apply: (app, base) => view(app, base, { tableBuilder: true, form: 1, tbAnswer: "clock" }),
  },
  {
    title: "Ask anything",
    text: "⌘K searches your notes, lights groups and runs every command. Learn explains what each line means. That is the tour.",
    apply: (app, base) => view(app, base, {}),
  },
];

export default function Walkthrough({ onEnd }: { onEnd: () => void }) {
  const app = useApp();
  const [k, setK] = useState(0);
  const base = useRef<Settings>(app.settings);
  const hub = useMemo(
    () => app.model.notes.filter((n) => !n.isIndex).sort((a, b) => b.in.length + b.out.length - (a.in.length + a.out.length))[0]?.i ?? null,
    [app.model],
  );
  const appRef = useRef(app);
  appRef.current = app;

  useEffect(() => {
    STEPS[k].apply(appRef.current, base.current, hub);
  }, [k, hub]);

  const end = () => {
    const a = appRef.current;
    a.openPane(null);
    a.setFocus({ kind: "none" });
    a.replaceSettings(base.current);
    onEnd();
  };
  const endRef = useRef(end);
  endRef.current = end;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") endRef.current();
      else if (e.key === "ArrowRight") setK((x) => Math.min(STEPS.length - 1, x + 1));
      else if (e.key === "ArrowLeft") setK((x) => Math.max(0, x - 1));
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const s = STEPS[k];
  const last = k === STEPS.length - 1;
  return (
    <div className="tour" role="dialog" aria-label="Walkthrough" aria-live="polite">
      <div className="tour-head">
        <span className="label">
          Walkthrough · {k + 1} of {STEPS.length}
        </span>
        <button type="button" className="icon-button" aria-label="End the walkthrough" onClick={end}>
          <Icon name="close" size={12} />
        </button>
      </div>
      <div className="tour-bar">
        <i style={{ width: `${((k + 1) / STEPS.length) * 100}%` } as CSSProperties} />
      </div>
      <h3>{s.title}</h3>
      <p>{s.text}</p>
      <div className="tour-acts">
        <button type="button" className="link" disabled={k === 0} onClick={() => setK((x) => Math.max(0, x - 1))}>
          Back
        </button>
        <button type="button" className="btn solid" onClick={() => (last ? end() : setK((x) => x + 1))}>
          {last ? "Done" : "Next"}
        </button>
      </div>
    </div>
  );
}
