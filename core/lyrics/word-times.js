/*
 * core/lyrics/word-times.js - word timings for a lyric line (shared by every LyricRenderer).
 * Public API: wordTimes({ text, startSec, endSec, words? }) -> [{ t, end, text }]
 * Uses the line's own word timings when present, else spreads the words over 90 % of the line
 * by character count.
 */

/** [{ t, end, text }] for a line: its own word timings, or spread by character count. */
export function wordTimes({ text, startSec, endSec, words }) {
  if (Array.isArray(words) && words.length) return words;
  const parts = String(text).split(/\s+/).filter(Boolean);
  const span = Math.max(0.2, (endSec - startSec) * 0.9);
  const total = parts.reduce((n, w) => n + w.length + 1, 0);
  let acc = 0;
  return parts.map((w) => {
    const t = startSec + (span * acc) / total;
    acc += w.length + 1;
    return { t, end: startSec + (span * acc) / total, text: w };
  });
}
