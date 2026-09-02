/* ---------------------------------------------------------------------------
   THE NBHD. — archive data
   Bundled records are the offline baseline. Anything marked `partial` is
   completed at runtime from the public iTunes catalogue (see js/api.js).
--------------------------------------------------------------------------- */

const NBHD_CONFIG = {
  artist: 'The Neighbourhood',
  itunesSearch: 'https://itunes.apple.com/search',
  itunesLookup: 'https://itunes.apple.com/lookup',
  lyricsGet: 'https://lrclib.net/api/get',
  lyricsSearch: 'https://lrclib.net/api/search',
  wikiSummary: 'https://en.wikipedia.org/api/rest_v1/page/summary/The_Neighbourhood',
  spotifyArtist: 'https://open.spotify.com/artist/77SW9BnxLY8rJ0RciFqkHh',
  musicbrainz: 'https://musicbrainz.org/artist/adf13cf6-5384-482a-9ab1-a798b67104b2'
};

/* Tempos used only by the fallback visualiser when the Web Audio analyser
   cannot read a cross-origin preview. Values are approximate feel, not data. */
const TRACK_TEMPO = {
  'sweater weather': 124,
  'afraid': 122,
  'female robbery': 100,
  'daddy issues': 100,
  'r.i.p. 2 my youth': 128,
  'the beach': 92,
  'cry baby': 96,
  'softcore': 90,
  'reflections': 84,
  'scary love': 116,
  'stargazing': 108,
  'cherry flavoured': 96
};

