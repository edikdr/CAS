/* ==========================================================================
   PL.sky: the only data file of the site (data contract, brief section 6).
   Hand-authored, under 20 KB. Owner: Sonnet (S1).

   STUB written by Opus from docs/studio-pack/seed.json so the device can be
   built and tested end to end. Values are copied from the seed without any
   additions. Sonnet: replace or extend freely, keeping the shape.

   Rules:
   • verified:false (or a 'working' / 'unverified' / 'pending' status) means the
     UI shows a Placeholder tag. Never present such a value as fact.
   • snapshot = an early playtest HUD reading, NOT species base stats.
   • Image paths point to the optimized WebP files in assets/ (made by
     scripts/bake-images.py from the originals in assets/src/). The build fails
     if a path here does not exist.
   ========================================================================== */
window.PL = window.PL || {};

PL.sky = {
  meta: { game: 'The Sky Project: Land of Noris', studio: 'Enthariel Games', city: 'Sevilla, Spain', builtAt: '2026-10-24' },

  hero: {
    id: 'kael', name: 'Kael',
    blurb: 'A Celestial Soulbonded to Aeris for hundreds of years. When Aeris disappears, Kael\'s calm life is turned upside down.',
    art: 'assets/nori/hud-kael.webp', verified: true,
  },

  types: [
    { id: 't1', label: 'Type I', color: '#E8B93A', verified: false },
    { id: 't2', label: 'Type II', color: '#5FB6D9', verified: false },
    { id: 't3', label: 'Type III', color: '#5E9E4A', verified: false },
    { id: 't4', label: 'Type IV', color: '#C9553A', verified: false },
    { id: 't5', label: 'Type V', color: '#8E6BBF', verified: false },
    { id: 't6', label: 'Type VI', color: '#3C4A66', verified: false },
  ],

  noris: [
    { id: 'zer', name: 'Zer', appearance: 'A spirit of blue flame that floats over drifting rune stones.',
      snapshot: { lv: 7, hp: 294 }, type: null, art: { regular: 'assets/nori/hud-zer.webp', alternate: null }, verified: true },
    { id: 'saltu', name: 'Saltu', appearance: 'A small leaf-sprout creature with a leaf hood and a calm face.',
      snapshot: { lv: 8, hp: 105 }, type: null, art: { regular: 'assets/nori/hud-saltu.webp', alternate: null }, verified: true },
    { id: 'corivel', name: 'Corivel', appearance: 'A blue-green horned creature with a pale skull-like face and trailing vines.',
      snapshot: { lv: 6, hp: 173 }, type: null, art: { regular: 'assets/nori/hud-corivel.webp', alternate: null }, verified: true },
    { id: 'denal', name: 'Denal', appearance: 'A fluffy cream-colored creature with big ears and two orange ring-shaped horns.',
      snapshot: { lv: 6, hp: 212 }, type: null, art: { regular: 'assets/nori/hud-denal.webp', alternate: null }, verified: true },
    { id: 'garnia', name: 'Garnia', appearance: 'A purple winged creature, part bat and part tiny dragon, with glowing yellow eyes.',
      snapshot: { lv: 9, hp: 168 }, type: null, art: { regular: 'assets/nori/hud-garnia.webp', alternate: null }, verified: true },
  ],

  planes: [
    { id: 'p1', order: 1, name: 'Celestia', nameStatus: 'working', blurb: '', art: 'assets/shots/celestial-observatory.webp', artStatus: 'unverified' },
    { id: 'p2', order: 2, name: 'Noreth', nameStatus: 'working', blurb: '', art: 'assets/shots/overgrown-ruins.webp', artStatus: 'unverified' },
    { id: 'p3', order: 3, name: 'Infernia', nameStatus: 'working', blurb: '', art: null, artStatus: 'pending' },
    { id: 'p4', order: 4, name: 'Abyssal Plane', nameStatus: 'confirmed',
      blurb: 'The deepest and darkest of the four planes: caves and depths, alien vegetation, magic hanging in the air.', art: null, artStatus: 'pending' },
  ],

  campaign: { endsOn: '2026-11-12', goalEUR: 15000 },

  links: {
    kickstarter: 'https://www.kickstarter.com/projects/entharielgames/the-sky-project-land-of-noris',
    studioSite: 'https://www.entharielgames.com/',
    steam: null,
    discord: null,
    game: {
      instagram: 'https://www.instagram.com/theskyproject_landofnoris/',
      x: 'https://x.com/theskyproject_',
      tiktok: 'https://www.tiktok.com/@theskyproject__',
    },
    studio: {
      x: 'https://x.com/EntharielGames',
      instagram: 'https://www.instagram.com/entharielgames/',
      tiktok: 'https://www.tiktok.com/@entharielgames',
      youtube: 'https://www.youtube.com/@EntharielGames',
    },
  },

  credits: [
    { role: 'Soundtrack', name: 'Elena Loredo (Elesky)' },
    { role: 'Cinematics', name: 'Liners (Kevin Soria)' },
  ],
};
