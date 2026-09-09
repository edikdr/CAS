/* ============================================================
   Hollywood Undead — data layer

   Band, roster, records, lore, and the liner notes that open under a
   track. An unofficial fan archive: not affiliated with the band, with
   BMG, or with anyone who works with them.

   A NOTE ON WHAT IS AND IS NOT WRITTEN DOWN HERE.

   Tracklists are not. Six records is a few hundred songs once you count
   the deluxe editions, the bonus discs and the re-releases, and a
   tracklist typed from memory is a tracklist with mistakes in it. So the
   real one is read from the iTunes Search API at runtime — the same call
   that fetches the previews — and each record keeps only a short seed of
   its best-known songs for when that lookup cannot be made. What you see
   on screen is the store's own listing, not mine.

   Lyrics are not here either. They belong to their publishers. The track
   panel fetches them from LRCLIB when it is opened and keeps them for as
   long as the tab is; what ships in this folder is commentary, credits
   and a link to the song's page on Genius.
   ============================================================ */

const BAND = {
  name: 'Hollywood Undead',
  formed: 2005,
  origin: 'Los Angeles, California',
  symbol: 'The dove and grenade',
  genres: 'Rap rock · rap metal · nu metal · alternative'
};

const ARTIST = 'Hollywood Undead';

/* ------------------------------------------------------------
   The roster.

   `cell` is the [column, row] of this member's poster in
   assets/masks.webp, which is a 2-column, 3-row sheet. Every mask on it
   is from the Day of the Dead cycle — all six posters name a song from
   that record — so this is one era's set of faces, not a career's.

   The mapping of mask to member was given by the site's owner for five
   of the six. The sixth, Da Kurlzz, is the member of that line-up left
   over once the other five are placed, so it is a deduction and not a
   sighting. Move a `cell` pair to correct it; nothing else needs to
   change.
   ------------------------------------------------------------ */
