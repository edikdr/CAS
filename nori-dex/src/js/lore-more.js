/* ==========================================================================
   English overlay for js/lore-more.js. Texts for the “Legends & Myths” and “News” tabs:
   regional myths, dossiers, fan theories, selected milestones and “words of the creators”.
   Pokémon names written as {123} are filled in from PL.dex. Everything is based on the
   games, the Pokédex and public interviews; disputed claims are marked as theory,
   not as fact.
   ========================================================================== */
window.PL = window.PL || {};

/* ---------- Myths of the world ---------- */
PL.mythsRu = [
  { id: 'arceus', title: 'The Egg and the Thousand Arms', kicker: 'Sinnoh · Origin of the World', c: '#e3c071', lead: 493, mons: [493, 483, 484, 487, 480, 481, 482],
    text: 'In Sinnoh myth, at first there was nothing but an egg. From it emerged {493}, the “Alpha Pokémon,” who created the world. Beside it stand three lords of creation: {483} governs time, {484} governs space, and {487} governs antimatter. The Lake Guardians are tied to this mythology as well: {480} embodies knowledge, {481} emotion, and {482} willpower.',
    src: 'Pokémon Diamond / Pearl / Platinum, Legends: Arceus' },
  { id: 'kanto', title: 'Mew and the Birds of Kanto', kicker: 'Kanto · Generation I', c: '#36d17c', lead: 151, mons: [151, 150, 144, 145, 146],
    text: 'Mew is called the “ancestor” of Pokémon: according to the Pokédex, its DNA contains the genetic code of every species. Scientists used those genes to create {150}, which proved stronger than its creators. Meanwhile, three legendary birds soar over the region: {144} (ice), {145} (electricity) and {146} (fire).',
    src: 'Pokémon Red / Blue / Yellow, FireRed / LeafGreen' },
  { id: 'johto', title: 'Rainbow Wings', kicker: 'Johto · Generation II', c: '#ffbe4d', lead: 250, mons: [250, 249, 243, 244, 245, 251],
    text: 'When the Brass Tower burned down, three unnamed Pokémon perished. {250} brought them back to life, and they became {243}, {244} and {245}, the legendary beasts of Johto. {249}, guardian of the seas, sleeps on the ocean floor by the Whirl Islands, while {251}, the time traveler, roams the forests.',
    src: 'Pokémon Gold / Silver / Crystal, HeartGold / SoulSilver' },
  { id: 'hoenn', title: 'Land, Sea and Sky', kicker: 'Hoenn · Generation III', c: '#2fcf8f', lead: 384, mons: [383, 382, 384, 385, 386],
    text: '{383} raises the continents, {382} summons the ocean, and their endless battle threatens the world. Only {384}, a dragon from the ozone layer, can stop it. Team Magma and Team Aqua are convinced the ancient titans are meant for them alone, which drives the whole story of the region. And {385} wakes for seven days once every thousand years.',
    src: 'Pokémon Ruby / Sapphire / Emerald, Omega Ruby / Alpha Sapphire' },
  { id: 'unova', title: 'Truth and Ideals', kicker: 'Unova · Generation V', c: '#9aa7d8', lead: 643, mons: [643, 644, 646],
    text: 'According to legend, a single dragon once split into two twin heroes. {643} embodies Truth, {644} embodies Ideals, and {646} remained an icy, empty vessel, a remnant of the original dragon. This legend shapes the conflict between Team Plasma and the hero of the game.',
    src: 'Pokémon Black / White, Black 2 / White 2' },
  { id: 'kalos', title: 'Life and Destruction', kicker: 'Kalos · Generation VI', c: '#ff7eb8', lead: 716, mons: [716, 717, 718],
    text: '{716} gives life and renewal, {717} gathers life energy and brings destruction, and {718} watches over the order of the ecosystem. The region’s big new feature is Mega Evolution: a temporary transformation in which Trainer and Pokémon act as one.',
    src: 'Pokémon X / Y' },
  { id: 'alola', title: 'The Island Guardians', kicker: 'Alola · Generation VII', c: '#ffcf4a', lead: 785, mons: [785, 786, 787, 788, 789, 791, 792],
    text: 'Each of the four islands is watched over by a guardian deity: {785}, {786}, {787} and {788}. And from the cosmic {789}, after passing through {790}, are born the Pokémon of the Sun and the Moon: {791} and {792}.',
    src: 'Pokémon Sun / Moon, Ultra Sun / Ultra Moon' },
  { id: 'galar', title: 'The Darkest Day', kicker: 'Galar · Generation VIII', c: '#b28cff', lead: 890, mons: [890, 888, 889],
    text: 'Three thousand years ago, the Darkest Day struck Galar: {890} unleashed untamed energy upon the land, and from that energy, according to legend, Dynamax was born. It was stopped by the heroes of the ancient legend, {888} and {889}.',
    src: 'Pokémon Sword / Shield' },
  { id: 'hisui', title: 'Hisui, Ancient Sinnoh', kicker: 'Hisui · Legends: Arceus', c: '#d9b968', lead: 905, mons: [905, 483, 484, 493],
    text: 'In Pokémon Legends: Arceus the player travels into the past. Sinnoh is still called Hisui, there is no Pokédex, and you have to create it yourself by studying Pokémon in the wild lands. Local clans revere {483} and {484}, and the secret of {493} is revealed in the finale.',
    src: 'Pokémon Legends: Arceus' },
  { id: 'paldea', title: 'Paradox Pokémon', kicker: 'Paldea · Generation IX', c: '#ff6a52', lead: 1007, mons: [1007, 1008],
    text: '{1007} and {1008}, the cover stars of Scarlet and Violet, come from “paradox” times: ancient and future Paldea. The Great Crater is home to paradox versions of familiar Pokémon, as if they had returned from the past or the future.',
    src: 'Pokémon Scarlet / Violet' },
  { id: 'people', title: 'People and Pokémon', kicker: 'Worldwide', c: '#6ee7b7', lead: 25, mons: [25, 133, 94],
    text: 'In every region, people and Pokémon live side by side: they befriend one another, work together and battle. Poké Balls let Trainers carry Pokémon with them, Trainers collect Gym Badges and head for the League, and researchers such as Professor Oak study how Pokémon are connected to people.',
    src: 'the entire series' },
];

