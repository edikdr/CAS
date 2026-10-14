/*
 * core/guitar/gl-guitar.js - the WebGL guitar (desktop). Loaded only through dynamic import()
 * by GuitarStage; it imports the vendored Three.js (vendor/three, resolved by the import map in
 * index.html), so phones never download either.
 *
 * Public API: await createGlGuitar(slot, { onFail }) -> { pluck(strength, direction), flip(), enableTilt(), destroy() }
 *   onFail(): called if the WebGL context is lost later, or if more than half of the first 60
 *   animated frames take > 50 ms (a slow GPU); GuitarStage then falls back to the DOM guitar.
 *
 * Scene: the optimized Meshy model (assets/models/guitar.glb, tools/optimize_glb.mjs), <= 3 lights
 * (rose hemisphere, warm key from the garlands, cool rim), no shadows, DPR <= 1.5, transparent canvas
 * over the room. Strings are NOT in the mesh: six thin ribbons placed nut -> saddle (positions from
 * the DOM manifest, projected onto the model by ray casts) and bent by a vertex shader driven by
 * pluck(). Rendering is on demand: a frame is drawn only while strings ring, the guitar turns or
 * tilts (the shared Loop sleeps otherwise). The idle sway is a CSS animation of the canvas.
 * Reduced motion: no tilt, flip is instant, strings stay still. destroy() disposes everything.
 */

import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { Loop } from '../loop.js';
import { Motion } from '../motion.js';
import { fetchJson } from '../fetch-json.js';
import { createTilt } from './tilt.js';
import { forceGl } from '../capability.js';

const MODEL = new URL('../../assets/models/guitar.glb', import.meta.url);
const MANIFEST = new URL('../../assets/guitar/dom/manifest.json', import.meta.url);
const MAX_DPR = 1.5;
const VIEW_ASPECT = 0.62;   // canvas width / height: room for the guitar to turn and tilt
const FOV = 24;
const MARGIN = 1.08;        // canvas height / guitar height
const RING_S = [1.5, 1.4, 1.3, 1.15, 1.0, 0.9];
const FREQ = [9, 10, 11, 12.5, 14, 15];   // visual shimmer, Hz
const COLORS = [0xd9b98c, 0xd9b98c, 0xd9b98c, 0xd9b98c, 0xe6e3ec, 0xe6e3ec];
const WIDTH = [0.0024, 0.0021, 0.0019, 0.0017, 0.0015, 0.0013];   // x guitar height

const VERT = /* glsl */ `
  uniform float uAmp;
  uniform float uPhase;
  varying float vAcross;
  void main() {
    vec3 p = position;
    p.x += uAmp * sin(3.14159265 * uv.y) * sin(uPhase);
    vAcross = uv.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uGlow;
  varying float vAcross;
  void main() {
    float core = 1.0 - abs(vAcross * 2.0 - 1.0);
    gl_FragColor = vec4(uColor * (0.55 + 0.6 * core + uGlow), 1.0);
  }`;

