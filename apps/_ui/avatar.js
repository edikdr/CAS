// Haotica — портрет-заглушка до появления модели Live2D: слегка минималистичная мультяшная героиня,
// простые формы, чистый контур, цвета палитры. Состояния: idle, reading, thinking, speaking, warning,
// happy, sleep. Моргание, дыхание, взгляд за курсором, губы по громкости голоса (setMouth 0..1).
// Фон — растровый (упорядоченный дизеринг) с бегущей строкой развёртки, как портрет в Hyperion.

const NS = "http://www.w3.org/2000/svg";
let uid = 0;

export function createAvatar(host, { size = 260, interactive = true } = {}) {
  const id = "hav" + (++uid);
  host.classList.add("hy-avatar");
  host.innerHTML = `
<svg viewBox="0 0 240 260" width="${size}" height="${Math.round(size * 260 / 240)}" xmlns="${NS}" class="hav" aria-label="Haotica">
  <defs>
    <pattern id="${id}-dith" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="1" height="1" fill="var(--av-bg-dot)"/><rect x="2" y="2" width="1" height="1" fill="var(--av-bg-dot)"/>
    </pattern>
    <pattern id="${id}-dith2" width="3" height="3" patternUnits="userSpaceOnUse">
      <rect width="1" height="1" fill="var(--av-shade)"/>
    </pattern>
    <radialGradient id="${id}-glow" cx="50%" cy="42%" r="60%">
      <stop offset="0" stop-color="var(--av-glow)" stop-opacity=".55"/><stop offset="1" stop-color="var(--av-glow)" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="${id}-clip"><rect x="0" y="0" width="240" height="260"/></clipPath>
    <linearGradient id="${id}-scan" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--av-glow)" stop-opacity="0"/><stop offset=".9" stop-color="var(--av-glow)" stop-opacity=".10"/>
      <stop offset="1" stop-color="var(--av-glow)" stop-opacity=".35"/>
    </linearGradient>
  </defs>
  <g clip-path="url(#${id}-clip)">
    <rect width="240" height="260" fill="url(#${id}-dith)"/>
    <rect width="240" height="260" fill="url(#${id}-glow)"/>
    <!-- концентрические дуги-орбиты за головой -->
    <g class="orbits" fill="none" stroke="var(--av-line-soft)" stroke-width="1">
      <circle cx="120" cy="112" r="92" stroke-dasharray="2 5"/>
      <circle cx="120" cy="112" r="74"/>
    </g>
    <g class="body">
      <!-- плечи и куртка -->
      <path d="M38 262 C44 214 76 196 120 196 C164 196 196 214 202 262 Z" fill="var(--av-jacket)" stroke="var(--av-ink)" stroke-width="2.2"/>
      <path d="M92 199 L120 236 L148 199" fill="none" stroke="var(--av-ink)" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M120 236 L120 262" stroke="var(--av-ink)" stroke-width="1.6"/>
      <path d="M56 230 L80 218 M184 230 L160 218" stroke="var(--av-accent)" stroke-width="2.2" stroke-linecap="round"/>
      <path class="pin" d="M150 222 l7 8 -7 8 -7 -8 z" fill="var(--av-accent2)" stroke="var(--av-ink)" stroke-width="1.4"/>
      <!-- шея -->
      <path d="M104 172 L104 198 Q120 208 136 198 L136 172 Z" fill="var(--av-skin)" stroke="var(--av-ink)" stroke-width="2"/>
      <path d="M104 190 Q120 198 136 190 L136 198 Q120 208 104 198 Z" fill="url(#${id}-dith2)"/>
      <!-- волосы сзади -->
      <path class="hair-back" d="M60 118 C56 66 86 40 120 40 C154 40 184 66 180 118 L184 176 C170 186 150 182 146 170 L94 170 C90 182 70 186 56 176 Z"
            fill="var(--av-hair-dark)" stroke="var(--av-ink)" stroke-width="2.2" stroke-linejoin="round"/>
      <g class="head">
        <!-- лицо -->
        <path d="M76 104 C76 72 96 58 120 58 C144 58 164 72 164 104 C164 136 148 166 120 170 C92 166 76 136 76 104 Z"
              fill="var(--av-skin)" stroke="var(--av-ink)" stroke-width="2.2"/>
        <path d="M80 128 C88 154 104 166 120 170 C108 160 92 148 84 124 Z" fill="url(#${id}-dith2)"/>
        <!-- уши-наушники -->
        <rect x="64" y="98" width="14" height="30" rx="4" fill="var(--av-jacket)" stroke="var(--av-ink)" stroke-width="2"/>
        <rect x="162" y="98" width="14" height="30" rx="4" fill="var(--av-jacket)" stroke="var(--av-ink)" stroke-width="2"/>
        <circle class="led" cx="169" cy="113" r="2.6" fill="var(--av-accent)"/>
        <path d="M70 98 C70 52 170 52 170 98" fill="none" stroke="var(--av-ink)" stroke-width="2.6"/>
        <!-- брови -->
        <g class="brows" stroke="var(--av-hair-dark)" stroke-width="3" stroke-linecap="round" fill="none">
          <path class="brow-l" d="M92 92 Q101 88 110 91"/>
          <path class="brow-r" d="M130 91 Q139 88 148 92"/>
        </g>
        <!-- глаза -->
        <g class="eyes">
          <g class="eye eye-l" transform="translate(101 108)">
            <clipPath id="${id}-eyel"><ellipse rx="9.5" ry="11"/></clipPath>
            <ellipse class="white" rx="9.5" ry="11" fill="var(--av-eye-white)"/>
            <g class="pupil-wrap" clip-path="url(#${id}-eyel)">
              <g class="pupil"><ellipse rx="6" ry="8" fill="var(--av-iris)"/><ellipse rx="3" ry="4.4" fill="var(--av-ink)"/>
                <circle cx="2.4" cy="-3.2" r="1.9" fill="#fff"/></g>
              <rect class="lid" x="-12" y="-13" width="24" height="0" fill="var(--av-skin)"/>
              <path class="lid-edge" d="M-10 -11 Q0 -8 10 -11" fill="none" stroke="var(--av-ink)" stroke-width="2" opacity="0"/>
            </g>
            <ellipse class="rim" rx="9.5" ry="11" fill="none" stroke="var(--av-ink)" stroke-width="2"/>
            <path class="closed" d="M-9 1 Q0 7 9 1" fill="none" stroke="var(--av-ink)" stroke-width="2.6" stroke-linecap="round" opacity="0"/>
            <path class="happy" d="M-9 2 Q0 -8 9 2" fill="none" stroke="var(--av-ink)" stroke-width="2.6" stroke-linecap="round" opacity="0"/>
          </g>
          <g class="eye eye-r" transform="translate(139 108)">
            <clipPath id="${id}-eyer"><ellipse rx="9.5" ry="11"/></clipPath>
            <ellipse class="white" rx="9.5" ry="11" fill="var(--av-eye-white)"/>
            <g class="pupil-wrap" clip-path="url(#${id}-eyer)">
              <g class="pupil"><ellipse rx="6" ry="8" fill="var(--av-iris)"/><ellipse rx="3" ry="4.4" fill="var(--av-ink)"/>
                <circle cx="2.4" cy="-3.2" r="1.9" fill="#fff"/></g>
              <rect class="lid" x="-12" y="-13" width="24" height="0" fill="var(--av-skin)"/>
              <path class="lid-edge" d="M-10 -11 Q0 -8 10 -11" fill="none" stroke="var(--av-ink)" stroke-width="2" opacity="0"/>
            </g>
            <ellipse class="rim" rx="9.5" ry="11" fill="none" stroke="var(--av-ink)" stroke-width="2"/>
            <path class="closed" d="M-9 1 Q0 7 9 1" fill="none" stroke="var(--av-ink)" stroke-width="2.6" stroke-linecap="round" opacity="0"/>
            <path class="happy" d="M-9 2 Q0 -8 9 2" fill="none" stroke="var(--av-ink)" stroke-width="2.6" stroke-linecap="round" opacity="0"/>
          </g>
        </g>
        <!-- нос и румянец -->
        <path d="M120 120 L117 132 L122 133" fill="none" stroke="var(--av-ink-soft)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <g class="blush" opacity=".0"><ellipse cx="94" cy="132" rx="7" ry="3.4" fill="var(--av-blush)"/><ellipse cx="146" cy="132" rx="7" ry="3.4" fill="var(--av-blush)"/></g>
        <!-- рот: путь меняется по состоянию и громкости -->
        <path class="mouth" d="M110 146 Q120 152 130 146" fill="var(--av-mouth)" stroke="var(--av-ink)" stroke-width="2.2" stroke-linejoin="round"/>
        <!-- чёлка -->
        <path class="bangs" d="M74 104 C70 60 104 42 128 46 C150 48 172 66 166 104 C158 92 150 82 140 76 C138 88 130 94 118 98 C120 88 118 80 112 74 C104 86 92 96 74 104 Z"
              fill="var(--av-hair)" stroke="var(--av-ink)" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M100 60 C108 54 122 52 134 56" fill="none" stroke="var(--av-hair-light)" stroke-width="2.4" stroke-linecap="round"/>
        <!-- заколка-ромб (знак Haotica) -->
        <g class="clip" transform="translate(150 66) rotate(18)">
          <path d="M0 -9 L7 0 L0 9 L-7 0 Z" fill="var(--av-accent2)" stroke="var(--av-ink)" stroke-width="1.8"/>
          <path d="M0 -4 L3 0 L0 4 L-3 0 Z" fill="var(--av-ink)"/>
        </g>
      </g>
    </g>
    <!-- «думаю»: точки -->
    <g class="think" opacity="0" fill="var(--av-accent2)">
      <circle cx="186" cy="54" r="4"/><circle cx="200" cy="40" r="5.4"/><circle cx="216" cy="24" r="7"/>
    </g>
    <!-- сон -->
    <g class="zz" opacity="0" fill="none" stroke="var(--av-accent2)" stroke-width="2.4" stroke-linejoin="round">
      <path d="M176 60 h12 l-12 12 h12"/><path d="M196 38 h9 l-9 9 h9"/>
    </g>
    <rect class="scan" x="0" y="-60" width="240" height="60" fill="url(#${id}-scan)"/>
  </g>
</svg>`;
  const svg = host.querySelector("svg");
  const q = (s) => svg.querySelector(s);
  const qa = (s) => [...svg.querySelectorAll(s)];
  const st = { state: "idle", mouth: 0, lid: 0, look: [0, 0], t0: performance.now(), raf: 0, nextBlink: 2000, blinkT: -1 };

  const MOUTH = {
    idle: "M110 146 Q120 152 130 146",
    happy: "M106 144 Q120 158 134 144 Q120 150 106 144 Z",
    warning: "M110 149 Q120 145 130 149",
    sleep: "M114 148 Q120 150 126 148",
    thinking: "M114 148 Q122 146 128 149",
  };
  const BROWS = {
    idle: ["M92 92 Q101 88 110 91", "M130 91 Q139 88 148 92"],
    warning: ["M92 88 Q101 92 110 95", "M130 95 Q139 92 148 88"],
    thinking: ["M92 90 Q101 85 110 89", "M130 92 Q139 90 148 93"],
    happy: ["M92 89 Q101 84 110 88", "M130 88 Q139 84 148 89"],
  };

  function apply(now) {
    const t = (now - st.t0) / 1000;
    const s = st.state;
    // дыхание
    q(".body").setAttribute("transform", `translate(0 ${Math.sin(t * 1.6) * 1.4})`);
    q(".head").setAttribute("transform", `rotate(${Math.sin(t * 0.7) * 1.2 + (s === "thinking" ? -3 : 0)} 120 120)`);
    // моргание
    if (s !== "sleep" && now > st.nextBlink && st.blinkT < 0) st.blinkT = now;
    let lid = s === "sleep" ? 1 : s === "warning" ? 0.25 : s === "reading" ? 0.2 : 0;
    if (st.blinkT >= 0) {
      const p = (now - st.blinkT) / 150;
      if (p >= 1) { st.blinkT = -1; st.nextBlink = now + 2500 + Math.random() * 3500; }
      else lid = Math.max(lid, Math.sin(p * Math.PI));
    }
    const happy = s === "happy";
    for (const e of qa(".eye")) {
      const k = happy ? 0 : lid;                       // 0 — открыт, 1 — закрыт
      const closed = k > 0.92;
      const y = -13 + k * 24;
      e.querySelector(".lid").setAttribute("height", Math.max(0, k * 24));
      const edge = e.querySelector(".lid-edge");
      edge.setAttribute("d", `M-11 ${y} Q0 ${y + 3} 11 ${y}`);
      edge.setAttribute("opacity", k > 0.05 && !closed ? 1 : 0);
      e.querySelector(".closed").setAttribute("opacity", closed && !happy ? 1 : 0);
      e.querySelector(".happy").setAttribute("opacity", happy ? 1 : 0);
      for (const c of [".white", ".rim", ".pupil-wrap"]) e.querySelector(c).setAttribute("opacity", happy || closed ? 0 : 1);
      const [lx, ly] = s === "thinking" ? [3, -4] : s === "reading" ? [0, 3] : st.look;
      e.querySelector(".pupil").setAttribute("transform", `translate(${lx} ${ly})`);
    }
    // брови и рот
    const b = BROWS[s] || BROWS.idle;
    q(".brow-l").setAttribute("d", b[0]); q(".brow-r").setAttribute("d", b[1]);
    let m;
    if (s === "speaking" || st.mouth > 0.02) {
      const o = Math.max(0.08, st.mouth);
      const w = 9 + o * 2.5, h = 2 + o * 13;
      m = `M${120 - w} 146 Q120 ${146 - 2 - o * 2} ${120 + w} 146 Q120 ${146 + h} ${120 - w} 146 Z`;
    } else m = MOUTH[s] || MOUTH.idle;
    q(".mouth").setAttribute("d", m);
    q(".blush").setAttribute("opacity", happy ? 0.9 : 0.25);
    q(".think").setAttribute("opacity", s === "thinking" ? 0.6 + Math.sin(t * 5) * 0.4 : 0);
    q(".zz").setAttribute("opacity", s === "sleep" ? 0.5 + Math.sin(t * 2) * 0.5 : 0);
    q(".led").setAttribute("opacity", s === "speaking" ? 0.4 + st.mouth * 0.6 : 0.4 + Math.sin(t * 3) * 0.3);
    // строка развёртки
    q(".scan").setAttribute("y", ((t * 60) % 380) - 60);
    host.dataset.state = s;
  }
  function loop(now) { apply(now); st.raf = requestAnimationFrame(loop); }
  st.raf = requestAnimationFrame(loop);
  if (interactive) {
    window.addEventListener("mousemove", (e) => {
      const r = svg.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / Math.max(200, innerWidth / 2);
      const dy = (e.clientY - (r.top + r.height * 0.42)) / Math.max(200, innerHeight / 2);
      st.look = [Math.max(-1, Math.min(1, dx)) * 3, Math.max(-1, Math.min(1, dy)) * 2.6];
    });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelAnimationFrame(st.raf); else st.raf = requestAnimationFrame(loop);
  });
  return {
    el: host,
    setState(s) { st.state = s || "idle"; },
    get state() { return st.state; },
    setMouth(v) { st.mouth = Math.max(0, Math.min(1, v || 0)); },
    destroy() { cancelAnimationFrame(st.raf); host.innerHTML = ""; },
  };
}

