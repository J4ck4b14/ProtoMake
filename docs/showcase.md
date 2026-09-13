# Flagship showcase

## The Luminous Vault

The Luminous Vault is ProtoMake's complete vertical slice: a short action-platforming dungeon in which lighting, combat, inventory and traversal are parts of one progression rather than separate demonstrations.

The player starts with a melee Sunblade. The first combat space awards a ranged Arc Caster and ammunition. Its bolts activate two remote sun crystals; the pair retracts a physical seal, reveals a bridge and exposes the Vault Key. Taking the key powers the exit's rectangular area light. The player then crosses a platforming ascent while fighting sentinels that patrol and fire pooled projectiles.

The same scene includes:

- static ambient and spot lighting;
- mixed point fixtures with live shadow casters;
- a dynamic lantern parented to the player;
- dynamic crystal lights and a game-state-driven area exit light;
- visibly lit background, world surfaces and platforms;
- melee hitboxes, ranged and hostile projectile pools, health and ammunition;
- multiweapon inventory, a restorative pickup and explicit objective UI;
- jump buffering, coyote time, hazards and staged platforming;
- sprite animation, sound, camera shake, kick and zoom feedback;
- a persistent `vaultbreaker` achievement.

Nothing in the engine recognizes this level specially. Its rules are the ordinary editable `Assets/Scripts/Showcase.ts` behaviour embedded in `examples/prototypes/showcase/showcase.protomake.json`; its scene uses standard ProtoMake entities and components.

## Run and inspect

After `npm ci`, run `npm run dev`. Use **Play showcase** to load and start the game immediately, or **Edit showcase** to inspect its complete project before pressing **Play**. A production `npm run build` also publishes a standalone copy at `./showcase/` beside the editor, including on GitHub Pages.

For a local launcher containing the flagship plus the three narrow teaching labs, run `npm run build:prototypes` followed by `npm run preview:prototypes`.

The labs remain useful when a single mechanic needs to be understood in isolation:

- **Signal Patrol** — top-down shooting and projectile pooling;
- **Lantern Steps** — movement, collectibles and checkpoints;
- **Sparring Room** — local two-player attack/guard timing.
