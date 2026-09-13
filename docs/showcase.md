# Flagship showcase

## The Luminous Vault: Blackward

Blackward is ProtoMake's complete vertical slice: a three-room action-platforming dungeon in which darkness, combat, inventory and traversal form one continuous run.

The Black Gate teaches melee combat under the player's short carried light. Its eastern threshold loads the Drowned Gallery, where the Arc Caster and two remote wards open a vertical route. The Reliquary combines both weapons against three sentinels and a Warden; clearing it reveals the Vault Key and powers the final aperture. Every threshold can be crossed in reverse, with the player returning at the correct side.

The run includes:

- zero-intensity static ambient lights that force unlit space to pure black;
- a 152-pixel dynamic lantern parented to the player;
- a lantern tradeoff: opening it increases sentinel acquisition range, while shuttering it sacrifices sight for stealth;
- no more than three tiny authored lights in any room;
- emissive enemy shots with 48-pixel transient red glows;
- weak point and spot hints, dynamic ward lights and a reward-state area light;
- layered, visibly lit masonry, arches, chains, water details, world surfaces and platforms;
- shadow-casting floors, columns, arches and ceiling geometry;
- melee hitboxes, ranged and hostile projectile pools, solid-geometry impacts, health and ammunition;
- telegraphed sentinel attacks and a three-shot Warden volley;
- multiweapon inventory, one-use pickups and explicit room/objective UI;
- jump buffering, coyote time, hazards and staged platforming;
- sprite animation, pooled particles, eight distinct synthesized effects, camera shake, kick and zoom feedback;
- faded bidirectional scene traversal with volatile run state that survives scene loads;
- a `vaultbreaker` achievement for completing all three rooms.

Nothing in the engine recognizes this dungeon specially. Its rules are the ordinary editable `Assets/Scripts/Showcase.ts` behaviour embedded in `examples/prototypes/showcase/showcase.protomake.json`; all three scenes use standard ProtoMake entities and components. The general-purpose `ctx.session` service shares structured-cloned state between scene instances and is cleared when Play ends.

## Run and inspect

After `npm ci`, run `npm run dev`. Use **Play showcase** to load and start the game immediately, or **Edit showcase** to inspect its complete project before pressing **Play**. A production `npm run build` also publishes a standalone copy at `./showcase/` beside the editor, including on GitHub Pages.

For a local launcher containing the flagship plus the three narrow teaching labs, run `npm run build:prototypes` followed by `npm run preview:prototypes`.

The labs remain useful when a single mechanic needs to be understood in isolation:

- **Signal Patrol** — top-down shooting and projectile pooling;
- **Lantern Steps** — movement, collectibles and checkpoints;
- **Sparring Room** — local two-player attack/guard timing.
