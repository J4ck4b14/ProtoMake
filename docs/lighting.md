# 2D lighting and shadows

Add **Light 2D** to an entity. ProtoMake supports ambient, point, spot and rectangular area lights. Color and intensity apply to every type. Point lights use range and falloff; spots add inner/outer full cone angles in degrees; area lights use width and height plus range outside the rectangle. A spot faces local +X, so rotate its Transform to aim it. Light position and direction inherit the hierarchy; range/size are world units and do not inherit Transform scale.

## Mobility

Each light has a **Mobility** mode:

- **static** — its authored light definition (Transform plus Light 2D properties) and shadow-caster geometry are snapshotted when runtime rendering begins. Use it for architectural lights and world geometry that will not move.
- **mixed** — its authored light definition is snapshotted, but shadows are recomputed from live caster positions. Use it for fixed lamps that illuminate moving actors.
- **dynamic** — the light definition and shadow geometry are evaluated live. Use it for carried torches, projectiles and moving machinery.

The editor invalidates those snapshots whenever authored project data changes, so static/mixed lights remain editable. Play and exported games intentionally keep the runtime snapshot until the scene is recreated.

## Surface lighting

With at least one active light, the Pixi scene receives a screen-space light surface instead of a single tint sampled at each sprite centre. This gives visible gradients across large floors/walls and makes a moving point light read as an actual moving pool of light. Multiple lights add together and the result is multiplied over the rendered scene. Ambient light fills the camera view uniformly. A scene with no active lights keeps its legacy appearance exactly.

Point attenuation is `(1 - distance/range)^falloff` inside range. Spots additionally blend from the inner to outer cone. Area lights emit from a rotated rectangle with a soft range outside it. The renderer remains deliberately LDR: contributions can saturate and there is no bloom, normal-map response or physically based energy model.

Sprites with **Lit** unchecked opt out of the light surface, useful for HUD-like world sprites and emissive signs. Lit sprites also choose one bounded receiver channel: `World`, `Characters`, `Foreground` or `Effects`. Each light has a matching channel mask, so a character-only lamp does not spend or contribute light on world receivers.

The Scene toolbar **Light debug** mode overlays raw 0..1 samples for a selected channel and reports static/mixed/dynamic light counts, caster tests, static-cache hits/misses, rendered channels and lighting render time. Static contributions are cached for a stable camera/view and invalidated by authoring edits.

## Shadow casters

A Sprite Renderer has **Cast Shadow**. When enabled, its transformed sprite rectangle blocks non-ambient lights. For invisible geometry or a caster shape that should not match the visible sprite, add **Shadow Caster 2D** and set width, height and offsets. An explicit Shadow Caster on an entity takes precedence over that entity's sprite rectangle.

Each Light 2D can disable shadows or tune **Shadow opacity**, **Shadow bias** and **Shadow softness**. Bias moves the projected hull slightly away from the light-facing caster edge to reduce contact artefacts; softness adds a bounded screen-space blur. Shadow Caster 2D also has a receiver-channel mask, so one blocker can occlude only the channels you intend.

Shadows remain projected 2D rectangle occlusion rather than normal-mapped or volumetric shadows. Transparent pixels inside a sprite still use its rectangular caster unless you author separate caster geometry. Ambient light is never shadowed, which makes a dim ambient fill plus punctual lights a practical dungeon setup.

## Stealth / visibility queries

Rendering and gameplay share the same light attenuation and rectangle-occlusion rules. Project scripts can query:

```ts
const exposure = ctx.illumination(); // this entity's centre, 0..1
const doorway = ctx.lightAt(480, 192, 'World'); // arbitrary world point/channel, 0..1
const visible = ctx.canSee(playerId, 450, 90); // range + FOV + caster line-of-sight

if (exposure < 0.18) {
  // e.g. reduce an enemy's detection probability/range
}
```

`ctx.illumination(entity?)` ignores the sampled entity's own caster so an actor does not shadow its own centre and automatically uses that sprite's lighting channel. `ctx.lightAt(x, y, channel?)` is a raw point query and can be occluded by any matching caster. `ctx.canSee(target, range?, fovDegrees?, observer?)` combines distance, the observer's local +X facing cone and the same caster geometry used by lighting. If a scene has no lights, illumination queries return the legacy fully-lit value `1`.

This is a useful foundation for stealth, but ProtoMake does not prescribe detection logic: combine illumination with distance, facing/FOV, line-of-sight, sound and game-specific thresholds in project scripts.

## Practical dungeon recipe

A useful starting stack is one low-intensity ambient light for minimum visibility, static/mixed point or area lights for sconces, and a dynamic point/spot light parented to the player for a handheld torch. Enable Cast Shadow on walls/pillars, or use Shadow Caster 2D for invisible blockers. Keep the ambient contribution low enough that the punctual lights and shadows remain legible.
