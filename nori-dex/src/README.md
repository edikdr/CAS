# Nori-Dex

Interactive bestiary and promo hub for **The Sky Project: Land of Noris** by Enthariel Games
(unofficial spec prototype; all game art and names belong to the studio).

Plug the cable in to power the device, then drag a relic into the slot to boot its screen.

```
npm i            # build tools only (terser, csso, html-minifier-terser)
npm run build    # -> dist/  (static site, zero third-party requests)
npm run images   # re-bake WebP art from assets/src/ (Python 3 + Pillow + numpy)
```

Project documents live one level up: `../docs/AUDIT.md`, `../docs/HANDOVER.md`, `../docs/PERF.md`, `../HANDOFF.md`.
