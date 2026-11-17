"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import HandTracking from "./graph/HandTracking";
import { HUD, HexButton } from "./hud/primitives";

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
          {/* Gesture mode HUD control — hexagonal, fixed bottom-left */}
          <div style={{
            position: "fixed",
            bottom: 50, left: 28,
            zIndex: 9999,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            pointerEvents: "auto",
          }}>
            <HexButton
              active={active}
              accent={active ? HUD.cyan : HUD.violet}
              size={50}
              title={active ? "Disable gesture mode" : "Enable gesture mode"}
              onClick={() => setActive((v) => !v)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11V5.5a1.5 1.5 0 1 1 3 0V11" />
                <path d="M12 11V4.5a1.5 1.5 0 1 1 3 0V11" />
                <path d="M15 11V6.5a1.5 1.5 0 1 1 3 0V13" />
                <path d="M9 11V8.5a1.5 1.5 0 1 0-3 0v6.2c0 2.7 2 5.3 5 6.3 1.5.5 3 .5 4.5 0 2.4-.8 4.5-3 4.5-6.3V11" />
              </svg>
            </HexButton>
            <span style={{
              fontSize: 7.5,
              fontFamily: HUD.font,
              letterSpacing: "0.22em",
              fontWeight: 700,
              color: active ? HUD.cyan : HUD.textMuted,
              textShadow: active ? `0 0 10px ${HUD.cyan}88` : "0 1px 3px rgba(0,0,0,0.85)",
              transition: "color 0.22s",
              pointerEvents: "none",
            }}>
              {active ? "GESTURE · ON" : "GESTURE"}
            </span>
          </div>

          <HandTracking active={active} onClose={() => setActive(false)} />
        </>,
        document.body
      )}
    </HandTrackingCtx.Provider>
  );
}