/* ---------- Dossiers of the main characters ---------- */
PL.dossiersRu = [
  { id: 25, role: 'Face of the Franchise', text: 'An Electric-type Pokémon that became the symbol of the entire series. In Yellow it follows the hero everywhere, and in the anime it is Ash’s loyal partner. With a Thunder Stone it evolves into {26}.' },
  { id: 150, role: 'Created in a Lab', text: 'The result of genetic experiments on Mew’s DNA. Kanto’s most powerful psychic, it hides in Cerulean Cave. In the first movie, Mewtwo searches for an answer to why it was created.' },
  { id: 151, role: 'Ancestor of All Pokémon?', text: 'It is said that its DNA holds the code of every Pokémon, which is why it can learn almost any move. Mew is so rare that many considered it a myth: in the first-generation games it could only be obtained through special distribution events.' },
  { id: 249, role: 'Guardian of the Seas', text: 'It lives on the ocean floor near the Whirl Islands. According to the Pokédex, a gentle flap of its wings can blow houses away, which is why {249} prefers a quiet life in the depths.' },
  { id: 250, role: 'Rainbow Pokémon', text: 'Its feathers shimmer in seven colors; according to legend, it shows itself only to Trainers who are pure of heart. {250} brought back to life the three beasts that perished in the Brass Tower.' },
  { id: 251, role: 'Time Traveler', text: 'It wanders through time and appears when an era is at peace. According to the Pokédex, forests that {251} has visited burst into bloom.' },
  { id: 384, role: 'Dragon of the Sky', text: 'It lives in the ozone layer and almost never descends to the ground. According to the Pokédex, it feeds on meteoroids. Its main role in Hoenn myth is to calm {383} and {382}.' },
  { id: 493, role: 'Alpha Pokémon', text: 'The creator of the world in Sinnoh myth. Its type changes depending on the Plate it holds: {493} has a form for each of the types.' },
  { id: 487, role: 'Exile of the Distortion World', text: 'According to legend, it was banished for its rage to the Distortion World, a place where the laws of nature do not apply. {487} has two forms: Altered Forme and Origin Forme.' },
  { id: 491, role: 'Lord of Nightmares', text: 'It appears at night and, according to the Pokédex, sends nightmares to those who sleep. Its legend is tied to Newmoon Island.' },
  { id: 643, role: 'White Dragon of Truth', text: 'A Fire-type dragon, one of the two twin heroes of Unova. According to the Pokédex, its flames can change the weather.' },
  { id: 644, role: 'Black Dragon of Ideals', text: 'An Electric-type dragon, the second twin hero of Unova. Its lightning is its main weapon; according to legend, it helped the one who built a nation upon Ideals.' },
  { id: 716, role: 'Deer of Life', text: 'A deer Pokémon whose antlers glow in rainbow colors. According to the Pokédex, it can grant eternal life. When it sleeps for a thousand years, it takes the form of a tree.' },
  { id: 890, role: 'Cosmic Dragon', text: 'According to lore, it arrived from space three thousand years ago and caused the Darkest Day. Its energy is linked to Dynamax, and in battle it has an Eternamax form.' },
  { id: 888, role: 'Hero of the Sword', text: 'One of Galar’s two heroes. It defended the region from {890} together with {889}. In its Crowned Sword form it wields a mighty blade.' },
  { id: 1007, role: 'Ancient Paradox', text: 'A Paradox Pokémon from the past and the cover star of Scarlet. In the game you can ride it like a mount.' },
];

