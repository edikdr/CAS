# Nori-Dex: handover for Enthariel Games

This guide is for the studio team. It covers how to change the data and the art, how to build the
site, and how to put it online on Vercel. No framework or server is involved: the site is plain
HTML, CSS and JavaScript, and the build produces a static folder.

Everything lives in `nori-dex/src/`:

| Path | What it is |
|---|---|
| `data/sky.js` | **The only data file.** Noris, the hero, types, planes, campaign, links, credits. |
| `js/config.js` | The three relic cartridges, the grip sets and the altar buttons. |
| `assets/` | Web-ready art (WebP), made from the originals in `assets/src/`. |
| `assets/src/` | Your original files. They are never shipped and never modified. |
| `scripts/` | Build, image baking and the local preview server. |
| `vercel.json` | Hosting settings: build command, output folder, security and caching headers. |

## Prototype: what is real, what is placeholder

This build is a **prototype for the studio's review**. It is not indexed by search engines (see "Going public"
below) and nothing on it is presented as a game fact unless it comes from the studio's own material.

**Real** (from the studio's press kit, screenshots and Kickstarter page; each statement has its source in
`facts` in `data/sky.js`):
- Kael (a character, not a Nori) and five Noris with their names and looks: Zer, Saltu, Corivel, Denal, Garnia.
- The studio's official art: the key art and logos, the HUD portraits, two in-game screenshots.
- The Abyssal Plane's name and its one-line description; the idea of four planes joined by the stream of mana.
- The game's facts: genre, studio and team, combat and permadeath, the size of the game, platforms, stretch goals.
- The Kickstarter dates and goal (the countdown is computed on the visitor's device), the Kickstarter link, the
  Steam page, the Discord invite, the game's and the studio's social links (found on the studio's own Linktree and
  on Steam; please confirm them), the credits.

**Placeholder** (always labelled on screen: Placeholder, Working title, Description pending, Art pending,
Rare palette (demo), link pending):
- The six types (Type I to VI) and which Nori has which: not public yet.
- The Noris' pictures: HUD portraits stand in for the real sprites; the Alternate palette is a colour effect.
- Celestia, Noreth and Infernia are working titles; planes 1 to 3 have no description; planes 3 and 4 have no art.
- The Steam playtest link.
- The Spanish text (written for this project; please review it).
- The playtest Lv / HP values are **hidden**: they come from an early playtest save and are not base stats. They
  stay in `data/sky.js`; set `showSnapshot: true` in `js/config.js` to show them again (a "Playtest snapshot"
  row on each card).

**Send us more Noris.** For each Nori, send:
1. its **name** and a **one-line description** in the studio's words (what it looks like, not stats);
2. its **official art**: a PNG or WebP, at least 512 px, square or nearly, plain or transparent background (an
   idle sprite, or a clean portrait); optionally the **alternate-palette** version;
3. its **type** (one of the six, once the names are public), and, if it is a legendary or a rare variant, say so.

To add one yourself: put the art in `assets/src/nori/`, add a line to `JOBS` in `scripts/bake-images.py`,
run `npm run images`, then copy an entry of `noris` in `data/sky.js` (new `id`, `name`, `appearance`,
`art.regular`, `type: null` until the type is confirmed, `snapshot` may stay as it is). Three more things follow
from a new Nori: its Spanish description needs an entry in `js/i18n/es.js`; its colour comes from `ACCENT` and
`RARE_HUE` in `js/sections.js` (a neutral default is used until it has one); and the Spirit Quiz in
`js/quiz-data.js` only knows the five current Noris, so a new one takes part in the quiz once it gets answer
weights there (`npm test` tells you what is missing). The dex grid grows by itself and scrolls.

## Who built the website

The credit "Website by Eduard · fantastical566@gmail.com" is in `siteCredit` in `js/config.js`. It shows in the bottom-left
corner of the page (the `.site-credit` line in `index.html`, hidden in small windows and on the phone layout, where it
would touch the device) and as the last line of the Join & follow panel. If the name or address changes, change it in
`config.js` and in the `index.html` line; `npm test` fails when the two differ. The Spanish page says "Sitio web de".

## Going public (turning the prototype into the real site)

Right now the site tells search engines to stay away, in four places that must be removed together:
`<meta name="robots" content="noindex,nofollow">` in `index.html`, the `X-Robots-Tag` header in `vercel.json` and
in `_headers`, and `robots.txt` (`Disallow: /`). The build checks all four and **fails if any is missing**, so
nobody can forget one by accident; to go public, delete the four and delete the "not indexable" check in
`scripts/build.mjs` and its test in `scripts/test.mjs`. Replace `robots.txt` with `User-agent: *` and
`Allow: /` (or remove it). Note that `Disallow: /` stops well-behaved crawlers from reading the page at all, so
the meta tag is a second line of defence for them; both are only requests, not access control. If the site must
be private rather than just unlisted, put it behind the host's password protection.

## 1. Build and preview on your computer

You need Node.js 18 or newer.

```
cd nori-dex/src
npm install          # three build tools, nothing that ships
npm run build        # writes dist/ and runs the checks below
npm test             # logic tests (countdown, data, quiz, Spanish), repeated in six time zones
npm run serve        # http://127.0.0.1:4173/ with the same headers as the live site
```

The build **refuses to finish** if one of these checks fails. The message says what and where.

| Check | What it protects | Typical fix |
|---|---|---|
| Script list | `index.html` loads exactly the expected scripts | Add a new script to `CORE` in `scripts/build.mjs` too |
| No Cyrillic | The site is English and Spanish (Latin letters only) | Remove the stray characters |
| Brand sweep | No third-party franchise or hardware names | Reword |
| Third-party URLs | Zero requests to other sites; only allowed outbound links | Add the link's host to `LINK_HOSTS` in `scripts/build.mjs` |
| Missing assets | Every `assets/...` path in code and data exists | Fix the path, or bake the image (section 3) |
| Budgets | First load under 250 KB gzip, `sky.js` under 20 KB, every image WebP and under 250 KB | Shorten texts; re-bake the image |

## 2. Change the data (`data/sky.js`)

Open the file in any text editor. Keep the quotes, commas and brackets as they are.

- **Honest data.** Anything not yet confirmed carries `verified: false`, or a status such as
  `nameStatus: 'working'` or `artStatus: 'pending'`. The site then shows a small **Placeholder**
  tag next to it. When a fact becomes official, set `verified: true` (or `nameStatus: 'confirmed'`)
  and the tag disappears.
- **Noris.** Each entry has `id`, `name`, `appearance`, `type`, `art.regular`, `art.alternate`
  (the alternate-colour art, or `null`), `snapshot` and `verified`. To add a Nori, copy an entry,
  give it a new `id`, and point `art.regular` to its image (section 3).
- **`snapshot`** is a reading from an early playtest save (level and HP). It is **not shown**: `showSnapshot` in
  `js/config.js` is `false`. Set it to `true` to show a "Playtest snapshot" row on each card (labelled "Not base
  stats"). Remove the field from `sky.js` when real stats exist.
- **Types.** Six generic slots (Type I to VI) because the names are not public yet. Put the real names
  in `label` and set `verified: true`. Then give each Nori its `type` id (for example `'t3'`).
- **Planes.** `name`, `nameStatus`, `blurb`, `art`, `artStatus`. Celestia, Noreth and Infernia are
  working titles; the Abyssal Plane is confirmed.
- **Campaign.** `endsOn` (YYYY-MM-DD) and `goalEUR` drive the countdown on the console's home screen.
  The countdown hides itself after the end date. Live pledge totals are deliberately not shown.
- **Links.** All of them are in `links`. A link set to `null` shows "link pending" and cannot be clicked: today
  that is only `steamPlaytest`. Paste the URL to make the button live. The Steam page, the Discord invite, Facebook
  and Bluesky were taken from the studio's Linktree and from Steam on 25 Oct 2026: check them. To add a channel,
  add it to `links.game` or `links.studio`, add a row to `SOCIAL` in `js/hub.js` (a name and an icon), and its host
  to `LINK_HOSTS` in `scripts/build.mjs` (a host that is not listed makes the build fail). `npm test` checks that
  every link is https on a listed host.
- **Credits** appear in the Join & follow panel.
- **Text a player reads** (descriptions, blurbs, type labels, credit roles, facts) is wrapped like
  `_('A spirit of blue flame...')` so that it can be translated. Names and numbers are not wrapped.
  When you change an English sentence, change its Spanish entry in `js/i18n/es.js` too (the key is the
  English text). `npm test` fails if one is missing.

## 3. Change or add art

All art must be official studio art.

1. Put the original file in `assets/src/<folder>/` (`art/`, `shots/`, `nori/` or `logo/`).
2. If it is a new file, add one line to `JOBS` in `scripts/bake-images.py`: source, output name, maximum
   width, quality, and any extra widths (most large art also gets a 960 px copy).
3. Run `npm run images`. You need Python 3 with Pillow and numpy (`pip install pillow numpy`). It
   writes WebP files under 250 KB into `assets/`.
4. Point the data or config to the new file, for example `art: { regular: 'assets/nori/hud-zer.webp' }`.
5. Run `npm run build`.

HUD portraits (`nori/hud-*.png`) are cropped square about their round rim when baked, so every avatar sits in the middle of its frame; send them as they come from the game, rim included.

The logo (`logo/sky-project-logo-crop.png`) is a rectangle cut from the key art. When baked, its sky is made transparent along the logo's own black outline and a margin is added, so it sits cleanly on the boot screen and the crest; a vector logo or a PNG with alpha, sent as it is, will replace that step (remove the `sky-project-logo` branch in `main()` of `scripts/bake-images.py`).

Replacing an existing original under the same name only needs steps 3 and 5. The page backdrop is
baked from the Kael key art by `scripts/bake-bg.py`; change `SOURCE` there to use another image.

**When official Abyssal Plane art arrives:**
- Bake it (steps 1 to 3).
- In `js/config.js`, set the `abyssal` relic's `art`, `artSize` (the file's width and height) and
  `crop`: the `[x, y, width, height]` part of the image shown in the relic's arched window. The other
  two relics show examples.
- In `data/sky.js`, set the plane's `art` and `artStatus: 'unverified'` or `'confirmed'`.
- Until then the relic shows a deliberate "Art pending" window.

## 4. Relics, grips and buttons (`js/config.js`)

- **Relics** (`carts`): the engraved title, the screen each one opens (`opens`, plus `tab` for the
  plane), the label art and crop, stone and rune colours (`tint`), the crystal colour, and the
  attunement chord (notes in Hz). Reorder, remove or add entries here; keys 1 to 3 follow the order.
- **Grips** (`grips`): each set has light, mid, dark and trim colours for the left and right grip.
  Add a set and it appears in the picker under the device and in the `G` rotation.
- **Altar buttons** (`dock`): label, icon and colour.

## 5. Text and translations

The interface is written in English, and Spanish is built in. Every visible string is wrapped like
`_('Seat relic')`, and `js/i18n/es.js` holds the Spanish for each one (the English text is the key):

```
'Seat relic': 'Insertar reliquia',
'{n} day left|{n} days left': 'Queda {n} día|Quedan {n} días',     // plural: one|other
```

- Keep every `{placeholder}` of the English text, and the same number of `|` forms.
- The language is picked from `?lang=es`, then the saved choice, then the browser language. The
  Join & follow panel has English / Español chips.
- **The Spanish was written for this project and has not been reviewed by the studio.** Please read it,
  above all the game's own terms (Soulbonded, Celestial, plane, Lv / HP, Fallen, relic, grips).
- `npm test` checks that nothing is missing, nothing is unused, and the quiz still fits the phone's
  dialog box (a question up to 50 characters, an answer up to 28).
- A third language: copy `es.js`, list it in `index.html` and in `CORE` in `scripts/build.mjs` right
  after `es.js`, and add its chip to `LANGS` in `js/hub.js`.

## 6. Put it online with Vercel

1. Push the repository to GitHub (already done if you are reading this there).
2. On vercel.com: **Add New → Project**, then import the repository.
3. Set **Root Directory** to `nori-dex/src`. Leave the framework preset on **Other**. `vercel.json`
   already sets the install command (`npm install`), the build command (`npm run build`) and the
   output folder (`dist`).
4. **Deploy.** Every push to the main branch redeploys; every pull request gets a preview URL.
5. Optional: add your domain under **Settings → Domains**.

`vercel.json` also sends the security headers:
- a strict Content Security Policy: only files from the site itself, no third-party scripts, fonts or
  frames;
- `nosniff`, a referrer policy and a permissions policy;
- caching: the page is always revalidated, and every other file is cached for a year. That is safe
  because each build gives changed files new names.

If you ever embed something from another site (a video player, analytics), the CSP will block it on
purpose. Decide first, then widen the policy in `vercel.json`.

### Netlify

1. **Add new site → Import an existing project**, pick the repository.
2. Set **Base directory** to `nori-dex/src`. The rest comes from `netlify.toml` in that folder: build command
   `npm run build`, publish directory `dist`, Node 20. (You can also type them in the form: command
   `npm run build`, publish `dist`.)
3. Deploy. Netlify reads **`_headers`** from the published folder (the build copies it there from `src/_headers`);
   it carries the same security and caching rules as `vercel.json`, plus `X-Robots-Tag: noindex, nofollow`.
   `robots.txt` is copied the same way. If you change a header, change it in both files; `npm test` checks that
   the two agree.

**Drag and drop (no Git).** Upload the *site*, not the project: the folder whose top level holds `index.html`,
`robots.txt` and `_headers` (that is `nori-dex/src/dist/`, or the unzipped `nori-dex-site-*.zip`). If you drop the whole
project archive instead, Netlify publishes the project folders: the address then answers "Page not found" (there is no
`index.html` at the top), the site only opens under `/src/dist/`, and `robots.txt` and `_headers` (the noindex rules) are
not at the root where they must be. Check before dropping: if you see `index.html` right inside the folder, it is the
right one. Netlify's drag and drop does not run a build, so `netlify.toml` is ignored there; the folder must already be built.

Any other static host works too: run `npm run build` and upload `dist/`. Copy the headers from
`vercel.json` (or `_headers`) into that host's configuration.

## 7. Before launch

- Run `npm run build && npm run serve` and click through: plug in the cable, wake the device, seat
  each relic, swap the grips, open a Nori card, take the Spirit Quiz, open Join & follow, switch the
  language. Try it once with `?lang=es` on a phone.
- Run a Lighthouse audit on a real phone. Numbers measured so far are in `docs/PERF.md`.
- Low-power mode switches on by itself for Save-Data users and low-memory phones. Add `?lite=1` to
  the URL to see it.
