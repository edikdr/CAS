// Haotica — портрет «точь-в-точь» по эталону (tools/avatar/haotica-reference.png), без фона:
// за фигурой только шестерёнки. Фигура — растровые слои (голова, торс, брови, губы, радужки),
// собранные tools/avatar/build.py, поверх — векторная «анимация»: моргание и веки, взгляд за
// курсором, речь (губы), брови, дыхание (плечи и грудь), наклон головы, блики на линзах гогглов.
// Шестерёнки векторные и вращаются (быстрее, когда Haotica думает).
// Состояния: idle, reading, thinking, speaking, warning, happy, sleep.
import { RIG } from "./avatar/rig.js";
import { beamFilter, tuneBeamFilter } from "./crt.js";

const NS = "http://www.w3.org/2000/svg";
const BASE = new URL("./avatar/", import.meta.url).href;
const [W, H] = RIG.size;
let uid = 0;

const f1 = (v) => (Math.round(v * 10) / 10).toString();
const smooth = (x) => x * x * (3 - 2 * x);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function gearPath({ r0, r1, n, ph, ab, at }) {
  const T = 360 / n, pts = [];
  const P = (r, a) => { const t = a * Math.PI / 180; pts.push(`${f1(r * Math.cos(t))},${f1(r * Math.sin(t))}`); };
  for (let i = 0; i < n; i++) {
    const c = ph + i * T;
    const t0 = c - at * T / 2, t1 = c + at * T / 2, b1 = c + ab * T / 2, nxt = c + T - ab * T / 2;
    for (let a = t0; a < t1; a += 2.5) P(r1, a);
    P(r1, t1); P(r0, b1);
    for (let a = b1 + 2.5; a < nxt; a += 2.5) P(r0, a);
    P(r0, nxt);
  }
  return `M${pts.join("L")}Z`;
}

