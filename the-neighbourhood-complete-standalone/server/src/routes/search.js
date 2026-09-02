import { Router } from 'express';
import { badRequest } from '../lib/errors.js';

/* The front end knows song titles, not Genius ids. This is the bridge. */
export function searchRouter({ genius }) {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const q = String(req.query.q || '').trim();
      if (q.length < 2) throw badRequest('Query `q` must be at least two characters.');
      const artistFilter = String(req.query.artist || '').trim().toLowerCase();

      const response = await genius.search(q);
      let hits = (response?.hits || []).filter(hit => hit.type === 'song').map(hit => hit.result);
      if (artistFilter) {
        hits = hits.filter(song => (song.primary_artist?.name || '').toLowerCase().includes(artistFilter));
      }

      res.json({
        query: q,
        count: hits.length,
        results: hits.slice(0, 20).map(song => ({
          id: song.id,
          title: song.title,
          fullTitle: song.full_title || null,
          artist: song.primary_artist?.name || null,
          artistId: song.primary_artist?.id || null,
          url: song.url || null,
          artwork: song.song_art_image_thumbnail_url || null,
          pageviews: song.stats?.pageviews ?? null
        }))
      });
    } catch (error) { next(error); }
  });

  return router;
}
