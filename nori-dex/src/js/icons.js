/* Line SVG icons (24x24, colour = currentColor) */
window.PL = window.PL || {};

PL.icons = {
  map: '<path d="M9 4 3 6.2v13.6L9 18l6 2 6-2.2V4.2L15 6 9 4z"/><path d="M9 4v14M15 6v14"/>',
  dex: '<rect x="4" y="2.5" width="16" height="19" rx="3"/><circle cx="9" cy="7.6" r="2.3"/><path d="M14 6.6h3M14 9h2"/><rect x="7" y="12.5" width="10" height="5.5" rx="1.2"/>',
  star: '<path d="M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.6l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>',
  gamepad: '<path d="M7.5 7h9a4.5 4.5 0 0 1 4.5 4.5v3a3 3 0 0 1-5.4 1.8L14.2 14H9.8l-1.4 2.3A3 3 0 0 1 3 14.5v-3A4.5 4.5 0 0 1 7.5 7z"/><path d="M8 9.8v3.4M6.3 11.5h3.4"/><path d="M15.5 10.5h.01M17.5 12.5h.01"/>',
  tv: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="m8 3 4 4 4-4"/><path d="M7 11h.01M7 14h.01"/>',
  sound: '<path d="M4 9.5v5h3.5L13 19V5L7.5 9.5z"/><path d="M16.5 8.8a4.6 4.6 0 0 1 0 6.4M19 6.3a8.2 8.2 0 0 1 0 11.4"/>',
  mute: '<path d="M4 9.5v5h3.5L13 19V5L7.5 9.5z"/><path d="m16.5 9.5 5 5M21.5 9.5l-5 5"/>',
  power: '<path d="M12 3v8"/><path d="M6.4 6.6a8 8 0 1 0 11.2 0"/>',
  home: '<path d="M4 11 12 4l8 7"/><path d="M6.5 9.5V20h11V9.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  prev: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  next: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  link: '<path d="M10 5H5.5A1.5 1.5 0 0 0 4 6.5v12A1.5 1.5 0 0 0 5.5 20h12a1.5 1.5 0 0 0 1.5-1.5V14"/><path d="M14 4h6v6M20 4l-9 9"/>',
  camera: '<path d="M4 8.5A2 2 0 0 1 6 6.5h2l1.3-2h5.4l1.3 2h2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.8"/>',
  spark: '<path d="M12 3c.8 5 4 8.2 9 9-5 .8-8.2 4-9 9-.8-5-4-8.2-9-9 5-.8 8.2-4 9-9z"/>',
  leaf: '<path d="M5 19C5 10.5 10 5 19 5c0 9-5 14-14 14z"/><path d="M5 19 13 11"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0"/><path d="M5.5 12.3a9.5 9.5 0 0 1 13 0"/><path d="M8.6 15.5a5 5 0 0 1 6.8 0"/><path d="M12 19h.01"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4.5c4-2 7 2 11 0l2-.8v9.3l-2 .8c-4 2-7-2-11 0"/>',
  swap: '<path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/>',
  crystal: '<path d="M12 2.5 18 9l-6 12.5L6 9z"/><path d="M6 9h12M12 2.5 9.5 9 12 21.5 14.5 9z"/>',
};

PL.icon = function (name) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (PL.icons[name] || '') + '</svg>';
};

/* fill every [data-icon] element in the markup */
PL.mountIcons = function (root) {
  (root || document).querySelectorAll('[data-icon]').forEach(function (el) {
    if (!el.firstElementChild) el.innerHTML = PL.icon(el.dataset.icon);
  });
};