const img = (cls, layer, extra = "") => {
  const [x, y, w, h] = layer.rect;
  return `<image class="${cls}" href="${BASE}${layer.file}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none" ${extra}/>`;
};
// сглаженная линия через середины отрезков (квадратичные Безье) и замкнутая фигура «верх + низ»
function curve(pts, move = true) {
  if (pts.length < 3) return (move ? "M" : "L") + pts.map((p) => `${f1(p[0])} ${f1(p[1])}`).join("L");
  let d = `${move ? "M" : "L"}${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += `Q${f1(pts[i][0])} ${f1(pts[i][1])} ${f1(mx)} ${f1(my)}`;
  }
  const L = pts[pts.length - 1];
  return d + `L${f1(L[0])} ${f1(L[1])}`;
}
const poly = (a, b) => curve(a) + curve(b.slice().reverse(), false) + "Z";
const every = (arr, n) => arr.filter((_, i) => i % n === 0 || i === arr.length - 1);

// веко и полоса ресниц: k = 0 открыт … 1 закрыт; полоса опускается по столбцам на высоту разреза
function eyePaths(cols, k) {
  const top = [], bot = [], lidTop = [], lidBot = [];
  const x0 = cols[0][0], x1 = cols[cols.length - 1][0];
  for (const [x, , ob, bt, bb] of every(cols, 2)) {
    const edge = clamp(Math.min(x - x0, x1 - x) / 12, 0, 1);      // у уголков полоса не едет: стык с растром
    const d = Math.max(0, ob - bb + 1) * k * smooth(edge);
    top.push([x, bt + d]); bot.push([x, bb + d]); lidTop.push([x, bt - 1.2]); lidBot.push([x, bb + d + 1.5 * k]);
  }
  return { band: poly(top, bot), lid: poly(lidTop, lidBot) };
}

// векторные губы (для речи и мимики): профиль снят с эталона, рот открывается «горбом» к центру
function mouthPaths(m) {
  const cols = RIG.lips.cols, x0 = cols[0][0], x1 = cols[cols.length - 1][0];
  const U = [], UL = [], LT = [], LB = [], TT = [];
  for (const [x, top, line, bot] of cols) {
    const u = (x - x0) / (x1 - x0);
    const bump = Math.pow(Math.sin(Math.PI * u), 0.85);
    const corner = Math.pow(1 - bump, 1.6);
    const sm = -m.smile * 7 * corner;                    // уголки вверх (улыбка) / вниз (<0)
    const open = m.open * 17 * bump, lift = m.open * 2.2 * bump;
    const xx = x + m.shift * bump + (m.pout * (617 - x) * 0.07);
    const lowT = (bot - line) * (1 - 0.32 * m.press);
    U.push([xx, top + sm + m.press * 1.2 * bump]);
    UL.push([xx, line - lift + sm]);
    LT.push([xx, line + open + sm]);
    LB.push([xx, line + open + sm + lowT]);
    TT.push([xx, line - lift + sm + Math.min(open * 0.42, 5.5)]);
  }
  return { upper: poly(U, UL), lower: poly(LT, LB), inner: poly(UL, LT), teeth: poly(UL, TT),
    line: curve(UL) };
}

// выражения: веко, взгляд, брови (сдвиг вниз, «внутренний край вниз» в градусах), рот
const EXPR = {
  idle:     { lid: 0, look: null, bl: [0, 0], br: [0, 0], tilt: 0, mouth: null },
  reading:  { lid: 0.3, look: [0, 3], bl: [1.5, 2], br: [1.5, 2], tilt: 0.6, mouth: null },
  thinking: { lid: 0.1, look: [6, -3.5], bl: [1, 3], br: [-5, -5], tilt: -2.2, mouth: { open: 0, smile: 0, press: 0.5, shift: 3, pout: 1 } },
  speaking: { lid: 0, look: null, bl: [0, 0], br: [0, 0], tilt: 0, mouth: { open: 0, smile: 0.1, press: 0, shift: 0, pout: 0 } },
  happy:    { lid: 0.42, look: [0, -1], bl: [-3.5, -1], br: [-3.5, -1], tilt: 1.2, mouth: { open: 0.24, smile: 1, press: 0, shift: 0, pout: 0 } },
  warning:  { lid: 0.18, look: [0, 0], bl: [3.5, 7], br: [3.5, 7], tilt: 0, mouth: { open: 0, smile: -0.45, press: 1, shift: 0, pout: 0 } },
  sleep:    { lid: 1, look: [0, 2], bl: [2, -1], br: [2, -1], tilt: 3, mouth: null },
};

// crt — свой CRT аватара (расхождение лучей, свечение) поверх того, что есть у окна: 0…1
export function createAvatar(host, { size = 260, interactive = true, crt = 0 } = {}) {
  const id = "hav" + (++uid);
  host.classList.add("hy-avatar");
  const E = RIG.eyes, C = RIG.chest;
  const gearSvg = Object.entries(RIG.gears).map(([name, g]) => `
    <g transform="translate(${g.cx} ${g.cy})"><g class="g-${name}">
      <path d="${gearPath(g)}" stroke-width="${g.w}"/>
      ${g.rings.map(([r, w]) => `<circle r="${r}" stroke-width="${w}"/>`).join("")}
    </g></g>`).join("");
  const eyeSvg = (s) => {
    const e = E[s];
    const xs = e.cols.map((c) => c[0]), ys = e.cols.flatMap((c) => [c[1], c[2]]);
    const bx = Math.min(...xs) - 4, by = Math.min(...ys) - 4, bw = Math.max(...xs) - bx + 8, bh = Math.max(...ys) - by + 8;
    return `
      <g class="eye eye-${s}">
        <g clip-path="url(#${id}-eye${s})">
          <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="url(#${id}-white)"/>
          <g class="iris">${img("", e)}</g>
        </g>
        <g class="av-blink" style="display:none">
          <path class="lid" fill="${E[s].lid || RIG.colors.skin}"/>
          <path class="band" fill="${RIG.colors.line}"/>
        </g>
      </g>`;
  };
  host.innerHTML = `
<svg viewBox="0 0 ${W} ${H}" width="${size}" height="${Math.round(size * H / W)}" xmlns="${NS}" class="hav" aria-label="Haotica">
  <defs>
    <clipPath id="${id}-face"><path d="${RIG.face}"/></clipPath>
    <clipPath id="${id}-eyel"><path d="${E.l.clip}"/></clipPath>
    <clipPath id="${id}-eyer"><path d="${E.r.clip}"/></clipPath>
    <linearGradient id="${id}-white" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#E3CFDA"/><stop offset=".38" stop-color="#F5EFF2"/><stop offset="1" stop-color="#FBF8F9"/>
    </linearGradient>
    <radialGradient id="${id}-chestg" cx=".5" cy=".5" r=".5">
      <stop offset=".62" stop-color="#fff"/><stop offset="1" stop-color="#000"/>
    </radialGradient>
    <mask id="${id}-chest" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">
      <ellipse cx="${C.cx}" cy="${C.cy}" rx="${C.rx}" ry="${C.ry}" fill="url(#${id}-chestg)"/>
    </mask>
    ${RIG.lenses.map(([x, y, r], i) => `<clipPath id="${id}-lens${i}"><circle cx="${x}" cy="${y}" r="${r - 4}"/></clipPath>`).join("")}
    <linearGradient id="${id}-glint" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    ${beamFilter(`${id}-crt`)}
    <linearGradient id="${id}-ulip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5E0B38"/><stop offset="1" stop-color="#3F0627"/></linearGradient>
    <linearGradient id="${id}-llip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B51D55"/><stop offset=".45" stop-color="#D3306A"/><stop offset="1" stop-color="#A3194B"/></linearGradient>
  </defs>
  <g class="crtwrap">
  <g class="gears" fill="none" stroke="var(--av-gear)" stroke-linejoin="round">${gearSvg}</g>
  <g class="fig">
    <g class="headwrap"><g class="head">
      ${img("hd", RIG.head)}
      ${eyeSvg("l")}${eyeSvg("r")}
      <g clip-path="url(#${id}-face)">${img("brow brow-l", RIG.brows.l)}${img("brow brow-r", RIG.brows.r)}</g>
      ${img("lips", RIG.lips)}
      <g class="mouth" opacity="0">
        <path class="m-inner" fill="#2B0716"/><path class="m-teeth" fill="#F3E9E6"/>
        <path class="m-lower" fill="url(#${id}-llip)" stroke="#2A0418" stroke-width="1" stroke-opacity=".55" stroke-linejoin="round"/>
        <path class="m-upper" fill="url(#${id}-ulip)" stroke="#2A0418" stroke-width="1" stroke-opacity=".55" stroke-linejoin="round"/>
        <path class="m-line" fill="none" stroke="#14020C" stroke-width="2.6" stroke-linecap="round"/>
      </g>
      ${RIG.lenses.map((l, i) => `<g clip-path="url(#${id}-lens${i})"><rect class="glint glint${i}" x="-60" y="${l[1] - 70}" width="34" height="140" fill="url(#${id}-glint)" opacity="0"/></g>`).join("")}
    </g></g>
    <g class="torso">${img("ts", RIG.torso)}<g class="chest" mask="url(#${id}-chest)">${img("ts2", RIG.torso)}</g></g>
  </g>
  <g class="steam" opacity="0" fill="var(--av-steam)">
    <circle cx="1030" cy="176" r="15"/><circle cx="1066" cy="130" r="20"/><circle cx="1110" cy="78" r="27"/>
  </g>
  <g class="zz" opacity="0" fill="none" stroke="var(--av-zz)" stroke-width="7" stroke-linejoin="round" stroke-linecap="round">
    <path d="M860 230 h34 l-34 34 h34"/><path d="M915 168 h26 l-26 26 h26"/>
  </g>
  </g>
</svg>`;
  const svg = host.querySelector("svg");
  const q = (s) => svg.querySelector(s);
  const el = {
    head: q(".head"), headwrap: q(".headwrap"), torso: q(".torso"), chest: q(".chest"),
    gears: Object.fromEntries(Object.keys(RIG.gears).map((k) => [k, q(".g-" + k)])),
    eyes: ["l", "r"].map((s) => ({ s, iris: q(`.eye-${s} .iris`), blink: q(`.eye-${s} .av-blink`), lid: q(`.eye-${s} .lid`), band: q(`.eye-${s} .band`) })),
    browL: q(".brow-l"), browR: q(".brow-r"), lips: q(".lips"), mouth: q(".mouth"),
    mUpper: q(".m-upper"), mLower: q(".m-lower"), mInner: q(".m-inner"), mTeeth: q(".m-teeth"), mLine: q(".m-line"),
    glints: [q(".glint0"), q(".glint1")], steam: q(".steam"), zz: q(".zz"),
  };
  const now0 = performance.now();
  const st = {
    state: "idle", mouth: 0, look: [0, 0], raf: 0, last: now0, t0: now0,
    nextBlink: now0 + 1800, blinkT: -1, gear: 0, spin: 0,
    // сглаженные параметры выражения
    lid: 0, lx: 0, ly: 0, bl: [0, 0], br: [0, 0], tilt: 0,
    m: { open: 0, smile: 0, press: 0, shift: 0, pout: 0 }, mv: 0,
    chest: 0, chestV: 0, lastLid: -1, lastMouth: "", glintAt: now0 + 2500, glintT: -1, frame: 0,
  };
  const lerp = (a, b, k) => a + (b - a) * k;

  function breath(t, period) {
    const p = (t % period) / period;
    return p < 0.4 ? smooth(p / 0.4) : 1 - smooth((p - 0.4) / 0.6);
  }

  function apply(now) {
    const t = (now - st.t0) / 1000;
    const dt = Math.min(0.1, (now - st.last) / 1000);
    st.last = now;
    const s = st.state, X = EXPR[s] || EXPR.idle;
    const ease = st.instant ? 1 : 1 - Math.exp(-dt * 10);

    // дыхание: плечи и грудь поднимаются на вдохе; грудь догоняет с мягкой пружиной
    const period = s === "sleep" ? 6.2 : s === "speaking" ? 3.6 : 4.4;
    const amp = s === "speaking" ? 0.7 : 1;
    const b = breath(t, period) * amp;
    st.chestV += (55 * (b - st.chest) - 9 * st.chestV) * dt;
    st.chest += st.chestV * dt;
    const c = st.chest;
    el.torso.setAttribute("transform", `translate(0 ${f1(-6 * b)}) translate(617 ${H}) scale(${(1 + 0.003 * b).toFixed(4)} ${(1 + 0.007 * b).toFixed(4)}) translate(-617 ${-H})`);
    el.chest.setAttribute("transform", `translate(${C.anchor[0]} ${C.anchor[1]}) scale(${(1 + 0.02 * c).toFixed(4)} ${(1 + 0.026 * c).toFixed(4)}) translate(${-C.anchor[0]} ${f1(-C.anchor[1] - 1.5 * c)})`);
    el.headwrap.setAttribute("transform", `translate(0 ${f1(-9.2 * b)})`);
    st.tilt = st.instant ? X.tilt : lerp(st.tilt, X.tilt, ease * 0.5);
    const talk = s === "speaking" ? Math.sin(t * 7.3) * st.mouth * 0.7 : 0;
    const rot = Math.sin(t * 0.55) * 0.6 + Math.sin(t * 1.3 + 1) * 0.22 + st.tilt + talk;
    el.head.setAttribute("transform", `rotate(${rot.toFixed(3)} ${RIG.head.pivot[0]} ${RIG.head.pivot[1]})`);

    // шестерёнки: большая и малая сцеплены (12:8), левая — своя
    const want = s === "thinking" ? 55 : s === "happy" ? 22 : s === "sleep" ? 0 : 7;
    st.spin = lerp(st.spin, want, 1 - Math.exp(-dt * 2));
    st.gear += dt * st.spin;
    el.gears.big?.setAttribute("transform", `rotate(${(st.gear).toFixed(2)})`);
    el.gears.small?.setAttribute("transform", `rotate(${(-st.gear * 1.5).toFixed(2)})`);
    el.gears.left?.setAttribute("transform", `rotate(${(-st.gear * 1.2).toFixed(2)})`);

    // веки и моргание
    if (s !== "sleep" && now > st.nextBlink && st.blinkT < 0) st.blinkT = now;
    st.lid = lerp(st.lid, X.lid, ease);
    let k = st.lid;
    if (st.blinkT >= 0) {
      const p = (now - st.blinkT) / 160;
      if (p >= 1) { st.blinkT = -1; st.nextBlink = now + 2600 + Math.random() * 3800; }
      else k = Math.max(k, Math.sin(p * Math.PI));
    }
    const kq = Math.round(k * 60) / 60;
    if (kq !== st.lastLid) {
      st.lastLid = kq;
      for (const e of el.eyes) {
        if (kq < 0.015) { e.blink.style.display = "none"; continue; }
        e.blink.style.display = "";
        const p = eyePaths(E[e.s].cols, kq);
        e.lid.setAttribute("d", p.lid); e.band.setAttribute("d", p.band);
      }
    }
    // взгляд
    const [tx, ty] = X.look || st.look;
    st.lx = lerp(st.lx, tx, ease); st.ly = lerp(st.ly, ty, ease);
    for (const e of el.eyes) e.iris.setAttribute("transform", `translate(${f1(st.lx)} ${f1(st.ly)})`);

    // брови: [сдвиг вниз, «внутренний край вниз» в градусах]; при речи — живее
    const lift = s === "speaking" ? -2.5 * st.mouth : 0;
    st.bl = [lerp(st.bl[0], X.bl[0] + lift, ease), lerp(st.bl[1], X.bl[1], ease)];
    st.br = [lerp(st.br[0], X.br[0] + lift, ease), lerp(st.br[1], X.br[1], ease)];
    const B = RIG.brows;
    el.browL.setAttribute("transform", `translate(0 ${f1(st.bl[0])}) rotate(${st.bl[1].toFixed(2)} ${B.l.outer[0]} ${B.l.outer[1]})`);
    el.browR.setAttribute("transform", `translate(0 ${f1(st.br[0])}) rotate(${(-st.br[1]).toFixed(2)} ${B.r.outer[0]} ${B.r.outer[1]})`);

    // рот: растровые губы эталона в покое; векторные — для речи и мимики
    const target = X.mouth || (st.mouth > 0.02 ? EXPR.speaking.mouth : null);
    const vec = !!target;
    st.mv = st.instant ? (vec ? 1 : 0) : lerp(st.mv, vec ? 1 : 0, 1 - Math.exp(-dt * 14));
    const tm = target || { open: 0, smile: 0, press: 0, shift: 0, pout: 0 };
    const open = s === "speaking" || st.mouth > 0.02 ? Math.max(tm.open, st.mouth) : tm.open;
    for (const key of ["smile", "press", "shift", "pout"]) st.m[key] = lerp(st.m[key], tm[key], ease);
    st.m.open = st.instant ? open : lerp(st.m.open, open, 1 - Math.exp(-dt * 22));
    el.lips.setAttribute("opacity", (1 - st.mv).toFixed(3));
    el.mouth.setAttribute("opacity", st.mv.toFixed(3));
    if (st.mv > 0.01) {
      const sig = [st.m.open, st.m.smile, st.m.press, st.m.shift, st.m.pout].map((v) => v.toFixed(3)).join();
      if (sig !== st.lastMouth) {
        st.lastMouth = sig;
        const p = mouthPaths(st.m);
        el.mUpper.setAttribute("d", p.upper); el.mLower.setAttribute("d", p.lower);
        el.mInner.setAttribute("d", p.inner); el.mTeeth.setAttribute("d", p.teeth); el.mLine.setAttribute("d", p.line);
        el.mTeeth.setAttribute("opacity", st.m.open > 0.12 ? 1 : 0);
      }
    }

    // блик по линзам гогглов раз в несколько секунд
    if (st.glintT < 0 && now > st.glintAt) st.glintT = now;
    if (st.glintT >= 0) {
      const p = (now - st.glintT) / 900;
      el.glints.forEach((g, i) => {
        const L = RIG.lenses[i], pp = clamp(p - i * 0.12, 0, 1);
        const x = L[0] - L[2] * 1.7 + pp * L[2] * 3.4;
        g.setAttribute("transform", `translate(${f1(x + 60)} 0) rotate(28 ${-43} ${L[1]})`);
        g.setAttribute("opacity", pp > 0 && pp < 1 ? (Math.sin(pp * Math.PI) * 0.9).toFixed(2) : 0);
      });
      if (p > 1.2) { st.glintT = -1; st.glintAt = now + 6000 + Math.random() * 5000; }
    }

    el.steam.setAttribute("opacity", s === "thinking" ? (0.4 + Math.sin(t * 5) * 0.3).toFixed(2) : 0);
    el.steam.setAttribute("transform", `translate(0 ${f1(-((t * 40) % 30))})`);
    el.zz.setAttribute("opacity", s === "sleep" ? (0.5 + Math.sin(t * 2) * 0.5).toFixed(2) : 0);
    host.dataset.state = s;
  }
  // 30 кадров/с хватает для дыхания, моргания и губ; на 165 Гц экране это экономит GPU
  // (в терминале каждый кадр аватара перерисовывает CRT-фильтр)
  // говорит или двигает губами — 24 кадра/с (в такт с волной голоса, тот же кадр); в покое — 12; без фокуса — 2
  // кадры — по таймеру (не rAF на каждом обновлении экрана: на 165 Гц пустые кадры стоили почти ядро);
  // в покое моменты кадров кратны периоду — общий такт окна: фон и графики попадают в тот же кадр
  const beat = (ms) => ms - (performance.now() % ms) + 1;
  const TICK = 1000 / 24;            // общий шаг такта окна: губы 24 кадра/с, покой 12, без фокуса 2
  function loop(now) {
    st.frame = now; apply(now);
    clearTimeout(st.timer);
    if (st.dead || document.hidden) return;
    const ui = window.__hyUI, talking = (st.mouth || 0) > 0.02 || st.state === "speaking";
    st.timer = setTimeout(() => { st.raf = requestAnimationFrame(loop); }, talking ? beat(TICK) : beat(ui && !ui.focused ? TICK * 12 : TICK * 2));
  }
  st.raf = requestAnimationFrame(loop);
  const onMove = (e) => {
    const r = svg.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / Math.max(200, innerWidth / 2);
    const dy = (e.clientY - (r.top + r.height * 0.42)) / Math.max(200, innerHeight / 2);
    st.look = [clamp(dx, -1, 1) * 7, clamp(dy, -1, 1) * 3];
  };
  if (interactive) window.addEventListener("mousemove", onMove);
  const onVis = () => { cancelAnimationFrame(st.raf); clearTimeout(st.timer); if (!document.hidden) st.raf = requestAnimationFrame(loop); };
  document.addEventListener("visibilitychange", onVis);
  const wrap = q(".crtwrap"), flt = svg.querySelector(`#${id}-crt`);
  function setCrt(k) {
    if (!(k > 0)) { wrap.removeAttribute("filter"); return; }
    // свечение слабее, чем у окна: аватар и так лежит под CRT окна, двойное свечение «выбеливает» кожу
    tuneBeamFilter(flt, Math.min(1, k), W / Math.max(1, svg.getBoundingClientRect().width || size), { glow: 0.25 });
    wrap.setAttribute("filter", `url(#${id}-crt)`);
  }
  setCrt(crt);
  return {
    el: host,
    setCrt,
    // instant — сразу в итоговое выражение, без плавного перехода и моргания (статичный портрет)
    setState(s, { instant = false } = {}) {
      st.state = EXPR[s] ? s : "idle";
      if (instant) { st.instant = true; st.blinkT = -1; st.nextBlink = Infinity; apply(performance.now()); }
    },
    get state() { return st.state; },
    setMouth(v) { st.mouth = clamp(v || 0, 0, 1); if (st.instant) apply(performance.now()); },
    destroy() {
      st.dead = true; clearTimeout(st.timer);
      cancelAnimationFrame(st.raf);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("visibilitychange", onVis);
      host.innerHTML = "";
    },
  };
}

// Цвета: шестерёнки латунно-оранжевые как в эталоне; при тревоге — коралловые
export function avatarCss() {
  return `.hy-avatar{--av-gear:#F49A2E;--av-steam:color-mix(in srgb,#E8E2D6 50%,transparent);--av-zz:var(--violet,#9b6bff)}
  .hy-avatar svg{display:block;overflow:visible}
  .hy-avatar .gears{transition:stroke .4s}
  .hy-avatar[data-state=warning]{--av-gear:var(--coral,#ff6a55)}
  .hy-avatar[data-state=sleep] .fig{filter:saturate(.55) brightness(.78)}`;
}
