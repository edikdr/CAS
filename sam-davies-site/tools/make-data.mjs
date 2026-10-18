// Generate site/data/{tracks,releases,timeline,quiz,build}.json from meta.json only.
// Usage: node tools/make-data.mjs [--meta .cache/raw/meta.json] [--seed sd-2026]
// No invented biography: timeline facts the owner told us are flagged verified:false.
import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { args, ROOT, SITE, readJSON, writeJSON, releaseTitle, releaseType, slug, splitArtists, normTitle, rng, shuffle } from './lib.mjs';

const LANGS = ['en', 'es', 'ca'];
const exists = (p) => access(p).then(() => true, () => false);
const day = (iso) => iso.slice(0, 10);

/** Fill {placeholders}; plural {one,other} entries pick a form for params.n with Intl.PluralRules. */
function fill(tpl, lang, params) {
  let s = tpl;
  if (typeof s === 'object') s = s[new Intl.PluralRules(lang).select(params.n ?? 0)] ?? s.other;
  return s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(typeof params[k] === 'function' ? params[k](lang) : params[k]) : m));
}
const per = (tpl, params) => Object.fromEntries(LANGS.map((l) => [l, fill(tpl[l], l, params)]));
const longDate = (iso) => (lang) => new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(iso));

// Timeline copy (data, not page copy). Reviewed:false — listed in docs/i18n-review.md.
export const TIMELINE_TEXT = {
  firstOfYear: { en: 'First release of {year} in this catalogue', es: 'Primer lanzamiento de {year} en este catálogo', ca: 'Primer llançament de {year} en aquest catàleg' },
  ep: {
    en: { one: 'EP — {n} track with a preview here', other: 'EP — {n} tracks with previews here' },
    es: { one: 'EP — {n} pista con fragmento aquí', other: 'EP — {n} pistas con fragmento aquí' },
    ca: { one: 'EP — {n} pista amb fragment aquí', other: 'EP — {n} pistes amb fragment aquí' },
  },
  album: {
    en: { one: 'Album — {n} track with a preview here, not the full tracklist', other: 'Album — {n} tracks with previews here, not the full tracklist' },
    es: { one: 'Álbum — {n} pista con fragmento aquí, no el disco completo', other: 'Álbum — {n} pistas con fragmento aquí, no el disco completo' },
    ca: { one: 'Àlbum — {n} pista amb fragment aquí, no el disc complet', other: 'Àlbum — {n} pistes amb fragment aquí, no el disc complet' },
  },
  latest: { en: 'Most recent release in this catalogue', es: 'Lanzamiento más reciente de este catálogo', ca: 'Llançament més recent d’aquest catàleg' },
  bornTitle: { en: 'Born in Barcelona', es: 'Nace en Barcelona', ca: 'Neix a Barcelona' },
  duoText: { en: 'Duo with LEÏTI. First credit in this catalogue: “{release}”', es: 'Dúo con LEÏTI. Primer crédito en este catálogo: «{release}»', ca: 'Duo amb LEÏTI. Primer crèdit en aquest catàleg: «{release}»' },
  crewText: { en: 'Part of the CuteMobb collective. First credit in this catalogue: “{release}”', es: 'Parte del colectivo CuteMobb. Primer crédito en este catálogo: «{release}»', ca: 'Part del col·lectiu CuteMobb. Primer crèdit en aquest catàleg: «{release}»' },
};

const GROUPS = new Set(['samxsen', 'cutemobb']); // collectives: membership makes "is X credited?" ambiguous
const SELF = 'sam davies';

