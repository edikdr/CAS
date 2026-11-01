// Фон окна сеанса: «Сотворение Адама» — две руки, тянущиеся друг к другу, собраны из живого кода.
// Плотность берётся из карты art/hands.png (tools/terminal-art/build.py по точечной картинке):
// каждая строка рук — бегущая строка кода (свой темп и направление), символы ещё и «кипят» —
// часть ежекадрово подменяется; цвета — из палитры терминала (ярче там, где рука плотнее).
// Между указательными пальцами — искра, к ней от плеч катятся волны «данных».
// Рисуется на canvas под xterm (у терминала прозрачный фон), ~16 кадров/с, на паузе вне экрана.

const CODE = [
  "def apply(self, keys): targets |= {'runtime'}", "hl.config({ decoration = { screen_shader = s.crt } })",
  "for (const e of el.eyes) e.iris.setAttribute('transform', t);", "async with self._lock: await self.use('deep')",
  "0x7f3a 0b1101 0xC0DE 0xDEAD 0xBEEF", "if ok and not paused: return await ensure(role)", "SELECT * FROM memory WHERE fts MATCH ?",
  "llama-server -m qwen3.8-27b.gguf --spec-type draft-dflash", "const P = 3 * Math.round(4 * dpr / 3);", "git commit -m 'spark'",
  "while true; do hyprctl dispatch workspace +1; done", "fn main() -> Result<(), Error> { Ok(()) }", "export function createAvatar(host) {",
  "∑ λ → ∞ ⟨ψ|H|ψ⟩ ∂/∂t ∇·E = ρ/ε₀", "pacman -Syu --needed hyprland quickshell", "#!/usr/bin/env python3", "return {k: v for k, v in s.items()}",
  "<svg viewBox='0 0 1214 1296'>", "systemctl --user start haotica-llm-base", "[0x00] HAOTICA // NEURAL CORE ONLINE", "let ψ = fold(xs, 0, |a, x| a ^ x);",
];
const GLYPHS = "01{}[]()<>=+-*/\\|;:.,_#$%&@!?~^abcdefxyz0123456789ΣΛΨΩλψ";

