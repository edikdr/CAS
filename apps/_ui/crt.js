// CRT: строки развёртки точно по физическим пикселям — canvas поверх элемента. Период кратен 3:
// совпадает по шагу с экранным шейдером Hyprland (crt.frag) и не даёт муара при дробном масштабе.
// k — сила 0…1. light — едва светлая «люминофорная» полоса в чёрном (для непрозрачного фона;
// поверх прозрачного, например аватара, её выключают — остаётся только затемнение).

export function scanlines(canvas, k, { light = true } = {}) {
  if (!canvas) return;
  const r = canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  const key = `${w}x${h}@${(+k).toFixed(3)}${light ? "L" : ""}`;
  if (canvas._crtKey === key) return;
  canvas._crtKey = key;
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, w, h);
  if (k <= 0) return;
  const P = 3 * Math.max(1, Math.round(4 * dpr / 3));
  const A = 0.34 * k, L = light ? 0.022 * k : 0;
  for (let y = 0; y < h; y++) {
    const ph = Math.cos(2 * Math.PI * ((y % P) + 0.5) / P);
    const dark = A * Math.pow(0.5 + 0.5 * ph, 1.6), lite = L * Math.pow(0.5 - 0.5 * ph, 2);
    if (dark > 0.004) { g.fillStyle = `rgba(0,0,0,${dark.toFixed(3)})`; g.fillRect(0, y, w, 1); }
    else if (lite > 0.002) { g.fillStyle = `rgba(255,244,230,${lite.toFixed(4)})`; g.fillRect(0, y, w, 1); }
  }
}

// перерисовывать при изменении размера и масштаба экрана
export function watchScanlines(canvas, getK, opts) {
  const draw = () => scanlines(canvas, getK(), opts);
  const ro = new ResizeObserver(() => requestAnimationFrame(draw));
  ro.observe(canvas);
  const mq = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
  const onDpr = () => { canvas._crtKey = ""; draw(); };
  mq.addEventListener?.("change", onDpr);
  draw();
  return { redraw: () => { canvas._crtKey = ""; draw(); }, stop: () => { ro.disconnect(); mq.removeEventListener?.("change", onDpr); } };
}

// SVG-фильтр «расхождение лучей»: красный канал влево, синий вправо, лёгкая расфокусировка и
// свечение люминофора. Свечение смешивается «экраном»: ореол вокруг яркого есть, а сами цвета
// (кожа аватара, плашки) не выбеливаются. Возвращает разметку <filter>; силу задаёт tuneBeamFilter().
export function beamFilter(id) {
  return `<filter id="${id}" x="-2%" y="-2%" width="104%" height="104%" color-interpolation-filters="sRGB">
    <feOffset data-r="oL" in="SourceGraphic" dx="-1" dy="0" result="L"/>
    <feOffset data-r="oR" in="SourceGraphic" dx="1" dy="0" result="R"/>
    <feColorMatrix in="L" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="rc"/>
    <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="gc"/>
    <feColorMatrix in="R" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="bc"/>
    <feComposite in="rc" in2="gc" operator="arithmetic" k2="1" k3="1" result="rg"/>
    <feComposite in="rg" in2="bc" operator="arithmetic" k2="1" k3="1" result="rgb"/>
    <feGaussianBlur data-r="soft" in="rgb" stdDeviation="0.4" result="soft"/>
    <feGaussianBlur data-r="glow" in="rgb" stdDeviation="3" result="glow"/>
    <feComponentTransfer in="glow" result="glowk">
      <feFuncR data-r="g" type="linear" slope=".2"/><feFuncG data-r="g" type="linear" slope=".2"/><feFuncB data-r="g" type="linear" slope=".2"/>
    </feComponentTransfer>
    <feBlend in="soft" in2="glowk" mode="screen"/>
  </filter>`;
}

// svg-контейнер с фильтром для HTML-страницы (фильтр подключается через CSS filter: url(#id))
export function mountBeamFilter(id) {
  if (document.getElementById(id)) return document.getElementById(id);
  const box = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  box.setAttribute("width", "0"); box.setAttribute("height", "0"); box.setAttribute("aria-hidden", "true");
  box.style.position = "absolute";
  box.innerHTML = beamFilter(id);
  document.body.append(box);
  return document.getElementById(id);
}

// unit — сколько единиц фильтра в одном CSS-пикселе (для SVG со своим viewBox); glow — множитель свечения
export function tuneBeamFilter(filter, k, unit = 1, { glow = 1 } = {}) {
  if (!filter) return;
  const q = (r) => filter.querySelectorAll(`[data-r="${r}"]`);
  const off = (0.3 + 0.75 * k) * unit;
  q("oL")[0].setAttribute("dx", (-off).toFixed(3));
  q("oR")[0].setAttribute("dx", off.toFixed(3));
  q("soft")[0].setAttribute("stdDeviation", ((0.15 + 0.45 * k) * unit).toFixed(3));
  q("glow")[0].setAttribute("stdDeviation", ((2 + 2 * k) * unit).toFixed(3));
  for (const f of q("g")) f.setAttribute("slope", ((0.12 + 0.4 * k) * glow).toFixed(3));
}
