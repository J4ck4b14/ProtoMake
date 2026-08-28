# ADR 006: Fixed-step physics ownership and named input

Accepted at Milestone 3.

Rapier 2D 0.19.3 is isolated behind Physics2D. World units are creator-defined; the default gravity is 980 units/s² for pixel-sized scenes. Dynamic bodies own world position/rotation after each step; static and position-kinematic bodies read authored/runtime transforms before the step. Explicit teleport and velocity APIs avoid transform/physics contention. Body/collider component changes rebuild the body's configuration; per-step velocity control uses the physics API instead of rewriting authored initial velocity fields.

Box, circle and capsule colliders are explicit components and may coexist as compounds. Collider-only entities receive fixed bodies. Circle/capsule colliders require uniform scale, and all physics rejects zero scale and shear with an entity-specific error. Use a static root for physics hierarchies. Continuous collision detection is exposed. Contact events identify ProtoMake GUIDs and distinguish sensors; raycasts return ProtoMake GUIDs, normal, point and distance, excluding sensors by default. A debug toggle renders Rapier line geometry through the camera.

Project schema v3 adds gravity, layer names, a symmetric collision matrix and named input actions, migrating v1 through v2. Up to 16 physics layers use Rapier's membership/filter groups. Actions support keyboard codes, mouse buttons, gamepad buttons and signed axes with a 0.15 dead zone. Input releases on blur and keyboard input ignores editable controls. The editor Settings dialog configures these data; no raw key codes are required in game behavior.

Input is sampled once per host frame. Edge queries remain true throughout that frame and are cleared after all fixed and variable updates. Game behaviors should gate one-shot physics actions by state (such as groundedness), especially when several fixed substeps occur in one frame.

Actual Rapier/WASM tests exercise falling, landing, jumping through input actions, sensors, layer filtering, shape support, raycasts and cleanup. GPU debug drawing remains a browser acceptance item.
