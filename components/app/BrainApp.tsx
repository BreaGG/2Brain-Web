"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ParsedPage } from "@/lib/types";
import { buildModel } from "@/lib/brain";
import { parsePage } from "@/lib/parser";
import { sampleWikiFiles } from "@/lib/sample";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "@/lib/settings";
import { THEMES, groupRgb, rgbCss } from "@/lib/palettes";
import type { SceneLabel } from "@/components/brain/scene";
import type { FormSpec } from "@/components/brain/forms";
import { AppCtx, NAV, type AppApi, type Focus, type PaneId } from "./context";
import Rail from "./Rail";
import StageOverlay, { CaptureButton } from "./StageOverlay";
import Offline from "./Offline";
import CommandBar from "./CommandBar";
import Panes from "./Panes";
import Walkthrough from "./Walkthrough";
import { BrainMark, Icon, Wordmark } from "@/components/ui";

const BrainCanvas = dynamic(() => import("@/components/brain/BrainCanvas"), {
  ssr: false,
  loading: () => <div className="brain-loading label">Drawing your brain…</div>,
});
const HandTracking = dynamic(() => import("@/components/lab/HandTracking"), { ssr: false });

interface Props {
  pages: ParsedPage[];
  initialSlug?: string;
  repo: { owner: string; repo: string } | null;
  usingSample: boolean;
  /** Writing new notes to the wiki repository is turned on (WIKI_WRITE_KEY is set). */
  writable?: boolean;
  /** Questions can be put to Claude (an Anthropic API key and the write key are set). */
  askable?: boolean;
}

const PANE_IDS = new Set<PaneId>(["today", "ask", "navigator", "numbers", "timeline", "you", "lab", "review", "files", "learn", "add"]);

