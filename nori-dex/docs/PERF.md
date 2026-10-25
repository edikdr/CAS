# Performance, build and hosting checks (O5)

Measured on 2026-10-25 against the production build (`npm run build` → `src/dist/`), served by
`npm run serve` (the `vercel.json` headers and gzip, as on Vercel).

**Test machine caveat.** Every number here comes from headless Chromium 153 in a cloud container
**without a GPU**. Chromium renders through SwiftShader (a software GPU), so compositing and
rasterising run on the CPU. Main-thread numbers (script, style, layout, blocking time) are
meaningful. Raw frame rates are a floor: they scale with pixel count and will be far higher on any
phone or laptop with a GPU. Run the same checks on a real mid-range Android before launch (see the
end of this file).

## Budgets (enforced by the build; it fails if one trips)

| Budget | Limit | Now |
|---|---|---|
| First load: HTML + CSS + JS, gzip | 250 KB | **55.1 KB** (html 2.8, css 13.4, js 38.9) |
| `data/sky.js` | 20 KB | **4.4 KB** |
| Each shipped image (WebP only) | 250 KB | largest 184 KB (20 files, 1.37 MB in total; only what a view shows is requested, and 5 full-size files are shipped for the screens but not referenced yet) |
| Third-party requests | 0 | **0** (allowlist gate on every absolute URL in `dist/`) |

On the wire, the first screen pulls about 366 KB in total: the 55 KB above, 47 KB of fonts
(Nunito latin + Tiny5), and the backdrop, logos and the first relic label. Lighthouse counts
494 KiB by the end of its run, because the other relic labels load as the rack draws.

## Lighthouse 13.5.0

Mobile is the default preset: simulated slow 4G and 4x CPU slowdown. "Before" is one run; "after" is the median of 3 runs (85, 86, 86).

| | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|
| Mobile, before O5 | 68 | 96 | 96 | 100 |
| **Mobile, after O5** | **86** | **100** | **100** | **100** |
| **Desktop, after O5** | **100** | **100** | **100** | **100** |

| Mobile metric | Before | After |
|---|---|---|
| First Contentful Paint | 1.5 s | 0.8 s |
| Largest Contentful Paint | 3.4 s | 3.7 s (see "Open items") |
| Total Blocking Time | 990 ms | 210–250 ms |
| Cumulative Layout Shift | 0.023 | 0.023 |
| Speed Index | 3.5 s | 1.2 s |

### After the Sonnet phase (25 Oct 2026, Lighthouse 13.5.0, three runs each, same sandbox, same day)

| Build | Performance (3 runs) | TBT | LCP |
|---|---|---|---|
| Opus final (`cd87ea0`) | 80, 75, 77 | 410 to 550 ms | 3.7 s |
| Phone console (`25ab622`) | 78, 78, 78 | 440 to 540 ms | 3.4 to 3.7 s |
| Lobby (`9f28bda`) | 78, 79, 79 | 380 to 500 ms | 3.4 to 3.7 s |
| With Spanish and the S6/S7 fixes | 75, 80, 79 | 380 to 540 ms | 3.8 s |

The sandbox was slower than during O5 (the same Opus build scored 86 then and 75 to 80 now), so compare
the rows with each other, not with the O5 table. The rows show no change from what the Sonnet phase
added (dex, worlds, quiz, hub, Spanish dictionary, lobby sky): the screens build when a relic is seated.
First load is 76.7 KB gzip (O5: 55 KB; the rest is the new screens, the lobby CSS and the Spanish
dictionary).
Accessibility, best practices and SEO are 100; desktop is 99 to 100.

Where the time goes (Chrome trace at 4x CPU slowdown): one 555 ms task runs `app.js` (about 340 ms of
script plus the first style and layout pass of the 3D console), then 156 ms, 94 ms and 86 ms tasks for
layout and paint of the same scene. The LCP element is the crest logo, and its render delay is about 2 s
only because those tasks come first. Target 90+ needs roughly 0.7 s less main-thread work before the
first paint of the console. Ideas, in order of expected gain:
1. A same-origin script in `<head>` that sets `data-layout` and `--scale` (see "Open items"): the console
   can show at once, without the layout jump.
2. Split the start-up of `app.js` into chunks under 50 ms (build the grips, the relic labels and the
   conduit after the first paint). Blocking time counts only tasks over 50 ms.
3. `contain: layout paint` on the big static subtrees of the console, so the first layout does not
   cover the whole scene.

### Final pass: views that have not been shown yet are not laid out

The altar, the relic screen and the boot sequence are built at start-up but are not seen for seconds, and the
first style and layout pass over the whole 3D console was the most expensive thing the page does. Now a view that
has never been active is `content-visibility: hidden` (`.view:not(.is-active):not(.has-shown)` in `style.css`;
`setView` in `app.js` adds `has-shown` the first time a view is shown, so later fade-outs are unchanged).

| Chrome trace, 4x CPU slowdown, phone viewport (3 runs each) | Blocking time at load |
|---|---|
| before | 1245, 910, 990 ms |
| after | 718, 711, 689 ms |

