/* ==========================================================================
   CONFIG: site name, screens, relic cartridges and system buttons.
   Relics are pure data: add, remove or reorder them here. Icons are keys of
   js/icons.js. Screens are rendered by PL.sections.mount(id) (js/sections.js).
   ========================================================================== */
window.PL = window.PL || {};

PL.config = {
  siteName: 'NORI-DEX',
  tagline: _('Bestiary of the Land of Noris'),

  /* Screens a relic can open. 'spirit' has no relic of its own: the bestiary
     opens it with a button (ctx.go('spirit')). */
  sections: [
    { id: 'dex',    title: _('Nori-Dex'),    icon: 'dex' },
    { id: 'worlds', title: _('Worlds'),      icon: 'map' },
    { id: 'spirit', title: _('Spirit Quiz'), icon: 'star' },
  ],

  /* Relic cartridges. Drag one into the slot and its screen boots.
     Body style follows the studio's reference renders: stone, brass, vines and glowing runes,
     with a different tint per relic. The label art is official art only.
       title       engraved on the brass plaque (never drawn over the art)
       sub         small line under the plaque; placeholder:true draws it as a Placeholder tag
       name / blurb  info card next to the rack
       opens / tab   screen id and the sub-view it opens at (Worlds: plane id)
       art           label image (null = intentional "art pending" state)
       crop          [x, y, w, h] region of the art in source pixels, artSize = [w, h] of that file
       tint          stone colours (light, mid, dark), runes (left, right), vine colour, thorns
       crystal       colour of the pommel crystal and the device glow when seated
       chord         notes (Hz) of the attunement chime for this relic */
  carts: [
    { id: 'sky', title: 'THE SKY PROJECT', sub: _('NORI-DEX · BESTIARY'),
      name: _('The Sky Project'), blurb: _('The bestiary: the Noris from the studio\'s screenshots, plus the Spirit Quiz.'),
      opens: 'dex', art: 'assets/art/splash-with-logo-960.webp', artSize: [960, 540], crop: [24, 30, 560, 500],
      tint: { stone: ['#a3a39f', '#74746f', '#45454a'], runes: ['#ffd36b', '#ffd36b'], vine: '#6f9a3e', thorns: false },
      crystal: '#ffcf4a', chord: [523.25, 659.25, 783.99, 1046.5, 1318.5], facts: ['noris'] },
    { id: 'celestia', title: 'CELESTIA', sub: 'WORKING TITLE', placeholder: true,
      name: _('Celestia'), blurb: _('One of the four planes joined by the stream of mana. Its name is a working title.'),
      opens: 'worlds', tab: 'p1', art: 'assets/shots/celestial-observatory-960.webp', artSize: [960, 538], crop: [230, 16, 540, 490],
      tint: { stone: ['#9aa9bb', '#64758c', '#38475d'], runes: ['#6fd2ff', '#7dffb0'], vine: '#6f9a3e', thorns: false },
      crystal: '#6fe4ff', chord: [587.33, 739.99, 880, 1108.73, 1318.5], facts: ['planes'] },
    { id: 'abyssal', title: _('ABYSSAL PLANE'), sub: _('THE DEEPEST PLANE'),
      name: _('Abyssal Plane'), blurb: _('The deepest of the four planes: caves and depths, alien vegetation.'),
      opens: 'worlds', tab: 'p4', art: null,
      tint: { stone: ['#a0705a', '#6e3f2b', '#3a1f17'], runes: ['#ff5a3c', '#ffa040'], vine: '#4a2e1e', thorns: true },
      crystal: '#ff7a3a', chord: [220, 261.63, 329.63, 392, 493.88], facts: ['planes'] },
  ],

  /* Interchangeable grips: the two controller halves that slide onto the device's rails.
     Pick a set under the device (or G, or the altar's Grips button) and the old grips unlatch,
     slide off and fly away while the new ones fly in, slide down the rails and click.
     Each side: hi / mid / lo enamel tones; trim: the grip's accent (lever arrows, glow). */
  grips: [
    { id: 'halo', name: _('Halo & Sky'),
      l: { hi: '#ffe39a', mid: '#e8b93a', lo: '#8a5c1a', trim: '#fff1c4' },
      r: { hi: '#c8f4f8', mid: '#7FD6DF', lo: '#2e7f95', trim: '#effdff' } },
    { id: 'grove', name: _('Grove'),
      l: { hi: '#b4dd8f', mid: '#5E9E4A', lo: '#2c5222', trim: '#e9ffd8' },
      r: { hi: '#b4dd8f', mid: '#5E9E4A', lo: '#2c5222', trim: '#e9ffd8' } },
    { id: 'ember', name: _('Ember'),
      l: { hi: '#ffbf8a', mid: '#E2612B', lo: '#7d2a0e', trim: '#fff0e2' },
      r: { hi: '#ffbf8a', mid: '#E2612B', lo: '#7d2a0e', trim: '#fff0e2' } },
    { id: 'night', name: _('Nightglass'),
      l: { hi: '#3d5596', mid: '#1b2c5c', lo: '#0a1230', trim: '#E8B93A' },
      r: { hi: '#3d5596', mid: '#1b2c5c', lo: '#0a1230', trim: '#E8B93A' } },
  ],

  /* Round system buttons on the altar */
  dock: [
    { id: 'join',     label: _('Join & follow'), icon: 'star', color: '#E8B93A' },
    { id: 'controls', label: _('Controls'), icon: 'gamepad', color: '#7FD6DF' },
    { id: 'grips',    label: _('Grips'),    icon: 'swap',    color: '#E8B93A' },
    { id: 'retro',    label: _('Glass effect'), icon: 'tv',  color: '#A98BE0' },
    { id: 'sound',    label: _('Sound'),    icon: 'sound',   color: '#ffffff' },
    { id: 'exit',     label: _('Sleep'),    icon: 'power',   color: '#F07A3E' },
  ],
};