export default function BrainApp({ pages, initialSlug, repo, usingSample, writable = false, askable = false }: Props) {
  const [demo, setDemoState] = useState(false);
  const demoPages = useMemo(() => (demo ? sampleWikiFiles().map((f) => parsePage(f.path, f.content)) : null), [demo]);
  const model = useMemo(() => buildModel(demoPages ?? pages), [pages, demoPages]);
  const [tour, setTour] = useState(false);

  /* ── settings (persisted per browser) ─────────────────────────────────── */
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const loaded = useRef(false);
  useEffect(() => {
    setSettings(loadSettings());
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (loaded.current) saveSettings(settings);
  }, [settings]);
  const set = useCallback(
    <K extends keyof Settings>(k: K, v: Settings[K]) =>
      setSettings((s) => {
        const next = { ...s, [k]: v };
        // the table builder is drawn at Layout: turning it on slides Form across, off slides it back
        if (k === "tableBuilder") {
          next.form = v ? 1 : 0;
          if (v) next.cosmos = false;
        }
        // the cosmos is a layout too, and takes the place of the table builder
        if (k === "cosmos") {
          next.form = v ? 1 : 0;
          if (v) next.tableBuilder = false;
        }
        return next;
      }),
    [],
  );
  const resetSettings = useCallback(() => setSettings(DEFAULT_SETTINGS), []);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const replaceSettings = useCallback((next: Settings) => setSettings(next), []);

  /* ── grouping + colours ───────────────────────────────────────────────── */
  const grouping = model.groups[settings.groupBy];
  const G = grouping.list.length;
  const rgb = useMemo(
    () => grouping.list.map((_, i) => groupRgb(settings.palette, i, G)),
    [grouping, settings.palette, G],
  );
  const colors = useMemo(() => rgb.map(rgbCss), [rgb]);
  const colorOf = useCallback((i: number) => colors[grouping.of[i]] ?? "#fff", [colors, grouping]);
  const sceneRgb = useMemo(
    () => (settings.tableBuilder && settings.tbMono ? rgb.map(() => [0.92, 0.92, 0.92] as [number, number, number]) : rgb),
    [rgb, settings.tableBuilder, settings.tbMono],
  );

  /* ── table builder ────────────────────────────────────────────────────── */
  const table = useMemo<FormSpec | null>(
    () =>
      settings.tableBuilder
        ? { across: settings.tbAcross, down: settings.tbDown, form: settings.tbForm, answer: settings.tbAnswer, counts: settings.tbCounts, grouping }
        : null,
    [settings.tableBuilder, settings.tbAcross, settings.tbDown, settings.tbForm, settings.tbAnswer, settings.tbCounts, grouping],
  );
  const sizeK = useMemo(() => {
    if (!settings.tableBuilder || settings.tbSize === "same") return null;
    const v = model.notes.map((x) => (settings.tbSize === "words" ? x.words : x.in.length + x.out.length));
    const max = Math.max(1, ...v);
    return Float32Array.from(v, (x) => 0.45 + 1.9 * Math.sqrt(x / max));
  }, [settings.tableBuilder, settings.tbSize, model]);

  /* ── panes + note ─────────────────────────────────────────────────────── */
  const initialIdx = initialSlug != null ? (model.bySlug.get(initialSlug) ?? null) : null;
  const [pane, setPane] = useState<PaneId | null>(initialIdx != null ? "note" : null);
  const [prevPane, setPrevPane] = useState<PaneId | null>(null);
  const [noteIdx, setNoteIdx] = useState<number | null>(initialIdx);
  const [focus, setFocusState] = useState<Focus>(initialIdx != null ? { kind: "note", i: initialIdx } : { kind: "none" });
  const [focusNote, setFocusNote] = useState<number | null>(initialIdx);
  const [cmd, setCmd] = useState<{ open: boolean; q: string }>({ open: false, q: "" });
  const [vizOpen, setVizOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [gestures, setGestures] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const syncUrl = useCallback((path: string, push: boolean) => {
    if (typeof window === "undefined" || window.location.pathname + window.location.hash === path) return;
    if (push) window.history.pushState(null, "", path);
    else window.history.replaceState(null, "", path);
  }, []);

  const clearNoteFocus = () => setFocusState((f) => (f.kind === "note" ? { kind: "none" } : f));

  const openPane = useCallback(
    (p: PaneId | null) => {
      setRailOpen(false);
      if (p === pane) return;
      if (p == null) {
        setPane(null);
        setPrevPane(null);
        setNoteIdx(null);
        clearNoteFocus();
        syncUrl("/", false);
        return;
      }
      const prev = pane == null ? null : pane === "note" ? (prevPane !== p ? prevPane : null) : pane;
      setPrevPane(prev);
      setPane(p);
      setNoteIdx(null);
      clearNoteFocus();
      // opening a pane from the brain is a step back can undo (the phone's back gesture)
      syncUrl(`/#${p}`, pane === "note" || pane == null);
    },
    [pane, prevPane, syncUrl],
  );

  const openNote = useCallback(
    (i: number, opts?: { focus?: boolean }) => {
      setRailOpen(false);
      setPrevPane(pane === "note" ? prevPane : pane);
      setPane("note");
      setNoteIdx(i);
      setFocusState({ kind: "note", i });
      if (opts?.focus !== false) setFocusNote(i);
      syncUrl(`/wiki/${model.notes[i].id}`, true);
    },
    [model, pane, prevPane, syncUrl],
  );

  const openSlug = useCallback(
    (slug: string) => {
      const i = model.bySlug.get(slug);
      if (i != null) openNote(i);
    },
    [model, openNote],
  );

  /** Close whatever is in the pane slot; the collapsed pane (if any) comes back. */
  const closeCurrent = useCallback(() => {
    const back = prevPane;
    setPane(back);
    setPrevPane(null);
    setNoteIdx(null);
    clearNoteFocus();
    syncUrl(back ? `/#${back}` : "/", pane === "note");
  }, [pane, prevPane, syncUrl]);

  const restorePrev = useCallback(() => {
    if (!prevPane) return;
    const back = prevPane;
    setPrevPane(pane && pane !== "note" ? pane : null);
    setPane(back);
    setNoteIdx(null);
    clearNoteFocus();
    syncUrl(`/#${back}`, pane === "note");
  }, [pane, prevPane, syncUrl]);

  // the camera only stays close while the note it flew to is the focus
  useEffect(() => {
    if (focusNote != null && !(focus.kind === "note" && focus.i === focusNote)) setFocusNote(null);
  }, [focus, focusNote]);

  const setFocus = useCallback((f: Focus) => setFocusState(f), []);
  const lightSet = useCallback((ids: number[], label: string, source?: string) => {
    setFocusState(ids.length ? { kind: "set", ids, label, source } : { kind: "none" });
  }, []);
  const openCommand = useCallback((q = "") => setCmd({ open: true, q }), []);
  const closeCmd = () => setCmd((c) => (c.open ? { open: false, q: "" } : c));

  // initial hash → pane; back/forward → note
  useEffect(() => {
    const h = window.location.hash.slice(1) as PaneId;
    if (!initialSlug && PANE_IDS.has(h)) setPane(h);
    const onPop = () => {
      const m = window.location.pathname.match(/^\/wiki\/(.+)$/);
      if (m) {
        const i = model.bySlug.get(decodeURIComponent(m[1]));
        if (i != null) {
          setNoteIdx(i);
          setPane("note");
          setFocusState({ kind: "note", i });
          return;
        }
      }
      const hh = window.location.hash.slice(1) as PaneId;
      setNoteIdx(null);
      setPane(PANE_IDS.has(hh) ? hh : null);
      setFocusState((f) => (f.kind === "note" ? { kind: "none" } : f));
    };
    window.addEventListener("popstate", onPop);
    // offline, a note's address is answered with the saved brain: open the note from the address
    if (!initialSlug && /^\/wiki\/.+/.test(window.location.pathname)) onPop();
    return () => window.removeEventListener("popstate", onPop);
  }, [model, initialSlug]);

  /* ── keyboard ─────────────────────────────────────────────────────────── */
  const escRef = useRef<() => void>(() => {});
  escRef.current = () => {
    if (cmd.open) return setCmd({ open: false, q: "" });
    if (vizOpen) return setVizOpen(false);
    if (railOpen) return setRailOpen(false);
    if (pane) return closeCurrent();
    if (growth) return setGrowth(null);
    if (focus.kind !== "none") return setFocusState({ kind: "none" });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmd((c) => ({ open: !c.open, q: "" }));
        return;
      }
      if (e.key === "Escape") {
        if (typing && !cmd.open) (e.target as HTMLElement).blur();
        escRef.current();
        return;
      }
      if (typing) return;
      if (e.key === "/") {
        e.preventDefault();
        document.getElementById("stage-find")?.focus();
      } else if (e.key === "v" && !e.metaKey && !e.ctrlKey) {
        setVizOpen((v) => !v);
      } else if (e.key === "b" && !e.metaKey && !e.ctrlKey) {
        setSettings((st) => ({ ...st, focusBrain: !st.focusBrain }));
      } else if (e.key === "c" && !e.metaKey && !e.ctrlKey) {
        set("cosmos", !settingsRef.current.cosmos);
      } else if (e.key === "p" && !e.metaKey && !e.ctrlKey) {
        document.querySelector<HTMLButtonElement>("[data-capture]")?.click();
      } else if (e.key === "g" && !e.metaKey && !e.ctrlKey) {
        setGrowth((g) => (g ? null : { k: 0, playing: true }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cmd.open]);

  /* ── lit / hidden / labels ────────────────────────────────────────────── */
  const N = model.notes.length;
  const { noteLit, recLit } = useMemo(() => {
    if (focus.kind === "none") return { noteLit: null, recLit: null };
    const lit = new Uint8Array(N);
    let rec: Uint8Array | null = null;
    if (focus.kind === "note") {
      const n = model.notes[focus.i];
      if (!n) return { noteLit: null, recLit: null };
      for (const j of n.out) lit[j] = 1;
      for (const j of n.in) lit[j] = 1;
      lit[focus.i] = 2;
      rec = new Uint8Array(N);
      rec[focus.i] = 1;
    } else if (focus.kind === "groups") {
      const keys = new Set(focus.keys);
      const of = model.groups[focus.groupBy].of;
      for (let i = 0; i < N; i++) if (keys.has(of[i])) lit[i] = 1;
    } else {
      for (const i of focus.ids) lit[i] = 1;
    }
    return { noteLit: lit, recLit: rec };
  }, [focus, model, N]);

  /* ── growth: the brain as it was, note by note ─────────────────────────── */
  const growOrder = useMemo(
    () =>
      model.notes
        .map((n) => n.i)
        .sort((a, b) => (model.notes[a].date ?? Infinity) - (model.notes[b].date ?? Infinity) || model.notes[a].id.localeCompare(model.notes[b].id)),
    [model],
  );
  const [askSeed, setAskSeed] = useState<{ q: string; n: number } | null>(null);
  const [growth, setGrowth] = useState<{ k: number; playing: boolean } | null>(null);
  const shownK = growth ? Math.floor(growth.k) : N;
  useEffect(() => {
    if (!growth?.playing) return;
    // about twelve seconds from the first note to the last, however many there are
    const per = Math.max(1, N) / 12;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      setGrowth((g) => {
        if (!g || !g.playing) return g;
        const k = Math.min(N, g.k + per * dt);
        return { k, playing: k < N };
      });
    }, 60);
    return () => window.clearInterval(id);
  }, [growth?.playing, N]);
  useEffect(() => setGrowth(null), [model]);

  const hidden = useMemo(() => {
    const h = new Uint8Array(N);
    if (shownK < N) for (let j = shownK; j < growOrder.length; j++) h[growOrder[j]] = 1;
    if (settings.hideUnsorted) {
      for (let i = 0; i < N; i++) if (grouping.list[grouping.of[i]]?.unsorted) h[i] = 1;
    }
    if (settings.tableBuilder && settings.tbFilter !== "all") {
      const [kind, key] = settings.tbFilter.split(":");
      for (let i = 0; i < N; i++) {
        const n = model.notes[i];
        if ((kind === "type" && n.type !== key) || (kind === "folder" && n.folder !== key) || (kind === "domain" && n.domain !== key)) h[i] = 1;
      }
    }
    return h;
  }, [settings.hideUnsorted, settings.tableBuilder, settings.tbFilter, grouping, N, model, shownK, growOrder]);

  const labels = useMemo<SceneLabel[]>(() => {
    if (settings.labels === "none") return [];
    const out: SceneLabel[] = [];
    // in the cosmos every folder is a galaxy that carries its own name
    const named = (gb: string) => settings.cosmos && gb === "folder";
    if (settings.labels === "all" && !named(settings.groupBy)) {
      grouping.list.forEach((g, gi) => {
        if (!(settings.hideUnsorted && g.unsorted)) out.push({ text: g.label, group: gi });
      });
    }
    if (focus.kind === "note") {
      const n = model.notes[focus.i];
      out.push({ text: n.title, note: focus.i, strong: true });
      if (settings.labels === "lit") [...new Set([...n.out, ...n.in])].slice(0, 10).forEach((j) => out.push({ text: model.notes[j].title, note: j }));
    } else if (focus.kind === "groups" && settings.labels === "lit" && !named(focus.groupBy)) {
      for (const k of focus.keys) out.push({ text: model.groups[focus.groupBy].list[k].label, group: focus.groupBy === settings.groupBy ? k : undefined, strong: true });
    } else if (focus.kind === "set" && settings.labels === "lit") {
      focus.ids.slice(0, 14).forEach((j) => out.push({ text: model.notes[j].title, note: j }));
    }
    return out.filter((l) => l.note != null || l.group != null);
  }, [settings.labels, settings.hideUnsorted, settings.cosmos, settings.groupBy, grouping, focus, model]);

  /* ── theme ────────────────────────────────────────────────────────────── */
  const theme = THEMES.find((t) => t.id === settings.theme) ?? THEMES[0];
  useEffect(() => {
    document.documentElement.style.setProperty("--bg", theme.bg);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.bg);
  }, [theme.bg]);

  const api: AppApi = {
    model,
    settings,
    set,
    resetSettings,
    colors,
    colorOf,
    groupOf: grouping.of,
    pane,
    openPane,
    noteIdx,
    openNote,
    openSlug,
    focus,
    setFocus,
    lightSet,
    openCommand,
    repo,
    usingSample,
    gestures,
    setGestures,
    replaceSettings,
    writable: writable && !demo,
    askable: askable && !demo,
    askSeed,
    askBrain: (q: string) => {
      setAskSeed({ q, n: Date.now() });
      openPane("ask");
    },
    startTour: () => setTour(true),
    growOrder,
    growth,
    setGrowth,
    demo,
    setDemo: (v: boolean) => {
      setDemoState(v);
      setPane(null);
      setPrevPane(null);
      setNoteIdx(null);
      setFocusState({ kind: "none" });
      setFocusNote(null);
      syncUrl("/", false);
    },
  };

  const selected = focus.kind === "note" ? focus.i : null;
  const accentFor = (p: PaneId | null) => NAV.find((n) => n.id === p)?.accent;

  return (
    <AppCtx.Provider value={api}>
      <div className="app" style={{ "--ground": settings.ground / 100 } as CSSProperties}>
        <header className="mobile-bar">
          <button type="button" onClick={() => { openPane(null); setFocusState({ kind: "none" }); }} aria-label="2brain, back to the brain">
            <Wordmark />
          </button>
          <div className="acts">
            <button
              type="button"
              className="icon-button boxed"
              aria-pressed={settings.focusBrain}
              aria-label="Focus brain"
              onClick={() => set("focusBrain", !settings.focusBrain)}
            >
              <BrainMark size={13} />
            </button>
            <button type="button" className="icon-button boxed" aria-pressed={settings.cosmos} aria-label="Cosmos" onClick={() => set("cosmos", !settings.cosmos)}>
              <Icon name="galaxy" size={14} />
            </button>
            <CaptureButton />
            <button type="button" className="icon-button boxed" aria-expanded={vizOpen} aria-label="View settings" onClick={() => { setRailOpen(false); setVizOpen((v) => !v); }}>
              <Icon name="sliders" size={12} />
            </button>
          </div>
        </header>

        <nav className="tabbar" aria-label="Sections">
          {/* closing search first lets any tab take you straight where it says */}
          {(
            [
              { id: "brain", label: "Brain", icon: <BrainMark size={18} />, on: pane == null && !railOpen, go: () => { closeCmd(); openPane(null); setFocusState({ kind: "none" }); setVizOpen(false); } },
              { id: "notes", label: "Notes", icon: <Icon name="doc" size={17} />, on: (pane === "navigator" || pane === "note") && !railOpen, go: () => { closeCmd(); setVizOpen(false); openPane("navigator"); } },
              { id: "search", label: "Search", icon: <Icon name="search" size={17} />, on: cmd.open, go: () => { setRailOpen(false); setVizOpen(false); if (cmd.open) closeCmd(); else openCommand(); } },
              { id: "add", label: "Add", icon: <Icon name="plus" size={17} />, on: pane === "add" && !railOpen, go: () => { closeCmd(); setVizOpen(false); openPane("add"); } },
              { id: "more", label: "More", icon: <Icon name="menu" size={17} />, on: railOpen || (!!pane && !["navigator", "note", "add"].includes(pane)), go: () => { closeCmd(); setVizOpen(false); setRailOpen((v) => !v); } },
            ] as const
          ).map((t) => (
            <button key={t.id} type="button" aria-current={t.on} onClick={t.go}>
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <Rail open={railOpen} onHome={() => { openPane(null); setFocusState({ kind: "none" }); setResetKey((k) => k + 1); }} />

        <Panes
          pane={pane}
          prevPane={prevPane}
          accent={pane === "note" && noteIdx != null ? colorOf(noteIdx) : accentFor(pane) ?? "var(--ink)"}
          onRestorePrev={restorePrev}
          onClose={closeCurrent}
        />

        <main className="stage" aria-label="Your brain">
          <BrainCanvas
            model={model}
            settings={settings}
            groupBy={settings.groupBy}
            groupOf={grouping.of}
            groupCount={G}
            groupRgb={sceneRgb}
            table={table}
            sizeK={sizeK}
            noteLit={noteLit}
            recLit={recLit}
            core={focus.kind === "note" && model.notes[focus.i]?.id === "index"}
            hidden={hidden}
            labels={labels}
            selected={selected}
            focusNote={focusNote}
            resetKey={resetKey}
            onHover={(i, x, y) => setHover(i == null ? null : { i, x, y })}
            onPick={(i) => {
              if (i == null) return;
              openNote(i, { focus: false });
            }}
            onClear={() => setFocusState({ kind: "none" })}
          />
          <StageOverlay vizOpen={vizOpen} setVizOpen={setVizOpen} hover={hover} />
          <Offline />
        </main>

        {cmd.open && <CommandBar initial={cmd.q} onClose={() => setCmd({ open: false, q: "" })} setVizOpen={setVizOpen} />}
        {gestures && <HandTracking active={gestures} onClose={() => setGestures(false)} />}
        {tour && <Walkthrough onEnd={() => setTour(false)} />}
      </div>
    </AppCtx.Provider>
  );
}