Lighthouse mobile on the same sandbox and day: before 75 to 80 (LCP 3.7 s); after 76, 89, 93 (LCP 2.6 s, CLS 0 to 0.02).
Accessibility and best practices stay 100. The SEO score is 66 because the prototype is deliberately not indexable
(`is-crawlable` fails); it goes back to 100 when the site is made public.

## What O5 fixed

1. **Animations in hidden views ticked the main thread.** The Awaken prompt's halo and crystal loop
   inside a view that is invisible while the device is off. Chrome cannot run an animation with no
   visible change on the compositor, so it ticked the main thread every frame. That re-layerised the
   whole 3D scene about 60 times a second. Every animation inside an inactive view is now paused
   (`style.css`). Each of the two loops alone had cost about 1.2–1.7 s of main thread per 3 s at 4x
   slowdown.
2. **The socket's "plug me in" glow animated `box-shadow`**, which repainted the device every frame.
   It is now an opacity fade on a pseudo-element (`console3d.css`).
3. **The conduit hint followed the plug with `transform` but had no layer of its own**, so it
   repainted the document about 15 times a second. It now has `will-change: transform`
   (`stage.css`). At rest there are no paints at all.
4. **The conduit read the socket position (`getBoundingClientRect`) several times per frame.** It now
   reads once per frame and after a resize (`cable.js`).
5. **The campaign panel's first `Intl` call** (date and number formatting) cost about 80 ms on the
   startup path. It is now formatted by hand (`app.js`).
6. **The relic readout on the screen polled once a second.** It now updates on a `change` event from
   the relic rack (`carts.js` → `app.js`).
7. **Low-power mode** (`js/motion.js`). It turns on for Save-Data, for devices with 2 GB of memory or
   less, or with `?lite=1` (`?lite=0` forces it off). The mist runs at 12 fps instead of 25, the grain
   is a still frame, idle loops (backdrop drift, relic float, crystal breath) stop, and the reverb is
   shorter. One-off moments (boot, attunement, grip swap) are unchanged. Reduced motion still wins
   over everything.
8. Favicon (the studio logo), so there is no `favicon.ico` 404. The visual tooltip is `aria-hidden`
   (every button carries its own `aria-label`). The boot logo loads at low fetch priority.

## Idle and interaction cost

Main thread over 3 s on the phone layout, at 4x CPU slowdown, in the first seconds after load
(the conduit still sways, then its loop goes to sleep):

| | Main thread busy |
|---|---|
| Before O5 | ~2.9 s of 3 s (saturated) |
| After O5 | ~1.7 s of 3 s, falling to near zero once the conduit settles |

Frame rate while interacting (`requestAnimationFrame` intervals; software GPU, see the caveat):

| Interaction | Phone 412×823, 1x | Phone, 4x CPU | Desktop 1280×800, 1x |
|---|---|---|---|
| Drag the conduit | 58 fps | 48 fps | 27 fps |
| Drag a relic | 46 fps | 41 fps | 23 fps |
| Seat a relic + attunement | 49 fps | 44 fps | 25 fps |
| Grip swap | 43 fps | 35 fps | 21 fps |

The desktop rows are limited by software rasterising, not by the page. While dragging a relic on
desktop the main thread is only **20% busy** (style 0.16 s, script 0.12 s, layout ≈ 0 over 3.3 s),
so a real GPU should hold 60 fps.

## Hosting checks

- **CSP with the real headers.** I served `dist/` with the `vercel.json` headers and ran the full
  flow:
  - power on, Awaken, grip swap, seat a relic, photo capture (JPEG download), open a detail, back,
    switch relics twice.
  - Result: **0 CSP violations, 0 console errors.**
  - Every response carries the CSP.
  - `index.html` is `no-cache`. `js/`, `css/`, `fonts/` and `assets/` are `immutable`, which is
    safe because every URL carries a content hash (`app.<hash>.js`, `?v=<hash>`).
- **Clean checkout.** A fresh clone, then `npm ci` and `npm run build`, passes all gates.
  `package-lock.json` is committed.
- **Local preview with production headers**: `npm run build && npm run serve` (no dependencies;
  `PORT=8080` to change the port).

## Open items

- **LCP on mobile, 3.7 s simulated.** The device body starts invisible and fades in once the script
  has picked the layout (phone or desktop) and the scale. Showing it earlier is not free: the first
  paint would use the desktop layout and then jump (CLS rose from 0.02 to 0.41 when I tried). The
  real fix is a tiny same-origin script in `<head>` that sets `data-layout` and `--scale` before the
  first paint, so the body can be visible at once. The cost is about 0.5 KB and one small blocking
  request, plus a separate entry in `scripts/build.mjs`. Expected gain about 0.5–0.8 s of LCP.
- **Real-device pass before launch.** Run Lighthouse in Chrome DevTools on a mid-range Android over
  USB (or WebPageTest, Moto G class, 4G). Check the relic drag stays at 60 fps with a GPU. If it does
  not, the first thing to try is low-power mode (`?lite=1`) to see whether idle loops are the cause.
