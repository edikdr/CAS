import { Router } from 'express';
import { badRequest, notFound } from '../lib/errors.js';
import { sanitizeHtml, htmlToText, domToHtml } from '../lib/html.js';

const id = (value) => {
  if (!/^\d+$/.test(String(value))) throw badRequest('Song id must be numeric.');
  return value;
};

/* ---- 3. artwork -------------------------------------------------------
   Genius hands back the same picture for every track on a record when the
   single has no art of its own. That is detected rather than passed off as
   cover art, and the header image is offered as the next best thing. */
export function shapeArtwork(song) {
  const albumCover = song.album?.cover_art_url || null;
  const songArt = song.song_art_image_url || null;
  const headerArt = song.header_image_url || null;
  const isAlbumArt = Boolean(songArt && albumCover && songArt === albumCover);

  const primary = !songArt ? headerArt
    : isAlbumArt ? (headerArt && headerArt !== albumCover ? headerArt : songArt)
    : songArt;

  return {
    url: primary || null,
    thumbnail: song.song_art_image_thumbnail_url || song.header_image_thumbnail_url || null,
    source: !songArt ? 'header'
      : isAlbumArt ? (headerArt && headerArt !== albumCover ? 'header_fallback' : 'album')
      : 'single',
    isAlbumArt,
    albumCover,
    songArt,
    headerArt,
    album: song.album ? { id: song.album.id, name: song.album.name, url: song.album.url } : null
  };
}

/* ---- 5. metrics ------------------------------------------------------- */
export function shapeStats(song) {
  const stats = song.stats || {};
  return {
    pageviews: stats.pageviews ?? null,
    hot: Boolean(stats.hot),
    concurrents: stats.concurrents ?? null,
    annotations: {
      accepted: stats.accepted_annotations ?? null,
      unreviewed: stats.unreviewed_annotations ?? null,
      verified: stats.verified_annotations ?? null,
      total: song.annotation_count ?? null
    },
    contributors: stats.contributors ?? null,
    transcriber: song.transcription_state || null,
    lyricsState: song.lyrics_state || null,
    releaseDate: song.release_date_for_display || song.release_date || null
  };
}

/* ---- 6. background ---------------------------------------------------- */
export function shapeBackground(song) {
  const fromDescription = song.description?.dom ? domToHtml(song.description.dom) : '';
  const annotationBody = song.description_annotation?.annotations?.[0]?.body;
  const fromAnnotation = annotationBody?.dom ? domToHtml(annotationBody.dom) : (annotationBody?.html || '');

  const html = sanitizeHtml(fromDescription || fromAnnotation || '');
  const text = htmlToText(html);

  return {
    html,
    text,
    /* Genius editorial content. Their API terms ask that it is credited and
       linked back, so the source always travels with the copy. */
    source: html ? 'genius' : null,
    sourceUrl: song.url || null,
    hasContent: Boolean(text && text.length > 1),
    verifiedBy: song.description_annotation?.annotations?.[0]?.authors?.map(a => a.user?.name).filter(Boolean) || []
  };
}

/* ---- 7. covers, remixes, alternative versions -------------------------- */
const RELATION_LABELS = {
  samples: 'Samples',
  sampled_in: 'Sampled in',
  interpolates: 'Interpolates',
  interpolated_by: 'Interpolated by',
  cover_of: 'Cover of',
  covered_by: 'Covered by',
  remix_of: 'Remix of',
  remixed_by: 'Remixed by',
  live_version_of: 'Live version of',
  performed_live_as: 'Performed live as',
  translation_of: 'Translation of',
  translations: 'Translations'
};
const COVER_KINDS = new Set(['cover_of', 'covered_by', 'remix_of', 'remixed_by', 'live_version_of', 'performed_live_as']);

export function shapeRelations(song) {
  const groups = (song.song_relationships || [])
    .filter(group => Array.isArray(group.songs) && group.songs.length)
    .map(group => ({
      type: group.relationship_type || group.type || 'related',
      label: RELATION_LABELS[group.relationship_type] || group.relationship_type || 'Related',
      isCoverLike: COVER_KINDS.has(group.relationship_type),
      songs: group.songs.map(entry => ({
        id: entry.id,
        title: entry.title,
        fullTitle: entry.full_title || null,
        artist: entry.primary_artist?.name || null,
        artistId: entry.primary_artist?.id || null,
        url: entry.url || null,
        artwork: entry.song_art_image_thumbnail_url || entry.header_image_thumbnail_url || null,
        pageviews: entry.stats?.pageviews ?? null
      }))
    }));

  return {
    groups,
    covers: groups.filter(group => group.isCoverLike).flatMap(group =>
      group.songs.map(entry => ({ ...entry, relation: group.type, relationLabel: group.label }))),
    total: groups.reduce((sum, group) => sum + group.songs.length, 0)
  };
}

export function shapeSong(song) {
  return {
    id: song.id,
    title: song.title,
    fullTitle: song.full_title || null,
    url: song.url || null,
    artist: song.primary_artist
      ? { id: song.primary_artist.id, name: song.primary_artist.name, url: song.primary_artist.url,
          image: song.primary_artist.image_url || null }
      : null,
    featured: (song.featured_artists || []).map(a => ({ id: a.id, name: a.name, url: a.url })),
    producers: (song.producer_artists || []).map(a => ({ id: a.id, name: a.name })),
    writers: (song.writer_artists || []).map(a => ({ id: a.id, name: a.name })),
    artwork: shapeArtwork(song),
    stats: shapeStats(song),
    background: shapeBackground(song),
    relations: shapeRelations(song)
  };
}

export function songsRouter({ genius }) {
  const router = Router();

  const load = async (songId) => {
    const response = await genius.song(id(songId));
    const song = response?.song;
    if (!song) throw notFound('Song', songId);
    return song;
  };

  /* everything about a song in one round trip */
  router.get('/:id', async (req, res, next) => {
    try { res.json(shapeSong(await load(req.params.id))); } catch (error) { next(error); }
  });

  router.get('/:id/artwork', async (req, res, next) => {
    try { res.json(shapeArtwork(await load(req.params.id))); } catch (error) { next(error); }
  });

  router.get('/:id/stats', async (req, res, next) => {
    try { res.json(shapeStats(await load(req.params.id))); } catch (error) { next(error); }
  });

  router.get('/:id/background', async (req, res, next) => {
    try { res.json(shapeBackground(await load(req.params.id))); } catch (error) { next(error); }
  });

  router.get('/:id/relations', async (req, res, next) => {
    try { res.json(shapeRelations(await load(req.params.id))); } catch (error) { next(error); }
  });

  return router;
}