const ROSTER = [
  {
    id: 'j3t',
    cell: [0, 0],
    poster: 'Usual Suspects',
    name: 'Johnny 3 Tears',
    real: 'George Ragan',
    mask: 'Blue, with three tears under the right eye',
    role: 'Vocals · Bass',
    years: '2005 — present',
    status: 'current',
    short: 'The low, flat delivery the records keep coming back to. Founding member; the tears are the mask everyone can draw from memory.',
    story: [
      'One of the voices the band was built around in 2005, and the one that has changed least since — a low, unhurried, deliberately unmusical delivery that sits underneath whatever the song is doing above it.',
      'Writes the bleakest material on most records. Where the band is at its most cartoonish, he is usually the one turning it back towards something that hurts.',
      'The three tears have been redrawn every album cycle and never replaced. It is the one mask in the group that a stranger could sketch.'
    ]
  },
  {
    id: 'danny',
    cell: [1, 0],
    poster: 'Gravity',
    name: 'Danny',
    real: 'Daniel Murillo',
    mask: 'Gold',
    role: 'Clean vocals · Guitar · Keys',
    years: '2010 — present',
    status: 'current',
    short: 'The sung chorus. Joined in 2010 and turned the band into one that could hold a melody without irony.',
    story: [
      'Joined in 2010, after Deuce left. He had come up through the Los Angeles scene and had a range nobody in the group had had before: an actual singing voice, used straight.',
      'That single change is most of what separates <em>American Tragedy</em> from <em>Swan Songs</em>. The choruses stop being shouted and start being sung, and the band suddenly has a second mode to move between.',
      'The gold mask arrived with the Day of the Dead cycle and is the most ornamental thing any of them have worn.'
    ]
  },
  {
    id: 'jdog',
    cell: [0, 1],
    poster: 'How We Roll',
    name: 'J-Dog',
    real: 'Jorel Decker',
    mask: 'Half-and-half, with retouching under the eyes',
    role: 'Rhythm guitar · Bass · Keys · Programming · Vocals',
    years: '2005 — present',
    status: 'current',
    short: 'Co-founded the band and builds most of what it sounds like. The producer in the room as much as the player.',
    story: [
      'Co-founded Hollywood Undead in 2005 and has been the group’s musical spine ever since — rhythm guitar, bass, keys, programming, and a large share of the production.',
      'The band began as songs uploaded to MySpace with nothing behind them, which meant somebody had to actually build the records. That was, and largely still is, him.',
      'His mask is the one that has been redesigned most often: split down the middle, worked over with paint under the eyes, different on nearly every cycle.'
    ]
  },
  {
    id: 'funnyman',
    cell: [1, 1],
    poster: 'Live Forever',
    name: 'Funny Man',
    real: 'Dylan Alvarez',
    mask: 'All black, worn under a cap',
    role: 'Vocals',
    years: '2005 — present',
    status: 'current',
    short: 'The comic register, and the one who most often refuses to take the record’s own mood seriously.',
    story: [
      'With the group from the beginning. His verses are the ones that puncture whatever tone the rest of the song was building, and that friction is a large part of why the band sounds like nobody else.',
      'The plainest mask in the set — flat black, no features, usually under a cap — which on stage reads as more unsettling than the decorated ones, not less.',
      'The joke is a real one and it is also a structural device: the records need somewhere to let the air out.'
    ]
  },
  {
    id: 'dakurlzz',
    cell: [0, 2],
    poster: 'Disease',
    name: 'Da Kurlzz',
    real: 'Matthew St. Claire',
    mask: 'Split face, half drawn and half blank',
    role: 'Drums · Percussion · Screamed vocals',
    years: '2005 — 2017',
    status: 'past',
    short: 'Drums, percussion and every scream on the first four records. Left in 2017.',
    story: [
      'A founding member, on drums and percussion, and the source of the screamed vocal that cuts across so much of the early catalogue.',
      'Played on <em>Swan Songs</em>, <em>American Tragedy</em>, <em>Notes from the Underground</em> and <em>Day of the Dead</em> — the whole of the run that built the band’s audience.',
      'Left the group in 2017, which is why <em>Five</em> is the first record made by the line-up that has held ever since.',
      '<em>This is the one mask on the sheet identified by elimination rather than by sight — see the note in the README.</em>'
    ]
  },
  {
    id: 'charlie',
    cell: [1, 2],
    poster: 'Day of the Dead',
    name: 'Charlie Scene',
    real: 'Jordon Terrell',
    mask: 'Bandana and a cap, name written across the poster',
    role: 'Lead guitar · Vocals',
    years: '2005 — present',
    status: 'current',
    short: 'Lead guitar and the most quotable verses on the band’s best-known songs.',
    story: [
      'Lead guitar, and the voice most people can do an impression of — a drawled, deadpan register that carries the hooks on a lot of the singles.',
      'The guitar work is the thing that gets least credit: the riffs under the early material are what keep it from being a rap record with distortion on top.',
      'His look is barely a mask at all — a bandana, a cap, sunglasses — which somehow makes him the most identifiable of the six.'
    ]
  }
];

/* Not on the mask sheet, but he is half of why the band exists. */
const FORMER = [
  {
    name: 'Deuce',
    real: 'Aron Erlichman',
    years: '2005 — 2010',
    role: 'Vocals · Production',
    note: 'Co-founded the band with J-Dog in 2005 and sang on <em>Swan Songs</em>. '
        + 'Left in 2010, in acrimony that played out in public and in songs on both '
        + 'sides for years afterwards. Danny replaced him.'
  }
];

/* ------------------------------------------------------------
   The records.

   `seed` is a handful of songs each record is known by, shown until the
   iTunes lookup returns the real listing. It is not the tracklist and is
   not presented as one.
   ------------------------------------------------------------ */
