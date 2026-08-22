/* ============================================================
   CAS Fan Sanctuary — data layer
   Members, discography, singles, timecoded lyric excerpts
   and the platform links each track opens on.
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
    cover: { art: 'assets/cut/vinyl.webp', tone: 'mono' },
    note: 'The first self-released EP, made while the project was still entirely in El Paso.',
    tracks: [
      { name: 'I Can See You', duration: '—' },
      { name: 'Never Let Me Go', duration: '—' },
      { name: 'Your Hair Should Be Black and Long', duration: '—' },
      { name: "Where's My Heart", duration: '—' }
    ]
  },
  {
    id: 'romans',
    title: 'Romans 13:9',
    year: 2011,
    type: 'Demo album',
    spotifyAlbum: null,
    cover: { art: 'assets/photo/cover_romans.webp', tone: 'sleeve' },
    note: 'A long, largely unreleased demo album from the El Paso years — the writing that led into the stairwell sessions. Circulated among fans rather than pressed.',
    tracks: [
      { name: 'Our Last Day', duration: '—' },
      { name: 'The Night Train', duration: '—' },
      { name: 'You', duration: '—' },
      { name: "Please Don't Cry", duration: '—' },
      { name: 'Woman with a Crow (The Last Train)', duration: '—' },
      { name: 'Sing', duration: '—' },
      { name: 'Lay Here', duration: '—' },
      { name: 'Every Light Is Out', duration: '—' },
      { name: "I Can't Stop These Tears from Falling", duration: '—' },
      { name: 'Run Towards Your Fears', duration: '—' },
      { name: 'Do You Know Where I Should Go?', duration: '—' }
    ]
  },
  {
    id: 'i',
    title: 'I.',
    year: 2012,
    type: 'EP',
    spotifyAlbum: '5fzwP4FRJjFQBBmhKJwpWn',
    cover: { art: 'assets/photo/cover_i.webp', tone: 'sleeve' },
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
    cover: { art: 'assets/photo/cover_wordmark.webp', tone: 'sleeve' },
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
    cover: { art: 'assets/photo/cover_cry.webp', tone: 'sleeve' },
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
   fan transcriptions used by the follow-along marker in the
   track window.
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
   Where to hear each track. Search links rather than hard-coded
   ids: they resolve for every release without going stale.
   ------------------------------------------------------------ */
const PLATFORMS = [
  { id: 'spotify', name: 'Spotify',
    url: (t) => `https://open.spotify.com/search/${encodeURIComponent(t + ' Cigarettes After Sex')}` },
  { id: 'apple', name: 'Apple Music',
    url: (t) => `https://music.apple.com/search?term=${encodeURIComponent(t + ' Cigarettes After Sex')}` },
  { id: 'itunes', name: 'iTunes',
    url: (t) => `https://itunes.apple.com/search?term=${encodeURIComponent(t + ' Cigarettes After Sex')}` },
  { id: 'ytmusic', name: 'YouTube Music',
    url: (t) => `https://music.youtube.com/search?q=${encodeURIComponent(t + ' Cigarettes After Sex')}` },
  { id: 'bandcamp', name: 'Bandcamp',
    url: () => 'https://cigarettesaftersex.bandcamp.com' },
  { id: 'deezer', name: 'Deezer',
    url: (t) => `https://www.deezer.com/search/${encodeURIComponent(t + ' Cigarettes After Sex')}` }
];

function videoUrl(track) {
  return 'https://www.youtube.com/results?search_query='
    + encodeURIComponent(`Cigarettes After Sex ${track} official video`);
}

function spotifyTrackUrl(track, id) {
  return id
    ? `https://open.spotify.com/track/${id}`
    : `https://open.spotify.com/search/${encodeURIComponent(track + ' Cigarettes After Sex')}`;
}

/* Apple's search API supports JSONP, which keeps the static archive working
   without a server-side proxy or a secret key. */