export async function makeData({ meta, seed = 'sd-2026', out = path.join(SITE, 'data') }) {
  const raw = await readJSON(meta);
  const config = await readJSON(path.join(SITE, 'site.config.json'));
  const templates = await readJSON(path.join(ROOT, 'tools/quiz-templates.json'));
  const lyricsDir = path.join(SITE, config.lyrics?.dir || 'data/private-lyrics');
  const lrcFiles = new Set((await readdir(lyricsDir).catch(() => [])).filter((f) => f.endsWith('.lrc')).map((f) => f.slice(0, -4)));

  // ---- releases (grouped by collectionName, never by folder) ----
  const byCollection = new Map();
  for (const t of raw) {
    if (!byCollection.has(t.collectionName)) byCollection.set(t.collectionName, []);
    byCollection.get(t.collectionName).push(t);
  }
  const releases = [];
  const ids = new Set();
  for (const [collection, list] of byCollection) {
    list.sort((a, b) => a.trackNumber - b.trackNumber);
    let id = slug(collection);
    if (ids.has(id)) id = `${id}-${list[0].trackId}`;
    ids.add(id);
    // A collection is complete only once its latest track is out → use the latest track date.
    const date = list.map((t) => day(t.releaseDate)).sort().at(-1);
    const sets = list.map((t) => splitArtists(t.artistName));
    const common = sets[0].filter((a) => sets.every((s) => s.includes(a)));
    const artistLine = new Set(list.map((t) => t.artistName)).size === 1 ? list[0].artistName : (common.length ? joinNames(common) : list[0].artistName);
    releases.push({
      id, title: releaseTitle(collection), type: releaseType(collection), date, year: +date.slice(0, 4),
      trackIds: list.map((t) => String(t.trackId)),
      cover: `media/covers/${id}-400.webp`, cover800: `media/covers/${id}-800.webp`, artistLine,
      _collection: collection,
    });
  }
  releases.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  const relByCollection = new Map(releases.map((r) => [r._collection, r]));

  // ---- tracks ----
  const tracks = raw.map((t) => {
    const r = relByCollection.get(t.collectionName);
    const id = String(t.trackId);
    return {
      id, title: t.trackName, artists: splitArtists(t.artistName, t.trackName), artistLine: t.artistName,
      releaseId: r.id, releaseTitle: r.title, trackNumber: t.trackNumber,
      year: +t.releaseDate.slice(0, 4), date: day(t.releaseDate),
      audio: config.audioSource === 'apple' ? t.previewUrl : `media/audio/${id}.m4a`,
      cover: r.cover, cover800: r.cover800, appleUrl: t.trackViewUrl,
      hasLyrics: Boolean(config.features?.lyrics && lrcFiles.has(id)), previewSeconds: 30,
    };
  });
  tracks.sort((a, b) => a.date.localeCompare(b.date) || a.releaseId.localeCompare(b.releaseId) || a.trackNumber - b.trackNumber);
  const trackById = new Map(tracks.map((t) => [t.id, t]));

  // ---- timeline: auto entries from exact dates + owner facts flagged verified:false ----
  const timeline = [];
  const add = (e) => { if (!timeline.some((x) => x.id === e.id)) timeline.push(e); };
  const years = [...new Set(releases.map((r) => r.year))].sort();
  for (const y of years) {
    const first = releases.filter((r) => r.year === y)[0];
    add({ id: `rel-${first.id}`, date: first.date, year: y, kind: first.type, title: first.title, text: per(TIMELINE_TEXT.firstOfYear, { year: y }), releaseId: first.id, verified: true });
  }
  for (const r of releases.filter((r) => r.type !== 'single')) {
    const entry = { id: `rel-${r.id}`, date: r.date, year: r.year, kind: r.type, title: r.title, text: per(TIMELINE_TEXT[r.type], { n: r.trackIds.length }), releaseId: r.id, verified: true };
    const i = timeline.findIndex((x) => x.id === entry.id);
    if (i >= 0) timeline[i] = entry; else timeline.push(entry);
  }
  const latest = releases.at(-1);
  add({ id: `rel-${latest.id}`, date: latest.date, year: latest.year, kind: latest.type, title: latest.title, text: per(TIMELINE_TEXT.latest, {}), releaseId: latest.id, verified: true });
  const firstCredit = (name) => releases.find((r) => r.trackIds.some((id) => trackById.get(id).artists.some((a) => a.toLowerCase() === name)));
  const duo = firstCredit('samxsen');
  const crew = firstCredit('cutemobb');
  add({ id: 'fact-born', date: String(config.artist.born), year: config.artist.born, kind: 'fact', title: per(TIMELINE_TEXT.bornTitle, {}), verified: false });
  if (duo) add({ id: 'fact-samxsen', date: String(duo.year), year: duo.year, kind: 'fact', title: 'SamxSen', text: per(TIMELINE_TEXT.duoText, { release: duo.title }), releaseId: duo.id, verified: false });
  if (crew) add({ id: 'fact-cutemobb', date: String(crew.year), year: crew.year, kind: 'fact', title: 'CuteMobb', text: per(TIMELINE_TEXT.crewText, { release: crew.title }), releaseId: crew.id, verified: false });
  timeline.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'fact' ? -1 : 1));

  // ---- quiz ----
  const quiz = makeQuiz({ releases, tracks, templates, seed });

  for (const r of releases) delete r._collection;
  await writeJSON(path.join(out, 'tracks.json'), tracks);
  await writeJSON(path.join(out, 'releases.json'), releases);
  await writeJSON(path.join(out, 'timeline.json'), timeline);
  await writeJSON(path.join(out, 'quiz.json'), quiz);
  await writeJSON(path.join(out, 'build.json'), {
    note: 'Generated by tools/make-data.mjs — core-internal build manifest.',
    seed, audioSource: config.audioSource,
    lyricsEngine: await exists(path.join(SITE, config.lyrics.engine)),
    sfx: await exists(path.join(SITE, config.sfx?.src || 'media/sfx/ride-loop.mp3')),
    counts: { tracks: tracks.length, releases: releases.length, timeline: timeline.length, quiz: quiz.length, lyrics: tracks.filter((t) => t.hasLyrics).length },
  });
  return { tracks, releases, timeline, quiz };
}

