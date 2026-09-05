# Project scripting — Milestone 4

Open Scripts, create/select a `.ts` asset, Compile, Save, then Attach to selection. ScriptBehaviour's script field stores the durable asset UUID. Each entity currently supports one script component; multiple local modules can compose a behavior. Replacing the attached script resets its exposed overrides through the Attach action.

A script exports a default class with optional lifecycle methods. It can import ProtoMake **types**, which are erased by TypeScript compilation. Runtime services arrive through ScriptContext:

```ts
import type { ScriptContext } from '@protomake/scripting';

export const fields = {
  speed: { type: 'number', default: 80 },
} as const;

export default class Drift {
  speed = 80;
  update(ctx: ScriptContext) {
    const [x, y] = ctx.position();
    ctx.setPosition(x + this.speed * ctx.delta, y);
  }
}
```

Use update for variable-step work and fixedUpdate for physics control. Exposed fields are static literal metadata; supported kinds are number, boolean, string, color, entity and asset. Defaults are validated without executing source. Numeric/string/boolean overrides are persisted under ScriptBehaviour.values, applied before awake, and shown in the Inspector. Entity references use stable scene UUIDs; duplicates remap references internal to the copied group.

## Lifecycle

An instance runs awake once on creation, onEnable when active, then start once on first activation. Each engine phase invokes the corresponding fixedUpdate/update/lateUpdate on active instances. Enable transitions invoke onEnable/onDisable. Removing an entity or script invokes onDisable when needed, then onDestroy. Stop performs reverse teardown while physics is still available. Failed callbacks stop execution with script/entity/hook context; failures are not swallowed.

Physics events call onCollisionEnter/onCollisionExit or onTriggerEnter/onTriggerExit with `(ctx, event)`. `event` contains ProtoMake GUIDs `a`, `b`, `started` and `sensor`. A trigger script is responsible for deciding which participant matters to its game logic.

## Public context

| API                                                            | Purpose                                                                                   |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `ctx.entity`                                                   | This instance's stable entity GUID                                                        |
| `ctx.position(id?)`                                            | World position, defaulting to self                                                        |
| `ctx.setPosition(x, y, id?)`                                   | Position update; kinematic bodies receive a next-step target, dynamic bodies teleport     |
| `ctx.get<T>(type, id?)` / `ctx.set(type, data, id?)`           | Read an immutable component snapshot / validate and replace it                            |
| `ctx.world`                                                    | Entity creation/destruction, component registration consumers and explicit transform APIs |
| `ctx.find(name)`                                               | First matching entity GUID; use exposed GUID references when names are ambiguous          |
| `ctx.input.getVector/getAxis/isPressed/wasPressed/wasReleased` | Named input actions                                                                       |
| `ctx.physics.velocity/setVelocity/impulse/teleport/raycast`    | ProtoMake physics API; no Rapier handles                                                      |
| `ctx.loadScene(idOrName)`                                      | Queue a validated scene transition after the current frame                                |
| `ctx.log(text)`                                                | Contextual editor Console log                                                             |
| `ctx.delta` / `ctx.elapsed`                                    | Seconds for the current fixed or variable phase                                           |

## Compilation and trust

The installed TypeScript 5.9.3 compiler transpiles project source to ES modules in-browser. Blob module URLs are linked in dependency order and revoked when replacing the runtime. Relative `.ts` imports, extensionless imports and `.js` specifiers that refer to local `.ts` files are supported. Cycles and missing imports fail explicitly. External runtime packages, dynamic imports, require and dynamic code evaluation are unsupported. Node APIs are unavailable in the browser.

The browser compiler reports syntax, metadata and module-link errors; it does **not** perform a complete semantic TypeScript program check. Use an external TypeScript editor/tsc for that. Repository source and checked-in examples are strictly typechecked in CI.

Project code runs only when Play loads modules. The same-origin iframe gives a separate runtime world, globals and teardown context. It is not a security sandbox: trusted project code has browser capabilities, can access the parent origin, and may block the tab if it loops indefinitely. Only run trusted projects. Importing JSON and inspecting metadata does not execute project source.

Rebuild workflow is Stop → edit/save → Play. Each Play starts a fresh module graph and runtime. Stateful hot reload, multiple script slots per entity and external-package bundling are deferred.

## Animation and audio services (Milestone 6)

ScriptContext now provides `setParameter`, `trigger`, `animationState`, `playAudio`, `pauseAudio`, `stopAudio` and `setBus`. These use the same runtime services in editor Play and standalone exports. See [animation/audio](animation-audio.md) for signatures and examples.
