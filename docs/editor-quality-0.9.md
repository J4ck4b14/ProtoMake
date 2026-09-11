# ProtoMake 0.9 — Editor Quality

ProtoMake 0.9 deliberately freezes broad engine expansion and concentrates on authoring reliability, visual feedback and the cost model of systems that already exist.

## Project safety

- Existing snapshot-based undo/redo remains the single command history for project edits and gestures.
- Dirty state is still derived from the serialized project, not from a fragile manual flag.
- A rotating IndexedDB recovery journal keeps up to ten autosave/checkpoint snapshots per project.
- A project-scoped synchronous emergency `localStorage` snapshot is written immediately after dirty edits when browser quota permits, covering the gap before IndexedDB's debounced autosave completes without one open project overwriting another project's emergency slot.
- On startup, a recovery newer than the explicit saved project is surfaced with **Restore**, **Compare** and **Discard**. Restoring keeps the project dirty until the author explicitly saves.

## Visual authoring and gizmos

Scene view gizmos now visualize:

- Point/spot/area light volumes. Point/spot range is draggable directly in the Scene view.
- Sprite and explicit Shadow Caster 2D geometry.
- Box, circle and capsule colliders; sensors use a distinct dashed trigger style.
- Camera viewport framing.
- Perception 2D view cones, target lines and current light-threshold preview.

Two-finger pinch zoom is supported alongside touch pan/zoom/frame controls.

## Lighting quality and performance

Lighting has four bounded receiver channels: `World`, `Characters`, `Foreground` and `Effects`.

- Sprite Renderer selects one receiver channel.
- Light 2D has a channel mask.
- Shadow Caster 2D has a channel mask.
- Lights expose shadow opacity, projection bias and optional edge softness.
- Static light definitions and static caster geometry are frozen in runtime and cached per view/channel.
- Mixed lights keep their authored light definition fixed while evaluating current occluders.
- Dynamic lights evaluate current light and caster state.

The Scene toolbar **Light debug** mode draws raw illumination samples and reports lights by mobility, caster tests, static-cache hit/miss counts, rendered channels and lighting render time.

## Perception primitives

ProtoMake does not hard-code a stealth ruleset. It supplies composable primitives:

- `ctx.canSee(target, range?, fovDegrees?, observer?)` — range + view cone + shadow-caster line of sight.
- `ctx.illumination(entity?)` — the same occlusion-aware 0..1 light exposure used by rendering/gameplay.
- `ctx.lightAt(x, y, channel?)` — arbitrary world-point lighting query.
- Optional **Perception 2D** data gives designers an Inspector-authored target/range/FOV/light threshold and Scene-view preview. Alert accumulation stays in project scripts.

`examples/lighting-shadow-demo/` contains a guard script that combines `canSee` and `illumination` without coupling the engine to one stealth design.

## Scripting authoring

The in-editor TypeScript workflow now provides:

- line numbers and syntax colour;
- live syntax diagnostics with click-to-jump errors;
- `ctx.*` completion and searchable ProtoMake API reference;
- script templates for Behaviour, Trigger, Character Controller, Interaction, UI Controller and Stealth Guard;
- protected local drafts;
- Ctrl/Cmd+S;
- Inspector **Open script** from Script Behaviour;
- exposed field metadata for labels, help, min/max/step and string options;
- Console **Open error** links when a diagnostic includes a project script path/line/column.

The browser editor intentionally remains lightweight: whole-program semantic TypeScript analysis still belongs to the repository `tsc` gate or an external IDE.

## Account continuity hardening

The optional reference server now also has:

- expiring in-memory bearer sessions and explicit session revocation on sign-out;
- bounded authentication attempts;
- password length bounds;
- per-user project-count and per-project payload quotas;
- security-oriented response headers;
- serialized account/project mutations and stale-revision rejection;
- cloud responses that omit server-internal ownership records, with sync sessions/revisions cleared whenever the configured server endpoint changes.

It is still a reference self-hosted service, not a replacement for a production identity/storage platform. Public deployment still needs HTTPS, persistent session/database strategy, backups, migrations and password recovery/email verification according to the operator's requirements.

## Mobile/tablet intent

The mobile workspace remains deliberately authoring-focused rather than cloning a dense desktop IDE onto a phone. Scene navigation supports touch/pinch; panels become tabs; controls are coarse-pointer sized; the script editor collapses to a single-column workspace. Tablet + keyboard remains the preferred small-screen full-authoring target.

## Regression projects

ProtoMake continues to ship the three distinct ProtoMake-authored prototypes used as practical regression targets: platformer, shooter and local fighter. The Lantern Shadow & Stealth Lab is an additional focused lighting/perception regression project.
