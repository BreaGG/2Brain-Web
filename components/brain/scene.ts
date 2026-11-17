import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Anatomy, Grouped } from "./anatomy";
import { KIND_DUST, KIND_MATTER, KIND_NERVE, KIND_SPINE, KIND_STEM, FIG } from "./anatomy";

/* ───────────────────────────────────────────────────────────────────────────
 * Imperative three.js scene for the brain. React owns state; this class only
 * draws it. All points use additive, premultiplied blending on a transparent
 * canvas so the page background (theme + ground glow) shows through.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface SceneCallbacks {
  onHover: (note: number | null, x: number, y: number) => void;
  onPick: (note: number | null) => void;
  onClear: () => void;
}

export interface SceneView {
  form: number;
  split: boolean;
  turning: boolean;
  speed: number;
  links: boolean;
  outline: boolean;
  outlineOpacity: number;
  pointSize: number;
  notes: boolean;
  record: boolean;
  ghosts: boolean;
}

export interface SceneLabel {
  text: string;
  note?: number;
  group?: number;
  strong?: boolean;
}

const POINT_VS = /* glsl */ `
  attribute vec3 aLayout;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aOrder;
  attribute float aLit;
  attribute float aVis;
  uniform float uForm;
  uniform float uReveal;
  uniform float uPx;
  uniform float uScale;
  uniform float uHasLit;
  uniform float uDim;
  uniform float uFade;
  uniform float uTime;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = mix(position, aLayout, uForm);
    p.x += sin(uTime * 0.6 + aOrder * 61.0) * 0.006;
    p.y += cos(uTime * 0.5 + aOrder * 47.0) * 0.006;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float rev = smoothstep(aOrder - 0.03, aOrder, uReveal);
    float lit = mix(1.0, mix(uDim, 1.0, aLit), uHasLit);
    float fade = mix(1.0, mix(smoothstep(${(FIG.bottom).toFixed(2)}, ${(FIG.bottom + 1.6).toFixed(2)}, position.y), 1.0, uForm), uFade);
    vAlpha = rev * lit * aVis * fade;
    float sz = aSize * uScale * (1.0 + 0.8 * aLit * uHasLit);
    gl_PointSize = max(1.0, sz * uPx * 18.0 / -mv.z);
    vColor = aColor;
  }
`;

const POINT_FS = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float glow = (1.0 - d);
    float a = glow * glow * 0.55 + smoothstep(0.6, 0.0, d) * 0.55;
    a *= vAlpha;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

const LINE_VS = /* glsl */ `
  attribute vec3 color;
  varying vec3 vC;
  void main() {
    vC = color;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const LINE_FS = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vC;
  void main() {
    gl_FragColor = vec4(vC * uOpacity, uOpacity * 0.6);
  }
`;

const RING_FS = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(0.78, 0.86, d) * (1.0 - smoothstep(0.9, 1.0, d));
    a += smoothstep(0.32, 0.0, d) * 0.9;
    gl_FragColor = vec4(uColor * a * uAlpha, a * uAlpha);
  }
`;

const RING_VS = /* glsl */ `
  uniform float uPx;
  uniform float uSize;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPx;
  }
