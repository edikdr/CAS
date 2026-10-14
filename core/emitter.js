/*
 * core/emitter.js - minimal event emitter used by core services.
 *
 * Public API: createEmitter() -> { on(type, fn) -> off(), off(type, fn), emit(type, detail) }
 * A throwing listener is reported asynchronously and does not stop the others.
 */

export function createEmitter() {
  const map = new Map();
  return {
    on(type, fn) {
      if (!map.has(type)) map.set(type, new Set());
      map.get(type).add(fn);
      return () => map.get(type)?.delete(fn);
    },
    off(type, fn) { map.get(type)?.delete(fn); },
    emit(type, detail) {
      for (const fn of [...(map.get(type) || [])]) {
        try { fn(detail); } catch (e) { setTimeout(() => { throw e; }); }
      }
    },
  };
}
