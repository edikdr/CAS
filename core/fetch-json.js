/*
 * core/fetch-json.js - same-origin JSON loader shared by core modules.
 *
 * Public API: fetchJson(url) -> parsed JSON, or null when the file does not exist (404).
 * Any other failure (network, 5xx, bad JSON) rejects, so callers can tell "missing" from "broken".
 */

export async function fetchJson(url) {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`fetchJson: ${res.status} for ${url}`);
  return res.json();
}