const ALBUMS = [
  {
    id: 'im-sorry', title: "I'm Sorry…", year: 2012, kind: 'EP',
    image: 'assets/single-mark.webp', accent: 'FIRST SIGNAL / 01',
    partial: true,
    note: 'The first EP. Two songs from it — “Female Robbery” and “Sweater Weather” — already carried the whole band: suburban dread sung softly, in black and white.',
    tracks: [['Female Robbery', '3:29'], ['Sweater Weather', '4:00']]
  },
  {
    id: 'thank-you', title: 'Thank You,', year: 2012, kind: 'EP',
    image: 'assets/single-mark.webp', accent: 'SECOND SIGNAL / 02',
    partial: true,
    note: 'The follow-up EP from the same year, released as the band moved from local shows to a major-label deal.',
    tracks: [['Let It Go', '3:17'], ['Alleyways', '4:27']]
  },
  {
    id: 'i-love-you', title: 'I Love You.', year: 2013, kind: 'LP',
    image: 'assets/album-i-love-you.webp', accent: 'CLOUDS / 03',
    note: 'The monochrome debut: anxious guitars, low light and the song that broke the band worldwide.',
    tracks: [
      ['How', '4:09'], ['Afraid', '4:11'], ['Everybody’s Watching Me (Uh Oh)', '3:20'],
      ['Sweater Weather', '4:00'], ['Let It Go', '3:17'], ['Alleyways', '4:27'],
      ['W.D.Y.W.F.M.?', '4:19'], ['Flawless', '4:04'], ['Female Robbery', '3:29'],
      ['Staying Up', '4:26'], ['Float', '4:21']
    ]
  },
  {
    id: 'black-and-white', title: '#000000 & #FFFFFF', year: 2014, kind: 'MIXTAPE',
    image: 'assets/single-mark.webp', accent: 'HEX / 04',
    partial: true,
    note: 'A mixtape detour into hip-hop production and guest verses — the band testing how far the black-and-white rule could stretch.',
    tracks: [['Honest', '3:22'], ['Jealou$y', '3:41']]
  },
  {
    id: 'wiped-out', title: 'Wiped Out!', year: 2015, kind: 'LP',
    image: 'assets/album-wiped-out.webp', accent: 'WEST COAST / 05',
    note: 'A coastal fever dream built from washed-out surf imagery, bass-heavy pop and late-night confessionals.',
    tracks: [
      ['A Moment of Silence', '0:30'], ['Prey', '4:42'], ['Cry Baby', '3:56'],
      ['Wiped Out!', '6:13'], ['The Beach', '4:15'], ['Daddy Issues', '4:20'],
      ['Baby Came Home 2 / Valentines', '6:30'], ['Greetings from Califournia', '4:04'],
      ['Ferrari', '3:04'], ['Single', '4:22'], ['R.I.P. 2 My Youth', '3:27']
    ]
  },
  {
    id: 'the-neighbourhood', title: 'The Neighbourhood', year: 2018, kind: 'LP',
    image: 'assets/album-hard-to-imagine.webp', accent: 'SELF-TITLED / 06',
    note: 'The self-titled era expanded the palette: darker electronics, cleaner pop shapes and a more fragmented mood.',
    tracks: [
      ['Flowers', '3:17'], ['Scary Love', '3:44'], ['Nervous', '4:05'], ['Void', '3:25'],
      ['Softcore', '3:26'], ['Blue', '3:13'], ['Sadderdaze', '4:09'], ['Revenge', '3:18'],
      ['You Get Me So High', '2:33'], ['Reflections', '4:04'], ['Too Serious', '3:13'], ['Stuck with Me', '4:18']
    ]
  },
  {
    id: 'hard-to-imagine', title: 'Hard to Imagine the Neighbourhood Ever Changing', year: 2018, kind: 'COMPILATION',
    image: 'assets/single-mark.webp', accent: 'COLLECTED / 07',
    partial: true,
    note: 'The compilation that gathered the self-titled record together with the three 2018 EPs — To Imagine, Hard and Ever Changing — into a single sequence.',
    tracks: [['Scary Love', '3:44'], ['Softcore', '3:26'], ['Reflections', '4:04']]
  },
  {
    id: 'chip-chrome', title: 'Chip Chrome & The Mono-Tones', year: 2020, kind: 'LP',
    image: 'assets/album-wiped-out.webp', accent: 'SILVER / 08',
    note: 'Jesse Rutherford performs the record as Chip Chrome, a silver-painted alter ego fronting the band as his backing group, The Mono-Tones.',
    tracks: [
      ['Chip Chrome', '1:12'], ['Pretty Boy', '3:24'], ['Lost in Translation', '3:29'],
      ['Devil’s Advocate', '3:20'], ['Cherry Flavoured', '3:19'], ['BooHoo', '3:23'],
      ['Hell or High Water', '3:35'], ['Silver Lining', '3:16'], ['Tobacco Sunburst', '3:11'],
      ['Middle of Somewhere', '3:11'], ['Stargazing', '3:24']
    ]
  },
  {
    id: 'sweater-weather', title: 'Sweater Weather', year: 2013, kind: 'SINGLE',
    image: 'assets/single-mark.webp', accent: 'SIGNAL / 09',
    note: 'The single that became a permanent cultural signal — warm intimacy framed by cold California air, and years later a second life through streaming.',
    tracks: [['Sweater Weather', '4:00'], ['Sweater Weather (Acoustic)', '4:12']]
  }
].map(album => ({
  ...album,
  tracks: album.tracks.map(([name, duration], index) => ({ name, duration, number: index + 1 })),
  source: 'archive'
}));