// Цвета аватара берутся из палитры (вызывать после применения темы)
export function avatarCss() {
  return `.hy-avatar{--av-ink:#0b0a10;--av-ink-soft:color-mix(in srgb,var(--av-ink) 60%,var(--av-skin));
  --av-skin:color-mix(in srgb,#f1dcc8 80%,var(--ink));--av-hair:var(--violet);--av-hair-dark:color-mix(in srgb,var(--violet) 55%,#1a1530);
  --av-hair-light:color-mix(in srgb,var(--violet) 40%,#ffffff);--av-jacket:color-mix(in srgb,var(--bg2) 70%,var(--line));
  --av-accent:var(--accent);--av-accent2:var(--violet);--av-iris:var(--teal);--av-eye-white:#f6f1e6;--av-mouth:#5a2730;
  --av-blush:color-mix(in srgb,var(--coral) 70%,transparent);--av-bg-dot:color-mix(in srgb,var(--violet) 30%,transparent);
  --av-shade:color-mix(in srgb,var(--av-ink) 22%,transparent);--av-glow:var(--violet);--av-line-soft:color-mix(in srgb,var(--violet) 35%,transparent)}
  .hy-avatar svg{display:block}
  .hy-avatar[data-state=warning]{--av-glow:var(--coral);--av-bg-dot:color-mix(in srgb,var(--coral) 30%,transparent)}
  .hy-avatar[data-state=happy]{--av-glow:var(--green)}
  .hy-avatar[data-state=sleep]{filter:saturate(.4) brightness(.75)}`;
}
