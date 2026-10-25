# Nori-Dex

Interactive bestiary and promo hub for **The Sky Project: Land of Noris** by Enthariel Games
(unofficial spec prototype; all game art and names belong to the studio).

Plug the cable in to power the device, then drag a relic into the slot to boot its screen.
The interface is in English and Spanish (`js/i18n/es.js`); `?lang=es` or the chips in the Join & follow panel switch it.

```
npm i            # build tools only (terser, csso, html-minifier-terser)
npm run build    # -> dist/  (static site, zero third-party requests)
npm test         # logic tests, repeated in six time zones (countdown, data, quiz, Spanish)
npm run serve    # dist/ with the production headers, http://127.0.0.1:4173/
npm run images   # re-bake WebP art from assets/src/ (Python 3 + Pillow + numpy)
```

Project documents live one level up: `../docs/AUDIT.md`, `../docs/HANDOVER.md`, `../docs/PERF.md`, `../HANDOFF.md`.
