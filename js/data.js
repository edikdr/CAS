/* ============================================================
   CAS Fan Sanctuary — data layer
   Members, discography, singles, timecoded lyric excerpts,
   API endpoint catalogue.
   ============================================================ */

const MEMBERS = [
  {
    name: 'Greg Gonzalez',
    role: 'Vocals · Guitar · Songwriter',
    status: 'current',
    initials: 'GG',
    photo: 'assets/photo/greg.webp',
    years: '2008 — present',
    origin: 'El Paso, Texas',
    instruments: 'Voice, electric guitar',
    bio: 'Founder (2008). Born and raised in El Paso. Writes almost all of the material. The hushed, androgynous voice at the centre of every record.',
    extra: [
      'Started the project in El Paso in 2008 and recorded the <em>I.</em> EP inside a four-story stairwell at the University of Texas at El Paso — the reverb on those tracks is the building, not a plugin.',
      'Moved the project to Brooklyn, where the self-titled debut (2017) was shaped. His writing keeps returning to the same few things: desire, cigarettes, hotel rooms, the exact moment something ends.',
      'Handles the arrangements and production direction. When people say a song "sounds like Cigarettes After Sex", they usually mean his guitar tone and the space he leaves around the vocal.'
    ],
    notable: 'Wrote “Apocalypse”, “K.”, “Sunsetz”, “Heavenly”, “Tejano Blue”.'
  },
  {
    name: 'Randall Miller',
    role: 'Bass · Graphic Design',
    status: 'current',
    initials: 'RM',
    photo: 'assets/photo/randall.webp',
    years: 'Brooklyn era — present',
    origin: 'Brooklyn, NY',
    instruments: 'Bass guitar',
    bio: 'Bassist and visual contributor. Joined after the move to Brooklyn. Responsible for much of the band’s graphic design language.',
    extra: [
      'Plays a deliberately minimal low end — long held notes that let the reverb bloom instead of competing with it. On record his bass is often the only thing keeping time.',
      'Also shapes a large part of the band’s visual identity: covers, packaging, type. The stark black-and-white grammar of the sleeves runs through his hands.',
      'The quiet architecture underneath everything else.'
    ],
    notable: 'Bass and design across the Brooklyn-era releases.'
  },
  {
    name: 'Jacob Tomsky',
    role: 'Drums',
    status: 'current',
    initials: 'JT',
    photo: 'assets/photo/jacob.webp',
    years: 'Brooklyn era — present',
    origin: 'Brooklyn, NY',
    instruments: 'Drums, percussion',
    bio: 'Drummer. Also the author of the New York Times bestseller “Heads in Beds”. Plays with deliberate restraint.',
    extra: [
      'Plays slower than you expect him to. The whole live show breathes at the pace he sets — never rushing a fill, always leaving the room for the guitar to decay.',
      'Outside the band he is a writer: <em>Heads in Beds</em>, a memoir of years spent working in hotels, was a New York Times bestseller.',
      'The heartbeat of the live set.'
    ],
    notable: 'Author of “Heads in Beds”; drums on the Brooklyn-era records.'
  },
  {
    name: 'Phillip Tubbs',
    role: 'Keyboards · Electric Guitar',
    status: 'past',
    initials: 'PT',
    photo: null,
    years: 'El Paso / debut era',
    origin: 'El Paso, Texas',
    instruments: 'Keyboards, electric guitar',
    bio: 'Early collaborator from the El Paso period. Keyboards and electric guitar through the debut era and several singles.',
    extra: [
      'Part of the line-up that carried the band out of El Paso and into the self-titled album.',
      'His keyboard pads sit under the early material as a second horizon behind the guitars.'
    ],
    notable: 'Debut-era keyboards and guitar.'
  },
  {
    name: 'Josh Marcus',
    role: 'Keyboards',
    status: 'past',
    initials: 'JM',
    photo: null,
    years: 'Later line-ups',
    origin: '—',
    instruments: 'Keyboards',
    bio: 'Keyboards in later line-ups and live configurations.',
    extra: ['Contributed to the atmospheric layer that sits under the vocal in the live arrangements.'],
    notable: 'Live and later-era keyboards.'
  },
  {
    name: 'Emily Davis',
    role: 'Acoustic Guitar',
    status: 'past',
    initials: 'ED',
    photo: null,
    years: 'Earliest recordings',
    origin: 'El Paso, Texas',
    instruments: 'Acoustic guitar',
    bio: 'Acoustic guitar on the earliest recordings, including the “I.” EP sessions.',
    extra: ['Part of the original El Paso circle around the first recordings.'],
    notable: 'Played on the “I.” era material.'
  },
  {
    name: 'Steve Herrada',
    role: 'Keyboards',
    status: 'past',
    initials: 'SH',
    photo: null,
    years: '“I.” era',
    origin: 'El Paso, Texas',
    instruments: 'Keyboards',
    bio: 'Keyboards on the formative “I.” era, including the first stairwell recordings.',
    extra: ['Present for the sessions that gave the band its reverb-drenched signature.'],
    notable: 'Keyboards on the stairwell sessions.'
  },
  {
    name: 'Greg Leah',
    role: 'Drums · Visuals',
    status: 'past',
    initials: 'GL',
    photo: null,
    years: 'Pre-Brooklyn',
    origin: 'El Paso, Texas',
    instruments: 'Drums',
    bio: 'Early drums and visual work in the pre-Brooklyn configuration.',
    extra: ['Played on early material and contributed to the band’s first visual output.'],
    notable: 'Early drums and visuals.'
  }
];