const _trackMetaCache = new Map();
function iTunesJSONP(url) {
  return new Promise((resolve, reject) => {
    const callback = `cas_itunes_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const timer = setTimeout(() => cleanup(new Error('iTunes timeout')), 12000);
    function cleanup(error) {
      clearTimeout(timer);
      delete window[callback];
      script.remove();
      if (error) reject(error);
    }
    window[callback] = data => { cleanup(); resolve(data); };
    script.onerror = () => cleanup(new Error('iTunes failed'));
    script.src = `${url}${url.includes('?') ? '&' : '?'}callback=${callback}`;
    document.head.appendChild(script);
  });
}

async function trackMetaFor(trackName) {
  const key = String(trackName).toLowerCase();
  if (_trackMetaCache.has(key)) return _trackMetaCache.get(key);
  try {
    const data = await iTunesJSONP(`https://itunes.apple.com/search?term=${encodeURIComponent(`Cigarettes After Sex ${trackName}`)}&entity=song&limit=12`);
    const rows = (data.results || []).filter(row => /cigarettes after sex/i.test(row.artistName || ''));
    const exact = rows.find(row => String(row.trackName || '').toLowerCase() === key) || rows[0] || null;
    const meta = exact ? {
      previewUrl: exact.previewUrl || null,
      artworkUrl: (exact.artworkUrl100 || '').replace('100x100', '600x600'),
      trackViewUrl: exact.trackViewUrl || null,
      collectionName: exact.collectionName || ''
    } : null;
    _trackMetaCache.set(key, meta);
    return meta;
  } catch {
    _trackMetaCache.set(key, null);
    return null;
  }
}

const _lyricsCache = new Map();

function lyricsFor(trackName) {
  const key = String(trackName).toLowerCase();
  if (_lyricsCache.has(key)) return _lyricsCache.get(key);
  const local = LYRICS.find(l => l.track.toLowerCase() === key) || null;
  if (local) {
    _lyricsCache.set(key, local);
    return local;
  }
  return null;
}

/** Silent background load. Never surfaces source or network details in UI. */
async function ensureLyrics(trackName) {
  const key = String(trackName).toLowerCase();
  if (_lyricsCache.has(key)) return _lyricsCache.get(key);

  const local = LYRICS.find(l => l.track.toLowerCase() === key) || null;
  if (local && local.lines && local.lines.length > 3) {
    _lyricsCache.set(key, local);
    return local;
  }

  try {
    const q = encodeURIComponent(`${trackName} Cigarettes After Sex`);
    const res = await fetch(`https://lrclib.net/api/search?q=${q}`, {
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) throw new Error('no');
    const rows = await res.json();
    const hit = (rows || []).find(r =>
      /cigarettes after sex/i.test(r.artistName || '') &&
      (r.trackName || '').toLowerCase() === key
    ) || (rows || []).find(r => /cigarettes after sex/i.test(r.artistName || '')) || (rows || [])[0];

    if (!hit) {
      if (local) { _lyricsCache.set(key, local); return local; }
      _lyricsCache.set(key, null);
      return null;
    }

    let lines = [];
    let duration = hit.duration || 240;
    if (hit.syncedLyrics) {
      lines = parseLrc(hit.syncedLyrics);
    } else if (hit.plainLyrics) {
      const plain = hit.plainLyrics.split(/\n/).map(s => s.trim()).filter(Boolean);
      const step = duration / Math.max(1, plain.length);
      lines = plain.map((text, i) => ({ t: Math.round(i * step * 10) / 10, text }));
    }

    if (!lines.length && local) {
      _lyricsCache.set(key, local);
      return local;
    }

    const set = {
      track: hit.trackName || trackName,
      album: hit.albumName || '',
      duration,
      lines: lines.slice(0, 48)
    };
    _lyricsCache.set(key, set);
    return set;
  } catch {
    if (local) { _lyricsCache.set(key, local); return local; }
    _lyricsCache.set(key, null);
    return null;
  }
}

function parseLrc(raw) {
  const out = [];
  const re = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.+)/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const t = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) / 1000 : 0);
    const text = m[4].trim();
    if (text) out.push({ t, text });
  }
  return out;
}

function albumOf(trackName) {
  return ALBUMS.find(a => a.tracks.some(t => t.name.toLowerCase() === String(trackName).toLowerCase())) || null;
}

function fmtLrc(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}
