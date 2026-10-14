/*!
 * LyricsEngine 1.1.0
 * Pop-up lyrics synced to a 30-second preview (iTunes Search API or any <audio>).
 * Default look ("clean"): no background, only the words and slow particles drawn
 * over the site; clicks pass through to the page.
 *
 * AI assistants integrating this into a site: read AI_GUIDE.md first. Restyle
 * through the `theme` option and `.le-*` CSS overrides, never by editing this file.
 *
 * - Vanilla JS, no dependencies, no build step. Works from a static host.
 * - UMD: window.LyricsEngine, CommonJS/AMD; for `import` use lyrics-engine.mjs.
 * - Styles are injected once as <style id="le-styles">; every class is `le-*`.
 * - The engine never creates an <audio> and never touches the page outside its
 *   own container (the full-screen overlay counts as its container).
 *
 * Lyrics belong to their rights holders: they are fetched at runtime, kept in
 * page memory only and never written to storage.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
    module.exports.default = api;
  } else if (typeof define === 'function' && define.amd) {
    define([], function () { return api; });
  }
  if (root) root.LyricsEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var G = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {};
  var HAS_DOM = typeof document !== 'undefined' && !!document.createElement;

  /* ------------------------------------------------------------------
     Timing constants (seconds)
     ------------------------------------------------------------------ */
  var MAX_LINE = 4;      // the words of one line are spread over at most this
  var GAP_MIN = 2.5;     // silence longer than this between lines shows the wave
  var EDGE_TOL = 0.25;   // a line starting this close before the preview still counts as full
  var TAIL = 10;         // wave after the last line when the track length is unknown
  var JUMP = 0.75;       // a time step larger than this is a seek, not playback
  var WAVE_STEP = 0.045; // wave history advances once per this
  var DEAD_FRAMES = 90;  // ~1.5 s of all-zero analyser data while playing → fake wave

  /* ------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------ */
  function noop() {}
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function toNum(v) {
    if (v == null || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function round(v, d) { var p = Math.pow(10, d); return Math.round(v * p) / p; }
  function now() { return G.performance && G.performance.now ? G.performance.now() : Date.now(); }
  function err(code, message, cause) {
    var e = new Error(message);
    e.code = code;
    if (cause) e.cause = cause;
    return e;
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
  }
  var raf = function (fn) {
    return G.requestAnimationFrame ? G.requestAnimationFrame(fn) : setTimeout(function () { fn(now()); }, 16);
  };
  var caf = function (id) {
    return G.cancelAnimationFrame ? G.cancelAnimationFrame(id) : clearTimeout(id);
  };

  /* ------------------------------------------------------------------
     Text normalisation and fuzzy matching
     ------------------------------------------------------------------ */
  var APOS = /[‘’‚‛′ʼ`´]/g;
  var QUOTES = /[“”„‟″«»]/g;
  var NON_WORD, LETTER;
  try {
    NON_WORD = new RegExp('[^\\p{L}\\p{N}]+', 'gu');
    LETTER = new RegExp('[\\p{L}\\p{N}]', 'u');
  } catch (e) {
    NON_WORD = /[^A-Za-z0-9À-ɏͰ-ӿ぀-鿿가-힯]+/g;
    LETTER = /[A-Za-z0-9À-ɏͰ-ӿ぀-鿿가-힯]/;
  }

  /** Lower case, no accents, one kind of apostrophe and quote. */
  function fold(s) {
    s = String(s == null ? '' : s).replace(APOS, "'").replace(QUOTES, '"');
    if (s.normalize) s = s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    return s.toLowerCase();
  }

  /** Comparable form: folded, punctuation collapsed to single spaces. */
  function loose(s) {
    return fold(s).replace(/'/g, '').replace(/&/g, ' and ').replace(NON_WORD, ' ').trim();
  }

  var VERSION_WORDS = /\b(remaster(ed)?|re-?master|live|version|edit|mix|remix|mono|stereo|demo|acoustic|bonus|deluxe|single|radio|explicit|clean|anniversary|session|take)\b/;

  /** Song title without "(Remastered 2011)", "- Live", "feat. X", brackets, apostrophes. */
  function cleanTitle(title) {
    var s = fold(title);
    var dash = s.search(/\s[-–—]\s/);
    if (dash > 0 && VERSION_WORDS.test(s.slice(dash))) s = s.slice(0, dash);
    s = s.replace(/[(\[{][^)\]}]*[)\]}]/g, ' ');
    s = s.replace(/\s(feat|ft|featuring)\.?\s.*$/, ' ');
    return loose(s);
  }

  /** Artist without "feat. X" and a leading "the". */
  function cleanArtist(artist) {
    var s = fold(artist).replace(/\s(feat|ft|featuring)\.?\s.*$/, ' ');
    return loose(s).replace(/^the /, '');
  }

  function levenshtein(a, b, max) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      var best = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  /** 0..1 similarity of two already-cleaned strings (token Dice with typo tolerance). */
  function similarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    var ca = a.replace(/ /g, ''), cb = b.replace(/ /g, '');
    if (ca === cb) return 0.98;
    var A = a.split(' '), B = b.split(' '), used = [], hit = 0;
    for (var i = 0; i < A.length; i++) {
      for (var j = 0; j < B.length; j++) {
        if (used[j]) continue;
        var x = A[i], y = B[j];
        if (x === y || (x.length >= 4 && y.length >= 4 && levenshtein(x, y, 1) <= 1)) {
          used[j] = true;
          hit++;
          break;
        }
      }
    }
    var dice = (2 * hit) / (A.length + B.length);
    if (ca.length >= 4 && cb.length >= 4 && (ca.indexOf(cb) >= 0 || cb.indexOf(ca) >= 0)) {
      dice = Math.max(dice, 0.6 + 0.35 * (Math.min(ca.length, cb.length) / Math.max(ca.length, cb.length)));
    }
    return dice;
  }

  /** Artist similarity that tolerates "A, B & C" credits. */
  function artistSimilarity(wanted, got) {
    var a = cleanArtist(wanted);
    var best = similarity(a, cleanArtist(got));
    var parts = fold(got).split(/\s*(?:,|&|\+|\/|;|\band\b|\bx\b|\bwith\b|\bfeat\.?|\bft\.?|\bfeaturing\b)\s*/);
    for (var i = 0; i < parts.length; i++) {
      if (parts[i]) best = Math.max(best, similarity(a, cleanArtist(parts[i])));
    }
    return best;
  }

  /** "Artist - Title" key used by offsets.json and saved calibrations. */
  function trackKey(artist, title) { return loose(artist + ' - ' + title); }

  /* ------------------------------------------------------------------
     LRC parsing and line maths
     ------------------------------------------------------------------ */
  var STAMP = /^\s*\[(\d{1,3}):(\d{1,2})(?:[.:,](\d{1,3}))?\]/;
  var WORD_STAMP = /<\d{1,3}:\d{1,2}(?:[.:,]\d{1,3})?>/g;

  /**
   * LRC → [{t, text}] sorted by time.
   * Several stamps per line, 1–3 digit fractions, [ar:]/[ti:]/[offset:] tags ignored,
   * empty text kept as a pause.
   */
  function parseLRC(text) {
    var out = [];
    if (!text) return out;
    var rows = String(text).replace(/^﻿/, '').split(/\r\n|\r|\n/);
    for (var r = 0; r < rows.length; r++) {
      var rest = rows[r], times = [], m;
      while ((m = STAMP.exec(rest))) {
        var frac = m[3] ? Number(m[3]) / Math.pow(10, m[3].length) : 0;
        times.push(Number(m[1]) * 60 + Number(m[2]) + frac);
        rest = rest.slice(m[0].length);
      }
      if (!times.length) continue;
      var line = rest.replace(WORD_STAMP, '').replace(/\s+/g, ' ').trim();
      for (var k = 0; k < times.length; k++) out.push({ t: round(times[k], 3), text: line, _o: out.length });
    }
    out.sort(function (a, b) { return a.t - b.t || a._o - b._o; });
    for (var i = 0; i < out.length; i++) delete out[i]._o;
    return out;
  }

  /** Accept [{t,text}] or an LRC string; drop junk; sort. */
  function normalizeLines(synced) {
    if (typeof synced === 'string') return parseLRC(synced);
    if (!Array.isArray(synced)) return [];
    var out = [];
    for (var i = 0; i < synced.length; i++) {
      var l = synced[i];
      var t = l && toNum(l.t != null ? l.t : l.time);
      if (t == null) continue;
      out.push({ t: t, text: String(l.text == null ? '' : l.text).replace(/\s+/g, ' ').trim(), _o: i });
    }
    out.sort(function (a, b) { return a.t - b.t || a._o - b._o; });
    for (var j = 0; j < out.length; j++) delete out[j]._o;
    return out;
  }

  /** Index of the last line with t <= time, or -1. */
  function findLine(lines, time) {
    var lo = 0, hi = lines.length - 1, res = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (lines[mid].t <= time) { res = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return res;
  }

  /** A line with no letters or digits ("", "♪", "...") is a pause. */
  function isBreak(text) { return !text || !LETTER.test(text); }

  function splitWords(text) { return String(text || '').split(/\s+/).filter(Boolean); }

  /** How long the words of line i are spread over. */
  function lineSpan(lines, i) {
    var next = lines[i + 1];
    var d = next ? next.t - lines[i].t : MAX_LINE;
    return clamp(d, 0, MAX_LINE);
  }

  /** Start time of each word, proportional to the characters before it. */
  function wordTimes(t, words, span) {
    var total = 0, acc = 0, out = [];
    for (var i = 0; i < words.length; i++) total += words[i].length + 1;
    for (var k = 0; k < words.length; k++) {
      out.push(t + (total ? (span * acc) / total : 0));
      acc += words[k].length + 1;
    }
    return out;
  }

  /** Index of the first line that starts inside the preview (not cut by its start). */
  function firstFullLine(lines, previewStart) {
    for (var i = 0; i < lines.length; i++) if (lines[i].t >= previewStart - EDGE_TOL) return i;
    return lines.length;
  }

  /**
   * What the scene shows at `song` seconds of the full track.
   * phase: 'none' (nothing loaded) | 'out' (outside the lyrics) | 'line' | 'gap'
   */
  function classify(lines, song, o) {
    o = o || {};
    var n = lines.length;
    if (!n) return { phase: 'none', idx: -1 };
    var i = findLine(lines, song);
    if (i < 0) return { phase: 'out', idx: -1 };
    if (i < (o.firstFull || 0)) return { phase: 'gap', idx: i, why: 'partial' };
    var line = lines[i], next = lines[i + 1];
    if (isBreak(line.text)) return { phase: 'gap', idx: i, why: 'break' };
    var end = line.t + lineSpan(lines, i);
    if (!next) {
      var stop = isNum(o.duration) && o.duration > line.t ? Math.max(o.duration, end) : end + TAIL;
      if (song > stop) return { phase: 'out', idx: n };
      if (song >= end) return { phase: 'gap', idx: i, why: 'tail' };
      return { phase: 'line', idx: i };
    }
    if (song >= end && next.t - end > GAP_MIN) return { phase: 'gap', idx: i, why: 'pause' };
    return { phase: 'line', idx: i };
  }

  /* ------------------------------------------------------------------
     Network: fetch / JSONP and an in-memory cache
     ------------------------------------------------------------------ */
  var CACHE = new Map();
  var CACHE_MAX = 300;

  function memo(key, make) {
    if (CACHE.has(key)) return CACHE.get(key);
    var p = Promise.resolve().then(make);
    CACHE.set(key, p);
    if (CACHE.size > CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
    p.catch(function () { if (CACHE.get(key) === p) CACHE.delete(key); });
    return p;
  }

  function getJSON(url, o) {
    o = o || {};
    var f = o.fetch || API.fetch || G.fetch;
    if (typeof f !== 'function') return Promise.reject(err('network', 'fetch is not available'));
    return Promise.resolve()
      .then(function () { return f.call(G, url, { headers: { Accept: 'application/json' }, signal: o.signal }); })
      .then(function (res) {
        if (res.status === 404) return null;
        if (!res.ok) throw err('http', 'HTTP ' + res.status + ' for ' + url);
        return res.json();
      }, function (e) {
        if (e && e.name === 'AbortError') throw e;
        throw err('network', 'Request failed: ' + url, e);
      });
  }

  var jsonpSeq = 0;
  function jsonp(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (!HAS_DOM) return reject(err('network', 'JSONP needs a document'));
      var name = '__leJsonp' + (++jsonpSeq) + Math.random().toString(36).slice(2, 8);
      var s = document.createElement('script');
      var done = false;
      var timer = setTimeout(function () { finish(err('network', 'JSONP timeout: ' + url)); }, timeoutMs || 8000);
      function finish(e, v) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { delete G[name]; } catch (x) { G[name] = undefined; }
        if (s.parentNode) s.parentNode.removeChild(s);
        if (e) reject(e); else resolve(v);
      }
      G[name] = function (data) { finish(null, data); };
      s.onerror = function () { finish(err('network', 'JSONP failed: ' + url)); };
      s.src = url + (url.indexOf('?') < 0 ? '?' : '&') + 'callback=' + name;
      (document.head || document.documentElement).appendChild(s);
    });
  }

  /* ------------------------------------------------------------------
     iTunes preview helper
     ------------------------------------------------------------------ */
  var NOT_ORIGINAL = /\b(karaoke|instrumental|cover|tribute|8-bit|lullaby|piano version|made famous|originally performed|in the style of)\b/;

  function scoreItunes(item, artist, title) {
    if (!item || !item.previewUrl) return -1;
    var ts = similarity(cleanTitle(title), cleanTitle(item.trackName));
    var as = artistSimilarity(artist, item.artistName || '');
    if (ts < 0.6 || as < 0.5) return -1;
    var score = 0.6 * ts + 0.4 * as;
    var wantedRaw = fold(title), gotRaw = fold(item.trackName) + ' ' + fold(item.collectionName) + ' ' + fold(item.artistName);
    if (NOT_ORIGINAL.test(gotRaw) && !NOT_ORIGINAL.test(wantedRaw)) score -= 0.3;
    if (/\blive\b/.test(fold(item.trackName)) && !/\blive\b/.test(wantedRaw)) score -= 0.1;
    if (/\b(remix|mix)\b/.test(fold(item.trackName)) && !/\b(remix|mix)\b/.test(wantedRaw)) score -= 0.1;
    return score;
  }

  /**
   * Find a 30-second preview.
   * → Promise<{ url, trackId, artwork, artist, title, album, duration, viewUrl } | null>
   */
  function itunesPreview(artist, title, o) {
    o = o || {};
    if (!artist || !title) return Promise.reject(new TypeError('itunesPreview(artist, title) needs both'));
    var country = o.country ? String(o.country) : '';
    return memo('itunes|' + loose(artist) + '|' + loose(title) + '|' + country, function () {
      var term = encodeURIComponent((artist + ' ' + cleanTitle(title)).trim());
      var url = 'https://itunes.apple.com/search?media=music&entity=song&limit=25&term=' + term +
        (country ? '&country=' + encodeURIComponent(country) : '');
      return getJSON(url, o)
        .catch(function (e) {
          if (o.jsonp === false || (e && e.code === 'http')) throw e;
          return jsonp(url, o.timeout);
        })
        .then(function (data) {
          var list = (data && Array.isArray(data.results)) ? data.results : [];
          var best = null, bestScore = -1;
          for (var i = 0; i < list.length; i++) {
            var s = scoreItunes(list[i], artist, title);
            if (s > bestScore) { bestScore = s; best = list[i]; }
          }
          if (!best || bestScore < 0) return null;
          var art = best.artworkUrl100 || best.artworkUrl60 || '';
          return {
            url: best.previewUrl,
            trackId: best.trackId,
            artwork: art ? art.replace(/\/\d+x\d+bb\./, '/600x600bb.') : null,
            artist: best.artistName,
            title: best.trackName,
            album: best.collectionName,
            duration: isNum(best.trackTimeMillis) ? best.trackTimeMillis / 1000 : null,
            viewUrl: best.trackViewUrl || null
          };
        });
    });
  }

  /* ------------------------------------------------------------------
     Lyrics sources
     A source is async (track, ctx) → { synced: [{t,text}] | LRC string | null,
                                        plain: string | null, duration }
     ------------------------------------------------------------------ */
  function makeLrclib(cfg) {
    cfg = cfg || {};
    var base = String(cfg.base || 'https://lrclib.net').replace(/\/+$/, '');
    var enc = encodeURIComponent;

    function matches(rec, track) {
      return rec &&
        similarity(cleanTitle(track.title), cleanTitle(rec.trackName || rec.name || '')) >= 0.55 &&
        artistSimilarity(track.artist, rec.artistName || '') >= 0.5;
    }

    /** Prefer synced; among those the record whose duration is closest to the track. */
    function choose(list, track) {
      var ok = (Array.isArray(list) ? list : []).filter(function (r) { return matches(r, track) && !r.instrumental; });
      var synced = ok.filter(function (r) { return r.syncedLyrics && String(r.syncedLyrics).trim(); });
      var pool = synced.length ? synced : ok.filter(function (r) { return r.plainLyrics; });
      if (!pool.length) return null;
      if (isNum(track.duration)) {
        pool = pool.slice().sort(function (a, b) {
          return Math.abs((a.duration || 0) - track.duration) - Math.abs((b.duration || 0) - track.duration);
        });
      }
      return pool[0];
    }

    function result(rec) {
      if (!rec) return { synced: null, plain: null, duration: null };
      var synced = rec.syncedLyrics ? parseLRC(rec.syncedLyrics) : null;
      return {
        synced: synced && synced.length ? synced : null,
        plain: rec.plainLyrics || null,
        duration: isNum(rec.duration) ? rec.duration : null,
        instrumental: !!rec.instrumental,
        id: rec.id
      };
    }

    function lrclib(track, ctx) {
      ctx = ctx || {};
      var who = 'artist_name=' + enc(track.artist) + '&track_name=' + enc(track.title);
      var get = who + (track.album ? '&album_name=' + enc(track.album) : '') +
        (isNum(track.duration) ? '&duration=' + Math.round(track.duration) : '');
      var failure = null, direct = null;
      function soft(e) { if (e && e.name === 'AbortError') throw e; failure = failure || e; return null; }

      return getJSON(base + '/api/get?' + get, ctx).catch(soft)
        .then(function (rec) {
          direct = rec && matches(rec, track) ? rec : null;
          if (direct && direct.syncedLyrics) return null;
          return getJSON(base + '/api/search?' + who, ctx).catch(soft);
        })
        .then(function (list) {
          if (direct && direct.syncedLyrics) return result(direct);
          var pick = choose(list, track);
          if (pick && pick.syncedLyrics) return result(pick);
          var q = track.artist + ' ' + cleanTitle(track.title);
          return getJSON(base + '/api/search?q=' + enc(q), ctx).catch(soft).then(function (more) {
            var p2 = choose((Array.isArray(list) ? list : []).concat(Array.isArray(more) ? more : []), track);
            var rec = (p2 && p2.syncedLyrics) ? p2 : (direct && direct.instrumental ? direct : (p2 || direct));
            if (!rec && failure && list == null && more == null) throw failure;
            return result(rec);
          });
        });
    }
    lrclib.sourceId = 'lrclib:' + base;
    return lrclib;
  }

  /** A source from your own LRC text: getText(track) → string | null | Promise. */
  function lrcText(getText) {
    function src(track) {
      return Promise.resolve(getText(track)).then(function (text) {
        var synced = text ? parseLRC(text) : [];
        return { synced: synced.length ? synced : null, plain: null, duration: null };
      });
    }
    return src;
  }

  var SRC_IDS = typeof WeakMap === 'function' ? new WeakMap() : null;
  var srcSeq = 0;
  function sourceId(fn) {
    if (fn.sourceId) return fn.sourceId;
    if (!SRC_IDS) return 'src';
    if (!SRC_IDS.has(fn)) SRC_IDS.set(fn, 'src' + (++srcSeq));
    return SRC_IDS.get(fn);
  }

  function resolveSource(s) {
    if (typeof s === 'function') return s;
    if (s === 'lrclib') return defaultLrclib;
    if (s && typeof s === 'object' && s.lrclib) return makeLrclib(s.lrclib);
    return null;
  }

  function runSources(track, sources) {
    var i = 0, plain = null, duration = null, firstErr = null, anyOk = false;
    var key = loose(track.artist) + '|' + loose(track.title) + '|' + loose(track.album || '') + '|' +
      (isNum(track.duration) ? Math.round(track.duration) : '');
    function step() {
      if (i >= sources.length) {
        if (!anyOk && firstErr) throw firstErr;
        return { synced: null, plain: plain, duration: duration, source: null };
      }
      var fn = resolveSource(sources[i++]);
      if (!fn) return step();
      var id = sourceId(fn);
      return memo('lyrics|' + id + '|' + key, function () { return fn(track, {}); })
        .then(function (r) {
          anyOk = true;
          if (!r) return step();
          var lines = normalizeLines(r.synced);
          if (lines.length) {
            return { synced: lines, plain: r.plain || null, duration: toNum(r.duration), source: id };
          }
          if (r.plain && !plain) { plain = String(r.plain); duration = toNum(r.duration); }
          return step();
        }, function (e) {
          firstErr = firstErr || e;
          return step();
        });
    }
    return Promise.resolve().then(step);
  }

  /* ------------------------------------------------------------------
     Offsets from a JSON file: { "Artist - Title": { "offset": 87.4, "confidence": 0.9 } }
     ------------------------------------------------------------------ */
  function offsetsFromJson(url, o) {
    o = o || {};
    var loading = null;
    function load() {
      if (!loading) {
        loading = getJSON(url, o).then(function (data) {
          var map = new Map();
          if (data && typeof data === 'object') {
            Object.keys(data).forEach(function (k) {
              var v = data[k];
              var off = isNum(v) ? v : (v && isNum(v.offset) ? v.offset : null);
              if (off == null) return;
              if (o.minConfidence && v && isNum(v.confidence) && v.confidence < o.minConfidence) return;
              map.set(loose(k), off);
            });
          }
          return map;
        });
        loading.catch(function () { loading = null; });
      }
      return loading;
    }
    return function (track) {
      return load().then(function (map) {
        var keys = [trackKey(track.artist, track.title), trackKey(track.artist, cleanTitle(track.title))];
        for (var i = 0; i < keys.length; i++) if (map.has(keys[i])) return map.get(keys[i]);
        return null;
      });
    };
  }

  /* ------------------------------------------------------------------
     Saved calibrations (localStorage, optional)
     ------------------------------------------------------------------ */
  var STORE_PREFIX = 'le:offset:';
  var store = {
    get: function (key) {
      try {
        var raw = G.localStorage && G.localStorage.getItem(STORE_PREFIX + key);
        if (!raw) return null;
        var v = JSON.parse(raw);
        return isNum(v && v.offset) ? v.offset : null;
      } catch (e) { return null; }
    },
    set: function (key, offset) {
      try { G.localStorage.setItem(STORE_PREFIX + key, JSON.stringify({ offset: offset, at: Date.now() })); } catch (e) { /* private mode, quota */ }
    },
    del: function (key) {
      try { G.localStorage.removeItem(STORE_PREFIX + key); } catch (e) { /* ignore */ }
    }
  };

  /* ------------------------------------------------------------------
     Web Audio: one graph per <audio>, shared by every engine.
     createMediaElementSource() works once per element and is permanent,
     and an element routed into a context while the media is cross-origin
     without CORS plays silence — so the engine only taps an element that
     has `crossOrigin` set, and only when its context is actually running.
     ------------------------------------------------------------------ */
  var GRAPH = typeof WeakMap === 'function' ? new WeakMap() : null;

  function tapElement(audio) {
    if (!GRAPH) return;
    var AC = G.AudioContext || G.webkitAudioContext;
    var rec = { pending: true, analyser: null, failed: false };
    GRAPH.set(audio, rec);
    if (!AC) { rec.pending = false; rec.failed = true; return; }
    var ctx;
    try { ctx = new AC(); } catch (e) { rec.pending = false; rec.failed = true; return; }
    var resumed = ctx.state === 'running' ? Promise.resolve() : Promise.resolve().then(function () { return ctx.resume(); });
    resumed.catch(noop).then(function () {
      rec.pending = false;
      if (ctx.state !== 'running') {
        rec.failed = true;
        try { ctx.close(); } catch (e) { /* ignore */ }
        return;
      }
      try {
        var src = ctx.createMediaElementSource(audio);
        var an = ctx.createAnalyser();
        an.fftSize = 512;
        an.smoothingTimeConstant = 0.6;
        src.connect(an);
        an.connect(ctx.destination);
        rec.ctx = ctx;
        rec.source = src;
        rec.analyser = an;
        // The routing outlives every engine, so the context must keep up with the element.
        audio.addEventListener('play', function () {
          if (ctx.state !== 'running' && ctx.resume) ctx.resume().catch(noop);
        });
      } catch (e) {
        rec.failed = true; // already routed by the page (InvalidStateError) or unsupported
        try { ctx.close(); } catch (x) { /* ignore */ }
      }
    });
  }

  /* ------------------------------------------------------------------
     Themes
     ------------------------------------------------------------------ */
  var THEMES = {
    // No background: words and particles straight over the page.
    clean: {
      background: 'transparent',
      text: '#e2677d',
      shadow: '0 1px 2px rgba(0, 0, 0, 0.35), 0 0 18px rgba(0, 0, 0, 0.22)',
      wave: '#e2677d',
      particle: '#e8c547',
      particles: 26,
      grain: 0,
      vignette: 0,
      ui: '#1b1b1b',
      uiBackground: 'rgba(255, 255, 255, 0.88)',
      font: 'inherit',
      weight: 500,
      size: 1
    },
    // The full-screen "video" look: dark backdrop, grain, vignette.
    'dark-grain': {
      background: 'radial-gradient(120% 95% at 50% 42%, #2b2320 0%, #16110f 55%, #080605 100%)',
      text: '#e2677d',
      shadow: '0 0 18px rgba(226, 103, 125, 0.35)',
      wave: '#e2677d',
      particle: '#e8c547',
      particles: 26,
      grain: 0.32,
      vignette: 0.88,
      ui: '#f2e6db',
      uiBackground: 'rgba(22, 17, 15, 0.74)',
      font: '"Helvetica Neue", Helvetica, Arial, system-ui, sans-serif',
      weight: 500,
      size: 1
    },
    // No background, no particles, the site's own text colour and font.
    minimal: {
      background: 'transparent',
      text: 'currentColor',
      shadow: 'none',
      wave: 'currentColor',
      particle: 'currentColor',
      particles: 0,
      grain: 0,
      vignette: 0,
      ui: '#1b1b1b',
      uiBackground: 'rgba(255, 255, 255, 0.88)',
      font: 'inherit',
      weight: 'inherit',
      size: 1
    }
  };

  function isTransparent(theme) {
    var b = String(theme.background == null ? '' : theme.background).replace(/\s+/g, '').toLowerCase();
    return !b || b === 'transparent' || b === 'none' || /^rgba\([^)]*,0(\.0*)?\)$/.test(b) || /^#[0-9a-f]{6}00$/.test(b);
  }

  function resolveTheme(t) {
    if (typeof t === 'string') return Object.assign({ name: t }, THEMES[t] || THEMES.clean);
    if (t && typeof t === 'object') {
      var base = THEMES[t.extends] || THEMES.clean;
      return Object.assign({ name: 'custom' }, base, t);
    }
    return Object.assign({ name: 'clean' }, THEMES.clean);
  }

  /* ------------------------------------------------------------------
     UI strings
     ------------------------------------------------------------------ */
  var LABELS = {
    ru: {
      region: 'Текст песни',
      close: 'Закрыть текст песни',
      calibration: 'Калибровка текста',
      tune: 'Синхронизация текста',
      offset: 'Сдвиг',
      sec: 'с',
      earlier: '−0.5 с',
      later: '+0.5 с',
      earlierAria: 'Уменьшить сдвиг на 0,5 секунды: текст пойдёт позже',
      laterAria: 'Увеличить сдвиг на 0,5 секунды: текст пойдёт раньше',
      hear: 'Я слышу эту строку',
      hearAria: 'Я слышу строку: зафиксировать момент и выбрать строку из списка',
      reset: 'Сбросить',
      resetAria: 'Сбросить сохранённый сдвиг',
      pickTitle: 'Какая строка звучала на {time}?',
      cancel: 'Отмена',
      loading: 'Ищу текст…',
      noSync: 'Для этой песни нет текста с таймингами',
      error: 'Не удалось загрузить текст',
      noPreview: 'Превью недоступно',
      uncalibrated: 'Сдвиг неизвестен. Нажмите «Я слышу эту строку», когда начнётся строка',
      src: { none: 'не задан', given: 'задан', provider: 'из файла', saved: 'сохранён', manual: 'вручную', api: 'задан' }
    },
    en: {
      region: 'Song lyrics',
      close: 'Close lyrics',
      calibration: 'Lyrics calibration',
      tune: 'Lyrics sync',
      offset: 'Offset',
      sec: 's',
      earlier: '−0.5 s',
      later: '+0.5 s',
      earlierAria: 'Decrease offset by 0.5 seconds: lyrics come later',
      laterAria: 'Increase offset by 0.5 seconds: lyrics come earlier',
      hear: 'I hear this line',
      hearAria: 'I hear a line: mark this moment and pick the line from the list',
      reset: 'Reset',
      resetAria: 'Forget the saved offset',
      pickTitle: 'Which line was playing at {time}?',
      cancel: 'Cancel',
      loading: 'Looking for lyrics…',
      noSync: 'No time-synced lyrics for this song',
      error: 'Could not load lyrics',
      noPreview: 'No preview available',
      uncalibrated: 'Offset unknown. Press “I hear this line” when a line starts',
      src: { none: 'unset', given: 'set', provider: 'from file', saved: 'saved', manual: 'manual', api: 'set' }
    }
  };

  function pickLabels(lang, extra) {
    if (!lang && HAS_DOM && document.documentElement) lang = document.documentElement.lang;
    var base = /^ru\b/i.test(lang || '') ? LABELS.ru : LABELS.en;
    var out = Object.assign({}, base, extra || {});
    out.src = Object.assign({}, base.src, (extra && extra.src) || {});
    return out;
  }

  /* ------------------------------------------------------------------
     Styles (injected once, reference-counted)
     ------------------------------------------------------------------ */
  var NOISE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .6 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

  var CSS = [
    '.le-root{--le-scale:1;position:relative;overflow:hidden;isolation:isolate;box-sizing:border-box;',
    'background:var(--le-bg);color:var(--le-text);font-family:var(--le-font);font-weight:var(--le-weight);',
    'line-height:1.15;text-align:left;contain:layout paint;container-type:size;-webkit-font-smoothing:antialiased;}',
    '.le-root[hidden]{display:none!important}',
    '.le-root *,.le-root *::before,.le-root *::after{box-sizing:border-box;margin:0;padding:0}',
    '.le-overlay{position:fixed;inset:0;z-index:2147483000;overscroll-behavior:contain}',
    '.le-pass{pointer-events:none}.le-pass button,.le-pass .le-pick{pointer-events:auto}',
    '.le-inline{width:100%;height:100%;min-height:240px;border-radius:inherit}',
    '.le-fx,.le-grain,.le-vig,.le-stage{position:absolute;inset:0;pointer-events:none}',
    '.le-fx{width:100%;height:100%}',
    '.le-grain{inset:-60px;background-image:' + NOISE + ';background-size:180px 180px;opacity:var(--le-grain);mix-blend-mode:overlay}',
    '.le-playing .le-grain{animation:le-grain .7s steps(6) infinite}',
    '.le-vig{background:radial-gradient(ellipse 75% 70% at 50% 46%,transparent 38%,rgba(0,0,0,var(--le-vignette)) 100%)}',
    '.le-word{position:absolute;left:0;top:0;white-space:nowrap;color:var(--le-text);letter-spacing:-.01em;',
    'font-size:calc(clamp(20px,6.4vmin,76px)*var(--le-scale)*var(--le-size,1));font-size:calc(clamp(20px,7.5cqmin,76px)*var(--le-scale)*var(--le-size,1));',
    'text-shadow:var(--le-shadow,none);transform:rotate(var(--le-rot,0deg));will-change:transform,opacity,filter;',
    'animation:le-in .6s cubic-bezier(.2,.75,.25,1) both}',
    '.le-word.le-now{animation:none}',
    '.le-word.le-out{animation:le-out .45s ease forwards}',
    '.le-line{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(88%,900px);text-align:center;',
    'color:var(--le-text);text-shadow:var(--le-shadow,none);font-size:calc(clamp(20px,5vmin,48px)*var(--le-size,1));'+
    'font-size:calc(clamp(20px,6cqmin,48px)*var(--le-size,1));overflow-wrap:anywhere}',
    '.le-wave{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;opacity:0;transition:opacity .5s ease}',
    '.le-gap .le-wave{opacity:1}',
    '.le-hint{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:min(86%,520px);text-align:center;',
    'font-size:14px;line-height:1.4;color:var(--le-ui);background:var(--le-ui-bg);padding:8px 14px;border-radius:12px;opacity:.9;pointer-events:none}',
    '.le-hint:empty{display:none}',
    '.le-sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}',
    '.le-root button{font:inherit;font-size:13px;font-weight:500;line-height:1;color:var(--le-ui);background:var(--le-ui-bg);',
    'border:1px solid color-mix(in srgb,var(--le-ui) 22%,transparent);border-radius:999px;padding:9px 14px;cursor:pointer;',
    'min-height:36px;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);transition:border-color .2s,background .2s}',
    '.le-root button:hover{border-color:color-mix(in srgb,var(--le-ui) 55%,transparent)}',
    '.le-root button:focus-visible{outline:2px solid var(--le-text);outline-offset:2px}',
    '.le-root .le-close{position:absolute;top:12px;right:12px;width:44px;height:44px;padding:0;display:grid;place-items:center;z-index:3}',
    '.le-root .le-tune{position:absolute;top:12px;right:64px;width:44px;height:44px;padding:0;display:grid;place-items:center;z-index:3}',
    '.le-root .le-tune.le-solo{right:12px}',
    '.le-close svg,.le-tune svg{width:18px;height:18px;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round}',
    '.le-bar{position:absolute;left:12px;right:12px;bottom:12px;display:flex;flex-wrap:wrap;gap:8px;justify-content:center;align-items:center;z-index:2}',
    '.le-bar[hidden],.le-pick[hidden],.le-root button[hidden]{display:none}',
    '.le-readout{font-size:12px;color:var(--le-ui);opacity:.75;padding:0 6px;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.le-pick{position:absolute;left:12px;right:12px;bottom:12px;max-height:min(62%,420px);display:flex;flex-direction:column;',
    'background:var(--le-ui-bg);color:var(--le-ui);border:1px solid color-mix(in srgb,var(--le-ui) 20%,transparent);border-radius:16px;',
    '-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);z-index:4;overflow:hidden}',
    '.le-pick-head{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:10px 10px 8px 16px;font-size:14px}',
    '.le-pick ol{list-style:none;overflow:auto;padding:0 8px 8px;overscroll-behavior:contain}',
    '.le-root .le-pick li button{display:flex;gap:12px;width:100%;text-align:left;border-radius:10px;border-color:transparent;background:transparent;',
    'padding:9px 10px;line-height:1.3;-webkit-backdrop-filter:none;backdrop-filter:none}',
    '.le-root .le-pick li button:hover,.le-root .le-pick li button.le-guess{background:color-mix(in srgb,var(--le-ui) 12%,transparent)}',
    '.le-pick time{opacity:.55;font-variant-numeric:tabular-nums;min-width:3.2em}',
    '@keyframes le-in{from{opacity:0;filter:blur(14px);transform:translateY(18px) rotate(var(--le-rot,0deg))}',
    'to{opacity:1;filter:blur(0);transform:translateY(0) rotate(var(--le-rot,0deg))}}',
    '@keyframes le-out{from{opacity:1;filter:blur(0)}to{opacity:0;filter:blur(12px)}}',
    '@keyframes le-grain{0%{transform:translate(0,0)}20%{transform:translate(-18px,12px)}40%{transform:translate(14px,-20px)}',
    '60%{transform:translate(-10px,-8px)}80%{transform:translate(20px,16px)}100%{transform:translate(0,0)}}',
    '.le-reduced .le-word,.le-reduced .le-wave,.le-reduced .le-grain{animation:none!important;transition:none!important;filter:none!important}',
    '.le-reduced .le-word{transform:none}',
    '@media (max-width:420px){.le-root button{font-size:12px;padding:8px 11px}.le-readout{width:100%;text-align:center}}'
  ].join('');

  var styleUsers = 0;
  function useStyles() {
    if (!HAS_DOM) return;
    styleUsers++;
    if (document.getElementById('le-styles')) return;
    var s = document.createElement('style');
    s.id = 'le-styles';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }
  function releaseStyles() {
    if (!HAS_DOM || styleUsers <= 0) return;
    styleUsers--;
    if (!styleUsers) {
      var s = document.getElementById('le-styles');
      if (s && s.parentNode) s.parentNode.removeChild(s);
    }
  }

  function el(tag, cls, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    return e;
  }

  /* ------------------------------------------------------------------
     Engine
     ------------------------------------------------------------------ */
  var STATES = ['idle', 'loading', 'ready', 'no-sync', 'error'];
  var defaultLrclib = makeLrclib();

  function normTrack(track) {
    if (!track || typeof track !== 'object') throw new TypeError('LyricsEngine: track { artist, title } is required');
    var artist = String(track.artist == null ? '' : track.artist).trim();
    var title = String(track.title == null ? '' : track.title).trim();
    if (!artist || !title) throw new TypeError('LyricsEngine: track.artist and track.title are required');
    return {
      artist: artist,
      title: title,
      album: track.album ? String(track.album) : undefined,
      duration: toNum(track.duration) != null && track.duration > 0 ? Number(track.duration) : undefined,
      offset: toNum(track.offset) != null ? Number(track.offset) : undefined
    };
  }

  function resolveEl(x, what) {
    if (typeof x === 'string') {
      if (!HAS_DOM) throw new TypeError('LyricsEngine: ' + what + ' selector needs a document');
      var found = document.querySelector(x);
      if (!found) throw new TypeError('LyricsEngine: ' + what + ' "' + x + '" not found');
      return found;
    }
    return x;
  }

  function Engine(opts) {
    var audio = resolveEl(opts.audio, 'audio');
    if (!audio || typeof audio.addEventListener !== 'function' || !('currentTime' in audio)) {
      throw new TypeError('LyricsEngine.create: options.audio must be an HTMLAudioElement');
    }
    this._audio = audio;
    this._container = opts.container ? resolveEl(opts.container, 'container') : null;
    this._overlay = !this._container;
    this._track = normTrack(opts.track);
    this._initialOffset = toNum(opts.offset);
    this._provider = typeof opts.offsetProvider === 'function' ? opts.offsetProvider : null;
    this._sources = Array.isArray(opts.sources) && opts.sources.length ? opts.sources.slice() : [defaultLrclib];
    this._theme = resolveTheme(opts.theme);
    this._onState = typeof opts.onState === 'function' ? opts.onState : null;
    this._analyserOpt = opts.analyser === undefined ? undefined : opts.analyser;
    this._calibration = opts.calibration === false ? false : opts.calibration === true ? true : 'auto';
    this._closeOpt = opts.closeButton !== false;
    this._transparent = isTransparent(this._theme);
    this._modal = this._overlay && (opts.modal != null ? !!opts.modal : !this._transparent);
    this._barOpen = null;
    this._autoload = opts.autoload !== false;
    this._labels = pickLabels(opts.lang, opts.labels);

    this._state = 'idle';
    this._ev = {};
    this._lines = [];
    this._plain = null;
    this._duration = null;
    this._offset = 0;
    this._offsetSource = 'none';
    this._pinned = null;
    this._firstFull = 0;
    this._token = 0;
    this._open = false;
    this._destroyed = false;
    this._root = null;
    this._unbind = [];
    this._timers = [];
    this._raf = 0;
    this._lastTs = 0;
    this._lastSong = NaN;
    this._phase = 'none';
    this._idx = -1;
    this._words = [];
    this._times = [];
    this._shown = 0;
    this._wordEls = [];
    this._rects = [];
    this._lineEl = null;
    this._hintText = null;
    this._liveText = '';
    this._pickAt = null;
    this._an = undefined;
    this._anLive = false;
    this._anDead = false;
    this._anZero = 0;
    this._hist = null;
    this._wacc = 0;
    this._wpeak = 0;
    this._particles = [];
    this._w = 0;
    this._h = 0;
    this._dpr = 1;
    this._insets = { l: 16, r: 16, t: 16, b: 16 };
    this._reduced = false;

    var self = this;
    this._frameFn = function (ts) { self._frame(ts); };

    if (opts.on && typeof opts.on === 'object') {
      Object.keys(opts.on).forEach(function (k) { self.on(k, opts.on[k]); });
    }
    if (this._autoload) this._load();
  }

  Object.defineProperty(Engine.prototype, 'state', { get: function () { return this._state; } });
  Object.defineProperty(Engine.prototype, 'track', { get: function () { return Object.assign({}, this._track); } });
  Object.defineProperty(Engine.prototype, 'lines', { get: function () { return this._lines.slice(); } });
  Object.defineProperty(Engine.prototype, 'offsetSource', { get: function () { return this._offsetSource; } });
  Object.defineProperty(Engine.prototype, 'isOpen', { get: function () { return this._open; } });

  /* ---------------- events ---------------- */

  Engine.prototype.on = function (type, fn) {
    if (typeof fn !== 'function') return noop;
    (this._ev[type] || (this._ev[type] = [])).push(fn);
    var self = this;
    return function () { self.off(type, fn); };
  };

  Engine.prototype.off = function (type, fn) {
    var list = this._ev[type];
    if (!list) return this;
    var i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
    return this;
  };

  Engine.prototype._emit = function (type, detail) {
    var list = (this._ev[type] || []).slice();
    for (var i = 0; i < list.length; i++) {
      try { list[i].call(this, detail); } catch (e) { setTimeout(function () { throw e; }, 0); }
    }
  };

  Engine.prototype._setState = function (s) {
    if (s === this._state || STATES.indexOf(s) < 0) return;
    this._state = s;
    if (this._root) {
      this._root.setAttribute('data-le-state', s);
      this._paintBar();
      this._paintHint();
    }
    if (this._onState) {
      try { this._onState(s, this); } catch (e) { setTimeout(function () { throw e; }, 0); }
    }
    this._emit('state', s);
  };

  /* ---------------- public API ---------------- */

  Engine.prototype.open = function () {
    if (this._destroyed) return this;
    if (!HAS_DOM) throw new Error('LyricsEngine: open() needs a browser document');
    this._build();
    if (this._open) return this;
    this._open = true;
    this._root.hidden = false;
    this._bindOpen();
    if (this._state === 'idle') this._load();
    this._paintBar();
    this._measure();
    this._tick(true);
    this._drawFx(0);
    this._drawWave(0, false);
    this._root.classList.toggle('le-playing', this._playing());
    if (this._modal) {
      this._prevFocus = document.activeElement;
      try { this._closeBtn.focus({ preventScroll: true }); } catch (e) { this._closeBtn.focus(); }
    }
    this._loop();
    return this;
  };

  Engine.prototype.close = function () {
    if (!this._open) return this;
    this._open = false;
    this._stop();
    this._unbindOpen();
    this._closePicker();
    this._clearScene(true);
    this._phase = 'none';
    this._idx = -1;
    this._root.classList.remove('le-playing', 'le-gap');
    var hadFocus = this._root.contains(document.activeElement);
    this._root.hidden = true;
    if (this._modal && hadFocus && this._prevFocus && this._prevFocus.focus && this._prevFocus.isConnected) {
      try { this._prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    this._prevFocus = null;
    return this;
  };

  Engine.prototype.destroy = function () {
    if (this._destroyed) return;
    this.close();
    this._destroyed = true;
    this._token++;
    this._timers.forEach(function (t) { clearTimeout(t.id); });
    this._timers = [];
    if (this._root) {
      if (this._root.parentNode) this._root.parentNode.removeChild(this._root);
      this._root = null;
      releaseStyles();
    }
    this._ev = {};
    this._lines = [];
    this._plain = null;
    this._particles = [];
    this._onState = null;
  };

  Engine.prototype.setTrack = function (track) {
    if (this._destroyed) return this;
    this._track = normTrack(track);
    this._initialOffset = null;
    this._pinned = null;
    this._barOpen = null;
    this._resetAnalyserGuess();
    this._closePicker();
    if (this._open || this._autoload) {
      this._load();
    } else {
      this._token++;
      this._lines = [];
      this._setState('idle');
    }
    return this;
  };

  Engine.prototype.setOffset = function (sec) {
    var v = toNum(sec);
    if (v == null) throw new TypeError('LyricsEngine.setOffset: seconds must be a number');
    if (this._destroyed) return this;
    this._pinned = v;
    this._applyOffset(v, 'api', false);
    return this;
  };

  Engine.prototype.getOffset = function () { return this._offset; };

  /** Map preview time `audioTime` to line `index` (what "I hear this line" does). */
  Engine.prototype.calibrate = function (index, audioTime) {
    var line = this._lines[index];
    if (!line) return this;
    var at = toNum(audioTime);
    if (at == null) at = this._audio.currentTime || 0;
    this._pinned = null;
    this._applyOffset(line.t - at, 'manual', true);
    return this;
  };

  /** Forget the saved calibration for this track and fall back to the configured offset. */
  Engine.prototype.resetOffset = function () {
    store.del(trackKey(this._track.artist, this._track.title));
    this._pinned = null;
    var self = this, token = this._token;
    this._resolveOffset(this._track, true).then(function (o) {
      if (token === self._token) self._applyOffset(o.value, o.source, false);
    });
    return this;
  };

  /* ---------------- loading ---------------- */

  Engine.prototype._load = function () {
    var token = ++this._token;
    var track = this._track;
    var self = this;
    this._lines = [];
    this._plain = null;
    this._duration = null;
    this._clearScene(true);
    this._phase = 'none';
    this._idx = -1;
    this._setState('loading');
    this._paintHint();

    var lyrics = runSources(track, this._sources);
    var offset = this._resolveOffset(track, false);

    return Promise.all([lyrics, offset]).then(function (r) {
      if (token !== self._token) return;
      var res = r[0], off = r[1];
      self._duration = res.duration || track.duration || null;
      if (res.synced && res.synced.length) {
        self._lines = res.synced;
        self._applyOffset(off.value, off.source, false, true);
        self._setState('ready');
        self._emit('ready', {
          lines: self._lines.length,
          offset: self._offset,
          offsetSource: self._offsetSource,
          source: res.source
        });
        self._measure();
        self._tick(true);
        self._loop();
      } else {
        self._plain = res.plain || null;
        self._applyOffset(off.value, off.source, false, true);
        self._setState('no-sync');
      }
    }, function (e) {
      if (token !== self._token) return;
      self._setState('error');
      self._emit('error', {
        code: (e && e.code) || 'network',
        message: (e && e.message) || String(e),
        error: e,
        fatal: true
      });
    });
  };

  /**
   * Offset priority: setOffset() for this track → saved manual calibration →
   * track.offset / options.offset → offsetProvider → none (0, auto hint only).
   */
  Engine.prototype._resolveOffset = function (track, skipSaved) {
    if (this._pinned != null) return Promise.resolve({ value: this._pinned, source: 'api' });
    var saved = skipSaved ? null : store.get(trackKey(track.artist, track.title));
    if (saved != null) return Promise.resolve({ value: saved, source: 'saved' });
    var given = track.offset != null ? track.offset : this._initialOffset;
    if (given != null) return Promise.resolve({ value: given, source: 'given' });
    if (!this._provider) return Promise.resolve({ value: 0, source: 'none' });
    var self = this;
    return Promise.resolve()
      .then(function () { return self._provider(Object.assign({}, track)); })
      .then(function (v) {
        var n = toNum(v);
        return n == null ? { value: 0, source: 'none' } : { value: n, source: 'provider' };
      }, function (e) {
        self._emit('error', { code: 'offset-provider', message: (e && e.message) || String(e), error: e, fatal: false });
        return { value: 0, source: 'none' };
      });
  };

  Engine.prototype._applyOffset = function (value, source, save, quiet) {
    var v = round(Math.max(0, value), 3);
    var changed = v !== this._offset || source !== this._offsetSource;
    this._offset = v;
    this._offsetSource = source;
    this._firstFull = firstFullLine(this._lines, v);
    if (save) store.set(trackKey(this._track.artist, this._track.title), v);
    this._paintBar();
    if (changed) this._emit('offsetchange', { offset: v, source: source });
    if (!quiet) this._tick(true);
  };

  /* ---------------- DOM ---------------- */

  Engine.prototype._build = function () {
    if (this._root) return;
    useStyles();
    var L = this._labels, th = this._theme, self = this;
    var root = el('div', 'le-root ' + (this._overlay ? 'le-overlay' : 'le-inline'));
    root.hidden = true;
    root.setAttribute('data-le-state', this._state);
    if (this._modal) {
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
    } else {
      root.setAttribute('role', 'region');
    }
    if (this._transparent) root.classList.add('le-pass');
    root.setAttribute('aria-label', L.region + ': ' + this._track.artist + ' — ' + this._track.title);
    var inherit = function (v) { return v == null || v === '' || v === 'inherit' ? null : String(v); };
    var vars = {
      '--le-bg': th.background, '--le-text': th.text, '--le-shadow': th.shadow, '--le-ui': th.ui,
      '--le-ui-bg': th.uiBackground, '--le-font': inherit(th.font), '--le-weight': inherit(th.weight),
      '--le-grain': String(th.grain || 0), '--le-vignette': String(th.vignette || 0),
      '--le-size': String(toNum(th.size) || 1)
    };
    // unset font/weight vars make the properties inherit the site's own
    Object.keys(vars).forEach(function (k) { if (vars[k] != null) root.style.setProperty(k, vars[k]); });

    this._fx = el('canvas', 'le-fx', { 'aria-hidden': 'true' });
    var grain = el('div', 'le-grain', { 'aria-hidden': 'true' });
    var vig = el('div', 'le-vig', { 'aria-hidden': 'true' });
    this._stage = el('div', 'le-stage', { 'aria-hidden': 'true' });
    this._wave = el('canvas', 'le-wave', { 'aria-hidden': 'true' });
    this._live = el('p', 'le-sr', { 'aria-live': 'polite', 'aria-atomic': 'true' });
    this._hint = el('p', 'le-hint');

    this._closeBtn = el('button', 'le-close', { type: 'button', 'aria-label': L.close });
    this._closeBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    this._closeBtn.addEventListener('click', function () { self.close(); });
    this._closeBtn.hidden = !this._closeOpt;

    this._tuneBtn = el('button', 'le-tune' + (this._closeOpt ? '' : ' le-solo'), { type: 'button', 'aria-label': L.tune, 'aria-expanded': 'false' });
    this._tuneBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>';
    this._tuneBtn.addEventListener('click', function () {
      self._barOpen = !self._barVisible();
      self._paintBar();
    });

    var bar = this._bar = el('div', 'le-bar', { role: 'group', 'aria-label': L.calibration });
    this._readout = el('span', 'le-readout', { 'aria-live': 'off' });
    var minus = el('button', '', { type: 'button', 'aria-label': L.earlierAria });
    minus.textContent = L.earlier;
    minus.addEventListener('click', function () { self._nudge(-0.5); });
    var plus = el('button', '', { type: 'button', 'aria-label': L.laterAria });
    plus.textContent = L.later;
    plus.addEventListener('click', function () { self._nudge(0.5); });
    var hear = el('button', '', { type: 'button', 'aria-label': L.hearAria });
    hear.textContent = L.hear;
    hear.addEventListener('click', function () { self._openPicker(); });
    this._resetBtn = el('button', '', { type: 'button', 'aria-label': L.resetAria });
    this._resetBtn.textContent = L.reset;
    this._resetBtn.addEventListener('click', function () { self.resetOffset(); });
    bar.appendChild(this._readout);
    bar.appendChild(minus);
    bar.appendChild(plus);
    bar.appendChild(hear);
    bar.appendChild(this._resetBtn);

    this._pick = el('div', 'le-pick', { role: 'group' });
    this._pick.hidden = true;

    [this._fx, th.grain > 0 ? grain : null, th.vignette > 0 ? vig : null, this._stage, this._wave, this._hint,
      this._live, bar, this._pick, this._tuneBtn, this._closeBtn]
      .forEach(function (c) { if (c) root.appendChild(c); });

    this._root = root;
    (this._container || document.body).appendChild(root);
    this._fxCtx = this._fx.getContext ? this._fx.getContext('2d') : null;
    this._waveCtx = this._wave.getContext ? this._wave.getContext('2d') : null;
    this._paintBar();
    this._paintHint();
  };

  Engine.prototype._on = function (target, type, fn, opt) {
    target.addEventListener(type, fn, opt);
    this._unbind.push(function () { target.removeEventListener(type, fn, opt); });
  };

  Engine.prototype._bindOpen = function () {
    var self = this, a = this._audio;
    this._on(a, 'play', function () {
      var g = GRAPH && GRAPH.get(a);
      if (g && g.ctx && g.ctx.state !== 'running') g.ctx.resume().catch(noop);
      self._root.classList.add('le-playing');
      self._loop();
    });
    this._on(a, 'playing', function () { self._loop(); });
    var halt = function () {
      self._stop();
      self._root.classList.remove('le-playing');
      self._tick(false);
      self._drawWave(0, false);
    };
    this._on(a, 'pause', halt);
    this._on(a, 'ended', halt);
    var jump = function () { self._tick(true); if (!self._playing()) self._drawWave(0, false); };
    this._on(a, 'seeking', jump);
    this._on(a, 'seeked', jump);
    this._on(a, 'timeupdate', function () { if (!self._raf) self._tick(false); });
    this._on(a, 'emptied', function () {
      self._resetAnalyserGuess();
      self._clearScene(true);
      self._phase = 'none';
      self._idx = -1;
      self._tick(true);
    });
    this._on(a, 'loadedmetadata', function () { self._paintHint(); });

    this._on(this._overlay ? document : this._root, 'keydown', function (e) { self._onKey(e); }, this._modal);

    if (G.matchMedia) {
      var mql = G.matchMedia('(prefers-reduced-motion: reduce)');
      var apply = function () {
        var r = !!mql.matches;
        if (r === self._reduced) return;
        self._reduced = r;
        self._root.classList.toggle('le-reduced', r);
        self._tick(true);
        self._drawFx(0);
        self._drawWave(0, false);
      };
      this._reduced = !mql.matches; // force apply()
      apply();
      if (mql.addEventListener) this._on(mql, 'change', apply);
      else if (mql.addListener) { mql.addListener(apply); this._unbind.push(function () { mql.removeListener(apply); }); }
    }

    var onResize = function () { self._later('resize', 80, function () { self._measure(true); }); };
    if (typeof G.ResizeObserver === 'function') {
      var ro = new G.ResizeObserver(onResize);
      ro.observe(this._root);
      this._unbind.push(function () { ro.disconnect(); });
    } else {
      this._on(G, 'resize', onResize);
    }
  };

  Engine.prototype._unbindOpen = function () {
    var list = this._unbind;
    this._unbind = [];
    for (var i = 0; i < list.length; i++) { try { list[i](); } catch (e) { /* ignore */ } }
  };

  /** setTimeout tracked for destroy(); a named timer replaces the previous one. */
  Engine.prototype._later = function (name, ms, fn) {
    var self = this;
    if (name) {
      this._timers = this._timers.filter(function (t) {
        if (t.name === name) { clearTimeout(t.id); return false; }
        return true;
      });
    }
    var rec = { name: name, id: 0 };
    rec.id = setTimeout(function () {
      self._timers = self._timers.filter(function (t) { return t !== rec; });
      if (!self._destroyed) fn();
    }, ms);
    this._timers.push(rec);
  };

  Engine.prototype._onKey = function (e) {
    if (!this._open) return;
    if (e.key === 'Escape' || e.key === 'Esc') {
      if (this._modal) {
        e.stopPropagation();
        e.preventDefault();
      }
      if (!this._pick.hidden) this._closePicker(true);
      else this.close();
      return;
    }
    if (e.key === 'Tab' && this._modal) {
      var f = Array.prototype.filter.call(this._root.querySelectorAll('button'), function (b) {
        return !b.hidden && b.offsetParent !== null;
      });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1], active = document.activeElement;
      if (!this._root.contains(active)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }
  };

  /** 'auto': open while the offset is unknown, otherwise behind the tune button. */
  Engine.prototype._barVisible = function () {
    if (!this._calibration || this._state !== 'ready') return false;
    if (this._calibration === true) return true;
    return this._barOpen != null ? this._barOpen : this._offsetSource === 'none';
  };

  Engine.prototype._paintBar = function () {
    if (!this._root) return;
    var show = this._barVisible() && this._pick.hidden;
    var changed = this._bar.hidden === show;
    this._bar.hidden = !show;
    this._tuneBtn.hidden = !(this._calibration === 'auto' && this._state === 'ready');
    this._tuneBtn.setAttribute('aria-expanded', show ? 'true' : 'false');
    if (changed && this._open) {
      var self = this;
      this._later('resize', 0, function () { self._measure(true); });
    }
    var L = this._labels;
    this._readout.textContent = L.offset + ' ' + this._offset.toFixed(1) + ' ' + L.sec +
      ' · ' + (L.src[this._offsetSource] || this._offsetSource);
    this._resetBtn.hidden = this._offsetSource !== 'saved' && this._offsetSource !== 'manual';
  };

  Engine.prototype._paintHint = function (phase) {
    if (!this._root) return;
    var L = this._labels, a = this._audio, text = '';
    if (this._state === 'loading') text = L.loading;
    else if (this._state === 'no-sync') text = L.noSync;
    else if (this._state === 'error') text = L.error;
    else if (this._state === 'ready') {
      var hasSrc = !!(a.currentSrc || a.src || (a.querySelector && a.querySelector('source[src]')));
      if (!hasSrc || a.error) text = L.noPreview;
      else if ((phase || this._phase) === 'out' && this._offsetSource === 'none' && this._calibration) text = L.uncalibrated;
    }
    if (text !== this._hintText) {
      this._hintText = text;
      this._hint.textContent = text;
    }
  };

  /* ---------------- calibration ---------------- */

  Engine.prototype._nudge = function (d) {
    this._barOpen = true; // keep the bar under the user's finger while they tune
    this._pinned = null;
    this._applyOffset(this._offset + d, 'manual', true);
  };

  Engine.prototype._openPicker = function () {
    if (!this._lines.length) return;
    this._barOpen = true;
    var self = this, L = this._labels;
    var at = this._pickAt = this._audio.currentTime || 0;
    var guess = findLine(this._lines, at + this._offset);
    var pick = this._pick;
    pick.textContent = '';
    var head = el('div', 'le-pick-head');
    var title = el('span');
    title.id = 'le-pick-' + Math.random().toString(36).slice(2, 9);
    title.textContent = L.pickTitle.replace('{time}', fmtTime(at));
    pick.setAttribute('aria-labelledby', title.id);
    var cancel = el('button', '', { type: 'button' });
    cancel.textContent = L.cancel;
    cancel.addEventListener('click', function () { self._closePicker(true); });
    head.appendChild(title);
    head.appendChild(cancel);
    var list = el('ol');
    var focusBtn = null;
    this._lines.forEach(function (line, i) {
      if (isBreak(line.text)) return;
      var li = el('li');
      var b = el('button', i === guess ? 'le-guess' : '', { type: 'button' });
      var tm = el('time');
      tm.textContent = fmtTime(line.t);
      var tx = el('span');
      tx.textContent = line.text;
      b.appendChild(tm);
      b.appendChild(tx);
      b.addEventListener('click', function () {
        self.calibrate(i, self._pickAt);
        self._closePicker(true);
      });
      li.appendChild(b);
      list.appendChild(li);
      if (i === guess || (!focusBtn && guess < 0)) focusBtn = b;
    });
    pick.appendChild(head);
    pick.appendChild(list);
    pick.hidden = false;
    this._paintBar();
    if (focusBtn) {
      list.scrollTop = Math.max(0, focusBtn.parentNode.offsetTop - list.clientHeight / 2);
      try { focusBtn.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
  };

  Engine.prototype._closePicker = function (refocus) {
    if (!this._pick || this._pick.hidden) return;
    this._pick.hidden = true;
    this._pick.textContent = '';
    this._pickAt = null;
    this._paintBar();
    if (refocus && this._open) {
      try { this._closeBtn.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
  };

  /* ---------------- sync loop ---------------- */

  Engine.prototype._playing = function () {
    var a = this._audio;
    return !a.paused && !a.ended;
  };

  Engine.prototype._loop = function () {
    if (this._open && !this._destroyed && !this._raf && this._playing()) {
      this._lastTs = 0;
      this._raf = raf(this._frameFn);
    }
  };

  Engine.prototype._stop = function () {
    if (this._raf) caf(this._raf);
    this._raf = 0;
    this._lastTs = 0;
  };

  Engine.prototype._frame = function (ts) {
    this._raf = 0;
    if (!this._open || this._destroyed) return;
    var dt = this._lastTs ? Math.min(0.1, Math.max(0, (ts - this._lastTs) / 1000)) : 1 / 60;
    this._lastTs = ts;
    this._tick(false);
    this._drawFx(dt);
    if (this._phase === 'gap') this._drawWave(dt, true);
    if (this._playing()) this._raf = raf(this._frameFn);
    else this._lastTs = 0;
  };

  Engine.prototype._songTime = function () {
    var t = this._audio.currentTime;
    return (isNum(t) ? t : 0) + this._offset;
  };

  Engine.prototype._tick = function (jump) {
    if (!this._open || !this._root) return;
    var song = this._songTime();
    if (!jump && isNum(this._lastSong) && Math.abs(song - this._lastSong) > JUMP) jump = true;
    this._lastSong = song;
    var c = this._state === 'ready'
      ? classify(this._lines, song, { firstFull: this._firstFull, duration: this._duration })
      : { phase: 'none', idx: -1 };
    if (jump || c.phase !== this._phase || c.idx !== this._idx) this._enter(c, jump);
    if (c.phase === 'line') this._reveal(song, jump);
    this._paintHint(c.phase);
  };

  Engine.prototype._enter = function (c, instant) {
    var prevPhase = this._phase, prevIdx = this._idx;
    this._clearScene(instant || this._reduced);
    this._phase = c.phase;
    this._idx = c.idx;
    this._shown = 0;
    this._words = [];
    this._times = [];
    this._root.classList.toggle('le-gap', c.phase === 'gap');

    if (c.phase === 'line') {
      var line = this._lines[c.idx];
      this._words = splitWords(line.text);
      this._times = wordTimes(line.t, this._words, lineSpan(this._lines, c.idx));
      this._scale = this._lineScale(this._words);
      this._setLive(line.text);
      if (this._reduced) {
        this._lineEl = el('p', 'le-line');
        this._lineEl.textContent = line.text;
        this._stage.appendChild(this._lineEl);
      }
      if (c.idx !== prevIdx || prevPhase !== 'line') {
        this._emit('line', { index: c.idx, t: line.t, text: line.text, words: this._words.slice() });
      }
    } else {
      this._setLive('');
    }

    var wasGap = prevPhase === 'gap', isGap = c.phase === 'gap';
    if (wasGap !== isGap) {
      this._emit('gap', { active: isGap, reason: isGap ? c.why : null, index: c.idx });
    }
    if (isGap) this._drawWave(0, false);
  };

  Engine.prototype._setLive = function (text) {
    if (text === this._liveText) return;
    this._liveText = text;
    this._live.textContent = text;
  };

  Engine.prototype._reveal = function (song, instant) {
    while (this._shown < this._times.length && this._times[this._shown] <= song) {
      var k = this._shown++;
      if (!this._reduced) this._addWord(this._words[k], instant);
      this._emit('word', { index: k, word: this._words[k], line: this._idx, t: this._times[k] });
    }
  };

  /* ---------------- word placement ---------------- */

  Engine.prototype._measure = function (relayout) {
    if (!this._root) return;
    var r = this._root;
    var W = r.clientWidth, H = r.clientHeight;
    this._w = W;
    this._h = H;
    var dpr = this._dpr = Math.min(2, G.devicePixelRatio || 1);
    var side = Math.max(16, Math.round(W * 0.06));
    var top = Math.max(16, Math.round(H * 0.07));
    [this._closeBtn, this._tuneBtn].forEach(function (b) {
      if (b && b.offsetHeight) top = Math.max(top, b.offsetTop + b.offsetHeight + 10);
    });
    this._waveColor = this._color(this._theme.wave);
    this._particleColor = this._color(this._theme.particle);
    var bottom = Math.max(16, Math.round(H * 0.06));
    if (!this._bar.hidden && this._bar.offsetHeight) bottom = Math.max(bottom, H - this._bar.offsetTop + 10);
    this._insets = { l: side, r: side, t: top, b: bottom };

    if (this._fx.width !== Math.round(W * dpr) || this._fx.height !== Math.round(H * dpr)) {
      this._fx.width = Math.round(W * dpr);
      this._fx.height = Math.round(H * dpr);
    }
    var ww = Math.max(120, Math.min(720, W - 2 * side));
    var wh = Math.round(clamp(H * 0.18, 56, 140));
    this._wave.style.width = ww + 'px';
    this._wave.style.height = wh + 'px';
    this._wave.width = Math.round(ww * dpr);
    this._wave.height = Math.round(wh * dpr);
    var n = Math.max(16, Math.floor(ww / 7));
    if (!this._hist || this._hist.length !== n) {
      var h = new Float32Array(n);
      for (var i = 0; i < n; i++) h[i] = 0.04;
      if (this._hist) {
        var old = this._hist, m = Math.min(old.length, n);
        for (var j = 0; j < m; j++) h[n - 1 - j] = old[old.length - 1 - j];
      }
      this._hist = h;
    }
    this._initParticles();

    if (relayout && this._wordEls.length) {
      this._rects = [];
      for (var k = 0; k < this._wordEls.length; k++) this._place(this._wordEls[k]);
    }
    if (!this._raf) { this._drawFx(0); this._drawWave(0, false); }
  };

  /** Canvas needs a real colour: resolve 'currentColor' / 'inherit' / '' from the page. */
  Engine.prototype._color = function (c) {
    if (c && !/^(currentcolor|inherit)$/i.test(String(c))) return c;
    try { return G.getComputedStyle(this._root).color || '#888'; } catch (e) { return '#888'; }
  };

  /** Shrink long lines so all their words fit the safe zone without overlapping. */
  Engine.prototype._lineScale = function (words) {
    var ins = this._insets;
    var aw = Math.max(40, this._w - ins.l - ins.r), ah = Math.max(40, this._h - ins.t - ins.b);
    var fs = clamp(0.075 * Math.min(this._w, this._h), 20, 76) * (toNum(this._theme.size) || 1);
    var area = 0, longest = 0;
    for (var i = 0; i < words.length; i++) {
      var w = words[i].length * 0.56 * fs;
      longest = Math.max(longest, w);
      area += (w + 20) * (1.2 * fs + 20);
    }
    var s = area ? Math.sqrt((aw * ah * 0.42) / area) : 1;
    if (longest) s = Math.min(s, aw / longest);
    return clamp(s, 0.5, 1);
  };

  Engine.prototype._addWord = function (word, instant) {
    var w = el('span', 'le-word' + (instant ? ' le-now' : ''));
    w.textContent = word;
    w.style.setProperty('--le-rot', (Math.random() * 8 - 4).toFixed(2) + 'deg');
    w.style.setProperty('--le-scale', String(round(this._scale || 1, 3)));
    w.style.visibility = 'hidden';
    this._stage.appendChild(w);
    this._place(w);
    w.style.visibility = '';
    this._wordEls.push(w);
  };

  function overlapArea(ax, ay, aw, ah, b) {
    var x = Math.min(ax + aw, b.x + b.w) - Math.max(ax, b.x);
    var y = Math.min(ay + ah, b.y + b.h) - Math.max(ay, b.y);
    return x > 0 && y > 0 ? x * y : 0;
  }

  Engine.prototype._place = function (w) {
    var ins = this._insets, W = this._w, H = this._h;
    var maxW = Math.max(40, W - ins.l - ins.r);
    w.style.maxWidth = '';
    w.style.whiteSpace = '';
    var ww = w.offsetWidth, wh = w.offsetHeight;
    if (ww > maxW) {
      w.style.whiteSpace = 'normal';
      w.style.overflowWrap = 'anywhere';
      w.style.maxWidth = maxW + 'px';
      ww = Math.min(maxW, w.offsetWidth);
      wh = w.offsetHeight;
    }
    var x0 = ins.l, x1 = Math.max(x0, W - ins.r - ww);
    var y0 = ins.t, y1 = Math.max(y0, H - ins.b - wh);
    // Random spots, but a line should still read in order: the first word leans to
    // the upper left, each next one to the right of or below the previous one, nearby.
    var prev = null;
    for (var p = this._rects.length - 1; p >= 0; p--) {
      if (this._wordEls.indexOf(this._rects[p].el) >= 0) { prev = this._rects[p]; break; }
    }
    var M = 10, best = null, bestCost = Infinity, diag = Math.sqrt(W * W + H * H) || 1;
    for (var i = 0; i < 80; i++) {
      var x, y;
      if (prev) {
        x = x0 + Math.random() * (x1 - x0);
        y = y0 + Math.random() * (y1 - y0);
      } else {
        x = x0 + Math.random() * (x1 - x0) * 0.55;
        y = y0 + Math.random() * (y1 - y0) * 0.6;
      }
      var cost = 0;
      for (var j = 0; j < this._rects.length; j++) {
        var r = this._rects[j];
        var weight = this._wordEls.indexOf(r.el) >= 0 ? 1000 : 20; // fading words matter less
        cost += weight * overlapArea(x - M, y - M, ww + 2 * M, wh + 2 * M, r);
      }
      if (prev) {
        var dy = (y + wh / 2) - (prev.y + prev.h / 2);
        if (dy < -0.5 * wh) cost += 5e5;                                   // above the previous word
        else if (Math.abs(dy) < 0.9 * wh && x < prev.x + prev.w) cost += 5e5; // same row, to its left
        var dx = x - (prev.x + prev.w), d = Math.sqrt(dx * dx + dy * dy);
        cost += (d / diag) * 3e4;                                           // stay close
      }
      cost += Math.random() * 2e3;
      if (cost < bestCost) { bestCost = cost; best = { x: x, y: y }; }
    }
    w.style.left = Math.round(best.x) + 'px';
    w.style.top = Math.round(best.y) + 'px';
    this._rects.push({ x: best.x, y: best.y, w: ww, h: wh, el: w });
  };

  Engine.prototype._clearScene = function (instant) {
    var els = this._wordEls, self = this;
    this._wordEls = [];
    if (this._lineEl) {
      if (this._lineEl.parentNode) this._lineEl.parentNode.removeChild(this._lineEl);
      this._lineEl = null;
    }
    if (!this._stage) return;
    if (instant) {
      this._stage.textContent = '';
      this._rects = [];
      return;
    }
    els.forEach(function (w) { w.classList.add('le-out'); });
    this._later(null, 480, function () {
      els.forEach(function (w) { if (w.parentNode) w.parentNode.removeChild(w); });
      self._rects = self._rects.filter(function (r) { return els.indexOf(r.el) < 0; });
    });
  };

  /* ---------------- particles and wave ---------------- */

  Engine.prototype._initParticles = function () {
    var n = this._theme.particles | 0;
    if (this._particles.length === n) return;
    var p = [];
    for (var i = 0; i < n; i++) {
      p.push({
        x: Math.random(), y: Math.random(),
        vx: (Math.random() - 0.5) * 0.012, vy: 0.006 + Math.random() * 0.016,
        r: 1.2 + Math.random() * 2.2, rot: Math.random() * Math.PI,
        a: 0.35 + Math.random() * 0.5, ph: Math.random() * Math.PI * 2
      });
    }
    this._particles = p;
  };

  Engine.prototype._drawFx = function (dt) {
    var ctx = this._fxCtx;
    if (!ctx || !this._w) return;
    var W = this._fx.width, H = this._fx.height, dpr = this._dpr;
    ctx.clearRect(0, 0, W, H);
    if (this._reduced || !this._particles.length) return;
    ctx.fillStyle = this._particleColor || this._theme.particle;
    var t = now() / 1000;
    for (var i = 0; i < this._particles.length; i++) {
      var p = this._particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y > 1.03) { p.y = -0.03; p.x = Math.random(); }
      if (p.x < -0.03) p.x = 1.03; else if (p.x > 1.03) p.x = -0.03;
      ctx.globalAlpha = p.a * (0.7 + 0.3 * Math.sin(t * 1.3 + p.ph));
      ctx.beginPath();
      if (ctx.ellipse) ctx.ellipse(p.x * W, p.y * H, p.r * dpr, p.r * 1.9 * dpr, p.rot, 0, Math.PI * 2);
      else ctx.arc(p.x * W, p.y * H, p.r * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  Engine.prototype._resetAnalyserGuess = function () {
    if (this._an && this._analyserOpt == null) this._an = undefined;
    this._anLive = false;
    this._anDead = false;
    this._anZero = 0;
  };

  /** The analyser to read, or null; taps the element lazily and safely. */
  Engine.prototype._analyser = function () {
    if (this._an) return this._an;
    if (this._an === null) return null;
    var opt = this._analyserOpt, a = this._audio;
    if (opt === false || opt === null) { this._an = null; return null; }
    if (opt && typeof opt.getByteTimeDomainData === 'function') { this._an = opt; return opt; }
    var g = GRAPH && GRAPH.get(a);
    if (g) {
      if (g.analyser) { this._an = g.analyser; return g.analyser; }
      if (g.failed) this._an = null;
      return null;
    }
    // Never route a media element that is not CORS-enabled: it would go silent.
    if (!a.crossOrigin || !this._playing()) return null;
    tapElement(a);
    return null;
  };

  Engine.prototype._level = function () {
    var an = this._anDead ? null : this._analyser();
    if (an) {
      var n = an.fftSize || 512;
      if (!this._anBuf || this._anBuf.length !== n) this._anBuf = new Uint8Array(n);
      an.getByteTimeDomainData(this._anBuf);
      var dev = 0;
      for (var i = 0; i < n; i++) {
        var d = this._anBuf[i] - 128;
        if (d < 0) d = -d;
        if (d > dev) dev = d;
      }
      var a = this._audio;
      if (dev > 1) {
        this._anLive = true;
        this._anZero = 0;
        return Math.min(1, Math.pow(dev / 128, 0.75) * 1.1);
      }
      if (this._anLive) return 0.03; // real silence
      if (this._playing() && !a.muted && a.volume > 0 && ++this._anZero > DEAD_FRAMES) this._anDead = true;
    }
    var t = now() / 1000;
    var base = 0.08 + 0.16 * (0.5 + 0.5 * Math.sin(t * 2.3)) * (0.5 + 0.5 * Math.sin(t * 0.9 + 1.7));
    return Math.random() < 0.14 ? base + Math.random() * 0.75 : base + Math.random() * 0.14;
  };

  Engine.prototype._drawWave = function (dt, live) {
    var ctx = this._waveCtx, hist = this._hist;
    if (!ctx || !hist || !this._root) return;
    if (live && !this._reduced) {
      this._wpeak = Math.max(this._wpeak, this._level());
      this._wacc += dt;
      var shifts = 0;
      while (this._wacc >= WAVE_STEP && shifts < hist.length) {
        hist.copyWithin(0, 1);
        hist[hist.length - 1] = this._wpeak;
        this._wacc -= WAVE_STEP;
        shifts++;
      }
      if (shifts) this._wpeak = 0;
    }
    var W = this._wave.width, H = this._wave.height, dpr = this._dpr;
    var n = hist.length, step = W / n, bw = Math.max(1, Math.round(1.6 * dpr)), mid = H / 2;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = this._waveColor || this._theme.wave;
    for (var i = 0; i < n; i++) {
      var x = Math.round(i * step + step / 2 - bw / 2);
      var h = Math.max(2 * dpr, hist[i] * H * 0.92);
      ctx.globalAlpha = 0.9;
      ctx.fillRect(x, Math.round(mid - h / 2), bw, Math.round(h));
      ctx.globalAlpha = 0.5;
      ctx.fillRect(Math.round(x + step / 2), Math.round(mid - dpr * 0.75), Math.max(1, Math.round(dpr * 1.5)), Math.max(1, Math.round(dpr * 1.5)));
    }
    ctx.globalAlpha = 1;
  };

  /* ------------------------------------------------------------------
     Declarative mode: <div data-le-audio="#player" data-le-artist=".." data-le-title="..">
     ------------------------------------------------------------------ */
  var AUTO = typeof WeakMap === 'function' ? new WeakMap() : null;

  function auto(scope) {
    if (!HAS_DOM) return [];
    scope = scope || document;
    var out = [];
    var nodes = scope.querySelectorAll('[data-le-audio]');
    for (var i = 0; i < nodes.length; i++) {
      var box = nodes[i];
      if (AUTO && AUTO.has(box)) continue;
      var d = box.dataset;
      var audio = document.querySelector(d.leAudio);
      if (!audio || !d.leArtist || !d.leTitle) continue;
      var eng = create({
        audio: audio,
        container: box,
        track: { artist: d.leArtist, title: d.leTitle, album: d.leAlbum, duration: toNum(d.leDuration) },
        offset: toNum(d.leOffset),
        offsetProvider: d.leOffsets ? offsetsFromJson(d.leOffsets) : undefined,
        theme: d.leTheme || undefined,
        lang: d.leLang || undefined,
        calibration: d.leCalibration === 'false' ? false : d.leCalibration === 'true' ? true : 'auto',
        closeButton: d.leClose !== 'false'
      });
      eng.open();
      if (AUTO) AUTO.set(box, eng);
      out.push(eng);
    }
    return out;
  }

  /* ------------------------------------------------------------------
     Public object
     ------------------------------------------------------------------ */
  function create(opts) {
    if (!opts || typeof opts !== 'object') throw new TypeError('LyricsEngine.create(options) needs an options object');
    return new Engine(opts);
  }

  var API = {
    version: '1.1.0',
    create: create,
    auto: auto,
    itunesPreview: itunesPreview,
    offsetsFromJson: offsetsFromJson,
    parseLRC: parseLRC,
    trackKey: trackKey,
    sources: { lrclib: defaultLrclib, makeLrclib: makeLrclib, lrcText: lrcText },
    themes: THEMES,
    labels: LABELS,
    clearCache: function () { CACHE.clear(); },
    /** True once this <audio> is routed through Web Audio (permanent; see tapElement). */
    isRouted: function (audio) { return !!(GRAPH && audio && GRAPH.has(audio)); },
    /** Optional fetch override (tests, proxies). */
    fetch: null,
    _internals: {
      fold: fold, loose: loose, cleanTitle: cleanTitle, cleanArtist: cleanArtist, similarity: similarity,
      artistSimilarity: artistSimilarity, findLine: findLine, isBreak: isBreak, lineSpan: lineSpan,
      wordTimes: wordTimes, firstFullLine: firstFullLine, classify: classify, normalizeLines: normalizeLines,
      scoreItunes: scoreItunes, isTransparent: isTransparent, GRAPH: GRAPH,
      constants: { MAX_LINE: MAX_LINE, GAP_MIN: GAP_MIN, EDGE_TOL: EDGE_TOL, TAIL: TAIL }
    }
  };

  if (HAS_DOM && document.currentScript && document.currentScript.hasAttribute('data-auto')) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { auto(); });
    else setTimeout(function () { auto(); }, 0);
  }

  return API;
});
