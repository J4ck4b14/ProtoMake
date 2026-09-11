# Zero-cost GitHub Pages deployment

ProtoMake's editor and exported games are static web applications after `npm run build`. A public alpha therefore does **not** require a domain, VPS, Raspberry Pi, or account backend.

## What works with no backend

The GitHub Pages build supports:

- the complete ProtoMake editor;
- local project saves in IndexedDB;
- the rotating recovery journal;
- portable `.protomake.json` project export/import;
- Play mode;
- static game ZIP builds and previews;
- the checked-in examples and standalone player bundle.

Cloud/account sync remains optional and will only work when a separate reachable account server is configured.

## Storage model on GitHub Pages

**Save locally** stores the project in IndexedDB for the page's browser origin. This is persistent convenience storage, not a portable backup. Clearing site data, private/incognito browsing, browser resets, or moving to another origin can make those saves unavailable.

GitHub Pages project sites normally use an address like:

```text
https://YOUR_USERNAME.github.io/YOUR_REPOSITORY/
```

IndexedDB is scoped to the **origin** (`https://YOUR_USERNAME.github.io`), not the repository path. Keep **Export backup** as the durable/cross-device workflow. A `.protomake.json` file can be copied to another computer or phone and reopened with **Import project**.

## Publish

1. Create a public GitHub repository and put ProtoMake at its repository root (where `package.json` lives).
2. Push the repository to the `main` branch.
3. In GitHub, open **Settings → Pages** and select **GitHub Actions** as the source if it is not already selected.
4. The checked-in `.github/workflows/pages.yml` workflow installs dependencies, runs typecheck/lint/tests, builds ProtoMake, uploads `dist/`, and deploys it.
5. Open the URL shown by the `github-pages` deployment. No custom domain is required.

The workflow also supports **Actions → Deploy ProtoMake to GitHub Pages → Run workflow** for a manual redeploy.

## Why the Vite base is relative

`vite.config.ts` uses `base: './'`. Generated assets therefore resolve relative to each built HTML page instead of assuming the site is hosted at domain root `/`. That makes the same `dist/` suitable for a GitHub project page such as `/ProtoMake/` and for ordinary static hosting later.

## Local certification before the first push

First apply the dev-tool security updates identified during the 0.9.2 audit and let npm regenerate `package-lock.json`:

```sh
npm install --save-dev vite@7.3.6 vitest@4.1.11 esbuild@0.28.2
```

Then run:

```sh
npm run format
npm run typecheck
npm run lint
npm test
npm run build
npm audit
```

Commit the resulting `package.json` and `package-lock.json` only after those checks are green. Do not use `npm audit fix --force` as a substitute for targeted upgrades.

The repository's CI and Pages workflows then repeat the non-mutating verification on GitHub. Never deploy Vite's development server (`npm run dev` / `vite --host`) as the public website; deploy the generated `dist/` files.

## Moving or renaming the site

Before changing GitHub username, Pages origin, or moving ProtoMake to another host, export important projects. Browser-local project storage does not automatically migrate between origins. Portable `.protomake.json` exports are independent of the hosting URL.
