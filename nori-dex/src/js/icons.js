/* Линейные SVG-иконки (24×24, цвет = currentColor) */
window.PL = window.PL || {};

PL.icons = {
  map: '<path d="M9 4 3 6.2v13.6L9 18l6 2 6-2.2V4.2L15 6 9 4z"/><path d="M9 4v14M15 6v14"/>',
  dex: '<rect x="4" y="2.5" width="16" height="19" rx="3"/><circle cx="9" cy="7.6" r="2.3"/><path d="M14 6.6h3M14 9h2"/><rect x="7" y="12.5" width="10" height="5.5" rx="1.2"/>',
  star: '<path d="M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.6l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>',
  flame: '<path d="M12 3c.8 3.6 5.5 5.6 5.5 10.2A5.5 5.5 0 0 1 6.5 13c0-2.3 1.1-3.9 2.5-5 .1 1.8 1 2.9 2.2 3.2C10.8 8.6 11.3 5.6 12 3z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2.2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c.6-4 3.8-6.3 7.5-6.3s6.9 2.3 7.5 6.3"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  news: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h5M7 12h10M7 15h7"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  album: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 15.5-5-5-9.5 9.5"/>',
  gamepad: '<path d="M7.5 7h9a4.5 4.5 0 0 1 4.5 4.5v3a3 3 0 0 1-5.4 1.8L14.2 14H9.8l-1.4 2.3A3 3 0 0 1 3 14.5v-3A4.5 4.5 0 0 1 7.5 7z"/><path d="M8 9.8v3.4M6.3 11.5h3.4"/><path d="M15.5 10.5h.01M17.5 12.5h.01"/>',
  tv: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="m8 3 4 4 4-4"/><path d="M7 11h.01M7 14h.01"/>',
  sound: '<path d="M4 9.5v5h3.5L13 19V5L7.5 9.5z"/><path d="M16.5 8.8a4.6 4.6 0 0 1 0 6.4M19 6.3a8.2 8.2 0 0 1 0 11.4"/>',
  mute: '<path d="M4 9.5v5h3.5L13 19V5L7.5 9.5z"/><path d="m16.5 9.5 5 5M21.5 9.5l-5 5"/>',
  power: '<path d="M12 3v8"/><path d="M6.4 6.6a8 8 0 1 0 11.2 0"/>',
  home: '<path d="M4 11 12 4l8 7"/><path d="M6.5 9.5V20h11V9.5"/>',
  pokeball: '<circle cx="12" cy="12" r="10.2"/><path d="M1.8 12h7M15.2 12h7"/><circle cx="12" cy="12" r="3.2"/>',
  leaf: '<path d="M5 19C5 10.5 10 5 19 5c0 9-5 14-14 14z"/><path d="M5 19 13 11"/>',
  drop: '<path d="M12 3.5C9 8 6 11 6 14.5a6 6 0 0 0 12 0C18 11 15 8 12 3.5z"/>',
  bolt: '<path d="M13 2.5 5.5 13.5H11l-1 8 7.5-11H12z"/>',
  burst: '<path d="M12 2.8l2 5.2 5.3-1.2-3.2 4.4 4.1 3.3-5.2.8.5 5.4L12 17.5l-3.5 2.9.5-5.4-5.2-.8 4.1-3.3L4.7 6.8 10 8z"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
  hex: '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/><circle cx="12" cy="12" r="3"/>',
  spark: '<path d="M12 3c.8 5 4 8.2 9 9-5 .8-8.2 4-9 9-.8-5-4-8.2-9-9 5-.8 8.2-4 9-9z"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  edit: '<path d="M4 20h4L19 9.2a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  link: '<path d="M10 5H5.5A1.5 1.5 0 0 0 4 6.5v12A1.5 1.5 0 0 0 5.5 20h12a1.5 1.5 0 0 0 1.5-1.5V14"/><path d="M14 4h6v6M20 4l-9 9"/>',
  prev: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  next: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.5 4.5 12 6.2l2.5-1.7M9.5 19.5 12 17.8l2.5 1.7"/>',
  bubbles: '<circle cx="9" cy="14.5" r="5"/><circle cx="16.5" cy="7.5" r="3"/><circle cx="18" cy="16.5" r="2"/>',
  ground: '<path d="M3 19.5h18"/><path d="M4.5 19.5 10 9.5l3.2 5.4 2.3-3.4 4 8"/>',
  wing: '<path d="M3.5 14c5-7.5 12-10 17.5-10-.8 6.5-5 12.5-12 14.5l-1-3-3 .8z"/><path d="M8.5 15.5 14.5 9"/>',
  bug: '<ellipse cx="12" cy="14" rx="5" ry="6"/><path d="M12 8.5V20M9.5 6.5 7.5 3.5M14.5 6.5l2-3M7 12H3.5M20.5 12H17M7.2 16.5l-3 2M16.8 16.5l3 2"/>',
  rock: '<path d="M3.5 18.5 7 9l5-4 6 4 2.5 9.5z"/><path d="M7 9l5 3 6-3M12 12v6.5"/>',
  ghost: '<path d="M6 20.5V11a6 6 0 0 1 12 0v9.5l-2-1.6-2 1.6-2-1.6-2 1.6-2-1.6z"/><path d="M10 11h.01M14 11h.01"/>',
  circle: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/>',
  dragon: '<path d="M3.5 18c3.5-1 5.5-4 5.5-8.5 2 2.2 4.2 2.2 6 0-.8 3.6.6 6.5 5.5 8.5-6 1.4-11 1.4-17 0z"/><path d="M9 9.5 7 4.5l4 3M15 9.5l2-5-4 3"/>',
  layers: '<path d="M12 3.5 3 8.5l9 5 9-5z"/><path d="m3 13 9 5 9-5"/>',
  camera: '<path d="M4 8.5A2 2 0 0 1 6 6.5h2l1.3-2h5.4l1.3 2h2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.8"/>',
  upload: '<path d="M12 16V4.5M7.5 9 12 4.5 16.5 9"/><path d="M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  scan: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M7.5 12h9"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0"/><path d="M5.5 12.3a9.5 9.5 0 0 1 13 0"/><path d="M8.6 15.5a5 5 0 0 1 6.8 0"/><path d="M12 19h.01"/>',
};

PL.icon = function (name) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (PL.icons[name] || '') + '</svg>';
};

/* подставить иконки во все [data-icon] из разметки */
PL.mountIcons = function (root) {
  (root || document).querySelectorAll('[data-icon]').forEach(function (el) {
    if (!el.firstElementChild) el.innerHTML = PL.icon(el.dataset.icon);
  });
};
