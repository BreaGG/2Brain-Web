import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Anatomy, Layout, LabelKind } from "./anatomy";
import { KIND_FACE, KIND_MATTER, KIND_NERVE, KIND_SPINE, KIND_STEM, FRAME, FRAME_CY, BRAIN_C } from "./anatomy";

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
  focusBrain: boolean;
  tracts: boolean;
}

export interface SceneLabel {
  text: string;
  note?: number;
  group?: number;
  strong?: boolean;
  /** A fixed place in the layout (axis labels, titles). Shown only at Layout. */
  pos?: [number, number, number];
  kind?: LabelKind;
}

const NOTE_SIZE = 3.3;

const POINT_VS = /* glsl */ `
  attribute vec3 aLayout;
  attribute vec3 aFrom;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aOrder;
  attribute float aLit;
  attribute float aVis;
  attribute float aSplitX;
  attribute float aMatter;
  uniform float uSplit;
  uniform float uMatterK;
  uniform float uBodyK;
  uniform float uForm;
  uniform float uMorph;
  uniform float uReveal;
  uniform float uPx;
  uniform float uScale;
  uniform float uHasLit;
  uniform float uDim;
  uniform float uTime;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float m = smoothstep(0.0, 1.0, clamp(uMorph * 1.35 - aOrder * 0.35, 0.0, 1.0));
    vec3 lay = mix(aFrom, aLayout, m);
    vec3 p = mix(position + vec3(aSplitX * uSplit, 0.0, 0.0), lay, uForm);
    p.x += sin(uTime * 0.6 + aOrder * 61.0) * 0.006;
    p.y += cos(uTime * 0.5 + aOrder * 47.0) * 0.006;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float rev = smoothstep(aOrder - 0.03, aOrder, uReveal);
    float lit = mix(1.0, mix(uDim, 1.0, aLit), uHasLit);
    float layer = mix(uBodyK, uMatterK, aMatter);
    vAlpha = rev * lit * aVis * layer;
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

/* Tracts: streams of light running along curves between linked notes. */
const TRACT_VS = /* glsl */ `
  attribute vec3 aA;
  attribute vec3 aB;
  attribute vec3 aC;
  attribute vec3 aColA;
  attribute vec3 aColB;
  attribute float aSeed;
  attribute float aW;
  uniform float uTime;
  uniform float uPx;
  uniform float uAlpha;
  uniform float uSpread;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float sp = 0.16 + 0.24 * fract(aSeed * 13.7);
    float t = fract(aSeed * 3.1 + uTime * sp);
    float u = 1.0 - t;
    vec3 p = u * u * aA + 2.0 * u * t * aC + t * t * aB;
    vec3 j = vec3(fract(aSeed * 91.3) - 0.5, fract(aSeed * 47.9) - 0.5, fract(aSeed * 23.1) - 0.5);
    float bell = sin(3.14159 * t);
    p += j * uSpread * bell;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.0, (1.7 + 1.1 * fract(aSeed * 5.3)) * uPx * 18.0 / -mv.z);
    vColor = mix(mix(aColA, aColB, t), vec3(1.0), 0.28) * 1.35;
    vAlpha = aW * uAlpha * pow(max(bell, 0.0), 0.45);
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

