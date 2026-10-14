/* receipt-deps.js - the three globals receipt.js expects. Copied verbatim from the AM archive:
   esc() from js/main.js, secsOf() and albumRuntime() from js/data.js. No AM-specific content. */
function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function secsOf(mmss) {
  const m = /^(\d+):(\d+)$/.exec(String(mmss).trim());
  return m ? (+m[1]) * 60 + (+m[2]) : 0;
}

function albumRuntime(album) {
  const total = album.tracks.reduce((s, t) => s + secsOf(t.duration), 0);
  const m = Math.floor(total / 60), s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
