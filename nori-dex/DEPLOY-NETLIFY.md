# Deploying to Netlify by drag and drop

Upload **the site**, not this project.

- The site is the folder that has `index.html` right inside it: `src/dist/` after `npm run build`, or the unzipped
  `nori-dex-site-*.zip` that comes with this project.
- Do **not** drop this whole project folder (or `nori-dex-project-*.zip`). The address would answer "Page not found",
  because the project has no `index.html` at its top level, and the noindex files (`robots.txt`, `_headers`) would not be at the root.

Steps: Netlify → your site → **Deploys** → drag the unzipped site folder onto the drop area (or "Add new site → Deploy manually").
If a zip is refused, unzip it and drag the folder.

Deploying from Git instead? See "Netlify" in `docs/HANDOVER.md` (Base directory `nori-dex/src`).
