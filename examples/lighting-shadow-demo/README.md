# Lantern Shadow & Stealth Lab

Import `lighting-shadow-demo.protomake.json` into ProtoMake 0.9. This is an authoring/regression scene, not a replacement for the bundled platformer/fighter/shooter prototypes.

It demonstrates:

- low static ambient fill;
- static, mixed and dynamic authored lights;
- per-light receiver channel masks (`World`, `Characters`, `Foreground`, `Effects`);
- shadow opacity, bias and softness;
- a dynamic point light parented to Player as a carried torch;
- sprite and explicit shadow-caster geometry;
- **Perception 2D** view-cone/debug authoring;
- a guard script using `ctx.canSee(...)` plus `ctx.illumination(...)` to accumulate detection.

In the Scene view, enable **Light debug** to inspect raw 0..1 illumination samples and live lighting cost/cache counters. Select a point/spot light and drag the circular range handle. Select the guard to see its view cone, target line and light-threshold readout.

Move the player in Play. Occlusion and darkness can now prevent detection even while the player is geometrically inside the guard’s view range.
