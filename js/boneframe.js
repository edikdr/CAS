/* ============================================================
   The bone frame, in pieces.

   assets/boneframe.webp is cut into a grid of tiles whose UVs, laid
   flat, reconstruct the artwork exactly. They begin scattered through
   space; one number walks them home; the profile fades up in the hollow
   the assembled frame leaves.

   ------------------------------------------------------------
   WHY THIS IS ONE DRAW CALL PER SLAB AND NOT ONE PER SHARD
   ------------------------------------------------------------

   The previous version built 27 cells as 81 separate meshes, each with
   its own material, and animated them with roughly 320 concurrent GSAP
   tweens writing to 320 objects every frame. It worked, and it could not
   grow: the thing that makes a shatter read as a shatter is the number
   of pieces, and the cost of a piece was a draw call.

   So the whole frame is now ONE InstancedBufferGeometry. Every shard is
   an instance carrying its own UV window, its home, where it starts, the
   axis it tumbles around and when it sets off. The entire animation is a
   single uniform — `uT`, zero to one — and the vertex shader works out
   where each shard is at that moment. GSAP tweens one number.

   That buys two things at once. The grid went from 7 x 6 to 18 x 16, so
   the frame comes apart into 188 shards instead of 27, and it costs
   three draw calls instead of eighty-one, because the depth slabs are
   three passes over the same instance buffers rather than three meshes
   per cell.

   ------------------------------------------------------------
   WHY IT LOOKS LIKE BONE AND NOT LIKE A SLIDE TRANSITION
   ------------------------------------------------------------

   THE TEXTURE IS ALPHA-KEYED, so what flies is bone rather than a black
   rectangle with some bone printed on it.

   IT IS BUMP-LIT PER PIXEL. The artwork is line art — thin bright
   strokes on nothing — so a flat lit quad gives every stroke on a shard
   the same shade no matter how it turns. The fragment shader reads the
   texture as a height field and rebuilds the normal from its gradient,
   so each rib rounds off and takes its own highlight, and the highlight
   travels as the shard rotates. This is the single change that stops it
   looking like printed paper.

   IT ARRIVES ON A SPRING, NOT A CURVE. Shards do not glide to a halt:
   the position ease is a damped oscillation, so a piece overshoots its
   slot, comes back, and settles. Spin decays on a slower curve than
   travel, so pieces are still turning as they seat. Both are per-shard,
   staggered from the middle of the frame outward.

   THEY STRETCH WHILE THEY ARE FAST. Each shard is scaled along its own
   direction of travel in proportion to how quickly it is moving, and
   the stretch is gone by the time it lands. That is the cheap version of
   motion blur and it is most of why the movement reads as weight.

   THE LIGHT BELONGS TO THE PAGE. Warm key from the upper left, blood
   fill rising from below, cold steel rim from behind — the three
   colours in css/style.css, no others.

   One render loop, alive only while the layer is open.
   ============================================================ */