const ALBUMS = [
  {
    id: 'icsy',
    title: 'I Can See You',
    year: 2009,
    type: 'EP (self-released)',
    spotifyAlbum: null,
    cover: { art: 'assets/cut/vinyl.webp', tone: 'warm' },
    note: 'The first self-released EP, pressed while the project was still entirely in El Paso.',
    tracks: [{ name: 'I Can See You', duration: '—' }]
  },
  {
    id: 'i',
    title: 'I.',
    year: 2012,
    type: 'EP',
    spotifyAlbum: '5fzwP4FRJjFQBBmhKJwpWn',
    cover: { art: 'assets/cut/filmstrip.webp', tone: 'mono' },
    note: 'Recorded in a four-story stairwell at the University of Texas at El Paso. Years later the algorithms found it.',
    tracks: [
      { name: "Nothing's Gonna Hurt You Baby", duration: '4:46' },
      { name: "I'm a Firefighter", duration: '4:31' },
      { name: 'Dreaming of You', duration: '5:22' },
      { name: 'Starry Eyes', duration: '3:26' }
    ]
  },
  {
    id: 'self',
    title: 'Cigarettes After Sex',
    year: 2017,
    type: 'Album',
    spotifyAlbum: '2mxFsS5yylSTHNivV53HoA',
    cover: { art: 'assets/cut/album_couple.webp', tone: 'mono' },
    note: 'The self-titled debut on Partisan Records. The record that turned a bedroom sound into a global mood.',
    tracks: [
      { name: 'K.', id: '3Mlhgm39yBpuCwyZB8d8Md', duration: '5:19' },
      { name: 'Each Time You Fall in Love', duration: '4:50' },
      { name: 'Sunsetz', duration: '3:34' },
      { name: 'Apocalypse', id: '52k6PTgqVCBHrLndNtutrC', duration: '4:50' },
      { name: 'Flash', duration: '4:34' },
      { name: 'Sweet', duration: '4:51' },
      { name: 'Opera House', duration: '6:04' },
      { name: 'Truly', duration: '4:03' },
      { name: 'John Wayne', duration: '4:18' },
      { name: 'Young & Dumb', duration: '4:33' }
    ]
  },
  {
    id: 'cry',
    title: 'Cry',
    year: 2019,
    type: 'Album',
    spotifyAlbum: '63yRRBtLX8eqbOLD6f0y9U',
    cover: { art: 'assets/cut/cd_disc.webp', tone: 'disc' },
    note: 'Written and recorded away from the city, in a villa on Mallorca. Warmer, slower, further gone.',
    tracks: [
      { name: "Don't Let Me Go", duration: '4:22' },
      { name: 'Kiss It Off Me', duration: '4:29' },
      { name: 'Heavenly', duration: '4:48' },
      { name: "You're the Only Good Thing in My Life", duration: '4:35' },
      { name: 'Touch', duration: '4:52' },
      { name: 'Hentai', duration: '4:45' },
      { name: 'Cry', duration: '4:16' },
      { name: 'Falling in Love', duration: '4:05' },
      { name: 'Pure', duration: '4:14' }
    ]
  },
  {
    id: 'xs',
    title: "X's",
    year: 2024,
    type: 'Album',
    spotifyAlbum: '10i6evsxSFs2fuPQRWvI6I',
    cover: { art: 'assets/cut/polaroid_xs.webp', tone: 'mono' },
    note: 'Seven years after the debut: the same reverb, a harder edge, more Texas in the guitar.',
    tracks: [
      { name: "X's", duration: '3:33' },
      { name: 'Tejano Blue', duration: '3:54' },
      { name: 'Silver Sable', duration: '3:52' },
      { name: 'Hideaway', duration: '4:37' },
      { name: 'Holding You, Holding Me', duration: '3:30' },
      { name: 'Dark Vacay', duration: '3:33' },
      { name: 'Baby Blue Movie', duration: '4:05' },
      { name: 'Hot', duration: '3:57' },
      { name: 'Dreams from Bunker Hill', duration: '3:39' },
      { name: 'Ambien Slide', duration: '3:33' }
    ]
  }
];

