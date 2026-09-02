/* Genius quotes the lyric it annotates in `referent.fragment`. Our own copy of
   a song is a list of lines that will rarely be byte-identical: different
   apostrophes, bracketed section headers, stray whitespace. This maps one onto
   the other and reports where each annotation starts and ends inside our lines,
   so the front end can underline exactly that span and open a popup on it. */

/* Build a normalised string plus an index back to the original offsets. */
function normalise(text) {
  const map = [];
  let out = '';
  let lastWasSpace = true;

  for (let i = 0; i < text.length; i += 1) {
    let ch = text[i];
    if (/[‘’ʼ´`]/.test(ch)) ch = "'";
    else if (/[“”]/.test(ch)) ch = '"';
    else if (/[–—‒]/.test(ch)) ch = '-';

    if (/\s/.test(ch)) {
      if (lastWasSpace) continue;
      out += ' ';
      map.push(i);
      lastWasSpace = true;
      continue;
    }
    if (!/[a-z0-9'"\-]/i.test(ch)) continue;   /* drop punctuation entirely */

    out += ch.toLowerCase();
    map.push(i);
    lastWasSpace = false;
  }

  return { text: out.trim(), map };
}

const tokens = (text) => normalise(text).text.split(' ').filter(Boolean);

/* Where does `needle` sit inside `haystack`? Exact first, then a token-overlap
   pass so a fragment that differs by a word still lands on the right lines. */
function locate(haystackNorm, needleNorm) {
  if (!needleNorm.text) return null;

  const exact = haystackNorm.text.indexOf(needleNorm.text);
  if (exact !== -1) return { start: exact, end: exact + needleNorm.text.length, exact: true };

  const needleTokens = needleNorm.text.split(' ').filter(Boolean);
  if (needleTokens.length < 2) return null;

  /* slide a window the length of the fragment and keep the best overlap */
  const hayTokens = haystackNorm.text.split(' ');
  const starts = [];
  let cursor = 0;
  for (const token of hayTokens) {
    starts.push(cursor);
    cursor += token.length + 1;
  }

  let best = null;
  const window = needleTokens.length;
  const wanted = new Set(needleTokens);
  for (let i = 0; i + Math.ceil(window / 2) <= hayTokens.length; i += 1) {
    const slice = hayTokens.slice(i, i + window);
    const hit = slice.filter(t => wanted.has(t)).length;
    const score = hit / window;
    if (score > (best?.score ?? 0)) {
      const start = starts[i];
      const lastIndex = Math.min(i + window, hayTokens.length) - 1;
      best = { score, start, end: starts[lastIndex] + hayTokens[lastIndex].length };
    }
  }

  return best && best.score >= 0.6 ? { ...best, exact: false } : null;
}

/**
 * @param {string[]} lines     our copy of the song, one entry per line
 * @param {Array}    annotations  [{ id, fragment, ... }]
 * @returns {{ lines: Array, unmatched: Array, matched: number }}
 */
export function matchAnnotations(lines, annotations) {
  const safeLines = (lines || []).map(line => (typeof line === 'string' ? line : ''));

  /* one flat document, remembering where each line begins */
  const lineStarts = [];
  let flat = '';
  safeLines.forEach(line => {
    lineStarts.push(flat.length);
    flat += line + '\n';
  });

  const hay = normalise(flat);
  const result = safeLines.map((text, index) => ({ index, text, annotations: [] }));
  const unmatched = [];
  let matched = 0;

  for (const annotation of annotations || []) {
    const fragment = annotation.fragment || '';
    const spot = locate(hay, normalise(fragment));
    if (!spot) { unmatched.push({ id: annotation.id, fragment }); continue; }

    /* normalised offsets back to original character offsets */
    const from = hay.map[spot.start] ?? 0;
    const to = hay.map[Math.min(spot.end, hay.map.length) - 1] ?? from;

    /* which lines does that span cover */
    let first = 0;
    let last = 0;
    for (let i = 0; i < lineStarts.length; i += 1) {
      if (lineStarts[i] <= from) first = i;
      if (lineStarts[i] <= to) last = i;
    }

    matched += 1;
    for (let i = first; i <= last && i < result.length; i += 1) {
      const lineStart = lineStarts[i];
      const lineEnd = lineStart + safeLines[i].length;
      result[i].annotations.push({
        id: annotation.id,
        exact: spot.exact,
        start: Math.max(0, from - lineStart),
        end: Math.max(0, Math.min(to + 1, lineEnd) - lineStart),
        fragment,
        url: annotation.url || null,
        state: annotation.state || null,
        votes: annotation.votes ?? null,
        body: annotation.body || ''
      });
    }
  }

  return { lines: result, matched, unmatched };
}

export const __test = { normalise, tokens, locate };