/* ---------- Internet theories and stories ---------- */
PL.theoryKinds = {
  fan:   { ru: 'Fan Theory',      c: '#b28cff' },
  hoax:  { ru: 'Hoax',            c: '#ff7a7a' },
  myth:  { ru: 'Urban Legend',    c: '#ffbe4d' },
  canon: { ru: 'Canon',           c: '#7dffaa' },
  fact:  { ru: 'Real Fact',       c: '#5ee0f6' },
  debate: { ru: 'Debated',        c: '#ffd25a' },
};
PL.theoriesRu = [
  { id: 'ash-coma', kind: 'fan', title: 'Ash Is in a Coma', teaser: 'The whole series is the dream of a boy who was struck by electricity.',
    story: 'The most famous theory: at the start of the series Ash is electrocuted and falls into a coma, and all of his adventures are a dream while his mom sits by the hospital bed. This is how fans explain why Ash is always ten years old.',
    truth: 'There is no confirmation: this is only a fan theory and is not part of canon.', mons: [25] },
  { id: 'lavender', title: 'Lavender Town Syndrome', kind: 'hoax', teaser: 'The town’s music supposedly brought harm to Japanese children.',
    story: 'A 2010 urban legend: the Lavender Town theme in Red / Green supposedly contains frequencies that gave children headaches, followed by tragic incidents.',
    truth: 'It is a made-up “creepypasta.” There are no confirmed cases, and the tune itself is an ordinary, melancholy town theme.', mons: [92, 93, 94] },
  { id: 'mew-truck', title: 'Mew Under the Truck', kind: 'myth', teaser: 'The legend of a hidden Mew near Vermilion’s harbor.',
    story: 'A rumor claimed that a truck stands next to the S.S. Anne with Mew hidden beneath it. All you had to do was move the truck, and the Pokémon was yours.',
    truth: 'The rumor turned out to be made up: in the Kanto games Mew could only be obtained through special distribution events, and the truck is just an ordinary truck.', mons: [151] },
  { id: 'missingno', title: 'MissingNo. and Item Duplication', kind: 'fact', teaser: 'A Red / Blue glitch that every schoolkid knew about.',
    story: 'If you performed a special sequence (the old man in Viridian City, then Surfing along the coast of Cinnabar Island), you could encounter the “Pokémon” MissingNo. The encounter duplicated the item in the sixth slot of your bag.',
    truth: 'It is a genuine glitch: “empty” entries in the Pokémon table of Red / Blue. It has long since become part of player culture.', mons: [] },
  { id: 'cubone', title: 'Cubone’s Mother', kind: 'canon', teaser: 'The skull on Cubone’s head belongs to its mother.',
    story: 'According to the Pokédex, {104} wears the skull of its deceased mother. And the ghost in Pokémon Tower, as the game reveals, is Marowak, Cubone’s mother.',
    truth: 'Confirmed by the text of the Kanto games.', mons: [104, 105] },
  { id: 'ditto', title: 'Ditto Is a Failed Mew Clone', kind: 'fan', teaser: 'Both can transform: a coincidence?',
    story: 'Ditto has only Transform, and {151} can learn that move; on top of that, Mew’s DNA supposedly holds the code of every Pokémon. Hence the guess that {132} is a “reject” from the copying process.',
    truth: 'Not confirmed anywhere. All we know is that Ditto’s only move is Transform, and that Mew can learn it.', mons: [132, 151] },
  { id: 'balls', title: 'Are Poké Balls Slavery?', kind: 'debate', teaser: 'Is the very act of catching and keeping Pokémon ethical?',
    story: 'A philosophical debate: Pokémon are caught and made to battle, so players ask themselves whether that is too cruel.',
    truth: 'The games emphasize friendship, and some storylines (Team Plasma and N in Black / White) raise this question head-on.', mons: [] },
  { id: 'capsule', title: 'Pokémon Could Have Had Another Name', kind: 'fact', teaser: 'The working title was Capsule Monsters.',
    story: 'The game was first called “Capsule Monsters,” but because of trademark issues the name was changed to Pocket Monsters, which is where the word “Pokémon” comes from.',
    truth: 'That is how it happened: the creators themselves have said so.', mons: [] },
  { id: 'mew-secret', title: 'The Secret Mew', kind: 'fact', teaser: 'Mew was the last Pokémon added to the game, almost in secret.',
    story: 'According to the developers, Mew was added to Red / Green by programmer Shigeki Morimoto when a little room freed up on the cartridge and the debugging tools had already been removed.',
    truth: 'A well-known story that the developers have retold more than once. That is why the first generation has 151 Pokémon, not 150.', mons: [151] },
  { id: 'porygon', title: 'The Episode That Is No Longer Shown', kind: 'fact', teaser: 'December 1997: the Porygon episode and the flashes on screen.',
    story: 'On December 16, 1997, the episode “Dennō Senshi Porygon” triggered seizures in hundreds of Japanese children because of rapid red-and-blue flashes.',
    truth: 'A real incident: the episode was pulled, the series went on hiatus, and television began carrying warnings about flashing lights.', mons: [137] },
  { id: 'insects', title: 'Pokémon Born from Childhood', kind: 'fact', teaser: 'Bugs, collections and the trade cable.',
    story: 'The series’ creator, Satoshi Tajiri, collected insects as a child. The game was meant to give kids the same feeling, and the link cable for trading Pokémon grew out of the idea that creatures “travel” between people.',
    truth: 'Tajiri himself has said as much in interviews over the years.', mons: [10, 13, 123] },
];

