/* ==========================================================================
   КОНФИГ — здесь меняются название, разделы меню и системные кнопки.
   Разделы пока заглушки: заменишь названия/цвета/иконки, когда решишь
   с контентом. Иконки — ключи из js/icons.js.
   ========================================================================== */
window.PL = window.PL || {};

PL.config = {
  siteName: 'POKÉLORE',
  tagline: _('интерактивная вики по лору'),
  userName: _('Тренер'),

  // Плитки главного меню (как игры на Switch)
  sections: [
    {
      id: 'regions',
      title: _('Регионы'),
      subtitle: _('Канто, Джото, Хоэнн и дальше'),
      icon: 'map',
      c1: '#36d17c', c2: '#0b7f55',
    },
    {
      id: 'pokedex',
      title: _('Покедекс'),
      subtitle: _('Все 1025 покемонов: типы, статы, эволюции'),
      icon: 'dex',
      c1: '#ff6a52', c2: '#c22d3c',
    },
    {
      id: 'legends',
      title: _('Легенды и мифы'),
      subtitle: _('Мифы, досье героев и интернет-теории'),
      icon: 'star',
      c1: '#b28cff', c2: '#5a35c9',
    },
    {
      id: 'types',
      title: _('Типы'),
      subtitle: _('18 типов: кто кого бьёт'),
      icon: 'flame',
      c1: '#ffbe4d', c2: '#e2621f',
    },
    {
      id: 'timeline',
      title: _('Хронология'),
      subtitle: _('Поколения игр и серии карточной игры'),
      icon: 'clock',
      c1: '#3cc2ff', c2: '#1d5fd6',
    },
    {
      id: 'items',
      title: _('Предметы'),
      subtitle: _('Покеболы, камни эволюции, ягоды'),
      icon: 'pokeball',
      c1: '#5f6bff', c2: '#22297a',
    },
  ],

  // Раскраски консоли: l / r — джойконы, b — корпус (переключатель под консолью)
  skins: [
    { id: 'neon',      name: _('Неон'),      l: '#f4553f', r: '#13c3e3', b: '#18191c' },
    { id: 'gengar',    name: _('Гэнгар'),    l: '#7a4fd8', r: '#46d985', b: '#17121f' },
    { id: 'pikachu',   name: _('Пикачу'),    l: '#ffcd2e', r: '#ffcd2e', b: '#1b1814' },
    { id: 'charizard', name: _('Чаризард'),  l: '#ff7a2b', r: '#17a5a0', b: '#1b1512' },
    { id: 'mew',       name: _('Мью'),       l: '#ff8cc6', r: '#a59cff', b: '#1c1721' },
    { id: 'snow',      name: _('Снег'),      l: '#eceef2', r: '#eceef2', b: '#e3e6ea' },
    { id: 'onyx',      name: _('Оникс'),     l: '#2c2e33', r: '#2c2e33', b: '#0f1012' },
  ],

  // Картриджи рядом с консолью: берёшь картридж и перетаскиваешь в слот консоли: запускается его викторина (15 вопросов, 3 сердца).
  // title / cap — надписи на этикетке (как на картинке), ru / sub / blurb — карточка справа,
  // opens — id раздела из sections (кнопка «Читать раздел» в меню картриджа), bg / tc — цвет этикетки и её заголовка, c1 — акцент интерфейса,
  // art — рисунок на этикетке (arceus | trainer | ball | catch), game — картридж запускает аркаду вместо викторины, facts — какие цифры показать (считаются из данных).
  carts: [
    { id: 'lore', title: 'LORE', cap: 'MYTHS & LEGENDS', ru: _('Лор'), sub: _('Мифы и легенды'),
      blurb: _('Создатели мира, древние силы и регионы, с которых всё началось.'),
      opens: 'legends', tab: 'myths', bg: '#16213a', tc: '#d9b968', c1: '#e3c071', art: 'arceus', facts: ['quiz', 'legends', 'regions'] },
    { id: 'trainers', title: 'TRAINERS', cap: 'HEROES & RIVALS', ru: _('Тренеры'), sub: _('Герои и соперники'),
      blurb: _('Профессора, лидеры стадионов и чемпионы: те, кто рядом с покемонами.'),
      opens: 'legends', tab: 'dossier', bg: '#d03a2f', tc: '#fff3ee', c1: '#ff6a58', art: 'trainer', facts: ['quiz', 'people', 'generations'] },
    { id: 'items', title: 'ITEMS', cap: 'KEY ADVENTURE GEAR', ru: _('Предметы'), sub: _('Снаряжение для приключений'),
      blurb: _('Покеболы, камни эволюции и ягоды: всё из рюкзака тренера.'),
      opens: 'items', bg: '#5ea9dd', tc: '#f4fbff', c1: '#63bdf7', art: 'ball', facts: ['quiz', 'items', 'itemGroups'] },
    { id: 'catch', title: 'MASTER CATCHER', cap: 'MASTER CATCHER EDITION', ru: _('Ловец'), short: _('Ловец'), sub: _('Аркада · поймай их на лету'), game: 'catch',
      blurb: _('Подбери покебол под покемона и поймай его, пока он носится по экрану. EXP за меткость.'),
      opens: 'items', bg: '#62b857', tc: '#ffffff', c1: '#7fdc6a', art: 'catch', facts: ['catchTime', 'catchBalls', 'catchExp'] },
  ],

  // Круглые системные кнопки под плитками
  dock: [
    { id: 'news',     label: _('Новости'),     icon: 'news',    color: '#ff6a52' },
    { id: 'search',   label: _('Поиск'),       icon: 'search',  color: '#ffd25a' },
    { id: 'controls', label: _('Управление'),  icon: 'gamepad', color: '#7dffaa' },
    { id: 'retro',    label: _('Ретро-фильтр'), icon: 'tv',     color: '#b28cff' },
    { id: 'sound',    label: _('Звук'),        icon: 'sound',   color: '#ffffff' },
    { id: 'exit',     label: _('Выход'),       icon: 'power',   color: '#ff7a7a' },
  ],
};
