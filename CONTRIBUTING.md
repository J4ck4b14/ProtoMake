# Contributing

Work in the milestone order from the construction brief. Every subsystem must earn its place through working behavior and tests. Do not add future placeholder packages or decorative UI.

1. Install with `npm ci`.
2. Define the data contract and acceptance behavior before implementation.
3. Keep changes within the documented dependency graph.
4. Add focused tests for invariants and regressions. Transform, schema, identity and lifecycle changes require tests.
5. Run `npm run format`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
6. Open the browser harness and verify its controls if browser integration changes.
7. Update documentation to describe actual behavior and limitations. Add an ADR for a meaningful architecture decision.

TypeScript is strict, with unchecked-index and exact-optional-property checks. Avoid `any`, mutable global services and implicit lifecycle ownership. Comments should explain invariants, trade-offs or edge cases. Dependency versions are exact and `package-lock.json` is committed.

Engine release versions and schema versions are independent. When changing a public schema incompatibly, increase its schema version, register the one-step migration, and test old-to-new and chained upgrades. Do not invent fake legacy schemas to demonstrate infrastructure.

Exporter changes must begin at the Interchange capability contract, preserve deterministic ProtoMake GUID mappings, use the central coordinate profiles, and add golden mapping/diagnostic tests. Never silently omit a lowered item, write undocumented native serialization formats, or modify creator-owned target files.

CI runs install, typecheck, lint/format/boundaries, tests and production build. It is configured here; a remote CI run only exists after this repository is pushed to a GitHub host.
