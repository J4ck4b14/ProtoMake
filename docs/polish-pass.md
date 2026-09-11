# ProtoMake 0.8 — lighting, authoring and continuity polish

This pass finishes the requested lighting/shadow, editor appearance, in-editor scripting, account continuity and mobile-workspace work without changing the local-first project format.

## Lighting and shadows

- Light 2D supports **static**, **mixed** and **dynamic** mobility.
- Point, spot and rectangular area lights now illuminate a screen-space surface with spatial falloff instead of tinting each sprite from a single centre sample.
- Sprite Renderer exposes **Cast Shadow**; **Shadow Caster 2D** provides invisible or independently-sized rectangular caster geometry.
- Ambient light is intentionally unshadowed so a low ambient fill can coexist with punctual lights in dark scenes.
- Static lights snapshot their authored light definition and caster geometry at runtime. Mixed lights snapshot the light definition while evaluating live casters. Dynamic lights evaluate both live.
- `ctx.illumination(entity?)` and `ctx.lightAt(x, y)` expose the same attenuation/occlusion model to project scripts for stealth, visibility and other gameplay decisions.
- Projects with no active lights retain the previous fully-lit rendering path.

Import `examples/lighting-shadow-demo/lighting-shadow-demo.protomake.json` for a compact dungeon-style reference scene.

## Editor authoring

- TypeScript files can be created from Assets and opened by double-clicking `.ts` assets.
- The script editor supports Compile, Save, Attach to selection, and Ctrl/Cmd+S.
- Unsaved script text is kept as a browser-local draft and offered again when that script is reopened.
- Settings exposes editor **accent** and **surface** colours. Foreground, border and focus colours are derived automatically for readable contrast.

## Mobile workspace

At `800px` CSS width or below, the desktop split layout becomes a touch-sized single-panel workspace with Hierarchy, Scene, Inspector, Project, Console and Assets tabs. Scene adds explicit Pan, zoom and Frame controls. Larger screens keep the existing resizable desktop layout.

## Optional account continuity

ProtoMake remains local-first: IndexedDB saves and JSON import/export do not require an account. An optional reference account server adds cross-browser/device project continuity with authenticated per-user projects and revision-conflict protection.

Development commands:

```bash
npm run dev:account
```

For testing from a phone on the same trusted LAN:

```bash
PROTOMAKE_HOST=0.0.0.0 npm run dev:account
```

Open the computer's LAN address from the phone. The Vite `/api` proxy keeps the account API same-origin during development. See `docs/account-sync.md` for deployment settings and security limitations; the included server is a small reference backend, not a production identity platform.

## Validation notes

Dependency-independent checks in this release cover TypeScript syntax/transpilation, package boundaries, account-server syntax, lighting/occlusion math, appearance contrast logic, project JSON parsing and concurrent revision-conflict behavior. The account backend was exercised through sign-up, save, load, revision advance and stale/concurrent-write rejection.

The lighting/occlusion model, appearance contrast logic, project serialization, package boundaries and account revision-conflict behavior are covered by release checks. Full certification is performed with a clean dependency install followed by formatting, strict typecheck, lint/package-boundary checks, the automated suite and both production builds.
