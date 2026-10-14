/*
 * core/rights.js - the rights gate (CONTRACT section 3).
 *
 * Public API:
 *   RightsGate.load()              -> reads config/rights.json of this build (call once at boot)
 *   RightsGate.allows(className)   -> may this build use the asset class? (classes: config/rights.json)
 *   RightsGate.allowsLyrics(perm)  -> may lyric text with this `permission` be shown?
 *   RightsGate.isPublic            -> true in a PUBLIC_BUILD
 *   createRightsGate(config)       -> pure gate, shared by the browser, tools/build.mjs and tests
 *
 * Rules: a private-preview build may use every class; a public build only classes with
 * `cleared: true`. Unknown classes and the state before load() are refused (fail closed).
 * Lyrics: "granted" shows everywhere the class is allowed, "private-preview" only in a
 * private build, "none" or anything else never.
 *
 * Must not change: allows()/allowsLyrics() semantics - the build strips files with the same logic.
 */

import { fetchJson } from './fetch-json.js';

export const LYRIC_PERMISSIONS = Object.freeze(['none', 'private-preview', 'granted']);

export function createRightsGate(config) {
  const isPublic = config.buildMode === 'public';
  const classes = config.classes || {};

  function allows(className) {
    const c = classes[className];
    if (!c) {
      console.warn(`RightsGate: unknown class "${className}" - refused`);
      return false;
    }
    return isPublic ? c.cleared === true : true;
  }

  function allowsLyrics(permission) {
    if (!allows('lyrics')) return false;
    return permission === 'granted' || (!isPublic && permission === 'private-preview');
  }

  return { isPublic, allows, allowsLyrics };
}

const CLOSED = { isPublic: true, allows: () => false, allowsLyrics: () => false };
let gate = CLOSED;

export const RightsGate = {
  async load(url = new URL('../config/rights.json', import.meta.url)) {
    const config = await fetchJson(url);
    if (!config) throw new Error('RightsGate: config/rights.json is missing');
    gate = createRightsGate(config);
    return this;
  },
  allows: (className) => gate.allows(className),
  allowsLyrics: (permission) => gate.allowsLyrics(permission),
  get isPublic() { return gate.isPublic; },
};
