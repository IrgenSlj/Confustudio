# CONFUstudio — marketing site

A single, self-contained landing page (`index.html`) plus `studio.png`. No build step,
no dependencies, no cross-origin-isolation headers required — so it deploys to **any**
static host (Netlify, Vercel, GitHub Pages, Cloudflare Pages) for free. Just serve the
two files.

## Point the "Launch Studio" button

Open the `<script>` block at the bottom of `index.html` and edit one constant:

```js
const STUDIO_URL = "/";
```

## Two hosting shapes

**Same-origin (default).** Drop `index.html` + `studio.png` into the app's static root so
the page and the studio share one origin; `STUDIO_URL = "/"` then just loads the app.
**Split hosting.** Host this page on a static host and run the app elsewhere (e.g. the
Fly.io app), setting `STUDIO_URL = "https://confustudio.fly.dev"`. Either way the page
itself is plain static files and needs no special headers.
