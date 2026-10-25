/* ==========================================================================
   Join hub helpers (owner: Sonnet). Pure functions first, so they can be tested
   without a browser (scripts/test.mjs runs them under several time zones).
   The hub's markup is drawn by js/app.js (the altar's campaign panel); it calls these.
   ========================================================================== */
window.PL = window.PL || {};

PL.hub = (function () {
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* Whole calendar days from the viewer's today to the campaign's last day ('YYYY-MM-DD').
     18 on 25 Oct for a 12 Nov end; 0 on the last day itself; negative afterwards; null for a bad date.
     It compares calendar dates, not elapsed time: on a daylight-saving day (25 Oct 2026 in Europe has
     25 hours) subtracting milliseconds shows one day too many. `now` is for tests. */
  function daysLeft(endsOn, now) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endsOn || '');
    if (!m) return null;
    now = now || new Date();
    var today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - today) / 864e5);
  }

  /* '2026-11-12' -> '12 Nov 2026'. By hand: the first Intl call costs ~80 ms on a slow phone. */
  function fmtDate(iso) {
    var p = String(iso || '').split('-');
    return p.length === 3 ? +p[2] + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0] : '';
  }
  function fmtNum(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  return { daysLeft: daysLeft, fmtDate: fmtDate, fmtNum: fmtNum };
})();
