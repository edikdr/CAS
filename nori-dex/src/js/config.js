/* ==========================================================================
   КОНФИГ — здесь меняются название, разделы меню и системные кнопки.
   Разделы пока заглушки: заменишь названия/цвета/иконки, когда решишь
   с контентом. Иконки — ключи из js/icons.js.
   ========================================================================== */
window.PL = window.PL || {};

PL.config = {
  siteName: 'POKÉLORE',
  tagline: _('interactive lore wiki'),
  userName: _('Trainer'),

  // Плитки главного меню (как игры на Switch)
  sections: [
    {
      id: 'regions',
      title: _('Regions'),
      subtitle: _('Kanto, Johto, Hoenn and beyond'),
      icon: 'map',
      c1: '#36d17c', c2: '#0b7f55',
    },
    {
      id: 'pokedex',
      title: _('Pokédex'),
      subtitle: _('All 1025 Pokémon: types, stats, evolutions'),
      icon: 'dex',
      c1: '#ff6a52', c2: '#c22d3c',
    },
    {
      id: 'legends',
      title: _('Legends & Myths'),
      subtitle: _('Myths, hero dossiers and internet theories'),
      icon: 'star',
      c1: '#b28cff', c2: '#5a35c9',
    },
    {
      id: 'types',
      title: _('Types'),
      subtitle: _('18 types: what beats what'),
      icon: 'flame',
      c1: '#ffbe4d', c2: '#e2621f',
    },
    {
      id: 'timeline',
      title: _('Timeline'),
      subtitle: _('Game generations and Trading Card Game series'),
      icon: 'clock',
      c1: '#3cc2ff', c2: '#1d5fd6',
    },
    {
      id: 'items',
      title: _('Items'),
      subtitle: _('Poké Balls, evolution stones, berries'),
      icon: 'pokeball',
      c1: '#5f6bff', c2: '#22297a',
    },
  ],

  // Раскраски консоли: l / r — джойконы, b — корпус (переключатель под консолью)
  skins: [
    { id: 'neon',      name: _('Neon'),      l: '#f4553f', r: '#13c3e3', b: '#18191c' },
    { id: 'gengar',    name: _('Gengar'),    l: '#7a4fd8', r: '#46d985', b: '#17121f' },
    { id: 'pikachu',   name: _('Pikachu'),    l: '#ffcd2e', r: '#ffcd2e', b: '#1b1814' },
    { id: 'charizard', name: _('Charizard'),  l: '#ff7a2b', r: '#17a5a0', b: '#1b1512' },
    { id: 'mew',       name: _('Mew'),       l: '#ff8cc6', r: '#a59cff', b: '#1c1721' },
    { id: 'snow',      name: _('Snow'),      l: '#eceef2', r: '#eceef2', b: '#e3e6ea' },
    { id: 'onyx',      name: _('Onyx'),     l: '#2c2e33', r: '#2c2e33', b: '#0f1012' },
  ],

  // Картриджи рядом с консолью: берёшь картридж и перетаскиваешь в слот консоли: запускается его викторина (15 вопросов, 3 сердца).
  // title / cap — надписи на этикетке (как на картинке), ru / sub / blurb — карточка справа,
  // opens — id раздела из sections (кнопка «Читать раздел» в меню картриджа), bg / tc — цвет этикетки и её заголовка, c1 — акцент интерфейса,
  // art — рисунок на этикетке (arceus | trainer | ball | catch), game — картридж запускает аркаду вместо викторины, facts — какие цифры показать (считаются из данных).
  carts: [
    { id: 'lore', title: 'LORE', cap: 'MYTHS & LEGENDS', ru: _('Lore'), sub: _('Myths & Legends'),
      blurb: _('World creators, ancient powers and the regions where it all began.'),
      opens: 'legends', tab: 'myths', bg: '#16213a', tc: '#d9b968', c1: '#e3c071', art: 'arceus', facts: ['quiz', 'legends', 'regions'] },
    { id: 'trainers', title: 'TRAINERS', cap: 'HEROES & RIVALS', ru: _('Trainers'), sub: _('Heroes & Rivals'),
      blurb: _('Professors, Gym Leaders and Champions: the people closest to Pokémon.'),
      opens: 'legends', tab: 'dossier', bg: '#d03a2f', tc: '#fff3ee', c1: '#ff6a58', art: 'trainer', facts: ['quiz', 'people', 'generations'] },
    { id: 'items', title: 'ITEMS', cap: 'KEY ADVENTURE GEAR', ru: _('Items'), sub: _('Adventure gear'),
      blurb: _('Poké Balls, evolution stones and berries: everything from a Trainer’s bag.'),
      opens: 'items', bg: '#5ea9dd', tc: '#f4fbff', c1: '#63bdf7', art: 'ball', facts: ['quiz', 'items', 'itemGroups'] },
    { id: 'catch', title: 'MASTER CATCHER', cap: 'MASTER CATCHER EDITION', ru: _('Catcher'), short: _('Catcher'), sub: _('Arcade · catch them on the fly'), game: 'catch',
      blurb: _('Pick the right Poké Ball for the Pokémon and catch it as it darts across the screen. Earn EXP for accuracy.'),
      opens: 'items', bg: '#62b857', tc: '#ffffff', c1: '#7fdc6a', art: 'catch', facts: ['catchTime', 'catchBalls', 'catchExp'] },
  ],

  // Круглые системные кнопки под плитками
  dock: [
    { id: 'news',     label: _('News'),     icon: 'news',    color: '#ff6a52' },
    { id: 'search',   label: _('Search'),       icon: 'search',  color: '#ffd25a' },
    { id: 'controls', label: _('Controls'),  icon: 'gamepad', color: '#7dffaa' },
    { id: 'retro',    label: _('Retro filter'), icon: 'tv',     color: '#b28cff' },
    { id: 'sound',    label: _('Sound'),        icon: 'sound',   color: '#ffffff' },
    { id: 'exit',     label: _('Exit'),       icon: 'power',   color: '#ff7a7a' },
  ],
};