const SINGLES = [
  { title: 'Affection', year: 2015, note: 'b/w “Keep On Loving You” (REO Speedwagon cover)' },
  { title: 'K.', year: 2016, note: 'Lead single from the debut' },
  { title: 'Apocalypse', year: 2017, note: 'Multi-platinum (RIAA)' },
  { title: 'Each Time You Fall in Love', year: 2017 },
  { title: 'Sweet', year: 2017 },
  { title: 'Crush', year: 2018, note: 'b/w “Sesame Syrup”' },
  { title: 'Neon Moon', year: 2018, note: 'Brooks & Dunn cover' },
  { title: 'Heavenly', year: 2019 },
  { title: 'Falling in Love', year: 2019 },
  { title: "You're All I Want", year: 2020 },
  { title: 'Pistol', year: 2022 },
  { title: 'Bubblegum', year: 2023, note: 'b/w “Stop Waiting”' },
  { title: 'Motion Picture Soundtrack', year: 2023, note: 'Radiohead cover' },
  { title: 'Tejano Blue', year: 2024, note: 'Lead single from X’s' },
  { title: 'Dark Vacay', year: 2024 },
  { title: 'Baby Blue Movie', year: 2024 },
  { title: 'Anna Karenina', year: 2025, note: 'b/w “The Crystal Ship” (The Doors cover)' },
  { title: 'Twizzler', year: 2026 }
];

/* ------------------------------------------------------------
   Timecoded lyric EXCERPTS.
   Short signature lines only, for identification/study — the
   full lyrics are not reproduced here. Timings are approximate
   fan transcriptions; use the LRCLIB button in the API panel to
   pull real synced lyrics when you are online.
   ------------------------------------------------------------ */
