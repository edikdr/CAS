// ES module entry: `import LyricsEngine from './lyrics-engine.mjs'`.
// The UMD file registers globalThis.LyricsEngine when evaluated; this re-exports it.
import './lyrics-engine.js';

const LyricsEngine = globalThis.LyricsEngine;
export default LyricsEngine;
export const { create, auto, itunesPreview, offsetsFromJson, parseLRC, sources, themes } = LyricsEngine;
