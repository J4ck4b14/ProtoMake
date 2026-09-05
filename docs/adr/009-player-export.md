# ADR 009: Shared session composition and static game export

Accepted for Milestones 6–7.

GameSession owns runtime service composition for editor Play and the standalone player. The editor is excluded from the player's build graph, and the TypeScript compiler is kept in authoring tools. Exported scripts are linked ES modules with relative file imports. The game needs no authoring server or CDN.

A production player bundle is built during predev and build, with hashes for its files. Build ZIP validates project data and uses these exact files plus compiled project scripts. Dependency collection conservatively retains all scenes and assets because script references may be dynamic. Eliminating unused assets is deferred until explicit dependency declarations can make pruning reliable.

The browser produces standard store-only ZIPs. Its local production preview uses an origin-scoped Service Worker that intercepts only generated preview paths. The downloaded game has no Service Worker dependency. An independent CLI export and static preview server support testing without browser cache behavior.
