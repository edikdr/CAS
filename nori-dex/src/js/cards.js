/* ==========================================================================
   Справочники карточной игры: типы энергии (11 типов TCG), почему тип слаб,
   редкости. Сами карточки лежат в data/tcg/ (их собирает scripts/build-data.mjs).
   ========================================================================== */
window.PL = window.PL || {};

/* Типы (стихии): цвета, иконка и объяснение для модального окна */
PL.types = {
  grass:     { name: _('Grass'),      c1: '#6bdc74', c2: '#1b8c49', icon: 'leaf',
               lore: _('Pokémon of this type live off the sun and the soil. Many of them are closer to plants than to beasts: they bloom, put down roots and share their pollen.') },
  fire:      { name: _('Fire'),      c1: '#ff8a4c', c2: '#d02d2d', icon: 'flame',
               lore: _('Fire Pokémon keep heat inside their bodies, often in the tail or the mouth. The strength of their flame is said to depend on the temper and mood of their Trainer.') },
  water:     { name: _('Water'),       c1: '#55c2ff', c2: '#1d5ad4', icon: 'drop',
               lore: _('Water Pokémon live in seas, rivers and lakes. They can steer currents, and some are able to stir up a storm.') },
  lightning: { name: _('Lightning'), c1: '#ffe14d', c2: '#e0961a', icon: 'bolt',
               lore: _('Lightning Pokémon store a charge in their cheeks, tails or fur. Before a thunderstorm they grow restless and charge up even more than usual.') },
  psychic:   { name: _('Psychic'),    c1: '#d98aff', c2: '#7236cf', icon: 'eye',
               lore: _('Psychic Pokémon sense the thoughts of others, move objects with a glance and see what is hidden from people. Their power grows with their focus.') },
  fighting:  { name: _('Fighting'),     c1: '#dd8d52', c2: '#85461f', icon: 'burst',
               lore: _('Fighting Pokémon rely on physical strength and training. They respect a fair fight and rarely back down from a challenge.') },
  dark:      { name: _('Darkness'),       c1: '#7c88aa', c2: '#262b40', icon: 'moon',
               lore: _('Darkness Pokémon are cunning and wary. They hunt at night, trust no strangers and know how to play on their opponent’s fears.') },
  steel:     { name: _('Metal'),     c1: '#c0ccd8', c2: '#66788a', icon: 'hex',
               lore: _('Metal Pokémon are covered in armor that is almost impossible to pierce. They are slow, but they withstand what breaks all the others.') },
  dragon:    { name: _('Dragon'),     c1: '#d9b54a', c2: '#5a6bd1', icon: 'burst',
               lore: _('Dragons are ancient, proud Pokémon. Their power is hard to tame, and even experienced Trainers spend years earning their trust.') },
  fairy:     { name: _('Fairy'),        c1: '#ff9ed6', c2: '#c4549a', icon: 'spark',
               lore: _('Fairy Pokémon are surrounded by legends of magic and luck. They are often found in forests and meadows, where the flowers grow thicker than usual.') },
  colorless: { name: _('Colorless'),    c1: '#eceef4', c2: '#8f92a3', icon: 'spark',
               lore: _('Colorless Pokémon are not tied to a single element. They are versatile and fit any Trainer and any deck.') },
};

/* Почему тип слаб к другому — краткое объяснение для пункта «Слабость» */
PL.weakWhy = {
  water:     _('Water puts out flames and knocks you off your feet: Fire Pokémon have a hard time fighting when a wave crashes over them.'),
  lightning: _('Water conducts electricity well, so a bolt of lightning hurts Water Pokémon especially badly.'),
  fighting:  _('Seasoned fighters know how to take a hit and find the weak spot in a defense, especially against those who rely on speed or a charge.'),
  dark:      _('Dark creatures hide their thoughts and resist mind reading, so Psychic moves work worse on them while their own attacks hit more accurately.'),
  psychic:   _('Psychic moves strike the mind rather than the body, and they are hard to defend against.'),
  fire:      _('Fire quickly destroys plants and melts cold armor.'),
  grass:     _('Plants drain away water and entangle the opponent, robbing it of its mobility.'),
  steel:     _('Hard metal withstands almost any blow and sends it right back.'),
  colorless: _('Against this kind of opponent there is no “right” element: raw strength decides everything.'),
};

PL.rarities = {
  common:   { name: _('Common'),         foil: 'none',    mark: '●',
              text: _('The most frequent card in a set. There is no shine, and you add it to a deck without a second thought.') },
  uncommon: { name: _('Uncommon'),       foil: 'none',    mark: '◆',
              text: _('Turns up less often than a Common. The effects are a little stronger, and the price is lower than a Rare’s.') },
  rare:     { name: _('Holo Rare'),     foil: 'glow',    mark: '★',
              text: _('A rare card with a shine on the art. The holographic effect shows when you tilt it.') },
  ultra:    { name: _('Ultra Rare'),    foil: 'rainbow', mark: '★★',
              text: _('A card with art that fills the whole face and a rainbow shine. People pick these for their looks and their power.') },
  special:  { name: _('Special Illustration Rare'), foil: 'rainbow', mark: '★★★',
              text: _('The most beautiful and rarest category: the artist paints a whole scene, not just a pose of the Pokémon.') },
};

/* русский лор для некоторых покемонов (по номеру Покедекса) — заменяет английский текст с карты */
PL.loreRu = {
  "6": _('Charizard soars over the mountains in search of strong opponents. When the fight is fair, the flame in its mouth burns brighter. Trainers say it steers clear of cowards.'),
  "25": _('Pikachu stores electricity in its cheek pouches and lets it out when it gets scared. Packs of these little creatures sometimes set off whole thunderstorms without a single cloud.'),
  "94": _('Gengar shows up wherever a person is left alone. In the dark you can see only its grin, and then that vanishes too. Trainers say that if it suddenly gets cold behind you, it is already too late to turn around.'),
  "130": _('Magikarp is considered the weakest Pokémon until it turns into Gyarados. It is one of the most dramatic evolutions: a quiet little fish becomes a furious serpent that does not calm down until everything around it is wrecked.'),
  "134": _('Vaporeon’s body nearly dissolves into water, so spotting one in a river is almost impossible. They say it sings before the rain, and on those days fishermen stay off their boats.'),
  "135": _('Jolteon’s fur stands on end at every distant flash of lightning. It stores up a charge and can let it loose in a whole volley of needles if it senses a threat.'),
  "136": _('A furnace burns inside Flareon, heating its body to a high temperature. In winter it curls up into a ball and warms everything around it, but its fur is best left untouched.'),
  "143": _('Snorlax sleeps nearly all day and wakes up only to eat. It can block a road so completely that you have to go around, yet nobody dares to hit it.'),
  "150": _('Mewtwo was created in a laboratory, and it could never forgive its creators for not asking its consent. Since then it has lived in seclusion, searching for the answer to why it was brought into the world.')
};
