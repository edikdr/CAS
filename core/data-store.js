/*
 * core/data-store.js - read-only access to the site's JSON data (CONTRACT section 7).
 *
 * Public API (DataStore, or createDataStore(options) for tests):
 *   await load()      -> fetches releases, tracks and receipts once (about 6 KB gzip)
 *   release(id)       -> release object or null           } sync, after load()
 *   track(id)         -> track row or null                 } ids may be numbers or strings
 *   receipts()        -> [{id, title, kind, trackIds}]     }
 *   beats(trackId)    -> Promise<beats JSON | null>        } lazy, cached per id;
 *   lyrics(trackId)   -> Promise<lyrics JSON | null>       } null = missing or not allowed
 *   facts()           -> Promise<[verified fact entries]>  }
 *
 * lyrics() returns text only when RightsGate allows the class AND the file's `permission`
 * allows it in this build (the build also strips such files: two independent locks).
 * Everything returned is frozen: never mutate data in place.
 *
 * Must not change: method names, null-for-missing semantics, frozen results.
 */

import { fetchJson } from './fetch-json.js';
import { RightsGate } from './rights.js';

function deepFreeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.values(v).forEach(deepFreeze);
    Object.freeze(v);
  }
  return v;
}

export function createDataStore({
  load = fetchJson,
  rights = RightsGate,
  base = new URL('../data/', import.meta.url),
} = {}) {
  let releases = null;
  let tracks = null;
  let receipts = null;
  const lazy = new Map();

  const url = (path) => new URL(path, base);

  function need() {
    if (!tracks) throw new Error('DataStore: call load() first');
  }

  function once(key, make) {
    if (!lazy.has(key)) {
      lazy.set(key, make().then(deepFreeze, (e) => { lazy.delete(key); throw e; }));
    }
    return lazy.get(key);
  }

  return {
    async load() {
      if (tracks) return this;
      const [r, t, c] = await Promise.all(
        ['releases.json', 'tracks.json', 'receipts.json'].map((f) => load(url(f))),
      );
      if (!r || !t || !c) throw new Error('DataStore: releases/tracks/receipts missing');
      releases = new Map(deepFreeze(r).releases.map((x) => [x.id, x]));
      receipts = deepFreeze(c).receipts;
      tracks = new Map(deepFreeze(t).tracks.map((x) => [x.id, x]));
      return this;
    },

    release(id) { need(); return releases.get(Number(id)) ?? null; },
    track(id) { need(); return tracks.get(Number(id)) ?? null; },
    receipts() { need(); return receipts; },

    beats(trackId) {
      need();
      const id = Number(trackId);
      if (!tracks.has(id)) return Promise.resolve(null);
      return once(`beats/${id}`, () => load(url(`beats/${id}.json`)));
    },

    lyrics(trackId) {
      need();
      const id = Number(trackId);
      if (!tracks.has(id) || !rights.allows('lyrics')) return Promise.resolve(null);
      return once(`lyrics/${id}`, async () => {
        const doc = await load(url(`lyrics/${id}.json`));
        return doc && doc.trackId === id && rights.allowsLyrics(doc.permission) ? doc : null;
      });
    },

    facts() {
      return once('facts', async () => {
        const doc = await load(url('facts/verification.json'));
        return (Array.isArray(doc) ? doc : []).filter((f) => f.verified === true);
      });
    },
  };
}

export const DataStore = createDataStore();
