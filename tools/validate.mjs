/*
 * tools/validate.mjs - schema and consistency checks for every JSON file (docs/DATA_SCHEMA.md).
 *
 *   node tools/validate.mjs                -> exit 1 on any problem
 *   export validateRoot(root) -> string[]  (problems, empty = valid)
 *   export check* functions on parsed objects, for tests
 *
 * Covers: every JSON parses; releases / tracks / receipts shapes and cross-references
 * (counts 33 rows, 29 unique songs, receipts 17/7/8/1); every data/beats/<id>.json matches a
 * track and has numeric bpm, sorted beats/onsets inside the clip; beats/_index.json agrees with
 * the files; lyrics files (gated) shape and permission; verified facts; quiz; config/rights.json.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { LYRIC_PERMISSIONS } from '../core/rights.js';
import { ROOT, walk, readJson, fail } from './lib.mjs';

export const EXPECTED = { trackRows: 33, uniqueSongs: 29, receipts: { album: 17, singles: 7, demos: 8, appearances: 1 } };
const RELEASE_TYPES = ['album', 'demos', 'single', 'appearance'];
const RECEIPT_FOR_TYPE = { album: 'album', demos: 'demos', single: 'singles', appearance: 'appearances' };
const BEAT_STATUS = ['auto-unverified', 'verified'];
const LYRIC_SOURCES = ['owner-supplied', 'elevenlabs-scribe-draft'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v) && v > 0;
const isStr = (v) => typeof v === 'string' && v.length > 0;
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isHttps = (v, host) => {
  try { const u = new URL(v); return u.protocol === 'https:' && (!host || u.hostname === host || u.hostname.endsWith(`.${host}`)); }
  catch { return false; }
};
const sorted = (a) => a.every((v, i) => i === 0 || a[i - 1] <= v);

export function checkReleases(doc) {
  const e = [];
  if (!doc?.artist || !isInt(doc.artist.appleArtistId)) e.push('releases.json: artist.appleArtistId missing');
  if (!Array.isArray(doc?.releases)) return [...e, 'releases.json: releases[] missing'];
  const ids = new Set();
  for (const r of doc.releases) {
    const at = `releases.json: release ${r.id ?? '?'} (${r.title ?? '?'})`;
    if (!isInt(r.id) || ids.has(r.id)) e.push(`${at}: id missing or duplicate`);
    ids.add(r.id);
    if (!isStr(r.title)) e.push(`${at}: title`);
    if (!RELEASE_TYPES.includes(r.type)) e.push(`${at}: type "${r.type}" not in ${RELEASE_TYPES}`);
    if (!isDate(r.releaseDate)) e.push(`${at}: releaseDate`);
    if (!isHttps(r.appleUrl, 'music.apple.com')) e.push(`${at}: appleUrl`);
    if (r.artworkTemplate !== undefined && !String(r.artworkTemplate).includes('{size}')) e.push(`${at}: artworkTemplate without {size}`);
    if (!Array.isArray(r.trackIds) || r.trackIds.length !== r.trackCount) e.push(`${at}: trackIds.length != trackCount`);
  }
  return e;
}

export function checkTracks(doc, releasesDoc) {
  const e = [];
  if (!Array.isArray(doc?.tracks)) return ['tracks.json: tracks[] missing'];
  const releases = new Map((releasesDoc?.releases || []).map((r) => [r.id, r]));
  const byId = new Map();
  for (const t of doc.tracks) {
    const at = `tracks.json: track ${t.id ?? '?'} (${t.title ?? '?'})`;
    if (!isInt(t.id) || byId.has(t.id)) e.push(`${at}: id missing or duplicate`);
    byId.set(t.id, t);
    if (!isStr(t.title) || !isStr(t.artistCredit)) e.push(`${at}: title/artistCredit`);
    if (!isInt(t.durationMs)) e.push(`${at}: durationMs`);
    if (!isInt(t.trackNumber)) e.push(`${at}: trackNumber`);
    if (!isDate(t.releaseDate)) e.push(`${at}: releaseDate`);
    if (!Array.isArray(t.features)) e.push(`${at}: features[]`);
    if (t.previewUrl !== undefined && !isHttps(t.previewUrl, 'audio-ssl.itunes.apple.com')) e.push(`${at}: previewUrl must be https on audio-ssl.itunes.apple.com`);
    if (!isHttps(t.appleUrl, 'music.apple.com')) e.push(`${at}: appleUrl`);
    const rel = releases.get(t.releaseId);
    if (!rel) e.push(`${at}: releaseId ${t.releaseId} unknown`);
    else if (!rel.trackIds.includes(t.id)) e.push(`${at}: not listed in release ${rel.id}.trackIds`);
  }
  for (const t of doc.tracks) {
    if (t.alsoOnAlbumTrackId == null) continue;
    const album = byId.get(t.alsoOnAlbumTrackId);
    if (!album || releases.get(album.releaseId)?.type !== 'album' || album.alsoOnAlbumTrackId != null) {
      e.push(`tracks.json: track ${t.id}: alsoOnAlbumTrackId must point to an album row`);
    }
  }
  for (const r of releases.values()) for (const id of r.trackIds) if (!byId.has(id)) e.push(`releases.json: release ${r.id} lists unknown track ${id}`);
  const unique = doc.tracks.filter((t) => t.alsoOnAlbumTrackId == null).length;
  if (doc.tracks.length !== EXPECTED.trackRows) e.push(`tracks.json: ${doc.tracks.length} rows, expected ${EXPECTED.trackRows}`);
  if (unique !== EXPECTED.uniqueSongs) e.push(`tracks.json: ${unique} unique songs, expected ${EXPECTED.uniqueSongs}`);
  return e;
}

export function checkReceipts(doc, tracksDoc, releasesDoc) {
  const e = [];
  if (!Array.isArray(doc?.receipts)) return ['receipts.json: receipts[] missing'];
  const tracks = new Map((tracksDoc?.tracks || []).map((t) => [t.id, t]));
  const releases = new Map((releasesDoc?.releases || []).map((r) => [r.id, r]));
  const seen = new Map();
  for (const rc of doc.receipts) {
    const want = EXPECTED.receipts[rc.id];
    if (want === undefined || rc.kind !== rc.id) e.push(`receipts.json: unknown receipt "${rc.id}" / kind "${rc.kind}"`);
    if (!isStr(rc.title)) e.push(`receipts.json: ${rc.id}: title`);
    if (!Array.isArray(rc.trackIds)) { e.push(`receipts.json: ${rc.id}: trackIds[]`); continue; }
    if (want !== undefined && rc.trackIds.length !== want) e.push(`receipts.json: ${rc.id}: ${rc.trackIds.length} rows, expected ${want}`);
    for (const id of rc.trackIds) {
      const t = tracks.get(id);
      if (!t) { e.push(`receipts.json: ${rc.id}: unknown track ${id}`); continue; }
      if (seen.has(id)) e.push(`receipts.json: track ${id} on two receipts (${seen.get(id)}, ${rc.id})`);
      seen.set(id, rc.id);
      const type = releases.get(t.releaseId)?.type;
      if (RECEIPT_FOR_TYPE[type] !== rc.id) e.push(`receipts.json: ${rc.id}: track ${id} is from a ${type} release`);
    }
  }
  for (const id of tracks.keys()) if (!seen.has(id)) e.push(`receipts.json: track ${id} is on no receipt`);
  return e;
}

export function checkBeats(doc, id, tracksDoc) {
  const at = `beats/${id}.json`;
  const e = [];
  if (!(tracksDoc?.tracks || []).some((t) => t.id === id)) e.push(`${at}: no track with id ${id}`);
  if (doc.trackId !== id) e.push(`${at}: trackId ${doc.trackId} != file name`);
  if (!isNum(doc.bpm) || doc.bpm <= 0) e.push(`${at}: bpm must be a positive number`);
  if (!isNum(doc.durationSec) || doc.durationSec <= 0 || doc.durationSec > 31) e.push(`${at}: durationSec (0, 31]`);
  if (!BEAT_STATUS.includes(doc.status)) e.push(`${at}: status "${doc.status}"`);
  if (!isNum(doc.firstBeatSec)) e.push(`${at}: firstBeatSec`);
  const end = (doc.durationSec || 31) + 0.1;
  const beats = Array.isArray(doc.beats) ? doc.beats : null;
  if (!beats || !beats.every((t) => isNum(t) && t >= 0 && t <= end) || !sorted(beats)) e.push(`${at}: beats must be sorted seconds inside the clip`);
  const onsets = Array.isArray(doc.onsets) ? doc.onsets : null;
  if (!onsets || !onsets.every((o) => isNum(o?.t) && o.t >= 0 && o.t <= end && isNum(o.s) && o.s >= 0 && o.s <= 1) || !sorted(onsets.map((o) => o.t))) {
    e.push(`${at}: onsets must be sorted {t, s} with t inside the clip and s in [0, 1]`);
  }
  return e;
}

export function checkLyrics(doc, id, tracksDoc) {
  const at = `lyrics/${id}.json`;
  const e = [];
  if (!(tracksDoc?.tracks || []).some((t) => t.id === id)) e.push(`${at}: no track with id ${id}`);
  if (doc.trackId !== id) e.push(`${at}: trackId != file name`);
  if (!LYRIC_PERMISSIONS.includes(doc.permission)) e.push(`${at}: permission must be one of ${LYRIC_PERMISSIONS}`);
  if (!LYRIC_SOURCES.includes(doc.source)) e.push(`${at}: source must be one of ${LYRIC_SOURCES}`);
  if (typeof doc.reviewedByHuman !== 'boolean') e.push(`${at}: reviewedByHuman boolean`);
  const timed = (x) => isNum(x?.t) && isNum(x?.end) && x.t >= 0 && x.end > x.t && typeof x.text === 'string';
  const lines = Array.isArray(doc.lines) ? doc.lines : [];
  if (!lines.length || !lines.every(timed) || !sorted(lines.map((l) => l.t))) e.push(`${at}: lines must be sorted {t, end > t, text}`);
  lines.forEach((l, i) => {
    if (l.words !== undefined && (!Array.isArray(l.words) || !l.words.every(timed) || !sorted(l.words.map((w) => w.t)))) {
      e.push(`${at}: line ${i}: words must be sorted {t, end > t, text}`);
    }
  });
  return e;
}

export function checkFacts(doc) {
  if (!Array.isArray(doc)) return ['facts/verification.json: must be an array of {claim, value, source, retrieved, verified}'];
  return doc.flatMap((f, i) => (
    isStr(f.claim) && f.value !== undefined && isHttps(f.source) && isDate(f.retrieved) && typeof f.verified === 'boolean'
      ? [] : [`facts/verification.json: entry ${i} needs claim, value, https source, retrieved YYYY-MM-DD, verified`]));
}

export function checkQuiz(doc) {
  const qs = doc?.questions;
  if (!Array.isArray(qs) || qs.length < 8 || qs.length > 10) return ['quiz.json: 8-10 questions'];
  return qs.flatMap((q, i) => (
    isStr(q.q) && Array.isArray(q.options) && q.options.length === 4 && q.options.every(isStr) &&
    Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4 && isHttps(q.source) && q.verified === true
      ? [] : [`quiz.json: question ${i} needs q, 4 options, answer 0-3, https source, verified: true`]));
}

export function checkRights(doc) {
  const e = [];
  if (!['private-preview', 'public'].includes(doc?.buildMode)) e.push('config/rights.json: buildMode');
  const classes = Object.entries(doc?.classes || {});
  if (!classes.length) e.push('config/rights.json: classes{} missing');
  for (const [name, c] of classes) {
    if (typeof c.cleared !== 'boolean') e.push(`config/rights.json: ${name}.cleared must be boolean`);
    for (const k of ['paths', 'fields', 'hosts']) {
      if (c[k] !== undefined && !(Array.isArray(c[k]) && c[k].every(isStr))) e.push(`config/rights.json: ${name}.${k} must be an array of strings`);
    }
  }
  return e;
}

export async function validateRoot(root = ROOT) {
  const errors = [];
  const docs = new Map();
  for (const rel of (await walk(root)).filter((f) => /^(data|config|content|features)\/.+\.json$/.test(f))) {
    try { docs.set(rel, await readJson(path.join(root, rel))); }
    catch (err) { errors.push(`${rel}: invalid JSON (${err.message})`); }
  }
  const releases = docs.get('data/releases.json');
  const tracks = docs.get('data/tracks.json');
  const receipts = docs.get('data/receipts.json');
  if (!releases || !tracks || !receipts || !docs.get('config/rights.json')) {
    return [...errors, 'data/releases.json, data/tracks.json, data/receipts.json and config/rights.json are required'];
  }
  errors.push(...checkReleases(releases), ...checkTracks(tracks, releases), ...checkReceipts(receipts, tracks, releases));
  errors.push(...checkRights(docs.get('config/rights.json')));

  const beatIds = [];
  for (const [rel, doc] of docs) {
    let m;
    if ((m = /^data\/beats\/(\d+)\.json$/.exec(rel))) { beatIds.push(Number(m[1])); errors.push(...checkBeats(doc, Number(m[1]), tracks)); }
    else if ((m = /^data\/lyrics\/(\d+)\.json$/.exec(rel))) errors.push(...checkLyrics(doc, Number(m[1]), tracks));
    else if (/^data\/(beats|lyrics)\/(?!_index\.json$)/.test(rel)) errors.push(`${rel}: expected <trackId>.json`);
  }
  const index = docs.get('data/beats/_index.json');
  if (index) {
    const listed = new Map((index.tracks || []).map((t) => [t.trackId, t]));
    if (index.count !== beatIds.length || listed.size !== beatIds.length) errors.push(`beats/_index.json: count ${index.count} / ${listed.size} entries, ${beatIds.length} files`);
    for (const id of beatIds) {
      const b = docs.get(`data/beats/${id}.json`);
      const t = listed.get(id);
      if (!t || t.bpm !== b.bpm || t.status !== b.status) errors.push(`beats/_index.json: entry for ${id} missing or out of date (bpm/status)`);
    }
  }
  if (docs.has('data/facts/verification.json')) errors.push(...checkFacts(docs.get('data/facts/verification.json')));
  if (docs.has('data/quiz.json')) errors.push(...checkQuiz(docs.get('data/quiz.json')));
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = await validateRoot();
  fail('validate', errors);
  console.log('validate: all JSON valid (releases, tracks 33/29, receipts 17/7/8/1, beats, lyrics, facts, quiz, rights)');
}