const MEMBERS = [
  {
    name: 'Jesse Rutherford', role: 'lead vocals / lyrics', years: '2011 — present',
    image: 'assets/member-jesse.webp', status: 'current', mark: 'JR',
    listen: [
      ['Sweater Weather', 'I Love You.', 'The whole delivery in one song: warm words sung cold, never once pushed.'],
      ['R.I.P. 2 My Youth', 'Wiped Out!', 'The rare moment he lets the volume off the leash.'],
      ['Chip Chrome', 'Chip Chrome & The Mono-Tones', 'Sixty seconds of him introducing a character instead of himself.']
    ],
    signature: 'A close-mic, half-spoken delivery that keeps the volume down and the nerve exposed.',
    on: ['i-love-you', 'black-and-white', 'wiped-out', 'the-neighbourhood', 'chip-chrome'],
    bio: 'The voice and central visual presence of The Neighbourhood. Rutherford writes from somewhere between detachment and confession, and sings almost every line as if he is trying not to wake anybody.',
    lore: 'For the 2020 record he disappeared into Chip Chrome — silver face paint, a thrift-store suit, and a stage persona built to say the things he had stopped saying as himself. He has also released music outside the band, including the 2017 solo album “&”.',
    facts: [['ROLE', 'Vocals, lyrics'], ['SINCE', '2011'], ['ALTER EGO', 'Chip Chrome'], ['SOLO', '“&” (2017)']]
  },
  {
    name: 'Zach Abels', role: 'lead guitar', years: '2011 — present',
    image: 'assets/member-zach.webp', status: 'current', mark: 'ZA',
    listen: [
      ['Sweater Weather', 'I Love You.', 'The muted opening figure — four bars that became a signature.'],
      ['Daddy Issues', 'Wiped Out!', 'Long, clean intervals left hanging over the bass.'],
      ['Scary Love', 'The Neighbourhood', 'Guitar used as a pad rather than a lead.']
    ],
    signature: 'Clipped, chiming motifs with more air than noise — the band’s West Coast contour.',
    on: ['i-love-you', 'black-and-white', 'wiped-out', 'the-neighbourhood', 'chip-chrome'],
    bio: 'A founding member whose guitar work gives the songs their haze. He plays around the vocal rather than over it, leaving the space that makes the records feel as cold as they do.',
    lore: 'The muted, chiming figure that opens “Sweater Weather” is the clearest signature of his playing — a hook built almost entirely out of restraint, and one of the most recognisable four bars in modern alternative music.',
    facts: [['ROLE', 'Lead guitar'], ['SINCE', '2011'], ['FOUNDING', 'Yes'], ['KNOWN FOR', 'The Sweater Weather figure']]
  },
  {
    name: 'Jeremy Freedman', role: 'guitar', years: '2011 — present',
    image: 'assets/member-freedman.webp', status: 'current', mark: 'JF',
    listen: [
      ['Afraid', 'I Love You.', 'The second guitar holding the harmonic floor under the hook.'],
      ['The Beach', 'Wiped Out!', 'Texture doing the work of an arrangement.'],
      ['Void', 'The Neighbourhood', 'Where the two guitar parts finally trade places.']
    ],
    signature: 'Texture and counter-line: the low harmonic weather the songs move through.',
    on: ['i-love-you', 'black-and-white', 'wiped-out', 'the-neighbourhood', 'chip-chrome'],
    bio: 'Founding guitarist. His parts sit underneath rather than on top, holding the harmonic floor while the lead guitar and the vocal take the light.',
    lore: 'Rarely the loudest element in a mix, and rarely absent from one. Strip his parts out of a Neighbourhood song and the room it happens in disappears.',
    facts: [['ROLE', 'Guitar'], ['SINCE', '2011'], ['FOUNDING', 'Yes'], ['PLACE', 'Underneath the mix']]
  },
  {
    name: 'Mikey Margott', role: 'bass', years: '2011 — present',
    image: 'assets/member-margott.webp', status: 'current', mark: 'MM',
    listen: [
      ['Daddy Issues', 'Wiped Out!', 'Bass carrying the melody while everything else recedes.'],
      ['Prey', 'Wiped Out!', 'The clearest case of the band grooving instead of strumming.'],
      ['Softcore', 'The Neighbourhood', 'A line that walks rather than anchors.']
    ],
    signature: 'Patient, round and further forward than a rock record would usually allow.',
    on: ['i-love-you', 'black-and-white', 'wiped-out', 'the-neighbourhood', 'chip-chrome'],
    bio: 'Founding bassist. The band’s R&B and hip-hop leanings live mostly in the bass, which is why a guitar band from Ventura County has always grooved more than it should.',
    lore: 'Wiped Out! is the clearest case: a guitar band handing the melody to the low end and letting the guitars become weather.',
    facts: [['ROLE', 'Bass'], ['SINCE', '2011'], ['FOUNDING', 'Yes'], ['CARRIES', 'The groove']]
  },
  {
    name: 'Brandon Fried', role: 'drums / former member', years: '2014 — 2022',
    image: 'assets/member-brandon.webp', status: 'former', mark: 'BF',
    listen: [
      ['Cry Baby', 'Wiped Out!', 'Pocket playing that refuses to hurry the song.'],
      ['You Get Me So High', 'The Neighbourhood', 'Restraint on a track that invites a fill every bar.']
    ],
    signature: 'Tight, unhurried pocket playing built for songs that never rush.',
    on: ['wiped-out', 'the-neighbourhood', 'chip-chrome'],
    bio: 'The band’s drummer through three major eras: Wiped Out!, the self-titled record and Chip Chrome & The Mono-Tones.',
    lore: 'In 2022 the band announced he was no longer a member, following a publicly made allegation of misconduct against him.',
    facts: [['ROLE', 'Drums'], ['YEARS', '2014 — 2022'], ['RECORDS', 'Three'], ['STATUS', 'Former member']]
  },
  {
    name: 'Bryan Sammis', role: 'drums / founding member', years: '2011 — 2014',
    image: 'assets/member-sammis.webp', status: 'former', mark: 'BS',
    listen: [
      ['Female Robbery', 'I Love You.', 'The looser, rawer feel of the pre-2014 band.'],
      ['How', 'I Love You.', 'The opening track of the record he played on.']
    ],
    signature: 'The looser, rawer feel of the early EPs and the debut album.',
    on: ['im-sorry', 'thank-you', 'i-love-you'],
    bio: 'The original drummer. He was there for both 2012 EPs, for “Sweater Weather”, and for I Love You. — the record that turned a Newbury Park band into an international one.',
    lore: 'He played on the album that made the band and left in 2014, before the follow-up was written. He has continued to release music since, including work under the name Olivver the Kid.',
    facts: [['ROLE', 'Drums'], ['YEARS', '2011 — 2014'], ['FOUNDING', 'Yes'], ['PLAYED ON', 'I Love You.']]
  }
];