const BoneFrame = {
  /* The grid, and the hollow inside it. Kept as fractions of the artwork
     so the two can be retuned independently of each other. */
  COLS: 18,
  ROWS: 16,
  HOLE: { x0: 0.135, x1: 0.865, y0: 0.170, y1: 0.672 },

  /* The extrusion. One pass each, over the same instance buffers: the
     lit face, and two darker slabs behind it whose parallax as the frame
     turns is what the eye reads as thickness. */
  SLABS: [
    { z: 0,      tint: [0.55, 0.46, 0.39], shade: 1.00, lit: true  },
    { z: -0.055, tint: [0.20, 0.08, 0.10], shade: 0.55, lit: false },
    { z: -0.110, tint: [0.07, 0.03, 0.04], shade: 0.30, lit: false }
  ],

  layer: null, canvas: null, content: null,
  renderer: null, scene: null, camera: null, group: null,
  meshes: [], sparks: null, uniforms: null,
  count: 0,
  tween: null,
  raf: 0,
  open: false, ready: false, idle: false,
  lastFocus: null,
  aspect: 1986 / 2041,

  W: 10,
  get H() { return this.W / this.aspect; },

  init() {
    this.layer = document.getElementById('boneLayer');
    if (!this.layer) return;
    this.canvas = this.layer.querySelector('canvas');
    this.content = this.layer.querySelector('.bone-content');

    this.layer.querySelector('.bone-close').addEventListener('click', () => this.close());
    this.layer.addEventListener('click', e => {
      if (e.target === this.layer || e.target === this.canvas) this.close();
    });
    document.addEventListener('keydown', e => {
      if (!this.open) return;
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      if (e.key === 'Tab') this.trap(e);
    });

    this.onResize = () => this.resize();
    addEventListener('resize', this.onResize, { passive: true });
  },

  /* Deterministic noise: a shard must scatter the same way every time it
     is opened. A different explosion on each open reads as the page
     being unsure of itself rather than as an effect. */
  rand(seed) {
    let t = (seed + 0x6D2B79F5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },
  sn(i, c) { return this.rand(i * 977 + c * 131) * 2 - 1; },

  /* ---------------------------------------------------------- shaders */

  vert: `
    precision highp float;

    attribute vec4 iUv;        // u0, v0, du, dv
    attribute vec2 iSize;      // the shard's width and height, in world units
    attribute vec3 iHome;
    attribute vec3 iFrom;
    attribute vec3 iAxis;      // unit axis it tumbles around
    attribute vec3 iBow;       // the lateral arc it swings through on the way in
    attribute float iSpin;     // radians of tumble left to unwind
    attribute float iDelay;    // 0..1, when it sets off
    attribute float iScale;    // how small it starts

    uniform float uT;
    uniform float uDepth;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vTangent;
    varying vec3 vBitangent;
    varying vec3 vWorld;
    varying float vFade;

    /* Rodrigues, so a shard tumbles about an arbitrary axis rather than
       about the three world axes in sequence — sequenced euler rotation
       is what gives an effect that mechanical, gimballed look. */
    vec3 spin(vec3 v, vec3 axis, float a) {
      float c = cos(a), s = sin(a);
      return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
    }

    void main() {
      float p = clamp((uT - iDelay) / max(1e-4, 1.0 - iDelay), 0.0, 1.0);

      /* Position rides a damped oscillation: it reaches its slot, goes
         past it, and comes back. Exactly 0 at p=0 and exactly 1 at p=1,
         so nothing has to be clamped afterwards. */
      float k = 1.0 - p;
      float ease = 1.0 - k * k * k * cos(p * 5.6);

      /* Spin unwinds more slowly than travel, so shards are still
         turning as they seat rather than arriving already square. */
      float turn = k * k;

      vec3 pos = mix(iFrom, iHome, ease);
      pos += iBow * sin(p * 3.14159265) * k;      // the arc, gone by the end

      float sc = mix(iScale, 1.0, ease);
      vec3 local = vec3(position.xy * iSize * sc, 0.0);

      float ang = iSpin * turn;
      local = spin(local, iAxis, ang);

      /* Cheap motion blur: stretched along its own direction of travel
         in proportion to how fast it is going. The speed term is the derivative
         of the ease, approximated — it is largest at the start and zero
         once seated, which is all it has to be. */
      vec3 dir = iHome - iFrom;
      float len = length(dir);
      if (len > 1e-4) {
        dir /= len;
        float speed = k * k * (1.0 - p * 0.35);
        local += dir * dot(local, dir) * speed * 0.55;
      }

      vec3 world = pos + local + vec3(0.0, 0.0, uDepth * sc);

      vNormal    = normalize(spin(vec3(0.0, 0.0, 1.0), iAxis, ang));
      vTangent   = normalize(spin(vec3(1.0, 0.0, 0.0), iAxis, ang));
      vBitangent = normalize(spin(vec3(0.0, 1.0, 0.0), iAxis, ang));
      vUv = iUv.xy + uv * iUv.zw;
      vWorld = world;
      vFade = smoothstep(0.0, 0.22, p);

      gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
    }`,

  frag: `
    precision highp float;

    uniform sampler2D uMap;
    uniform vec2 uTexel;
    uniform vec3 uTint;
    uniform float uShade;
    uniform float uBump;
    uniform vec3 uAmbient;
    uniform vec3 uKeyDir;
    uniform vec3 uKeyCol;
    uniform vec3 uBloodPos;
    uniform vec3 uBloodCol;
    uniform float uBloodI;
    uniform vec3 uRimCol;
    uniform float uLit;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vTangent;
    varying vec3 vBitangent;
    varying vec3 vWorld;
    varying float vFade;

    float height(vec2 uv) {
      vec4 t = texture2D(uMap, uv);
      return t.a * dot(t.rgb, vec3(0.299, 0.587, 0.114));
    }

    void main() {
      vec4 tex = texture2D(uMap, vUv);
      /* Cut hard rather than blending the fringe. The artwork is line
         art, so every rib is bordered by half-transparent pixels; kept,
         they let the dark slab behind show through and the whole frame
         goes pink. */
      if (tex.a < 0.42) discard;

      vec3 n = vNormal;
      if (uLit > 0.5) {
        /* The artwork is its own height field. Central differences on
           its luminance give the slope of each stroke, and the normal is
           tilted by it — so a rib is round instead of flat. */
        float hx = height(vUv + vec2(uTexel.x, 0.0)) - height(vUv - vec2(uTexel.x, 0.0));
        float hy = height(vUv + vec2(0.0, uTexel.y)) - height(vUv - vec2(0.0, uTexel.y));
        n = normalize(vNormal - (vTangent * hx + vBitangent * hy) * uBump);

        vec3 lit = uAmbient + uKeyCol * max(dot(n, normalize(uKeyDir)), 0.0);

        vec3 toBlood = uBloodPos - vWorld;
        float d = length(toBlood);
        float att = pow(max(0.0, 1.0 - d / 62.0), 1.6);
        lit += uBloodCol * uBloodI * att * max(dot(n, toBlood / max(d, 1e-4)), 0.0);

        /* Steel rim, from behind. The only cold thing in the scene, and
           it is here to separate a shard's far edge from the black it is
           turning against. */
        float rim = pow(1.0 - abs(dot(n, vec3(0.0, 0.0, 1.0))), 2.6);
        lit += uRimCol * rim;

        gl_FragColor = vec4(uTint * tex.rgb * lit * uShade, tex.a * vFade);
      } else {
        gl_FragColor = vec4(uTint * uShade, tex.a * vFade * 0.9);
      }

      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }`,

  /* ---------------------------------------------------------- build */

  build() {
    if (this.ready) return;
    const THREE = window.THREE;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, alpha: true, antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    if ('outputColorSpace' in this.renderer) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    else if ('outputEncoding' in this.renderer) this.renderer.outputEncoding = THREE.sRGBEncoding;
    if (THREE.ACESFilmicToneMapping) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      /* Deliberately under one. At exposure 1 the lit faces measured
         about rgb(238, 211, 212) — red and blue equal, which is pink,
         not bone. Under-exposed, the material's own warmth survives. */
      this.renderer.toneMappingExposure = 0.46;
    }

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    this.group = new THREE.Group();
    this.scene.add(this.group);

    const texture = new THREE.TextureLoader().load('assets/boneframe.webp', t => {
      this.uniforms.uTexel.value.set(1 / t.image.width, 1 / t.image.height);
      this.render();
    });
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy
      ? Math.min(4, this.renderer.capabilities.getMaxAnisotropy()) : 1;
    if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;
    else if ('encoding' in texture) texture.encoding = THREE.sRGBEncoding;

    const geo = this.lattice(THREE);

    this.uniforms = {
      uMap:      { value: texture },
      uTexel:    { value: new THREE.Vector2(1 / 1986, 1 / 2041) },
      uT:        { value: 0 },
      uBump:     { value: 2.4 },
      uAmbient:  { value: new THREE.Color(0x46322a).multiplyScalar(0.30) },
      uKeyDir:   { value: new THREE.Vector3(-0.42, 0.62, 0.66) },
      uKeyCol:   { value: new THREE.Color(0xffeada).multiplyScalar(1.15) },
      uBloodPos: { value: new THREE.Vector3(0.5, -5.5, 7) },
      uBloodCol: { value: new THREE.Color(0xff5c52) },
      uBloodI:   { value: 1.9 },
      uRimCol:   { value: new THREE.Color(0xbabbba).multiplyScalar(0.22) }
    };

    /* Three passes over one instance buffer. Back to front, because the
       slabs are transparent and depth-sorted geometry that writes depth
       would punch holes in the shards behind it. */
    this.meshes = this.SLABS.slice().reverse().map((slab, i) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: Object.assign({
          uDepth: { value: slab.z },
          uTint:  { value: new THREE.Vector3(...slab.tint) },
          uShade: { value: slab.shade },
          uLit:   { value: slab.lit ? 1 : 0 }
        }, this.uniforms),
        vertexShader: this.vert,
        fragmentShader: this.frag,
        transparent: true,
        depthWrite: slab.lit,
        depthTest: true,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;         // instances move far outside the box
      mesh.renderOrder = i;
      this.group.add(mesh);
      return mesh;
    });

    this.buildSparks(THREE);

    Diag.set('boneShards', `${this.count} shards · ${this.meshes.length + 1} draw calls`);
    this.ready = true;
    this.resize();
  },

  /**
   * The grid, as instance attributes.
   *
   * Every cell samples a strict sub-rectangle of the sheet, and laid
   * flat the whole set reproduces the artwork with no gap and no
   * overlap. Three.js puts the UV origin at the bottom left while the
   * grid is counted from the top, so v runs against the row index.
   */
  lattice(THREE) {
    const { COLS, ROWS, HOLE } = this;
    const W = this.W, H = this.H;
    const tw = W / COLS, th = H / ROWS;

    const uv = [], size = [], home = [], from = [], axis = [], bow = [];
    const spin = [], delay = [], scale = [];
    const maxD = Math.hypot(W / 2, H / 2);
    let i = 0;

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const cx = (col + 0.5) / COLS, cy = (row + 0.5) / ROWS;
        if (cx > HOLE.x0 && cx < HOLE.x1 && cy > HOLE.y0 && cy < HOLE.y1) continue;

        const hx = -W / 2 + (col + 0.5) * tw;
        const hy = H / 2 - (row + 0.5) * th;

        uv.push(col / COLS, 1 - (row + 1) / ROWS, 1 / COLS, 1 / ROWS);
        size.push(tw, th);
        home.push(hx, hy, 0);

        /* Scattered wide and, more importantly, to very different
           depths: shards at z = -70 read as far away and small, ones at
           z = +40 sweep past the camera. That is what makes it debris in
           a volume rather than tiles on a plane. */
        const d = this.sn(i, 5);
        from.push(
          this.sn(i, 1) * 48,
          this.sn(i, 2) * 40,
          d < 0 ? -22 + d * 58 : 10 + d * 40
        );

        const ax = new THREE.Vector3(this.sn(i, 3), this.sn(i, 4), this.sn(i, 8)).normalize();
        axis.push(ax.x, ax.y, ax.z);
        bow.push(this.sn(i, 9) * 7, this.sn(i, 10) * 6, this.sn(i, 11) * 5);
        spin.push(this.sn(i, 6) * Math.PI * 3.4);
        scale.push(0.35 + this.rand(i * 31 + 7) * 0.5);

        /* Staggered from the middle of the frame outward, plus a little
           noise so the wavefront is ragged rather than a clean ring. */
        const away = Math.hypot(hx, hy) / maxD;
        delay.push(Math.min(0.55, away * 0.42 + this.rand(i * 53 + 3) * 0.14));
        i++;
      }
    }
    this.count = i;

    const base = new THREE.PlaneGeometry(1, 1, 3, 3);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    geo.instanceCount = i;

    const put = (name, arr, n) =>
      geo.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(arr), n));
    put('iUv', uv, 4); put('iSize', size, 2); put('iHome', home, 3);
    put('iFrom', from, 3); put('iAxis', axis, 3); put('iBow', bow, 3);
    put('iSpin', spin, 1); put('iDelay', delay, 1); put('iScale', scale, 1);

    return geo;
  },

  /**
   * The dust the frame throws off as it lands.
   *
   * One additive Points cloud, driven by the same uT uniform, so it costs one
   * draw call and no per-frame work on the CPU. It rushes inward with
   * the shards and hangs in the air afterwards.
   */
  buildSparks(THREE) {
    const N = 420;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = this.sn(i + 900, 1) * 15;
      pos[i * 3 + 1] = this.sn(i + 900, 2) * 13;
      pos[i * 3 + 2] = this.sn(i + 900, 3) * 16;
      seed[i] = this.rand(i * 17 + 5);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

    this.sparks = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uT: this.uniforms.uT, uTime: { value: 0 },
                  uCol: { value: new THREE.Color(0xff5c52) } },
      vertexShader: `
        attribute float aSeed;
        uniform float uT; uniform float uTime;
        varying float vA;
        void main() {
          float p = clamp(uT * 1.25 - aSeed * 0.25, 0.0, 1.0);
          vec3 q = position * mix(1.9, 0.55, p);
          q.y += sin(uTime * (0.3 + aSeed) + aSeed * 6.2) * 0.5 + p * 1.2;
          q.x += cos(uTime * (0.2 + aSeed * 0.6)) * 0.4;
          vec4 mv = modelViewMatrix * vec4(q, 1.0);
          gl_PointSize = (1.0 + aSeed * 2.6) * (34.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
          vA = smoothstep(0.0, 0.35, p) * (0.22 + aSeed * 0.5);
        }`,
      fragmentShader: `
        uniform vec3 uCol; varying float vA;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float f = 1.0 - smoothstep(0.14, 0.5, length(d));
          if (f <= 0.001) discard;
          gl_FragColor = vec4(uCol, f * vA);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    this.sparks.frustumCulled = false;
    this.group.add(this.sparks);
  },

  /* ---------------------------------------------------------- open */

  show(member) {
    if (!this.layer) return;
    this.lastFocus = document.activeElement;

    safely('boneFrame.build', () => this.build());
    if (!this.ready) return;              // WebGL refused; the caller falls back

    this.fill(member);
    this.layer.hidden = false;
    document.body.classList.add('locked');
    this.open = true;
    pauseAmbient();                       // never two render loops at once
    this.resize();
    this.startLoop();

    const close = this.layer.querySelector('.bone-close');
    if (close) close.focus();

    if (REDUCED) {
      this.uniforms.uT.value = 1;
      this.content.style.opacity = '1';
      this.idle = true;
      this.render();
      return;
    }
    this.tween = this.assemble();
  },

  /** One tween, on one number. */
  assemble() {
    if (this.tween) this.tween.kill();
    const gsap = window.gsap;

    this.uniforms.uT.value = 0;
    this.content.style.opacity = '0';
    this.group.rotation.set(0, 0, 0);

    const tl = gsap.timeline({
      onComplete: () => { this.idle = true; },
      onReverseComplete: () => this.finishClose()
    });

    tl.to(this.uniforms.uT, { value: 1, duration: 1.65, ease: 'power2.inOut' }, 0);

    /* The frame arrives turned, swings past level, and sits. With the
       lamps fixed in world space this sweeps the highlight along every
       rib on the way, which is the payoff for lighting them at all. */
    tl.fromTo(this.group.rotation,
      { y: -0.34, x: 0.15 }, { y: 0, x: 0, duration: 1.5, ease: 'power2.out' }, 0.15);

    // and the fire under the frame comes up as it closes
    tl.fromTo(this.uniforms.uBloodI, { value: 0.3 },
      { value: 1.9, duration: 1.2, ease: 'power2.out' }, 0.5);

    tl.to(this.content, { opacity: 1, duration: 0.5, ease: 'power2.out' }, 1.25);
    return tl;
  },

  close() {
    if (!this.open) return;
    if (REDUCED || !this.tween) return this.finishClose();
    this.content.style.opacity = '0';
    this.tween.timeScale(1.9).reverse();
  },

  finishClose() {
    this.open = false;
    this.idle = false;
    this.layer.hidden = true;
    document.body.classList.remove('locked');
    this.stopLoop();
    resumeAmbient();
    if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
  },

  startLoop() {
    if (this.raf) return;
    const tick = () => {
      if (!this.open) { this.raf = 0; return; }
      const t = performance.now() / 1000;
      if (this.sparks) this.sparks.material.uniforms.uTime.value = t;
      /* Once assembled, a slow turn: with the lamps fixed, turning the
         frame is what moves the highlight along the ribs, and that
         travelling highlight is most of what says the bone has depth. */
      if (this.idle && !REDUCED) {
        this.group.rotation.y = Math.sin(t * 0.26) * 0.085;
        this.group.rotation.x = Math.cos(t * 0.19) * 0.052;
        this.uniforms.uBloodI.value = 1.75 + Math.sin(t * 1.7) * 0.45;
      }
      this.render();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  },

  stopLoop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; },

  render() {
    if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
  },

  /* Solved for both axes; the binding one wins, so the frame is never
     cropped: portrait phones fit it by width, wide desktops by height. */
  resize() {
    if (!this.ready) return;
    const w = innerWidth, h = innerHeight;
    const aspect = w / h;

    this.renderer.setSize(w, h, false);
    this.camera.aspect = aspect;

    const fov = (this.camera.fov * Math.PI) / 180;
    const margin = w < 720 ? 1.04 : 1.16;
    const fitH = (this.H / 2) / Math.tan(fov / 2);
    const fitW = (this.W / 2) / (Math.tan(fov / 2) * aspect);
    this.camera.position.set(0, 0, Math.max(fitH, fitW) * margin);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();

    this.render();
  },

  fill(m) {
    this.content.innerHTML = `
      <h3>${esc(m.name)}</h3>
      <p class="bone-real">${esc(m.real)} · ${esc(m.years)}</p>
      ${m.story.map(p => `<p>${p}</p>`).join('')}
      <dl class="bone-dl">
        <dt>Role</dt><dd>${esc(m.role)}</dd>
        <dt>Mask</dt><dd>${esc(m.mask)}</dd>
        <dt>Poster</dt><dd>“${esc(m.poster)}”, Day of the Dead</dd>
        <dt>Status</dt><dd>${m.status === 'current' ? 'Current line-up' : 'Former member'}</dd>
      </dl>`;
    this.content.scrollTop = 0;
  },

  trap(e) {
    const items = [...this.layer.querySelectorAll('button, [href]')]
      .filter(el => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
};
