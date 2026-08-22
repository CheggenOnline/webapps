# Webapps — conventions

**Read this before adding or changing anything in this repo.**

This repo is a single GitHub Pages site that hosts many small web apps plus a
launcher page. It exists so a new app can be created from a phone with no
setup: one folder, one registry entry, one commit.

- Site root: `https://cheggenonline.github.io/webapps/`
- Repo: `CheggenOnline/webapps` (**lowercase** — Pages URLs are case-sensitive)
- Pages source: `main` branch, root folder. `.nojekyll` is present, so files are
  served verbatim and folders starting with `_` are served too.

---

## 1. Adding a new app — the whole procedure

1. Pick a `slug`: lowercase, `a-z0-9-` only, no spaces, no underscores, no
   Norwegian characters (`æøå` → `ae oe aa`). It is permanent — it is the URL.
2. Copy `_template/index.html` to `<slug>/index.html` and build the app there.
3. Append one object to the `apps` array in `apps.json`.
4. Commit **once**, with everything in it (see §8).

The launcher renders itself from `apps.json`. **Never hand-edit tile markup in
`index.html`** — if a tile is wrong, the registry entry is wrong.

### Reserved slugs — never use as an app folder

`icons`, `assets`, `shared`, `docs`, `api`, `_template`, `.github`

### Registry entry format (`apps.json`)

```json
{
  "slug": "turlogg",
  "name": "Turlogg",
  "tagline": "Kort setning om hva appen gjør",
  "icon": "🥾",
  "accent": "#38bdf8",
  "location": "local",
  "url": "./turlogg/",
  "repo": "CheggenOnline/webapps",
  "lang": "no",
  "tags": ["tur", "logg"],
  "added": "2026-08-22"
}
```

| Field | Rule |
|---|---|
| `slug` | Unique across the whole registry. Matches the folder name for local apps. |
| `name` | Short — it must fit on one line in a phone tile. Max ~18 characters. |
| `tagline` | One sentence, max ~60 characters. No trailing period. |
| `icon` | A single emoji. Not an image path. |
| `accent` | Hex colour, `#rrggbb`. Anything else is ignored and falls back to blue. |
| `location` | `"local"` (lives in this repo) or `"external"` (its own repo). |
| `url` | Local: `"./<slug>/"` — **relative, with trailing slash**. External: full `https://` URL. |
| `lang` | `"no"` or `"en"`. |
| `tags` | Lowercase Norwegian words. A tag only becomes a filter chip when 2+ apps share it. |
| `added` | `YYYY-MM-DD`. |

Order in the array is the order on screen. Newest-and-most-used near the top.

---

## 2. Paths — relative, always

The site lives under `/webapps/`, not at the domain root. An absolute path like
`/style.css` resolves to `cheggenonline.github.io/style.css` and 404s.

- Do: `./app.js`, `./icons/icon-192.png`, `../index.html`
- Never: `/app.js`, `/webapps/app.js` (breaks if the repo is ever renamed)

Link back to the launcher from an app with `../` (or `../index.html`).

## 3. localStorage — namespace or corrupt

Every app on `cheggenonline.github.io` shares **one origin**, so it shares one
`localStorage`. Two apps using a key called `settings` will silently overwrite
each other, and this repo's apps share it with every other
`cheggenonline.github.io/*` app too.

**Rule: every key is prefixed `webapps.<slug>.`**

```js
const NS = "webapps.turlogg.";
const save = (k, v) => { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) {} };
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(NS + k)) ?? d; } catch (e) { return d; } };
```

Always wrap access in `try/catch` — it throws in private mode and when storage
is full. An app must still render with no stored value.

Genuinely shared values use `webapps.shared.<name>` and must be documented here
before use. Currently shared: *(none)*.

## 4. Secrets — none in the repo, ever

The repo is public. No API keys, tokens, passwords, personal data, or private
addresses in any file, including comments and commit messages.

If an app needs an API key: the user pastes it into the app at runtime and it is
kept in `webapps.shared.<provider>Key`. Because the origin is shared, treat such
a key as readable by every app on the origin — use a scoped or limited key, never
a primary one. Also check the provider allows direct browser calls (CORS);
Anthropic's API requires the explicit `anthropic-dangerous-direct-browser-access`
header and is best avoided from a public page. Anything that must stay secret
needs a proxy (Cloudflare Worker), not a static page.

## 5. No service workers

The shared origin makes service-worker scopes overlap, and a stale cache means
the phone keeps showing an old version with no obvious fix. Apps here are
online-only.

If offline support is genuinely needed for one app, it gets its own repo instead.

## 6. One self-contained file per app

Default to a single `index.html` with inline CSS and JS. No build step, no
bundler, no `npm install` — Pages serves the file as-is, and a phone-driven edit
must not require a toolchain.

- No external CDNs, fonts, or scripts. System font stack, inline SVG, emoji.
- Extra files are allowed when a file gets unwieldy, but they stay inside the
  app's own folder and are referenced relatively.
- Every app declares `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
  and respects `env(safe-area-inset-*)`. These are phone-first apps.
- Minimum touch target 44×44 px.

## 7. Don't touch other apps

A change to one app touches exactly two things: its own folder, and at most its
own line in `apps.json`. Never reformat `apps.json` wholesale, never edit another
app's folder, never "tidy" the launcher while adding an app.

If the launcher itself needs a change, that is a separate commit with a message
saying so.

## 8. Commit discipline

GitHub Pages has a soft limit of ~10 builds/hour, and **every commit rebuilds the
whole site** — so tweaks to one app spend the build budget for all of them.

- Batch all files for one change into a **single commit**.
- Message format: `<slug>: <what changed>` (e.g. `turlogg: add GPS tracking`),
  or `launcher: …` / `registry: …` for the shared files.
- After pushing, expect 30–90 seconds before the change is live. If a change
  does not appear, wait and hard-reload before assuming it failed — do not push
  the same change again.

## 9. Verify before reporting done

After pushing, fetch the affected URL and confirm it actually renders. A commit
is not a deployment. Check `apps.json` parses as valid JSON — a stray comma
blanks the entire launcher.

## 10. Icons

The launcher art lives in `icons/icon.svg` and is the source of truth. The
manifest and `<link rel="icon">` use it directly.

iOS **cannot** use SVG for a home-screen icon — `apple-touch-icon` must be a
PNG. `icons/icon-180.png`, `icon-192.png`, `icon-512.png` and
`icon-maskable-512.png` are rendered from the SVG. If they are missing, iOS
falls back to a screenshot of the page, which looks wrong on the home screen.

Binary files cannot be written through the GitHub connector (it only sends
text). Pushing or regenerating PNGs requires a real `git push`, which means the
repo must be in the session's authorized sources. If a session cannot do that,
leave the PNG references in place and note it rather than switching the site to
SVG-only.

## 11. Deprecating an app

Do not delete the folder — old home-screen shortcuts would 404. Remove its entry
from `apps.json` so it stops appearing on the launcher, and leave the folder in
place. Note the removal in the commit message.