/* Founding history, eras and symbols — section 03. */
const LORE = {
  origin: [
    {
      head: 'A SUBURB, NOT A CITY',
      body: 'The Neighbourhood formed in 2011 in Newbury Park, California — a quiet stretch of Ventura County suburbia an hour up the coast from Los Angeles. That distance is the whole band: close enough to see the city, far enough to be bored by it. The founding lineup was Jesse Rutherford, Zach Abels, Jeremy Freedman, Mikey Margott and Bryan Sammis.'
    },
    {
      head: 'THE EXTRA U',
      body: 'The name is spelled the British way. The band adopted the “u” to separate themselves from other acts already using “The Neighborhood” — a small typographic decision that ended up defining the logo, the merchandise, and the way fans write the name to this day.'
    },
    {
      head: 'THE BLACK AND WHITE RULE',
      body: 'From the beginning the band imposed a single design law on itself: everything the public sees is monochrome. Artwork, videos, photography, stage lighting, merchandise. It started as a way to make a new band look like it already had a catalogue, and it became the most recognisable thing about them.'
    },
    {
      head: 'THE HOUSE MARK',
      body: 'The logo is a house drawn as a flat outline: two windows above an inverted triangle. It reads as a roofline, as an arrow pointing down, and as a place you can call home — the same three ideas the songs keep circling.'
    }
  ],

  eras: [
    {
      id: 'i-love-you', tag: 'ERA 01', years: '2012 — 2014', title: 'I LOVE YOU.',
      mood: 'Overcast, anxious, close',
      body: 'Two EPs, a major-label deal and a debut album in under eighteen months. Guitars are thin and high, the drums are dry, and everything sits under a sky that never clears. “Sweater Weather” goes to No. 1 on Billboard’s Alternative Songs chart and stops being a song about a beach.',
      marks: ['Clouds', 'Thin guitars', 'Newbury Park']
    },
    {
      id: 'wiped-out', tag: 'ERA 02', years: '2014 — 2016', title: 'WIPED OUT!',
      mood: 'Coastal, bass-heavy, nocturnal',
      body: 'A mixtape detour into hip-hop production, a change of drummer, and then the second album. The low end moves to the front, the guitars become weather, and the imagery goes to palms, static and cold water. “Daddy Issues”, “The Beach” and “R.I.P. 2 My Youth” define the band’s second act.',
      marks: ['Palms', 'Low end', '3 a.m.']
    },
    {
      id: 'the-neighbourhood', tag: 'ERA 03', years: '2017 — 2019', title: 'SELF-TITLED',
      mood: 'Fragmented, electronic, colder',
      body: 'Three EPs bracket a self-titled album, later gathered into one long compilation. The palette widens into darker electronics and cleaner pop shapes, and the songs get shorter and more clipped. It is the most restless the band has ever sounded.',
      marks: ['Electronics', 'EP triptych', 'Shorter songs']
    },
    {
      id: 'chip-chrome', tag: 'ERA 04', years: '2020 — 2022', title: 'CHIP CHROME',
      mood: 'Silver, theatrical, exhausted',
      body: 'Rutherford fronts the record in silver paint as Chip Chrome, with the band recast as his backing Mono-Tones. It is the band’s most costumed work and its most tired-sounding, which is the point: a persona built to keep talking once the person behind it had run out.',
      marks: ['Silver paint', 'Harmonica', 'Alter ego']
    }
  ],

  timeline: [
    { year: '2010', title: 'BEFORE THE NAME', body: 'The members are playing around the Thousand Oaks and Newbury Park scene in different configurations, an hour outside Los Angeles and well outside its industry.' },
    { year: '2011', title: 'FORMED IN NEWBURY PARK', body: 'Rutherford, Abels, Freedman, Margott and Sammis start the band in the Thousand Oaks area of Ventura County, California.' },
    { year: '2012', title: 'TWO EPs AND A SIGNAL', body: 'The EPs “I’m Sorry…” and “Thank You,” arrive in the same year. “Sweater Weather” is released as a single and the band signs to Columbia Records.' },
    { year: '2013', title: 'I LOVE YOU.', body: 'The debut album is released on 22 April. “Sweater Weather” reaches No. 1 on Billboard’s Alternative Songs chart and turns a regional band into an international one.' },
    { year: '2014', title: '#000000 & #FFFFFF', body: 'A mixtape leaning into hip-hop production and guest features. In the same year Bryan Sammis leaves and Brandon Fried takes over on drums.' },
    { year: '2015', title: 'WIPED OUT!', body: 'Released 30 October. Palms, static and cold water — the record that proved the band was not a single-song act.' },
    { year: '2018', title: 'THE SELF-TITLED YEAR', body: 'Three EPs — To Imagine, Hard and Ever Changing — bracket the self-titled album in March, and are gathered in September as “Hard to Imagine the Neighbourhood Ever Changing”.' },
    { year: '2020', title: 'CHIP CHROME & THE MONO-TONES', body: 'Released 25 September. Rutherford fronts the record in silver paint as Chip Chrome, with the band recast as his backing Mono-Tones.' },
    { year: '2019', title: 'THE TOURING YEARS', body: 'The band spends the back half of the decade as a live act with four studio records behind it, playing to audiences that arrived at very different points in the catalogue.' },
    { year: '2020s', title: 'THE SECOND LIFE OF A SINGLE', body: '“Sweater Weather” finds an enormous new audience through short-form video and streaming, years after release, and becomes one of the most-streamed alternative songs of its era.' },
    { year: '2022', title: 'A LINEUP CHANGE AND A PAUSE', body: 'The band announces that Brandon Fried is no longer a member, following a publicly made allegation of misconduct against him. Activity slows sharply, with Rutherford turning to solo work.' }
  ],

  symbols: [
    { glyph: 'house', name: 'THE HOUSE', body: 'Two windows over an inverted triangle. A roofline, an arrow down, and a place to live — stamped on every record sleeve since the beginning.' },
    { glyph: 'palm', name: 'THE PALM CIRCLE', body: 'A palm and a wave inside a sun. The Wiped Out! mark, and the band’s shorthand for California as something you survive rather than enjoy.' },
    { glyph: 'mono', name: '#000000 & #FFFFFF', body: 'The two hex codes the band named a mixtape after, and the only two colours their visual language has ever officially allowed.' },
    { glyph: 'moon', name: 'THE NIGHT SHIFT', body: 'Moons, empty pools and 3 a.m. Almost every song is set after midnight, which is why the archive is lit the way it is.' }
  ],

  craft: [
    {
      head: 'HOW A NEIGHBOURHOOD SONG IS BUILT',
      body: 'The parts are stacked so that nothing competes for the middle. Rutherford sings close and quiet, the bass takes the melodic weight, one guitar plays a short repeating figure and the other holds the harmony underneath it. Take any of the four away and the song stops sounding like this band.'
    },
    {
      head: 'WHY IT SOUNDS COLD',
      body: 'Dry drums, very little reverb on the voice, and guitars that leave gaps rather than fill them. The songs are recorded like a room at night with the lights off, which is why warm lyrics keep landing as something closer to dread.'
    },
    {
      head: 'THE LYRIC HABIT',
      body: 'Almost every song is addressed to one person and set after midnight. The recurring furniture is weather, water, cars, and houses that belong to somebody else. Titles rarely appear more than once inside a song.'
    },
    {
      head: 'ARCHIVE NOTE',
      body: 'The craft notes above are this archive’s reading of the records, not statements from the band. The timeline, codex and biographies are kept to documented fact.'
    }
  ],

  codex: [
    { k: 'FORMED', v: '2011' },
    { k: 'ORIGIN', v: 'Newbury Park, CA' },
    { k: 'COUNTY', v: 'Ventura' },
    { k: 'LABEL', v: 'Columbia Records' },
    { k: 'PALETTE', v: '#000000 & #FFFFFF' },
    { k: 'MARK', v: 'House / triangle' },
    { k: 'STUDIO LPs', v: 'Four' },
    { k: 'EPs', v: 'Five' },
    { k: 'BREAKOUT', v: 'Sweater Weather' },
    { k: 'PEAK', v: 'No. 1 Alternative' },
    { k: 'ALTER EGO', v: 'Chip Chrome' },
    { k: 'LINEUP', v: 'Four current' }
  ],

  myths: [
    { q: '“The band is British.”', a: 'No. The spelling is British; the band is from Ventura County, California. The “u” was chosen to avoid a name collision with other acts called The Neighborhood.' },
    { q: '“Sweater Weather was a slow burn that never charted.”', a: 'It charted immediately — No. 1 on Billboard’s Alternative Songs chart in 2013 — and then charted again, culturally, a decade later through short-form video and streaming.' },
    { q: '“The black-and-white thing is just an album cover.”', a: 'It is a standing rule across artwork, video, photography and merchandise, held for more than a decade and across four studio albums.' },
    { q: '“Chip Chrome is a side project.”', a: 'Chip Chrome is a persona Rutherford performs on a Neighbourhood album, not a separate act. The band appears on the record as his backing group, The Mono-Tones.' },
    { q: '“They only ever had one drummer.”', a: 'Two. Bryan Sammis played the EPs and I Love You. until 2014; Brandon Fried played from 2014 until 2022.' },
    { q: '“Sweater Weather is about summer.”', a: 'It is about being cold and wanting someone else’s warmth, which is the opposite arrangement. The beach in the video is a winter beach.' },
    { q: '“The band split up.”', a: 'No formal split has been announced. Activity slowed sharply after 2022 while Rutherford worked on solo material.' }
  ]
};

