# Project scripting — ProtoMake 0.10

Create a TypeScript asset from **Assets → + Script**, or double-click an existing `.ts` asset to open it directly. Compile, Save, then Attach to selection. Each attachment creates a stable behaviour slot with its own enabled state, script asset reference and exposed values. An entity can own any number of script behaviours. Replacing one slot's script resets only that slot's exposed overrides.

The in-editor source workspace supports line numbers, syntax colour, live diagnostics, `ctx.*` completion, a searchable ProtoMake API reference and protected drafts. Every behaviour card exposes **Open script** directly from the Inspector. A script exports a default class with optional lifecycle methods. Runtime services arrive through `ScriptContext`:

```ts
import type { ScriptContext } from '@protomake/scripting';

export const fields = {
  speed: {
    type: 'number',
    default: 80,
    label: 'Move speed',
    min: 0,
    max: 500,
    step: 5,
    help: 'World units per second',
  },
} as const;

export default class Drift {
  speed = 80;
  update(ctx: ScriptContext) {
    const [x, y] = ctx.position();
    ctx.setPosition(x + this.speed * ctx.delta, y);
  }
}
```

Use `update` for variable-step work and `fixedUpdate` for physics control. Exposed field overrides live inside their behaviour slot, are applied before `awake`, and remain independent when the same script is attached more than once. Entity references use stable scene UUIDs; duplication remaps references internal to the copied group.

## Lifecycle

An instance runs awake once on creation, onEnable when active, then start once on first activation. Each engine phase invokes the corresponding fixedUpdate/update/lateUpdate on active instances. Enable transitions invoke onEnable/onDisable. Removing an entity or script invokes onDisable when needed, then onDestroy. Stop performs reverse teardown while physics is still available. Failed callbacks stop execution with script/entity/hook context; failures are not swallowed.

Physics events call onCollisionEnter/onCollisionExit or onTriggerEnter/onTriggerExit with `(ctx, event)`. `event` contains ProtoMake GUIDs `a`, `b`, `started` and `sensor`. A trigger script is responsible for deciding which participant matters to its game logic.

## Public context

| API                                                            | Purpose                                                                                   |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `ctx.entity`                                                   | This instance's stable entity GUID                                                        |
| `ctx.position(id?)`                                            | World position, defaulting to self                                                        |
| `ctx.illumination(id?)`                                        | Occlusion-aware perceptual light at an entity centre (0..1); ignores that entity's caster |
| `ctx.lightAt(x, y, channel?)`                                  | Occlusion-aware perceptual light at an arbitrary world point/channel (0..1)               |
| `ctx.canSee(target, range?, fov?, observer?)`                  | Distance + local-facing FOV + shadow-caster line-of-sight primitive                       |
| `ctx.setPosition(x, y, id?)`                                   | Position update; kinematic bodies receive a next-step target, dynamic bodies teleport     |
| `ctx.get<T>(type, id?)` / `ctx.set(type, data, id?)`           | Read an immutable component snapshot / validate and replace it                            |
| `ctx.world`                                                    | Entity creation/destruction, component registration consumers and explicit transform APIs |
| `ctx.find(name)`                                               | First matching entity GUID; use exposed GUID references when names are ambiguous          |
| `ctx.entities.withTag/withComponent/withComponents`            | Indexed runtime queries returning stable entity GUIDs                                     |
| `ctx.entities.closestWithTag/inRadius`                         | Spatial entity queries                                                                    |
| `ctx.events.emit/on`                                           | Named project signals with automatic behaviour-lifetime cleanup                           |
| `ctx.time.after/every/cancel`                                  | Pause-aware runtime timers owned by the behaviour                                         |
| `ctx.tween.to/cancel`                                          | Shared position, rotation, scale and opacity tween service                                |
| `ctx.prefabs.instantiate/destroy`                              | Runtime prefab creation and safe hierarchy destruction                                    |
| `ctx.pointer.screenPosition/worldPosition/delta/wheel`         | Pointer state in screen and active-camera world coordinates                               |
| `ctx.camera.screenToWorld/worldToScreen`                       | Explicit active-camera coordinate conversion                                              |
| `ctx.camera.shake/kick/zoomPulse`                              | Composable impact camera effects                                                          |
| `ctx.particles.emit(entity?, count?)`                          | Bounded burst from a Particle Emitter 2D                                                  |
| `ctx.body.velocity/setVelocity/impulse/teleport`               | Concise rigid-body controls without adapter handles                                       |
| `ctx.input.getVector/getAxis/isPressed/wasPressed/wasReleased` | Named input actions                                                                       |
| `ctx.physics.velocity/setVelocity/impulse/teleport/raycast`    | ProtoMake physics API; no Rapier handles                                                  |
| `ctx.loadScene(idOrName)`                                      | Queue a validated scene transition after the current frame                                |
| `ctx.session.get/set/has/delete/clear`                         | Share cloned, volatile run state across scene transitions; cleared when Play ends         |
| `ctx.log(text)`                                                | Contextual editor Console log                                                             |
| `ctx.delta` / `ctx.elapsed`                                    | Seconds for the current fixed or variable phase                                           |

## Compilation and trust

The installed TypeScript 5.9.3 compiler transpiles project source to ES modules in-browser. Blob module URLs are linked in dependency order and revoked when replacing the runtime. Relative `.ts` imports, extensionless imports and `.js` specifiers that refer to local `.ts` files are supported. Cycles and missing imports fail explicitly. External runtime packages, dynamic imports, require and dynamic code evaluation are unsupported. Node APIs are unavailable in the browser.

The browser compiler reports syntax, metadata and module-link errors; it does **not** perform a complete semantic TypeScript program check. Use an external TypeScript editor/tsc for that. Repository source and checked-in examples are strictly typechecked in CI.

Project code runs only when Play loads modules. The same-origin iframe gives a separate runtime world, globals and teardown context. It is not a security sandbox: trusted project code has browser capabilities, can access the parent origin, and may block the tab if it loops indefinitely. Only run trusted projects. Importing JSON and inspecting metadata does not execute project source.

During Play, scripts may be edited and saved, then **Recompile** validates a fresh module graph and restarts the active scene. Stateful in-place class replacement and external-package bundling are deferred.

## Animation and audio services (Milestone 6)

ScriptContext now provides `setParameter`, `trigger`, `animationState`, `playAudio`, `pauseAudio`, `stopAudio` and `setBus`. These use the same runtime services in editor Play and standalone exports. See [animation/audio](animation-audio.md) for signatures and examples.
