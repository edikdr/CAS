(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const fmt = (seconds) => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds)) % 60).padStart(2, '0')}`;
  const shuffle = (items) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const parseDuration = (text) => {
    const [m, s] = String(text || '').split(':').map(Number);
    return (m || 0) * 60 + (s || 0);
  };
  const tempoFor = (name) => {
    const key = Api.norm(name);
    if (TRACK_TEMPO[key]) return TRACK_TEMPO[key];
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return 88 + (hash % 42);
  };

  /* ---- favourites -------------------------------------------------------
     Kept per browser. Private windows and file:// origins can refuse storage
     entirely, so every access is guarded and falls back to memory. */

  const Fav = (() => {
    const KEY = 'nbhd:favourites';
    let ids = new Set();
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) ids = new Set(JSON.parse(raw));
    } catch (_) { /* memory only */ }

    const persist = () => {
      try { window.localStorage.setItem(KEY, JSON.stringify([...ids])); } catch (_) {}
    };
    const id = (album, track) => `${album.id}::${Api.norm(track.name)}`;
    return {
      id,
      has: (album, track) => ids.has(id(album, track)),
      size: () => ids.size,
      list: () => [...ids],
      toggle(album, track) {
        const key = id(album, track);
        ids.has(key) ? ids.delete(key) : ids.add(key);
        persist();
        return ids.has(key);
      }
    };
  })();

  const heartMarkup = (albumIndex, trackIndex, on) =>
    `<button class="heart${on ? ' on' : ''}" data-fav="${albumIndex}:${trackIndex}" type="button" aria-pressed="${on}" aria-label="В избранное">♥</button>`;

  function wireHearts(root = document) {
    $$('[data-fav]', root).forEach(button => button.addEventListener('click', event => {
      event.stopPropagation();
      const [albumIndex, trackIndex] = button.dataset.fav.split(':').map(Number);
      const album = ALBUMS[albumIndex];
      const track = album?.tracks[trackIndex];
      if (!track) return;
      const on = Fav.toggle(album, track);
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', String(on));
      paintFavCount();
    }));
  }

  function paintFavCount() {
    const badge = $('#favCount');
    if (badge) badge.textContent = String(Fav.size());
  }

  /* resolve a stored favourite back to a live album/track pair */
  function findFav(key) {
    const [albumId, name] = key.split('::');
    const albumIndex = ALBUMS.findIndex(album => album.id === albumId);
    if (albumIndex < 0) return null;
    const album = ALBUMS[albumIndex];
    const trackIndex = album.tracks.findIndex(track => Api.norm(track.name) === name);
    if (trackIndex < 0) return null;
    return { album, albumIndex, track: album.tracks[trackIndex], trackIndex };
  }

  /* ---- audio ----------------------------------------------------------- */

  const audio = new Audio();
  audio.preload = 'metadata';
  audio.crossOrigin = 'anonymous';
  let corsRetried = false;
  let currentUrl = null;

  const player = {
    albumIndex: 2,
    trackIndex: 3,
    resolving: false,
    virtual: false,
    virtualTime: 0,
    virtualTimer: null,
    duration: 30,
    get album() { return ALBUMS[this.albumIndex]; },
    get track() { return this.album?.tracks[this.trackIndex] || null; }
  };

  /* ---- catalogue hydration --------------------------------------------- */

  const hydrated = new Map();

  async function hydrate(album) {
    if (hydrated.has(album.id)) return hydrated.get(album.id);
    const request = Api.itunesAlbum(album).then(live => {
      const used = new Set();
      const findLive = (name) => {
        let best = null;
        let bestScore = 0;
        live.tracks.forEach((song, index) => {
          if (used.has(index)) return;
          const value = Api.score(song.name, name);
          if (value > bestScore) { bestScore = value; best = { song, index }; }
        });
        if (best && bestScore >= .6) { used.add(best.index); return best.song; }
        return null;
      };

      let tracks;
      if (album.partial) {
        /* the live catalogue is authoritative for releases the archive only seeds */
        tracks = live.tracks.map((song, index) => ({
          name: song.name, number: song.number || index + 1,
          duration: song.seconds ? fmt(song.seconds) : '—',
          seconds: song.seconds, preview: song.preview, storeUrl: song.storeUrl
        }));
      } else {
        tracks = album.tracks.map(track => {
          const song = findLive(track.name);
          return {
            ...track,
            seconds: song?.seconds || parseDuration(track.duration),
            duration: song?.seconds ? fmt(song.seconds) : track.duration,
            preview: song?.preview || null,
            storeUrl: song?.storeUrl || null
          };
        });
        live.tracks.forEach((song, index) => {
          if (used.has(index)) return;
          tracks.push({
            name: song.name, number: tracks.length + 1, extra: true,
            duration: song.seconds ? fmt(song.seconds) : '—',
            seconds: song.seconds, preview: song.preview, storeUrl: song.storeUrl
          });
        });
      }

      const result = { source: 'itunes', artwork: live.artwork, storeUrl: live.storeUrl, year: live.year, copyright: live.copyright, tracks };
      album.tracks = tracks;
      album.live = result;
      return result;
    }).catch(() => {
      const tracks = album.tracks.map(track => ({ ...track, seconds: track.seconds || parseDuration(track.duration) }));
      album.tracks = tracks;
      const result = { source: 'archive', artwork: null, storeUrl: null, tracks };
      album.live = result;
      return result;
    });
    hydrated.set(album.id, request);
    return request;
  }

  /* ---- preview resolution ---------------------------------------------- */

  async function resolvePreview(album, track) {
    if (track.preview !== undefined && track.preview !== null) return track.preview;
    await hydrate(album);
    const current = album.tracks.find(row => Api.norm(row.name) === Api.norm(track.name)) || track;
    if (current.preview) return current.preview;
    const hit = await Api.itunesTrack(track.name, album.title);
    if (hit?.preview) {
      current.preview = hit.preview;
      current.storeUrl = current.storeUrl || hit.storeUrl;
      if (!current.seconds && hit.seconds) { current.seconds = hit.seconds; current.duration = fmt(hit.seconds); }
      return hit.preview;
    }
    current.preview = null;
    return null;
  }

  /* ---- fallback clock --------------------------------------------------- */

  function stopVirtual(reset = false) {
    clearInterval(player.virtualTimer);
    player.virtualTimer = null;
    if (reset) player.virtualTime = 0;
  }

  function startVirtual() {
    player.virtual = true;
    stopVirtual(false);
    if (player.virtualTime >= player.duration) player.virtualTime = 0;
    let last = performance.now();
    player.virtualTimer = setInterval(() => {
      const now = performance.now();
      player.virtualTime += (now - last) / 1000;
      last = now;
      if (player.virtualTime >= player.duration) {
        player.virtualTime = player.duration;
        stopVirtual(false);
      }
      paintPlayer();
    }, 80);
    paintPlayer();
  }

  /* ---- transport -------------------------------------------------------- */

  /* Ask for the stream with CORS so the analyser can read it. A host that
     refuses the flagged request fails before currentSrc is ever populated, so
     the retry has to use the URL we asked for, not what the element reports. */
  function loadSource(url) {
    corsRetried = false;
    currentUrl = url;
    audio.crossOrigin = 'anonymous';
    audio.src = url;
    audio.load();
  }

  async function playTrack(albumIndex, trackIndex, autoplay = true) {
    player.albumIndex = albumIndex;
    player.trackIndex = trackIndex;
    player.resolving = true;
    player.virtual = false;
    player.virtualTime = 0;
    player.duration = 30;
    stopVirtual(true);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();

    const album = player.album;
    const track = player.track;
    if (!track) return;
    Visualizer.setTempo(tempoFor(track.name));
    Visualizer.reset();
    paintPlayer();
    updateLyricPreview(album, track, albumIndex, trackIndex);

    const url = await resolvePreview(album, track);
    if (player.albumIndex !== albumIndex || player.trackIndex !== trackIndex) return;
    player.resolving = false;

    if (url) {
      loadSource(url);
      if (autoplay) {
        Visualizer.unlock();
        Visualizer.resume();
        try { await audio.play(); } catch (_) { startVirtual(); }
      }
    } else if (autoplay) {
      startVirtual();
    }
    paintPlayer();
  }

  function togglePlayer() {
    if (!player.track) return;
    Visualizer.unlock();
    Visualizer.resume();
    if (player.virtual) {
      player.virtualTimer ? stopVirtual(false) : startVirtual();
      paintPlayer();
      return;
    }
    if (!audio.src) {
      playTrack(player.albumIndex, player.trackIndex, true);
      return;
    }
    if (audio.paused) audio.play().catch(startVirtual);
    else audio.pause();
    paintPlayer();
  }

  function stepPlayer(direction) {
    const count = player.album.tracks.length;
    playTrack(player.albumIndex, (player.trackIndex + direction + count) % count, true);
  }

  function paintPlayer() {
    const track = player.track;
    const album = player.album;
    if (!track || !album) return;
    const duration = player.virtual ? player.duration : (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : player.duration);
    player.duration = duration;
    const time = player.virtual ? player.virtualTime : Math.min(duration, audio.currentTime || 0);
    const isPlaying = player.virtual ? Boolean(player.virtualTimer) : Boolean(audio.src && !audio.paused && !audio.ended);

    $('#playerTitle').textContent = track.name;
    $('#playerAlbum').textContent = album.title;
    const cover = $('#playerCover');
    cover.dataset.fallback = album.image;
    cover.src = album.live?.artwork || album.image;
    $('#timeNow').textContent = fmt(time);
    $('#timeEnd').textContent = fmt(duration);
    const seek = $('#seek');
    seek.max = String(Math.max(1, duration));
    seek.value = String(Math.min(duration, time));
    seek.style.setProperty('--fill', `${((time / duration) * 100).toFixed(2)}%`);
    $('#mainPlay').textContent = isPlaying ? 'Ⅱ' : '▶';
    $('#mainPlay').setAttribute('aria-label', isPlaying ? 'Пауза' : 'Воспроизвести');
    $('#heroPlay').textContent = isPlaying ? 'Ⅱ' : '▶';
    $('#playerNote').textContent = player.resolving
      ? 'Finding the preview…'
      : player.virtual
        ? 'No preview stream here — the transport runs on a 30-second fallback clock.'
        : '30-second iTunes preview.';

    Visualizer.update({ playing: isPlaying, time, duration, virtual: player.virtual || !audio.src });
  }

  async function updateLyricPreview(album, track, albumIndex, trackIndex) {
    const box = $('#lyricPreview');
    box.hidden = true;
    const lyrics = await Api.lyrics(track, album);
    if (player.albumIndex !== albumIndex || player.trackIndex !== trackIndex) return;
    const line = lyrics?.synced?.[Math.min(1, lyrics.synced.length - 1)] || null;
    const text = line?.text || lyrics?.plain?.find(Boolean) || null;
    if (!text) return;
    box.textContent = `“${text}…”`;
    box.hidden = false;
  }

  /* ---- modal shell ------------------------------------------------------ */

  const backdrop = () => $('#modalBackdrop');
  let lastFocused = null;

  function openModal({ kicker, heading, body, variant }) {
    lastFocused = document.activeElement;
    $('#modalKicker').textContent = kicker || '';
    $('#modalHeading').textContent = heading || '';
    $('#modalContent').innerHTML = body;
    const modal = $('#modal');
    modal.className = `modal${variant ? ` modal-${variant}` : ''}`;
    modal.scrollTop = 0;
    $('#modalContent').scrollTop = 0;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.setProperty('--scrollbar', `${gap}px`);
    backdrop().hidden = false;
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => $('#modalClose').focus());
  }

  function closeModal() {
    backdrop().hidden = true;
    $('#modalContent').innerHTML = '';
    document.body.classList.remove('modal-open');
    if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
  }

  function trapFocus(event) {
    if (event.key !== 'Tab' || backdrop().hidden) return;
    const focusable = $$('button, a[href], input, [tabindex]:not([tabindex="-1"])', $('#modal')).filter(el => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  /* ---- albums ----------------------------------------------------------- */

  /* the four studio albums stand on their own; everything else lives in the vault */
  const isStudio = (album) => album.kind === 'LP';
  const vaultReleases = () => ALBUMS.map((album, index) => ({ album, index })).filter(row => !isStudio(row.album));

  function renderAlbums() {
    const studio = ALBUMS.map((album, index) => ({ album, index })).filter(row => isStudio(row.album));
    const vault = vaultReleases();

    $('#albumGrid').innerHTML = studio.map(({ album, index }) => `
      <button class="album-card" data-album="${index}" aria-label="${esc(album.title)}, ${album.year}">
        <div class="album-image-wrap">
          <img src="${esc(album.image)}" alt="" loading="lazy">
          <span class="album-kind">${esc(album.kind)}</span>
          <span class="album-open">OPEN ↗</span>
        </div>
        <div class="album-meta"><span>${esc(album.accent)}</span><h3>${esc(album.title)}</h3><b>${album.year}</b></div>
      </button>`).join('') + `
      <button class="album-card vault-card" id="vaultOpen" aria-label="Синглы, EP и прочие релизы">
        <div class="album-image-wrap">
          <img src="assets/single-mark.webp" alt="" loading="lazy" width="820" height="1206">
          <span class="album-kind">SINGLES / EP</span>
          <span class="vault-count">${vault.length}</span>
          <span class="album-open">OPEN ↗</span>
        </div>
        <div class="album-meta"><span>THE VAULT / SINGLES</span><h3>Singles &amp; EPs</h3><b>2012—2018</b></div>
      </button>`;

    $$('[data-album]').forEach(button => button.addEventListener('click', () => openAlbum(Number(button.dataset.album))));
    $('#vaultOpen').addEventListener('click', openVault);
  }

  async function openVault() {
    const vault = vaultReleases();
    openModal({
      kicker: 'THE VAULT / NON-ALBUM RELEASES',
      heading: 'Singles & EPs',
      variant: 'vault',
      body: `
        <p class="vault-intro">Всё, что не является студийным альбомом: два EP 2012 года, микстейп, сборник 2018 года и сингл, который всё изменил.</p>
        <div class="vault-grid">
          ${vault.map(({ album, index }) => `
            <button class="vault-item" data-vault="${index}">
              <img src="${esc(album.image)}" alt="" loading="lazy">
              <div>
                <span class="vault-kind">${esc(album.kind)} / ${album.year}</span>
                <h3>${esc(album.title)}</h3>
                <p>${esc(album.note)}</p>
                <i>${album.tracks.length} TRACK${album.tracks.length === 1 ? '' : 'S'} ↗</i>
              </div>
            </button>`).join('')}
        </div>
        <div class="vault-live">
          <h3 class="panel-h">SINGLES IN THE LIVE CATALOGUE</h3>
          <div id="vaultLive"><p class="modal-loading">ASKING ITUNES FOR EVERY SINGLE AND EP…</p></div>
        </div>`
    });
    $$('[data-vault]').forEach(button => button.addEventListener('click', () => openAlbum(Number(button.dataset.vault))));

    const releases = await Api.itunesReleases();
    const host = $('#vaultLive');
    if (!host || $('#modalHeading').textContent !== 'Singles & EPs') return;
    host.innerHTML = releases?.length
      ? `<ul class="vault-releases">${releases.map(row => `
          <li><span>${esc(row.year)}</span><b>${esc(row.name)}</b><i>${esc(row.kind)}</i>
          ${row.url ? `<a href="${esc(row.url)}" target="_blank" rel="noopener">OPEN ↗</a>` : ''}</li>`).join('')}</ul>`
      : '<p class="lyrics-empty">КАТАЛОГ НЕДОСТУПЕН ОФЛАЙН. ПОДКЛЮЧИТЕСЬ, ЧТОБЫ УВИДЕТЬ ВСЕ СИНГЛЫ.</p>';
  }

  /* Resolve every release in the background: the grid then shows the real
     per-release artwork instead of the bundled stand-ins, and opening a record
     is instant because the catalogue is already cached. */
  async function warmCatalogue() {
    for (let index = 0; index < ALBUMS.length; index += 1) {
      const album = ALBUMS[index];
      hydrate(album).then(live => {
        if (!live?.artwork) return;
        const image = $(`[data-album="${index}"] img`);
        if (!image) return;
        image.dataset.fallback = album.image;
        image.src = live.artwork;
        if (player.albumIndex === index) paintPlayer();
      }).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 260));
    }
  }

  const sourceBadge = (live) => live?.source === 'itunes'
    ? '<i class="dot live"></i> TRACKLIST FROM THE LIVE ITUNES CATALOGUE'
    : '<i class="dot"></i> OFFLINE ARCHIVE COPY — CONNECT TO COMPLETE THIS RELEASE';

  function trackRows(album) {
    return album.tracks.map((track, index) => `
      <button class="track-row" data-track-row="${index}">
        <span class="track-n">${String(track.number || index + 1).padStart(2, '0')}</span>
        <span class="track-name">${esc(track.name)}${track.extra ? '<i class="tag">CATALOGUE</i>' : ''}</span>
        <span class="track-time">${esc(track.duration || '—')}</span>
        <span class="track-actions">
          ${heartMarkup(ALBUMS.indexOf(album), index, Fav.has(album, track))}
          <i class="chip chip-play${track.preview === null ? ' chip-off' : ''}" data-play-track="${index}">${track.preview === null ? 'NO PREVIEW' : '▶ 30 SEC'}</i>
        </span>
      </button>`).join('');
  }

  async function openAlbum(albumIndex) {
    const album = ALBUMS[albumIndex];
    const render = (live) => {
      const body = `
        <div class="album-hero">
          <figure class="album-cover"><img src="${esc(live?.artwork || album.image)}" data-fallback="${esc(album.image)}" alt="${esc(album.title)}"></figure>
          <div class="album-intro">
            <blockquote>${esc(album.note)}</blockquote>
            <dl class="album-facts">
              <div><dt>YEAR</dt><dd>${live?.year || album.year}</dd></div>
              <div><dt>FORMAT</dt><dd>${esc(album.kind)}</dd></div>
              <div><dt>TRACKS</dt><dd>${album.tracks.length}</dd></div>
              <div><dt>SOURCE</dt><dd>${live?.source === 'itunes' ? 'LIVE' : 'ARCHIVE'}</dd></div>
            </dl>
            <div class="album-links">
              ${live?.storeUrl ? `<a href="${esc(live.storeUrl)}" target="_blank" rel="noopener">APPLE MUSIC ↗</a>` : ''}
              <a href="https://open.spotify.com/search/${encodeURIComponent(`${album.title} ${NBHD_CONFIG.artist}`)}" target="_blank" rel="noopener">SPOTIFY ↗</a>
            </div>
          </div>
        </div>
        <div class="tracklist">
          <p class="tracklist-source">${sourceBadge(live)}</p>
          <div class="tracklist-head"><span>#</span><span>TRACK</span><span>TIME</span><span>PREVIEW</span></div>
          <div class="tracklist-rows">${trackRows(album)}</div>
        </div>`;
      $('#modalContent').innerHTML = body;
      wire();
    };

    const wire = () => {
      $$('[data-track-row]').forEach(row => row.addEventListener('click', () => openTrack(albumIndex, Number(row.dataset.trackRow))));
      $$('[data-play-track]').forEach(button => button.addEventListener('click', event => {
        event.stopPropagation();
        playTrack(albumIndex, Number(button.dataset.playTrack), true);
        closeModal();
        $('.player-section').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }));
      wireHearts();
    };

    openModal({
      kicker: album.accent,
      heading: album.title,
      variant: 'album',
      body: '<p class="modal-loading">RESOLVING THE CATALOGUE…</p>'
    });
    const live = await hydrate(album);
    if (backdrop().hidden || $('#modalHeading').textContent !== album.title) return;
    render(live);
  }

  /* ---- search + favourites view ------------------------------------------ */

  const rowMarkup = (album, albumIndex, track, trackIndex) => `
    <div class="find-row">
      <button class="find-main" data-open="${albumIndex}:${trackIndex}">
        <span class="find-name">${esc(track.name)}</span>
        <span class="find-album">${esc(album.title)}</span>
        <span class="find-year">${album.year}</span>
      </button>
      ${heartMarkup(albumIndex, trackIndex, Fav.has(album, track))}
      <button class="chip chip-play" data-find-play="${albumIndex}:${trackIndex}">▶</button>
    </div>`;

  function wireRows(root = document) {
    wireHearts(root);
    $$('[data-open]', root).forEach(button => button.addEventListener('click', () => {
      const [a, t] = button.dataset.open.split(':').map(Number);
      openTrack(a, t);
    }));
    $$('[data-find-play]', root).forEach(button => button.addEventListener('click', event => {
      event.stopPropagation();
      const [a, t] = button.dataset.findPlay.split(':').map(Number);
      playTrack(a, t, true);
      if (!backdrop().hidden) closeModal();
      $('.player-section').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
  }

  function searchTracks(query) {
    const needle = Api.norm(query);
    if (!needle) return [];
    const hits = [];
    ALBUMS.forEach((album, albumIndex) => {
      album.tracks.forEach((track, trackIndex) => {
        const name = Api.norm(track.name);
        const inTitle = name.includes(needle);
        const inAlbum = Api.norm(album.title).includes(needle);
        if (!inTitle && !inAlbum) return;
        hits.push({ album, albumIndex, track, trackIndex, rank: inTitle ? (name.startsWith(needle) ? 0 : 1) : 2 });
      });
    });
    hits.sort((a, b) => a.rank - b.rank || a.track.name.localeCompare(b.track.name));
    return hits.slice(0, 30);
  }

  function renderSearch(query) {
    const host = $('#searchResults');
    const clear = $('#searchClear');
    if (!host) return;
    clear.hidden = !query;
    if (!query.trim()) { host.hidden = true; host.innerHTML = ''; return; }
    const hits = searchTracks(query);
    host.hidden = false;
    host.innerHTML = hits.length
      ? `<p class="find-count">${hits.length} ${hits.length === 1 ? 'ТРЕК' : 'ТРЕКОВ'} НАЙДЕНО</p>${hits.map(hit => rowMarkup(hit.album, hit.albumIndex, hit.track, hit.trackIndex)).join('')}`
      : '<p class="find-count">НИЧЕГО НЕ НАЙДЕНО. ПОПРОБУЙТЕ ДРУГОЕ НАЗВАНИЕ.</p>';
    wireRows(host);
  }

  function openFavourites() {
    const rows = Fav.list().map(findFav).filter(Boolean);
    openModal({
      kicker: 'СОХРАНЕНО В ЭТОМ БРАУЗЕРЕ',
      heading: 'Favourites',
      variant: 'find',
      body: rows.length
        ? `<p class="vault-intro">${rows.length} ${rows.length === 1 ? 'трек' : 'треков'} в избранном. Список хранится локально и никуда не отправляется.</p>
           <div class="find-list">${rows.map(row => rowMarkup(row.album, row.albumIndex, row.track, row.trackIndex)).join('')}</div>`
        : '<p class="lyrics-empty">ПОКА ПУСТО. НАЖМИТЕ ♥ НА ЛЮБОМ ТРЕКЕ, ЧТОБЫ ДОБАВИТЬ ЕГО СЮДА.</p>'
    });
    wireRows($('#modalContent'));
  }

  /* ---- track ------------------------------------------------------------ */

  function lyricsMarkup(lyrics) {
    if (!lyrics) {
      return '<p class="lyrics-empty">NO LYRICS RETURNED BY THE API. USE THE PLATFORM LINKS BELOW.</p>';
    }
    if (lyrics.instrumental) {
      return '<p class="lyrics-empty">MARKED INSTRUMENTAL IN THE LYRICS DATABASE.</p>';
    }
    const synced = lyrics.synced?.length
      ? `<ol class="lyrics-lines synced">${lyrics.synced.map(line => `<li><span>${fmt(line.t)}</span><p>${esc(line.text)}</p></li>`).join('')}</ol>`
      : '';
    const plain = lyrics.plain?.length
      ? `<div class="lyrics-lines plain"${synced ? ' hidden' : ''}>${lyrics.plain.map(line => line ? `<p>${esc(line)}</p>` : '<p class="gap"></p>').join('')}</div>`
      : '';
    const toggle = synced && plain
      ? '<div class="lyrics-modes"><button data-mode="synced" class="active">TIMED</button><button data-mode="plain">PLAIN</button></div>'
      : '';
    const note = lyrics.partial
      ? '<small>Полный текст недоступен офлайн — показан фрагмент из архива. Подключитесь к сети, чтобы загрузить весь текст.</small>'
      : `<small>Источник: ${lyrics.source === 'lrclib' ? 'LRCLIB (публичная база текстов, без ключа)' : 'локальный архив'}. Текст не хранится в этом файле и запрашивается при открытии.</small>`;
    return `${toggle}<div class="lyrics-scroll">${synced}${plain}</div>${note}`;
  }

  async function openTrack(albumIndex, trackIndex) {
    const album = ALBUMS[albumIndex];
    const track = album.tracks[trackIndex];
    const artwork = album.live?.artwork || album.image;

    openModal({
      kicker: `${album.title} / ${album.live?.year || album.year}`,
      heading: track.name,
      variant: 'track',
      body: `
        <div class="track-grid">
          <div class="track-side">
            <figure class="track-cover"><img src="${esc(artwork)}" data-fallback="${esc(album.image)}" alt=""></figure>
            <dl class="track-facts">
              <div><dt>TRACK</dt><dd>${String(track.number || trackIndex + 1).padStart(2, '0')}</dd></div>
              <div><dt>LENGTH</dt><dd>${esc(track.duration || '—')}</dd></div>
            </dl>
            <div class="track-cta">
              <button class="modal-play" id="modalPlay">▶ PLAY 30 SEC</button>
              ${heartMarkup(albumIndex, trackIndex, Fav.has(album, track))}
            </div>
            <div class="platforms">
              ${track.storeUrl ? `<a href="${esc(track.storeUrl)}" target="_blank" rel="noopener">APPLE MUSIC ↗</a>` : ''}
              <a href="https://open.spotify.com/search/${encodeURIComponent(`${track.name} ${NBHD_CONFIG.artist}`)}" target="_blank" rel="noopener">SPOTIFY ↗</a>
              <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(`${NBHD_CONFIG.artist} ${track.name} official`)}" target="_blank" rel="noopener">YOUTUBE ↗</a>
            </div>
          </div>
          <div class="track-lyrics">
            <h3 class="panel-h">LYRICS</h3>
            <div id="modalLyrics"><p class="modal-loading">REQUESTING LYRICS…</p></div>
            ${Genius.enabled ? '<div id="geniusPanel" class="genius-panel"><p class="modal-loading">ASKING GENIUS…</p></div>' : ''}
          </div>
        </div>`
    });

    $('#modalPlay').addEventListener('click', () => playTrack(albumIndex, trackIndex, true));
    wireHearts($('#modalContent'));

    const lyrics = await Api.lyrics(track, album);
    const target = $('#modalLyrics');
    if (!target || $('#modalHeading').textContent !== track.name) return;
    target.innerHTML = lyricsMarkup(lyrics);
    $$('[data-mode]', target).forEach(button => button.addEventListener('click', () => {
      $$('[data-mode]', target).forEach(other => other.classList.toggle('active', other === button));
      $('.lyrics-lines.synced', target).hidden = button.dataset.mode !== 'synced';
      $('.lyrics-lines.plain', target).hidden = button.dataset.mode !== 'plain';
    }));

    if (Genius.enabled) paintGenius(album, track, lyrics);
  }

  /* ---- genius enrichment -------------------------------------------------
     Everything here is additive and best-effort: the panel simply stays away
     if the service is unreachable or the song is not on Genius. */

  function annotate(lines, matched) {
    if (!matched?.lines?.length) return '';
    const bodies = new Map();
    const rows = matched.lines.map(row => {
      if (!row.annotations.length) return `<p>${esc(row.text)}</p>`;
      const first = row.annotations[0];
      bodies.set(String(first.id), first);
      const before = row.text.slice(0, first.start);
      const span = row.text.slice(first.start, first.end);
      const after = row.text.slice(first.end);
      return `<p>${esc(before)}<button class="annot" data-annot="${first.id}">${esc(span)}</button>${esc(after)}</p>`;
    }).join('');

    return `<h3 class="panel-h">ANNOTATED — ${matched.matched} OF ${matched.total}</h3>
      <div class="annot-lines">${rows}</div>
      <div class="annot-pop" id="annotPop" hidden></div>
      <script type="application/json" id="annotData">${JSON.stringify([...bodies.values()])}<\/script>`;
  }

  async function paintGenius(album, track, lyrics) {
    const host = $('#geniusPanel');
    if (!host) return;
    const lines = lyrics?.plain?.length ? lyrics.plain : null;
    const data = await Genius.track(track, album, lines);
    if (!host.isConnected || $('#modalHeading').textContent !== track.name) return;

    if (!data) {
      host.innerHTML = '<p class="genius-empty">GENIUS HAS NOTHING FOR THIS TRACK, OR THE SERVICE IS OFFLINE.</p>';
      return;
    }

    const stats = data.stats || {};
    const covers = data.relations?.covers || [];
    host.innerHTML = `
      ${data.background?.hasContent ? `
        <h3 class="panel-h">BACKGROUND</h3>
        <div class="genius-background">${data.background.html}</div>
        <small class="genius-credit">Source: <a href="${esc(data.background.sourceUrl)}" target="_blank" rel="noopener">Genius</a></small>` : ''}
      <dl class="genius-stats">
        ${stats.pageviews != null ? `<div><dt>PAGEVIEWS</dt><dd>${stats.pageviews.toLocaleString('en-US')}</dd></div>` : ''}
        ${stats.annotations?.total != null ? `<div><dt>ANNOTATIONS</dt><dd>${stats.annotations.total}</dd></div>` : ''}
        ${stats.contributors != null ? `<div><dt>CONTRIBUTORS</dt><dd>${stats.contributors}</dd></div>` : ''}
        ${stats.hot ? '<div><dt>STATUS</dt><dd>HOT</dd></div>' : ''}
      </dl>
      ${covers.length ? `<h3 class="panel-h">OTHER VERSIONS</h3>
        <ul class="genius-covers">${covers.map(row => `
          <li><span>${esc(row.relationLabel)}</span><b>${esc(row.title)}</b><i>${esc(row.artist || '')}</i>
          ${row.url ? `<a href="${esc(row.url)}" target="_blank" rel="noopener">OPEN ↗</a>` : ''}</li>`).join('')}</ul>` : ''}
      ${annotate(lines, data.annotations)}`;

    /* annotation popups */
    const store = $('#annotData', host);
    const bodies = store ? JSON.parse(store.textContent) : [];
    const pop = $('#annotPop', host);
    $$('[data-annot]', host).forEach(button => button.addEventListener('click', () => {
      const entry = bodies.find(row => String(row.id) === button.dataset.annot);
      if (!entry || !pop) return;
      const open = pop.dataset.for === button.dataset.annot && !pop.hidden;
      pop.hidden = open;
      pop.dataset.for = button.dataset.annot;
      $$('[data-annot]', host).forEach(other => other.classList.toggle('on', !open && other === button));
      if (!open) {
        pop.innerHTML = `${entry.body}${entry.url ? `<a href="${esc(entry.url)}" target="_blank" rel="noopener">ON GENIUS ↗</a>` : ''}`;
        button.after(pop);
      }
    }));
  }

  /* ---- people ----------------------------------------------------------- */

  const plate = (member, className) => member.image
    ? `<img class="${className}" src="${esc(member.image)}" alt="${esc(member.name)}">`
    : `<div class="${className} no-photo" role="img" aria-label="Фотография отсутствует в архиве">
         ${Collage.PIECES.house()}<span>NO PHOTO<br>IN ARCHIVE</span>
       </div>`;

  function renderMembers() {
    $('#memberGrid').innerHTML = MEMBERS.map((member, index) => `
      <button class="member-card${member.status === 'former' ? ' is-former' : ''}" data-member="${index}">
        <span class="member-number">${String(index + 1).padStart(2, '0')}</span>
        ${plate(member, 'member-face')}
        <div><p>${esc(member.role)}</p><h3>${esc(member.name)}</h3><span>PROFILE ↗</span></div>
      </button>`).join('');
    $$('[data-member]').forEach(button => button.addEventListener('click', () => {
      const member = MEMBERS[Number(button.dataset.member)];
      openModal({
        kicker: 'THE NBHD / PERSONNEL',
        heading: member.name,
        variant: 'member',
        body: `
          <div class="member-grid-modal">
            <div class="member-frames">
              <figure class="member-photo">${plate(member, 'member-shot')}<figcaption>${esc(member.years)}</figcaption></figure>
              ${member.alt ? `<figure class="member-photo alt"><img class="member-shot" src="${esc(member.alt)}" alt="${esc(member.name)}"><figcaption>ARCHIVE FRAME</figcaption></figure>` : ''}
            </div>
            <div class="member-copy">
              <h3 class="member-role">${esc(member.role)}</h3>
              <blockquote>${esc(member.bio)}</blockquote>
              <p class="member-signature">${esc(member.signature)}</p>
              <dl class="member-facts">${(member.facts || []).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
              <p class="member-lore">${esc(member.lore)}</p>
              ${(member.listen || []).length ? `<div class="member-listen">
                <h4>WHERE TO HEAR IT</h4>
                <ul>${member.listen.map(([song, record, why]) => `
                  <li><b>${esc(song)}</b><span>${esc(record)}</span><p>${esc(why)}</p></li>`).join('')}</ul>
              </div>` : ''}
              <div class="member-on"><h4>APPEARS ON</h4>${(member.on || []).map(id => {
                const record = ALBUMS.find(album => album.id === id);
                return record ? `<i>${esc(record.title)}</i>` : '';
              }).join('')}</div>
              <a class="member-link" href="https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(member.name)}" target="_blank" rel="noopener">READ MORE ↗</a>
            </div>
          </div>`
      });
    }));
  }

  /* ---- lore -------------------------------------------------------------- */

  function renderLore() {
    $('#loreOrigin').innerHTML = LORE.origin.map((card, index) => `
      <article class="lore-card">
        <span class="lore-index">${String(index + 1).padStart(2, '0')}</span>
        <h3>${esc(card.head)}</h3>
        <p>${esc(card.body)}</p>
      </article>`).join('');

    $('#loreTimeline').innerHTML = LORE.timeline.map(entry => `
      <li class="lore-entry">
        <span class="lore-year">${esc(entry.year)}</span>
        <div><h4>${esc(entry.title)}</h4><p>${esc(entry.body)}</p></div>
      </li>`).join('');

    const craft = $('#loreCraft');
    if (craft) {
      craft.innerHTML = LORE.craft.map((card, index) => `
        <article class="craft-card${index === LORE.craft.length - 1 ? ' craft-note' : ''}">
          <h4>${esc(card.head)}</h4><p>${esc(card.body)}</p>
        </article>`).join('');
    }

    const ERA_SHADES = [
      ['rgba(231,176,192,.30)', 'rgba(112,96,104,.42)'],
      ['rgba(143,167,196,.30)', 'rgba(84,98,116,.44)'],
      ['rgba(196,190,206,.26)', 'rgba(74,74,88,.46)'],
      ['rgba(214,214,220,.34)', 'rgba(96,96,104,.44)']
    ];
    $('#loreEras').innerHTML = LORE.eras.map((era, index) => {
      const [a, b] = ERA_SHADES[index % ERA_SHADES.length];
      return `<article class="era-card" style="--era-a:${a};--era-b:${b}">
        <div class="era-tag"><span>${esc(era.tag)}</span><span>${esc(era.years)}</span></div>
        <h4>${esc(era.title)}</h4>
        <p class="era-mood">${esc(era.mood)}</p>
        <p>${esc(era.body)}</p>
        <div class="era-marks">${era.marks.map(mark => `<i>${esc(mark)}</i>`).join('')}</div>
      </article>`;
    }).join('');

    const GLYPHS = { house: 'house', palm: 'palmCircle', mono: 'monoSplit', moon: 'moon' };
    $('#loreSymbols').innerHTML = LORE.symbols.map((symbol, index) => {
      const builder = Collage.PIECES[GLYPHS[symbol.glyph]] || Collage.PIECES.house;
      return `<div class="lore-symbol">
        <figure>${builder(Collage.seeded(2200 + index * 131))}</figure>
        <div><h4>${esc(symbol.name)}</h4><p>${esc(symbol.body)}</p></div>
      </div>`;
    }).join('');

    $('#loreCodex').innerHTML = LORE.codex.map(row => `<div><dt>${esc(row.k)}</dt><dd>${esc(row.v)}</dd></div>`).join('');

    $('#loreMyths').innerHTML = LORE.myths.map(row => `
      <div class="lore-myth"><p class="myth-q">${esc(row.q)}</p><p class="myth-a">${esc(row.a)}</p></div>`).join('');
  }

  /* ---- quiz --------------------------------------------------------------- */

  let activeQuiz = 0;
  let quizQuestions = [];
  let quizAnswers = {};
  let quizSubmitted = false;

  function startQuiz(index) {
    activeQuiz = index;
    quizQuestions = QUIZZES[index].questions.map(question => ({ ...question, options: shuffle(question.options) }));
    quizAnswers = {};
    quizSubmitted = false;
    renderQuiz();
  }

  function renderQuiz() {
    $('#quizTabs').innerHTML = QUIZZES.map((deck, index) => `<button data-quiz="${index}" class="${index === activeQuiz ? 'active' : ''}"><span>0${index + 1}</span>${esc(deck.title)}<small>${esc(deck.eyebrow)}</small></button>`).join('');
    $$('[data-quiz]').forEach(button => button.addEventListener('click', () => startQuiz(Number(button.dataset.quiz))));
    const deck = QUIZZES[activeQuiz];
    $('#quizEyebrow').textContent = deck.eyebrow;
    $('#quizTitle').textContent = deck.title;
    $('#quizProgress').textContent = `${Object.keys(quizAnswers).length}/${deck.questions.length} ANSWERED`;
    $('#questions').innerHTML = quizQuestions.map((question, questionIndex) => `<fieldset><legend><span>${String(questionIndex + 1).padStart(2, '0')}</span>${esc(question.q)}</legend><div class="answers">${question.options.map((option, optionIndex) => {
      const selected = quizAnswers[questionIndex] === option;
      const correct = quizSubmitted && option === question.correct;
      const wrong = quizSubmitted && selected && option !== question.correct;
      return `<button type="button" data-answer="${questionIndex}:${optionIndex}" class="${selected ? 'selected' : ''} ${correct ? 'correct' : ''} ${wrong ? 'wrong' : ''}"><span>${String.fromCharCode(65 + optionIndex)}</span>${esc(option)}</button>`;
    }).join('')}</div></fieldset>`).join('');
    $$('[data-answer]').forEach(button => button.addEventListener('click', () => {
      if (quizSubmitted) return;
      const [questionIndex, optionIndex] = button.dataset.answer.split(':').map(Number);
      quizAnswers[questionIndex] = quizQuestions[questionIndex].options[optionIndex];
      renderQuiz();
    }));
    if (quizSubmitted) {
      const total = quizQuestions.length;
      const score = quizQuestions.reduce((sum, question, index) => sum + (quizAnswers[index] === question.correct ? 1 : 0), 0);
      $('#quizResult').innerHTML = `<div class="score"><span>YOUR SCORE</span><b>${score}<i>/${total}</i></b><p>${score >= total - 2 ? 'CERTIFIED NBHD ARCHIVIST' : score >= total * .6 ? 'YOU KNOW THE COAST' : 'BACK INTO THE VOID'}</p></div>`;
      $('#quizSubmit').textContent = 'RETRY — RESHUFFLE';
    } else {
      $('#quizResult').innerHTML = '<p>Ответьте на вопросы и проверьте результат.</p>';
      $('#quizSubmit').textContent = 'CHECK ANSWERS';
    }
  }

  /* ---- signal check ------------------------------------------------------- */

  function renderSignal(status) {
    const host = $('#signalCheck');
    if (!host) return;
    host.innerHTML = Object.values(status).map(entry => `
      <li class="signal signal-${entry.state}">
        <i class="dot"></i><b>${esc(entry.label)}</b><span>${esc(entry.detail)}</span>
      </li>`).join('');
    const anyLive = Object.values(status).some(entry => entry.state === 'live');
    const marker = $('#dataStatus');
    if (marker) marker.className = anyLive ? 'live' : Object.values(status).every(e => e.state === 'idle') ? '' : 'offline';
  }

  /* ---- reveal on scroll ------------------------------------------------- */

  const REVEAL = [
    ['.section-head', 0], ['.manifesto-copy', 0], ['.album-card', 45], ['.lore-card', 70],
    ['.era-card', 70], ['.lore-entry', 40], ['.lore-symbol', 60], ['.lore-myth', 70],
    ['.plate', 90], ['.member-card', 55], ['.quiz-tabs', 0], ['.player-panel', 0]
  ];

  function revealAll() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const pending = new Set();
    REVEAL.forEach(([selector, stagger]) => {
      $$(selector).forEach((element, index) => {
        if (element.dataset.reveal !== undefined) return;
        element.setAttribute('data-reveal', '');
        if (stagger) element.style.setProperty('--reveal-delay', `${Math.min(index, 7) * stagger}ms`);
        pending.add(element);
      });
    });
    if (!pending.size) return;

    /* hand the element back to its own styles once it has landed, so hover
       transforms are never fought over by the reveal transition */
    const release = (element, wait) => setTimeout(() => {
      element.classList.remove('revealed');
      element.removeAttribute('data-reveal');
      element.style.removeProperty('--reveal-delay');
    }, wait);

    /* A rAF-throttled sweep rather than IntersectionObserver: a fast or
       programmatic scroll can jump an element past the observer entirely and
       leave it stuck at zero opacity. */
    let ticking = false;
    const sweep = () => {
      ticking = false;
      const limit = window.innerHeight * .94;
      pending.forEach(element => {
        let box = element.getBoundingClientRect();
        /* content-visibility skips layout for far-off sections, so an element
           inside one measures as zero-height. Fall back to its section, which
           is always laid out. */
        if (!box.height) {
          const host = element.closest('section');
          if (host) box = host.getBoundingClientRect();
        }
        if (box.bottom < -240) {
          /* already scrolled past — show it with no animation at all */
          element.style.setProperty('--reveal-delay', '0s');
          element.classList.add('revealed');
          pending.delete(element);
          release(element, 0);
        } else if (box.top < limit) {
          element.classList.add('revealed');
          pending.delete(element);
          release(element, 1400);
        }
      });
      if (!pending.size) {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      }
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(sweep); } };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    sweep();
  }

  /* ---- init ---------------------------------------------------------------- */

  function init() {
    Collage.build();
    Particles.build();
    renderAlbums();
    renderMembers();
    renderLore();
    startQuiz(0);
    Api.onStatus(renderSignal);
    Visualizer.mount($('#waveform'), audio);
    Visualizer.onMode(mode => { const el = $('#vizMode'); if (el) el.textContent = `VISUALIZER / ${mode}`; });

    /* a live artwork URL that will not load falls back to the bundled cover */
    document.addEventListener('error', event => {
      const img = event.target;
      if (img?.tagName === 'IMG' && img.dataset.fallback && !img.src.endsWith(img.dataset.fallback)) {
        img.src = img.dataset.fallback;
      }
    }, true);

    $('#modalClose').addEventListener('click', closeModal);
    backdrop().addEventListener('mousedown', event => { if (event.target === backdrop()) closeModal(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !backdrop().hidden) closeModal();
      trapFocus(event);
    });

    $('#mainPlay').addEventListener('click', togglePlayer);
    $('#heroPlay').addEventListener('click', togglePlayer);
    $('#prevTrack').addEventListener('click', () => stepPlayer(-1));
    $('#nextTrack').addEventListener('click', () => stepPlayer(1));
    $('#volume').addEventListener('input', event => {
      const value = Number(event.target.value);
      audio.volume = value;
      Visualizer.setVolume(value);
      event.target.style.setProperty('--fill', `${value * 100}%`);
    });
    $('#seek').addEventListener('input', event => {
      const time = Number(event.target.value);
      if (player.virtual) player.virtualTime = time;
      else if (audio.src) { try { audio.currentTime = time; } catch (_) {} }
      paintPlayer();
    });
    paintFavCount();
    $('#favOpen').addEventListener('click', openFavourites);
    let searchTimer = 0;
    $('#trackSearch').addEventListener('input', event => {
      clearTimeout(searchTimer);
      const value = event.target.value;
      searchTimer = setTimeout(() => renderSearch(value), 110);
    });
    $('#searchClear').addEventListener('click', () => {
      $('#trackSearch').value = '';
      renderSearch('');
      $('#trackSearch').focus();
    });

    $('#quizSubmit').addEventListener('click', () => {
      if (quizSubmitted) startQuiz(activeQuiz);
      else { quizSubmitted = true; renderQuiz(); }
    });

    audio.volume = 0.75;
    audio.dataset.gain = '0.75';
    $('#volume').style.setProperty('--fill', '75%');
    audio.addEventListener('timeupdate', paintPlayer);
    audio.addEventListener('loadedmetadata', paintPlayer);
    audio.addEventListener('play', paintPlayer);
    audio.addEventListener('pause', paintPlayer);
    audio.addEventListener('ended', () => stepPlayer(1));
    audio.addEventListener('error', () => {
      /* a preview host that refuses CORS: keep the audio, drop the analyser */
      if (!corsRetried && currentUrl && audio.crossOrigin) {
        corsRetried = true;
        audio.crossOrigin = null;
        audio.src = currentUrl;
        audio.load();
        audio.play().catch(startVirtual);
        return;
      }
      if (currentUrl) startVirtual();
    });

    /* open on the song that started everything */
    revealAll();
    playTrack(2, 3, false);
    Api.wiki().then(text => { if (text) $('#bandBio').textContent = text; });
    warmCatalogue();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
