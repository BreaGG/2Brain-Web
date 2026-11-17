"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  active: boolean;
  onClose: () => void;
}

interface Landmark { x: number; y: number; z: number; }

const PINCH_THRESHOLD = 0.055;     // normalized distance thumb-index to count as pinch
const PINCH_RELEASE   = 0.075;     // hysteresis
const CLICK_MAX_MS    = 450;       // pinch duration that counts as click
const CLICK_MAX_MOVE  = 60;        // px movement allowed during click (finger pinch jitters)
const ZOOM_SENS       = 1.6;       // multiplier for two-hand zoom delta
const SCROLL_SENS     = 2.6;       // pixel scroll multiplier for vertical pinch-drag
const FIST_HOLD_MS    = 1400;      // fist held to trigger back-navigation

function findGraphSvg(): Element | null {
  // Matches either the legacy SVG graph or the new 3D Galaxy canvas wrapper
  return document.querySelector<Element>("[data-knowledge-graph]");
}

export default function HandTracking({ active, onClose }: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const cursorRef   = useRef<{ x: number; y: number } | null>(null);
  const pinchingRef = useRef(false);
  const pinchStartRef = useRef<{ t: number; x: number; y: number; el: Element | null; mode: "drag" | "scroll" } | null>(null);
  const draggedElRef  = useRef<Element | null>(null);
  const prevHoverElRef = useRef<Element | null>(null);
  const lastPinchYRef = useRef<number | null>(null);
  const lastTwoHandDistRef = useRef<number | null>(null);
  const fistStartRef = useRef<number | null>(null);
  const fistProgressRef = useRef<number>(0);    // 0..1 for canvas viz
  const rafRef = useRef<number | null>(null);
  const handLandmarkerRef = useRef<unknown>(null);

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  /* ── Setup webcam + model ── */
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let stream: MediaStream | null = null;

    (async () => {
      setStatus("loading");
      try {
        // 1) Camera
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        // 2) Load MediaPipe
        const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
        const fileset = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
        );
        const hl = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        if (cancelled) { hl.close(); return; }
        handLandmarkerRef.current = hl;
        setStatus("ready");

        // 3) Detection loop — wait for video to have real dimensions
        let lastTs = -1;
        const tick = () => {
          rafRef.current = requestAnimationFrame(tick);
          const v = videoRef.current;
          if (!v) return;
          // Need actual frame data + non-zero dimensions (else MediaPipe warns about NORM_RECT/IMAGE_DIMENSIONS)
          if (v.readyState < 2 || v.videoWidth === 0 || v.videoHeight === 0) return;
          // Skip duplicate timestamps (MediaPipe rejects them)
          const ts = v.currentTime * 1000;
          if (ts <= lastTs) return;
          lastTs = ts;
          const result = (hl as { detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks: Landmark[][] } }).detectForVideo(v, ts);
          processFrame(result.landmarks ?? []);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        setErrorMsg(msg);
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      const hl = handLandmarkerRef.current as { close?: () => void } | null;
      if (hl?.close) hl.close();
      handLandmarkerRef.current = null;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      const v = videoRef.current;
      if (v) v.srcObject = null;
      // Reset state
      cursorRef.current = null;
      pinchingRef.current = false;
      pinchStartRef.current = null;
      draggedElRef.current = null;
      lastTwoHandDistRef.current = null;
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Frame processing ── */
  function processFrame(handsList: Landmark[][]) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const W = window.innerWidth, H = window.innerHeight;
    if (canvas) { canvas.width = W; canvas.height = H; }
    if (ctx) ctx.clearRect(0, 0, W, H);

    if (handsList.length === 0) {
      // Lost hands → release pinch if held
      if (pinchingRef.current) {
        endPinch(false);
      }
      // Clear hover
      const prev = prevHoverElRef.current;
      if (prev) {
        prev.dispatchEvent(new MouseEvent("mouseout", {
          bubbles: true, cancelable: true, view: window,
        }));
        prevHoverElRef.current = null;
      }
      cursorRef.current = null;
      lastTwoHandDistRef.current = null;
      return;
    }

    /* ── Two-hand zoom ── */
    if (handsList.length >= 2) {
      const [a, b] = handsList;
      const ca = handCenter(a), cb = handCenter(b);
      const dist = Math.hypot((ca.x - cb.x) * W, (ca.y - cb.y) * H);
      if (lastTwoHandDistRef.current !== null) {
        const delta = dist - lastTwoHandDistRef.current;
        if (Math.abs(delta) > 2) {
          synthWheel(W / 2, H / 2, -delta * ZOOM_SENS);
        }
      }
      lastTwoHandDistRef.current = dist;
      // Visualize both hands
      if (ctx) {
        for (const h of handsList) drawHand(ctx, h, W, H);
        // Connection line
        ctx.strokeStyle = "rgba(79,156,249,0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo((1 - ca.x) * W, ca.y * H);
        ctx.lineTo((1 - cb.x) * W, cb.y * H);
        ctx.stroke();
      }
      // Don't process pinch when both hands are visible (avoid jitter)
      if (pinchingRef.current) endPinch(false);
      cursorRef.current = null;
      return;
    }

    /* ── Single-hand cursor + pinch ── */
    lastTwoHandDistRef.current = null;
    const hand = handsList[0];
    const indexTip = hand[8];
    const thumbTip = hand[4];
    // Mirror x (front camera)
    const cx = (1 - indexTip.x) * W;
    const cy = indexTip.y * H;
    cursorRef.current = { x: cx, y: cy };

    // Pinch detection (normalized)
    const pinchDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
    const wasPinching = pinchingRef.current;

    /* ── Fist gesture for back-navigation (only when NOT pinching) ── */
    if (!wasPinching && pinchDist >= PINCH_THRESHOLD) {
      const fist = isFist(hand);
      if (fist) {
        if (fistStartRef.current === null) fistStartRef.current = performance.now();
        const held = performance.now() - fistStartRef.current;
        fistProgressRef.current = Math.min(1, held / FIST_HOLD_MS);
        if (held >= FIST_HOLD_MS) {
          fistStartRef.current = null;
          fistProgressRef.current = 0;
          window.history.back();
          return;
        }
      } else {
        fistStartRef.current = null;
        fistProgressRef.current = 0;
      }
    } else {
      fistStartRef.current = null;
      fistProgressRef.current = 0;
    }

    if (ctx) drawHand(ctx, hand, W, H);

    if (!wasPinching && pinchDist < PINCH_THRESHOLD) {
      // Pinch start — decide drag (graph) vs scroll (page)
      pinchingRef.current = true;
      const target = elementUnder(cx, cy);
      const onGraph = !!target?.closest("[data-knowledge-graph]");
      const mode: "drag" | "scroll" = onGraph ? "drag" : "scroll";
      pinchStartRef.current = { t: performance.now(), x: cx, y: cy, el: target, mode };
      draggedElRef.current = target;
      lastPinchYRef.current = cy;
      synthPointer("pointerdown", target, cx, cy);
    } else if (wasPinching && pinchDist > PINCH_RELEASE) {
      endPinch(true);
    } else if (wasPinching) {
      const start = pinchStartRef.current;
      if (start?.mode === "scroll") {
        // Scroll page by delta of vertical hand movement
        const lastY = lastPinchYRef.current ?? cy;
        const dy = (lastY - cy) * SCROLL_SENS;
        if (Math.abs(dy) > 0.5) {
          const scrollEl = nearestScrollable(start.el) ?? document.scrollingElement ?? document.documentElement;
          scrollEl.scrollBy({ top: -dy, left: 0, behavior: "auto" });
        }
        lastPinchYRef.current = cy;
      } else {
        // Drag rotates graph
        const target = draggedElRef.current ?? elementUnder(cx, cy);
        synthPointer("pointermove", target, cx, cy);
      }
    } else {
      // Hover (no pinch)
      const target = elementUnder(cx, cy);
      synthPointer("pointermove", target, cx, cy);
    }
  }

  function isFist(hand: Landmark[]): boolean {
    // All four non-thumb fingers tightly folded: tip Y clearly below PIP joint
    const pairs: [number, number][] = [[8,6],[12,10],[16,14],[20,18]];
    let folded = 0;
    for (const [tip, pip] of pairs) {
      if (hand[tip].y > hand[pip].y + 0.018) folded++;
    }
    if (folded < 4) return false;
    // Hand size proxy: distance wrist to middle MCP (joint 9)
    const handSize = Math.hypot(hand[0].x - hand[9].x, hand[0].y - hand[9].y);
    if (handSize < 0.04) return false;   // hand too far / small / unreliable
    // Fingertips clustered near palm (small spread relative to hand size)
    const tips = [hand[8], hand[12], hand[16], hand[20]];
    let maxFromPalm = 0;
    for (const t of tips) {
      const d = Math.hypot(t.x - hand[9].x, t.y - hand[9].y);
      if (d > maxFromPalm) maxFromPalm = d;
    }
    if (maxFromPalm > handSize * 1.25) return false;  // fingers extended
    return true;
  }

  function nearestScrollable(el: Element | null): Element | null {
    let cur: Element | null = el;
    while (cur && cur !== document.body) {
      const cs = getComputedStyle(cur);
      const oy = cs.overflowY;
      if ((oy === "auto" || oy === "scroll") && cur.scrollHeight > cur.clientHeight) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function endPinch(performClick: boolean) {
    const start = pinchStartRef.current;
    const dragged = draggedElRef.current;
    pinchingRef.current = false;
    pinchStartRef.current = null;
    draggedElRef.current = null;
    lastPinchYRef.current = null;
    const c = cursorRef.current;
    if (!c) return;
    synthPointer("pointerup", dragged, c.x, c.y);
    if (performClick && start) {
      const dt = performance.now() - start.t;
      const dx = c.x - start.x, dy = c.y - start.y;
      const moved = Math.hypot(dx, dy);
      if (dt < CLICK_MAX_MS && moved < CLICK_MAX_MOVE) {
        // Click the element pinched ON (intent), not where finger ended up
        const target = start.el ?? elementUnder(c.x, c.y);
        if (target) {
          target.dispatchEvent(new MouseEvent("click", {
            bubbles: true, cancelable: true,
            clientX: start.x, clientY: start.y, view: window,
          }));
        }
      }
    }
  }

  function elementUnder(x: number, y: number): Element | null {
    // Hide canvas overlay momentarily not needed since canvas has pointerEvents: none
    return document.elementFromPoint(x, y);
  }

  function synthPointer(type: string, target: Element | null, x: number, y: number) {
    const dst = target ?? findGraphSvg() ?? document.body;
    if (!dst) return;
    const ev = new PointerEvent(type, {
      bubbles: true, cancelable: true,
      clientX: x, clientY: y,
      pointerType: "mouse",
      pointerId: 1,
      isPrimary: true,
      button: type === "pointerdown" || type === "pointerup" ? 0 : -1,
      buttons: type === "pointerdown" || (type === "pointermove" && pinchingRef.current) ? 1 : 0,
      view: window,
    });
    dst.dispatchEvent(ev);

    if (type === "pointermove") {
      // Mouse-equivalent events
      dst.dispatchEvent(new MouseEvent("mousemove", {
        bubbles: true, cancelable: true,
        clientX: x, clientY: y, view: window,
        buttons: pinchingRef.current ? 1 : 0,
      }));

      // Drive enter/leave via mouseover/mouseout when element changes
      if (!pinchingRef.current) {
        const prev = prevHoverElRef.current;
        if (prev !== dst) {
          if (prev) {
            prev.dispatchEvent(new MouseEvent("mouseout", {
              bubbles: true, cancelable: true,
              clientX: x, clientY: y, view: window,
              relatedTarget: dst,
            }));
          }
          dst.dispatchEvent(new MouseEvent("mouseover", {
            bubbles: true, cancelable: true,
            clientX: x, clientY: y, view: window,
            relatedTarget: prev,
          }));
          prevHoverElRef.current = dst;
        }
      }
    }
  }

  function synthWheel(x: number, y: number, deltaY: number) {
    const svg = findGraphSvg();
    if (!svg) return;
    svg.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true, cancelable: true,
      clientX: x, clientY: y,
      deltaY,
      deltaMode: 0,
      view: window,
    }));
  }

  /* ── Visualization ── */
  function handCenter(h: Landmark[]) {
    let sx = 0, sy = 0;
    for (const p of h) { sx += p.x; sy += p.y; }
    return { x: sx / h.length, y: sy / h.length };
  }

  function drawHand(ctx: CanvasRenderingContext2D, h: Landmark[], W: number, H: number) {
    const CONNECTIONS: [number, number][] = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [5,9],[9,10],[10,11],[11,12],
      [9,13],[13,14],[14,15],[15,16],
      [13,17],[17,18],[18,19],[19,20],
      [0,17],
    ];
    ctx.strokeStyle = pinchingRef.current ? "rgba(79,156,249,0.85)" : "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1.8;
    for (const [a, b] of CONNECTIONS) {
      const pa = h[a], pb = h[b];
      ctx.beginPath();
      ctx.moveTo((1 - pa.x) * W, pa.y * H);
      ctx.lineTo((1 - pb.x) * W, pb.y * H);
      ctx.stroke();
    }
    // Joints
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    for (const p of h) {
      ctx.beginPath();
      ctx.arc((1 - p.x) * W, p.y * H, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Index tip emphasized
    const tip = h[8];
    const tx = (1 - tip.x) * W, ty = tip.y * H;
    const c = pinchingRef.current ? "#4f9cf9" : "#ffffff";
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(tx, ty, pinchingRef.current ? 9 : 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `${c}aa`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tx, ty, pinchingRef.current ? 18 : 14, 0, Math.PI * 2);
    ctx.stroke();

    // Fist back-navigation progress ring (around wrist)
    const prog = fistProgressRef.current;
    if (prog > 0.05) {
      const wrist = h[0];
      const wx = (1 - wrist.x) * W, wy = wrist.y * H;
      ctx.strokeStyle = "#fb7185";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(wx, wy, 32, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(251,113,133,0.85)";
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "center";
      ctx.fillText("← BACK", wx, wy + 50);
    }
  }

  if (!active) return null;

  /* Video stays in KG stacking context (zIndex 0, behind SVG which is zIndex 1).
     Canvas + status portal to body to render above ALL page layers. */
  return (
    <>
      {/* Webcam video — background within KG */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: "scaleX(-1)",   // mirror for natural feel
          opacity: 0.12,
          zIndex: 0,
          pointerEvents: "none",
          filter: "saturate(0.5) contrast(1.05) brightness(0.8)",
        }}
      />

      {mounted && createPortal(<>
      {/* Hand visualization canvas — top layer */}
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 9998,
          pointerEvents: "none",
        }}
      />

      {/* Status badge */}
      <div style={{
        position: "fixed",
        top: 110,
        right: 24,
        zIndex: 9999,
        padding: "8px 12px",
        background: "rgba(2,4,10,0.85)",
        border: `1px solid ${
          status === "ready" ? "rgba(74,222,128,0.40)" :
          status === "loading" ? "rgba(250,204,21,0.40)" :
          status === "error" ? "rgba(248,113,113,0.45)" :
          "rgba(255,255,255,0.10)"
        }`,
        borderRadius: 5,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex", alignItems: "center", gap: 8,
        fontSize: 10, fontFamily: "monospace",
        letterSpacing: "0.10em", color: "#e4e4e7",
        pointerEvents: "auto",
        maxWidth: 320,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: status === "ready" ? "#4ade80" :
                     status === "loading" ? "#facc15" :
                     status === "error" ? "#f87171" : "#71717a",
          boxShadow: status === "ready" ? "0 0 8px #4ade80aa" : "none",
          animation: status === "loading" ? "pulse 1.2s ease-in-out infinite" : "none",
        }} />
        <span style={{ textTransform: "uppercase" as const, fontWeight: 600 }}>
          {status === "loading" && "INITIALIZING"}
          {status === "ready" && "HAND TRACKING ACTIVE"}
          {status === "error" && "ERROR"}
          {status === "idle" && "STARTING"}
        </span>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 3,
            color: "#a1a1aa",
            padding: "2px 6px",
            cursor: "pointer",
            fontSize: 10,
            fontFamily: "monospace",
            marginLeft: 4,
          }}
        >EXIT</button>
      </div>

      {/* Error / instructions */}
      {status === "error" && (
        <div style={{
          position: "fixed", top: 156, right: 24, zIndex: 9999,
          maxWidth: 320, padding: "10px 12px",
          background: "rgba(40,8,8,0.85)",
          border: "1px solid rgba(248,113,113,0.30)",
          borderRadius: 5,
          fontSize: 10, fontFamily: "monospace",
          color: "#fca5a5", lineHeight: 1.5,
          pointerEvents: "auto",
        }}>
          {errorMsg || "Could not access camera"}
        </div>
      )}
      {status === "ready" && (
        <div style={{
          position: "fixed", top: 156, right: 24, zIndex: 9999,
          maxWidth: 320, padding: "10px 12px",
          background: "rgba(2,4,10,0.75)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 5,
          fontSize: 10, fontFamily: "monospace",
          color: "#a1a1aa", lineHeight: 1.7,
          pointerEvents: "auto",
        }}>
          <div style={{ color: "#e4e4e7", marginBottom: 6, letterSpacing: "0.10em" }}>GESTURES</div>
          <div>• INDEX FINGER → cursor / hover</div>
          <div>• QUICK PINCH → click</div>
          <div>• PINCH + DRAG (on graph) → rotate sphere</div>
          <div>• PINCH + DRAG (on page) → scroll</div>
          <div>• TWO HANDS → zoom (move apart/closer)</div>
          <div>• CLOSED FIST (hold) → go back</div>
        </div>
      )}

      {/* Pulse keyframes for loading dot */}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
      </>, document.body)}
    </>
  );
}
