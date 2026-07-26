/* ============================================================
   Synced-lyrics player + public-API console
   ------------------------------------------------------------
   The player runs on a virtual clock: there is no audio stream
   in a static page, so it advances time itself and highlights
   the line whose timecode has passed. Feed it real LRC data
   from LRCLIB and it behaves exactly like a karaoke view.
   ============================================================ */

const ARTIST = 'Cigarettes After Sex';

const Lyrics = {
  set: null,          // active lyric set
  lines: [],          // [{t, text}]
  source: 'bundled',  // 'bundled' | 'lrclib'
  t: 0,               // virtual playhead, seconds
  duration: 240,
  timer: null,
  playing: false,

  init() {
    this.buildChips();
    this.buildApiCards();
    this.buildConsole();
    this.bindTabs();
    this.bindTransport();
    this.select(LYRICS[0].track);
  },

  /* ---------------- tabs ---------------- */
  bindTabs() {
    $$('#lyrics .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.pane;
        $$('#lyrics .tab').forEach(t => t.classList.toggle('active', t === tab));
        $$('#lyrics [data-pane-body]').forEach(p => {
          p.hidden = p.dataset.paneBody !== target;
        });
      });
    });
  },

  /* ---------------- track chooser ---------------- */
  buildChips() {
    const host = $('#trackChips');
    if (!host) return;
    host.innerHTML = '';
    LYRICS.forEach((l, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'track-chip';
      b.textContent = l.track;
      b.dataset.track = l.track;
      b.style.setProperty('--r', ((i % 3) - 1) * 0.8 + 'deg');
      b.addEventListener('click', () => this.select(l.track));
      host.appendChild(b);
    });
  },

  select(trackName, opts = {}) {
    const found = LYRICS.find(l => l.track.toLowerCase() === String(trackName).toLowerCase());
    if (!found) return;
    this.pause();
    this.set = found;
    this.lines = found.lines.slice();
    this.source = 'bundled';
    this.duration = found.duration || 240;
    this.t = 0;

    $$('#trackChips .track-chip').forEach(c =>
      c.classList.toggle('active', c.dataset.track === found.track));

    $('#nowTrack').textContent = found.track;
    $('#nowFrom').textContent = `${found.album} · ${found.year}`;
    $('#lrcSource').textContent = 'bundled excerpt';
    this.renderLines();
    this.paint();

    if (opts.scroll) {
      document.getElementById('lyrics').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  },

  /* ---------------- rendering ---------------- */
  renderLines() {
    const host = $('#lrcBody');
    host.innerHTML = '';
    if (!this.lines.length) {
      host.innerHTML = '<p class="no-results">No timed lines for this track.</p>';
      return;
    }
    this.lines.forEach((ln, i) => {
      const row = document.createElement('div');
      row.className = 'lrc-line';
      row.dataset.i = i;
      row.innerHTML = `<span class="tc">${fmtLrc(ln.t)}</span><span class="tx">${esc(ln.text)}</span>`;
      row.addEventListener('click', () => { this.t = ln.t; this.paint(); });
      host.appendChild(row);
    });
  },

  activeIndex() {
    let idx = -1;
    for (let i = 0; i < this.lines.length; i++) {
      if (this.lines[i].t <= this.t + 0.02) idx = i; else break;
    }
    return idx;
  },

  paint() {
    const idx = this.activeIndex();
    $$('#lrcBody .lrc-line').forEach((row, i) => {
      row.classList.toggle('active', i === idx);
      row.classList.toggle('past', i < idx);
    });
    const pct = Math.max(0, Math.min(100, (this.t / this.duration) * 100));
    $('#seekFill').style.width = pct + '%';
    $('#seekHead').style.left = pct + '%';
    $('#tNow').textContent = fmtClock(this.t);
    $('#tEnd').textContent = fmtClock(this.duration);

    const row = $(`#lrcBody .lrc-line[data-i="${idx}"]`);
    if (row && this.playing) {
      const box = $('#lrcBody');
      const top = row.offsetTop - box.clientHeight / 2 + row.clientHeight / 2;
      box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  },

  /* ---------------- transport ---------------- */
  bindTransport() {
    $('#btnPlay').addEventListener('click', () => this.toggle());
    $('#btnBack').addEventListener('click', () => { this.t = Math.max(0, this.t - 10); this.paint(); });
    $('#btnFwd').addEventListener('click', () => { this.t = Math.min(this.duration, this.t + 10); this.paint(); });
    $('#btnPrevLine').addEventListener('click', () => this.jumpLine(-1));
    $('#btnNextLine').addEventListener('click', () => this.jumpLine(1));

    const seek = $('#seek');
    const seekTo = (clientX) => {
      const r = seek.getBoundingClientRect();
      this.t = Math.max(0, Math.min(this.duration, ((clientX - r.left) / r.width) * this.duration));
      this.paint();
    };
    seek.addEventListener('click', e => seekTo(e.clientX));
    seek.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') { this.t = Math.min(this.duration, this.t + 5); this.paint(); }
      if (e.key === 'ArrowLeft') { this.t = Math.max(0, this.t - 5); this.paint(); }
    });

    $('#btnCopyLrc').addEventListener('click', () => this.copyLrc());
    $('#btnDownloadLrc').addEventListener('click', () => this.downloadLrc());
    $('#btnFetchLrc').addEventListener('click', () => this.fetchFromLrclib());
  },

  jumpLine(dir) {
    const idx = this.activeIndex();
    const next = Math.max(0, Math.min(this.lines.length - 1, idx + dir));
    if (this.lines[next]) { this.t = this.lines[next].t; this.paint(); }
  },

  toggle() { this.playing ? this.pause() : this.play(); },

  play() {
    if (!this.lines.length) return;
    this.playing = true;
    $('#btnPlay').innerHTML = '&#10073;&#10073;';
    $('#btnPlay').setAttribute('aria-label', 'Pause');
    let last = performance.now();
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      const now = performance.now();
      this.t += (now - last) / 1000;
      last = now;
      if (this.t >= this.duration) { this.t = this.duration; this.pause(); }
      this.paint();
    }, 100);
  },

  pause() {
    this.playing = false;
    clearInterval(this.timer);
    const btn = $('#btnPlay');
    if (btn) { btn.innerHTML = '&#9654;'; btn.setAttribute('aria-label', 'Play'); }
  },

  /* ---------------- LRC in / out ---------------- */
  toLrc() {
    const head = [
      `[ar:${ARTIST}]`,
      `[ti:${this.set.track}]`,
      `[al:${this.set.album}]`,
      `[length:${fmtClock(this.duration)}]`,
      `[re:CAS Fan Sanctuary — ${this.source === 'lrclib' ? 'fetched from LRCLIB' : 'bundled excerpt'}]`
    ];
    return head.concat(this.lines.map(l => `[${fmtLrc(l.t)}]${l.text}`)).join('\n');
  },

  async copyLrc() {
    const text = this.toLrc();
    try {
      await navigator.clipboard.writeText(text);
      this.flash('#btnCopyLrc', 'Copied');
    } catch {
      // clipboard needs a secure context; fall back to a selectable prompt
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); this.flash('#btnCopyLrc', 'Copied'); }
      catch { this.flash('#btnCopyLrc', 'Copy failed'); }
      ta.remove();
    }
  },

  downloadLrc() {
    const name = `${ARTIST} - ${this.set.track}.lrc`.replace(/[/\\?%*:|"<>]/g, '-');
    downloadText(name, this.toLrc());
    this.flash('#btnDownloadLrc', 'Saved');
  },

  flash(sel, msg) {
    const b = $(sel);
    if (!b) return;
    const old = b.textContent;
    b.textContent = msg;
    setTimeout(() => { b.textContent = old; }, 1400);
  },

  /* Parse LRC text into [{t, text}] */
  parseLrc(lrc) {
    const out = [];
    const re = /\[(\d{1,2}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
    lrc.split(/\r?\n/).forEach(raw => {
      const stamps = [...raw.matchAll(re)];
      if (!stamps.length) return;
      const text = raw.replace(re, '').trim();
      stamps.forEach(m => {
        const t = parseInt(m[1], 10) * 60 + parseFloat(String(m[2]).replace(':', '.'));
        out.push({ t, text: text || '♪' });
      });
    });
    return out.sort((a, b) => a.t - b.t);
  },

  async fetchFromLrclib() {
    const btn = $('#btnFetchLrc');
    btn.disabled = true;
    const oldLabel = btn.textContent;
    btn.textContent = 'Fetching…';
    const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(ARTIST)}`
      + `&track_name=${encodeURIComponent(this.set.track)}`
      + `&album_name=${encodeURIComponent(this.set.album)}`
      + `&duration=${Math.round(this.duration)}`;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`LRCLIB responded ${res.status}`);
      const data = await res.json();
      if (!data.syncedLyrics) throw new Error('That record has no synced lyrics — only plain text.');
      const parsed = this.parseLrc(data.syncedLyrics);
      if (!parsed.length) throw new Error('Could not parse the returned LRC.');
      this.lines = parsed;
      this.source = 'lrclib';
      if (data.duration) this.duration = data.duration;
      this.t = 0;
      $('#lrcSource').textContent = `LRCLIB #${data.id} · ${parsed.length} lines`;
      this.renderLines();
      this.paint();
      this.note(`Loaded ${parsed.length} synced lines from LRCLIB.`, 'ok');
    } catch (err) {
      this.note(explainFetchError(err), 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = oldLabel;
    }
  },

  note(msg, kind) {
    const el = $('#lrcNote');
    if (!el) return;
    el.innerHTML = `<span class="dot-i ${kind === 'ok' ? 'ok' : 'err'}"></span> ${esc(msg)}`;
  },

  /* ---------------- API reference cards ---------------- */
  buildApiCards() {
    const host = $('#apiGrid');
    if (!host) return;
    host.innerHTML = '';
    API_CATALOGUE.forEach((api, i) => {
      const card = document.createElement('div');
      card.className = 'api-card paper reveal';
      card.innerHTML = `
        <span class="tape ${i % 2 ? 'tr' : 'tl'}" aria-hidden="true"></span>
        <h4>${esc(api.name)}</h4>
        <span class="tag">${esc(api.tag)}</span>
        <p class="desc">${api.desc}</p>
        <div><code>${esc(api.base)}</code></div>
        <div style="margin-top:.9rem">
          ${api.endpoints.map(e => `
            <div class="ep">
              <span class="verb">${esc(e.m)}</span>
              <span>
                <span class="path">${esc(e.p)}</span>
                <span class="doc">${e.d}</span>
              </span>
            </div>`).join('')}
        </div>
        <pre class="sample">${esc(api.sample)}</pre>`;
      host.appendChild(card);
    });
    observeReveals(host);
  },

  /* ---------------- live console ---------------- */
  buildConsole() {
    const sel = $('#apiSelect');
    if (!sel) return;
    const live = API_CATALOGUE.filter(a => a.live);
    sel.innerHTML = '';
    live.forEach(api => {
      api.endpoints.forEach((e, i) => {
        if (e.m !== 'GET') return;
        const o = document.createElement('option');
        o.value = `${api.id}|${i}`;
        o.textContent = `${api.name} — ${e.p.split('?')[0]}`;
        sel.appendChild(o);
      });
    });

    const update = () => $('#urlPreview').textContent = this.consoleUrl();
    sel.addEventListener('change', update);
    $('#qArtist').addEventListener('input', update);
    $('#qTrack').addEventListener('input', update);
    update();

    $('#btnRun').addEventListener('click', () => this.runConsole());
    $('#btnDataset').addEventListener('click', () => {
      downloadText('cas-dataset.json', JSON.stringify(buildDataset(), null, 2));
    });
  },

  consoleUrl() {
    const [id, i] = $('#apiSelect').value.split('|');
    const api = API_CATALOGUE.find(a => a.id === id);
    if (!api) return '';
    const ep = api.endpoints[Number(i)];
    const artist = $('#qArtist').value || ARTIST;
    const track = $('#qTrack').value || 'Apocalypse';
    let path = ep.p
      .replace('{artist}', encodeURIComponent(artist))
      .replace('{track}', encodeURIComponent(track))
      .replace('{query}', encodeURIComponent(`${artist} ${track}`.trim()))
      .replace('{name}', encodeURIComponent(artist))
      .replace('{mbid}', 'MBID')
      .replace('{id}', '1')
      .replace('{collectionId}', '1')
      .replace('{spotifyUrl}', encodeURIComponent('https://open.spotify.com/track/52k6PTgqVCBHrLndNtutrC'));
    if (path.startsWith('http')) return path;
    return api.base + path;
  },

  async runConsole() {
    const url = this.consoleUrl();
    const out = $('#consoleOut');
    const status = $('#consoleStatus');
    status.innerHTML = '<span class="dot-i busy"></span> requesting…';
    out.textContent = url + '\n';
    const started = performance.now();
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const ms = Math.round(performance.now() - started);
      const text = await res.text();
      let body = text;
      try { body = JSON.stringify(JSON.parse(text), null, 2); } catch { /* not JSON */ }
      status.innerHTML = `<span class="dot-i ${res.ok ? 'ok' : 'err'}"></span> ${res.status} ${res.statusText} · ${ms} ms · ${fmtBytes(text.length)}`;
      out.textContent = body.length > 60000 ? body.slice(0, 60000) + '\n… truncated' : body;
    } catch (err) {
      status.innerHTML = '<span class="dot-i err"></span> request failed';
      out.textContent = explainFetchError(err) + '\n\nURL: ' + url;
    }
  }
};

/* ============================================================
   helpers
   ============================================================ */
function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function fmtBytes(n) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

/* A failed fetch from a static page is nearly always CORS, offline
   or a blocked host — say so instead of printing "TypeError". */
function explainFetchError(err) {
  const msg = err && err.message ? err.message : String(err);
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return 'Request blocked. From a static page this is almost always one of: '
      + 'no network, the host does not send CORS headers for browser requests, '
      + 'or the page is opened over file:// with a strict policy. '
      + 'Serving the folder over http:// (see the README) fixes most cases.';
  }
  return msg;
}
