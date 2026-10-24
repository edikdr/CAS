/* ==========================================================================
   Сверка прочитанного (OCR) с локальной базой карточек. Чистая логика без DOM:
   работает и в браузере, и в Node (для тестов).

   Что учитывается:
   • имя: целиком (Levenshtein по окнам слов) и «по виду покемона» (Charizard + «V» / «EX» / «VMAX»…),
     поэтому криво прочитанная приставка не мешает найти покемона;
   • HP (число справа сверху), номер карточки и «из скольких» в наборе (020/189, SWSH050);
   • никакого жёсткого «не узнал»: всегда отдаём лучшие варианты с оценкой, а решает человек по превью.

   API: PL.scanMatch.match({ reads: [строки названия], nums: [строки номера], hps: [строки HP] }) →
        { list: [{ i, score, sim, num, tot, hp, sp }], num, hp, species }
        PL.scanMatch.parseNumber(texts) · parseHP(texts) · norm(s)
   ========================================================================== */
window.PL = window.PL || {};

PL.scanMatch = (function () {
  var NI = null;
  var SUFFIX = { ex: 'ex', gx: 'gx', v: 'v', vmax: 'vmax', vstar: 'vstar', vunion: 'vunion', break: 'break', star: 'star', prime: 'prime', legend: 'legend', lvx: 'lvx', ex2: 'ex' };

  function norm(s) {
    s = String(s || '').toLowerCase().replace(/[’`´]/g, "'");
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return s.replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function normLocal(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^([a-z]*)0+(?=\d)/, '$1'); }
  function lev(a, b, max) {
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= lb; j++) prev[j] = j;
    for (i = 1; i <= la; i++) {
      cur[0] = i; var mn = i;
      for (j = 1; j <= lb; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
        if (cur[j] < mn) mn = cur[j];
      }
      if (mn > max) return max + 1;
      var t = prev; prev = cur; cur = t;
    }
    return prev[lb];
  }
  function sim(a, b) {
    if (!a || !b) return 0;
    var m = Math.max(a.length, b.length), d = lev(a, b, Math.ceil(m * 0.5));
    return Math.max(0, 1 - d / m);
  }
  /* типичные ошибки OCR: 0↔o, 1↔l/i, 5↔s, 8↔b — для сравнения «в одну кучу» */
  function fold(s) { return s.replace(/0/g, 'o').replace(/[1|]/g, 'l').replace(/i/g, 'l').replace(/5/g, 's').replace(/8/g, 'b').replace(/rn/g, 'm').replace(/vv/g, 'w'); }

  /* токены названия: суффикс («ex», «V», «VMAX»…) отдельно от остального */
  function splitName(key) {
    var t = key.split(' '), suf = '';
    var last = t[t.length - 1];
    if (SUFFIX[last]) { suf = SUFFIX[last]; t = t.slice(0, -1); }
    else if (t.length > 1 && t[t.length - 2] === 'v' && last === 'union') { suf = 'vunion'; t = t.slice(0, -2); }
    return { core: t, suffix: suf };
  }

  /* триграммы слова: по ним быстро находим похожие имена, не гоняя Levenshtein по всей базе */
  function grams(t, out) {
    var i;
    if (t.length < 3) { out.push('#' + t); return out; }
    for (i = 0; i + 3 <= t.length; i++) out.push(t.substr(i, 3));
    return out;
  }
  function addGrams(map, id, key) {
    key.split(' ').forEach(function (tok) {
      if (tok.length < 3) return;
      var seen = {};
      grams(tok, []).forEach(function (g) { if (!seen[g]) { seen[g] = 1; (map[g] = map[g] || []).push(id); } });
    });
  }

  function index() {
    if (NI) return NI;
    var IDX = PL.tcgIndex || { rows: [] }, rows = IDX.rows, sets = PL.tcgSets || [], byName = {}, byNum = {}, byLocal = {}, byDex = {}, i;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i], key = norm(r[2]);
      if (!key) continue;
      var e = byName[key];
      if (!e) { var sp = splitName(key), ck = sp.core.join(' '); e = byName[key] = { key: key, fkey: fold(key), km: mask(key), tokens: key.split(' '), core: sp.core, ckey: ck, cfkey: fold(ck), ckm: mask(ck), suffix: sp.suffix, rows: [] }; }
      e.rows.push(i);
      var set = sets[r[0]] || {}, ln = normLocal(r[1]);
      (byNum[ln + '/' + (set.pt || 0)] = byNum[ln + '/' + (set.pt || 0)] || []).push(i);
      if (/^[a-z]/.test(ln)) (byLocal[ln] = byLocal[ln] || []).push(i);
      if (r[6]) (byDex[r[6]] = byDex[r[6]] || []).push(i);
    }
    /* виды покемонов из Покедекса: английские имена */
    var species = [], eIdx = Object.keys(byName).map(function (k) { return byName[k]; }), tri = {}, spTri = {};
    eIdx.forEach(function (e, ei) { addGrams(tri, ei, e.key); });
    (PL.dex || []).forEach(function (p) {
      var k = norm(p.en).replace(/'/g, "'");
      if (k) { species.push({ id: p.id, key: k, fkey: fold(k), km: mask(k), n: k.split(' ').length }); addGrams(spTri, species.length - 1, k); }
    });
    NI = { names: eIdx, tri: tri, spTri: spTri, byNum: byNum, byLocal: byLocal, byDex: byDex, rows: rows, sets: sets, species: species };
    return NI;
  }

  /* ---------- номер и HP ---------- */
  var PREFIX = /^(TG|GG|SV|SWSH|SM|XY|BW|HGSS|DP|SVP|PR|RC|SH|H|PL|FA|ME|MEP|BWP|SMP|XYP|DPP|NP|GX|ZSV|RSV)$/;
  function parseNumber(texts) {
    var i, t, m;
    for (i = 0; i < texts.length; i++) {
      t = String(texts[i] || '').toUpperCase().replace(/[Il]/g, '1').replace(/O(?=\d)/g, '0');
      m = /([A-Z]{0,4})\s?(\d{1,3})\s*[\/\\|]\s*([A-Z]{0,4})\s?(\d{1,3})/.exec(t);
      if (m) {
        var pre = PREFIX.test(m[1]) ? m[1] : '';          // одиночная «I», «l» и т.п. перед цифрами — это мусор OCR
        return { n: pre + m[2], total: parseInt(m[4], 10), raw: m[0] };
      }
    }
    /* слэш потерялся или прочитан как «1»/«7»: «133197», «1751307» */
    for (i = 0; i < texts.length; i++) {
      var cl = String(texts[i] || '').toUpperCase().replace(/[OQ]/g, '0').replace(/[IL|]/g, '1').replace(/[^0-9A-Z\/ ]/g, ' ');
      m = /(?:^|\s)(\d{3})\s?[1\/7]?\s?(\d{3})(?:\s|$)/.exec(cl);
      if (m && +m[2] >= 10) return { n: m[1], total: parseInt(m[2], 10), raw: m[0].trim(), loose: true };
    }
    for (i = 0; i < texts.length; i++) {
      var p = /\b(SVP|SWSH|SM|XY|BW|HGSS|DP|PR|TG|GG|MEP|SV|ME|BWP|SMP|XYP)\s?-?(\d{1,3})\b/.exec(String(texts[i] || '').toUpperCase());
      if (p) return { n: p[1] + p[2], total: 0, raw: p[0] };
    }
    return null;
  }
  /* HP: числа 30…340 (кратные 10, иногда 5 у старых карт). Если рядом «HP» — доверяем сильнее */
  function parseHP(texts) {
    var out = [], seen = {};
    texts.forEach(function (tx) {
      var t = String(tx || '').toUpperCase();
      var re = /(HP\s*)?(\d{2,3})(?!\d)/g, m;
      while ((m = re.exec(t))) {
        var v = +m[2];
        if (v < 30 || v > 340 || (v % 10 && v % 5)) continue;
        if (!seen[v]) { seen[v] = 1; out.push(v); }
      }
    });
    return out;
  }

  /* ---------- сверка ---------- */
  function tokensOf(text) { return norm(text).split(' ').filter(Boolean); }
  function mask(s) { var m = 0, i, c; for (i = 0; i < s.length; i++) { c = s.charCodeAt(i); m |= c >= 97 && c <= 122 ? 1 << (c - 97) : c >= 48 && c <= 57 ? 1 << 26 : 0; } return m; }
  function pop(x) { x = x - ((x >>> 1) & 0x55555555); x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; }
  /* быстрый отсев: слишком разная длина или набор букв — точно не похоже */
  function close(wlen, wmask, klen, kmask) {
    var L = Math.max(wlen, klen), lim = Math.ceil(L * 0.4);
    if (Math.abs(wlen - klen) > lim) return false;
    return pop(wmask & ~kmask) <= lim && pop(kmask & ~wmask) <= lim;
  }
  function suffixIn(toks) {
    var found = '';
    toks.forEach(function (t, j) {
      if (SUFFIX[t]) found = SUFFIX[t];
      else if (t === 'v' && toks[j + 1] === 'union') found = 'vunion';
    });
    return found;
  }
  /* прочитанная строка → токены и все «окна» по 1…5 слов (с отсевом по буквам) */
  function prepRead(text) {
    var toks = tokensOf(text), W = {}, m, j, w;
    for (m = 1; m <= 5; m++) {
      var arr = [];
      for (j = 0; j + m <= toks.length; j++) { w = toks.slice(j, j + m).join(' '); arr.push({ s: w, f: fold(w), k: mask(w), n: w.length }); }
      W[m] = arr;
    }
    return { text: text, toks: toks, W: W, suf: suffixIn(toks) };
  }
  function winsim(rd, key, fkey, kmask, m) {
    var arr = rd.W[m], best = 0, i, w, s;
    if (!arr) return 0;
    for (i = 0; i < arr.length; i++) {
      w = arr[i];
      if (!close(w.n, w.k, key.length, kmask)) continue;
      s = sim(w.s, key);
      if (s < 0.9) s = Math.max(s, sim(w.f, fkey));
      if (s > best) best = s;
    }
    return best;
  }
  /* слова на карточке, которые к имени не относятся */
  var STOP = { basic: 1, stage: 1, hp: 1, evolves: 1, from: 1, pokemon: 1, trainer: 1, item: 1, supporter: 1, stadium: 1, tool: 1, energy: 1, special: 1, restored: 1, mega: 0 };
  /* сколько «лишних» слов из прочитанного (Rocket s, Blaine s…) в имени кандидата не нашлось */
  function uncovered(rd, e) {
    var n = 0;
    rd.toks.forEach(function (t) {
      if (t.length < 4 || STOP[t] || SUFFIX[t]) return;
      for (var i = 0; i < e.tokens.length; i++) if (sim(t, e.tokens[i]) >= 0.72) return;
      n++;
    });
    return Math.min(3, n);
  }
  /* поправка за приставку: «EX» прочитан и совпал / не совпал / не прочитан */
  function sufAdj(rsuf, esuf) {
    if (esuf) return rsuf === esuf ? 0 : rsuf ? -0.1 : -0.05;
    return rsuf ? -0.18 : 0;
  }

  function match(ocr) {
    var N = index(), reads = (ocr.reads || (ocr.name ? [ocr.name] : [])).map(prepRead).filter(function (r) { return r.toks.length; });
    var num = parseNumber(ocr.nums || []), hps = parseHP(ocr.hps || []);
    var cands = {}, speciesHits = [], ri;

    function cand(i) {
      var c = cands[i];
      if (!c) {
        var r = N.rows[i], set = N.sets[r[0]] || {};
        c = cands[i] = { i: i, sim: 0, sp: 0, num: false, tot: false, hp: null };
        if (num) {
          var a = normLocal(num.n), bn = normLocal(r[1]);
          c.num = a === bn; c.tot = !!(num.total && set.pt === num.total);
          c.ns = c.num ? 1 : (a.length >= 3 && a.length === bn.length && lev(a, bn, 1) <= 1 ? 0.5 : 0);        // цифра прочитана неверно: частичное совпадение
          c.ts = c.tot ? 1 : (num.total && set.pt && String(set.pt).length === String(num.total).length && lev(String(set.pt), String(num.total), 1) <= 1 ? 0.5 : 0);
        }
        if (hps.length && r[7]) c.hp = hps.indexOf(+r[7]) >= 0;
      }
      return c;
    }

    /* кандидаты по триграммам слов (и «сложенным» OCR-ошибкам) */
    var nameSet = {}, spSet = {}, nameList = [], spList = [];
    reads.forEach(function (rd) {
      rd.toks.forEach(function (t) {
        if (t.length < 3) return;
        [t, fold(t)].forEach(function (tt) {
          grams(tt, []).forEach(function (g) {
            (N.tri[g] || []).forEach(function (ei) { if (!nameSet[ei]) { nameSet[ei] = 1; nameList.push(N.names[ei]); } });
            (N.spTri[g] || []).forEach(function (si) { if (!spSet[si]) { spSet[si] = 1; spList.push(N.species[si]); } });
          });
        });
      });
    });

    /* 1) имя целиком (с поправкой на приставку) */
    if (reads.length) nameList.forEach(function (e) {
      var best = 0, rd, s, s2;
      for (ri = 0; ri < reads.length; ri++) {
        rd = reads[ri];
        s = winsim(rd, e.key, e.fkey, e.km, e.tokens.length);
        if (e.suffix && e.core.length) {
          s2 = winsim(rd, e.ckey, e.cfkey, e.ckm, e.core.length);
          if (s2 > 0) s2 = Math.min(1, s2 + sufAdj(rd.suf, e.suffix));
          if (s2 > s) s = s2;
        } else if (!e.suffix && s > 0) s += sufAdj(rd.suf, '');
        if (s >= 0.62) s -= 0.04 * uncovered(rd, e);
        if (s > best) best = s;
      }
      if (best >= 0.62) e.rows.forEach(function (i) { var c = cand(i); if (best > c.sim) c.sim = best; });
    });

    /* 2) вид покемона: запасной путь, если название прочитано криво (Chorizard V) */
    var spFound = [];
    reads.length && spList.forEach(function (sp) {
      var best = 0, bestRead = null;
      reads.forEach(function (rd) {
        var s = winsim(rd, sp.key, sp.fkey, sp.km, sp.n);
        if (sp.key.length <= 4 && s < 0.99) s = 0;          // короткие имена (Mew, Ho-Oh) — только почти точно
        else if (sp.key.length <= 6 && s < 0.8) s = 0;
        if (s > best) { best = s; bestRead = rd; }
      });
      if (best >= 0.76) spFound.push({ id: sp.id, sim: best, read: bestRead });
    });
    spFound.sort(function (a, b) { return b.sim - a.sim; });
    speciesHits = spFound.slice(0, 3);
    speciesHits.forEach(function (h) {
      (N.byDex[h.id] || []).forEach(function (i) {
        var sp = splitName(norm(N.rows[i][2])), s = 0.78 * h.sim + sufAdj(h.read.suf, sp.suffix) + (sp.suffix || h.read.suf ? 0 : 0.06) + (sp.suffix && h.read.suf === sp.suffix ? 0.16 : 0);
        var c = cand(i);
        if (s > c.sim) c.sim = Math.max(0, Math.min(0.98, s));
        c.sp = h.sim;
      });
    });

    /* 3) по номеру: «020/189» однозначно указывает карточку в наборе */
    if (num) {
      if (num.total) (N.byNum[normLocal(num.n) + '/' + num.total] || []).forEach(function (i) { var c = cand(i); c.num = c.tot = true; if (c.sim < 0.4) c.sim = 0.4; });
      else (N.byLocal[normLocal(num.n)] || []).forEach(function (i) { var c = cand(i); c.num = true; if (c.sim < 0.4) c.sim = 0.4; });
    }

    var out = [], k, c, hasHP = hps.length > 0;
    for (k in cands) {
      c = cands[k];
      if (c.sim < 0.4 && !(c.num && c.tot)) continue;
      var score = 0.6 * c.sim + 0.18 * (c.ns || 0) + 0.08 * (c.ts || 0);
      if (hasHP && c.hp === true) score += 0.14; else if (hasHP && c.hp === false) score -= 0.06;
      c.score = Math.max(0, Math.min(1, score));
      out.push(c);
    }
    out.sort(function (a, b) { return b.score - a.score || b.i - a.i; });
    return { list: out.slice(0, 12), num: num, hp: hps, species: speciesHits };
  }

  /* уверенность лучшего: 'sure' — можно показывать как «похоже, это она», 'maybe' — «выбери подходящую», 'none' */
  function verdict(res) {
    var l = res.list;
    if (!l.length) return 'none';
    var a = l[0].score, b = l[1] ? l[1].score : 0;
    if (a >= 0.8 || (a >= 0.68 && a - b >= 0.1)) return 'sure';
    return a >= 0.45 ? 'maybe' : 'none';
  }

  return { match: match, verdict: verdict, parseNumber: parseNumber, parseHP: parseHP, norm: norm, normLocal: normLocal, lev: lev, sim: sim, index: index };
})();
