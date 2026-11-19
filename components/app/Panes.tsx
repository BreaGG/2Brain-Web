"use client";

import type { CSSProperties } from "react";
import { NAV, type PaneId } from "./context";
import Today from "@/components/panes/Today";
import Ask from "@/components/panes/Ask";
import Navigator from "@/components/panes/Navigator";
import Numbers from "@/components/panes/Numbers";
import Timeline from "@/components/panes/Timeline";
import You from "@/components/panes/You";
import Lab from "@/components/panes/Lab";
import Review from "@/components/panes/Review";
import Files from "@/components/panes/Files";
import Learn from "@/components/panes/Learn";
import Add from "@/components/panes/Add";
import Reader from "@/components/panes/Reader";

const LABEL: Record<PaneId, string> = {
  today: "Today",
  ask: "Ask",
  navigator: "Navigator",
  numbers: "Numbers",
  timeline: "Timeline",
  you: "You",
  lab: "Lab",
  review: "Review",
  files: "Files",
  learn: "Learn",
  add: "Add",
  note: "Note",
};

export default function Panes({
  pane,
  prevPane,
  accent,
  onRestorePrev,
  onClose,
}: {
  pane: PaneId | null;
  prevPane: PaneId | null;
  accent: string;
  onRestorePrev: () => void;
  onClose: () => void;
}) {
  if (!pane) return <div className="panes" />;
  const props = { accent, onClose };
  return (
    <div className="panes" style={{ "--accent": accent } as CSSProperties}>
      {prevPane && (
        <button type="button" className="pane-tab" onClick={onRestorePrev} title={`Back to ${LABEL[prevPane]}`}>
          {LABEL[prevPane]}
        </button>
      )}
      <section className={`pane${pane === "navigator" ? " wide" : ""}`} key={pane} aria-label={LABEL[pane]}>
        {pane === "today" && <Today {...props} />}
        {pane === "ask" && <Ask {...props} />}
        {pane === "navigator" && <Navigator {...props} />}
        {pane === "numbers" && <Numbers {...props} />}
        {pane === "timeline" && <Timeline {...props} />}
        {pane === "you" && <You {...props} />}
        {pane === "lab" && <Lab {...props} />}
        {pane === "review" && <Review {...props} />}
        {pane === "files" && <Files {...props} />}
        {pane === "learn" && <Learn {...props} />}
        {pane === "add" && <Add {...props} />}
        {pane === "note" && <Reader {...props} />}
      </section>
    </div>
  );
}

export function accentOf(p: PaneId) {
  return NAV.find((n) => n.id === p)?.accent ?? "var(--ink)";
}

export interface PaneProps {
  accent: string;
  onClose: () => void;
}
