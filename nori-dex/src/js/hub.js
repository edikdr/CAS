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

  /* ---------- studio-style icons ----------
     Drawn for this site, in the look of the game's logo: chunky shapes with a deep navy outline, a cyan
     (or gold) gradient fill, a white highlight and a hard little shadow. They are pictograms of what the
     link does (a flag for the campaign, a heart for the wishlist, a camera, a note, a play button), not
     copies of any company's mark. */
  var ICONS = {
    flag: '<rect class="c" x="6" y="4.5" width="3.6" height="24" rx="1.8"/><path class="g" d="M9.6 7c4-2 7 2 11 0 2.4-1.2 4.4-.8 5.6-.2v11c-1.2-.6-3.2-1-5.6.2-4 2-7-2-11 0z"/><path class="w" d="M12.4 10c2.4-.8 4.2.5 6.8.2"/><ellipse class="g" cx="7.8" cy="3.8" rx="3.2" ry="1.5"/>',
    heart: '<path class="g" d="M16 27.4C6 20.4 4 14.8 4 11.4 4 7.7 6.9 5 10.3 5c2.4 0 4.4 1.3 5.7 3.5C17.3 6.3 19.3 5 21.7 5 25.1 5 28 7.7 28 11.4c0 3.4-2 9-12 16z"/><path class="w" d="M9 10.5c.6-1.3 1.8-1.9 3-1.7"/>',
    pad: '<path class="c" d="M9.5 9.5h13a6.5 6.5 0 0 1 6.5 6.5v3a4.2 4.2 0 0 1-7.3 2.8L20 19.5h-8l-1.7 2.3A4.2 4.2 0 0 1 3 19v-3a6.5 6.5 0 0 1 6.5-6.5z"/><path class="o2" d="M10.5 13.5v5M8 16h5"/><circle class="g" cx="21.5" cy="14.8" r="1.9"/><circle class="g" cx="24.7" cy="18.2" r="1.9"/><path class="w" d="M8 11.8c1-.8 2.3-1 3.6-1"/>',
    chat: '<path class="c" d="M6.5 5.5h19a3.5 3.5 0 0 1 3.5 3.5v11a3.5 3.5 0 0 1-3.5 3.5H17.5l-6 4.5v-4.5h-5A3.5 3.5 0 0 1 3 20V9a3.5 3.5 0 0 1 3.5-3.5z"/><ellipse class="n" cx="11.8" cy="14.4" rx="2" ry="2.9"/><ellipse class="n" cx="20.2" cy="14.4" rx="2" ry="2.9"/><path class="w" d="M7 9c1.2-.8 2.6-1 4-.8"/>',
    camera: '<rect class="c" x="4" y="5.5" width="24" height="21.5" rx="7"/><circle class="n" cx="16" cy="16.5" r="6.5"/><circle class="g" cx="16" cy="16.5" r="3.5"/><circle class="g" cx="23.3" cy="10.3" r="1.9"/><path class="w" d="M8 10c1-1.2 2.4-1.6 3.8-1.6"/>',
    cross: '<path class="o" d="M7 7l18 18M25 7L7 25" stroke-width="8.8"/><path class="oc" d="M7 7l18 18M25 7L7 25" stroke-width="4.6"/><path class="w" d="M9 8.8l5 5"/>',
    note: '<ellipse class="c" cx="11" cy="23.5" rx="5.6" ry="4.5"/><rect class="c" x="15" y="4.5" width="4.4" height="19" rx="2.2"/><path class="g" d="M19.4 5c0 5 3 7.6 8 7.6v4.3c-3.2 0-5.6-1-8-2.7z"/><path class="w" d="M8.5 22c.8-1 2-1.3 3-1"/>',
    play: '<rect class="c" x="3" y="6.5" width="26" height="19" rx="6.5"/><path class="g" d="M13 11.2v9.6l8.4-4.8z"/><path class="w" d="M7 10.5c1.2-.8 2.6-1 4-.8"/>',
    globe: '<circle class="c" cx="16" cy="17" r="11.5"/><ellipse class="o2" cx="16" cy="17" rx="5" ry="11.5"/><path class="o2" d="M5 13.5h22M5 20.5h22"/><ellipse class="g" cx="16" cy="3.6" rx="5" ry="1.9"/><path class="w" d="M9 11c1-1.6 2.6-2.5 4.4-2.8"/>',
  };
  /* gradients the icons point at (one hidden SVG for the whole page) */
  var ICON_DEFS = '<svg class="si-defs" width="0" height="0" aria-hidden="true" style="position:absolute"><defs>' +
    '<linearGradient id="si-cyan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1feff"/><stop offset=".5" stop-color="#7FD6DF"/><stop offset="1" stop-color="#2b86a5"/></linearGradient>' +
    '<linearGradient id="si-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4c8"/><stop offset=".5" stop-color="#E8B93A"/><stop offset="1" stop-color="#b3791a"/></linearGradient></defs></svg>';
  function icon(name) {
    return ICONS[name] ? '<svg class="si si-' + name + '" viewBox="0 0 32 32" aria-hidden="true" focusable="false">' + ICONS[name] + '</svg>' : '';
  }

  /* ---------- the lobby's sky ----------
     Hand-drawn clouds drifting, little gold halos (the game's motif) rising, and light shafts, all behind the
     altar. Only transform and opacity animate; css/lobby.css stops them for reduced motion and low-power mode. */
  var CLOUD = '<svg viewBox="0 0 120 60" aria-hidden="true"><path d="M14 52C3 52 1 37 12 34c0-12 17-17 26-8 5-11 25-11 29 2 13-3 22 9 14 19-2 3-5 5-9 5z"/></svg>';
  function decorate(view) {
    var bg = view && view.querySelector('.home-bg');
    if (!bg || bg.querySelector('.home-sky')) return;
    var clouds = '', halos = '', i;
    var C = [[9, 170, 58, -6], [34, 110, 80, -34], [56, 140, 66, -20], [18, 96, 96, -52]];   // top %, width px, seconds to cross, delay
    C.forEach(function (c, k) { clouds += '<i class="home-cloud" style="top:' + c[0] + '%;width:' + c[1] + 'px;--t:' + c[2] + 's;--d:' + c[3] + 's;--o:' + (k % 2 ? .18 : .26) + '">' + CLOUD + '</i>'; });
    for (i = 0; i < 6; i++) halos += '<i style="--x:' + (8 + i * 16 + (i % 2) * 5) + '%;--t:' + (11 + (i * 3) % 7) + 's;--d:' + (-i * 2.3).toFixed(1) + 's"></i>';
    var sky = document.createElement('div');
    sky.className = 'home-sky';
    sky.setAttribute('aria-hidden', 'true');
    sky.innerHTML = '<div class="home-rays"></div>' + clouds + '<div class="home-halos">' + halos + '</div>';
    bg.appendChild(sky);
  }

  /* ---------- links ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /* one link or one disabled "link pending" button. o: { cls, label, name (spoken name), icon } */
  function linkHTML(url, o) {
    var cls = 'gi ' + (o.cls || 'hub-link'), name = o.name || o.label;
    var inner = '<span class="lk">' + icon(o.icon) + '<span class="lt">' + esc(o.label) + '</span></span>';
    return url
      ? '<a class="' + cls + '" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(_('{name} (opens in a new tab)', { name: name })) + '">' + inner + '<i>↗</i></a>'
      : '<span class="' + cls + ' is-pending" role="link" tabindex="-1" aria-disabled="true" aria-label="' + esc(_('{name}: link pending', { name: name })) + '">' + inner + '<i>' + _('link pending') + '</i></span>';
  }

  /* ---------- the "Join & follow" panel ---------- */
  var SOCIAL = [['instagram', 'Instagram', 'camera'], ['x', 'X', 'cross'], ['tiktok', 'TikTok', 'note'], ['youtube', 'YouTube', 'play']];
  var el = null, panel = null, isOpen = false, sel = null, host = null, api = null, closeTimer = 0;

  function chips(map, extra) {
    var out = (extra || []).concat(SOCIAL.filter(function (k) { return map && map[k[0]]; }).map(function (k) { return { url: map[k[0]], label: k[1], name: k[1], icon: k[2] }; }));
    return out.map(function (c) { return linkHTML(c.url, { cls: 'hub-chip', label: c.label, name: c.name, icon: c.icon }); }).join('');
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
        linkHTML(L.kickstarter, { label: _('Kickstarter Campaign'), name: _('Kickstarter campaign'), icon: 'flag' }) +
        linkHTML(L.steam, { label: _('Wishlist on Steam'), name: _('Wishlist on Steam'), icon: 'heart' }) +
        linkHTML(L.steamPlaytest, { label: _('Join Steam Playtest'), name: _('Join the Steam playtest'), icon: 'pad' }) +
        linkHTML(L.discord, { label: _('Discord'), name: _('Discord'), icon: 'chat' }), 'hub-buttons') +
      group(_('Follow the game'), chips(L.game)) +
      group(_('Follow the studio'), chips(L.studio, L.studioSite ? [{ url: L.studioSite, label: _('Website'), name: _('Enthariel Games website'), icon: 'globe' }] : [])) +
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
    if (!document.querySelector('.si-defs')) document.body.insertAdjacentHTML('beforeend', ICON_DEFS);
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
    icon: icon, decorate: decorate, init: init, open: open, close: close, press: press, hints: hints, isOpen: function () { return isOpen; },
  };
})();
