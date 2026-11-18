"use client";

import { useEffect, useState } from "react";

const SHOW_MS = 10_000;

/** Buenos días until two in the afternoon, buenas tardes until nine at night, buenas noches after. */
export function greetingFor(hour: number) {
  if (hour >= 6 && hour < 14) return "Buenos días";
  if (hour >= 14 && hour < 21) return "Buenas tardes";
  return "Buenas noches";
}

/** A greeting when the brain opens, by the time on this device; gone after ten seconds. */
export default function Greeting() {
  const [text, setText] = useState<{ hello: string; date: string } | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // the time is the visitor's, so it is read in the browser, not on the server
    const now = new Date();
    const date = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" }).format(now);
    setText({ hello: greetingFor(now.getHours()), date });
    const out = setTimeout(() => setLeaving(true), SHOW_MS - 600);
    const gone = setTimeout(() => setText(null), SHOW_MS);
    return () => {
      clearTimeout(out);
      clearTimeout(gone);
    };
  }, []);

  if (!text) return null;
  return (
    <div className={`greeting${leaving ? " leaving" : ""}`} role="status" aria-live="polite" onClick={() => setText(null)} title="Close">
      <p className="greeting-hello">{text.hello}</p>
      <p className="greeting-date label">{text.date}</p>
      <i className="greeting-time" style={{ animationDuration: `${SHOW_MS}ms` }} />
    </div>
  );
}
