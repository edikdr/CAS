/* ============================================================
   Pictures: sleeves and portraits.

   Genius answers both when a token is set in the platform's environment,
   and for most of the life of this page it was the only thing asked. That
   made the covers and the band photographs hostage to a credential — a
   site deployed without one showed neither, which is not what "unofficial
   fan archive" should look like on first load.

   So each of them now has a keyless source behind it, and both of those
   are open to the browser directly:

     sleeves    iTunes Search API — the same endpoint the player already
                uses for previews, no key, CORS open
     portraits  Wikipedia — free-licence photographs, no key, CORS open
                with `origin=*`

   Genius is still asked first for a sleeve, because it has the record's
   own artwork rather than a store's crop of it. For a portrait Wikipedia
   goes first: Genius' artist image for a band member is usually a picture
   of the whole band, which on a card headed "Matt Helders" is wrong.

   Everything here resolves once per session and is remembered. Nothing
   waits on it: a card is complete before any of this lands, and if none
   of it lands the card stays as it was.
   ============================================================ */

const Media = {
  cache: new Map(),

  session(key) {
    try { return JSON.parse(sessionStorage.getItem('am-media-' + key)); }
    catch { return null; }
  },

  remember(key, value) {
    try { sessionStorage.setItem('am-media-' + key, JSON.stringify(value)); }
    catch { /* private window, or storage refused — just don't cache */ }
  },

  /** One in-flight promise per key, shared by every caller. */
  once(key, work) {
    if (this.cache.has(key)) return this.cache.get(key);
    const cached = this.session(key);
    if (cached !== null) {
      const p = Promise.resolve(cached || null);
      this.cache.set(key, p);
      return p;
    }
    const p = work()
      .catch(() => null)
      .then(v => { this.remember(key, v || false); return v || null; });
    this.cache.set(key, p);
    return p;
  },

  async json(url) {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    return res.json();
  },

  norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); },

  /* ---------------------------------------------------------- sleeves */

  /**
   * A record's sleeve from the iTunes Search API.
   *
   * `artworkUrl100` is a 100px crop; the size is a path segment rather
   * than a query parameter, so asking for 600 is a string replacement.
   */
  async itunesCover(album) {
    const term = `${ARTIST} ${album.short || album.title}`;
    const body = await this.json(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=album&limit=15`);
    const rows = (body && body.results) || [];

    const want = this.norm(album.title);
    const shortWant = this.norm(album.short || album.title);
    const mine = rows.filter(r =>
      this.norm(r.artistName).includes('arcticmonkeys') && r.artworkUrl100);

    const pick = mine.find(r => this.norm(r.collectionName) === want)
      || mine.find(r => this.norm(r.collectionName).startsWith(shortWant))
      || mine.find(r => this.norm(r.collectionName).includes(shortWant));
    if (!pick) return null;

    return String(pick.artworkUrl100).replace(/\/\d+x\d+bb\./, '/600x600bb.');
  },

  /** The sleeve for a record: whatever was baked in, then Genius, then iTunes. */
  cover(album) {
    return this.once('cover:' + album.id, async () => {
      const baked = Genius.cover(album);
      if (baked) return baked;
      return (await Genius.coverLive(album)) || (await this.itunesCover(album));
    });
  },

  /* -------------------------------------------------------- portraits */

  /**
   * A photograph of one person, from Wikipedia.
   *
   * `generator=search` rather than a hard-coded article title: the titles
   * disambiguate differently from one person to the next — "Alex Turner
   * (musician)", but plain "Matt Helders" — and a title that gets moved
   * would silently stop resolving. `origin=*` is what opens the MediaWiki
   * API to the browser.
   *
   * The surname check is the point of the whole function. Two of the five
   * have no article of their own, and a search for them lands on the band
   * page, whose lead image is a photograph of all four — which under a
   * card headed with one name is simply a wrong caption. Better a
   * monogram than the wrong face.
   */
  async wikiPortrait(name) {
    const qs = new URLSearchParams({
      action: 'query', format: 'json', origin: '*',
      generator: 'search', gsrsearch: `${name} ${ARTIST}`, gsrlimit: '3',
      prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '640'
    });
    const body = await this.json(`https://en.wikipedia.org/w/api.php?${qs}`);
    const pages = Object.values((body && body.query && body.query.pages) || {});
    if (!pages.length) return null;

    const surname = this.norm(String(name).split(/\s+/).pop());
    const hit = pages
      .sort((a, b) => (a.index || 99) - (b.index || 99))
      .find(p => p.thumbnail && p.thumbnail.source && this.norm(p.title).includes(surname));
    return hit ? hit.thumbnail.source : null;
  },

  /** A portrait: baked in, then Wikipedia, then whatever Genius has. */
  portrait(name) {
    return this.once('portrait:' + name, async () => {
      const baked = Genius.photo(name);
      if (baked) return baked;
      const wiki = await this.wikiPortrait(name);
      if (wiki) return wiki;
      const live = await Genius.artistLive(name);
      return (live && live.photo) || null;
    });
  }
};

if (typeof window !== 'undefined') window.Media = Media;
