/*
 * core/boot.js - classic script, runs in <head> before first paint (no module, no imports).
 *
 * Copies saved settings onto <html> so CSS styles the very first frame without a flash:
 *   data-theme="prologue|link3|plain"  (absent = base tokens)
 *   data-motion="off"                   prefers-reduced-motion OR the visitor's "motion off"
 *   data-lights="off"                   the visitor switched the string lights off
 * Keys and the "sunniva:" prefix mirror core/storage.js; keep them in sync.
 */
(function () {
  var html = document.documentElement;
  function read(key) {
    try { return JSON.parse(localStorage.getItem('sunniva:' + key)); } catch (e) { return null; }
  }
  var theme = read('theme');
  if (theme === 'prologue' || theme === 'link3' || theme === 'plain') html.setAttribute('data-theme', theme);
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || read('motion') === 'off') html.setAttribute('data-motion', 'off');
  if (read('lights') === false) html.setAttribute('data-lights', 'off');
})();
