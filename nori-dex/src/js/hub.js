/* ==========================================================================
   Join hub (owner: Sonnet).
   • Pure helpers first (countdown, formats), so they can be tested without a browser
     (scripts/test.mjs runs them under several time zones).
   • The altar's quick buttons (Kickstarter, Wishlist, Discord) and the countdown are drawn by js/app.js,
     which calls those helpers and PL.hub.linkHTML().
   • The "Join & follow" panel (the dock's first button) is drawn here: every button, the game's and the
     studio's social links, the platforms and the credits. Null URLs render as disabled "link pending"
     buttons; every outbound link opens with rel="noopener noreferrer".
   API: PL.hub.init(afterEl, { audio, toast, hints }), open(), close(silent), isOpen(), press(name), hints()
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

  /* ---------- links ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /* one link or one disabled "link pending" button. o: { cls, label, name (spoken name), sub, pendingText } */
  function linkHTML(url, o) {
    var cls = 'gi ' + (o.cls || 'hub-link'), name = o.name || o.label;
    return url
      ? '<a class="' + cls + '" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(_('{name} (opens in a new tab)', { name: name })) + '">' + esc(o.label) + '<i>↗</i></a>'
      : '<span class="' + cls + ' is-pending" role="link" tabindex="-1" aria-disabled="true" aria-label="' + esc(_('{name}: link pending', { name: name })) + '">' + esc(o.label) + '<i>' + _('link pending') + '</i></span>';
  }

  /* ---------- the "Join & follow" panel ---------- */
  var SOCIAL = [['instagram', 'Instagram'], ['x', 'X'], ['tiktok', 'TikTok'], ['youtube', 'YouTube']];
  var el = null, panel = null, isOpen = false, sel = null, host = null, api = null, closeTimer = 0;

  function chips(map, extra) {
    var out = (extra || []).concat(SOCIAL.filter(function (k) { return map && map[k[0]]; }).map(function (k) { return { url: map[k[0]], label: k[1], name: k[1] }; }));
    return out.map(function (c) { return linkHTML(c.url, { cls: 'hub-chip', label: c.label, name: c.name }); }).join('');
  }
  function html() {
    var sky = PL.sky || {}, L = sky.links || {}, c = sky.campaign || {}, d = daysLeft(c.endsOn);
    var days = d === null || d < 0 ? '' : d === 0 ? _('Last day') : _n(d, '{n} day left|{n} days left').replace('{n}', d);
    function group(title, body, cls) { return '<section class="hub-group"><h4>' + title + '</h4><div class="' + (cls || 'hub-chips') + '">' + body + '</div></section>'; }
    var credits = (sky.credits || []).map(function (x) { return '<div><dt>' + esc(x.role) + '</dt><dd>' + esc(x.name) + '</dd></div>'; }).join('');
    return '<div class="hub-head"><b>' + _('Join & follow') + '</b>' + (days ? '<span class="hub-days">' + esc(days) + '</span>' : '') +
        '<button class="hub-x" data-hub="close" aria-label="' + esc(_('Close')) + '">×</button></div>' +
      '<p class="hub-sub">' + esc(sky.meta ? sky.meta.game + ' · ' + sky.meta.studio : '') + '</p>' +
      group(_('Join'),
        linkHTML(L.kickstarter, { label: _('Kickstarter Campaign'), name: _('Kickstarter campaign') }) +
        linkHTML(L.steam, { label: _('Wishlist on Steam'), name: _('Wishlist on Steam') }) +
        linkHTML(L.steamPlaytest, { label: _('Join Steam Playtest'), name: _('Join the Steam playtest') }) +
        linkHTML(L.discord, { label: _('Discord'), name: _('Discord') }), 'hub-buttons') +
      group(_('Follow the game'), chips(L.game)) +
      group(_('Follow the studio'), chips(L.studio, L.studioSite ? [{ url: L.studioSite, label: _('Website'), name: _('Enthariel Games website') }] : [])) +
      '<dl class="hub-info">' +
        (sky.facts && sky.facts.platforms ? '<div><dt>' + _('Platforms') + '</dt><dd>' + esc(sky.facts.platforms.text) + '</dd></div>' : '') + credits +
      '</dl>';
  }
  function items() { return Array.prototype.slice.call(panel.querySelectorAll('.gi')); }
  /* row by row: left / right stay in the row, up / down go to the next row and land on the nearest item in it */
  function step(dir) {
    var list = items().map(function (n) { var r = n.getBoundingClientRect(); return { n: n, x: r.left + r.width / 2, y: r.top }; });
    list.sort(function (p, q) { return p.y - q.y || p.x - q.x; });
    var rows = [];
    list.forEach(function (it) { var r = rows[rows.length - 1]; if (r && Math.abs(it.y - r[0].y) < 12) r.push(it); else rows.push([it]); });
    var ri = -1, ci = -1;
    rows.forEach(function (r, i) { r.forEach(function (it, j) { if (it.n === sel) { ri = i; ci = j; } }); });
    if (ri < 0) return list[0] && list[0].n;
    if (dir === 'left' || dir === 'right') { var t = rows[ri][ci + (dir === 'right' ? 1 : -1)]; return t && t.n; }
    var row = rows[ri + (dir === 'down' ? 1 : -1)];
    if (!row) return null;
    var best = row[0], cx = rows[ri][ci].x;
    row.forEach(function (it) { if (Math.abs(it.x - cx) < Math.abs(best.x - cx)) best = it; });
    return best.n;
  }
  function select(node, quiet) {
    if (sel) sel.classList.remove('is-sel');
    sel = node;
    if (!node) return;
    node.classList.add('is-sel');
    if (!quiet && PL.sections && PL.sections.ensureVisible) PL.sections.ensureVisible(panel, node);
  }

  function init(after, a) {
    api = a || {};
    host = after;
    el = document.createElement('div');
    el.className = 'help hub';
    el.id = 'hub';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', _('Join & follow'));
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="help-panel hub-panel"></div>';
    panel = el.firstChild;
    after.parentNode.insertBefore(el, after.nextSibling);
    el.addEventListener('click', function (e) {
      if (e.target === el || e.target.closest('[data-hub="close"]')) return close();
      var p = e.target.closest('.is-pending');
      if (p) { select(p, true); if (api.audio) api.audio('error'); if (api.toast) api.toast(_('Link pending: the studio will add it soon')); return; }
      var a = e.target.closest('a.gi'); if (a) { select(a, true); if (api.audio) api.audio('select'); }
    });
    el.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse' || (!e.movementX && !e.movementY)) return;
      var g = e.target.closest('.gi'); if (g && g !== sel) select(g, true);
    });
  }
  function open() {
    if (!el || isOpen) return;
    clearTimeout(closeTimer);
    panel.innerHTML = html();
    panel.scrollTop = 0;
    isOpen = true;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();   // after a click the dock button keeps focus and would swallow Enter
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    select(items()[0], true);
    if (api.audio) api.audio('open');
    if (api.hints) api.hints();
  }
  function close(silent) {
    if (!isOpen) return;
    isOpen = false;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    if (!silent && api.audio) api.audio('back');
    if (api.hints) api.hints();
  }
  /* while the panel is open it swallows every key (the app calls this first) */
  function press(name) {
    if (!isOpen) return false;
    switch (name) {
      case 'b': case 'plus': case 'home': close(); return true;
      case 'up': case 'down': case 'left': case 'right': {
        var next = step(name);
        if (next) { select(next); if (api.audio) api.audio('tick'); return true; }
        /* past the first or last row: scroll to the very top or bottom, so the platforms and credits can be read */
        var atEnd = name === 'down' ? panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 2 : panel.scrollTop <= 2;
        if ((name === 'down' || name === 'up') && !atEnd) { panel.scrollTo({ top: name === 'down' ? panel.scrollHeight : 0, behavior: 'smooth' }); if (api.audio) api.audio('tick'); }
        else if (api.audio) api.audio('error');
        return true;
      }
      case 'a':
        if (sel) {
          if (sel.tagName === 'A') { if (api.audio) api.audio('select'); sel.click(); }
          else { if (api.audio) api.audio('error'); if (api.toast) api.toast(_('Link pending: the studio will add it soon')); }
        }
        return true;
    }
    return true;
  }
  function hints() { return isOpen ? [[['up', 'down'], _('Choose')], [['a'], _('Open')], [['b'], _('Close')]] : []; }

  return {
    daysLeft: daysLeft, fmtDate: fmtDate, fmtNum: fmtNum, linkHTML: linkHTML,
    init: init, open: open, close: close, press: press, hints: hints, isOpen: function () { return isOpen; },
  };
})();
