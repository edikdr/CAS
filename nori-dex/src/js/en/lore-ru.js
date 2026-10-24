/* ==========================================================================
   English overlay for js/lore-ru.js: type names, region descriptions,
   generations, characters. Counts (Pokémon, games, cards) come from data/.
   Numbers in arrays are Pokédex numbers (used for artwork).
   ========================================================================== */
window.PL = window.PL || {};

/* 18 game types (the card game has its own 11 — see PL.types in js/cards.js) */
PL.gameTypes = {
  normal:   { ru: 'Normal',   c: '#a8a77a', icon: 'circle' },
  fire:     { ru: 'Fire',     c: '#ee8130', icon: 'flame' },
  water:    { ru: 'Water',    c: '#6390f0', icon: 'drop' },
  electric: { ru: 'Electric', c: '#f7d02c', icon: 'bolt' },
  grass:    { ru: 'Grass',    c: '#7ac74c', icon: 'leaf' },
  ice:      { ru: 'Ice',      c: '#96d9d6', icon: 'snow' },
  fighting: { ru: 'Fighting', c: '#c22e28', icon: 'burst' },
  poison:   { ru: 'Poison',   c: '#a33ea1', icon: 'bubbles' },
  ground:   { ru: 'Ground',   c: '#e2bf65', icon: 'ground' },
  flying:   { ru: 'Flying',   c: '#a98ff3', icon: 'wing' },
  psychic:  { ru: 'Psychic',  c: '#f95587', icon: 'eye' },
  bug:      { ru: 'Bug',      c: '#a6b91a', icon: 'bug' },
  rock:     { ru: 'Rock',     c: '#b6a136', icon: 'rock' },
  ghost:    { ru: 'Ghost',    c: '#735797', icon: 'ghost' },
  dragon:   { ru: 'Dragon',   c: '#6f35fc', icon: 'dragon' },
  dark:     { ru: 'Dark',     c: '#705746', icon: 'moon' },
  steel:    { ru: 'Steel',    c: '#b7b7ce', icon: 'hex' },
  fairy:    { ru: 'Fairy',    c: '#d685ad', icon: 'spark' },
};
/* same order as PokéAPI (id 1…18) — needed for the effectiveness chart */
PL.gameTypeOrder = ['normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel', 'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark', 'fairy'];

PL.regionsRu = {
  kanto:  { ru: 'Kanto',  gen: 1, c: '#e8423f', starters: [1, 4, 7],       legends: [150, 144, 145, 146],
            text: 'The region where it all began. Professor Oak hands out your first Pokémon, and a Trainer’s road leads through eight Gyms to the Indigo Plateau. It is based on Japan’s real Kanto region.' },
  johto:  { ru: 'Johto',  gen: 2, c: '#d6a73a', starters: [152, 155, 158], legends: [250, 249, 243, 244, 245],
            text: 'A land of old temples and towers next door to Kanto, where legends of Ho-Oh and Lugia are told. It is based on Japan’s Kansai region.' },
  hoenn:  { ru: 'Hoenn',  gen: 3, c: '#2fa86b', starters: [252, 255, 258], legends: [383, 382, 384],
            text: 'A tropical region of seas and volcanoes, where the forces of land and ocean clash in Groudon and Kyogre. It is based on the island of Kyushu.' },
  sinnoh: { ru: 'Sinnoh', gen: 4, c: '#5b7bd6', starters: [387, 390, 393], legends: [483, 484, 487, 493],
            text: 'A northern region with Mt. Coronet at its center. Myths of the creation of the world, of time and of space are kept here. It is based on Hokkaido.' },
  unova:  { ru: 'Unova',  gen: 5, c: '#3d3f4a', starters: [495, 498, 501], legends: [643, 644, 646],
            text: 'A region of metropolises and bridges, inspired by New York City. Its story is a clash of truth and ideals, of Reshiram and Zekrom.' },
  kalos:  { ru: 'Kalos',  gen: 6, c: '#3a86d6', starters: [650, 653, 656], legends: [716, 717, 718],
            text: 'A France-inspired region with its capital, Lumiose City, and its tower. This is where Mega Evolution first appeared.' },
  alola:  { ru: 'Alola',  gen: 7, c: '#f29a3a', starters: [722, 725, 728], legends: [791, 792, 800],
            text: 'Tropical islands inspired by Hawaii. Instead of Gyms there are island trials, and instead of Badges there are Z-Crystals.' },
  galar:  { ru: 'Galar',  gen: 8, c: '#b03a6e', starters: [810, 813, 816], legends: [888, 889, 890],
            text: 'A region inspired by Great Britain, where Gym matches in stadiums are the country’s biggest spectacle and Pokémon can Dynamax.' },
  hisui:  { ru: 'Hisui',  gen: 8, c: '#8a6b4a', starters: [722, 155, 501], legends: [493, 483, 484],
            text: 'Sinnoh in the distant past: a time when people were only learning to live alongside Pokémon and were compiling the very first Pokédex.' },
  paldea: { ru: 'Paldea', gen: 9, c: '#d6462f', starters: [906, 909, 912], legends: [1007, 1008],
            text: 'An open world inspired by the Iberian Peninsula. Trainers study at an academy and choose for themselves where to go.' },
};