const LYRICS = [
  {
    track: 'Apocalypse', album: 'Cigarettes After Sex', year: 2017, duration: 290,
    spotify: '52k6PTgqVCBHrLndNtutrC',
    lines: [
      { t: 34.0, text: 'Your lips, my lips — apocalypse' },
      { t: 62.5, text: 'Your mouth, my mouth' },
      { t: 96.0, text: '[ instrumental — the guitar takes the verse ]' },
      { t: 148.0, text: 'Your lips, my lips — apocalypse' },
      { t: 214.0, text: '[ outro: reverb tail, no vocal ]' }
    ]
  },
  {
    track: 'Sweet', album: 'Cigarettes After Sex', year: 2017, duration: 291,
    lines: [
      { t: 28.0, text: 'Think I like you best when you’re just with me' },
      { t: 74.0, text: '[ chorus enters ]' },
      { t: 132.0, text: 'I will gladly break my heart for you' },
      { t: 205.0, text: '[ instrumental outro ]' }
    ]
  },
  {
    track: 'Cry', album: 'Cry', year: 2019, duration: 256,
    lines: [
      { t: 22.0, text: 'I swear I’ll only make you cry' },
      { t: 68.0, text: '[ second verse ]' },
      { t: 118.0, text: 'I swear I’ll only make you cry' },
      { t: 190.0, text: '[ outro ]' }
    ]
  },
  {
    track: 'K.', album: 'Cigarettes After Sex', year: 2017, duration: 319,
    spotify: '3Mlhgm39yBpuCwyZB8d8Md',
    lines: [
      { t: 40.0, text: '[ opening verse — hotel room, cigarette ]' },
      { t: 96.0, text: 'Kiss me now that I’m older' },
      { t: 164.0, text: '[ guitar solo ]' },
      { t: 246.0, text: '[ final chorus ]' }
    ]
  },
  {
    track: 'Heavenly', album: 'Cry', year: 2019, duration: 288,
    lines: [
      { t: 30.0, text: '[ verse one ]' },
      { t: 88.0, text: 'You’re heavenly' },
      { t: 158.0, text: '[ bridge ]' },
      { t: 232.0, text: 'You’re heavenly' }
    ]
  },
  {
    track: 'Tejano Blue', album: "X's", year: 2024, duration: 234,
    lines: [
      { t: 18.0, text: '[ intro — the Texas guitar figure ]' },
      { t: 46.0, text: 'Dancing in the dark with you' },
      { t: 112.0, text: '[ chorus ]' },
      { t: 186.0, text: '[ outro ]' }
    ]
  },
  {
    track: 'Sunsetz', album: 'Cigarettes After Sex', year: 2017, duration: 214,
    lines: [
      { t: 24.0, text: '[ verse ]' },
      { t: 70.0, text: 'When you’re gone I’ll still see you' },
      { t: 140.0, text: '[ chorus ]' },
      { t: 182.0, text: '[ outro ]' }
    ]
  },
  {
    track: "Nothing's Gonna Hurt You Baby", album: 'I.', year: 2012, duration: 286,
    lines: [
      { t: 36.0, text: '[ stairwell reverb, first verse ]' },
      { t: 92.0, text: 'Nothing’s gonna hurt you baby' },
      { t: 168.0, text: '[ instrumental ]' },
      { t: 238.0, text: 'Nothing’s gonna hurt you baby' }
    ]
  }
];

/* ------------------------------------------------------------
   Public API catalogue — everything the lyrics panel can talk to.
   ------------------------------------------------------------ */
