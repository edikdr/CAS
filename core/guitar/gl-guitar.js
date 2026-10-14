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
 * over the room, laid horizontally (headstock right). Strings are NOT in the mesh: six ribbons placed
 * nut -> saddle (positions from the DOM manifest, projected onto the model by ray casts), shaded as
 * round strings with a soft shadow on the top, and bent in a vertex shader by ./string-physics.js:
 * music onsets pluck them, a finger can pull one a little (it springs back). Rendering is on
 * demand: a frame is drawn only while strings move, the guitar turns or tilts (the shared Loop
 * sleeps otherwise). The idle sway is a CSS animation of the canvas.
 * Reduced motion: no tilt, flip is instant, strings stay still. destroy() disposes everything.
 */

import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { Loop } from '../loop.js';
import { Motion } from '../motion.js';
import { fetchJson } from '../fetch-json.js';
import { createTilt } from './tilt.js';
import { forceGl } from '../capability.js';
import { createStringPhysics } from './string-physics.js';

const MODEL = new URL('../../assets/models/guitar.glb', import.meta.url);
const MANIFEST = new URL('../../assets/guitar/dom/manifest.json', import.meta.url);
const MAX_DPR = 1.5;
const VIEW_RATIO = 0.62;    // canvas height / width: room for the guitar to turn and tilt
const FOV = 24;             // vertical
const MARGIN = 1.08;        // canvas width / guitar length
const COLORS = [0xcfa772, 0xcfa772, 0xcfa772, 0xcfa772, 0xdcdbe4, 0xdcdbe4];
const WIDTH = [0.0042, 0.0037, 0.0033, 0.0028, 0.0023, 0.0020];   // x guitar length
const WOUND = 4;
const PULL = 0.011;         // x guitar length: the most a finger moves a string before it resists
const SLIP = 2;             // pulled beyond SLIP x PULL, the string slips off and rings
const REACH = 9;            // screen px to catch a string

// offset * shape(u): the profile from ./string-physics.js, evaluated on the GPU
const VERT = /* glsl */ `
  uniform float uOffset;
  uniform float uPoint;
  uniform float uMix;
  varying float vAcross;
  varying float vAlong;
  void main() {
    vec3 p = position;
    float u = 1.0 - uv.y;
    float tri = u <= uPoint ? u / uPoint : (1.0 - u) / (1.0 - uPoint);
    p.x += uOffset * mix(tri, sin(3.14159265 * u), uMix);
    vAcross = uv.x;
    vAlong = u;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
// a round string: cylinder shading, a highlight towards the garlands (screen-up = local -x),
// ridges along the wound strings, a little extra light while it swings fast
const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uWound;
  uniform float uRidges;
  uniform float uSpeed;
  varying float vAcross;
  varying float vAlong;
  void main() {
    float n = vAcross * 2.0 - 1.0;
    float body = sqrt(max(0.0, 1.0 - n * n));
    float spec = pow(max(0.0, 1.0 - abs(n + 0.35) * 3.0), 4.0);
    float ridge = uWound * (0.5 + 0.5 * sin(vAlong * uRidges));
    vec3 c = uColor * (0.28 + 0.8 * body) * (1.0 - 0.2 * ridge) + vec3(spec * (0.55 + 0.3 * ridge) + uSpeed);
    gl_FragColor = vec4(c, 1.0);
  }`;
const SHADOW_FRAG = /* glsl */ `
  varying float vAcross;
  void main() {
    float n = vAcross * 2.0 - 1.0;
    gl_FragColor = vec4(0.12, 0.06, 0.04, 0.32 * (1.0 - n * n));
  }`;