PL.generationsRu = {
  1: { year: 1996, mascots: [6, 9, 3],          text: 'The birth of the series: the first 151 Pokémon, Link Cable trading and the dream of catching them all.' },
  2: { year: 1999, mascots: [250, 249],         text: 'A day-and-night cycle, Pokémon Eggs, two new types — Steel and Dark — and a return trip to Kanto.' },
  3: { year: 2002, mascots: [383, 382, 384],    text: 'Abilities and Natures, Double Battles and Pokémon Contests.' },
  4: { year: 2006, mascots: [483, 484, 487],    text: 'The physical/special split for moves and worldwide online trading.' },
  5: { year: 2010, mascots: [643, 644],         text: 'A whole generation of brand-new Pokémon only, and the series’ most story-driven conflict.' },
  6: { year: 2013, mascots: [716, 717],         text: 'The jump to 3D, Mega Evolution and a new type — Fairy.' },
  7: { year: 2016, mascots: [791, 792],         text: 'Island trials, Z-Moves and regional forms of older Pokémon.' },
  8: { year: 2019, mascots: [888, 889],         text: 'Dynamax, the Wild Area and the first “open” experience in Legends: Arceus.' },
  9: { year: 2022, mascots: [1007, 1008],       text: 'A fully open world, Terastallization and ancient/future Paradox Pokémon.' },
};

