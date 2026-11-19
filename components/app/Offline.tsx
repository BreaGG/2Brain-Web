"use client";

import { useEffect, useState } from "react";

const COPY_AT = "2brain.copyAt";

/** Keep a copy of the brain on this device (production only), and say so when there is no connection. */
export default function Offline() {
  const [offline, setOffline] = useState(false);
  const [copyAt, setCopyAt] = useState<number | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
        /* offline reading is a bonus; the site works without it */
      });
    }
    const update = () => {
      const off = !navigator.onLine;
      setOffline(off);
      try {
        // a page opened online is the copy the device keeps; remember when that was
        if (!off) localStorage.setItem(COPY_AT, String(Date.now()));
        setCopyAt(Number(localStorage.getItem(COPY_AT)) || null);
      } catch {
        /* no storage: the notice just leaves out the date */
      }
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;
  const when = copyAt
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(copyAt))
    : null;
  return (
    <div className="offline-chip" role="status" title="Reading the copy kept on this device. Asking, importing and saving come back with a connection.">
      <i />
      Offline{when ? ` · the brain as of ${when}` : ""}
    </div>
  );
}