/* ---------- Milestones (selected events) and words of the creators ---------- */
PL.newsCurated = [
  { d: '2025-10-16', k: 'game', t: 'Pokémon Legends: Z-A', x: 'Release of the game for Switch and Switch 2: the action once again unfolds in Lumiose City in Kalos, which is being rebuilt together with Pokémon.', mons: [6, 448] },
  { d: '2025-12-10', k: 'game', t: 'Legends: Z-A — «Mega Dimension»', x: 'An expansion for Legends: Z-A with new missions and Mega Evolutions. Check pokemon.com for the exact date.', mons: [], soft: 1 },
  { d: '2026-02-27', k: 'event', t: '30 Years of Pokémon', x: 'The series celebrates its thirtieth anniversary: it was on February 27, 1996, that Pokémon Red and Green were released in Japan.', mons: [25, 6, 9, 3] },
];
PL.creatorsRu = [
  { who: 'Satoshi Tajiri', role: 'series creator', text: 'The idea was born from a childhood passion: Tajiri collected insects, and he wanted children growing up in cities to have that same feeling of hunting and collecting. Both the game and the “Gotta catch ’em all” principle grew out of it.', src: 'retelling of interviews from various years' },
  { who: 'Satoshi Tajiri', role: 'series creator', text: 'Trading Pokémon over a cable grew out of an image: creatures “crawling” along the wire from one player to another. That is why, in the original series, the connection between people mattered most of all.', src: 'retelling of interviews from various years' },
  { who: 'Shigeki Morimoto', role: 'Game Freak programmer', text: 'Mew appeared in Red / Green after the game had already been checked: the cartridge had a little free memory left, and he added a secret Pokémon. Nintendo did not know about it.', src: 'retelling of the developers’ account' },
  { who: 'Series designers', role: 'Game Freak', text: 'They try to make a new Pokémon’s look recognizable by its silhouette: that is why heroes like {25} and {6} read clearly even on the tiny sprites of the first games.', src: 'general design principle' },
];
