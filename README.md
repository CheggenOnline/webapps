# webapps

Launcher and host for small personal web apps.

**Live site: https://cheggenonline.github.io/webapps/**

Add that page to your phone's home screen and it becomes the entry point to
everything listed in [`apps.json`](apps.json).

## Layout

```
index.html                 launcher — renders itself from apps.json
apps.json                  the registry: one entry per app
manifest.webmanifest       PWA manifest for the launcher
icons/                     launcher icons
_template/index.html       starter file for a new app
CONVENTIONS.md             the rules — read before changing anything
.nojekyll                  serve files verbatim, no Jekyll
<slug>/index.html          one folder per app hosted here
```

## Adding an app

1. Copy `_template/index.html` to `<slug>/index.html`.
2. Append an entry to `apps.json`.
3. Commit once.

Full rules, including the non-obvious ones about shared `localStorage` and
relative paths, are in **[CONVENTIONS.md](CONVENTIONS.md)**.

## Notes

- The repo is public. Nothing secret goes in it.
- Apps are online-only, single-file, no build step, no dependencies.
- Every commit rebuilds the whole site, so changes are batched.