const ALBUMS = [
  {
    id: 'swan-songs',
    title: 'Swan Songs',
    year: 2008,
    label: 'A&M/Octone',
    era: 'The MySpace record, finally pressed',
    note: 'Three years of songs uploaded to a profile, collected and released as a debut. '
        + 'It is uneven on purpose and it is the reason the band had an audience before it had a label deal.',
    seed: ['Undead', 'Everywhere I Go', 'Young', 'No. 5', 'California', 'Black Dahlia']
  },
  {
    id: 'american-tragedy',
    title: 'American Tragedy',
    year: 2011,
    label: 'A&M/Octone',
    era: 'First record with Danny',
    note: 'The line-up change rebuilt the band. Choruses are sung rather than shouted, the production is enormous, '
        + 'and the group stops sounding like a joke that got out of hand.',
    seed: ['Hear Me Now', 'Been to Hell', 'Comin’ in Hot', 'Levitate', 'Coming Back Down']
  },
  {
    id: 'notes',
    title: 'Notes from the Underground',
    year: 2013,
    label: 'A&M/Octone',
    era: 'The heaviest of them',
    note: 'Darker and more compressed than anything either side of it. The band pushes towards metal '
        + 'and away from the party record its reputation was built on.',
    seed: ['We Are', 'Dead Bite', 'Another Way Out', 'Up in Smoke']
  },
  {
    id: 'day-of-the-dead',
    title: 'Day of the Dead',
    year: 2015,
    label: 'Interscope',
    era: 'The masks on this site',
    note: 'Every poster in the roster above comes from this cycle. Electronics come forward, the hooks get bigger, '
        + 'and the artwork becomes as much of the release as the songs.',
    seed: ['Day of the Dead', 'Usual Suspects', 'How We Roll', 'Gravity', 'Disease', 'Live Forever']
  },
  {
    id: 'five',
    title: 'Five',
    year: 2017,
    label: 'BMG',
    era: 'Five members, and it is the title',
    note: 'The first record after Da Kurlzz left, and the band names it after what is left. '
        + 'Looser and warmer than <em>Notes</em>, with the group audibly enjoying itself again.',
    seed: ['California Dreaming', 'Whatever It Takes', 'Renegade', 'Black Cadillac']
  },
  {
    id: 'hotel-kalifornia',
    title: 'Hotel Kalifornia',
    year: 2022,
    label: 'BMG',
    era: 'Twenty years in',
    note: 'A record about the state the band is named after and has never left, made by a line-up that has now '
        + 'been together longer than the one people remember.',
    seed: ['Chaos', 'Alright', 'Wild in These Streets', 'House of Mirrors']
  }
];

/* ------------------------------------------------------------
   Liner notes, in the shape Genius publishes them.

   Written here rather than fetched: Genius refuses cross-origin browser
   requests, so a page cannot read its API without a server in front of
   it, and this site has none by design. Each entry carries the credits
   and the commentary; the words themselves come from LRCLIB at runtime
   and are never stored.
   ------------------------------------------------------------ */
