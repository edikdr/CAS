// Haotica — портрет-заглушка до появления модели Live2D. Стимпанк, взрослая героиня, объём 2.5D:
// латунные очки-гогглы на волосах, высокий воротник блузы, корсет и жакет, шестерёнки на фоне.
// Мягкие градиенты вместо штриховки (объём), контур тёмно-сливовый, свет слева сверху, контровой
// фиолетовый свет справа. Состояния: idle, reading, thinking, speaking, warning, happy, sleep.

const NS = "http://www.w3.org/2000/svg";
let uid = 0;

function gear(cx, cy, r, teeth, depth = 0.16) {
  const pts = [];
  const steps = teeth * 4;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const k = i % 4;
    const rr = k === 0 || k === 1 ? r : r * (1 - depth);
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

export function createAvatar(host, { size = 260, interactive = true } = {}) {
  const id = "hav" + (++uid);
  host.classList.add("hy-avatar");
  const G1 = gear(0, 0, 42, 14), G2 = gear(0, 0, 26, 10), G3 = gear(0, 0, 14, 8, 0.22);
  host.innerHTML = `
<svg viewBox="0 0 240 260" width="${size}" height="${Math.round(size * 260 / 240)}" xmlns="${NS}" class="hav" aria-label="Haotica">
  <defs>
    <pattern id="${id}-dith" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="1" height="1" fill="var(--av-bg-dot)"/><rect x="2" y="2" width="1" height="1" fill="var(--av-bg-dot)"/>
    </pattern>
    <radialGradient id="${id}-glow" cx="50%" cy="40%" r="62%">
      <stop offset="0" stop-color="var(--av-glow)" stop-opacity=".5"/><stop offset="1" stop-color="var(--av-glow)" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id}-skin" cx="40%" cy="34%" r="72%">
      <stop offset="0" stop-color="var(--av-skin-hi)"/><stop offset=".55" stop-color="var(--av-skin)"/><stop offset="1" stop-color="var(--av-skin-lo)"/>
    </radialGradient>
    <linearGradient id="${id}-neck" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--av-skin-lo)"/><stop offset=".45" stop-color="var(--av-skin)"/><stop offset="1" stop-color="var(--av-skin)"/>
    </linearGradient>
    <linearGradient id="${id}-hair" x1="0" y1="0" x2=".4" y2="1">
      <stop offset="0" stop-color="var(--av-hair-hi)"/><stop offset=".45" stop-color="var(--av-hair)"/><stop offset="1" stop-color="var(--av-hair-lo)"/>
    </linearGradient>
    <linearGradient id="${id}-brass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F3D58A"/><stop offset=".45" stop-color="#C99A44"/><stop offset="1" stop-color="#7A5420"/>
    </linearGradient>
    <radialGradient id="${id}-lens" cx="35%" cy="30%" r="80%">
      <stop offset="0" stop-color="var(--av-lens-hi)"/><stop offset=".6" stop-color="var(--av-lens)"/><stop offset="1" stop-color="#0b1f22"/>
    </radialGradient>
    <linearGradient id="${id}-blouse" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F7EFE2"/><stop offset=".7" stop-color="#E4D6C2"/><stop offset="1" stop-color="#C9B79F"/>
    </linearGradient>
    <radialGradient id="${id}-bust" cx="50%" cy="30%" r="75%">
      <stop offset="0" stop-color="#FBF5EB"/><stop offset=".6" stop-color="#E6D8C4"/><stop offset="1" stop-color="#BCA88E"/>
    </radialGradient>
    <linearGradient id="${id}-jacket" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--av-jacket-hi)"/><stop offset="1" stop-color="var(--av-jacket)"/>
    </linearGradient>
    <linearGradient id="${id}-corset" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#3C2216"/><stop offset=".5" stop-color="#6B3F25"/><stop offset="1" stop-color="#3C2216"/>
    </linearGradient>
    <filter id="${id}-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.4"/></filter>
    <clipPath id="${id}-clip"><rect width="240" height="260"/></clipPath>
    <clipPath id="${id}-face"><path d="M120 58 C143 58 161 75 161 101 C161 127 149 150 133 161 C126 166 114 166 107 161 C91 150 79 127 79 101 C79 75 97 58 120 58 Z"/></clipPath>
    <linearGradient id="${id}-scan" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--av-glow)" stop-opacity="0"/><stop offset=".9" stop-color="var(--av-glow)" stop-opacity=".08"/>
      <stop offset="1" stop-color="var(--av-glow)" stop-opacity=".3"/>
    </linearGradient>
  </defs>
  <g clip-path="url(#${id}-clip)">
    <rect width="240" height="260" fill="url(#${id}-dith)"/>
    <rect width="240" height="260" fill="url(#${id}-glow)"/>
    <!-- шестерёнки за спиной: медленно вращаются, быстрее — когда Haotica думает -->
    <g class="gears" fill="none" stroke="var(--av-gear)" stroke-width="1.4" stroke-linejoin="round">
      <g transform="translate(196 74)"><path class="g1" d="${G1}"/><circle r="22"/><circle r="6"/></g>
      <g transform="translate(36 186)"><path class="g2" d="${G2}"/><circle r="12"/><circle r="4"/></g>
      <g transform="translate(214 128)"><path class="g3" d="${G3}"/><circle r="5"/></g>
    </g>
    <g class="body">
      <!-- жакет: плечи с буфами -->
      <path d="M22 262 C24 228 40 206 70 198 L96 194 C88 212 82 236 84 262 Z" fill="url(#${id}-jacket)" stroke="var(--av-ink)" stroke-width="2"/>
      <path d="M218 262 C216 228 200 206 170 198 L144 194 C152 212 158 236 156 262 Z" fill="url(#${id}-jacket)" stroke="var(--av-ink)" stroke-width="2"/>
      <path d="M44 214 C54 204 66 200 78 199" fill="none" stroke="var(--av-jacket-hi)" stroke-width="2" opacity=".7"/>
      <path d="M196 214 C186 204 174 200 162 199" fill="none" stroke="var(--av-jacket-hi)" stroke-width="2" opacity=".7"/>
      <!-- блуза: объёмный силуэт груди под тканью -->
      <path class="bust" d="M80 214 C86 201 102 196 120 198 C138 196 154 201 160 214 C166 230 156 243 141 243 C131 243 124 238 120 235 C116 238 109 243 99 243 C84 243 74 230 80 214 Z"
            fill="url(#${id}-bust)" stroke="var(--av-ink)" stroke-width="1.8"/>
      <path d="M92 220 C96 212 104 208 112 208" fill="none" stroke="#FFFFFF" stroke-width="2.2" opacity=".55" stroke-linecap="round"/>
      <path d="M128 208 C138 208 146 212 150 220" fill="none" stroke="#FFFFFF" stroke-width="2.2" opacity=".35" stroke-linecap="round"/>
      <path d="M100 240 C108 242 114 239 120 235 C126 239 132 242 140 240" fill="none" stroke="#8E7A62" stroke-width="1.6" opacity=".6"/>
      <!-- корсет со шнуровкой и латунными пряжками -->
      <path d="M86 240 C100 247 112 246 120 243 C128 246 140 247 154 240 L160 262 L80 262 Z" fill="url(#${id}-corset)" stroke="var(--av-ink)" stroke-width="2"/>
      <path d="M112 247 L128 255 M128 247 L112 255 M112 255 L128 262 M128 255 L112 262" stroke="#E9D9B8" stroke-width="1.2" opacity=".8"/>
      <rect x="90" y="248" width="9" height="7" rx="1.5" fill="url(#${id}-brass)" stroke="var(--av-ink)" stroke-width="1"/>
      <rect x="141" y="248" width="9" height="7" rx="1.5" fill="url(#${id}-brass)" stroke="var(--av-ink)" stroke-width="1"/>
      <!-- лацканы и пуговицы -->
      <path d="M96 194 C92 206 88 220 86 234 L80 214 C82 204 88 198 96 194 Z" fill="var(--av-jacket-hi)" opacity=".55"/>
      <path d="M144 194 C148 206 152 220 154 234 L160 214 C158 204 152 198 144 194 Z" fill="var(--av-jacket-hi)" opacity=".55"/>
      <circle cx="72" cy="232" r="3.6" fill="url(#${id}-brass)" stroke="var(--av-ink)" stroke-width="1"/>
      <circle cx="168" cy="232" r="3.6" fill="url(#${id}-brass)" stroke="var(--av-ink)" stroke-width="1"/>
      <circle cx="70" cy="248" r="3.6" fill="url(#${id}-brass)" stroke="var(--av-ink)" stroke-width="1"/>
      <circle cx="170" cy="248" r="3.6" fill="url(#${id}-brass)" stroke="var(--av-ink)" stroke-width="1"/>
      <path d="M170 248 C178 254 186 252 192 258" fill="none" stroke="url(#${id}-brass)" stroke-width="1.6" stroke-dasharray="2.4 1.6"/>
      <!-- шея: плавно, с тенью от подбородка -->
      <path d="M107 150 L106 184 C112 189 128 189 134 184 L133 150 Z" fill="url(#${id}-neck)" stroke="var(--av-ink)" stroke-width="1.8"/>
      <ellipse cx="120" cy="160" rx="15" ry="7" fill="var(--av-shadow)" filter="url(#${id}-soft)" opacity=".6"/>
      <ellipse cx="120" cy="196" rx="22" ry="4" fill="var(--av-shadow)" filter="url(#${id}-soft)" opacity=".35"/>
      <!-- высокий воротник-стойка с оборкой и брошь-ромб -->
      <path d="M101 182 C112 190 128 190 139 182 L142 196 C130 204 110 204 98 196 Z" fill="url(#${id}-blouse)" stroke="var(--av-ink)" stroke-width="1.8"/>
      <path d="M106 186 C114 191 126 191 134 186" fill="none" stroke="#B9A68C" stroke-width="1.2"/>
      <path d="M114 200 Q117 206 114 212 Q120 210 126 212 Q123 206 126 200 Q120 204 114 200 Z" fill="url(#${id}-blouse)" stroke="var(--av-ink)" stroke-width="1.4"/>
      <g class="pin" transform="translate(120 194)">
        <path d="M0 -6 L5 0 L0 6 L-5 0 Z" fill="var(--av-accent2)" stroke="url(#${id}-brass)" stroke-width="1.6"/>
        <path d="M0 -2.5 L2 0 L0 2.5 L-2 0 Z" fill="#fff" opacity=".7"/>
      </g>
      <!-- волосы сзади: высокая укладка с пучком -->
      <g class="hair-back">
        <circle cx="146" cy="34" r="20" fill="url(#${id}-hair)" stroke="var(--av-ink)" stroke-width="2"/>
        <path d="M136 26 C142 20 152 20 158 28" fill="none" stroke="var(--av-hair-hi)" stroke-width="2" opacity=".8"/>
        <path d="M130 40 C134 30 146 26 156 32 M134 48 C140 40 152 38 160 44" fill="none" stroke="var(--av-hair-lo)" stroke-width="1.4" opacity=".7"/>
        <path d="M67 112 C61 66 88 42 122 42 C156 42 181 66 175 112 C173 127 167 137 159 143 C151 148 142 148 135 145 L105 145 C98 148 89 148 81 143 C73 137 69 127 67 112 Z"
              fill="url(#${id}-hair)" stroke="var(--av-ink)" stroke-width="2"/>
        <path d="M170 76 C178 96 178 120 168 136" fill="none" stroke="var(--av-rim)" stroke-width="2.4" opacity=".55" filter="url(#${id}-soft)"/>
        <circle cx="150" cy="40" r="3" fill="url(#${id}-brass)"/>
        <path d="M150 40 L166 22" stroke="url(#${id}-brass)" stroke-width="2.2" stroke-linecap="round"/>
      </g>
      <g class="head">
        <!-- уши с серьгами-шестерёнками -->
        <ellipse cx="80" cy="108" rx="5.5" ry="9.5" fill="var(--av-skin)" stroke="var(--av-ink)" stroke-width="1.6"/>
        <ellipse cx="160" cy="108" rx="5.5" ry="9.5" fill="var(--av-skin)" stroke="var(--av-ink)" stroke-width="1.6"/>
        <g transform="translate(80 124)"><path d="${gear(0, 0, 4.2, 6, 0.3)}" fill="url(#${id}-brass)" stroke="var(--av-ink)" stroke-width=".8"/></g>
        <g transform="translate(160 124)"><path d="${gear(0, 0, 4.2, 6, 0.3)}" fill="url(#${id}-brass)" stroke="var(--av-ink)" stroke-width=".8"/></g>
        <!-- лицо: объём градиентом, свет слева сверху -->
        <path d="M120 58 C143 58 161 75 161 101 C161 127 149 150 133 161 C126 166 114 166 107 161 C91 150 79 127 79 101 C79 75 97 58 120 58 Z"
              fill="url(#${id}-skin)" stroke="var(--av-ink)" stroke-width="2"/>
        <g clip-path="url(#${id}-face)">
          <path d="M150 80 C160 104 156 136 136 160 L164 160 L164 76 Z" fill="var(--av-shadow)" opacity=".22" filter="url(#${id}-soft)"/>
          <ellipse cx="120" cy="72" rx="40" ry="10" fill="var(--av-shadow)" opacity=".35" filter="url(#${id}-soft)"/>
          <path d="M159 86 C163 110 158 136 140 158" fill="none" stroke="var(--av-rim)" stroke-width="2.2" opacity=".55" filter="url(#${id}-soft)"/>
        </g>
        <!-- брови -->
        <g class="brows" stroke="var(--av-hair-lo)" stroke-width="2.8" stroke-linecap="round" fill="none">
          <path class="brow-l" d="M92 97 Q103 92 114 96"/>
          <path class="brow-r" d="M126 96 Q137 92 148 97"/>
        </g>
        <!-- глаза: миндалевидные, взрослые пропорции -->
        <g class="eyes">
          ${["l", "r"].map((side) => `
          <g class="eye eye-${side}" transform="translate(${side === "l" ? 103.5 : 136.5} 110) scale(1.16)">
            <clipPath id="${id}-eye${side}"><path d="M-11 0 C-6 -7.5 6 -7.5 11 0 C6 5.5 -6 5.5 -11 0 Z"/></clipPath>
            <path class="white" d="M-11 0 C-6 -7.5 6 -7.5 11 0 C6 5.5 -6 5.5 -11 0 Z" fill="var(--av-eye-white)"/>
            <g class="pupil-wrap" clip-path="url(#${id}-eye${side})">
              <g class="pupil"><circle r="5.4" fill="var(--av-iris)"/><circle r="5.4" fill="none" stroke="var(--av-iris-lo)" stroke-width="1.2"/>
                <circle r="2.4" fill="var(--av-ink)"/><circle cx="1.8" cy="-2" r="1.4" fill="#fff"/></g>
              <rect class="lid" x="-12" y="-8" width="24" height="0" fill="var(--av-skin)"/>
              <path class="lid-edge" d="M-11 -6 Q0 -3 11 -6" fill="none" stroke="var(--av-ink)" stroke-width="2" opacity="0"/>
            </g>
            <path class="rim" d="M-12 0.5 C-7 -8.5 7 -8.5 12 -0.5 L14 -2.5" fill="none" stroke="var(--av-ink)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"
                  transform="${side === "l" ? "scale(-1 1)" : ""}"/>
            <path class="rim-low" d="M-10 1.5 C-5 5.5 5 5.5 10 1.5" fill="none" stroke="var(--av-ink)" stroke-width="1" opacity=".55"/>
            <path class="lash" d="M${side === "l" ? "-11 -1 l-3 -3" : "11 -1 l3 -3"}" stroke="var(--av-ink)" stroke-width="1.4" stroke-linecap="round"/>
            <path class="closed" d="M-11 0 Q0 6 11 0" fill="none" stroke="var(--av-ink)" stroke-width="2.4" stroke-linecap="round" opacity="0"/>
            <path class="happy" d="M-10 2 Q0 -7 10 2" fill="none" stroke="var(--av-ink)" stroke-width="2.6" stroke-linecap="round" opacity="0"/>
          </g>`).join("")}
        </g>
        <!-- нос с бликом и тенью -->
        <path d="M120.5 119 C119 123.5 117.5 126.5 119.5 128.5 C121.5 129.5 123 129 124 127.6" fill="none" stroke="var(--av-ink-soft)" stroke-width="1.5" stroke-linecap="round" opacity=".8"/>
        <ellipse cx="123" cy="127" rx="3.4" ry="2" fill="var(--av-shadow)" opacity=".22" filter="url(#${id}-soft)"/>
        <path d="M118 108 L117.4 120" stroke="#fff" stroke-width="1.6" opacity=".3" stroke-linecap="round"/>
        <ellipse cx="97" cy="121" rx="7" ry="4" fill="#fff" opacity=".18" filter="url(#${id}-soft)"/>
        <g class="blush" opacity=".35"><ellipse cx="96" cy="128" rx="8" ry="3.6" fill="var(--av-blush)" filter="url(#${id}-soft)"/>
          <ellipse cx="144" cy="128" rx="8" ry="3.6" fill="var(--av-blush)" filter="url(#${id}-soft)"/></g>
        <!-- губы -->
        <path class="mouth" d="M109 141 Q114 138 120 140 Q126 138 131 141 Q120 147 109 141 Z" fill="var(--av-lips)" stroke="var(--av-ink)" stroke-width="1.6" stroke-linejoin="round"/>
        <path class="lip-hi" d="M116 143.5 Q120 144.5 124 143.5" fill="none" stroke="#fff" stroke-width="1.2" opacity=".4" stroke-linecap="round"/>
        <!-- чёлка на сторону и пряди у лица -->
        <path d="M80 104 C74 84 90 62 118 62 C146 62 162 78 160 100 C152 88 142 80 128 78 C116 80 104 86 96 96 C90 100 84 102 80 104 Z"
              fill="url(#${id}-hair)" stroke="var(--av-ink)" stroke-width="2" stroke-linejoin="round"/>
        <path d="M80 102 C72 122 76 144 88 158 C84 140 84 122 90 104 Z" fill="url(#${id}-hair)" stroke="var(--av-ink)" stroke-width="1.8"/>
        <path d="M160 100 C168 120 164 142 152 156 C156 138 156 120 152 104 Z" fill="url(#${id}-hair)" stroke="var(--av-ink)" stroke-width="1.8"/>
        <path d="M100 70 C110 64 126 62 140 66" fill="none" stroke="var(--av-hair-hi)" stroke-width="2.2" opacity=".9" stroke-linecap="round"/>
        <!-- латунные очки-гогглы на волосах -->
        <g class="goggles" transform="rotate(-5 120 70)">
          <path d="M78 82 C84 62 102 54 120 54 C138 54 156 62 162 82" fill="none" stroke="#3A2418" stroke-width="7" stroke-linecap="round"/>
          <path d="M78 82 C84 62 102 54 120 54 C138 54 156 62 162 82" fill="none" stroke="#6E4630" stroke-width="3.4" stroke-linecap="round"/>
          ${[[103, 62], [137, 62]].map(([x, y], i) => `
          <g transform="translate(${x} ${y})">
            <circle r="13.5" fill="url(#${id}-brass)" stroke="var(--av-ink)" stroke-width="1.8"/>
            <circle r="9.6" fill="url(#${id}-lens)" stroke="var(--av-ink)" stroke-width="1.4"/>
            <path d="M-6 -3 A7 7 0 0 1 2 -7" fill="none" stroke="#fff" stroke-width="2" opacity=".7" stroke-linecap="round"/>
            ${[0, 1, 2, 3, 4, 5].map((k) => { const a = k * Math.PI / 3 + 0.3; return `<circle cx="${(11.6 * Math.cos(a)).toFixed(2)}" cy="${(11.6 * Math.sin(a)).toFixed(2)}" r="1.1" fill="#5B3B18"/>`; }).join("")}
            ${i === 1 ? '<circle class="led" cx="11" cy="-9" r="2.4" fill="var(--av-accent)" stroke="var(--av-ink)" stroke-width=".8"/>' : ""}
          </g>`).join("")}
          <rect x="114" y="58" width="12" height="7" rx="2" fill="url(#${id}-brass)" stroke="var(--av-ink)" stroke-width="1.4"/>
        </g>
      </g>
    </g>
    <!-- «думаю»: пар над шестерёнкой -->
    <g class="think" opacity="0" fill="var(--av-steam)">
      <circle cx="184" cy="46" r="5"/><circle cx="194" cy="34" r="6.5"/><circle cx="208" cy="20" r="8.5"/>
    </g>
    <g class="zz" opacity="0" fill="none" stroke="var(--av-accent2)" stroke-width="2.4" stroke-linejoin="round">
      <path d="M176 62 h12 l-12 12 h12"/><path d="M196 40 h9 l-9 9 h9"/>
    </g>
    <rect class="scan" x="0" y="-60" width="240" height="60" fill="url(#${id}-scan)"/>
  </g>
</svg>`;
  const svg = host.querySelector("svg");
  const q = (s) => svg.querySelector(s);
  const qa = (s) => [...svg.querySelectorAll(s)];
  const st = { state: "idle", mouth: 0, look: [0, 0], t0: performance.now(), raf: 0, nextBlink: 2400, blinkT: -1, gear: 0, last: performance.now() };

  const MOUTH = {
    idle: "M109 141 Q114 138 120 140 Q126 138 131 141 Q120 147 109 141 Z",
    happy: "M106 139 Q120 143 134 139 Q131 151 120 152 Q109 151 106 139 Z",
    warning: "M111 143 Q120 140 129 143 Q120 145 111 143 Z",
    sleep: "M113 143 Q120 144.5 127 143 Q120 146 113 143 Z",
    thinking: "M113 142 Q120 140 128 142.5 Q120 145.5 113 142 Z",
  };
  const BROWS = {
    idle: ["M92 97 Q103 92 114 96", "M126 96 Q137 92 148 97"],
    warning: ["M92 93 Q103 95 114 99", "M126 99 Q137 95 148 93"],
    thinking: ["M92 95 Q103 89 114 94", "M126 97 Q137 95 148 98"],
    happy: ["M92 95 Q103 89 114 93", "M126 93 Q137 89 148 95"],
    reading: ["M92 98 Q103 94 114 97", "M126 97 Q137 94 148 98"],
  };

  function apply(now) {
    const t = (now - st.t0) / 1000;
    const dt = Math.min(0.1, (now - st.last) / 1000);
    st.last = now;
    const s = st.state;
    q(".body").setAttribute("transform", `translate(0 ${Math.sin(t * 1.6) * 1.3})`);
    q(".head").setAttribute("transform", `rotate(${Math.sin(t * 0.7) * 1.1 + (s === "thinking" ? -3 : 0)} 120 118)`);
    st.gear += dt * (s === "thinking" ? 70 : s === "sleep" ? 0 : 9);
    q(".g1").setAttribute("transform", `rotate(${st.gear})`);
    q(".g2").setAttribute("transform", `rotate(${-st.gear * 1.6})`);
    q(".g3").setAttribute("transform", `rotate(${st.gear * 3})`);
    if (s !== "sleep" && now > st.nextBlink && st.blinkT < 0) st.blinkT = now;
    let lid = s === "sleep" ? 1 : s === "warning" ? 0.22 : s === "reading" ? 0.3 : 0;
    if (st.blinkT >= 0) {
      const p = (now - st.blinkT) / 150;
      if (p >= 1) { st.blinkT = -1; st.nextBlink = now + 2600 + Math.random() * 3600; }
      else lid = Math.max(lid, Math.sin(p * Math.PI));
    }
    const happy = s === "happy";
    for (const e of qa(".eye")) {
      const k = happy ? 0 : lid;
      const closed = k > 0.92;
      const y = -8 + k * 13;
      e.querySelector(".lid").setAttribute("height", Math.max(0, k * 14));
      const edge = e.querySelector(".lid-edge");
      edge.setAttribute("d", `M-11 ${y} Q0 ${y + 3} 11 ${y}`);
      edge.setAttribute("opacity", k > 0.05 && !closed ? 1 : 0);
      e.querySelector(".closed").setAttribute("opacity", closed && !happy ? 1 : 0);
      e.querySelector(".happy").setAttribute("opacity", happy ? 1 : 0);
      for (const c of [".white", ".rim", ".rim-low", ".pupil-wrap", ".lash"]) e.querySelector(c).setAttribute("opacity", happy || closed ? 0 : 1);
      const [lx, ly] = s === "thinking" ? [3, -2.5] : s === "reading" ? [0, 2] : st.look;
      e.querySelector(".pupil").setAttribute("transform", `translate(${lx} ${ly})`);
    }
    const b = BROWS[s] || BROWS.idle;
    q(".brow-l").setAttribute("d", b[0]); q(".brow-r").setAttribute("d", b[1]);
    let m;
    if (s === "speaking" || st.mouth > 0.02) {
      const o = Math.max(0.08, st.mouth);
      const w = 10 + o * 1.8, h = 2 + o * 13;
      m = `M${120 - w} 141 Q120 ${139 - o * 1.5} ${120 + w} 141 Q120 ${141 + h} ${120 - w} 141 Z`;
    } else m = MOUTH[s] || MOUTH.idle;
    q(".mouth").setAttribute("d", m);
    q(".lip-hi").setAttribute("opacity", s === "speaking" || st.mouth > 0.02 ? 0 : 0.4);
    q(".blush").setAttribute("opacity", happy ? 0.9 : 0.35);
    q(".think").setAttribute("opacity", s === "thinking" ? 0.45 + Math.sin(t * 5) * 0.35 : 0);
    q(".think").setAttribute("transform", `translate(0 ${-((t * 8) % 6)})`);
    q(".zz").setAttribute("opacity", s === "sleep" ? 0.5 + Math.sin(t * 2) * 0.5 : 0);
    q(".led").setAttribute("opacity", s === "speaking" ? 0.35 + st.mouth * 0.65 : 0.45 + Math.sin(t * 3) * 0.3);
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
      st.look = [Math.max(-1, Math.min(1, dx)) * 2.6, Math.max(-1, Math.min(1, dy)) * 1.6];
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

// Цвета аватара: тёплые телесные и латунь постоянны, волосы и свечение — от палитры профиля
export function avatarCss() {
  return `.hy-avatar{--av-ink:#1d1222;--av-ink-soft:#7a4f4a;
  --av-skin:#EBC9AE;--av-skin-hi:#F8E3D0;--av-skin-lo:#C99878;--av-shadow:#6B3A3A;--av-blush:#E58B86;--av-lips:#A8475A;
  --av-hair:color-mix(in srgb,var(--violet) 62%,#2a1438);--av-hair-hi:color-mix(in srgb,var(--violet) 70%,#ffffff);
  --av-hair-lo:color-mix(in srgb,var(--violet) 35%,#140a1c);
  --av-jacket:#2a1a14;--av-jacket-hi:#5a3a28;--av-accent:var(--accent);--av-accent2:var(--violet);
  --av-iris:#D9A441;--av-iris-lo:#8a5a16;--av-eye-white:#FBF6EE;--av-lens:#2E7F86;--av-lens-hi:#9BE3E0;
  --av-rim:var(--violet);--av-gear:color-mix(in srgb,#C99A44 45%,transparent);--av-steam:color-mix(in srgb,#E8E2D6 55%,transparent);
  --av-bg-dot:color-mix(in srgb,var(--violet) 26%,transparent);--av-glow:var(--violet)}
  .hy-avatar svg{display:block}
  .hy-avatar[data-state=warning]{--av-glow:var(--coral);--av-bg-dot:color-mix(in srgb,var(--coral) 28%,transparent);--av-lens-hi:#F3B0A0;--av-lens:#8A3A30}
  .hy-avatar[data-state=happy]{--av-glow:var(--green)}
  .hy-avatar[data-state=sleep]{filter:saturate(.45) brightness(.72)}`;
}
