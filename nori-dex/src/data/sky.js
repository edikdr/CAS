/* ==========================================================================
   PL.sky: the only data file of the site (data contract, brief section 6).
   Hand-authored, under 20 KB. Everything here comes from the brief's ground-truth table or from
   docs/studio-pack/seed.json; nothing is invented. The studio can edit this file directly
   (docs/HANDOVER.md explains how).

   Honesty rules, enforced by the screens:
   • verified:false, or a status of 'working' / 'unverified' / 'pending', shows a Placeholder tag.
     Never present such a value as fact.
   • snapshot = an early playtest HUD reading, labelled "Playtest snapshot", never "base stats".
   • type: null until the studio confirms the types. Type labels are generic slots.
   • art.alternate: null until the studio sends alternate-palette art. Then the Alternate toggle
     shows it; until then the toggle shows a labelled "Rare palette (demo)" effect.
   • Image paths are the optimised WebP files in assets/ (scripts/bake-images.py bakes them from
     assets/src/). The build fails if a path here does not exist. Write full literal paths.
   ========================================================================== */
window.PL = window.PL || {};

PL.sky = {
  meta: { game: 'The Sky Project: Land of Noris', studio: 'Enthariel Games', city: 'Sevilla, Spain', builtAt: '2026-10-24' },

  /* Kael is a character, not a Nori: he never appears in noris[] */
  hero: {
    id: 'kael', name: 'Kael',
    blurb: 'A Celestial Soulbonded to Aeris for hundreds of years. When Aeris disappears, Kael\'s calm life is turned upside down.',
    art: 'assets/nori/hud-kael.webp', verified: true,
  },

  /* six type slots exist; the names are not public, so the labels stay generic */
  types: [
    { id: 't1', label: 'Type I', color: '#E8B93A', verified: false },
    { id: 't2', label: 'Type II', color: '#5FB6D9', verified: false },
    { id: 't3', label: 'Type III', color: '#5E9E4A', verified: false },
    { id: 't4', label: 'Type IV', color: '#C9553A', verified: false },
    { id: 't5', label: 'Type V', color: '#8E6BBF', verified: false },
    { id: 't6', label: 'Type VI', color: '#3C4A66', verified: false },
  ],

  /* five Noris from the studio's screenshots (the full game has 200+) */
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

  /* four planes joined by the eternal stream of mana. Only the Abyssal Plane's name is official.
     Its blurb keeps to the ground-truth table ("the deepest ... caves and depths, alien vegetation");
     the seed also said "darkest" and "magic hanging in the air", which the table does not support. */
  planes: [
    { id: 'p1', order: 1, name: 'Celestia', nameStatus: 'working', blurb: '', art: 'assets/shots/celestial-observatory-960.webp', artStatus: 'unverified' },
    { id: 'p2', order: 2, name: 'Noreth', nameStatus: 'working', blurb: '', art: 'assets/shots/overgrown-ruins-960.webp', artStatus: 'unverified' },
    { id: 'p3', order: 3, name: 'Infernia', nameStatus: 'working', blurb: '', art: null, artStatus: 'pending' },
    { id: 'p4', order: 4, name: 'Abyssal Plane', nameStatus: 'confirmed',
      blurb: 'The deepest of the four planes: caves and depths, alien vegetation.', art: null, artStatus: 'pending' },
  ],

  /* the countdown is computed locally from endsOn and hides itself after that date (js/hub.js) */
  campaign: { startsOn: '2026-10-13', endsOn: '2026-11-12', goalEUR: 15000 },

  /* null means "link pending": the button renders disabled */
  links: {
    kickstarter: 'https://www.kickstarter.com/projects/entharielgames/the-sky-project-land-of-noris',
    studioSite: 'https://www.entharielgames.com/',
    steam: null,          // store page (wishlist)
    steamPlaytest: null,  // public playtest: ask the studio whether it has its own link
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

  /* every statement the screens make about the game, with its source (the brief's ground truth).
     Screens print these and nothing else about the game. */
  facts: {
    genre: { text: 'A hand-drawn 2D monster-collector RPG with a semi-open world and side-scrolling platform exploration.', source: 'Studio press kit' },
    studio: { text: 'Made by Enthariel Games in Sevilla, Spain: nine developers, self-funded until the Kickstarter.', source: 'Press kit, press release' },
    combat: { text: 'Turn-based 3v3 combat with permadeath: a Nori lost in battle is gone for good.', source: 'Press kit, store copy' },
    scale: { text: '200+ Noris, 6 types, 300+ abilities, evolutions, and legendary and rare alternate-color Noris.', source: 'Store copy' },
    planes: { text: 'Four planes joined by the eternal stream of mana.', source: 'Press kit, press release' },
    stretch: { text: 'Stretch goals include extra songs, legendary-creature side quests and shiny (alternate-color) versions of every Nori.', source: 'Kickstarter tracker, press release' },
    platforms: { text: 'Steam (public playtest live), Nintendo Switch, Nintendo Switch 2', source: 'Press kit, Kickstarter updates' },
  },
};
