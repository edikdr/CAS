/*
 * core/guitar/gl-guitar.js - the WebGL guitar (desktop). Loaded only through dynamic import()
 * by GuitarStage; it imports the vendored Three.js (vendor/three, resolved by the import map in
 * index.html), so phones never download either.
 *
 * Public API: await createGlGuitar(slot, { onFail }) -> { pluck(strength, direction), flip(), enableTilt(), destroy() }
 *   onFail(): called if the WebGL context is lost later, or if more than half of the first 60
 *   animated frames take > 50 ms (a slow GPU); GuitarStage then falls back to the DOM guitar.
 *
 * Scene: the optimized Meshy model (assets/models/guitar.glb, tools/optimize_glb.mjs), no shadows,
 * DPR <= 1.5, transparent canvas over the room, laid horizontally (headstock right). Light: 3 lights.
 * The room is a dim hemisphere (always on; the CSS room shade takes the room to 25% when the
 * garland is off, so the hemisphere then fills in for the garland's share). The string
 * lights are two point lights with real distance falloff, each at the centre of the stars on its
 * half of the screen: the stars' screen positions (LightRig.lights) are projected into the scene
 * just in front of the guitar's top, so the light comes from where the stars are drawn - it grazes
 * the top from above, lights the upper edge most and fades towards the lower one, and moves over
 * the guitar as it tilts or turns. They fade with the wall switch (and flicker on, like the bloom). Strings are NOT in the mesh: six ribbons placed
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
import { LightRig } from '../light-rig.js';

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
const ROOM = 0.85;          // hemisphere: the room's own light ...
const ROOM_OFF = 2.4;       // ... with the garland off: the room keeps 25% overall (the CSS shade
                            // does that), so the guitar matches the photo guitar's off state
const GARLAND = 0.55;       // candela per star (14 stars over two point lights)
const GARLAND_COLOR = 0xffd9df;   // --c-light, a touch warmer
const BULB_LIFT = 0.12;     // x guitar length: how far the stars hang in front of the guitar's top
const FADE_ON = 140;        // ms, as styles/tokens.css --m-switch-on / --m-switch-off
const FADE_OFF = 320;
const FLICKER = [[0, 0.45], [0.2, 1], [0.38, 0.72], [0.6, 1], [0.78, 0.9], [1, 1]];   // as LightRig's, over 300 ms

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
// a round string: cylinder shading, a highlight towards the garlands (screen-up = local -x) that
// goes out with them (uLight), ridges along the wound strings, a little extra light while it swings
const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uWound;
  uniform float uRidges;
  uniform float uSpeed;
  uniform float uLight;
  varying float vAcross;
  varying float vAlong;
  void main() {
    float n = vAcross * 2.0 - 1.0;
    float body = sqrt(max(0.0, 1.0 - n * n));
    float spec = pow(max(0.0, 1.0 - abs(n + 0.35) * 3.0), 4.0) * uLight;
    float ridge = uWound * (0.5 + 0.5 * sin(vAlong * uRidges));
    vec3 c = uColor * (0.28 + 0.8 * body) * (0.55 + 0.45 * uLight) * (1.0 - 0.2 * ridge) + vec3(spec * (0.55 + 0.3 * ridge) + uSpeed * uLight);
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
  const room = new THREE.HemisphereLight(0xf2dce6, 0x1c121b, ROOM);
  const bulbs = [0, 1].map(() => new THREE.PointLight(GARLAND_COLOR, 0, 0, 2));
  scene.add(room, ...bulbs);

  // model: centred, front face towards the camera (+Z); laid down 90 deg clockwise (headstock
  // right, low E on top, as a player holds it); flips over its long axis
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.position.sub(box.getCenter(new THREE.Vector3()));
  model.traverse((o) => {
    if (o.isMesh && o.material) {
      o.material.roughness = 0.45;   // satin lacquer: a soft sheen where the string lights graze it
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
  const lit = { value: 1 };   // garland light on the strings, shared by all six
  const strings = manifest.strings.map((s, i) => {
    const a = surface(toModel(s.nut), size.z * 0.03);
    const b = surface(toModel(s.saddle), size.z * 0.05);
    const dir = new THREE.Vector3().subVectors(b, a);
    const width = WIDTH[i] * size.y;
    const geometry = new THREE.PlaneGeometry(width, dir.length(), 1, 40);
    const uniforms = {
      uOffset: { value: 0 }, uPoint: { value: 0.7 }, uMix: { value: 1 }, uSpeed: { value: 0 },
      uColor: { value: new THREE.Color(COLORS[i]) }, uWound: { value: i < WOUND ? 1 : 0 }, uRidges: { value: 900 }, uLight: lit,
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

  // ---- light from the garlands ---------------------------------------------------------------
  // each star's screen position, projected onto a plane just in front of the guitar's top; the
  // stars left / right of the guitar's centre are summed into one point light each
  const bulbZ = size.z / 2 + size.y * BULB_LIFT;
  const share = [0, 0];
  const placeBulbs = () => {
    const rect = renderer.domElement.getBoundingClientRect();
    const stars = LightRig.lights;
    if (!rect.width || !stars.length) return;
    camera.updateMatrixWorld();
    const sum = [new THREE.Vector3(), new THREE.Vector3()];
    const count = [0, 0];
    for (const star of stars) {
      const ndc = new THREE.Vector3(((star.x - rect.left) / rect.width) * 2 - 1, 1 - ((star.y - rect.top) / rect.height) * 2, 0.5);
      const dir = ndc.unproject(camera).sub(camera.position).normalize();
      const at = camera.position.clone().addScaledVector(dir, (bulbZ - camera.position.z) / dir.z);
      const side = at.x < 0 ? 0 : 1;
      sum[side].add(at);
      count[side]++;
    }
    bulbs.forEach((b, i) => {
      if (count[i]) b.position.copy(sum[i].divideScalar(count[i]));
      share[i] = count[i];
    });
  };
  const garland = { level: LightRig.enabled ? 1 : 0, on: 0 };   // on: time of the last switch-on (flicker)
  const flicker = (t) => {
    if (t >= 1) return 1;
    const k = FLICKER.findIndex(([at]) => at > t);
    const [a, va] = FLICKER[k - 1];
    const [b, vb] = FLICKER[k];
    return va + ((vb - va) * (t - a)) / (b - a);
  };
  /** Moves the garland level towards the switch; true while it still changes. */
  const shine = (now, dt) => {
    const want = LightRig.enabled ? 1 : 0;
    const step = dt / (want ? FADE_ON : FADE_OFF);   // linear, like the CSS opacity transitions
    garland.level = want > garland.level ? Math.min(want, garland.level + step) : Math.max(want, garland.level - step);
    const t = garland.on ? (now - garland.on) / 300 : 1;
    const level = garland.level * flicker(t);
    bulbs.forEach((b, i) => { b.intensity = GARLAND * share[i] * level; });
    room.intensity = ROOM_OFF + (ROOM - ROOM_OFF) * garland.level;
    lit.value = level;
    return garland.level !== want || t < 1;
  };

  // ---- on-demand rendering -----------------------------------------------------------------
  let flipped = false;
  let turn = 0;
  let stop = null;
  const watch = { frames: 0, slow: 0 }; // first 60 animated frames: mostly > 50 ms -> too slow here

  function frame(now, dt) {
    let busy = physics.step(dt);
    if (shine(now, dt)) busy = true;
    strings.forEach((str, i) => {
      const st = physics.state(i);
      str.uniforms.uOffset.value = st.offset * pullWorld;
      str.shadowUniforms.uOffset.value = st.offset * pullWorld * 0.7;
      str.uniforms.uPoint.value = st.point;
      str.uniforms.uMix.value = st.mix;
      str.uniforms.uSpeed.value = Math.min(0.25, st.speed * 0.012);
    });
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
    placeBulbs();
    request();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(root);
  // the stars move (resize) or the guitar moves under them (track window open/close)
  const relight = () => { placeBulbs(); request(); };
  const offLayout = LightRig.on('layout', relight);
  const moved = (e) => { if (e.target === slot && e.propertyName === 'transform') relight(); };
  slot.addEventListener('transitionend', moved);
  const offToggle = LightRig.on('toggle', (on) => {
    if (on && !Motion.reduced) garland.on = performance.now();
    request();
  });

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
      offLayout?.();
      offToggle?.();
      slot.removeEventListener('transitionend', moved);
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
