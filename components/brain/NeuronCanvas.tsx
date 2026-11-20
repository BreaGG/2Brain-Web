"use client";

import { useEffect, useMemo, useRef } from "react";
import { fmtDate, type Model } from "@/lib/brain";
import { CAPTURE_EVENT, composePicture, deliverPicture, type CaptureDetail } from "@/lib/capture";
import { buildNeurons } from "./neurons";
import { NeuronScene } from "./neuronScene";

interface Props {
  model: Model;
  groupOf: Int32Array;
  groupRgb: [number, number, number][];
  noteLit: Uint8Array | null;
  hidden: Uint8Array;
  turning: boolean;
  speed: number;
  onHover: (i: number | null, x: number, y: number) => void;
  onPick: (i: number | null) => void;
}

/** The neuron view: every note a neuron, every link an axon, impulses running between them. */
export default function NeuronCanvas(p: Props) {
  const host = useRef<HTMLDivElement>(null);
  const labelHost = useRef<HTMLDivElement>(null);
  const sc = useRef<NeuronScene | null>(null);
  const cbs = useRef({ onHover: p.onHover, onPick: p.onPick });
  useEffect(() => {
    cbs.current = { onHover: p.onHover, onPick: p.onPick };
  });

  const small = typeof window !== "undefined" && (window.innerWidth < 700 || ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4);
  const net = useMemo(() => buildNeurons(p.model, p.groupOf, { small }), [p.model, p.groupOf, small]);
  const colours = useMemo(() => Array.from(p.groupOf, (g) => p.groupRgb[g] ?? ([1, 1, 1] as [number, number, number])), [p.groupOf, p.groupRgb]);
  const titles = useMemo(() => p.model.notes.map((n) => n.title), [p.model]);

  useEffect(() => {
    if (!host.current || !labelHost.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let scene: NeuronScene;
    try {
      scene = new NeuronScene(host.current, labelHost.current, { onHover: (i, x, y) => cbs.current.onHover(i, x, y), onPick: (i) => cbs.current.onPick(i) }, reduced);
    } catch (err) {
      console.error("[2brain] the neuron view could not start", err);
      return;
    }
    sc.current = scene;
    return () => {
      scene.dispose();
      sc.current = null;
    };
  }, []);

  useEffect(() => {
    sc.current?.setNet(net, titles, colours);
    // only a new net resets the view; colours and titles follow below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net]);
  useEffect(() => sc.current?.setColors(colours), [colours]);
  useEffect(() => sc.current?.setLit(p.noteLit), [p.noteLit, net]);
  useEffect(() => sc.current?.setHidden(p.hidden), [p.hidden, net]);
  useEffect(() => sc.current?.setView({ turning: p.turning, speed: p.speed }), [p.turning, p.speed]);

  // a picture of the neurons, when one is asked for while they are showing
  const count = p.model.notes.length;
  useEffect(() => {
    const onCapture = (e: Event) => {
      const { done } = (e as CustomEvent<CaptureDetail>).detail;
      const s = sc.current, box = host.current;
      if (!s || !box || !labelHost.current) return done({ ok: false });
      const ratio = Math.min(4096 / Math.max(1, box.clientWidth), Math.max(2, window.devicePixelRatio || 1));
      try {
        const pic = composePicture(s.snapshot(ratio), box, labelHost.current, `2brain · neurons · ${fmtDate(Date.now())} · ${count} notes`);
        deliverPicture(pic, `2brain-neurons-${new Date().toISOString().slice(0, 10)}.png`).then(
          (how) => done({ ok: true, how }),
          () => done({ ok: false }),
        );
      } catch (err) {
        console.error("[2brain] capture failed", err);
        done({ ok: false });
      }
    };
    window.addEventListener(CAPTURE_EVENT, onCapture);
    return () => window.removeEventListener(CAPTURE_EVENT, onCapture);
  }, [count]);

  return (
    <div className="neuron-host" data-neurons="">
      <div ref={host} className="neuron-host" />
      <div ref={labelHost} className="brain-labels" />
    </div>
  );
}
