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
   • Text the player reads is wrapped in _() so it can be translated (js/i18n/es.js). Names and
     numbers are not wrapped.
   ========================================================================== */
window.PL = window.PL || {};

PL.sky = {
  meta: { game: 'The Sky Project: Land of Noris', studio: 'Enthariel Games', city: 'Sevilla, Spain', builtAt: '2026-10-24' },

  /* Kael is a character, not a Nori: he never appears in noris[] */
  hero: {
    id: 'kael', name: 'Kael',
    blurb: _('A Celestial Soulbonded to Aeris for hundreds of years. When Aeris disappears, Kael\'s calm life is turned upside down.'),
    art: 'assets/nori/hud-kael.webp', verified: true,
  },

  /* six type slots exist; the names are not public, so the labels stay generic */
  types: [
    { id: 't1', label: _('Type I'), color: '#E8B93A', verified: false },
    { id: 't2', label: _('Type II'), color: '#5FB6D9', verified: false },
    { id: 't3', label: _('Type III'), color: '#5E9E4A', verified: false },
    { id: 't4', label: _('Type IV'), color: '#C9553A', verified: false },
    { id: 't5', label: _('Type V'), color: '#8E6BBF', verified: false },
    { id: 't6', label: _('Type VI'), color: '#3C4A66', verified: false },
  ],

  /* five Noris from the studio's screenshots (the full game has 200+) */
  noris: [
    { id: 'zer', name: 'Zer', appearance: _('A spirit of blue flame that floats over drifting rune stones.'),
      snapshot: { lv: 7, hp: 294 }, type: null, art: { regular: 'assets/nori/hud-zer.webp', alternate: null }, verified: true },
    { id: 'saltu', name: 'Saltu', appearance: _('A small leaf-sprout creature with a leaf hood and a calm face.'),
      snapshot: { lv: 8, hp: 105 }, type: null, art: { regular: 'assets/nori/hud-saltu.webp', alternate: null }, verified: true },
    { id: 'corivel', name: 'Corivel', appearance: _('A blue-green horned creature with a pale skull-like face and trailing vines.'),
      snapshot: { lv: 6, hp: 173 }, type: null, art: { regular: 'assets/nori/hud-corivel.webp', alternate: null }, verified: true },
    { id: 'denal', name: 'Denal', appearance: _('A fluffy cream-colored creature with big ears and two orange ring-shaped horns.'),
      snapshot: { lv: 6, hp: 212 }, type: null, art: { regular: 'assets/nori/hud-denal.webp', alternate: null }, verified: true },
    { id: 'garnia', name: 'Garnia', appearance: _('A purple winged creature, part bat and part tiny dragon, with glowing yellow eyes.'),
      snapshot: { lv: 9, hp: 168 }, type: null, art: { regular: 'assets/nori/hud-garnia.webp', alternate: null }, verified: true },
  ],

  /* four planes joined by the eternal stream of mana. Only the Abyssal Plane's name is official.
     Its blurb keeps to the ground-truth table ("the deepest ... caves and depths, alien vegetation");
     the seed also said "darkest" and "magic hanging in the air", which the table does not support. */
  planes: [
    { id: 'p1', order: 1, name: 'Celestia', nameStatus: 'working', blurb: '', art: 'assets/shots/celestial-observatory-960.webp', artStatus: 'unverified' },
    { id: 'p2', order: 2, name: 'Noreth', nameStatus: 'working', blurb: '', art: 'assets/shots/overgrown-ruins-960.webp', artStatus: 'unverified' },
    { id: 'p3', order: 3, name: 'Infernia', nameStatus: 'working', blurb: '', art: null, artStatus: 'pending' },
    { id: 'p4', order: 4, name: _('Abyssal Plane'), nameStatus: 'confirmed',
      blurb: _('The deepest of the four planes: caves and depths, alien vegetation.'), art: null, artStatus: 'pending' },
  ],

  /* the countdown is computed locally from endsOn and hides itself after that date (js/hub.js) */
  campaign: { startsOn: '2026-10-13', endsOn: '2026-11-12', goalEUR: 15000 },

  /* null means "link pending": the button renders disabled.
     Checked on 25 Oct 2026 against the studio's own pages (their Linktree, linktr.ee/EntharielGames, and the Steam page
     itself): steam = the game's Steam page (a "coming soon" page, so it takes wishlists); discord = the invite the
     studio publishes for "The Sky Project: Land of Noris Discord Server"; facebook = the game's page; bluesky = the
     studio's account. steamPlaytest stays null until the studio says where the playtest is joined.
     Also on the studio's Linktree, not shown: LinkedIn (linkedin.com/company/enthariel-games) and the press kit. */
  links: {
    kickstarter: 'https://www.kickstarter.com/projects/entharielgames/the-sky-project-land-of-noris',
    studioSite: 'https://www.entharielgames.com/',
    steam: 'https://store.steampowered.com/app/4415570/The_Sky_Project_Land_of_Noris',
    steamPlaytest: null,  // public playtest: ask the studio whether it has its own link
    discord: 'https://discord.gg/WRDKmgUq4R',
    game: {
      instagram: 'https://www.instagram.com/theskyproject_landofnoris/',
      x: 'https://x.com/theskyproject_',
      tiktok: 'https://www.tiktok.com/@theskyproject__',
      facebook: 'https://www.facebook.com/profile.php?id=61582429482517',
    },
    studio: {
      x: 'https://x.com/EntharielGames',
      instagram: 'https://www.instagram.com/entharielgames/',
      tiktok: 'https://www.tiktok.com/@entharielgames',
      youtube: 'https://www.youtube.com/@EntharielGames',
      bluesky: 'https://bsky.app/profile/entharielgames.bsky.social',
    },
  },

  credits: [
    { role: _('Soundtrack'), name: 'Elena Loredo (Elesky)' },
    { role: _('Cinematics'), name: 'Liners (Kevin Soria)' },
  ],

  /* every statement the screens make about the game, with its source (the brief's ground truth).
     Screens print these and nothing else about the game. */
  facts: {
    genre: { text: _('A hand-drawn 2D monster-collector RPG with a semi-open world and side-scrolling platform exploration.'), source: 'Studio press kit' },
    studio: { text: _('Made by Enthariel Games in Sevilla, Spain: nine developers, self-funded until the Kickstarter.'), source: 'Press kit, press release' },
    combat: { text: _('Turn-based 3v3 combat with permadeath: a Nori lost in battle is gone for good.'), source: 'Press kit, store copy' },
    scale: { text: _('200+ Noris, 6 types, 300+ abilities, evolutions, and legendary and rare alternate-color Noris.'), source: 'Store copy' },
    planes: { text: _('Four planes joined by the eternal stream of mana.'), source: 'Press kit, press release' },
    stretch: { text: _('Stretch goals include extra songs, legendary-creature side quests and shiny (alternate-color) versions of every Nori.'), source: 'Kickstarter tracker, press release' },
    platforms: { text: _('Steam (public playtest live), Nintendo Switch, Nintendo Switch 2'), source: 'Press kit, Kickstarter updates' },
  },
};
