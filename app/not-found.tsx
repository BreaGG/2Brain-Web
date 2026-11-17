import Link from "next/link";
import { Wordmark } from "@/components/ui";

export default function NotFound() {
  return (
    <main style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", padding: "28px 32px", background: "var(--bg)" }}>
      <Link href="/" aria-label="2brain, back to the brain">
        <Wordmark big />
      </Link>
      <div style={{ margin: "auto 0", maxWidth: 760 }}>
        <p className="label" style={{ marginBottom: 18 }}>404 · Not in your record</p>
        <h1 style={{ fontSize: "clamp(56px, 11vw, 132px)", lineHeight: 0.92, fontWeight: 700, letterSpacing: "-0.045em" }}>
          Nothing here.
        </h1>
        <p style={{ fontSize: 20, lineHeight: 1.4, marginTop: 26, maxWidth: 520 }}>
          This page was linked to, but it has not been written yet. Every note you write appears in the brain.
        </p>
        <i className="dash spectrum" style={{ width: 200, height: 1, marginTop: 36 }} />
        <Link href="/" className="btn" style={{ marginTop: 32 }}>
          Back to the brain →
        </Link>
      </div>
    </main>
  );
}