/* characters: name, role, partner Pokémon (artwork), patterns for finding their Supporter cards */
PL.charactersRu = [
  { id: 'oak',     ru: 'Professor Oak', role: 'Professor · Kanto',            partner: 1,   match: ['Professor Oak'],
    bio: 'A Pokémon researcher from Pallet Town. He is the one who hands beginner Trainers their first Pokémon and a Pokédex.' },
  { id: 'red',     ru: 'Red',            role: 'Legendary Trainer · Kanto',  partner: 25,  match: ['Red'],
    bio: 'The hero of the first games, who journeyed from Pallet Town to the top of the League and became a legend among Trainers.' },
  { id: 'brock',   ru: 'Brock',           role: 'Gym Leader · Kanto',      partner: 95,  match: ['Brock'],
    bio: 'Gym Leader of Pewter City and a master of Rock types. He dreams of becoming the world’s best Pokémon Breeder.' },
  { id: 'misty',   ru: 'Misty',          role: 'Gym Leader · Kanto',      partner: 121, match: ['Misty'],
    bio: 'Gym Leader of Cerulean City and an expert on Water Pokémon. Headstrong and brave.' },
  { id: 'surge',   ru: 'Lt. Surge', role: 'Gym Leader · Kanto',     partner: 26,  match: ['Lt. Surge'],
    bio: 'Gym Leader of Vermilion City and a former soldier. He battles with Electric Pokémon.' },
  { id: 'erika',   ru: 'Erika',          role: 'Gym Leader · Kanto',      partner: 45,  match: ['Erika'],
    bio: 'Gym Leader of Celadon City. A calm lover of flowers and Grass Pokémon.' },
  { id: 'sabrina', ru: 'Sabrina',        role: 'Gym Leader · Kanto',      partner: 65,  match: ['Sabrina'],
    bio: 'Gym Leader of Saffron City with psychic powers of her own. She favors Psychic Pokémon.' },
  { id: 'koga',    ru: 'Koga',           role: 'Gym Leader · Kanto',      partner: 110, match: ['Koga'],
    bio: 'Gym Leader of Fuchsia City and a ninja master. He battles with Poison Pokémon and loves a good trap.' },
  { id: 'blaine',  ru: 'Blaine',          role: 'Gym Leader · Kanto',      partner: 59,  match: ['Blaine'],
    bio: 'Gym Leader on Cinnabar Island, a fan of riddles and Fire Pokémon.' },
  { id: 'giovanni', ru: 'Giovanni',      role: 'Team Rocket Boss',             partner: 53,  match: ['Giovanni'],
    bio: 'Boss of the criminal organization Team Rocket and the secret Gym Leader of Viridian City.' },
  { id: 'steven',  ru: 'Steven',         role: 'Champion · Hoenn',             partner: 376, match: ['Steven'],
    bio: 'Champion of the Hoenn League and heir to the Devon Corporation. He collects rare stones.' },
  { id: 'cynthia', ru: 'Cynthia',         role: 'Champion · Sinnoh',             partner: 445, match: ['Cynthia'],
    bio: 'Champion of the Sinnoh League and a researcher of ancient myths. Her Garchomp is one of the most fearsome Pokémon in the series.' },
  { id: 'n',       ru: 'N',              role: 'King of Team Plasma · Unova', partner: 644, match: ['N'],
    bio: 'A young man who can hear the voices of Pokémon and tries to work out whether people and Pokémon should live apart.' },
  { id: 'lillie',  ru: 'Lillie',          role: 'Professor’s Assistant · Alola', partner: 789, match: ['Lillie'],
    bio: 'A girl who protects the mysterious Pokémon Cosmog and gradually finds her courage.' },
  { id: 'guzma',   ru: 'Guzma',          role: 'Team Skull Boss · Alola',  partner: 768, match: ['Guzma'],
    bio: 'Leader of the rowdy Team Skull, who never managed to become a trial captain.' },
  { id: 'leon',    ru: 'Leon',           role: 'Champion · Galar',             partner: 6,   match: ['Leon'],
    bio: 'Galar’s undefeated Champion and Hop’s older brother. His Charizard is famous across the country.' },
  { id: 'hop',     ru: 'Hop',            role: 'Rival · Galar',            partner: 831, match: ['Hop'],
    bio: 'A friend and rival of the protagonist in Galar who dreams of stepping out of his older brother’s shadow.' },
  { id: 'marnie',  ru: 'Marnie',          role: 'Rival · Galar',           partner: 877, match: ['Marnie'],
    bio: 'A Dark-type Trainer from Spikemuth and the younger sister of Gym Leader Piers.' },
  { id: 'raihan',  ru: 'Raihan',         role: 'Gym Leader · Galar',      partner: 884, match: ['Raihan'],
    bio: 'Gym Leader of Hammerlocke, a master of Dragon Pokémon and Leon’s chief rival.' },
  { id: 'iono',    ru: 'Iono',           role: 'Gym Leader · Paldea',     partner: 939, match: ['Iono'],
    bio: 'A streamer and Electric-type Gym Leader who turns every battle into a show.' },
  { id: 'nemona',  ru: 'Nemona',         role: 'Rival · Paldea',          partner: 923, match: ['Nemona'],
    bio: 'An academy student with a Champion title who loves battling more than anything in the world.' },
  { id: 'arven',   ru: 'Arven',          role: 'Academy Student · Paldea',    partner: 943, match: ['Arven'],
    bio: 'He hunts for delicacy herbs to cure his faithful Mabosstiff.' },
  { id: 'penny',   ru: 'Penny',          role: 'Academy Student · Paldea',   partner: 700, match: ['Penny'],
    bio: 'A quiet, shy hacker who stands behind Team Star.' },
];

PL.itemGroupsRu = {
  balls:     { ru: 'Poké Balls',      text: 'Used to catch Pokémon. The better the Poké Ball, the higher the catch rate.' },
  evolution: { ru: 'Evolution Items', text: 'Stones and special items that make certain Pokémon evolve.' },
  mega:      { ru: 'Mega Stones',     text: 'Let a Pokémon Mega Evolve temporarily in battle.' },
  berries:   { ru: 'Berries',         text: 'Pokémon eat them in battle: Berries heal, cure status conditions and give boosts.' },
};