const TRACK_NOTES = {
  'Undead': {
    album: 'Swan Songs',
    writers: ['Aron Erlichman', 'Jorel Decker', 'George Ragan', 'Jordon Terrell', 'Dylan Alvarez'],
    producers: ['Jorel Decker', 'Aron Erlichman'],
    annotation: 'The song that names the band to itself. Every member takes a verse, which becomes '
      + 'the format the group runs on for the next fifteen years: six people who do not sound alike, '
      + 'passing a song between them.'
  },
  'Everywhere I Go': {
    album: 'Swan Songs',
    writers: ['Aron Erlichman', 'Jorel Decker', 'Jordon Terrell'],
    producers: ['Jorel Decker'],
    annotation: 'The MySpace-era single, and the clearest surviving evidence of what the band sounded '
      + 'like before anyone was paying for it — cheap, fast, and completely certain of itself.'
  },
  'Young': {
    album: 'Swan Songs',
    writers: ['Aron Erlichman', 'Jorel Decker', 'George Ragan'],
    producers: ['Jorel Decker'],
    annotation: 'The first sign that the band could do something other than the party song. It is the '
      + 'template for everything Johnny 3 Tears writes later.'
  },
  'Hear Me Now': {
    album: 'American Tragedy',
    writers: ['Daniel Murillo', 'Jorel Decker', 'George Ragan', 'Jordon Terrell'],
    producers: ['Ben Grosse', 'Jorel Decker'],
    annotation: 'Danny’s arrival, stated plainly: a sung chorus at full height, over a band that '
      + 'until a year earlier had no one who could deliver one. It is the pivot the whole catalogue turns on.'
  },
  'Been to Hell': {
    album: 'American Tragedy',
    writers: ['Jorel Decker', 'George Ragan', 'Jordon Terrell', 'Daniel Murillo'],
    producers: ['Griffin Boice', 'Jorel Decker'],
    annotation: 'Los Angeles as the underworld, which is the band’s oldest and best idea. The city is '
      + 'not a backdrop in their songs; it is the antagonist.'
  },
  'Day of the Dead': {
    album: 'Day of the Dead',
    writers: ['Jorel Decker', 'George Ragan', 'Jordon Terrell', 'Daniel Murillo', 'Dylan Alvarez'],
    producers: ['Jorel Decker', 'Griffin Boice'],
    annotation: 'The title track of the cycle every mask on this page comes from. The record leans hardest '
      + 'into electronics, and this is where that decision is loudest.'
  },
  'Usual Suspects': {
    album: 'Day of the Dead',
    writers: ['Jorel Decker', 'George Ragan', 'Jordon Terrell', 'Daniel Murillo'],
    producers: ['Jorel Decker'],
    annotation: 'Six masked men and a title lifted from a police line-up. The joke is the band’s whole '
      + 'public presentation, made explicit for one song.'
  },
  'How We Roll': {
    album: 'Day of the Dead',
    writers: ['Jorel Decker', 'Jordon Terrell', 'Dylan Alvarez'],
    producers: ['Jorel Decker'],
    annotation: 'Charlie Scene and Funny Man doing what they were put in the band to do, over a riff that '
      + 'would have fitted on the first record.'
  },
  'We Are': {
    album: 'Notes from the Underground',
    writers: ['Jorel Decker', 'George Ragan', 'Daniel Murillo'],
    producers: ['Griffin Boice', 'Jorel Decker'],
    annotation: 'The closest the band has come to writing an anthem without flinching from it. '
      + '<em>Notes</em> is their bleakest record and this is the one moment it looks up.'
  },
  'California Dreaming': {
    album: 'Five',
    writers: ['Jorel Decker', 'George Ragan', 'Jordon Terrell', 'Daniel Murillo', 'Dylan Alvarez'],
    producers: ['Jorel Decker'],
    annotation: 'Not the Mamas and the Papas song, and the borrowed title is the point: the same state, '
      + 'the same dream, read back as a threat.'
  },
  'Whatever It Takes': {
    album: 'Five',
    writers: ['Jorel Decker', 'Daniel Murillo', 'Jordon Terrell'],
    producers: ['Jorel Decker'],
    annotation: 'The five-piece finding out it still works. Made immediately after the line-up '
      + 'shrank, and it sounds like a band with something to prove.'
  },
  'Hotel Kalifornia': {
    album: 'Hotel Kalifornia',
    writers: ['Jorel Decker', 'George Ragan', 'Jordon Terrell', 'Daniel Murillo', 'Dylan Alvarez'],
    producers: ['Jorel Decker'],
    annotation: 'Twenty years in, the band writes about the place it never left and names it with a K, '
      + 'which is roughly how seriously it wants you to take the homage.'
  }
};

/* ------------------------------------------------------------
   The lore.
   ------------------------------------------------------------ */