export async function startHandsArt(canvas, { opacity = () => 0.5, font = () => "monospace", colors = () => ({}) } = {}) {
  const [meta, map] = await Promise.all([
    fetch(new URL("art/hands.json", import.meta.url)).then((r) => r.json()),
    new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = bad; im.src = new URL("art/hands.png", import.meta.url).href; }),
  ]);
  const off = document.createElement("canvas");
  off.width = meta.w; off.height = meta.h;
  const og = off.getContext("2d", { willReadFrequently: true });
  og.drawImage(map, 0, 0);
  const px = og.getImageData(0, 0, meta.w, meta.h).data;
  const dens = new Float32Array(meta.w * meta.h);
  for (let i = 0; i < dens.length; i++) dens[i] = px[i * 4] / 255;
  const sample = (x, y) => {                      // билинейно по карте
    if (x < 0 || y < 0 || x >= meta.w - 1 || y >= meta.h - 1) return 0;
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * meta.w + x0;
    return (dens[i] * (1 - fx) + dens[i + 1] * fx) * (1 - fy) + (dens[i + meta.w] * (1 - fx) + dens[i + meta.w + 1] * fx) * fy;
  };

  // мягкий «объём» рук под символами: карта плотности, тонированная цветом палитры
  const tint = document.createElement("canvas");
  tint.width = meta.w; tint.height = meta.h;
  let tintKey = "";
  function tintMap(col) {
    if (col === tintKey) return;
    tintKey = col;
    const tg = tint.getContext("2d");
    const id = tg.createImageData(meta.w, meta.h);
    const c = (col.match(/[0-9a-f]{2}/gi) || ["7a", "c8", "c0"]).slice(0, 3).map((h) => parseInt(h, 16));
    for (let i = 0; i < dens.length; i++) {
      id.data[i * 4] = c[0]; id.data[i * 4 + 1] = c[1]; id.data[i * 4 + 2] = c[2];
      id.data[i * 4 + 3] = Math.round(255 * Math.pow(dens[i], 1.4));
    }
    tg.putImageData(id, 0, 0);
  }
  const g = canvas.getContext("2d");
  const st = { cells: [], rows: [], cw: 6, ch: 11, fs: 10, w: 0, h: 0, dpr: 1, raf: 0, last: 0, t0: performance.now(), key: "",
    spark: [0, 0], bx: 0, by: 0, bw: 0, bh: 0 };

  function layout() {
    const r = canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    const key = `${Math.round(r.width)}x${Math.round(r.height)}@${dpr}`;
    if (key === st.key || r.width < 40 || r.height < 40) return;
    st.key = key; st.dpr = dpr; st.w = r.width; st.h = r.height;
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    st.fs = Math.max(7, Math.min(11, Math.round(r.width / 118)));
    g.font = `${st.fs}px ${font()}`;
    st.cw = Math.max(4, g.measureText("M").width); st.ch = Math.round(st.fs * 1.12);
    // полоса рук — по ширине окна, чуть выше центра
    st.bw = r.width * 1.1; st.bh = st.bw * meta.h / meta.w;
    if (st.bh > r.height * 0.9) { st.bh = r.height * 0.9; st.bw = st.bh * meta.w / meta.h; }
    st.bx = (r.width - st.bw) / 2; st.by = Math.max(0, (r.height - st.bh) * 0.46);
    st.spark = [st.bx + (meta.spark[0] + 0.5) / meta.w * st.bw, st.by + (meta.spark[1] + 0.5) / meta.h * st.bh];
    const cols = Math.ceil(r.width / st.cw), rows = Math.ceil(r.height / st.ch);
    st.cells = []; st.rows = [];
    for (let j = 0; j < rows; j++) {
      const y = j * st.ch, my = (y + st.ch / 2 - st.by) / st.bh * meta.h;
      if (my < 0 || my > meta.h) continue;
      const row = { j, text: CODE[(j * 7 + 3) % CODE.length] + "   " + CODE[(j * 11 + 5) % CODE.length] + "   ",
        speed: (4 + ((j * 37) % 11)) * (j % 2 ? 1 : -1), cells: [] };
      for (let i = 0; i < cols; i++) {
        const x = i * st.cw, mx = (x + st.cw / 2 - st.bx) / st.bw * meta.w;
        const d = sample(mx, my);
        if (d < 0.1) continue;
        const c = { i, j, x, y, d, ch: GLYPHS[(i * 13 + j * 7) % GLYPHS.length], seed: Math.random() };
        row.cells.push(c); st.cells.push(c);
      }
      if (row.cells.length) st.rows.push(row);
    }
  }

  const BUCKETS = [[0.72, "ink"], [0.45, "teal"], [0.22, "violet"], [0, "dim"]];
  function frame(now) {
    st.raf = requestAnimationFrame(frame);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (now - st.last < (reduce ? 160 : 62)) return;           // ~16 кадров/с
    st.last = now;
    layout();
    if (!st.cells.length) return;
    const t = (now - st.t0) / 1000, pal = colors(), k = opacity();
    const dpr = st.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, st.w, st.h);
    if (k <= 0) return;
    tintMap(/^#[0-9a-f]{6}/i.test(pal.teal || "") ? pal.teal : "#7ac8c0");
    g.globalAlpha = Math.min(1, k * 0.32);
    g.imageSmoothingEnabled = true;
    g.drawImage(tint, st.bx, st.by, st.bw, st.bh);
    g.globalAlpha = 1;
    g.font = `${st.fs}px ${font()}`;
    g.textBaseline = "top";
    // волны «данных» катятся от плеч к пальцам; у искры — пульс
    const wave = (t % 3.2) / 3.2;
    const sx = st.spark[0];
    const groups = new Map();
    const put = (col, a, c, chr) => {
      const q = Math.min(4, Math.round(a * 4));
      if (!q) return;
      const key = col + q;
      let arr = groups.get(key);
      if (!arr) { arr = { col, a: q / 4, list: [] }; groups.set(key, arr); }
      arr.list.push(c.x, c.y, chr);
    };
    for (const row of st.rows) {
      const shift = Math.floor(t * row.speed);
      const L = row.text.length;
      for (const c of row.cells) {
        // мерцающее «растровое» заполнение: чем плотнее рука, тем чаще символ виден
        const flick = (Math.sin(c.seed * 97 + t * (6 + c.seed * 9)) * 0.5 + 0.5);
        const vis = Math.min(1, Math.max(0, (c.d - 0.1) / 0.4)) * 1.15;   // разреженный край почти пуст
        if (flick > vis) continue;
        let chr = row.text[((c.i + shift) % L + L) % L];
        if (chr === " " || Math.random() < 0.18) chr = GLYPHS[(Math.random() * GLYPHS.length) | 0];
        const dist = Math.abs(c.x - sx) / (st.w / 2);                  // 1 у края … 0 у пальцев
        const hot = Math.max(0, 1 - Math.abs(dist - (1 - wave)) * 9) * 0.9;
        const name = hot > 0.35 ? "accent" : (BUCKETS.find((b) => c.d >= b[0]) || BUCKETS[3])[1];
        const a = Math.min(1, k * (0.25 + 1.1 * Math.pow(c.d, 1.2)) * (1 + hot * 1.4) * (Math.random() < 0.02 ? 1.8 : 1));
        put(pal[name] || "#9a9", a, c, chr);
      }
    }
    for (const gr of groups.values()) {
      g.globalAlpha = gr.a;
      g.fillStyle = gr.col;
      const l = gr.list;
      for (let n = 0; n < l.length; n += 3) g.fillText(l[n + 2], l[n], l[n + 1]);
    }
    // искра между пальцами
    const p = 0.55 + 0.45 * Math.sin(t * 5.3) * Math.sin(t * 1.7);
    const R = st.ch * (2.2 + p * 1.6);
    const grd = g.createRadialGradient(st.spark[0], st.spark[1], 0, st.spark[0], st.spark[1], R);
    grd.addColorStop(0, pal.accent || "#f5a623");
    grd.addColorStop(1, "transparent");
    g.globalAlpha = Math.min(1, k * (0.55 + 0.6 * p));
    g.fillStyle = grd;
    g.fillRect(st.spark[0] - R, st.spark[1] - R, R * 2, R * 2);
    g.globalAlpha = Math.min(1, k * 1.6);
    g.fillStyle = pal.ink || "#eee";
    for (let n = 0; n < 3; n++) {
      const an = t * 3 + n * 2.1, rr = st.ch * (0.6 + p);
      g.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], st.spark[0] + Math.cos(an) * rr - st.cw / 2, st.spark[1] + Math.sin(an) * rr * 0.6 - st.ch / 2);
    }
    g.globalAlpha = 1;
  }
  st.raf = requestAnimationFrame(frame);
  const onVis = () => { cancelAnimationFrame(st.raf); if (!document.hidden) st.raf = requestAnimationFrame(frame); };
  document.addEventListener("visibilitychange", onVis);
  new ResizeObserver(() => { st.key = ""; }).observe(canvas);
  return {
    relayout() { st.key = ""; },
    stop() { cancelAnimationFrame(st.raf); document.removeEventListener("visibilitychange", onVis); g.clearRect(0, 0, canvas.width, canvas.height); },
  };
}