const API_CATALOGUE = [
  {
    id: 'lrclib',
    name: 'LRCLIB',
    tag: 'Synced lyrics · no key',
    base: 'https://lrclib.net/api',
    desc: 'Open lyrics database. Returns both plain lyrics and <code>syncedLyrics</code> in LRC format — i.e. every line prefixed with a <code>[mm:ss.xx]</code> timecode, which is exactly what the player above consumes.',
    endpoints: [
      { m: 'GET', p: '/get?artist_name={artist}&track_name={track}', d: 'Exact match. Optional <code>album_name</code> and <code>duration</code> (seconds) sharpen the result.' },
      { m: 'GET', p: '/get/{id}', d: 'Fetch one record by LRCLIB id.' },
      { m: 'GET', p: '/search?q={query}', d: 'Fuzzy search, returns an array of candidates.' },
      { m: 'GET', p: '/search?artist_name={artist}&track_name={track}', d: 'Field-scoped search.' }
    ],
    sample: `{
  "id": 3396226,
  "trackName": "Apocalypse",
  "artistName": "Cigarettes After Sex",
  "albumName": "Cigarettes After Sex",
  "duration": 290,
  "instrumental": false,
  "plainLyrics": "Your lips, my lips…",
  "syncedLyrics": "[00:34.00] Your lips, my lips…"
}`,
    live: true
  },
  {
    id: 'itunes',
    name: 'iTunes Search API',
    tag: 'Artwork · 30s previews · no key',
    base: 'https://itunes.apple.com',
    desc: 'Apple’s public catalogue search. Useful for high-resolution cover art (<code>artworkUrl100</code> — swap <code>100x100</code> for <code>1000x1000</code>) and a 30-second <code>previewUrl</code> MP3 you can actually attach to an <code>&lt;audio&gt;</code> element.',
    endpoints: [
      { m: 'GET', p: '/search?term={query}&entity=song&limit=25', d: 'Track search.' },
      { m: 'GET', p: '/search?term={query}&entity=album', d: 'Release search.' },
      { m: 'GET', p: '/lookup?id={collectionId}&entity=song', d: 'Full track list for one release.' }
    ],
    sample: `{
  "resultCount": 1,
  "results": [{
    "trackName": "Apocalypse",
    "collectionName": "Cigarettes After Sex",
    "trackTimeMillis": 290000,
    "artworkUrl100": "…/100x100bb.jpg",
    "previewUrl": "…/preview.m4a"
  }]
}`,
    live: true
  },
  {
    id: 'musicbrainz',
    name: 'MusicBrainz',
    tag: 'Release metadata · no key',
    base: 'https://musicbrainz.org/ws/2',
    desc: 'The open music encyclopaedia. Canonical release groups, dates, labels and credits. Send a descriptive <code>User-Agent</code> and stay under ~1 request/second.',
    endpoints: [
      { m: 'GET', p: '/artist?query={name}&fmt=json', d: 'Resolve the artist MBID.' },
      { m: 'GET', p: '/release-group?artist={mbid}&type=album&fmt=json', d: 'Every album release group.' },
      { m: 'GET', p: '/recording?query=artist:{name}&fmt=json', d: 'Recordings, with lengths in ms.' }
    ],
    sample: `{
  "release-groups": [{
    "title": "X's",
    "first-release-date": "2024-07-12",
    "primary-type": "Album"
  }]
}`,
    live: true
  },
  {
    id: 'coverart',
    name: 'Cover Art Archive',
    tag: 'Cover art · no key',
    base: 'https://coverartarchive.org',
    desc: 'Cover images keyed by MusicBrainz release / release-group MBID. Pairs directly with the MusicBrainz lookups above.',
    endpoints: [
      { m: 'GET', p: '/release-group/{mbid}', d: 'JSON index of available images.' },
      { m: 'GET', p: '/release-group/{mbid}/front-500', d: 'Front cover, 500 px, as an image.' }
    ],
    sample: `{ "images": [{ "front": true, "image": "https://…/front.jpg" }] }`,
    live: true
  },
  {
    id: 'spotify',
    name: 'Spotify Embed / oEmbed',
    tag: 'Playback · no key',
    base: 'https://open.spotify.com',
    desc: 'The only no-key way to get real playback in a static page. The album players in the discography section are these iframes. oEmbed returns the ready-made embed HTML for any Spotify URL.',
    endpoints: [
      { m: 'IFRAME', p: '/embed/album/{albumId}', d: 'Album player.' },
      { m: 'IFRAME', p: '/embed/track/{trackId}', d: 'Single-track player.' },
      { m: 'GET', p: 'https://open.spotify.com/oembed?url={spotifyUrl}', d: 'Embed metadata as JSON.' }
    ],
    sample: `{ "title": "Apocalypse", "thumbnail_url": "…", "html": "<iframe …>" }`,
    live: false
  }
];

/* Local dataset export — the site's own data, as an API would serve it. */
function buildDataset() {
  return {
    generated: new Date().toISOString(),
    source: 'CAS Fan Sanctuary — fan-made, unofficial',
    artist: {
      name: 'Cigarettes After Sex',
      formed: 2008,
      origin: 'El Paso, Texas, United States',
      based: 'Brooklyn, New York',
      genres: ['ambient pop', 'dream pop', 'slowcore', 'indie pop'],
      label: 'Partisan Records'
    },
    members: MEMBERS.map(m => ({
      name: m.name, role: m.role, status: m.status,
      years: m.years, instruments: m.instruments
    })),
    releases: ALBUMS.map(a => ({
      id: a.id, title: a.title, year: a.year, type: a.type,
      spotifyAlbumId: a.spotifyAlbum,
      trackCount: a.tracks.length,
      tracks: a.tracks.map((t, i) => ({
        no: i + 1, name: t.name, duration: t.duration,
        spotifyTrackId: t.id || null
      }))
    })),
    singles: SINGLES,
    lyricExcerpts: LYRICS.map(l => ({
      track: l.track, album: l.album, duration: l.duration,
      lines: l.lines.length,
      lrc: l.lines.map(x => `[${fmtLrc(x.t)}] ${x.text}`)
    }))
  };
}

function fmtLrc(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}