const TIMELINE = [
  {
    year: '2005',
    title: 'A profile, not a band',
    text: 'Jorel Decker and Aron Erlichman start writing together in Los Angeles and put the results on '
        + 'MySpace. There is no label, no manager, no plan and no live show — there is a page, and songs '
        + 'appear on it. Friends are pulled in one at a time until there are six of them.',
    detail: 'The masks arrive early and for a practical reason as much as an artistic one: none of them '
          + 'particularly wanted to be recognised while the thing was still a joke.'
  },
  {
    year: '2006 — 2007',
    title: 'An audience before a record',
    text: 'The songs spread the way things spread on MySpace in 2006 — profile to profile, with no press '
        + 'and no radio anywhere in the chain. By the time the industry notices, there is already a '
        + 'crowd, which inverts the usual order of operations and gives the band unusual leverage.',
    detail: 'They sign to MySpace Records, then move to A&M/Octone. The label history of these two years '
          + 'is contested enough that it is not asked about in the quizzes as though it had one clean answer.'
  },
  {
    year: '2008',
    title: 'Swan Songs',
    text: 'The debut collects three years of uploads. It is wildly inconsistent, swinging between party '
        + 'songs and something much darker inside a single tracklist, and that inconsistency is the '
        + 'record — it is what a profile sounds like when you press it to a disc.',
    detail: '"Undead" gives every member a verse and sets the format the band has used ever since.'
  },
  {
    year: '2010',
    title: 'The split',
    text: 'Deuce leaves. It is not amicable, and it plays out in public and in songs on both sides for '
        + 'years. Daniel Murillo comes in and brings something the band had never had: a straight '
        + 'singing voice, used without irony.',
    detail: 'Everything the band does after this point is possible because of that one substitution.'
  },
  {
    year: '2011',
    title: 'American Tragedy',
    text: 'The first record with Danny, and the sound of a group that has decided to be good at this. '
        + 'The production is huge, the choruses are sung, and Los Angeles becomes the subject rather '
        + 'than the setting.',
    detail: 'The masks are redesigned wholesale for this cycle — the first time they are treated as a '
          + 'visual identity to be art-directed rather than six things people happened to own.'
  },
  {
    year: '2013',
    title: 'Notes from the Underground',
    text: 'The heaviest and least forgiving record they have made. The guitars come forward, the jokes '
        + 'thin out, and the band pushes towards metal.',
    detail: 'It is the record their audience argues about most, which is usually the sign of a good one.'
  },
  {
    year: '2015',
    title: 'Day of the Dead',
    text: 'Electronics move to the front and the artwork becomes half the release. This is the cycle '
        + 'every mask on this page comes from, and the one where the band’s visual language is at '
        + 'its most designed.',
    detail: 'Six posters, six masks, six songs — the set the roster above is cut from.'
  },
  {
    year: '2017',
    title: 'Five',
    text: 'Da Kurlzz leaves after twelve years. The record is named for what remains, which is either '
        + 'defiant or resigned depending on the day. It is looser and warmer than <em>Notes</em>, and '
        + 'the band sounds like it is enjoying itself again.',
    detail: 'The line-up settled here has now held longer than the one most people picture.'
  },
  {
    year: '2020',
    title: 'New Empire',
    text: 'Released in two volumes across a year that took the live show away from everyone. The band '
        + 'keeps working anyway, which by this point is the most predictable thing about them.',
    detail: null
  },
  {
    year: '2022',
    title: 'Hotel Kalifornia',
    text: 'Twenty years from a MySpace profile to a record about the state they are named after and have '
        + 'never left. The K is doing a lot of work, and it is meant to.',
    detail: null
  }
];

/* ------------------------------------------------------------
   Where to hear a track. Search links rather than hard-coded ids:
   they resolve for every release and do not go stale.
   ------------------------------------------------------------ */
const PLATFORMS = [
  { name: 'Spotify', url: t => `https://open.spotify.com/search/${encodeURIComponent(t + ' ' + ARTIST)}` },
  { name: 'Apple Music', url: t => `https://music.apple.com/search?term=${encodeURIComponent(t + ' ' + ARTIST)}` },
  { name: 'YouTube', url: t => `https://www.youtube.com/results?search_query=${encodeURIComponent(ARTIST + ' ' + t)}` },
  { name: 'Deezer', url: t => `https://www.deezer.com/search/${encodeURIComponent(t + ' ' + ARTIST)}` }
];

/* Genius' own slug rule: lowercase, ampersand spelled out, apostrophes
   dropped, every other run of non-alphanumerics collapsed to one hyphen. */
function geniusSlug(title) {
  return String(title)
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function geniusUrl(track) {
  return `https://genius.com/Hollywood-undead-${geniusSlug(track)}-lyrics`;
}

function geniusSearchUrl(q) {
  return `https://genius.com/search?q=${encodeURIComponent(q + ' ' + ARTIST)}`;
}

function notesFor(track) {
  return TRACK_NOTES[track] || null;
}

function memberById(id) {
  return ROSTER.find(m => m.id === id) || null;
}