export async function createGlGuitar(slot, { onFail } = {}) {
  const [gltf, manifest] = await Promise.all([new GLTFLoader().loadAsync(MODEL.href), fetchJson(MANIFEST)]);

  const root = document.createElement('div');
  root.className = 'guitar guitar-gl';
  root.style.setProperty('--ratio', String(VIEW_RATIO));
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', 'An acoustic guitar in 3D. Touch the strings, drag to turn it, tap to see the back.');
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
  const camera = new THREE.PerspectiveCamera(FOV, 1 / VIEW_RATIO, 0.1, 50);
  const hemi = new THREE.HemisphereLight(0xffe2ea, 0x2a1a26, 1.1);
  const key = new THREE.DirectionalLight(0xffe6dc, 2.2);
  key.position.set(-1.4, 2.4, 2.6);
  const rim = new THREE.DirectionalLight(0xc8b8ff, 0.9);
  rim.position.set(1.8, 1.2, -2.5);
  scene.add(hemi, key, rim);

  // model: centred, front face towards the camera (+Z); laid down 90 deg clockwise (headstock
  // right, low E on top, as a player holds it); flips over its long axis
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
  const lay = new THREE.Group();
  const pivot = new THREE.Group();
  flipper.add(model);
  lay.add(flipper);
  lay.rotation.z = -Math.PI / 2;
  pivot.add(lay);
  scene.add(pivot);
  const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV / 2)) / VIEW_RATIO);
  camera.position.set(0, 0, (size.y * MARGIN) / 2 / Math.tan(hfov / 2));
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
  const physics = createStringPhysics(manifest.strings.length);
  const pullWorld = size.y * PULL;
  const strings = manifest.strings.map((s, i) => {
    const a = surface(toModel(s.nut), size.z * 0.03);
    const b = surface(toModel(s.saddle), size.z * 0.05);
    const dir = new THREE.Vector3().subVectors(b, a);
    const width = WIDTH[i] * size.y;
    const geometry = new THREE.PlaneGeometry(width, dir.length(), 1, 40);
    const uniforms = {
      uOffset: { value: 0 }, uPoint: { value: 0.7 }, uMix: { value: 1 }, uSpeed: { value: 0 },
      uColor: { value: new THREE.Color(COLORS[i]) }, uWound: { value: i < WOUND ? 1 : 0 }, uRidges: { value: 900 },
    };
    const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms }));
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
    // its shadow on the top: same bend, offset towards screen-down (local +x), just above the wood
    const shadowUniforms = { uOffset: { value: 0 }, uPoint: uniforms.uPoint, uMix: uniforms.uMix };
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 1.8, dir.length(), 1, 40),
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: SHADOW_FRAG, uniforms: shadowUniforms, transparent: true, depthWrite: false }),
    );
    shadow.position.copy(mesh.position);
    shadow.position.z -= size.z * 0.03;
    shadow.quaternion.copy(mesh.quaternion);
    shadow.translateX(width * 1.4);
    flipper.add(shadow, mesh);
    return { mesh, uniforms, shadowUniforms };
  });

  // ---- on-demand rendering -----------------------------------------------------------------
  let flipped = false;
  let turn = 0;
  let stop = null;
  const keyBase = key.intensity;
  const watch = { frames: 0, slow: 0 }; // first 60 animated frames: mostly > 50 ms -> too slow here

  function frame(now, dt) {
    let busy = physics.step(dt);
    let ring = 0;
    strings.forEach((str, i) => {
      const st = physics.state(i);
      str.uniforms.uOffset.value = st.offset * pullWorld;
      str.shadowUniforms.uOffset.value = st.offset * pullWorld * 0.7;
      str.uniforms.uPoint.value = st.point;
      str.uniforms.uMix.value = st.mix;
      str.uniforms.uSpeed.value = Math.min(0.25, st.speed * 0.012);
      ring = Math.max(ring, Math.min(1, Math.abs(st.offset)));
    });
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
  // pressing the strings: project each string to the screen and work in screen px
  let held = -1;
  const toScreen = (v, rect) => {
    const p = v.project(camera);
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  };
  const screenStrings = () => {
    scene.updateMatrixWorld(true);
    const rect = renderer.domElement.getBoundingClientRect();
    return strings.map(({ mesh }) => {
      const half = mesh.geometry.parameters.height / 2;
      const a = toScreen(mesh.localToWorld(new THREE.Vector3(0, half, 0)), rect);
      const b = toScreen(mesh.localToWorld(new THREE.Vector3(0, -half, 0)), rect);
      const m = toScreen(mesh.localToWorld(new THREE.Vector3(0, 0, 0)), rect);
      const q = toScreen(mesh.localToWorld(new THREE.Vector3(pullWorld, 0, 0)), rect);
      return { a, b, pull: { x: q.x - m.x, y: q.y - m.y } };
    });
  };
  const locate = (s, e) => {
    const abx = s.b.x - s.a.x;
    const aby = s.b.y - s.a.y;
    const len2 = abx * abx + aby * aby;
    const u = ((e.clientX - s.a.x) * abx + (e.clientY - s.a.y) * aby) / len2;
    const cx = s.a.x + abx * u;
    const cy = s.a.y + aby * u;
    const p2 = s.pull.x * s.pull.x + s.pull.y * s.pull.y;
    const pull = ((e.clientX - cx) * s.pull.x + (e.clientY - cy) * s.pull.y) / p2;
    return { u, pull, px: Math.hypot(e.clientX - cx, e.clientY - cy) };
  };
  const follow = (e) => {
    const all = screenStrings();
    if (held >= 0) {
      const h = locate(all[held], e);
      if (Math.abs(h.pull) > SLIP || h.u < 0.02 || h.u > 0.98) { physics.release(held); held = -1; }
      else physics.grab(held, h.u, h.pull);
    }
    if (held < 0) {
      let best = -1;
      let hit = null;
      all.forEach((s, i) => {
        const h = locate(s, e);
        if (h.u > 0.03 && h.u < 0.97 && (!hit || h.px < hit.px)) { hit = h; best = i; }
      });
      if (hit && hit.px <= REACH) { held = best; physics.grab(held, hit.u, hit.pull); }
    }
    request();
  };
  const grab = {
    down(e) {
      if (Motion.reduced || flipped) return false;
      held = -1;
      follow(e);
      return held >= 0;
    },
    move: follow,
    up() { if (held >= 0) physics.release(held); held = -1; request(); },
  };

  const tilt = createTilt(root, {
    onAngle: (x, y) => {
      pivot.rotation.set(THREE.MathUtils.degToRad(x), THREE.MathUtils.degToRad(y), 0);
      request();
    },
    onFlip: flip,
    grab,
  });

  const lost = (e) => { e.preventDefault(); onFail?.(); };
  renderer.domElement.addEventListener('webglcontextlost', lost);
  resize();

  return {
    pluck(strength = 0.6, direction = 'down') {
      if (Motion.reduced) return;
      const s = Math.max(0, Math.min(1, strength));
      const gap = 16 - s * 8;
      strings.forEach((_, i) => physics.pluck(i, s, (direction === 'up' ? strings.length - 1 - i : i) * gap));
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
