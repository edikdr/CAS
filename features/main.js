/*
 * features/main.js - Stage 2 entry point (owned by Stage 2; core only calls it).
 *
 * Public API: export async function start() - core/app.js imports this module once the room is
 * ready (scene painted, guitar mounted, data loaded) and awaits start() before it opens a
 * ?track= link. A throw here is logged; the room keeps working without Stage 2 features.
 *
 * Register everything from here (HANDOFF.md "Stage 2: where your code goes"): modals
 * (ModalManager.register), track window content (TrackModal.setContent), the magazine lyric
 * renderer (registerRenderer), the film texture (FilmSlot.setRenderer), the collage in
 * #collage-slot, the style switcher. Import core modules directly; never edit core/.
 */

export async function start() {}
