"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { SPECTRUM } from "@/lib/palettes";

const SHOW_MS = 4_000;
const NAME = "Alejandro";

/** Good morning until noon, good afternoon until six in the evening, good evening after. */
export function greetingFor(hour: number) {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

/** A greeting when the brain opens, by the time on this device; gone after four seconds. */
export default function Greeting() {
  const [text, setText] = useState<{ hello: string; date: string } | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // the time is the visitor's, so it is read in the browser, not on the server
    const now = new Date();
    const date = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(now);
    setText({ hello: `${greetingFor(now.getHours())}, ${NAME}`, date });
    const out = setTimeout(() => setLeaving(true), SHOW_MS - 600);
    const gone = setTimeout(() => setText(null), SHOW_MS);
    return () => {
      clearTimeout(out);
      clearTimeout(gone);
    };
  }, []);

  if (!text) return null;
  return (
    <div className={`greeting${leaving ? " leaving" : ""}`} role="status" aria-live="polite">
      {/* each letter gathers out of a coloured point, as the notes do in the brain, and scatters again on the way out */}
      <p className="greeting-hello" aria-label={text.hello}>
        {[...text.hello].map((ch, i) => (
          <span key={i} aria-hidden style={{ "--i": i, "--c": SPECTRUM[i % SPECTRUM.length] } as CSSProperties}>
            {ch === " " ? "\u00a0" : ch}
          </span>
        ))}
      </p>
      <p className="greeting-date label">{text.date}</p>
      <i className="greeting-time" style={{ animationDuration: `0.5s, ${SHOW_MS - 1400}ms` }} />
    </div>
  );
}
