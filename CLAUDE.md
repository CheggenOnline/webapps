# Instructions for Claude working in this repo

This repo is one GitHub Pages site hosting many small phone-first web apps plus a
launcher page. Live at https://cheggenonline.github.io/webapps/

**Read `CONVENTIONS.md` before making any change.** It is the full rulebook. The
rules below are the ones that cause real breakage, repeated here because this
file is loaded automatically and that one is not.

## Adding a new app — the whole job

1. Pick a permanent `slug`: lowercase, `a-z0-9-`, no spaces or `æøå`.
2. Copy `_template/index.html` to `<slug>/index.html` and build the app there.
3. Append one entry to the `apps` array in `apps.json` (format in CONVENTIONS.md §1).
4. Commit **once**, with everything in it. Message: `<slug>: <what changed>`.
5. Fetch the live URL and confirm it renders before reporting done. A commit is
   not a deployment; allow 30–90 seconds.

The launcher renders its tiles from `apps.json`. **Never hand-edit tile markup in
`index.html`** — if a tile is wrong, the registry entry is wrong.

## Hard rules

- **Relative paths only.** The site is served from `/webapps/`, not the domain
  root, so `/style.css` 404s. Use `./style.css`.
- **Namespace every localStorage key** as `webapps.<slug>.<key>`. Every app on
  `cheggenonline.github.io` shares one origin and therefore one localStorage; an
  un-namespaced key silently collides with another app. Wrap access in try/catch.
- **No secrets.** This repo is public. No API keys, tokens, or personal data in
  any file, comment, or commit message.
- **No service workers.** Shared origin makes their scopes overlap and a stale
  cache is unfixable from a phone. Apps here are online-only.
- **One self-contained `index.html` per app.** Inline CSS and JS, no build step,
  no CDNs, no npm. Phone-first: `viewport-fit=cover`, safe-area insets, 44px
  minimum touch targets.
- **Don't touch other apps.** A change touches its own folder and at most its own
  line in `apps.json`. Never reformat `apps.json` wholesale.
- **Batch into one commit.** Every commit rebuilds the whole site and Pages
  throttles at ~10 builds/hour.

## Reserved slugs

`icons`, `assets`, `shared`, `docs`, `api`, `_template`, `tools`, `.github`

## Deprecating an app

Remove its entry from `apps.json` but leave the folder in place — old home-screen
shortcuts would otherwise 404.