function pointsMaterial() {
  return additive(
    new THREE.ShaderMaterial({
      vertexShader: POINT_VS,
      fragmentShader: POINT_FS,
      uniforms: {
        uForm: { value: 0 },
        uMorph: { value: 1 },
        uReveal: { value: 0 },
        uPx: { value: 1 },
        uScale: { value: 1 },
        uHasLit: { value: 0 },
        uDim: { value: 0.12 },
        uTime: { value: 0 },
        uSplit: { value: 0 },
        uMatterK: { value: 1 },
        uBodyK: { value: 1 },
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
  private layout: Layout | null = null;
  private recFrom: Float32Array = new Float32Array(0);
  private noteFrom: Float32Array = new Float32Array(0);
  private morphCur = 1;
  private groupRgbArr: [number, number, number][] = [];
  private scaffold?: THREE.LineSegments;
  private scaffoldGeo?: THREE.BufferGeometry;
  private scaffoldMat = additive(
    new THREE.ShaderMaterial({ vertexShader: LINE_VS, fragmentShader: LINE_FS, uniforms: { uOpacity: { value: 0 } } }),
  );
  private frameDist = 18;
  private groupOf: Int32Array = new Int32Array(0);
  private groupCount = 0;

  private notes?: THREE.Points;
  private notesGeo?: THREE.BufferGeometry;
  private notesMat = pointsMaterial();
  private notePosCur = new Float32Array(0);
  private noteVis = new Float32Array(0);

  private rec?: THREE.Points;
  private recGeo?: THREE.BufferGeometry;
  private recMat = pointsMaterial();

  private fibres?: THREE.LineSegments;
  private fibreGeo?: THREE.BufferGeometry;
  private fibreMat = additive(
    new THREE.ShaderMaterial({ vertexShader: LINE_VS, fragmentShader: LINE_FS, uniforms: { uOpacity: { value: 0.22 } } }),
  );
  private recRgb: Float32Array = new Float32Array(0);

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
  private ghostMat = pointsMaterial();
  private ghostLineMat = additive(
    new THREE.ShaderMaterial({ vertexShader: LINE_VS, fragmentShader: LINE_FS, uniforms: { uOpacity: { value: 0.18 } } }),
  );
  private ghostFrom: number[][] = [];

  private tractGeo?: THREE.BufferGeometry;
  private tractPts?: THREE.Points;
  private tractMat = additive(
    new THREE.ShaderMaterial({
      vertexShader: TRACT_VS,
      fragmentShader: POINT_FS,
      uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uAlpha: { value: 0 }, uSpread: { value: 0.05 } },
    }),
  );
  private tractLinks: { a: number; b: number; w: number }[] = [];
  private tractKey = "";
  private nbrs: number[][] = [];
  private hubs: number[] = [];

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
    focusBrain: false,
    tracts: true,
  };
  private bodyCur = 1;
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
  private brainDist = 5;
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
    this.camera.position.set(0, FRAME_CY, 18);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.8;
    this.controls.minDistance = 2.5;
    this.controls.maxDistance = 42;
    this.controls.target.set(0, FRAME_CY, 0);
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

    if (process.env.NODE_ENV !== "production") (window as unknown as { __brainScene?: BrainScene }).__brainScene = this;

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
    g.setAttribute("aFrom", g.getAttribute("position"));
    g.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    const sizes = new Float32Array(n);
    const orders = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      sizes[i] = NOTE_SIZE;
      orders[i] = 0.002 + (i / Math.max(1, n)) * 0.04;
    }
    g.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    this.noteSizeBase = sizes.slice();
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
    rg.setAttribute("aFrom", new THREE.BufferAttribute(new Float32Array(anat.recPos), 3));
    this.layout = null;
    this.morphCur = 1;
    rg.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(P * 3), 3));
    const rs = new Float32Array(P);
    for (let k = 0; k < P; k++) {
      const kind = anat.recKind[k];
      rs[k] = kind === KIND_SPINE ? 1.7 : kind === KIND_NERVE ? 1.55 : kind === KIND_STEM ? 1.3 : kind === KIND_MATTER ? 1.45 : kind === KIND_FACE ? 1.2 : 1.5;
    }
    const matterFlag = new Float32Array(P);
    for (let k = 0; k < P; k++) matterFlag[k] = anat.recKind[k] === KIND_MATTER ? 1 : 0;
    rg.setAttribute("aSplitX", new THREE.BufferAttribute(anat.recSplit, 1));
    rg.setAttribute("aMatter", new THREE.BufferAttribute(matterFlag, 1));
    rg.setAttribute("aSize", new THREE.BufferAttribute(rs, 1));
    this.recSizeBase = rs.slice();
    rg.setAttribute("aOrder", new THREE.BufferAttribute(anat.recOrder, 1));
    rg.setAttribute("aLit", new THREE.BufferAttribute(new Float32Array(P), 1));
    rg.setAttribute("aVis", new THREE.BufferAttribute(new Float32Array(P).fill(1), 1));
    rg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -7, 0), 12);
    this.recGeo = rg;
    if (this.rec) this.root.remove(this.rec);
    this.rec = new THREE.Points(rg, this.recMat);
    this.rec.frustumCulled = false;
    this.rec.renderOrder = 1;
    this.root.add(this.rec);
    this.recMat.uniforms.uDim.value = 0.07;

    // nerve fibres: each body point joined to the point before it
    this.fibreGeo?.dispose();
    const F = anat.fibres.length;
    const fp = new Float32Array(F * 3);
    for (let e = 0; e < F; e++) {
      const k = anat.fibres[e];
      fp[e * 3] = anat.recPos[k * 3];
      fp[e * 3 + 1] = anat.recPos[k * 3 + 1];
      fp[e * 3 + 2] = anat.recPos[k * 3 + 2];
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.BufferAttribute(fp, 3));
    fg.setAttribute("color", new THREE.BufferAttribute(new Float32Array(F * 3), 3));
    this.fibreGeo = fg;
    if (this.fibres) this.root.remove(this.fibres);
    this.fibres = new THREE.LineSegments(fg, this.fibreMat);
    this.fibres.frustumCulled = false;
    this.fibres.renderOrder = 0;
    this.root.add(this.fibres);

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

    // neighbours (for tracts) and the biggest hubs
    this.nbrs = Array.from({ length: n }, () => [] as number[]);
    for (const [a, b] of links) {
      this.nbrs[a].push(b);
      this.nbrs[b].push(a);
    }
    this.hubs = this.nbrs
      .map((l, i) => [i, l.length] as const)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 3)
      .filter((x) => x[1] > 0)
      .map((x) => x[0]);
    this.buildTracts();

    // ghosts
    this.ghostFrom = ghosts.map((g) => g.from);
    const Gh = ghosts.length;
    const gg = new THREE.BufferGeometry();
    gg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(Gh * 3), 3).setUsage(THREE.DynamicDrawUsage));
    gg.setAttribute("aLayout", gg.getAttribute("position"));
    gg.setAttribute("aFrom", gg.getAttribute("position"));
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

  /** Where the points go at Layout. A change of layout flies the points from where they are now. */
  setLayout(layout: Layout, groupOf: Int32Array, groupCount: number) {
    const anat = this.anat;
    this.groupOf = groupOf;
    this.groupCount = groupCount;
    this.groupCentroid = new Float32Array(groupCount * 4);
    if (!anat || !this.recGeo) {
      this.layout = layout;
      return;
    }
    const prev = this.layout;
    const toA = this.recGeo.getAttribute("aLayout") as THREE.BufferAttribute;
    const fromA = this.recGeo.getAttribute("aFrom") as THREE.BufferAttribute;
    const to = toA.array as Float32Array;
    const from = fromA.array as Float32Array;
    const animate = !!prev && prev.key !== layout.key && this.formCur > 0.05;
    if (animate) {
      // freeze where the points are now (per-point stagger matches the shader closely enough)
      const m = this.morphCur;
      for (let i = 0; i < to.length; i++) from[i] = from[i] + (to[i] - from[i]) * m;
      const nf = this.noteFrom;
      const nt = prev.noteLayout;
      const cur = new Float32Array(nt.length);
      for (let i = 0; i < nt.length; i++) cur[i] = (nf[i] ?? nt[i]) + (nt[i] - (nf[i] ?? nt[i])) * m;
      this.noteFrom = cur;
      this.morphCur = 0;
    } else {
      from.set(layout.recLayout);
      this.noteFrom = new Float32Array(layout.noteLayout);
      this.morphCur = 1;
    }
    to.set(layout.recLayout);
    toA.needsUpdate = true;
    fromA.needsUpdate = true;
    this.layout = layout;
    this.buildScaffold();
    this.updateFrameDist();
    if (this.view.form > 0.5 && (!prev || prev.frame?.cx !== layout.frame?.cx || prev.frame?.w !== layout.frame?.w)) this.home();
    this.notesDirty = true;
  }

  private static TRACT_LINKS = 64;
  private static TRACT_PER = 110;

  private buildTracts() {
    this.tractGeo?.dispose();
    if (this.tractPts) this.root.remove(this.tractPts);
    const P = BrainScene.TRACT_LINKS * BrainScene.TRACT_PER;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(P * 3), 3));
    for (const name of ["aA", "aB", "aC", "aColA", "aColB"]) g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(P * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const seed = new Float32Array(P);
    for (let i = 0; i < P; i++) seed[i] = ((i * 0.6180339887) % 1) + (i % 7) * 0.0137;
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    g.setAttribute("aW", new THREE.BufferAttribute(new Float32Array(P), 1).setUsage(THREE.DynamicDrawUsage));
    this.tractGeo = g;
    this.tractPts = new THREE.Points(g, this.tractMat);
    this.tractPts.frustumCulled = false;
    this.tractPts.renderOrder = 4;
    this.root.add(this.tractPts);
    this.tractKey = "";
  }

  /** Which links carry tracts: the selected note's, the hovered note's, or the hubs' in focus brain. */
  private chooseTracts() {
    const sel = this.selected;
    const hov = this.hovered;
    const out: { a: number; b: number; w: number }[] = [];
    const add = (i: number, w: number) => {
      for (const j of this.nbrs[i] ?? []) if (this.noteVis[i] && this.noteVis[j]) out.push({ a: i, b: j, w });
    };
    if (sel != null) add(sel, 1);
    if (hov != null && hov !== sel) add(hov, 0.6);
    if (!out.length && this.view.focusBrain && this.formCur < 0.5) for (const h of this.hubs) add(h, 0.55);
    return out.slice(0, BrainScene.TRACT_LINKS);
  }

  private updateTracts(force: boolean) {
    const g = this.tractGeo;
    if (!g || !this.anat) return;
    const links = this.view.tracts ? this.chooseTracts() : [];
    const key = links.map((l) => `${l.a}-${l.b}-${l.w}`).join(",");
    const changed = key !== this.tractKey;
    if (!changed && !force) return;
    this.tractKey = key;
    this.tractLinks = links;
    const PER = BrainScene.TRACT_PER;
    const A = g.getAttribute("aA") as THREE.BufferAttribute;
    const B = g.getAttribute("aB") as THREE.BufferAttribute;
    const C = g.getAttribute("aC") as THREE.BufferAttribute;
    const CA = g.getAttribute("aColA") as THREE.BufferAttribute;
    const CB = g.getAttribute("aColB") as THREE.BufferAttribute;
    const Wt = g.getAttribute("aW") as THREE.BufferAttribute;
    const a = A.array as Float32Array;
    const b = B.array as Float32Array;
    const c = C.array as Float32Array;
    const ca = CA.array as Float32Array;
    const cb = CB.array as Float32Array;
    const w = Wt.array as Float32Array;
    w.fill(0);
    const P = this.notePosCur;
    const f = this.formCur;
    links.forEach((l, li) => {
      const ax = P[l.a * 3], ay = P[l.a * 3 + 1], az = P[l.a * 3 + 2];
      const bx = P[l.b * 3], by = P[l.b * 3 + 1], bz = P[l.b * 3 + 2];
      const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
      const len = Math.hypot(bx - ax, by - ay, bz - az);
      // through the brain's white matter at anatomy; an arch over the chart at layout
      const k = 0.42;
      const cxA = mx + (BRAIN_C.x - mx) * k, cyA = my + (BRAIN_C.y - 0.05 - my) * k, czA = mz + (BRAIN_C.z - mz) * k;
      const cxL = mx, cyL = my + len * 0.32, czL = mz + len * 0.12;
      const cx = cxA + (cxL - cxA) * f, cy = cyA + (cyL - cyA) * f, cz = czA + (czL - czA) * f;
      for (let p = 0; p < PER; p++) {
        const o = (li * PER + p) * 3;
        a[o] = ax; a[o + 1] = ay; a[o + 2] = az;
        b[o] = bx; b[o + 1] = by; b[o + 2] = bz;
        c[o] = cx; c[o + 1] = cy; c[o + 2] = cz;
        ca[o] = this.noteRgb[l.a * 3] ?? 1; ca[o + 1] = this.noteRgb[l.a * 3 + 1] ?? 1; ca[o + 2] = this.noteRgb[l.a * 3 + 2] ?? 1;
        cb[o] = this.noteRgb[l.b * 3] ?? 1; cb[o + 1] = this.noteRgb[l.b * 3 + 1] ?? 1; cb[o + 2] = this.noteRgb[l.b * 3 + 2] ?? 1;
        w[li * PER + p] = l.w;
      }
    });
    for (const attr of [A, B, C, CA, CB, Wt]) attr.needsUpdate = true;
  }

  /** Pixels on the left covered by a panel: the view is centred in what is left. */
  setInsetLeft(px: number) {
    if (px === this.insetLeft) return;
    this.insetLeft = px;
    this.resize();
  }
  private insetLeft = 0;

  /** Per-note size factor (table builder "Size"); null resets. */
  setSizeK(k: Float32Array | null) {
    const anat = this.anat;
    if (!anat || !this.notesGeo || !this.recGeo) return;
    const ns = this.notesGeo.getAttribute("aSize") as THREE.BufferAttribute;
    const na = ns.array as Float32Array;
    for (let i = 0; i < anat.n; i++) na[i] = this.noteSizeBase[i] * (k ? k[i] : 1);
    ns.needsUpdate = true;
    const rs = this.recGeo.getAttribute("aSize") as THREE.BufferAttribute;
    const ra = rs.array as Float32Array;
    for (let j = 0; j < anat.recCount; j++) ra[j] = this.recSizeBase[j] * (k ? Math.sqrt(k[anat.recNote[j]]) : 1);
    rs.needsUpdate = true;
  }
  private noteSizeBase: Float32Array = new Float32Array(0);
  private recSizeBase: Float32Array = new Float32Array(0);

  private buildScaffold() {
    const sc = this.layout?.scaffold;
    this.scaffoldGeo?.dispose();
    if (this.scaffold) this.root.remove(this.scaffold);
    this.scaffold = undefined;
    this.scaffoldGeo = undefined;
    if (!sc) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(sc.pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(sc.pos.length), 3));
    this.scaffoldGeo = g;
    this.scaffold = new THREE.LineSegments(g, this.scaffoldMat);
    this.scaffold.frustumCulled = false;
    this.root.add(this.scaffold);
    this.colorScaffold();
  }

  private colorScaffold() {
    const sc = this.layout?.scaffold;
    if (!sc || !this.scaffoldGeo) return;
    const col = this.scaffoldGeo.getAttribute("color") as THREE.BufferAttribute;
    const a = col.array as Float32Array;
    for (let sgi = 0; sgi < sc.group.length; sgi++) {
      const gi = sc.group[sgi];
      const c = gi >= 0 ? (this.groupRgbArr[gi] ?? [1, 1, 1]) : ([0.55, 0.55, 0.55] as [number, number, number]);
      for (let v = 0; v < 2; v++) a.set(c, sgi * 6 + v * 3);
    }
    col.needsUpdate = true;
  }

  /** groupRgb: per group colour; mono=true when palette is greyscale. */
  setColors(groupRgb: [number, number, number][]) {
    const anat = this.anat;
    if (!anat || !this.notesGeo || !this.recGeo || !this.linesGeo) return;
    const n = anat.n;
    this.groupRgbArr = groupRgb;
    this.colorScaffold();
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
      let white = 0.3;
      let gain = 0.6;
      if (kind === KIND_SPINE) {
        white = 0.75;
        gain = 1.0;
      } else if (kind === KIND_STEM) {
        white = 0.45;
        gain = 0.42;
      } else if (kind === KIND_NERVE) {
        white = 0.45;
        gain = 0.82;
      } else if (kind === KIND_FACE) {
        white = 0.4;
        gain = 0.45;
      } else if (kind === KIND_MATTER) {
        white = 0.18;
        gain = 0.62;
      }
      arr[k * 3] = (c[0] + (1 - c[0]) * white) * gain;
      arr[k * 3 + 1] = (c[1] + (1 - c[1]) * white) * gain;
      arr[k * 3 + 2] = (c[2] + (1 - c[2]) * white) * gain;
    }
    rc.needsUpdate = true;
    this.recRgb = arr;
    this.updateTracts(true);
    this.updateLinkColors();
    this.updateFibreColors();
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
    this.recLit = src ? ra : null;
    this.updateLinkColors();
    this.updateFibreColors();
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
    this.recVis = ra;
    this.notesDirty = true;
    this.updateLinkColors();
    this.updateFibreColors();
  }

  setView(v: SceneView) {
    const wasBrain = this.brainMode();
    const wasLayout = this.layoutMode();
    this.view = v;
    this.applyVisibility();
    if (wasBrain !== this.brainMode() || (wasLayout !== this.layoutMode() && this.layout?.frame)) this.home();
  }

  /** At Layout with a layout that brings its own frame (charts, trees). */
  private layoutMode() {
    return this.view.form > 0.5 && !!this.layout?.frame;
  }

  /** Focus brain: the camera frames the brain alone and the body fades out. */
  private brainMode() {
    return this.view.focusBrain && this.view.form < 0.5;
  }
  private homeX() {
    return this.layoutMode() ? this.layout!.frame!.cx : 0;
  }
  private homeY() {
    if (this.layoutMode()) return this.layout!.frame!.cy;
    return this.brainMode() ? BRAIN_C.y - 0.04 : FRAME_CY;
  }
  private homeDist() {
    if (this.layoutMode()) return this.frameDist;
    return this.brainMode() ? this.brainDist : this.fitDist;
  }
  private updateFrameDist() {
    const f = this.layout?.frame;
    if (!f) return;
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const w = Math.max(1, this.host.clientWidth - this.insetLeft);
    const aspect = w / Math.max(1, this.host.clientHeight);
    this.frameDist = Math.max(f.h / 2 / t, f.w / 2 / t / aspect);
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
      el.className = "brain-label" + (l.strong ? " strong" : "") + (l.kind ? ` ${l.kind}` : "");
      el.style.color = l.kind === "title" && l.group != null && this.groupRgbArr[l.group] ? `rgb(${this.groupRgbArr[l.group].map((c) => Math.round(Math.min(1, c * 1.1 + 0.15) * 255)).join(",")})` : "";
      el.style.display = "";
    });
  }

  setSelected(i: number | null) {
    this.selected = i;
  }

  /** Smoothly bring a note to the centre of the view. */
  focusNote(i: number) {
    if (!this.anat) return;
    this.flyTo = { note: i, dist: this.brainMode() ? this.brainDist * 0.8 : Math.max(4.6, this.fitDist * 0.3) };
  }

  /** Smoothly return to the whole figure (or the brain, in focus brain). */
  home() {
    this.flyTo = { note: null, dist: this.homeDist() };
  }
  private flyTo: { note: number | null; dist: number } | null = null;

  /** Point the camera at a world position from a distance (used by tests and tours). */
  lookAt(x: number, y: number, z: number, dist: number, azimuth = 0) {
    this.flyTo = null;
    this.root.rotation.set(0, 0, 0);
    this.controls.target.set(x, y, z);
    this.camera.position.set(x + Math.sin(azimuth) * dist, y, z + Math.cos(azimuth) * dist);
    this.controls.update();
  }

  resetCamera() {
    this.flyTo = null;
    this.camera.position.set(this.homeX(), this.homeY(), this.homeDist());
    this.controls.target.set(this.homeX(), this.homeY(), 0);
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
    [this.notesMat, this.recMat, this.fibreMat, this.linesMat, this.ghostMat, this.ghostLineMat, this.ringMat, this.scaffoldMat, this.tractMat].forEach((m) => m.dispose());
    this.renderer.dispose();
    el.remove();
    this.labelEls.forEach((e) => e.remove());
  }

  /* ── internals ───────────────────────────────────────────────────────── */

  private applyVisibility() {
    const v = this.view;
    if (this.notes) this.notes.visible = v.notes;
    if (this.rec) this.rec.visible = v.record || v.outline;
    if (this.fibres) this.fibres.visible = v.record && !v.focusBrain;
    if (this.lines) this.lines.visible = v.links && v.notes;
    if (this.ghostPts) this.ghostPts.visible = v.ghosts && v.notes;
    if (this.ghostLines) this.ghostLines.visible = v.ghosts && v.notes && v.links;
    const s = v.pointSize / 100;
    this.notesMat.uniforms.uScale.value = s;
    this.recMat.uniforms.uScale.value = s;
    this.ghostMat.uniforms.uScale.value = s;
  }

  private recLit: Float32Array | null = null;
  private recVis: Float32Array | null = null;
  private updateFibreColors() {
    const anat = this.anat;
    if (!anat || !this.fibreGeo || !this.recRgb.length) return;
    const col = this.fibreGeo.getAttribute("color") as THREE.BufferAttribute;
    const a = col.array as Float32Array;
    const lit = this.recLit;
    const vis = this.recVis;
    for (let e = 0; e < anat.fibres.length; e++) {
      const k = anat.fibres[e];
      let f = 1;
      if (lit) f = lit[k] ? 1.5 : 0.06;
      if (vis && !vis[k]) f = 0;
      a[e * 3] = this.recRgb[k * 3] * f;
      a[e * 3 + 1] = this.recRgb[k * 3 + 1] * f;
      a[e * 3 + 2] = this.recRgb[k * 3 + 2] * f;
    }
    col.needsUpdate = true;
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
    const gr = this.layout;
    if (!anat || !gr || !this.notesGeo || !this.linesGeo) return;
    const f = this.formCur;
    const s = this.splitCur;
    const P = this.notePosCur;
    const mm = this.morphCur;
    const m = mm * mm * (3 - 2 * mm);
    const nf = this.noteFrom.length === gr.noteLayout.length ? this.noteFrom : gr.noteLayout;
    for (let i = 0; i < anat.n * 3; i++) {
      const a = anat.notePos[i] + (anat.noteSplit[i] - anat.notePos[i]) * s;
      const lay = nf[i] + (gr.noteLayout[i] - nf[i]) * m;
      P[i] = a + (lay - a) * f;
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
        const cy = BRAIN_C.y * (1 - f) + y * f;
        const dx = x - BRAIN_C.x * (1 - f);
        const dy = y - cy;
        const dz = z - BRAIN_C.z * (1 - f);
        const len = Math.hypot(dx, dy, dz) || 1;
        const push = 0.22 + (g % 5) * 0.03;
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
    if (this.insetLeft > 0 && w > this.insetLeft * 2) this.camera.setViewOffset(w, h, -this.insetLeft / 2, 0, w, h);
    else this.camera.clearViewOffset();
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const distH = (FRAME.top - FRAME.bottom) / 2 / t;
    const distW = FRAME.width / 2 / t / this.camera.aspect;
    const prev = this.homeDist();
    this.fitDist = Math.max(distH, distW);
    // the brain alone: about 1.35 wide and 1.6 tall, with a margin for labels
    this.brainDist = Math.max(2.05 / 2 / t, 2.0 / 2 / t / this.camera.aspect);
    this.updateFrameDist();
    // keep the viewing direction and relative zoom, rescaled to the new fit
    const off = this.camera.position.clone().sub(this.controls.target);
    off.multiplyScalar(this.homeDist() / prev);
    this.camera.position.copy(this.controls.target).add(off);
    this.camera.updateProjectionMatrix();
    const px = this.renderer.getPixelRatio();
    for (const m of [this.notesMat, this.recMat, this.ghostMat, this.ringMat, this.tractMat]) m.uniforms.uPx.value = px;
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
    if (this.morphCur < 1) {
      this.morphCur = Math.min(1, this.morphCur + dt * 0.75);
      this.notesDirty = true;
    }
    this.recMat.uniforms.uMorph.value = this.morphCur;
    const moved = this.notesDirty;
    if (this.notesDirty) {
      this.updateNotePositions();
      this.notesDirty = false;
    }
    this.updateTracts(moved);
    const wantTracts = this.view.tracts && this.view.notes && this.tractLinks.length > 0;
    const ta = this.tractMat.uniforms.uAlpha;
    ta.value = wantTracts ? Math.min(1, ta.value + dt * 2.5) : Math.max(0, ta.value - dt * 4);
    this.tractMat.uniforms.uTime.value = t;
    this.tractMat.uniforms.uSpread.value = 0.045 * (1 - this.formCur) + 0.03 * this.formCur;
    if (this.tractPts) this.tractPts.visible = ta.value > 0.001;
    this.revealCur = Math.min(1.2, this.revealCur + dt * 0.42);
    this.hasLitCur = ease(this.hasLitCur, this.hasLitTarget, dt, 6);

    this.recMat.uniforms.uForm.value = this.formCur;
    for (const m of [this.notesMat, this.recMat, this.ghostMat]) {
      m.uniforms.uReveal.value = this.revealCur;
      m.uniforms.uHasLit.value = this.hasLitCur;
      m.uniforms.uTime.value = t;
    }
    // brain matter rides on "Brain outline", the body on "Record"
    this.recMat.uniforms.uSplit.value = this.splitCur;
    this.recMat.uniforms.uMatterK.value = this.view.outline ? this.view.outlineOpacity / 100 : 0;
    this.bodyCur = ease(this.bodyCur, this.view.record && !this.view.focusBrain ? 1 : 0, dt, 3);
    this.recMat.uniforms.uBodyK.value = this.bodyCur;
    this.fibreMat.uniforms.uOpacity.value = 0.2 * (1 - this.formCur) * (1 - this.hasLitCur * 0.3) * this.bodyCur;
    if (this.fibres) this.fibres.visible = this.bodyCur > 0.01 && this.formCur < 0.98;
    // charts keep links faint; the tree hides them until something is lit
    const quiet = this.layout?.key.startsWith("tree") ? 0.95 * (1 - this.hasLitCur) : 0.6;
    const chartK = this.layout?.flat ? 1 - quiet * this.formCur : 1;
    this.linesMat.uniforms.uOpacity.value = (0.1 + 0.08 * this.formCur) * (1 + this.hasLitCur * 1.4) * chartK;
    this.scaffoldMat.uniforms.uOpacity.value = 0.42 * Math.max(0, this.formCur - 0.4) / 0.6 * Math.min(1, this.morphCur * 1.5);
    if (this.scaffold) this.scaffold.visible = this.formCur > 0.4;

    // camera target follows the form
    const ty = this.homeY();
    if (this.flyTo) {
      const f = this.flyTo;
      const ft =
        f.note != null
          ? new THREE.Vector3(this.notePosCur[f.note * 3], this.notePosCur[f.note * 3 + 1], this.notePosCur[f.note * 3 + 2]).applyMatrix4(this.root.matrixWorld)
          : new THREE.Vector3(this.homeX(), ty, 0);
      this.controls.target.lerp(ft, Math.min(1, dt * 3));
      const off = this.camera.position.clone().sub(this.controls.target);
      const len = off.length();
      off.setLength(len + (f.dist - len) * Math.min(1, dt * 2.5));
      this.camera.position.copy(this.controls.target).add(off);
      if (this.controls.target.distanceTo(ft) < 0.01 && Math.abs(len - f.dist) < 0.02) this.flyTo = null;
    } else if (formMoving && !this.userTurning) {
      this.controls.target.y += (ty - this.controls.target.y) * Math.min(1, dt * 3);
    }

    // turning; flat charts stop and face the camera
    const flat = !!this.layout?.flat && this.formCur > 0.5;
    if (flat) {
      const y = this.root.rotation.y;
      const wrapped = Math.atan2(Math.sin(y), Math.cos(y));
      this.root.rotation.y = Math.abs(wrapped) < 0.0005 ? 0 : wrapped * (1 - Math.min(1, dt * 3));
    } else if (this.view.turning && !this.userTurning && !this.reduced) {
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
      if (l.pos) {
        if (this.formCur < 0.6) ok = false;
        this.v3.set(l.pos[0], l.pos[1], l.pos[2]);
      } else if (l.note != null) {
        if (!this.noteVis[l.note]) ok = false;
        this.v3.set(this.notePosCur[l.note * 3], this.notePosCur[l.note * 3 + 1], this.notePosCur[l.note * 3 + 2]);
      } else if (l.group != null) {
        const c = this.groupCentroid;
        if (!c[l.group * 4 + 3]) ok = false;
        this.v3.set(c[l.group * 4], c[l.group * 4 + 1], c[l.group * 4 + 2]);
      }
      this.v3.applyMatrix4(this.root.matrixWorld).project(this.camera);
      if (!ok || this.v3.z > 1 || (!this.view.notes && !l.pos)) {
        el.style.opacity = "0";
        return;
      }
      const x = (this.v3.x * 0.5 + 0.5) * w;
      const y = (-this.v3.y * 0.5 + 0.5) * h;
      // greedy de-overlap: earlier (stronger) labels win
      const left = l.kind === "axisL";
      const lw = l.text.length * (lh * (l.kind ? 0.36 : 0.42)) + 12;
      const box = left ? [x - 10 - lw, y - lh / 2, x - 10, y + lh / 2] : [x + 10, y - lh / 2, x + 10 + lw, y + lh / 2];
      if (l.kind !== "box" && placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) {
        el.style.opacity = "0";
        return;
      }
      placed.push(box);
      el.style.opacity = "1";
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)${left ? " translateX(-100%)" : ""}`;
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
