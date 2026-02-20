Rift Vault landing site
======================

This folder contains a PWA-styled landing page and API server for the Rift Vault desktop app. It includes:

- `index.html` — hero with download buttons and an "Add to desktop" prompt.
- `styles.css` — themed styles matching the desktop app.
- `app.js` — handles API-driven launch/download/install interactions.
- `manifest.json` & `sw.js` — PWA manifest and a minimal service worker.
- `server.js` — website backend with API routes.

Run locally
-----------

From project root:

`npm run web`

Open: `http://localhost:5174`

API routes
----------

- `GET /api/health` — API status
- `GET /api/downloads` — detected installers metadata
- `GET /api/download/windows` — redirects to best Windows installer if available
- `GET /api/launch` — launch deep-link metadata + fallback download URL

How to host
-----------

Recommended hosting: GitHub Pages, Netlify, or Vercel. Deploy the `website/` folder as the site root or a subpath.

If you want the browser "Add to desktop" experience, serve the site over HTTPS (GitHub Pages/Netlify/Vercel provide this).

Downloads
---------
Place your built installer artifacts in a `downloads/` folder at the site root and update the links in `index.html`. Alternatively link the buttons directly to your GitHub Releases URLs or itch.io page.

For auto-detection, place installers in either:

- `website/downloads/`
- `dist/` (from build tooling)

Icons
-----
For full PWA install UX, provide `icon-192.png` and `icon-512.png` inside this folder (or update `manifest.json` to point to your hosted icons).

Optional next steps
-------------------
- Add screenshots and an installation walkthrough modal.
- Add a small server-side endpoint to serve platform-specific installers based on OS detection.
- Wire `electron-builder` and upload `dist/` artifacts to GitHub Releases; update the Windows button to point at the `.exe` from Releases.