export async function createGlGuitar(slot, { onFail } = {}) {
  const [gltf, manifest] = await Promise.all([new GLTFLoader().loadAsync(MODEL.href), fetchJson(MANIFEST)]);

  const root = document.createElement('div');
  root.className = 'guitar guitar-gl';
  root.style.aspectRatio = String(VIEW_ASPECT);
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', 'An acoustic guitar in 3D. Drag to turn it, tap to see the back.');
  root.innerHTML = '<div class="guitar__shadow"></div><div class="guitar__sway"></div>';
  const sway = root.querySelector('.guitar__sway');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: !forceGl });
  renderer.setPixelRatio(Math.min(MAX_DPR, devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  sway.append(renderer.domElement);
  slot.append(root);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, VIEW_ASPECT, 0.1, 50);
  const hemi = new THREE.HemisphereLight(0xffe2ea, 0x2a1a26, 1.1);
  const key = new THREE.DirectionalLight(0xffe6dc, 2.2);
  key.position.set(-1.4, 2.4, 2.6);
  const rim = new THREE.DirectionalLight(0xc8b8ff, 0.9);
  rim.position.set(1.8, 1.2, -2.5);
  scene.add(hemi, key, rim);

  // model: centred, front face towards the camera (+Z)
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.position.sub(box.getCenter(new THREE.Vector3()));
  model.traverse((o) => {
    if (o.isMesh && o.material) {
      o.material.roughness = 0.55;
      o.material.metalness = 0;
    }
  });
  const flipper = new THREE.Group();
  const pivot = new THREE.Group();
  flipper.add(model);
  pivot.add(flipper);
  scene.add(pivot);
  camera.position.set(0, 0, (size.y * MARGIN) / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
  camera.lookAt(0, 0, 0);

  // strings: manifest (front photo) coordinates -> model bounding box -> ray cast onto the surface
  scene.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const toModel = ([x, y]) => new THREE.Vector2(
    -size.x / 2 + (x / manifest.canvas.w) * size.x,
    size.y / 2 - (y / manifest.canvas.h) * size.y,
  );
  const surface = (p, lift) => {
    ray.set(new THREE.Vector3(p.x, p.y, size.z * 2), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObject(model, true)[0];
    return new THREE.Vector3(p.x, p.y, (hit ? hit.point.z : size.z / 2) + lift);
  };
  const strings = manifest.strings.map((s, i) => {
    const a = surface(toModel(s.nut), size.z * 0.03);
    const b = surface(toModel(s.saddle), size.z * 0.05);
    const dir = new THREE.Vector3().subVectors(b, a);
    const geometry = new THREE.PlaneGeometry(WIDTH[i] * size.y, dir.length(), 1, 32);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uAmp: { value: 0 }, uPhase: { value: 0 }, uColor: { value: new THREE.Color(COLORS[i]) }, uGlow: { value: 0 } },
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
    flipper.add(mesh);
    return { material, start: -1, amp: 0 };
  });

  // ---- on-demand rendering -----------------------------------------------------------------
  let flipped = false;
  let turn = 0;
  let stop = null;
  const keyBase = key.intensity;
  const watch = { frames: 0, slow: 0 }; // first 60 animated frames: mostly > 50 ms -> too slow here

  function frame(now, dt) {
    let busy = false;
    let ring = 0;
    for (let i = 0; i < strings.length; i++) {
      const s = strings[i];
      if (s.start < 0) continue;
      const t = (now - s.start) / 1000;
      if (t < 0) { busy = true; continue; }
      const env = Math.exp((-4 * t) / RING_S[i]);
      if (env < 0.01) { s.start = -1; s.material.uniforms.uAmp.value = 0; s.material.uniforms.uGlow.value = 0; continue; }
      s.material.uniforms.uAmp.value = s.amp * env;
      s.material.uniforms.uPhase.value = 2 * Math.PI * FREQ[i] * t;
      s.material.uniforms.uGlow.value = 0.35 * env;
      ring = Math.max(ring, env * (s.amp / (size.y * 0.004)));
      busy = true;
    }
    key.intensity = keyBase * (1 + 0.12 * ring);
    const want = flipped ? Math.PI : 0;
    if (Math.abs(want - turn) > 0.001) {
      turn += (want - turn) * 0.12;
      busy = true;
    } else turn = want;
    flipper.rotation.y = turn;
    renderer.render(scene, camera);
    if (busy && watch.frames < 60) {
      watch.frames++;
      if (dt > 50) watch.slow++;
      if (watch.frames === 60 && watch.slow > 30 && !forceGl) onFail?.();
    }
    if (!busy) stop = null;
    return busy;
  }
  const request = () => { if (!stop) stop = Loop.add(frame); };

  const resize = () => {
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    request();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(root);

  const flip = () => {
    flipped = !flipped;
    if (Motion.reduced) turn = flipped ? Math.PI : 0;
    request();
  };
  const tilt = createTilt(root, {
    onAngle: (x, y) => {
      pivot.rotation.set(THREE.MathUtils.degToRad(x), THREE.MathUtils.degToRad(y), 0);
      request();
    },
    onFlip: flip,
  });

  const lost = (e) => { e.preventDefault(); onFail?.(); };
  renderer.domElement.addEventListener('webglcontextlost', lost);
  resize();

  return {
    pluck(strength = 0.6, direction = 'down') {
      if (Motion.reduced) return;
      const s = Math.max(0, Math.min(1, strength));
      const gap = 16 - s * 8;
      const now = performance.now();
      strings.forEach((str, i) => {
        const order = direction === 'up' ? strings.length - 1 - i : i;
        str.start = now + order * gap;
        str.amp = size.y * 0.004 * (0.4 + s * 0.6);
      });
      request();
    },
    flip,
    enableTilt: () => tilt.enableOrientation(),
    destroy() {
      stop?.();
      tilt.destroy();
      observer.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      scene.traverse((o) => {
        o.geometry?.dispose();
        for (const m of [].concat(o.material || [])) {
          for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
          m.dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      root.remove();
    },
  };
}
