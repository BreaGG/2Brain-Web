"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Model, GroupBy } from "@/lib/brain";
import type { Settings } from "@/lib/settings";
import { buildAnatomy, buildGrouped, loadAtlas, type Atlas } from "./anatomy";
import { buildForm, type FormSpec } from "./forms";
import { buildTree } from "./tree";
import { BrainScene, type SceneLabel } from "./scene";

export interface BrainCanvasProps {
  model: Model;
  settings: Settings;
  groupBy: GroupBy;
  groupOf: Int32Array;
  groupCount: number;
  groupRgb: [number, number, number][];
  /** The table builder's form, or null for the groups layout. */
  table: FormSpec | null;
  sizeK: Float32Array | null;
  noteLit: Uint8Array | null;
  recLit: Uint8Array | null;
  hidden: Uint8Array;
  labels: SceneLabel[];
  selected: number | null;
  focusNote: number | null;
  resetKey: number;
  onHover: (i: number | null, x: number, y: number) => void;
  onPick: (i: number | null) => void;
  onClear: () => void;
}

export default function BrainCanvas(p: BrainCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const labelHost = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BrainScene | null>(null);
  const cbs = useRef({ onHover: p.onHover, onPick: p.onPick, onClear: p.onClear });
  useEffect(() => {
    cbs.current = { onHover: p.onHover, onPick: p.onPick, onClear: p.onClear };
  });

  const small = useMemo(() => {
    if (typeof window === "undefined") return false;
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    return window.innerWidth < 860 || mem < 4;
  }, []);

  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadAtlas()
      .then((a) => live && setAtlas(a))
      .catch((e) => {
        console.error("[2brain] anatomy could not be loaded", e);
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const anat = useMemo(() => (atlas ? buildAnatomy(p.model, atlas, { small }) : null), [p.model, atlas, small]);
  const grouped = useMemo(
    () =>
      !anat
        ? null
        : p.table
          ? buildForm(p.model, anat, p.table)
          : p.settings.groupLayout === "tree"
            ? buildTree(p.model, anat, p.model.groups[p.groupBy])
            : buildGrouped(p.model, p.groupBy, anat),
    [p.model, p.groupBy, anat, p.table, p.settings.groupLayout],
  );

  // mount
  useEffect(() => {
    if (!host.current || !labelHost.current) return;
    let scene: BrainScene;
    try {
      scene = new BrainScene(host.current, labelHost.current, {
        onHover: (i, x, y) => cbs.current.onHover(i, x, y),
        onPick: (i) => cbs.current.onPick(i),
        onClear: () => cbs.current.onClear(),
      });
    } catch (e) {
      console.error("[2brain] WebGL unavailable", e);
      if (host.current) host.current.dataset.nogl = "1";
      return;
    }
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  const s = sceneRef;
  useEffect(() => {
    if (anat) s.current?.setAnatomy(anat, p.model.links, p.model.ghostSlugs);
  }, [anat, p.model, s]);

  useEffect(() => {
    if (grouped) s.current?.setLayout(grouped, p.groupOf, p.groupCount);
  }, [grouped, p.groupOf, p.groupCount, s, anat]);

  useEffect(() => {
    s.current?.setColors(p.groupRgb);
  }, [p.groupRgb, grouped, anat, s]);

  useEffect(() => {
    s.current?.setLit(p.noteLit, p.recLit);
  }, [p.noteLit, p.recLit, anat, grouped, s]);

  useEffect(() => {
    s.current?.setHidden(p.hidden);
  }, [p.hidden, anat, s]);

  const st = p.settings;
  useEffect(() => {
    s.current?.setView({
      form: st.form,
      split: st.split,
      turning: st.turning,
      speed: st.speed,
      links: st.links,
      outline: st.outline,
      outlineOpacity: st.outlineOpacity,
      pointSize: st.pointSize,
      notes: st.notes,
      record: st.record,
      ghosts: st.ghosts,
      focusBrain: st.focusBrain,
      tracts: st.tracts,
    });
  }, [st.form, st.split, st.turning, st.speed, st.links, st.outline, st.outlineOpacity, st.pointSize, st.notes, st.record, st.ghosts, st.focusBrain, st.tracts, s, anat]);

  useEffect(() => {
    const layoutLabels: SceneLabel[] = (grouped?.labels ?? []).map((l) => ({ text: l.text, pos: l.pos, kind: l.kind, group: l.group }));
    s.current?.setLabels([...p.labels, ...layoutLabels], st.labelSize);
  }, [p.labels, st.labelSize, s, grouped, p.groupRgb]);

  useEffect(() => {
    s.current?.setSizeK(p.sizeK);
  }, [p.sizeK, s, anat]);

  // the table builder's panel covers the left of the stage on wide screens
  useEffect(() => {
    const apply = () => s.current?.setInsetLeft(p.table && window.innerWidth >= 860 ? 268 : 0);
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [p.table, s, anat]);

  useEffect(() => {
    s.current?.setSelected(p.selected);
  }, [p.selected, s]);

  const zoomed = useRef(false);
  useEffect(() => {
    if (!anat) return;
    if (p.focusNote != null) {
      s.current?.focusNote(p.focusNote);
      zoomed.current = true;
    } else if (zoomed.current) {
      s.current?.home();
      zoomed.current = false;
    }
  }, [p.focusNote, s, anat]);

  useEffect(() => {
    if (p.resetKey) s.current?.resetCamera();
  }, [p.resetKey, s]);

  return (
    <div className="brain-host" data-knowledge-graph="">
      <div ref={host} className="brain-host" />
      {!anat && <div className="brain-loading label">{failed ? "The anatomy could not be loaded" : "Drawing your brain…"}</div>}
      <div ref={labelHost} className="brain-labels" />
    </div>
  );
}
