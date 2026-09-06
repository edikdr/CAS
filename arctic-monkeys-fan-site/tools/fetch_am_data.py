#!/usr/bin/env python3
"""
Fetch Arctic Monkeys metadata, artwork and Genius annotations, and write
arctic-monkeys/js/am-api-data.js plus arctic-monkeys/assets/art/.

The site works with no network at all — everything it needs is already in
js/data.js. This script *enriches* it: 30-second previews, real cover art,
store links, songwriter credits and the Genius annotations that appear
when a lyric line is clicked.

Sources, none of which need a key:
  iTunes Search   https://itunes.apple.com/search   previews, artwork, links
  Deezer          https://api.deezer.com/search     previews, links
  MusicBrainz     https://musicbrainz.org/ws/2      canonical release data
With a token:
  Genius          https://api.genius.com            credits, art, annotations

The token is read from GENIUS_ACCESS_TOKEN in the environment or from a
.env file at the repo root. It is never written into the output and .env
is gitignored — nothing secret reaches the site or the repository.

Usage:
    python3 tools/fetch_am_data.py                  # iTunes + Deezer
    python3 tools/fetch_am_data.py --genius         # + Genius (needs token)
    python3 tools/fetch_am_data.py --genius --art   # + download the artwork
    python3 tools/fetch_am_data.py --all            # everything

A free token takes a minute: https://genius.com/api-clients — generate a
"client access token", which is read-only. Only that one is needed; the
client secret is for logging users in and this script never does that.
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_JS = os.path.join(ROOT, 'arctic-monkeys', 'js', 'data.js')
OUT_JS = os.path.join(ROOT, 'arctic-monkeys', 'js', 'am-api-data.js')
ART_DIR = os.path.join(ROOT, 'arctic-monkeys', 'assets', 'art')
ART_REL = 'assets/art'

ARTIST = 'Arctic Monkeys'
UA = 'ArcticMonkeysFanSite/1.0 ( https://github.com/ — fan project, non-commercial )'


def load_env():
    """Read .env at the repo root into os.environ without clobbering it.

    Deliberately dependency-free: KEY=VALUE per line, # comments, optional
    surrounding quotes. Anything a normal .env carries.
    """
    path = os.path.join(ROOT, '.env')
    if not os.path.exists(path):
        return
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, _, val = line.partition('=')
            key, val = key.strip(), val.strip().strip('"').strip("'")
            os.environ.setdefault(key, val)


def download(url, dest):
    """Save a remote file once. Returns True if the file is on disk."""
    if not url:
        return False
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return True
    try:
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=45) as r:
            data = r.read()
        if len(data) < 512:
            return False
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, 'wb') as fh:
            fh.write(data)
        return True
    except Exception as e:
        print(f'  ! artwork {e} <- {url[:80]}', file=sys.stderr)
        return False


def art_name(kind, key):
    slug = re.sub(r'[^a-z0-9]+', '-', str(key).lower()).strip('-')[:60]
    return f'{kind}-{slug}.jpg'


def get(url, headers=None, tries=4):
    """GET with exponential backoff. Returns parsed JSON or None."""
    hdrs = {'User-Agent': UA, 'Accept': 'application/json'}
    if headers:
        hdrs.update(headers)
    delay = 2
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=hdrs)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode('utf-8', 'replace'))
        except Exception as e:
            if attempt == tries - 1:
                print(f'  ! {e}  <- {url[:90]}', file=sys.stderr)
                return None
            time.sleep(delay)
            delay *= 2
    return None


def norm(s):
    """Loose title match: case, punctuation and bracketed suffixes dropped."""
    s = re.sub(r'\([^)]*\)|\[[^\]]*\]', '', str(s))
    s = s.replace('&', 'and').replace('’', "'")
    return re.sub(r'[^a-z0-9]+', '', s.lower())


# ----------------------------------------------------------------- read data.js

def read_albums():
    """Pull the album/track structure straight out of js/data.js.

    We only need titles, so a narrow regex over the ALBUMS block beats
    dragging in a JS parser.
    """
    with open(DATA_JS, encoding='utf-8') as f:
        src = f.read()
    block = src[src.index('const ALBUMS'):src.index('const SINGLES')]
    albums = []
    for chunk in block.split("\n  {\n")[1:]:
        title = re.search(r"title:\s*(['\"])(.*?)\1,", chunk)
        year = re.search(r'year:\s*(\d{4})', chunk)
        if not title:
            continue
        tracks = [m.group(2) for m in
                  re.finditer(r"\{\s*name:\s*(['\"])(.*?)\1,", chunk)]
        albums.append({
            'title': title.group(2).replace("\\'", "'"),
            'year': int(year.group(1)) if year else None,
            'tracks': [t.replace("\\'", "'") for t in tracks],
        })
    return albums


# ------------------------------------------------------------------- providers

def itunes_album(title):
    """All tracks of one album, keyed by normalised track name."""
    q = urllib.parse.quote_plus(f'{ARTIST} {title}')
    res = get(f'https://itunes.apple.com/search?term={q}&entity=album&limit=5')
    if not res or not res.get('results'):
        return {}
    best = None
    for row in res['results']:
        if norm(row.get('artistName')) == norm(ARTIST):
            best = row
            break
    if not best:
        return {}
    cid = best['collectionId']
    look = get(f'https://itunes.apple.com/lookup?id={cid}&entity=song&limit=60')
    out = {}
    if not look:
        return out
    for row in look.get('results', []):
        if row.get('wrapperType') != 'track':
            continue
        out[norm(row.get('trackName'))] = {
            'preview': row.get('previewUrl'),
            'ms': row.get('trackTimeMillis'),
            'appleUrl': row.get('trackViewUrl'),
            'art': (row.get('artworkUrl100') or '').replace('100x100', '600x600'),
            'releaseDate': (row.get('releaseDate') or '')[:10],
        }
    return out


def deezer_album(title):
    q = urllib.parse.quote_plus(f'{ARTIST} {title}')
    res = get(f'https://api.deezer.com/search/album?q={q}&limit=5')
    if not res or not res.get('data'):
        return {}
    best = next((a for a in res['data']
                 if norm(a.get('artist', {}).get('name')) == norm(ARTIST)), None)
    if not best:
        return {}
    full = get(f"https://api.deezer.com/album/{best['id']}")
    out = {}
    if not full:
        return out
    for row in full.get('tracks', {}).get('data', []):
        out[norm(row.get('title'))] = {
            'preview': row.get('preview'),
            'sec': row.get('duration'),
            'deezerUrl': row.get('link'),
        }
    return out


def musicbrainz_album(title):
    """Canonical tracklist — used to flag mismatches, not to overwrite."""
    q = urllib.parse.quote_plus(
        f'release:"{title}" AND artist:"{ARTIST}" AND status:official')
    res = get(f'https://musicbrainz.org/ws/2/release/?query={q}&fmt=json&limit=1')
    time.sleep(1.1)  # MusicBrainz asks for max 1 req/sec
    if not res or not res.get('releases'):
        return []
    rid = res['releases'][0]['id']
    full = get(f'https://musicbrainz.org/ws/2/release/{rid}?inc=recordings&fmt=json')
    time.sleep(1.1)
    if not full:
        return []
    out = []
    for medium in full.get('media', []):
        for tr in medium.get('tracks', []):
            out.append(tr.get('title'))
    return out


GENIUS = 'https://api.genius.com'


def gh(token):
    return {'Authorization': f'Bearer {token}'}


def genius_find(title, token, artist=ARTIST):
    """The Genius song id for one track, or None."""
    q = urllib.parse.quote_plus(f'{artist} {title}')
    res = get(f'{GENIUS}/search?q={q}', headers=gh(token))
    if not res:
        return None
    hits = res.get('response', {}).get('hits', [])
    want = norm(title)
    best = None
    for h in hits:
        r = h.get('result', {})
        if norm(r.get('primary_artist', {}).get('name')) != norm(artist):
            continue
        if norm(r.get('title')) == want:        # exact beats first-listed
            return r
        best = best or r
    return best


def genius_annotations(song_id, token, limit=14):
    """Referents for a song: the lyric fragment plus its explanation.

    This is what makes a lyric line clickable — Genius does not serve
    lyrics through the API, but it does serve the annotated fragments and
    the community's notes on them, which is the interesting half anyway.
    """
    out = []
    page = 1
    while len(out) < limit and page <= 3:
        res = get(f'{GENIUS}/referents?song_id={song_id}&text_format=plain'
                  f'&per_page=50&page={page}', headers=gh(token))
        if not res:
            break
        refs = res.get('response', {}).get('referents', [])
        if not refs:
            break
        for ref in refs:
            frag = (ref.get('fragment') or '').strip()
            if not frag:
                continue
            bodies = []
            for a in ref.get('annotations', []):
                body = ((a.get('body') or {}).get('plain') or '').strip()
                if body:
                    bodies.append({
                        'text': body,
                        'votes': a.get('votes_total', 0),
                        'url': a.get('url') or ref.get('url'),
                        'state': a.get('state'),
                    })
            if not bodies:
                continue
            bodies.sort(key=lambda b: -(b['votes'] or 0))
            out.append({
                'fragment': frag,
                'annotation': bodies[0]['text'],
                'votes': bodies[0]['votes'],
                'url': bodies[0]['url'],
            })
            if len(out) >= limit:
                break
        page += 1
        time.sleep(0.25)
    return out


def genius_song(track, token, want_art=False, want_notes=False):
    hit = genius_find(track, token)
    if not hit:
        return None
    sid = hit['id']
    full = get(f'{GENIUS}/songs/{sid}?text_format=plain', headers=gh(token))
    song = (full or {}).get('response', {}).get('song', {})

    stats = song.get('stats') or {}
    # Everything the API is willing to say — note what is absent: the words
    # themselves. Genius licenses lyrics and cannot serve them here.
    rec = {
        'geniusId': sid,
        'geniusUrl': song.get('url') or hit.get('url'),
        'writers': [a['name'] for a in song.get('writer_artists', [])],
        'producers': [a['name'] for a in song.get('producer_artists', [])],
        'featured': [a['name'] for a in song.get('featured_artists', [])],
        'releaseDate': song.get('release_date_for_display') or song.get('release_date'),
        'recordedAt': song.get('recording_location'),
        'pageviews': stats.get('pageviews'),
        'shares': song.get('pyongs_count'),
        'contributors': stats.get('contributors'),
        'annotations': song.get('annotation_count') or stats.get('accepted_annotations'),
        'hot': bool(stats.get('hot')),
        'relationships': [
            {'kind': str(r.get('relationship_type', '')).replace('_', ' '),
             'songs': [{'title': x.get('title'), 'url': x.get('url')}
                       for x in r.get('songs', [])[:4]]}
            for r in song.get('song_relationships', []) if r.get('songs')
        ],
        'media': [{'provider': m.get('provider'), 'url': m.get('url'),
                   'type': m.get('type')}
                  for m in song.get('media', []) if m.get('url')],
    }
    rec = {k: v for k, v in rec.items() if v not in (None, [], '')}

    desc = ((song.get('description') or {}).get('plain') or '').strip()
    if desc and desc.lower() not in ('?', 'null'):
        rec['about'] = desc[:1200]

    if want_art:
        url = song.get('song_art_image_url') or hit.get('song_art_image_url')
        name = art_name('song', track)
        if download(url, os.path.join(ART_DIR, name)):
            rec['art'] = f'{ART_REL}/{name}'

    if want_notes:
        notes = genius_annotations(sid, token)
        if notes:
            rec['notes'] = notes

    return rec


def genius_album(title, token, want_art=False):
    """Cover art and credits for one album, via any track on it."""
    q = urllib.parse.quote_plus(f'{ARTIST} {title}')
    res = get(f'{GENIUS}/search?q={q}', headers=gh(token))
    if not res:
        return {}
    for h in res.get('response', {}).get('hits', []):
        r = h.get('result', {})
        if norm(r.get('primary_artist', {}).get('name')) != norm(ARTIST):
            continue
        full = get(f"{GENIUS}/songs/{r['id']}", headers=gh(token))
        album = ((full or {}).get('response', {}).get('song', {}) or {}).get('album') or {}
        if norm(album.get('name')) != norm(title):
            continue
        out = {'geniusUrl': album.get('url')}
        if want_art:
            name = art_name('album', title)
            if download(album.get('cover_art_url'), os.path.join(ART_DIR, name)):
                out['cover'] = f'{ART_REL}/{name}'
        return out
    return {}


def genius_artist(name, token, want_art=False):
    """Artist page and photograph — used for the band and each member."""
    q = urllib.parse.quote_plus(name)
    res = get(f'{GENIUS}/search?q={q}', headers=gh(token))
    if not res:
        return {}
    for h in res.get('response', {}).get('hits', []):
        pa = h.get('result', {}).get('primary_artist', {})
        if norm(pa.get('name')) != norm(name):
            continue
        full = get(f"{GENIUS}/artists/{pa['id']}?text_format=plain", headers=gh(token))
        artist = (full or {}).get('response', {}).get('artist', {}) or pa
        out = {'geniusUrl': artist.get('url')}
        if want_art:
            fname = art_name('artist', name)
            url = artist.get('image_url') or artist.get('header_image_url')
            if download(url, os.path.join(ART_DIR, fname)):
                out['photo'] = f'{ART_REL}/{fname}'
        return out
    return {}


# ------------------------------------------------------------------------ main

def read_members():
    """Member names, so their Genius artist photographs can be pulled too."""
    with open(DATA_JS, encoding='utf-8') as f:
        src = f.read()
    block = src[src.index('const MEMBERS'):src.index('const ALBUMS')]
    return [m.group(2).replace("\\'", "'")
            for m in re.finditer(r"\n    name: (['\"])(.*?)\1,", block)]


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--genius', action='store_true',
                    help='fetch Genius credits, artwork links and annotations')
    ap.add_argument('--art', action='store_true',
                    help='download the artwork into assets/art (implies --genius)')
    ap.add_argument('--musicbrainz', action='store_true',
                    help='cross-check tracklists against MusicBrainz')
    ap.add_argument('--all', action='store_true', help='every source')
    ap.add_argument('--album', help='only this album (substring match)')
    ap.add_argument('--notes-limit', type=int, default=14,
                    help='max annotations kept per track (default 14)')
    args = ap.parse_args()

    if args.all:
        args.genius = args.art = args.musicbrainz = True
    if args.art:
        args.genius = True

    load_env()
    token = os.environ.get('GENIUS_ACCESS_TOKEN', '').strip()
    if args.genius and not token:
        print('--genius needs GENIUS_ACCESS_TOKEN — put it in .env at the repo\n'
              'root or in the environment. Get one free at '
              'https://genius.com/api-clients (a client access token).',
              file=sys.stderr)
        return 1

    albums = read_albums()
    if args.album:
        albums = [a for a in albums if args.album.lower() in a['title'].lower()]
    if not albums:
        print('No albums matched.', file=sys.stderr)
        return 1

    tracks, album_meta, artists = {}, {}, {}
    warnings = []
    stats = {'preview': 0, 'genius': 0, 'notes': 0, 'art': 0, 'tracks': 0}

    for album in albums:
        title = album['title']
        print(f'→ {title}')
        it = itunes_album(title)
        dz = deezer_album(title)

        if args.musicbrainz:
            mb = musicbrainz_album(title)
            if mb:
                have, theirs = {norm(t) for t in album['tracks']}, {norm(t) for t in mb}
                for missing in theirs - have:
                    warnings.append(f'{title}: MusicBrainz lists a track we do not have '
                                    f'({next(t for t in mb if norm(t) == missing)})')

        if args.genius:
            meta = genius_album(title, token, want_art=args.art)
            if meta:
                album_meta[title] = meta
                if meta.get('cover'):
                    stats['art'] += 1

        for track in album['tracks']:
            k = norm(track)
            rec = {'album': title}
            rec.update({x: y for x, y in (it.get(k) or {}).items() if y})
            for key, val in (dz.get(k) or {}).items():
                if val and (key != 'preview' or not rec.get('preview')):
                    rec[key] = val

            if args.genius:
                g = genius_song(track, token, want_art=args.art, want_notes=True)
                time.sleep(0.35)          # stay well inside Genius' rate limit
                if g:
                    if g.get('notes'):
                        g['notes'] = g['notes'][:args.notes_limit]
                        stats['notes'] += len(g['notes'])
                    if g.get('art'):
                        stats['art'] += 1
                    rec.update(g)
                    stats['genius'] += 1
                else:
                    warnings.append(f'{title}: no Genius match for "{track}"')

            if rec.get('preview'):
                stats['preview'] += 1
            else:
                warnings.append(f'{title}: no preview found for "{track}"')
            stats['tracks'] += 1
            tracks[track] = rec

        print(f'   {len(album["tracks"])} tracks')

    if args.genius:
        for name in [ARTIST] + read_members():
            info = genius_artist(name, token, want_art=args.art)
            time.sleep(0.3)
            if info:
                artists[name] = info
                if info.get('photo'):
                    stats['art'] += 1

    payload = {
        'generated': time.strftime('%Y-%m-%d %H:%M:%SZ', time.gmtime()),
        'sources': ['iTunes Search API', 'Deezer API']
                   + (['Genius API'] if args.genius else [])
                   + (['MusicBrainz'] if args.musicbrainz else []),
        'tracks': tracks,
        'albums': album_meta,
        'artists': artists,
    }

    with open(OUT_JS, 'w', encoding='utf-8') as f:
        f.write('/* Generated by tools/fetch_am_data.py — do not edit by hand.\n')
        f.write(f"   {payload['generated']} · {', '.join(payload['sources'])}\n")
        f.write('   The site works without this file; it only enriches it.\n')
        f.write('   No credentials are stored here. */\n')
        f.write('const API_DATA = ')
        json.dump(payload, f, ensure_ascii=False, indent=1)
        f.write(';\n')

    size = os.path.getsize(OUT_JS) / 1024
    print(f'\nWrote {OUT_JS}  ({size:.0f} KB)')
    print(f"  {stats['tracks']} tracks · {stats['preview']} previews"
          + (f" · {stats['genius']} Genius entries"
             f" · {stats['notes']} annotations" if args.genius else '')
          + (f" · {stats['art']} images" if args.art else ''))
    if warnings:
        print(f'\n{len(warnings)} warning(s):')
        for w in warnings[:25]:
            print(f'  - {w}')
        if len(warnings) > 25:
            print(f'  … and {len(warnings) - 25} more')
    return 0


if __name__ == '__main__':
    sys.exit(main())
