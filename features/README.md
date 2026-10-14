# features/

Owned by Stage 2 (CONTRACT section 6): receipts, track-modal content, about, quiz, merch block, style switcher.
Ships `.js`, `.css` and `.json` only; images, sounds and fonts go in `assets/<class folder>/` (see `docs/ASSET_REGISTER.md`).
Entry point: `features/main.js` (`export async function start()`), imported by core once the room is ready - register your modals, renderers and collage there (`HANDOFF.md`, "Stage 2: where your code goes").
Use the core interfaces listed in `HANDOFF.md`; never edit `core/`.
