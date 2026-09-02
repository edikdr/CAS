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

  /* ---- audio ----------------------------------------------------------- */

  const audio = new Audio();
  audio.preload = 'metadata';
  audio.crossOrigin = 'anonymous';
  let corsRetried = false;

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

  function loadSource(url) {
    corsRetried = false;
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

  function renderAlbums() {
    $('#albumGrid').innerHTML = ALBUMS.map((album, index) => `
      <button class="album-card" data-album="${index}" aria-label="${esc(album.title)}, ${album.year}">
        <div class="album-image-wrap">
          <img src="${esc(album.image)}" alt="" loading="lazy">
          <span class="album-kind">${esc(album.kind)}</span>
          <span class="album-open">OPEN ↗</span>
        </div>
        <div class="album-meta"><span>${esc(album.accent)}</span><h3>${esc(album.title)}</h3><b>${album.year}</b></div>
      </button>`).join('');
    $$('[data-album]').forEach(button => button.addEventListener('click', () => openAlbum(Number(button.dataset.album))));
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
          <i class="chip chip-words">WORDS</i>
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
            <button class="modal-play" id="modalPlay">▶ PLAY 30 SEC</button>
            <div class="platforms">
              ${track.storeUrl ? `<a href="${esc(track.storeUrl)}" target="_blank" rel="noopener">APPLE MUSIC ↗</a>` : ''}
              <a href="https://open.spotify.com/search/${encodeURIComponent(`${track.name} ${NBHD_CONFIG.artist}`)}" target="_blank" rel="noopener">SPOTIFY ↗</a>
              <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(`${NBHD_CONFIG.artist} ${track.name} official`)}" target="_blank" rel="noopener">YOUTUBE ↗</a>
            </div>
          </div>
          <div class="track-lyrics">
            <h3 class="panel-h">LYRICS</h3>
            <div id="modalLyrics"><p class="modal-loading">REQUESTING LYRICS…</p></div>
          </div>
        </div>`
    });

    $('#modalPlay').addEventListener('click', () => playTrack(albumIndex, trackIndex, true));

    const lyrics = await Api.lyrics(track, album);
    const target = $('#modalLyrics');
    if (!target || $('#modalHeading').textContent !== track.name) return;
    target.innerHTML = lyricsMarkup(lyrics);
    $$('[data-mode]', target).forEach(button => button.addEventListener('click', () => {
      $$('[data-mode]', target).forEach(other => other.classList.toggle('active', other === button));
      $('.lyrics-lines.synced', target).hidden = button.dataset.mode !== 'synced';
      $('.lyrics-lines.plain', target).hidden = button.dataset.mode !== 'plain';
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
            <figure class="member-photo">${plate(member, 'member-shot')}<figcaption>${esc(member.years)}</figcaption></figure>
            <div class="member-copy">
              <h3 class="member-role">${esc(member.role)}</h3>
              <blockquote>${esc(member.bio)}</blockquote>
              <p class="member-signature">${esc(member.signature)}</p>
              <dl class="member-facts">${(member.facts || []).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
              <p class="member-lore">${esc(member.lore)}</p>
              <div class="member-on">${(member.on || []).map(id => {
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
        const box = element.getBoundingClientRect();
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
      if (!corsRetried && audio.crossOrigin && audio.currentSrc) {
        corsRetried = true;
        const url = audio.currentSrc;
        audio.crossOrigin = null;
        audio.src = url;
        audio.load();
        audio.play().catch(startVirtual);
        return;
      }
      if (audio.currentSrc) startVirtual();
    });

    /* open on the song that started everything */
    revealAll();
    playTrack(2, 3, false);
    Api.wiki().then(text => { if (text) $('#bandBio').textContent = text; });
    warmCatalogue();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
