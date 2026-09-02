import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { badRequest, notFound } from '../lib/errors.js';
import { sanitizeHtml, htmlToText, domToHtml } from '../lib/html.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_FILE = path.resolve(here, '../../data/artists.local.json');

const numericId = (value) => {
  if (!/^\d+$/.test(String(value))) throw badRequest('Artist id must be numeric.');
  return value;
};

/* ---- 1. artist profile ------------------------------------------------- */
export function shapeArtist(artist) {
  const descriptionHtml = artist.description?.dom ? domToHtml(artist.description.dom) : '';
  const html = sanitizeHtml(descriptionHtml);

  const socials = {
    instagram: artist.instagram_name ? `https://instagram.com/${artist.instagram_name}` : null,
    twitter: artist.twitter_name ? `https://twitter.com/${artist.twitter_name}` : null,
    facebook: artist.facebook_name ? `https://facebook.com/${artist.facebook_name}` : null
  };

  return {
    id: artist.id,
    name: artist.name,
    url: artist.url || null,
    bio: { html, text: htmlToText(html), source: html ? 'genius' : null, sourceUrl: artist.url || null },
    images: {
      profile: artist.image_url || null,
      header: artist.header_image_url || null
    },
    socials,
    socialLinks: Object.entries(socials).filter(([, value]) => value).map(([name, url]) => ({ name, url })),
    alternateNames: artist.alternate_names || [],
    verified: Boolean(artist.is_verified),
    meaningfulVerified: Boolean(artist.is_meaning_verified),
    followers: artist.followers_count ?? null
  };
}

async function readLocal() {
  try {
    return JSON.parse(await readFile(LOCAL_FILE, 'utf8'));
  } catch {
    return { artists: {} };
  }
}

/* ---- 4. hybrid: local wins per field, Genius fills the gaps ------------- */
export function mergeArtist(genius, local) {
  if (!local) return { ...genius, sources: { merged: false, fields: {} } };

  const fields = {};
  const pick = (key, localValue, geniusValue) => {
    const useLocal = localValue !== undefined && localValue !== null && localValue !== '' &&
      !(Array.isArray(localValue) && localValue.length === 0);
    fields[key] = useLocal ? 'local' : (geniusValue == null ? 'none' : 'genius');
    return useLocal ? localValue : geniusValue;
  };

  const merged = {
    id: genius?.id ?? local.geniusId ?? null,
    slug: local.slug || null,
    name: pick('name', local.name, genius?.name),
    url: genius?.url || null,
    role: local.role || null,
    years: local.years || null,
    status: local.status || null,
    bio: (() => {
      const localText = local.bio;
      const useLocal = Boolean(localText);
      fields.bio = useLocal ? 'local' : (genius?.bio?.text ? 'genius' : 'none');
      return useLocal
        ? { html: `<p>${localText}</p>`, text: localText, source: 'local', sourceUrl: null }
        : (genius?.bio || { html: '', text: '', source: null, sourceUrl: null });
    })(),
    images: {
      profile: pick('images.profile', local.image, genius?.images?.profile),
      header: pick('images.header', local.header, genius?.images?.header)
    },
    socials: { ...(genius?.socials || {}), ...(local.socials || {}) },
    signature: local.signature || null,
    listen: local.listen || [],
    appearsOn: local.on || [],
    facts: local.facts || [],
    alternateNames: genius?.alternateNames || [],
    verified: genius?.verified ?? false,
    followers: genius?.followers ?? null
  };
  merged.socialLinks = Object.entries(merged.socials).filter(([, v]) => v).map(([name, url]) => ({ name, url }));
  merged.sources = { merged: true, genius: Boolean(genius), local: true, fields };
  return merged;
}

export function artistsRouter({ genius }) {
  const router = Router();

  router.get('/local', async (req, res, next) => {
    try {
      const local = await readLocal();
      res.json({ artists: Object.values(local.artists || {}) });
    } catch (error) { next(error); }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const response = await genius.artist(numericId(req.params.id));
      if (!response?.artist) throw notFound('Artist', req.params.id);
      res.json(shapeArtist(response.artist));
    } catch (error) { next(error); }
  });

  /* /api/artists/:id/hybrid?slug=jesse-rutherford
     Also usable with id=local when the person has no Genius page at all. */
  router.get('/:id/hybrid', async (req, res, next) => {
    try {
      const store = await readLocal();
      const slug = String(req.query.slug || '').trim();
      const local = slug
        ? store.artists?.[slug]
        : Object.values(store.artists || {}).find(entry => String(entry.geniusId) === String(req.params.id));

      let shaped = null;
      if (req.params.id !== 'local') {
        try {
          const response = await genius.artist(numericId(req.params.id));
          if (response?.artist) shaped = shapeArtist(response.artist);
        } catch (error) {
          /* Genius being unreachable must not take the local profile with it */
          if (!local) throw error;
        }
      }

      if (!shaped && !local) throw notFound('Artist', req.params.id);
      res.json(mergeArtist(shaped, local));
    } catch (error) { next(error); }
  });

  return router;
}
