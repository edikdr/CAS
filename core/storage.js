/*
 * core/storage.js - the only door to localStorage (CONTRACT section 2).
 *
 * Public API:
 *   storage.get(key, fallback)  -> stored value (JSON) or `fallback`
 *   storage.set(key, value)     -> stores JSON; never throws
 *   storage.remove(key)
 *   KEYS                        -> the whitelist of keys
 *   createStorage(backend)      -> a separate instance (tests pass a fake backend or null)
 *
 * Works when storage is missing, blocked or full: values then live in memory for the
 * session. Keys are namespaced ("sunniva:") and whitelisted; an unknown key is a
 * programming error and throws.
 *
 * Must not change: method names, the key names (they are users' saved settings).
 */

export const KEYS = Object.freeze(['theme', 'lyricMode', 'lights', 'guitarMode', 'motion', 'quizBest', 'volume']);
const PREFIX = 'sunniva:';

function probe() {
  try {
    const ls = globalThis.localStorage;
    ls.setItem(PREFIX + 'probe', '1');
    ls.removeItem(PREFIX + 'probe');
    return ls;
  } catch {
    return null;
  }
}

export function createStorage(backend = probe()) {
  const memory = new Map();

  function check(key) {
    if (!KEYS.includes(key)) throw new TypeError(`storage: unknown key "${key}"`);
    return PREFIX + key;
  }

  return {
    get(key, fallback = null) {
      const k = check(key);
      if (memory.has(k)) return memory.get(k);
      try {
        const raw = backend ? backend.getItem(k) : null;
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      const k = check(key);
      try {
        if (!backend) throw new Error('no storage');
        backend.setItem(k, JSON.stringify(value));
        memory.delete(k);
      } catch {
        memory.set(k, value);
      }
    },
    remove(key) {
      const k = check(key);
      memory.delete(k);
      try { if (backend) backend.removeItem(k); } catch { /* blocked: memory copy is already gone */ }
    },
  };
}

export const storage = createStorage();
