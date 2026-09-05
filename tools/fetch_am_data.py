#!/usr/bin/env python3
"""
Fetch Arctic Monkeys track metadata from free APIs and write
arctic-monkeys/js/am-api-data.js.

The site works with no network at all — everything it needs is already in
js/data.js. This script only *enriches* it: 30-second preview URLs, real
artwork, store links, and (with a token) Genius credits.

Sources, none of which need a key:
  iTunes Search   https://itunes.apple.com/search   previews, artwork, links
  Deezer          https://api.deezer.com/search     previews, links
  MusicBrainz     https://musicbrainz.org/ws/2      canonical release data
Optional:
  Genius          https://api.genius.com            writers/producers/lyrics URL
                  set GENIUS_ACCESS_TOKEN to enable

Usage:
    python3 tools/fetch_am_data.py                # iTunes + Deezer
    python3 tools/fetch_am_data.py --musicbrainz  # also verify tracklists
    GENIUS_ACCESS_TOKEN=xxx python3 tools/fetch_am_data.py --genius

Free Genius tokens: https://genius.com/api-clients (a "client access token"
is enough — it is read-only and safe to regenerate).
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

ARTIST = 'Arctic Monkeys'
UA = 'ArcticMonkeysFanSite/1.0 ( https://github.com/ — fan project, non-commercial )'


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


def genius_song(track, token):
    q = urllib.parse.quote_plus(f'{ARTIST} {track}')
    hdr = {'Authorization': f'Bearer {token}'}
    res = get(f'https://api.genius.com/search?q={q}', headers=hdr)
    if not res:
        return None
    hits = res.get('response', {}).get('hits', [])
    hit = next((h for h in hits
                if norm(h['result']['primary_artist']['name']) == norm(ARTIST)), None)
    if not hit:
        return None
    sid = hit['result']['id']
    full = get(f'https://api.genius.com/songs/{sid}', headers=hdr)
    if not full:
        return None
    song = full.get('response', {}).get('song', {})
    return {
        'geniusId': sid,
        'geniusUrl': song.get('url'),
        'writers': [a['name'] for a in song.get('writer_artists', [])],
        'producers': [a['name'] for a in song.get('producer_artists', [])],
        'releaseDate': song.get('release_date'),
        'pageviews': song.get('stats', {}).get('pageviews'),
    }


# ------------------------------------------------------------------------ main

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--genius', action='store_true',
                    help='also fetch Genius credits (needs GENIUS_ACCESS_TOKEN)')
    ap.add_argument('--musicbrainz', action='store_true',
                    help='cross-check tracklists against MusicBrainz')
    ap.add_argument('--album', help='only this album (substring match)')
    args = ap.parse_args()

    token = os.environ.get('GENIUS_ACCESS_TOKEN', '').strip()
    if args.genius and not token:
        print('--genius needs GENIUS_ACCESS_TOKEN in the environment.', file=sys.stderr)
        return 1

    albums = read_albums()
    if args.album:
        albums = [a for a in albums if args.album.lower() in a['title'].lower()]
    if not albums:
        print('No albums matched.', file=sys.stderr)
        return 1

    out, warnings, stats = {}, [], {'preview': 0, 'genius': 0, 'tracks': 0}

    for album in albums:
        title = album['title']
        print(f"→ {title}")
        it = itunes_album(title)
        dz = deezer_album(title)

        if args.musicbrainz:
            mb = musicbrainz_album(title)
            if mb:
                have, theirs = {norm(t) for t in album['tracks']}, {norm(t) for t in mb}
                for missing in theirs - have:
                    warnings.append(f'{title}: MusicBrainz lists a track we do not have '
                                    f'({next(t for t in mb if norm(t) == missing)})')

        for track in album['tracks']:
            k = norm(track)
            rec = {'album': title}
            rec.update({x: y for x, y in (it.get(k) or {}).items() if y})
            for key, val in (dz.get(k) or {}).items():
                if val and (key != 'preview' or not rec.get('preview')):
                    rec[key] = val

            if args.genius:
                g = genius_song(track, token)
                time.sleep(0.4)
                if g:
                    rec.update(g)
                    stats['genius'] += 1

            if rec.get('preview'):
                stats['preview'] += 1
            else:
                warnings.append(f'{title}: no preview found for "{track}"')
            stats['tracks'] += 1
            out[track] = rec

    payload = {
        'generated': time.strftime('%Y-%m-%d %H:%M:%SZ', time.gmtime()),
        'sources': ['iTunes Search API', 'Deezer API']
                   + (['Genius API'] if args.genius else [])
                   + (['MusicBrainz'] if args.musicbrainz else []),
        'tracks': out,
    }

    with open(OUT_JS, 'w', encoding='utf-8') as f:
        f.write('/* Generated by tools/fetch_am_data.py — do not edit by hand.\n')
        f.write(f"   {payload['generated']} · {', '.join(payload['sources'])}\n")
        f.write('   The site works without this file; it only enriches it. */\n')
        f.write('const API_DATA = ')
        json.dump(payload, f, ensure_ascii=False, indent=1)
        f.write(';\n')

    print(f"\nWrote {OUT_JS}")
    print(f"  {stats['tracks']} tracks · {stats['preview']} previews"
          + (f" · {stats['genius']} Genius entries" if args.genius else ''))
    if warnings:
        print(f'\n{len(warnings)} warning(s):')
        for w in warnings[:25]:
            print(f'  - {w}')
        if len(warnings) > 25:
            print(f'  … and {len(warnings) - 25} more')
    return 0


if __name__ == '__main__':
    sys.exit(main())
