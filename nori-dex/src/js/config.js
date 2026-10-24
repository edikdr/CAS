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
       crystal       colour of the pommel crystal and the device glow when seated */
  carts: [
    { id: 'sky', title: 'THE SKY PROJECT', sub: 'NORI-DEX · BESTIARY',
      name: _('The Sky Project'), blurb: _('The Nori-Dex bestiary: every Nori the studio has shown, plus the Spirit Quiz.'),
      opens: 'dex', art: 'assets/art/splash-with-logo-960.webp', artSize: [960, 540], crop: [24, 30, 560, 500],
      tint: { stone: ['#a3a39f', '#74746f', '#45454a'], runes: ['#ffd36b', '#ffd36b'], vine: '#6f9a3e', thorns: false },
      crystal: '#ffcf4a', facts: ['noris'] },
    { id: 'celestia', title: 'CELESTIA', sub: 'WORKING TITLE', placeholder: true,
      name: _('Celestia'), blurb: _('One of the four planes joined by the stream of mana. Its name is a working title.'),
      opens: 'worlds', tab: 'p1', art: 'assets/shots/celestial-observatory-960.webp', artSize: [960, 538], crop: [230, 16, 540, 490],
      tint: { stone: ['#9aa9bb', '#64758c', '#38475d'], runes: ['#6fd2ff', '#7dffb0'], vine: '#6f9a3e', thorns: false },
      crystal: '#6fe4ff', facts: ['planes'] },
    { id: 'abyssal', title: 'ABYSSAL PLANE', sub: 'THE DEEPEST PLANE',
      name: _('Abyssal Plane'), blurb: _('The deepest and darkest of the four planes: caves and depths, alien vegetation.'),
      opens: 'worlds', tab: 'p4', art: null,
      tint: { stone: ['#a0705a', '#6e3f2b', '#3a1f17'], runes: ['#ff5a3c', '#ffa040'], vine: '#4a2e1e', thorns: true },
      crystal: '#ff7a3a', facts: ['planes'] },
  ],

  /* Round system buttons on the altar */
  dock: [
    { id: 'controls', label: _('Controls'), icon: 'gamepad', color: '#7FD6DF' },
    { id: 'retro',    label: _('Glass effect'), icon: 'tv',  color: '#A98BE0' },
    { id: 'sound',    label: _('Sound'),    icon: 'sound',   color: '#ffffff' },
    { id: 'exit',     label: _('Sleep'),    icon: 'power',   color: '#F07A3E' },
  ],
};
