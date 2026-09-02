import { Router } from 'express';
import { badRequest } from '../lib/errors.js';
import { sanitizeHtml, htmlToText, domToHtml } from '../lib/html.js';
import { matchAnnotations } from '../lib/match.js';

/* ---- 2. referents and annotations -------------------------------------- */
export function shapeReferents(referents) {
  const out = [];
  for (const referent of referents || []) {
    for (const annotation of referent.annotations || []) {
      const body = annotation.body?.dom ? domToHtml(annotation.body.dom) : (annotation.body?.html || '');
      const html = sanitizeHtml(body);
      if (!html) continue;
      out.push({
        id: annotation.id,
        referentId: referent.id,
        fragment: referent.fragment || '',
        range: referent.range || null,
        body: html,
        text: htmlToText(html),
        url: annotation.url || referent.url || null,
        state: annotation.state || null,
        votes: annotation.votes_total ?? null,
        verified: Boolean(annotation.verified),
        authors: (annotation.authors || []).map(a => a.user?.name).filter(Boolean),
        source: 'genius'
      });
    }
  }
  return out;
}

export function annotationsRouter({ genius }) {
  const router = Router();

  const collect = async (songId) => {
    if (!/^\d+$/.test(String(songId))) throw badRequest('Song id must be numeric.');
    /* referents are paged; a long song can carry well over fifty */
    const all = [];
    for (let page = 1; page <= 4; page += 1) {
      const response = await genius.referents(songId, { perPage: 50, page });
      const batch = response?.referents || [];
      all.push(...batch);
      if (batch.length < 50) break;
    }
    return shapeReferents(all);
  };

  router.get('/:id/annotations', async (req, res, next) => {
    try {
      const annotations = await collect(req.params.id);
      res.json({ songId: Number(req.params.id), count: annotations.length, annotations, source: 'genius' });
    } catch (error) { next(error); }
  });

  /* Send the lines you already have; get them back with the annotation spans
     attached, ready to underline and turn into popups. */
  router.post('/:id/annotations/match', async (req, res, next) => {
    try {
      const body = req.body || {};
      const lines = Array.isArray(body.lines)
        ? body.lines
        : typeof body.text === 'string' ? body.text.split('\n') : null;
      if (!lines) throw badRequest('Provide either `lines` (array of strings) or `text` (string).');
      if (lines.length > 400) throw badRequest('Too many lines; 400 is the ceiling.');

      const annotations = await collect(req.params.id);
      const result = matchAnnotations(lines, annotations);
      res.json({
        songId: Number(req.params.id),
        total: annotations.length,
        matched: result.matched,
        unmatched: result.unmatched,
        lines: result.lines,
        source: 'genius'
      });
    } catch (error) { next(error); }
  });

  return router;
}
