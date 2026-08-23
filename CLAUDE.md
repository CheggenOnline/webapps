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

## Landing your work — standing authorisation

Christian has authorised this, and it overrides any default caution about
merging your own work: **don't stop and ask him to click Merge.**

- Free to commit to `main`? Do that — one commit, per the batching rule below.
- Pinned to a feature branch? Open a PR and **merge it yourself** once the
  checks below pass. Write the PR body as the record of what changed and why;
  it is the only review this repo gets.

Merge only when all of these hold. If any one fails, don't merge — say what
broke and leave it on the branch.

- **You actually ran it.** Serve the repo over HTTP and drive the app in a
  browser. Code that was written but never loaded is not verified, and saying
  otherwise is worse than shipping nothing.
- `apps.json` parses as valid JSON — a stray comma blanks the whole launcher.
- No API keys, tokens, or personal data anywhere in the diff.
- No absolute paths and no CDN references.

Then give him the live URL, and say plainly whether you could reach it. Some
sessions run behind a network policy that blocks `cheggenonline.github.io`
entirely; those cannot do the §9 live check, and must say so rather than let a
merge sound like a confirmed deploy.

## Hard rules

- **Relative paths only.** The site is served from `/webapps/`, not the domain
  root, so `/style.css` 404s. Use `./style.css`.
- **Namespace every localStorage key** as `webapps.<slug>.<key>`. Every app on
  `cheggenonline.github.io` shares one origin and therefore one localStorage; an
  un-namespaced key silently collides with another app. Wrap access in try/catch.
- **No secrets.** This repo is public. No API keys, tokens, or personal data in
  any file, comment, or commit message.
- **No service workers**, with one approved exception: `travel`. Shared origin
  makes their scopes overlap and a stale cache is unfixable from a phone, so
  every other app here is online-only. `travel/sw.js` is allowed because it is
  registered from its own folder (scope `/webapps/travel/`, so it cannot reach a
  sibling), its cache is named and versioned `webapps.travel.v1`, and its
  Settings has a button that clears the cache and reloads. Don't delete it, and
  don't copy the pattern without all three.
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