`;

function additive(mat: THREE.ShaderMaterial) {
  mat.transparent = true;
  mat.depthWrite = false;
  mat.depthTest = false;
  mat.blending = THREE.CustomBlending;
  mat.blendEquation = THREE.AddEquation;
  mat.blendSrc = THREE.OneFactor;
  mat.blendDst = THREE.OneFactor;
  mat.blendSrcAlpha = THREE.OneFactor;
  mat.blendDstAlpha = THREE.OneFactor;
  return mat;
}

function pointsMaterial(fade: number) {
  return additive(
    new THREE.ShaderMaterial({
      vertexShader: POINT_VS,
      fragmentShader: POINT_FS,
      uniforms: {
        uForm: { value: 0 },
        uReveal: { value: 0 },
        uPx: { value: 1 },
        uScale: { value: 1 },
        uHasLit: { value: 0 },
        uDim: { value: 0.12 },
        uFade: { value: fade },
        uTime: { value: 0 },
      },
    }),
  );
}

const ease = (cur: number, target: number, dt: number, rate = 4) => {
  const d = target - cur;
  if (Math.abs(d) < 0.0005) return target;
  return cur + d * Math.min(1, dt * rate);
};

export class BrainScene {
  private host: HTMLElement;
  private labelHost: HTMLElement;
  private cb: SceneCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  private controls: OrbitControls;
  private root = new THREE.Group();
  private raf = 0;
  private timer = new THREE.Timer();
  private ro: ResizeObserver;
  private disposed = false;

  private anat: Anatomy | null = null;
  private grouped: Grouped | null = null;
  private groupOf: Int32Array = new Int32Array(0);
  private groupCount = 0;

  private notes?: THREE.Points;
  private notesGeo?: THREE.BufferGeometry;
  private notesMat = pointsMaterial(0);
  private notePosCur = new Float32Array(0);
  private noteVis = new Float32Array(0);

  private rec?: THREE.Points;
  private recGeo?: THREE.BufferGeometry;
  private recMat = pointsMaterial(1);

  private outline?: THREE.Points;
  private outlineMat = pointsMaterial(0);

  private linesGeo?: THREE.BufferGeometry;
  private lines?: THREE.LineSegments;
  private linesMat = additive(
    new THREE.ShaderMaterial({ vertexShader: LINE_VS, fragmentShader: LINE_FS, uniforms: { uOpacity: { value: 0.3 } } }),
  );
  private linkPairs: [number, number][] = [];

  private ghostGeo?: THREE.BufferGeometry;
  private ghostPts?: THREE.Points;
  private ghostLines?: THREE.LineSegments;
  private ghostLineGeo?: THREE.BufferGeometry;
  private ghostMat = pointsMaterial(0);
  private ghostLineMat = additive(
    new THREE.ShaderMaterial({ vertexShader: LINE_VS, fragmentShader: LINE_FS, uniforms: { uOpacity: { value: 0.18 } } }),
  );
  private ghostFrom: number[][] = [];

  private ring: THREE.Points;
  private ringMat = additive(
    new THREE.ShaderMaterial({
      vertexShader: RING_VS,
      fragmentShader: RING_FS,
      uniforms: { uPx: { value: 1 }, uSize: { value: 26 }, uColor: { value: new THREE.Color(1, 1, 1) }, uAlpha: { value: 0 } },
    }),
  );
  private ringTarget: number | null = null;
  private hovered: number | null = null;
  private selected: number | null = null;

  private view: SceneView = {
    form: 0,
    split: false,
    turning: true,
    speed: 100,
    links: true,
    outline: true,
    outlineOpacity: 100,
    pointSize: 100,
    notes: true,
    record: true,
    ghosts: false,
  };
  private formCur = 0;
  private splitCur = 0;
  private revealCur = 0;
  private hasLitCur = 0;
  private hasLitTarget = 0;
  private notesDirty = true;
  private noteRgb = new Float32Array(0);
  private noteLit: Uint8Array | null = null;

  private labels: SceneLabel[] = [];
  private labelEls: HTMLDivElement[] = [];
  private groupCentroid: Float32Array = new Float32Array(0);

  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private pointer: { x: number; y: number; inside: boolean } = { x: 0, y: 0, inside: false };
  private down: { x: number; y: number; t: number } | null = null;
  private userTurning = false;
  private fitDist = 18;
  private reduced = false;

  constructor(host: HTMLElement, labelHost: HTMLElement, cb: SceneCallbacks) {
    this.host = host;
    this.labelHost = labelHost;
    this.cb = cb;
    this.reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.domElement.className = "brain-gl";
    host.appendChild(this.renderer.domElement);

    this.scene.add(this.root);
    this.camera.position.set(0, -0.4, 18);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.8;
    this.controls.minDistance = 2.5;
    this.controls.maxDistance = 42;
    this.controls.target.set(0, -0.45, 0);
    this.controls.addEventListener("start", () => (this.userTurning = true));
    this.controls.addEventListener("end", () => (this.userTurning = false));

    const ringGeo = new THREE.BufferGeometry();
    ringGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
    this.ring = new THREE.Points(ringGeo, this.ringMat);
    this.ring.frustumCulled = false;
    this.root.add(this.ring);

    const el = this.renderer.domElement;
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointerleave", this.onLeave);
    el.addEventListener("dblclick", this.onDbl);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.loop();
  }

  /* ── data ─────────────────────────────────────────────────────────────── */

  setAnatomy(anat: Anatomy, links: [number, number][], ghosts: { slug: string; from: number[] }[]) {
    this.anat = anat;
    this.linkPairs = links;
    const n = anat.n;

    // notes
    this.notesGeo?.dispose();
    this.notePosCur = new Float32Array(anat.notePos);
    this.noteVis = new Float32Array(n).fill(1);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.notePosCur, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aLayout", g.getAttribute("position"));
    g.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    const sizes = new Float32Array(n);
    const orders = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      sizes[i] = 4.2;
      orders[i] = 0.002 + (i / Math.max(1, n)) * 0.04;
    }
    g.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    g.setAttribute("aOrder", new THREE.BufferAttribute(orders, 1));
    g.setAttribute("aLit", new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute("aVis", new THREE.BufferAttribute(this.noteVis, 1));
    g.computeBoundingSphere();
    this.notesGeo = g;
    if (this.notes) this.root.remove(this.notes);
    this.notes = new THREE.Points(g, this.notesMat);
    this.notes.frustumCulled = false;
    this.notes.renderOrder = 3;
    this.root.add(this.notes);
    this.notesMat.uniforms.uDim.value = 0.16;

    // record
    this.recGeo?.dispose();
    const P = anat.recCount;
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.BufferAttribute(anat.recPos, 3));
    rg.setAttribute("aLayout", new THREE.BufferAttribute(new Float32Array(anat.recPos), 3));
    rg.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(P * 3), 3));
    const rs = new Float32Array(P);
    for (let k = 0; k < P; k++) {
      const kind = anat.recKind[k];
      rs[k] = kind === KIND_SPINE ? 2.0 : kind === KIND_NERVE ? 1.9 : kind === KIND_STEM ? 2.0 : kind === KIND_MATTER ? 2.1 : 1.75;
    }
    rg.setAttribute("aSize", new THREE.BufferAttribute(rs, 1));
    rg.setAttribute("aOrder", new THREE.BufferAttribute(new Float32Array(anat.recOrder).map((o) => 0.06 + o * 0.94), 1));
    rg.setAttribute("aLit", new THREE.BufferAttribute(new Float32Array(P), 1));
    rg.setAttribute("aVis", new THREE.BufferAttribute(new Float32Array(P).fill(1), 1));
    rg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -1, 0), 12);
    this.recGeo = rg;
    if (this.rec) this.root.remove(this.rec);
    this.rec = new THREE.Points(rg, this.recMat);
    this.rec.frustumCulled = false;
    this.rec.renderOrder = 1;
    this.root.add(this.rec);
    this.recMat.uniforms.uDim.value = 0.07;

    // outline
    const O = anat.outline.length / 3;
    const og = new THREE.BufferGeometry();
    og.setAttribute("position", new THREE.BufferAttribute(anat.outline, 3));
    og.setAttribute("aLayout", og.getAttribute("position"));
    const oc = new Float32Array(O * 3).fill(0.42);
    og.setAttribute("aColor", new THREE.BufferAttribute(oc, 3));
    og.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(O).fill(1.4), 1));
    og.setAttribute("aOrder", new THREE.BufferAttribute(new Float32Array(O).fill(0.01), 1));
    og.setAttribute("aLit", new THREE.BufferAttribute(new Float32Array(O), 1));
    og.setAttribute("aVis", new THREE.BufferAttribute(new Float32Array(O).fill(1), 1));
    if (this.outline) {
      this.outline.geometry.dispose();
      this.root.remove(this.outline);
    }
    this.outline = new THREE.Points(og, this.outlineMat);
    this.outline.frustumCulled = false;
    this.root.add(this.outline);
    this.outlineMat.uniforms.uHasLit.value = 0;

    // links
    this.linesGeo?.dispose();
    const L = links.length;
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(L * 6), 3).setUsage(THREE.DynamicDrawUsage));
    lg.setAttribute("color", new THREE.BufferAttribute(new Float32Array(L * 6), 3));
    this.linesGeo = lg;
    if (this.lines) this.root.remove(this.lines);
    this.lines = new THREE.LineSegments(lg, this.linesMat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 2;
    this.root.add(this.lines);

    // ghosts
    this.ghostFrom = ghosts.map((g) => g.from);
    const Gh = ghosts.length;
    const gg = new THREE.BufferGeometry();
    gg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(Gh * 3), 3).setUsage(THREE.DynamicDrawUsage));
    gg.setAttribute("aLayout", gg.getAttribute("position"));
    gg.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(Gh * 3).fill(0.55), 3));
    gg.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(Gh).fill(2.1), 1));
    gg.setAttribute("aOrder", new THREE.BufferAttribute(new Float32Array(Gh).fill(0.05), 1));
    gg.setAttribute("aLit", new THREE.BufferAttribute(new Float32Array(Gh), 1));
    gg.setAttribute("aVis", new THREE.BufferAttribute(new Float32Array(Gh).fill(1), 1));
    this.ghostGeo?.dispose();
    this.ghostGeo = gg;
    if (this.ghostPts) this.root.remove(this.ghostPts);
    this.ghostPts = new THREE.Points(gg, this.ghostMat);
    this.ghostPts.frustumCulled = false;
    this.root.add(this.ghostPts);
    const gl = ghosts.reduce((s, g) => s + g.from.length, 0);
    const glg = new THREE.BufferGeometry();
    glg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(gl * 6), 3).setUsage(THREE.DynamicDrawUsage));
    glg.setAttribute("color", new THREE.BufferAttribute(new Float32Array(gl * 6).fill(0.5), 3));
    this.ghostLineGeo?.dispose();
    this.ghostLineGeo = glg;
    if (this.ghostLines) this.root.remove(this.ghostLines);
    this.ghostLines = new THREE.LineSegments(glg, this.ghostLineMat);
    this.ghostLines.frustumCulled = false;
    this.root.add(this.ghostLines);

    this.revealCur = this.reduced ? 1.2 : 0;
    this.notesDirty = true;
    this.applyVisibility();
  }

  setGrouped(grouped: Grouped, groupOf: Int32Array, groupCount: number) {
    this.grouped = grouped;
    this.groupOf = groupOf;
    this.groupCount = groupCount;
    this.groupCentroid = new Float32Array(groupCount * 4);
    if (this.recGeo) {
      const a = this.recGeo.getAttribute("aLayout") as THREE.BufferAttribute;
      (a.array as Float32Array).set(grouped.recLayout);
      a.needsUpdate = true;
    }
    this.notesDirty = true;
  }

  /** groupRgb: per group colour; mono=true when palette is greyscale. */
  setColors(groupRgb: [number, number, number][]) {
    const anat = this.anat;
    if (!anat || !this.notesGeo || !this.recGeo || !this.linesGeo) return;
    const n = anat.n;
    this.noteRgb = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const c = groupRgb[this.groupOf[i]] ?? [1, 1, 1];
      this.noteRgb[i * 3] = c[0];
      this.noteRgb[i * 3 + 1] = c[1];
      this.noteRgb[i * 3 + 2] = c[2];
    }
    const nc = this.notesGeo.getAttribute("aColor") as THREE.BufferAttribute;
    (nc.array as Float32Array).set(this.noteRgb);
    nc.needsUpdate = true;

    const rc = this.recGeo.getAttribute("aColor") as THREE.BufferAttribute;
    const arr = rc.array as Float32Array;
    for (let k = 0; k < anat.recCount; k++) {
      const c = groupRgb[this.groupOf[anat.recNote[k]]] ?? [1, 1, 1];
      const kind = anat.recKind[k];
      let white = 0;
      let gain = 0.42;
      if (kind === KIND_SPINE) {
        white = 0.72;
        gain = 1.0;
      } else if (kind === KIND_STEM) {
        white = 0.55;
        gain = 0.95;
      } else if (kind === KIND_NERVE) {
        white = 0.55;
        gain = 0.92;
      } else if (kind === KIND_DUST) {
        white = 0.12;
        gain = 0.5;
      } else if (kind === KIND_MATTER) {
        white = 0.2;
        gain = 0.95;
      }
      arr[k * 3] = (c[0] + (1 - c[0]) * white) * gain;
      arr[k * 3 + 1] = (c[1] + (1 - c[1]) * white) * gain;
      arr[k * 3 + 2] = (c[2] + (1 - c[2]) * white) * gain;
    }
    rc.needsUpdate = true;
    this.updateLinkColors();
  }

  setLit(noteLit: Uint8Array | null, recLitByNote: Uint8Array | null) {
    const anat = this.anat;
    if (!anat || !this.notesGeo || !this.recGeo) return;
    this.noteLit = noteLit;
    this.hasLitTarget = noteLit ? 1 : 0;
    const nl = this.notesGeo.getAttribute("aLit") as THREE.BufferAttribute;
    const na = nl.array as Float32Array;
    for (let i = 0; i < anat.n; i++) na[i] = noteLit ? Math.min(1, noteLit[i]) : 0;
    nl.needsUpdate = true;
    const rl = this.recGeo.getAttribute("aLit") as THREE.BufferAttribute;
    const ra = rl.array as Float32Array;
    const src = recLitByNote ?? noteLit;
    for (let k = 0; k < anat.recCount; k++) ra[k] = src ? Math.min(1, src[anat.recNote[k]]) : 0;
    rl.needsUpdate = true;
    this.updateLinkColors();
  }

  setHidden(hidden: Uint8Array) {
    const anat = this.anat;
    if (!anat || !this.notesGeo || !this.recGeo) return;
    for (let i = 0; i < anat.n; i++) this.noteVis[i] = hidden[i] ? 0 : 1;
    (this.notesGeo.getAttribute("aVis") as THREE.BufferAttribute).needsUpdate = true;
    const rv = this.recGeo.getAttribute("aVis") as THREE.BufferAttribute;
    const ra = rv.array as Float32Array;
    for (let k = 0; k < anat.recCount; k++) ra[k] = hidden[anat.recNote[k]] ? 0 : 1;
    rv.needsUpdate = true;
    this.notesDirty = true;
    this.updateLinkColors();
  }

  setView(v: SceneView) {
    this.view = v;
    this.applyVisibility();
  }

  setLabels(labels: SceneLabel[], size: "auto" | "small" | "large") {
    this.labels = labels;
    this.labelHost.dataset.size = size;
    while (this.labelEls.length < labels.length) {
      const d = document.createElement("div");
      d.className = "brain-label";
      this.labelHost.appendChild(d);
      this.labelEls.push(d);
    }
    this.labelEls.forEach((el, i) => {
      const l = labels[i];
      if (!l) {
        el.style.display = "none";
        return;
      }
      el.textContent = l.text;
      el.classList.toggle("strong", !!l.strong);
      el.style.display = "";
    });
  }

  setSelected(i: number | null) {
    this.selected = i;
  }

  /** Smoothly bring a note to the centre of the view. */
  focusNote(i: number) {
    if (!this.anat) return;
    this.flyTo = { note: i, dist: Math.max(5.5, this.fitDist * 0.42) };
  }

  /** Smoothly return to the whole figure. */
  home() {
    this.flyTo = { note: null, dist: this.fitDist };
  }
  private flyTo: { note: number | null; dist: number } | null = null;

  resetCamera() {
    this.flyTo = null;
    this.camera.position.set(0, -0.4, this.fitDist);
    this.controls.target.set(0, -0.45 + (-1.25 + 0.45) * this.formCur, 0);
    this.root.rotation.set(0, 0, 0);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointerup", this.onUp);
    el.removeEventListener("pointerleave", this.onLeave);
    el.removeEventListener("dblclick", this.onDbl);
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
    [this.notesMat, this.recMat, this.outlineMat, this.linesMat, this.ghostMat, this.ghostLineMat, this.ringMat].forEach((m) => m.dispose());
    this.renderer.dispose();
    el.remove();
    this.labelEls.forEach((e) => e.remove());
  }

  /* ── internals ───────────────────────────────────────────────────────── */

  private applyVisibility() {
    const v = this.view;
    if (this.notes) this.notes.visible = v.notes;
    if (this.rec) this.rec.visible = v.record;
    if (this.lines) this.lines.visible = v.links && v.notes;
    if (this.outline) this.outline.visible = v.outline;
    if (this.ghostPts) this.ghostPts.visible = v.ghosts && v.notes;
    if (this.ghostLines) this.ghostLines.visible = v.ghosts && v.notes && v.links;
    const s = v.pointSize / 100;
    this.notesMat.uniforms.uScale.value = s;
    this.recMat.uniforms.uScale.value = s;
    this.ghostMat.uniforms.uScale.value = s;
    this.outlineMat.uniforms.uScale.value = s;
  }

  private updateLinkColors() {
    const anat = this.anat;
    if (!anat || !this.linesGeo || !this.noteRgb.length) return;
    const col = this.linesGeo.getAttribute("color") as THREE.BufferAttribute;
    const a = col.array as Float32Array;
    const lit = this.noteLit;
    this.linkPairs.forEach(([s, t], j) => {
      let k = 1;
      if (lit) k = lit[s] && lit[t] ? 1.6 : 0.08;
      if (!this.noteVis[s] || !this.noteVis[t]) k = 0;
      for (let e = 0; e < 2; e++) {
        const ni = e ? t : s;
        a[j * 6 + e * 3] = this.noteRgb[ni * 3] * k;
        a[j * 6 + e * 3 + 1] = this.noteRgb[ni * 3 + 1] * k;
        a[j * 6 + e * 3 + 2] = this.noteRgb[ni * 3 + 2] * k;
      }
    });
    col.needsUpdate = true;
  }

  private updateNotePositions() {
    const anat = this.anat;
    const gr = this.grouped;
    if (!anat || !gr || !this.notesGeo || !this.linesGeo) return;
    const f = this.formCur;
    const s = this.splitCur;
    const P = this.notePosCur;
    for (let i = 0; i < anat.n * 3; i++) {
      const a = anat.notePos[i] + (gr.noteLobe[i] - anat.notePos[i]) * s;
      P[i] = a + (gr.noteLayout[i] - a) * f;
    }
    (this.notesGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    this.notesGeo.computeBoundingSphere();

    const lp = this.linesGeo.getAttribute("position") as THREE.BufferAttribute;
    const la = lp.array as Float32Array;
    this.linkPairs.forEach(([a, b], j) => {
      la[j * 6] = P[a * 3];
      la[j * 6 + 1] = P[a * 3 + 1];
      la[j * 6 + 2] = P[a * 3 + 2];
      la[j * 6 + 3] = P[b * 3];
      la[j * 6 + 4] = P[b * 3 + 1];
      la[j * 6 + 5] = P[b * 3 + 2];
    });
    lp.needsUpdate = true;

    // ghosts sit just outside the notes that point at them
    if (this.ghostGeo && this.ghostLineGeo) {
      const gp = this.ghostGeo.getAttribute("position") as THREE.BufferAttribute;
      const ga = gp.array as Float32Array;
      const glp = this.ghostLineGeo.getAttribute("position") as THREE.BufferAttribute;
      const gla = glp.array as Float32Array;
      let li = 0;
      this.ghostFrom.forEach((from, g) => {
        let x = 0;
        let y = 0;
        let z = 0;
        for (const i of from) {
          x += P[i * 3];
          y += P[i * 3 + 1];
          z += P[i * 3 + 2];
        }
        x /= from.length;
        y /= from.length;
        z /= from.length;
        const cy = 3.72 * (1 - f) + y * f;
        const dx = x;
        const dy = y - cy;
        const dz = z;
        const len = Math.hypot(dx, dy, dz) || 1;
        const push = 0.35 + (g % 5) * 0.05;
        ga[g * 3] = x + (dx / len) * push;
        ga[g * 3 + 1] = y + (dy / len) * push;
        ga[g * 3 + 2] = z + (dz / len) * push;
        for (const i of from) {
          gla[li++] = P[i * 3];
          gla[li++] = P[i * 3 + 1];
          gla[li++] = P[i * 3 + 2];
          gla[li++] = ga[g * 3];
          gla[li++] = ga[g * 3 + 1];
          gla[li++] = ga[g * 3 + 2];
        }
      });
      gp.needsUpdate = true;
      glp.needsUpdate = true;
    }

    // group centroids for labels
    const G = this.groupCount;
    const c = this.groupCentroid;
    c.fill(0);
    for (let i = 0; i < anat.n; i++) {
      if (!this.noteVis[i]) continue;
      const g = this.groupOf[i];
      if (g >= G) continue;
      c[g * 4] += P[i * 3];
      c[g * 4 + 1] += P[i * 3 + 1];
      c[g * 4 + 2] += P[i * 3 + 2];
      c[g * 4 + 3] += 1;
    }
    for (let g = 0; g < G; g++) {
      const k = c[g * 4 + 3] || 1;
      c[g * 4] /= k;
      c[g * 4 + 1] /= k;
      c[g * 4 + 2] /= k;
    }
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const distH = 10.6 / 2 / t;
    const distW = 6.2 / 2 / t / this.camera.aspect;
    const prev = this.fitDist;
    this.fitDist = Math.max(distH, distW);
    // keep the viewing direction and relative zoom, rescaled to the new fit
    const off = this.camera.position.clone().sub(this.controls.target);
    off.multiplyScalar(this.fitDist / prev);
    this.camera.position.copy(this.controls.target).add(off);
    this.camera.updateProjectionMatrix();
    const px = this.renderer.getPixelRatio();
    for (const m of [this.notesMat, this.recMat, this.outlineMat, this.ghostMat, this.ringMat]) m.uniforms.uPx.value = px;
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    this.timer.update();
    const dt = Math.min(0.05, this.timer.getDelta());
    const t = this.timer.getElapsed();

    // eased state
    const fPrev = this.formCur;
    const sPrev = this.splitCur;
    this.formCur = ease(this.formCur, this.view.form, dt, 3.2);
    this.splitCur = ease(this.splitCur, this.view.split ? 1 : 0, dt, 3.2);
    const formMoving = fPrev !== this.formCur;
    if (formMoving || sPrev !== this.splitCur) this.notesDirty = true;
    if (this.notesDirty) {
      this.updateNotePositions();
      this.notesDirty = false;
    }
    this.revealCur = Math.min(1.2, this.revealCur + dt * 0.42);
    this.hasLitCur = ease(this.hasLitCur, this.hasLitTarget, dt, 6);

    this.recMat.uniforms.uForm.value = this.formCur;
    for (const m of [this.notesMat, this.recMat, this.ghostMat]) {
      m.uniforms.uReveal.value = this.revealCur;
      m.uniforms.uHasLit.value = this.hasLitCur;
      m.uniforms.uTime.value = t;
    }
    this.outlineMat.uniforms.uReveal.value = this.revealCur;
    const outlineK = (1 - this.formCur) * (this.view.outlineOpacity / 100);
    // outline brightness rides on uDim (uHasLit = 1, aLit = 0 → alpha = uDim)
    this.outlineMat.uniforms.uHasLit.value = 1;
    this.outlineMat.uniforms.uDim.value = outlineK * (1 - this.hasLitCur * 0.6);
    if (this.outline) this.outline.visible = this.view.outline && outlineK > 0.01;
    this.linesMat.uniforms.uOpacity.value = 0.26 * (1 - this.formCur * 0.55);

    // camera target follows the form
    const ty = -0.45 + (-1.25 + 0.45) * this.formCur;
    if (this.flyTo) {
      const f = this.flyTo;
      const ft =
        f.note != null
          ? new THREE.Vector3(this.notePosCur[f.note * 3], this.notePosCur[f.note * 3 + 1], this.notePosCur[f.note * 3 + 2]).applyMatrix4(this.root.matrixWorld)
          : new THREE.Vector3(0, ty, 0);
      this.controls.target.lerp(ft, Math.min(1, dt * 3));
      const off = this.camera.position.clone().sub(this.controls.target);
      const len = off.length();
      off.setLength(len + (f.dist - len) * Math.min(1, dt * 2.5));
      this.camera.position.copy(this.controls.target).add(off);
      if (this.controls.target.distanceTo(ft) < 0.01 && Math.abs(len - f.dist) < 0.02) this.flyTo = null;
    } else if (formMoving && !this.userTurning) {
      this.controls.target.y += (ty - this.controls.target.y) * Math.min(1, dt * 3);
    }

    // turning
    if (this.view.turning && !this.userTurning && !this.reduced) {
      this.root.rotation.y += dt * 0.07 * (this.view.speed / 100);
    }
    this.controls.update(dt);

    this.updateRing(dt);
    this.updateLabels();
    this.renderer.render(this.scene, this.camera);
  };

  private updateRing(dt: number) {
    const target = this.hovered ?? this.selected;
    const a = this.ringMat.uniforms.uAlpha;
    if (target != null && this.view.notes && this.noteVis[target]) {
      this.ringTarget = target;
      a.value = Math.min(1, a.value + dt * 6);
      const pos = this.ring.geometry.getAttribute("position") as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      arr[0] = this.notePosCur[target * 3];
      arr[1] = this.notePosCur[target * 3 + 1];
      arr[2] = this.notePosCur[target * 3 + 2];
      pos.needsUpdate = true;
      const c = this.ringMat.uniforms.uColor.value as THREE.Color;
      c.setRGB(this.noteRgb[target * 3] ?? 1, this.noteRgb[target * 3 + 1] ?? 1, this.noteRgb[target * 3 + 2] ?? 1);
      c.lerp(new THREE.Color(1, 1, 1), 0.35);
      this.ringMat.uniforms.uSize.value = target === this.selected ? 30 : 24;
    } else {
      a.value = Math.max(0, a.value - dt * 6);
    }
  }

  private v3 = new THREE.Vector3();
  private updateLabels() {
    if (!this.labels.length) return;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.root.updateMatrixWorld();
    const placed: number[][] = [];
    const lh = this.labelHost.dataset.size === "large" ? 18 : this.labelHost.dataset.size === "small" ? 12 : 15;
    this.labels.forEach((l, i) => {
      const el = this.labelEls[i];
      if (!el) return;
      let ok = true;
      if (l.note != null) {
        if (!this.noteVis[l.note]) ok = false;
        this.v3.set(this.notePosCur[l.note * 3], this.notePosCur[l.note * 3 + 1], this.notePosCur[l.note * 3 + 2]);
      } else if (l.group != null) {
        const c = this.groupCentroid;
        if (!c[l.group * 4 + 3]) ok = false;
        this.v3.set(c[l.group * 4], c[l.group * 4 + 1], c[l.group * 4 + 2]);
      }
      this.v3.applyMatrix4(this.root.matrixWorld).project(this.camera);
      if (!ok || this.v3.z > 1 || !this.view.notes) {
        el.style.opacity = "0";
        return;
      }
      const x = (this.v3.x * 0.5 + 0.5) * w;
      const y = (-this.v3.y * 0.5 + 0.5) * h;
      // greedy de-overlap: earlier (stronger) labels win
      const lw = l.text.length * (lh * 0.42) + 12;
      const box = [x + 10, y - lh / 2, x + 10 + lw, y + lh / 2];
      if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) {
        el.style.opacity = "0";
        return;
      }
      placed.push(box);
      el.style.opacity = "1";
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    });
  }

  private pick(clientX: number, clientY: number): number | null {
    if (!this.notes || !this.view.notes) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const dist = this.camera.position.distanceTo(this.controls.target);
    this.raycaster.params.Points = { threshold: 0.055 * (dist / 12) * Math.max(0.6, this.view.pointSize / 100) };
    this.root.updateMatrixWorld();
    const hits = this.raycaster.intersectObject(this.notes, false);
    let best: number | null = null;
    let bestD = Infinity;
    for (const h of hits) {
      const i = h.index ?? -1;
      if (i < 0 || !this.noteVis[i]) continue;
      const d = (h.distanceToRay ?? 0) + h.distance * 0.002;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  private onMove = (e: PointerEvent) => {
    this.pointer = { x: e.clientX, y: e.clientY, inside: true };
    if (e.buttons) return;
    const i = this.pick(e.clientX, e.clientY);
    if (i !== this.hovered) {
      this.hovered = i;
      this.renderer.domElement.style.cursor = i != null ? "pointer" : "";
    }
    this.cb.onHover(i, e.clientX, e.clientY);
  };

  private onDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    this.flyTo = null;
  };

  private onUp = (e: PointerEvent) => {
    const d = this.down;
    this.down = null;
    if (!d) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || performance.now() - d.t > 500) return;
    if (e.button !== 0) return;
    this.cb.onPick(this.pick(e.clientX, e.clientY));
  };

  private onLeave = () => {
    this.pointer.inside = false;
    this.hovered = null;
    this.cb.onHover(null, 0, 0);
  };

  private onDbl = (e: MouseEvent) => {
    if (this.pick(e.clientX, e.clientY) == null) this.cb.onClear();
  };
}
