# ProtoMake 0.9.3 public-alpha launch pass

ProtoMake 0.9.3 turns the certified 0.9.2 editor into a zero-cost static-hosting release without changing project schema v4.

## Author-facing storage UX

- **Save locally** writes the complete project to IndexedDB for the current browser origin.
- **Open local** lists those explicit local saves and their last-update time.
- **Export backup** downloads a portable `.protomake.json` project.
- **Import project** accepts `.protomake.json`/JSON and validates it before replacing the current editor state.
- A first-run storage notice explains that local browser persistence is not a portable backup and points authors to export/import for cross-device continuity.
- Existing rotating recovery snapshots and before-unload emergency recovery remain separate from explicit saves.

This design makes accounts optional: GitHub Pages can host the complete editor while authors move projects between devices manually with `.protomake.json` files.

## Static deployment

- Vite uses a relative production base so builds work below a repository path such as `/ProtoMake/`.
- `.github/workflows/pages.yml` performs clean install, typecheck, lint/boundary verification, all tests, production build, and GitHub Pages deployment from `dist/`.
- `public/.nojekyll` is included in the static output.
- The account backend is not required for the public alpha and is not part of the Pages deployment.

See [GitHub Pages deployment](github-pages.md).

## Repository-history documentation

`docs/git-history.md` documents the previously unexplained reflog-style lines from the development repository, including old/new object IDs, Git identity, Unix timestamps, timezone offsets and reflog messages. `HISTORY.md` preserves the useful milestone story as normal repository documentation because reflogs themselves are local `.git` metadata and are not pushed.
