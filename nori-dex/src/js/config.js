/* ==========================================================================
   CONFIG: site name, screens, relic cartridges and system buttons.
   Cartridges are pure data: add, remove or reorder them here. Icons are keys
   of js/icons.js. Screens are rendered by PL.sections.mount(id) (js/sections.js).
   ========================================================================== */
window.PL = window.PL || {};

PL.config = {
  siteName: 'NORI-DEX',
  tagline: _('Bestiary of the Land of Noris'),

  /* Plane themes: device glow and relic crystal colours. Purely visual; the
     plane names and lore live in PL.sky.planes (with their Placeholder status). */
  planes: {
    p1: { c1: '#7FD6DF', c2: '#2E7F95' },   // sky cyan
    p2: { c1: '#7BC46A', c2: '#3E7A33' },   // leaf green
    p3: { c1: '#F07A3E', c2: '#A8401A' },   // ember orange
    p4: { c1: '#A98BE0', c2: '#5A3E99' },   // abyssal violet
  },

  /* Screens (one per relic). title / subtitle show on the altar and in the tab bar. */
  sections: [
    { id: 'dex',    title: _('Nori-Dex'),    subtitle: _('The bestiary: every Nori we can show you'), icon: 'dex',    plane: 'p1' },
    { id: 'worlds', title: _('Worlds'),      subtitle: _('The four planes joined by the stream of mana'), icon: 'map', plane: 'p2' },
    { id: 'spirit', title: _('Spirit Quiz'), subtitle: _('Which Nori is your spirit guardian?'),        icon: 'star',   plane: 'p4' },
    { id: 'join',   title: _('Join'),        subtitle: _('Kickstarter, Steam and the studio'),          icon: 'flag',   plane: 'p3' },
  ],

  /* Relic cartridges. Drag one into the slot and its screen boots.
     title / cap: label on the relic; name / sub / blurb: the info card;
     opens: section id (see sections above); tab: optional sub-view passed to the screen;
     plane: crystal colour (key of planes); art: image on the relic face (official art only);
     facts: numbers on the info card (keys of FACTS in js/carts.js). */
  carts: [
    { id: 'dex', title: 'NORI-DEX', cap: 'BESTIARY', name: _('Nori-Dex'), sub: _('Bestiary'),
      blurb: _('Every Nori the studio has shown so far, with playtest readings.'),
      opens: 'dex', plane: 'p1', facts: ['noris'], art: 'assets/nori/hud-zer.webp' },
    { id: 'worlds', title: 'WORLDS', cap: 'THE FOUR PLANES', name: _('Worlds'), sub: _('The four planes'),
      blurb: _('Four planes joined by the eternal stream of mana.'),
      opens: 'worlds', plane: 'p2', facts: ['planes'], art: 'assets/shots/overgrown-ruins-960.webp' },
    { id: 'spirit', title: 'SPIRIT', cap: 'SPIRIT QUIZ', name: _('Spirit Quiz'), sub: _('Three questions'),
      blurb: _('Answer three questions and meet your spirit guardian.'),
      opens: 'spirit', plane: 'p4', facts: ['questions'], art: 'assets/nori/hud-garnia.webp' },
    { id: 'join', title: 'JOIN', cap: 'KICKSTARTER', name: _('Join'), sub: _('Back the campaign'),
      blurb: _('Kickstarter, Steam, Discord and the studio channels.'),
      opens: 'join', plane: 'p3', facts: ['days'], art: 'assets/logo/enthariel-games-logo.webp' },
  ],

  /* Round system buttons under the altar tiles */
  dock: [
    { id: 'controls', label: _('Controls'), icon: 'gamepad', color: '#7FD6DF' },
    { id: 'retro',    label: _('Glass effect'), icon: 'tv',  color: '#A98BE0' },
    { id: 'sound',    label: _('Sound'),    icon: 'sound',   color: '#ffffff' },
    { id: 'exit',     label: _('Sleep'),    icon: 'power',   color: '#F07A3E' },
  ],
};
