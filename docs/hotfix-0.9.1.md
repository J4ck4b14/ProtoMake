# ProtoMake 0.9.1 hotfix

This hotfix responds to the first clean Windows certification run of ProtoMake 0.9.

- Renames the invalid `protomake.shadowCaster` component identifier to the registry-compliant `protomake.shadow-caster`.
- Preserves compatibility with projects/recovery snapshots and prefab documents authored with the brief 0.9.0 camelCase identifier; validation canonicalizes them automatically.
- Imports Node `Buffer` and `URL` explicitly in the optional account server so ESLint does not depend on ambient globals.
- Removes the `python3` dependency from ZIP export tests. The replacement TypeScript reader validates ProtoMake's store-only ZIP structure, CRC32 values, UTF-8 names, central-directory offsets/counts and byte preservation on every supported development OS.
- Adds a regression test for legacy shadow-caster canonicalization.
- Updates Vite from `7.3.1` to `7.3.2`, the patched 7.x release for CVE-2026-39363. This matters to ProtoMake because the optional LAN/mobile workflow intentionally exposes the Vite development server to the local network.

The first 0.9.0 certification already demonstrated a successful clean dependency install, semantic typecheck and production build on Windows. Re-run the complete gate for this hotfix:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Do not use `npm audit fix --force` blindly for the audit warnings from installation; inspect `npm audit` and update affected dependencies deliberately because forced major/transitive changes can alter the editor/runtime toolchain.