function joinNames(list) { return list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} & ${list.at(-1)}`; }

/** Unambiguous auto questions only; every candidate is re-checked to have exactly one correct option. */
export function makeQuiz({ releases, tracks, templates, seed }) {
  const rand = rng(seed);
  const out = [];
  const push = (kind, q) => {
    if (q.options.length !== 4 || new Set(q.options).size !== 4) return;
    if (q.correct.filter(Boolean).length !== 1) return; // more than one (or no) right answer → drop
    const order = shuffle([0, 1, 2, 3], rand);
    out.push({
      id: `q${String(out.length + 1).padStart(2, '0')}-${kind}`,
      question: per(templates[kind].question, q.params),
      options: order.map((i) => q.options[i]),
      answerIndex: order.indexOf(q.correct.indexOf(true)),
      explain: per(templates[kind].explain, q.params),
    });
  };
  const allYears = [...new Set(releases.map((r) => r.year))];
  const pick = (list, n) => shuffle(list, rand).slice(0, n);

  // 1. year of a release (EPs/albums + a few singles)
  for (const r of [...releases.filter((r) => r.type !== 'single'), ...pick(releases.filter((r) => r.type === 'single'), 2)].slice(0, 4)) {
    const options = [String(r.year), ...pick(allYears.filter((y) => y !== r.year), 3).map(String)];
    push('releaseYear', { options, correct: options.map((o) => o === String(r.year)), params: { release: r.title, date: longDate(r.date) } });
  }
  // 2. which EP/album contains a track (titles unique across the catalogue after normalization)
  const collections = releases.filter((r) => r.type !== 'single');
  const titleCount = new Map();
  for (const t of tracks) titleCount.set(normTitle(t.title), (titleCount.get(normTitle(t.title)) || 0) + 1);
  for (const t of pick(tracks.filter((t) => collections.some((r) => r.id === t.releaseId) && titleCount.get(normTitle(t.title)) === 1), 3)) {
    const own = collections.find((r) => r.id === t.releaseId);
    const options = [own.title, ...pick(collections.filter((r) => r.id !== own.id), 3).map((r) => r.title)];
    const holds = (title) => collections.find((r) => r.title === title).trackIds.some((id) => normTitle(tracks.find((x) => x.id === id).title) === normTitle(t.title));
    push('trackRelease', { options, correct: options.map(holds), params: { track: t.title, release: own.title, n: t.trackNumber } });
  }
  // 3. who is credited with Sam Davies (no collectives involved, distractors never credited on it)
  const people = [...new Set(tracks.flatMap((t) => t.artists))].filter((a) => a.toLowerCase() !== SELF && !GROUPS.has(a.toLowerCase()));
  const solo = tracks.filter((t) => t.artists.some((a) => a.toLowerCase() === SELF) && !t.artists.some((a) => GROUPS.has(a.toLowerCase())) && t.artists.length >= 2);
  const usedAnswers = new Set(), usedReleases = new Set();
  for (const t of shuffle(solo, rand)) {
    if (usedAnswers.size >= 3) break;
    const credited = (n) => t.artists.some((a) => a.toLowerCase() === n.toLowerCase());
    const answer = t.artists.find((a) => a.toLowerCase() !== SELF);
    if (usedAnswers.has(answer) || usedReleases.has(t.releaseId)) continue; // vary answers and releases
    usedAnswers.add(answer); usedReleases.add(t.releaseId);
    const options = [answer, ...pick(people.filter((p) => !credited(p)), 3)];
    push('credited', { options, correct: options.map(credited), params: { track: t.title, name: t.artistLine } });
  }
  // 4/5. which came first / latest — four releases from four different years
  for (const kind of ['whichFirst', 'whichLatest', 'whichFirst']) {
    const yrs = pick(allYears, 4);
    const rs = yrs.map((y) => pick(releases.filter((r) => r.year === y), 1)[0]);
    const target = [...rs].sort((a, b) => a.date.localeCompare(b.date))[kind === 'whichFirst' ? 0 : 3];
    const sameTitle = new Set(rs.map((r) => r.title)).size !== 4;
    if (sameTitle) continue;
    const dates = rs.map((r) => r.date);
    const best = kind === 'whichFirst' ? dates.slice().sort()[0] : dates.slice().sort().at(-1);
    push(kind, { options: rs.map((r) => r.title), correct: dates.map((d) => d === best), params: { release: target.title, date: longDate(target.date) } });
  }
  // 6. most-credited collaborator (only if the top count is unique)
  const counts = new Map();
  for (const t of tracks) for (const a of t.artists) if (a.toLowerCase() !== SELF && !GROUPS.has(a.toLowerCase())) counts.set(a, (counts.get(a) || 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  if (ranked.length >= 4 && ranked[0][1] > ranked[1][1]) {
    const options = [ranked[0][0], ...pick(ranked.slice(1, 7), 3).map(([n]) => n)];
    push('topCollaborator', { options, correct: options.map((o) => o === ranked[0][0]), params: { name: ranked[0][0], n: ranked[0][1] } });
  }
  if (out.length < 8) throw new Error(`quiz: only ${out.length} unambiguous questions (need ≥ 8)`);
  // Interleave question types (seeded) and renumber.
  return shuffle(out, rand).map((q, i) => ({ ...q, id: `q${String(i + 1).padStart(2, '0')}-${q.id.split('-').slice(1).join('-')}` }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = args();
  const res = await makeData({ meta: path.resolve(a.meta || path.join(ROOT, '.cache/raw/meta.json')), seed: a.seed || 'sd-2026' });
  console.log(`tracks ${res.tracks.length} · releases ${res.releases.length} · timeline ${res.timeline.length} · quiz ${res.quiz.length}`);
}
