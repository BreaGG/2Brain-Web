/* ───────────────────────────────────────────────────────────────────────────
 * Save a picture of the brain: the scene rendered at high resolution, on the
 * theme's ground, with the labels that are showing and a small caption.
 * ─────────────────────────────────────────────────────────────────────────── */

export const CAPTURE_EVENT = "2brain:capture";
export type CaptureDetail = { done: (r: { ok: boolean; how?: "shared" | "saved" }) => void };

/** Ask the brain on the page for a picture; resolves once it is saved or shared. */
export function requestCapture() {
  return new Promise<{ ok: boolean; how?: "shared" | "saved" }>((done) => {
    window.dispatchEvent(new CustomEvent<CaptureDetail>(CAPTURE_EVENT, { detail: { done } }));
  });
}

/** Lay the WebGL frame on its ground, draw the labels over it and a caption in the corner. */
export function composePicture(gl: HTMLCanvasElement, host: HTMLElement, labels: HTMLElement, caption: string): HTMLCanvasElement {
  const r = host.getBoundingClientRect();
  const k = gl.width / Math.max(1, r.width);
  const out = document.createElement("canvas");
  out.width = gl.width;
  out.height = gl.height;
  const ctx = out.getContext("2d")!;
  const css = getComputedStyle(document.documentElement);
  const bg = css.getPropertyValue("--bg").trim() || "#000";
  const app = host.closest<HTMLElement>(".app");
  const ground = Number((app && getComputedStyle(app).getPropertyValue("--ground")) || 0.35);

  // the ground: the theme's colour with the soft glow the stage draws behind the body
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, out.width, out.height);
  const rw = out.width * 0.6;
  const rh = out.height * 0.46;
  ctx.save();
  ctx.translate(out.width / 2, out.height * 0.62);
  ctx.scale(1, rh / rw);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rw);
  g.addColorStop(0, `rgba(255,255,255,${ground * 0.06})`);
  g.addColorStop(0.7, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(-rw, -rw, rw * 2, rw * 2);
  ctx.restore();

  ctx.drawImage(gl, 0, 0);

  // the labels that are showing, where they are on screen
  ctx.textBaseline = "top";
  for (const el of Array.from(labels.querySelectorAll<HTMLElement>(".brain-label"))) {
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) < 0.05 || !el.textContent) continue;
    const b = el.getBoundingClientRect();
    if (b.right < r.left || b.left > r.right || b.bottom < r.top || b.top > r.bottom) continue;
    const x = (b.left - r.left) * k;
    const y = (b.top - r.top) * k;
    const size = parseFloat(st.fontSize) || 11;
    ctx.globalAlpha = Number(st.opacity) || 1;
    ctx.font = `${st.fontWeight} ${size * k}px ${st.fontFamily}`;
    if (st.borderTopStyle !== "none" && parseFloat(st.borderTopWidth) > 0) {
      ctx.fillStyle = st.backgroundColor;
      ctx.fillRect(x, y, b.width * k, b.height * k);
      ctx.strokeStyle = st.borderTopColor;
      ctx.lineWidth = Math.max(1, k);
      ctx.strokeRect(x, y, b.width * k, b.height * k);
    } else {
      // the short tick that leads into a label, when the label has one on screen
      const tick = getComputedStyle(el, "::before");
      if (tick.content !== "none" && tick.display !== "none" && parseFloat(tick.width) > 0 && Number(tick.opacity) > 0) {
        ctx.fillStyle = tick.backgroundColor || st.color;
        ctx.globalAlpha *= Number(tick.opacity) || 0.6;
        ctx.fillRect(x + parseFloat(tick.left || "-10") * k, y + parseFloat(tick.top || "7") * k, parseFloat(tick.width) * k, Math.max(1, parseFloat(tick.height) * k));
        ctx.globalAlpha = Number(st.opacity) || 1;
      }
    }
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 8 * k;
    ctx.fillStyle = st.color;
    ctx.fillText(el.textContent, x + (parseFloat(st.paddingLeft) || 0) * k, y + (parseFloat(st.paddingTop) || 0) * k);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;

  // caption
  ctx.font = `500 ${11 * k}px ui-monospace, "IBM Plex Mono", monospace`;
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(caption.toUpperCase(), 18 * k, out.height - 18 * k);
  return out;
}

/** Share the picture where the device can (phones), otherwise download it. */
export async function deliverPicture(canvas: HTMLCanvasElement, name: string): Promise<"shared" | "saved"> {
  const blob = await new Promise<Blob>((ok, bad) => canvas.toBlob((b) => (b ? ok(b) : bad(new Error("no image"))), "image/png"));
  const file = new File([blob], name, { type: "image/png" });
  const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  if (touch && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "2brain" });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "shared";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "saved";
}
