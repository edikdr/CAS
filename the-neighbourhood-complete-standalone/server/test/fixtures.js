/* A stand-in for api.genius.com, shaped like the real payloads. Lets the whole
   service be exercised without a token and without spending rate limit. */

export const SONG = {
  id: 90478,
  title: 'Sweater Weather',
  full_title: 'Sweater Weather by The Neighbourhood',
  url: 'https://genius.com/The-neighbourhood-sweater-weather-lyrics',
  annotation_count: 24,
  release_date_for_display: 'April 22, 2013',
  lyrics_state: 'complete',
  song_art_image_url: 'https://images.genius.com/song-art-1000.jpg',
  song_art_image_thumbnail_url: 'https://images.genius.com/song-art-300.jpg',
  header_image_url: 'https://images.genius.com/header-1600.jpg',
  header_image_thumbnail_url: 'https://images.genius.com/header-300.jpg',
  album: { id: 11, name: 'I Love You.', url: 'https://genius.com/albums/x', cover_art_url: 'https://images.genius.com/album-1000.jpg' },
  primary_artist: { id: 22436, name: 'The Neighbourhood', url: 'https://genius.com/artists/The-neighbourhood', image_url: 'https://images.genius.com/artist.jpg' },
  featured_artists: [],
  producer_artists: [{ id: 5, name: 'Justyn Pilbrow' }],
  writer_artists: [{ id: 1, name: 'Jesse Rutherford' }],
  stats: { pageviews: 8123456, hot: false, concurrents: 12, accepted_annotations: 24, unreviewed_annotations: 3, verified_annotations: 2, contributors: 310 },
  description: { dom: { tag: 'root', children: [
    { tag: 'p', children: ['The single that broke the band. ', { tag: 'a', attributes: { href: 'https://genius.com/x' }, children: ['Read more'] }] },
    { tag: 'script', children: ['alert(1)'] }
  ] } },
  song_relationships: [
    { relationship_type: 'covered_by', songs: [
      { id: 501, title: 'Sweater Weather (Cover)', full_title: 'Sweater Weather by Someone', primary_artist: { id: 9, name: 'Someone' }, url: 'https://genius.com/cover', song_art_image_thumbnail_url: 'https://images.genius.com/c.jpg', stats: { pageviews: 4000 } }
    ] },
    { relationship_type: 'remixed_by', songs: [
      { id: 502, title: 'Sweater Weather (Remix)', primary_artist: { id: 10, name: 'A Remixer' }, url: 'https://genius.com/remix' }
    ] },
    { relationship_type: 'samples', songs: [] },
    { relationship_type: 'interpolated_by', songs: [
      { id: 503, title: 'Something Else', primary_artist: { id: 11, name: 'Another' }, url: 'https://genius.com/other' }
    ] }
  ]
};

/* a single with no art of its own: Genius echoes the album cover */
export const SONG_ALBUM_ART = {
  ...SONG,
  id: 90479,
  title: 'Afraid',
  song_art_image_url: 'https://images.genius.com/album-1000.jpg',
  header_image_url: 'https://images.genius.com/album-1000.jpg',
  album: { id: 11, name: 'I Love You.', url: 'https://genius.com/albums/x', cover_art_url: 'https://images.genius.com/album-1000.jpg' }
};

export const ARTIST = {
  id: 22436,
  name: 'The Neighbourhood',
  url: 'https://genius.com/artists/The-neighbourhood',
  image_url: 'https://images.genius.com/artist-1000.jpg',
  header_image_url: 'https://images.genius.com/artist-header.jpg',
  instagram_name: 'thenbhd',
  twitter_name: 'thenbhd',
  facebook_name: 'thenbhd',
  alternate_names: ['The NBHD'],
  is_verified: true,
  followers_count: 41000,
  description: { dom: { tag: 'root', children: [{ tag: 'p', children: ['An American band from Newbury Park.'] }] } }
};

export const REFERENTS = [
  { id: 1, fragment: 'All I am is a man', url: 'https://genius.com/1', range: {},
    annotations: [{ id: 11, body: { dom: { tag: 'root', children: [{ tag: 'p', children: ['The opening statement.'] }] } }, url: 'https://genius.com/1', state: 'accepted', votes_total: 40, verified: true, authors: [{ user: { name: 'ed' } }] }] },
  { id: 2, fragment: "too cold for you here", url: 'https://genius.com/2', range: {},
    annotations: [{ id: 12, body: { dom: { tag: 'root', children: [{ tag: 'p', children: ['The hook, and the whole thesis.'] }] } }, state: 'accepted', votes_total: 90 }] },
  { id: 3, fragment: 'a line that is not in our copy', range: {},
    annotations: [{ id: 13, body: { dom: { tag: 'root', children: [{ tag: 'p', children: ['Orphan.'] }] } } }] }
];

/* Drop-in replacement for fetch. Records calls so caching can be asserted. */
export function makeFetchStub({ fail404 = false } = {}) {
  const calls = [];
  const stub = async (url) => {
    const target = new URL(url);
    calls.push(target.pathname + '?' + target.searchParams.toString());
    const json = (response) => new Response(JSON.stringify({ meta: { status: 200 }, response }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });

    if (fail404) return new Response('{}', { status: 404 });
    if (target.pathname === '/songs/90478') return json({ song: SONG });
    if (target.pathname === '/songs/90479') return json({ song: SONG_ALBUM_ART });
    if (target.pathname === '/artists/22436') return json({ artist: ARTIST });
    if (target.pathname === '/referents') {
      const page = Number(target.searchParams.get('page') || 1);
      return json({ referents: page === 1 ? REFERENTS : [] });
    }
    if (target.pathname === '/search') return json({ hits: [{ type: 'song', result: SONG }] });
    return new Response('{}', { status: 404 });
  };
  stub.calls = calls;
  return stub;
}
