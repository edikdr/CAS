/*
 * core/clock.js - the site's BeatClock instance: bound to PreviewPlayer and the single Loop.
 * Public API: BeatClock (see core/beat-clock.js).
 */

import { createBeatClock } from './beat-clock.js';
import { PreviewPlayer } from './preview-player.js';
import { Loop } from './loop.js';

export const BeatClock = createBeatClock({ player: PreviewPlayer, loop: Loop });
