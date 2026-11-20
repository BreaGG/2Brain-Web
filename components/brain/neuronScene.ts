import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { NeuronNet } from "./neurons";

/* ───────────────────────────────────────────────────────────────────────────
 * Neurons: the net drawn and alive. Somas glow, dendrites light with their
 * neuron, and impulses run down the axons; when one reaches its synapse the
 * synapse flashes and charges the neuron it lands on, which may fire in turn.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface NeuronCallbacks {
  onHover: (i: number | null, x: number, y: number) => void;
  onPick: (i: number | null) => void;
}

const TEX_W = 256;
const MAX_HEADS = 400;

function stateTexture(n: number) {
  const h = Math.max(1, Math.ceil(n / TEX_W));
  const data = new Float32Array(TEX_W * h * 4);
  const tex = new THREE.DataTexture(data, TEX_W, h, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return { tex, data };
}

const FETCH = /* glsl */ `
  vec4 fetch(sampler2D t, float i) { return texelFetch(t, ivec2(int(mod(i, ${TEX_W}.0)), int(floor(i / ${TEX_W}.0))), 0); }
`;
const FOG = /* glsl */ `
  uniform float uNear;
  uniform float uFar;
  float fog(float z) { return clamp(1.0 - (z - uNear) / max(0.001, uFar - uNear), 0.18, 1.0); }
`;

