"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import HandTracking from "./graph/HandTracking";

interface Ctx {
  active: boolean;
  setActive: (v: boolean | ((p: boolean) => boolean)) => void;
}

const HandTrackingCtx = createContext<Ctx>({ active: false, setActive: () => {} });

export function useHandTracking() { return useContext(HandTrackingCtx); }

export default function HandTrackingProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <HandTrackingCtx.Provider value={{ active, setActive }}>
      {children}

      {mounted && createPortal(
        <>
          {/* Hand-tracking toggle button — global, always visible */}
          <button
            onClick={() => setActive((v) => !v)}
            title={active ? "Disable hand tracking" : "Enable hand tracking"}
            style={{
              position: "fixed",
              bottom: 108,
              left: 24,
              zIndex: 9999,
              width: 38,
              height: 38,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: active ? "rgba(79,156,249,0.18)" : "rgba(2,4,10,0.85)",
              border: active ? "1px solid rgba(79,156,249,0.55)" : "1px solid rgba(255,255,255,0.10)",
              borderRadius: 5,
              color: active ? "#4f9cf9" : "#a1a1aa",
              cursor: "pointer",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              transition: "all 0.15s",
              boxShadow: active
                ? "0 0 0 1px rgba(79,156,249,0.30), 0 0 22px rgba(79,156,249,0.30), 0 8px 24px rgba(0,0,0,0.6)"
                : "0 0 0 1px rgba(255,255,255,0.02), 0 8px 24px rgba(0,0,0,0.6)",
            }}
            onMouseEnter={(e) => {
              if (active) return;
              e.currentTarget.style.borderColor = "rgba(79,156,249,0.45)";
              e.currentTarget.style.color = "#fff";
              e.currentTarget.style.background = "rgba(79,156,249,0.10)";
              e.currentTarget.style.boxShadow = "0 0 0 1px rgba(79,156,249,0.20), 0 0 18px rgba(79,156,249,0.18), 0 8px 24px rgba(0,0,0,0.6)";
            }}
            onMouseLeave={(e) => {
              if (active) return;
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
              e.currentTarget.style.color = "#a1a1aa";
              e.currentTarget.style.background = "rgba(2,4,10,0.85)";
              e.currentTarget.style.boxShadow = "0 0 0 1px rgba(255,255,255,0.02), 0 8px 24px rgba(0,0,0,0.6)";
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11V5.5a1.5 1.5 0 1 1 3 0V11" />
              <path d="M12 11V4.5a1.5 1.5 0 1 1 3 0V11" />
              <path d="M15 11V6.5a1.5 1.5 0 1 1 3 0V13" />
              <path d="M9 11V8.5a1.5 1.5 0 1 0-3 0v6.2c0 2.7 2 5.3 5 6.3 1.5.5 3 .5 4.5 0 2.4-.8 4.5-3 4.5-6.3V11" />
            </svg>
          </button>

          {/* Hand tracking overlay (mounts video + portal'd canvas/status) */}
          <HandTracking active={active} onClose={() => setActive(false)} />
        </>,
        document.body
      )}
    </HandTrackingCtx.Provider>
  );
}