const LOCAL_LYRIC_EXCERPTS = {
  'sweater weather': [{ t: 47, text: 'Cause it’s too cold for you here' }],
  'daddy issues': [{ t: 56, text: 'Go ahead and cry, little girl' }],
  'afraid': [{ t: 52, text: 'When I wake up, I’m afraid' }],
  'softcore': [{ t: 46, text: 'You’ve been my muse for a long time' }],
  'the beach': [{ t: 60, text: 'If I told you that I loved you' }],
  'reflections': [{ t: 68, text: 'We were too close to the stars' }]
};

const QUIZZES = [
  {
    title: 'THE BASICS', eyebrow: '15 QUESTIONS / EASY', questions: [
      ['В каком году образовалась группа?', ['2008','2011','2014','2017'], '2011'],
      ['Где появилась The Neighbourhood?', ['Newbury Park, California','Brooklyn, New York','London, England','Seattle, Washington'], 'Newbury Park, California'],
      ['Кто является вокалистом группы?', ['Zach Abels','Mikey Margott','Jesse Rutherford','Jeremy Freedman'], 'Jesse Rutherford'],
      ['Как называется дебютный студийный альбом?', ['Wiped Out!','I Love You.','The Neighbourhood','Black & White'], 'I Love You.'],
      ['Какой трек стал главным международным прорывом?', ['Daddy Issues','The Beach','Sweater Weather','Softcore'], 'Sweater Weather'],
      ['Как группа часто сокращает своё название?', ['TNH','NBHD','NBR','THN'], 'NBHD'],
      ['Какой визуальный язык сильнее всего связан с группой?', ['Неоновые цвета','Пастель','Чёрно-белая эстетика','Пиксель-арт'], 'Чёрно-белая эстетика'],
      ['Какой образ связан с Wiped Out!?', ['Пустыня','Пальмы и волны','Заснеженный лес','Ночной мегаполис'], 'Пальмы и волны'],
      ['В каком году вышел Wiped Out!?', ['2012','2013','2015','2018'], '2015'],
      ['Какой трек входит в I Love You.?', ['Afraid','Softcore','Scary Love','Lost in Translation'], 'Afraid'],
      ['Какой инструмент играет Zach Abels?', ['Бас','Гитара','Ударные','Клавишные'], 'Гитара'],
      ['Какое написание использует группа?', ['Neighborhood','The Neighbourhood','The Neighbor Hood','Neighbour'], 'The Neighbourhood'],
      ['Какой вариант — название альбома?', ['Wiped Out!','Faded City','Silver Coast','Noir Youth'], 'Wiped Out!'],
      ['Какой трек находится на Wiped Out!?', ['The Beach','Afraid','Female Robbery','Stuck with Me'], 'The Beach'],
      ['С какой частью США связывают атмосферу группы?', ['West Coast','Deep South','New England','Midwest'], 'West Coast']
    ]
  },
  {
    title: 'DISCOGRAPHY', eyebrow: '15 QUESTIONS / MEDIUM', questions: [
      ['В каком году вышел I Love You.?', ['2011','2013','2015','2016'], '2013'],
      ['Какой релиз вышел раньше?', ['Wiped Out!','I Love You.','The Neighbourhood','Chip Chrome & The Mono-Tones'], 'I Love You.'],
      ['На каком альбоме находится Daddy Issues?', ['I Love You.','Wiped Out!','The Neighbourhood','#000000 & #FFFFFF'], 'Wiped Out!'],
      ['На каком альбоме находится Softcore?', ['The Neighbourhood','I Love You.','Wiped Out!','Chip Chrome & The Mono-Tones'], 'The Neighbourhood'],
      ['Когда вышел одноимённый альбом?', ['2015','2016','2018','2020'], '2018'],
      ['Как называется альбом 2020 года?', ['Black & White','Chip Chrome & The Mono-Tones','Hard to Imagine','Silver Lining'], 'Chip Chrome & The Mono-Tones'],
      ['Какой трек относится к эре Chip Chrome?', ['Cherry Flavoured','Afraid','R.I.P. 2 My Youth','Female Robbery'], 'Cherry Flavoured'],
      ['Какой трек закрывает Wiped Out!?', ['Cry Baby','The Beach','R.I.P. 2 My Youth','Daddy Issues'], 'R.I.P. 2 My Youth'],
      ['Какой трек открывает I Love You.?', ['How','Afraid','Let It Go','Float'], 'How'],
      ['К какому релизу относится Scary Love?', ['The Neighbourhood','Wiped Out!','I Love You.',"I'm Sorry..."], 'The Neighbourhood'],
      ['Какой проект назван HEX-кодами?', ['#000000 & #FFFFFF','#111111 & #EEEEEE','Mono','Black Tape'], '#000000 & #FFFFFF'],
      ['Какой трек относится к Wiped Out!?', ['Prey','Void','Stargazing',"Everybody's Watching Me"], 'Prey'],
      ['Какой трек относится к I Love You.?', ['Flawless','Sadderdaze','Compass',"Devil's Advocate"], 'Flawless'],
      ['На каком альбоме You Get Me So High?', ['The Neighbourhood','I Love You.','Wiped Out!','Black & White'], 'The Neighbourhood'],
      ['Какой релиз является микстейпом?', ['#000000 & #FFFFFF','I Love You.','Wiped Out!','The Neighbourhood'], '#000000 & #FFFFFF']
    ]
  },
  {
    title: 'DEEP CUTS', eyebrow: '15 QUESTIONS / HARD', questions: [
      ['Как назывался первый EP группы?', ["I'm Sorry...",'The Love Collection','Thank You,','Black & White'], "I'm Sorry..."],
      ["Какой EP последовал за I'm Sorry...?", ['Thank You,','Wiped Out!','Ever Changing','Hard'], 'Thank You,'],
      ["Какой трек есть на EP I'm Sorry...?", ['Female Robbery','Cry Baby','Void','Stargazing'], 'Female Robbery'],
      ['Как называется финальный трек I Love You.?', ['Float','How','Staying Up','Alleyways'], 'Float'],
      ['Какой трек идёт первым на Wiped Out!?', ['A Moment of Silence','Prey','Cry Baby','Daddy Issues'], 'A Moment of Silence'],
      ['Какая песня следует за A Moment of Silence?', ['Prey','Cry Baby','The Beach','Daddy Issues'], 'Prey'],
      ['Какой трек из I Love You. содержит аббревиатуру?', ['W.D.Y.W.F.M.?','One More','24/7','No. 1'], 'W.D.Y.W.F.M.?'],
      ['Какой трек относится к альбому 2018 года?', ['Sadderdaze','Afraid','Single','Greetings from Califournia'], 'Sadderdaze'],
      ['Как называется песня с изменённым написанием вкуса?', ['Cherry Flavoured','Vanilla Sky','Silver Taste','Candy Noir'], 'Cherry Flavoured'],
      ['Кто является басистом группы?', ['Mikey Margott','Zach Abels','Jesse Rutherford','Brandon Fried'], 'Mikey Margott'],
      ['Кто является гитаристом-основателем?', ['Jeremy Freedman','Brandon Fried','Bryan Sammis','Mikey Margott'], 'Jeremy Freedman'],
      ['Как назывался сценический персонаж Jesse в 2020?', ['Chip Chrome','Mono Kid','Silver Jesse','Chrome Boy'], 'Chip Chrome'],
      ['Какой трек есть на Chip Chrome & The Mono-Tones?', ["Devil's Advocate",'Alleyways','The Beach','Wires'], "Devil's Advocate"],
      ['Какой символ часто встречается в визуалах Wiped Out!?', ['Пальма в круге','Красная молния','Белый кролик','Золотая корона'], 'Пальма в круге'],
      ['Какой трек НЕ относится к Wiped Out!?', ['Softcore','Daddy Issues','Cry Baby','Greetings from Califournia'], 'Softcore']
    ]
  },
  {
    title: 'THE LORE', eyebrow: '15 QUESTIONS / ARCHIVIST', questions: [
      ['Почему в названии британская буква «u»?', ['Чтобы не совпадать с другими группами «The Neighborhood»','Группа из Лондона','Так назвали на лейбле','Опечатка на первом релизе'], 'Чтобы не совпадать с другими группами «The Neighborhood»'],
      ['Кто был первым барабанщиком группы?', ['Bryan Sammis','Brandon Fried','Zach Abels','Mikey Margott'], 'Bryan Sammis'],
      ['В каком году сменился барабанщик?', ['2012','2014','2016','2019'], '2014'],
      ['На каком лейбле вышел I Love You.?', ['Columbia Records','Interscope','Fueled by Ramen','Sub Pop'], 'Columbia Records'],
      ['Что изображено на логотипе группы?', ['Дом с окнами и треугольником','Волна','Пальма','Звезда'], 'Дом с окнами и треугольником'],
      ['Какое правило группа держит с самого начала?', ['Только чёрно-белый визуал','Только акустика','Только винил','Без клипов'], 'Только чёрно-белый визуал'],
      ['Сколько человек было в первом составе?', ['Трое','Четверо','Пятеро','Шестеро'], 'Пятеро'],
      ['В каком округе Калифорнии находится Newbury Park?', ['Ventura County','Orange County','Marin County','Sonoma County'], 'Ventura County'],
      ['Какую вершину занял Sweater Weather в Alternative Songs?', ['Первую','Пятую','Десятую','Двадцатую'], 'Первую'],
      ['В каком году вышел дебютный альбом?', ['2012','2013','2014','2015'], '2013'],
      ['Кем предстал Jesse Rutherford в 2020 году?', ['Chip Chrome','Mono Kid','Silver Boy','The Neighbour'], 'Chip Chrome'],
      ['Как назывались «музыканты» Chip Chrome?', ['The Mono-Tones','The Silver Band','The Void','The Palms'], 'The Mono-Tones'],
      ['Что произошло с составом в 2022 году?', ['Brandon Fried перестал быть участником','Группа распалась официально','Вернулся Bryan Sammis','Сменился вокалист'], 'Brandon Fried перестал быть участником'],
      ['Что дало Sweater Weather вторую жизнь в 2020-х?', ['Короткие видео и стриминг','Ремикс с рэпером','Реклама автомобиля','Кавер на Евровидении'], 'Короткие видео и стриминг'],
      ['Сколько студийных альбомов у группы?', ['Два','Три','Четыре','Шесть'], 'Четыре']
    ]
  }
].map(deck => ({ ...deck, questions: deck.questions.map(([q, options, correct]) => ({ q, options, correct })) }));