export class NeuronScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(48, 1, 0.05, 600);
  private controls: OrbitControls;
  private raf = 0;
  private disposed = false;
  private timer = new THREE.Timer();
  private host: HTMLElement;
  private labelHost: HTMLElement;
  private cbs: NeuronCallbacks;
  private reduced: boolean;
  private ro: ResizeObserver;

  private net: NeuronNet | null = null;
  private titles: string[] = [];
  private group = new THREE.Group();
  private somaGeo: THREE.BufferGeometry | null = null;
  private somaMat: THREE.ShaderMaterial;
  private dendMat: THREE.ShaderMaterial;
  private axonMat: THREE.ShaderMaterial;
  private headMat: THREE.ShaderMaterial;
  private synMat: THREE.ShaderMaterial;
  private dustMat: THREE.ShaderMaterial;
  private dotMat: THREE.ShaderMaterial;
  private headGeo = new THREE.BufferGeometry();
  private headPos = new Float32Array(MAX_HEADS * 3);
  private headCol = new Float32Array(MAX_HEADS * 3);
  private state = stateTexture(1);
  private links = stateTexture(1);

  // the life of the net
  private charge = new Float32Array(0);
  private refract = new Float32Array(0);
  private lit = new Float32Array(0);
  private litTarget = new Float32Array(0);
  private vis = new Float32Array(0);
  private head = new Float32Array(0);
  private flash = new Float32Array(0);
  private colour: [number, number, number][] = [];
  private anyLit = false;
  private rnd = Math.random;

  private view = { turning: true, speed: 100 };
  private proj = 600;
  private intro = 0;
  /** Leaving: 0..1 as the camera pulls away from the net, or -1 while staying. */
  private outro = -1;
  private outroFrom: THREE.Vector3 | null = null;
  private outroStart = 0;
  private screen = new Float32Array(0);
  private hoverI: number | null = null;
  private down: { x: number; y: number } | null = null;
  private labelEls = new Map<number, HTMLDivElement>();

  constructor(host: HTMLElement, labelHost: HTMLElement, cbs: NeuronCallbacks, reduced: boolean) {
    this.host = host;
    this.labelHost = labelHost;
    this.cbs = cbs;
    this.reduced = reduced;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.domElement.className = "neuron-gl";
    host.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.7;
    this.controls.enablePan = false;
    this.scene.add(this.group);

    const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
    const common = { uState: { value: this.state.tex }, uLinks: { value: this.links.tex }, uNear: { value: 10 }, uFar: { value: 60 }, uPx: { value: 1 }, uProj: { value: 600 }, uTime: { value: 0 } };

    this.somaMat = new THREE.ShaderMaterial({
      ...additive,
      uniforms: common,
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute vec3 aColor;
        attribute float aIndex;
        uniform sampler2D uState;
        uniform float uProj;
        uniform float uTime;
        varying vec3 vColor;
        varying float vA;
        varying float vCharge;
        ${FETCH}
        ${FOG}
        void main() {
          vec4 st = fetch(uState, aIndex);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float breathe = 1.0 + 0.06 * sin(uTime * 1.7 + aIndex * 2.3);
          gl_PointSize = aSize * 6.0 * uProj / max(0.1, -mv.z) * breathe * (1.0 + 0.7 * st.r);
          gl_Position = projectionMatrix * mv;
          vColor = aColor;
          vCharge = st.r;
          vA = st.b * st.g * fog(-mv.z);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vA;
        varying float vCharge;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          float core = smoothstep(0.3, 0.12, d);
          float shell = smoothstep(0.36, 0.28, d) - core;
          float halo = exp(-d * d * 7.0) * (0.35 + 0.9 * vCharge);
          vec3 c = mix(vColor, vec3(1.0), smoothstep(0.16, 0.0, d) * 0.8 + vCharge * 0.35) * (core * 1.5 + shell * 1.1 + halo * 1.2);
          gl_FragColor = vec4(c * vA, (core + halo) * vA);
        }`,
    });

    this.dendMat = new THREE.ShaderMaterial({
      ...additive,
      uniforms: common,
      vertexShader: /* glsl */ `
        attribute float aOwner;
        attribute float aFade;
        attribute vec3 aColor;
        uniform sampler2D uState;
        varying vec3 vColor;
        varying float vA;
        ${FETCH}
        ${FOG}
        void main() {
          vec4 st = fetch(uState, aOwner);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          // the charge runs out along the tree: near the soma first
          float lit = st.r * smoothstep(1.05, 0.0, aFade - st.r * 0.6);
          vColor = mix(aColor, vec3(1.0), lit * 0.55 * (1.0 - aFade));
          vA = st.b * st.g * fog(-mv.z) * (1.0 - aFade * 0.62) * (0.62 + 1.8 * lit);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vA;
        void main() { gl_FragColor = vec4(vColor * vA, vA); }`,
    });

    this.axonMat = new THREE.ShaderMaterial({
      ...additive,
      uniforms: common,
      vertexShader: /* glsl */ `
        attribute float aT;
        attribute float aLink;
        attribute vec3 aColor;
        uniform sampler2D uLinks;
        varying vec3 vColor;
        varying float vA;
        ${FETCH}
        ${FOG}
        void main() {
          vec4 lk = fetch(uLinks, aLink);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = lk.r - aT;
          float trail = lk.r >= 0.0 && d >= 0.0 ? exp(-d * 4.5) : 0.0;
          float end = lk.g * smoothstep(0.82, 1.0, aT);
          vColor = mix(aColor, vec3(1.0), clamp(trail * 0.8 + end, 0.0, 1.0));
          vA = lk.b * fog(-mv.z) * (0.24 + trail * 1.7 + end * 1.2);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vA;
        void main() { gl_FragColor = vec4(vColor * vA, vA); }`,
    });

    const sprite = /* glsl */ `
      varying vec3 vColor;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float k = exp(-d * d * 5.0) + smoothstep(0.25, 0.0, d);
        gl_FragColor = vec4(mix(vColor, vec3(1.0), smoothstep(0.35, 0.0, d)) * k * vA, k * vA);
      }`;
    this.headMat = new THREE.ShaderMaterial({
      ...additive,
      uniforms: common,
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        uniform float uProj;
        varying vec3 vColor;
        varying float vA;
        ${FOG}
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 0.46 * uProj / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
          vColor = aColor;
          vA = fog(-mv.z);
        }`,
      fragmentShader: sprite,
    });
    this.synMat = new THREE.ShaderMaterial({
      ...additive,
      uniforms: common,
      vertexShader: /* glsl */ `
        attribute float aLink;
        attribute vec3 aColor;
        uniform sampler2D uLinks;
        uniform float uProj;
        varying vec3 vColor;
        varying float vA;
        ${FETCH}
        ${FOG}
        void main() {
          vec4 lk = fetch(uLinks, aLink);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (0.09 + 0.5 * lk.g) * uProj / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
          vColor = aColor;
          vA = lk.b * fog(-mv.z) * (0.35 + 1.4 * lk.g);
        }`,
      fragmentShader: sprite,
    });
    this.dustMat = new THREE.ShaderMaterial({
      ...additive,
      uniforms: common,
      vertexShader: /* glsl */ `
        uniform float uProj;
        uniform float uTime;
        attribute float aSeed;
        varying float vA;
        ${FOG}
        void main() {
          vec3 p = position + 0.4 * vec3(sin(uTime * 0.11 + aSeed * 6.0), sin(uTime * 0.09 + aSeed * 9.0), cos(uTime * 0.1 + aSeed * 4.0));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = 0.07 * uProj / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
          vA = 0.22 * fog(-mv.z) * (0.6 + 0.4 * sin(uTime * 0.8 + aSeed * 30.0));
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() { float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; gl_FragColor = vec4(vec3(0.75, 0.82, 1.0) * vA * (1.0 - d), vA * (1.0 - d)); }`,
    });

    this.dotMat = new THREE.ShaderMaterial({
      ...additive,
      uniforms: common,
      vertexShader: /* glsl */ `
        attribute float aOwner;
        attribute float aFade;
        attribute vec3 aColor;
        uniform sampler2D uState;
        uniform float uProj;
        varying vec3 vColor;
        varying float vA;
        ${FETCH}
        ${FOG}
        void main() {
          vec4 st = fetch(uState, aOwner);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float lit = st.r * smoothstep(1.05, 0.0, aFade - st.r * 0.6);
          gl_PointSize = (0.025 + 0.11 * pow(1.0 - aFade, 1.6)) * uProj / max(0.1, -mv.z) * (1.0 + 0.5 * lit);
          gl_Position = projectionMatrix * mv;
          vColor = mix(aColor, vec3(1.0), lit * 0.5);
          vA = st.b * st.g * fog(-mv.z) * (0.16 + 0.5 * lit) * (1.0 - aFade * 0.5);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vA;
        void main() { float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; float k = exp(-d * d * 4.0); gl_FragColor = vec4(vColor * k * vA, k * vA); }`,
    });

    this.headGeo.setAttribute("position", new THREE.BufferAttribute(this.headPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.headGeo.setAttribute("aColor", new THREE.BufferAttribute(this.headCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.headGeo.setDrawRange(0, 0);

    const el = this.renderer.domElement;
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointerleave", this.onLeave);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.loop();
  }

  /* ── data ───────────────────────────────────────────────────────────────── */
  setNet(net: NeuronNet, titles: string[], colours: [number, number, number][]) {
    for (const o of [...this.group.children]) {
      this.group.remove(o);
      (o as THREE.Mesh).geometry?.dispose();
    }
    this.net = net;
    this.titles = titles;
    const N = net.n, L = net.axonFrom.length;
    this.state = stateTexture(N);
    this.links = stateTexture(L);
    for (const m of [this.somaMat, this.dendMat, this.axonMat, this.synMat, this.dotMat]) {
      m.uniforms.uState.value = this.state.tex;
      m.uniforms.uLinks.value = this.links.tex;
    }
    this.charge = new Float32Array(N);
    this.refract = new Float32Array(N);
    this.lit = new Float32Array(N).fill(1);
    this.litTarget = new Float32Array(N).fill(1);
    this.vis = new Float32Array(N).fill(1);
    this.head = new Float32Array(L).fill(-1);
    this.flash = new Float32Array(L);
    this.screen = new Float32Array(N * 3);
    this.colour = colours;

    // somas
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(net.soma, 3));
    sg.setAttribute("aSize", new THREE.BufferAttribute(net.radius, 1));
    sg.setAttribute("aIndex", new THREE.BufferAttribute(Float32Array.from({ length: N }, (_, i) => i), 1));
    sg.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.somaGeo = sg;
    const somas = new THREE.Points(sg, this.somaMat);
    somas.frustumCulled = false;
    somas.renderOrder = 4;

    // dendrites
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.BufferAttribute(net.dendPos, 3));
    dg.setAttribute("aOwner", new THREE.BufferAttribute(net.dendOwner, 1));
    dg.setAttribute("aFade", new THREE.BufferAttribute(net.dendFade, 1));
    dg.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(net.dendOwner.length * 3), 3));
    const dend = new THREE.LineSegments(dg, this.dendMat);
    dend.frustumCulled = false;
    dend.renderOrder = 1;
    const dots = new THREE.Points(dg, this.dotMat);
    dots.frustumCulled = false;

    // axons, as segments between consecutive samples
    let segs = 0;
    for (let li = 0; li < L; li++) segs += net.axonCount[li] - 1;
    const ap = new Float32Array(segs * 6), at = new Float32Array(segs * 2), al = new Float32Array(segs * 2);
    let o = 0;
    for (let li = 0; li < L; li++) {
      const s0 = net.axonStart[li], c = net.axonCount[li];
      for (let k = 0; k < c - 1; k++, o++) {
        for (let e = 0; e < 2; e++) {
          const q = (s0 + k + e) * 3;
          ap[o * 6 + e * 3] = net.axonPts[q];
          ap[o * 6 + e * 3 + 1] = net.axonPts[q + 1];
          ap[o * 6 + e * 3 + 2] = net.axonPts[q + 2];
          at[o * 2 + e] = (k + e) / (c - 1);
          al[o * 2 + e] = li;
        }
      }
    }
    const ag = new THREE.BufferGeometry();
    ag.setAttribute("position", new THREE.BufferAttribute(ap, 3));
    ag.setAttribute("aT", new THREE.BufferAttribute(at, 1));
    ag.setAttribute("aLink", new THREE.BufferAttribute(al, 1));
    ag.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(segs * 6), 3));
    const axons = new THREE.LineSegments(ag, this.axonMat);
    axons.frustumCulled = false;
    axons.renderOrder = 2;

    // synapses, at the end of every axon
    const sp = new Float32Array(L * 3);
    for (let li = 0; li < L; li++) {
      const q = (net.axonStart[li] + net.axonCount[li] - 1) * 3;
      sp.set(net.axonPts.subarray(q, q + 3), li * 3);
    }
    const yg = new THREE.BufferGeometry();
    yg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    yg.setAttribute("aLink", new THREE.BufferAttribute(Float32Array.from({ length: L }, (_, i) => i), 1));
    yg.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(L * 3), 3));
    const syn = new THREE.Points(yg, this.synMat);
    syn.frustumCulled = false;
    syn.renderOrder = 3;

    const heads = new THREE.Points(this.headGeo, this.headMat);
    heads.frustumCulled = false;
    heads.renderOrder = 5;

    // the fluid round the cells: faint motes
    const D = this.reduced ? 600 : 1800;
    const dp = new Float32Array(D * 3), ds = new Float32Array(D);
    for (let i = 0; i < D; i++) {
      const r = net.extent * 1.5 * Math.cbrt(Math.random());
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      dp[i * 3] = net.centre[0] + r * Math.sin(ph) * Math.cos(th);
      dp[i * 3 + 1] = net.centre[1] + r * Math.cos(ph);
      dp[i * 3 + 2] = net.centre[2] + r * Math.sin(ph) * Math.sin(th);
      ds[i] = Math.random();
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
    mg.setAttribute("aSeed", new THREE.BufferAttribute(ds, 1));
    const dust = new THREE.Points(mg, this.dustMat);
    dust.frustumCulled = false;

    this.group.add(dust, dend, axons, syn, somas, heads, dots);
    this.setColors(colours);

    // frame it, and fly in from far out
    this.controls.target.set(...net.centre);
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = net.extent * 5;
    this.intro = 0;
    this.placeCamera(0);
    // a few cells fire at once, so the net is alive from the first frame
    for (let k = 0; k < Math.min(6, N); k++) this.fire(Math.floor(this.rnd() * N));
  }

  setColors(colours: [number, number, number][]) {
    this.colour = colours;
    const net = this.net;
    if (!net) return;
    const put = (attr: THREE.BufferAttribute, idx: (k: number) => number, light = 0) => {
      const a = attr.array as Float32Array;
      for (let k = 0; k < attr.count; k++) {
        const c = colours[idx(k)] ?? [1, 1, 1];
        a[k * 3] = c[0] + (1 - c[0]) * light;
        a[k * 3 + 1] = c[1] + (1 - c[1]) * light;
        a[k * 3 + 2] = c[2] + (1 - c[2]) * light;
      }
      attr.needsUpdate = true;
    };
    const [, dend, axons, syn, somas] = this.group.children as THREE.Points[];
    put(somas.geometry.getAttribute("aColor") as THREE.BufferAttribute, (k) => k, 0.15);
    put(dend.geometry.getAttribute("aColor") as THREE.BufferAttribute, (k) => net.dendOwner[k]);
    const al = axons.geometry.getAttribute("aLink").array as Float32Array;
    put(axons.geometry.getAttribute("aColor") as THREE.BufferAttribute, (k) => net.axonFrom[al[k]], 0.2);
    put(syn.geometry.getAttribute("aColor") as THREE.BufferAttribute, (k) => net.axonTo[k], 0.4);
  }

  /** Lit notes (search, a note and its links, an answer) stay bright; the rest dim. */
  setLit(noteLit: Uint8Array | null) {
    this.anyLit = !!noteLit && noteLit.some((v) => v > 0);
    for (let i = 0; i < this.litTarget.length; i++) this.litTarget[i] = !this.anyLit ? 1 : noteLit![i] ? 1.25 : 0.16;
    this.syncLabels(noteLit);
  }

  setHidden(hidden: Uint8Array | null) {
    for (let i = 0; i < this.vis.length; i++) this.vis[i] = hidden?.[i] ? 0 : 1;
  }

  setView(v: { turning: boolean; speed: number }) {
    this.view = v;
  }

  /** Pull the camera away from the net: the way out of the neuron view. */
  leave() {
    if (this.outro >= 0) return;
    this.outro = 0;
    this.outroStart = performance.now();
    this.outroFrom = this.camera.position.clone().sub(this.controls.target);
    this.controls.enabled = false;
  }

  /** Send an impulse down every axon that leaves neuron i. */
  fire(i: number, force = false) {
    const net = this.net;
    if (!net || !this.vis[i] || (!force && this.refract[i] > 0)) return;
    this.charge[i] = 1;
    this.refract[i] = 0.8;
    const out = net.outAxons[i];
    const max = force ? out.length : 7;
    for (let k = 0; k < out.length && k < max; k++) {
      const li = out[(k + Math.floor(this.rnd() * out.length)) % out.length];
      if (this.head[li] < 0 && this.vis[net.axonTo[li]]) this.head[li] = 0;
    }
  }

  /** The net, drawn at `ratio` times the CSS size, for a picture. */
  snapshot(ratio: number): HTMLCanvasElement {
    const was = this.renderer.getPixelRatio();
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.uniformsFor(h, ratio);
    this.renderer.render(this.scene, this.camera);
    const out = document.createElement("canvas");
    out.width = this.renderer.domElement.width;
    out.height = this.renderer.domElement.height;
    out.getContext("2d")!.drawImage(this.renderer.domElement, 0, 0);
    this.renderer.setPixelRatio(was);
    this.resize();
    return out;
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
    this.controls.dispose();
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    for (const m of [this.somaMat, this.dendMat, this.axonMat, this.headMat, this.synMat, this.dustMat, this.dotMat]) m.dispose();
    this.state.tex.dispose();
    this.links.tex.dispose();
    this.renderer.dispose();
    el.remove();
    for (const l of this.labelEls.values()) l.remove();
  }

  /* ── frame ──────────────────────────────────────────────────────────────── */
  private resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.uniformsFor(h, this.renderer.getPixelRatio());
  }

  private uniformsFor(h: number, px: number) {
    const proj = (h * px) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    this.proj = proj;
    for (const m of [this.somaMat, this.headMat, this.synMat, this.dustMat, this.dotMat]) m.uniforms.uProj.value = proj;
  }

  private placeCamera(k: number) {
    const net = this.net;
    if (!net) return;
    // from far beyond, in through the net to where all of it is in view
    const e = 1 - Math.pow(1 - Math.min(1, k), 3);
    const far = net.extent * 5.2, near = net.extent * (this.camera.aspect < 1 ? 2.2 : 1.55);
    const d = far + (near - far) * e;
    const ang = 0.9 * (1 - e);
    const c = net.centre;
    this.camera.position.set(c[0] + Math.sin(ang) * d, c[1] + d * (0.18 + 0.2 * (1 - e)), c[2] + Math.cos(ang) * d);
    this.camera.lookAt(c[0], c[1], c[2]);
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    this.timer.update();
    const dt = Math.min(0.05, this.timer.getDelta());
    const t = this.timer.getElapsed();
    const net = this.net;
    if (net) {
      if (this.outro >= 0) {
        // leaving: away from the net, faster and faster, the way it came in
        this.outro = Math.min(1, (performance.now() - this.outroStart) / 800);
        const e = this.outro * this.outro;
        this.camera.position.copy(this.controls.target).add(this.outroFrom!.clone().multiplyScalar(1 + 4.5 * e));
        this.camera.lookAt(this.controls.target);
      } else if (this.intro < 1) {
        this.intro = Math.min(1, this.intro + dt / 1.9);
        this.placeCamera(this.intro);
      }
      this.step(dt);
    }
    this.controls.autoRotate = this.view.turning && !this.reduced && this.intro >= 1 && this.outro < 0;
    this.controls.autoRotateSpeed = 0.45 * (this.view.speed / 100);
    if (this.intro >= 1 && this.outro < 0) this.controls.update();
    const dist = this.camera.position.distanceTo(this.controls.target);
    for (const m of [this.somaMat, this.dendMat, this.axonMat, this.headMat, this.synMat, this.dustMat, this.dotMat]) {
      m.uniforms.uTime.value = t;
      m.uniforms.uNear.value = Math.max(0.5, dist - (net?.extent ?? 10) * 0.4);
      m.uniforms.uFar.value = dist + (net?.extent ?? 10) * 1.6;
    }
    this.renderer.render(this.scene, this.camera);
    this.placeLabels();
  };

  private step(dt: number) {
    const net = this.net!;
    const N = net.n, L = net.axonFrom.length;
    const speed = this.reduced ? 3.2 : 6.5; // world units a second
    // impulses travel; arriving ones charge the cell they land on
    let heads = 0;
    for (let li = 0; li < L; li++) {
      if (this.flash[li] > 0.002) this.flash[li] *= Math.exp(-dt * 4.5);
      else this.flash[li] = 0;
      if (this.head[li] < 0) continue;
      this.head[li] += (dt * speed) / Math.max(0.3, net.axonLength[li]);
      if (this.head[li] >= 1) {
        this.head[li] = -1;
        this.flash[li] = 1;
        const b = net.axonTo[li];
        this.charge[b] = Math.min(1.4, this.charge[b] + 0.42);
        if (this.charge[b] > 0.8 && this.refract[b] <= 0 && this.rnd() < (this.reduced ? 0.25 : 0.55)) this.fire(b);
        continue;
      }
      if (heads < MAX_HEADS) {
        const c = net.axonCount[li], s0 = net.axonStart[li];
        const x = this.head[li] * (c - 1);
        const k = Math.min(c - 2, Math.floor(x)), f = x - k;
        const q = (s0 + k) * 3;
        for (let e = 0; e < 3; e++) this.headPos[heads * 3 + e] = net.axonPts[q + e] + (net.axonPts[q + 3 + e] - net.axonPts[q + e]) * f;
        const col = this.colour[net.axonFrom[li]] ?? [1, 1, 1];
        for (let e = 0; e < 3; e++) this.headCol[heads * 3 + e] = 0.5 + 0.5 * col[e];
        heads++;
      }
    }
    this.headGeo.setDrawRange(0, heads);
    (this.headGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.headGeo.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;

    // cells cool, recover, and now and then fire on their own (lit ones far more)
    const base = Math.max(0.015, Math.min(0.14, (this.reduced ? 1.2 : 3.4) / Math.max(1, N)));
    const busy = heads > MAX_HEADS * 0.8;
    for (let i = 0; i < N; i++) {
      this.charge[i] *= Math.exp(-dt * 1.7);
      this.refract[i] -= dt;
      this.lit[i] += (this.litTarget[i] - this.lit[i]) * Math.min(1, dt * 4);
      if (!busy && this.vis[i]) {
        const rate = base * (this.anyLit ? (this.litTarget[i] > 1 ? 9 : 0.25) : 1);
        if (this.rnd() < rate * dt) this.fire(i);
      }
    }

    // hand the state to the shaders
    const sd = this.state.data;
    for (let i = 0; i < N; i++) {
      sd[i * 4] = Math.min(1.2, this.charge[i]);
      sd[i * 4 + 1] = this.lit[i];
      sd[i * 4 + 2] = this.vis[i];
    }
    this.state.tex.needsUpdate = true;
    const ld = this.links.data;
    for (let li = 0; li < L; li++) {
      const a = net.axonFrom[li], b = net.axonTo[li];
      ld[li * 4] = this.head[li];
      ld[li * 4 + 1] = this.flash[li];
      ld[li * 4 + 2] = this.vis[a] * this.vis[b] * Math.min(1.2, Math.max(this.lit[a], this.lit[b] * 0.8));
    }
    this.links.tex.needsUpdate = true;
  }

  /* ── labels for the lit cells ───────────────────────────────────────────── */
  private syncLabels(noteLit: Uint8Array | null) {
    const want = new Set<number>();
    if (noteLit) {
      const strong: number[] = [], rest: number[] = [];
      noteLit.forEach((v, i) => (v === 2 ? strong : v ? rest : null)?.push(i));
      for (const i of [...strong, ...rest].slice(0, 18)) want.add(i);
    }
    for (const [i, el] of this.labelEls) if (!want.has(i)) (el.remove(), this.labelEls.delete(i));
    for (const i of want) {
      if (this.labelEls.has(i)) continue;
      const el = document.createElement("div");
      el.className = `brain-label${noteLit?.[i] === 2 ? " strong" : ""}`;
      el.textContent = this.titles[i] ?? "";
      this.labelHost.appendChild(el);
      this.labelEls.set(i, el);
    }
  }

  private placeLabels() {
    if (!this.net) return;
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const v = new THREE.Vector3();
    for (const [i, el] of this.labelEls) {
      v.set(this.net.soma[i * 3], this.net.soma[i * 3 + 1], this.net.soma[i * 3 + 2]).project(this.camera);
      const off = v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1;
      el.style.display = off ? "none" : "";
      el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
      el.style.opacity = String(Math.min(1, this.intro * 1.5));
    }
  }

  /* ── pointer ────────────────────────────────────────────────────────────── */
  private nearest(cx: number, cy: number): number | null {
    const net = this.net;
    if (!net) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    const x = cx - r.left, y = cy - r.top;
    const v = new THREE.Vector3();
    let best: number | null = null, bd = Infinity;
    for (let i = 0; i < net.n; i++) {
      if (!this.vis[i]) continue;
      v.set(net.soma[i * 3], net.soma[i * 3 + 1], net.soma[i * 3 + 2]).project(this.camera);
      if (v.z > 1) continue;
      const sx = ((v.x + 1) / 2) * r.width, sy = ((1 - v.y) / 2) * r.height;
      const d = Math.hypot(sx - x, sy - y);
      const depth = Math.max(0.1, this.camera.position.distanceTo(v.set(net.soma[i * 3], net.soma[i * 3 + 1], net.soma[i * 3 + 2])));
      const reach = 14 + (net.radius[i] * 6 * this.proj * 0.32) / depth / this.renderer.getPixelRatio();
      if (d < reach && d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  private onMove = (e: PointerEvent) => {
    const i = this.nearest(e.clientX, e.clientY);
    if (i !== this.hoverI) {
      this.hoverI = i;
      this.renderer.domElement.style.cursor = i == null ? "" : "pointer";
    }
    this.cbs.onHover(i, e.clientX, e.clientY);
  };
  private onDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY };
  };
  private onUp = (e: PointerEvent) => {
    if (!this.down || Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5) return (this.down = null);
    this.down = null;
    const i = this.nearest(e.clientX, e.clientY);
    if (i != null) this.fire(i, true);
    this.cbs.onPick(i);
  };
  private onLeave = () => {
    this.hoverI = null;
    this.cbs.onHover(null, 0, 0);
  };
}
