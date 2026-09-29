# ProtoMake flagship showcase and focused labs

Run `npm ci`, then `npm run build:prototypes` and `npm run preview:prototypes`. Use `npm run dev` and the editor's **Edit showcase** button to inspect the flagship source project.

| Experience             | Editable project                       | Purpose                                                                                                                                                                     |
| ---------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The Luminous Vault** | `showcase/showcase.protomake.json`     | Flagship vertical slice: lighting, melee/ranged combat, inventory, multiweapon switching, puzzle progression, platforming, enemy projectiles, UI, audio and camera feedback |
| Signal Patrol          | `shooter/shooter.protomake.json`       | Focused top-down movement, projectile pooling and enemy lab                                                                                                                 |
| Lantern Steps          | `platformer/platformer.protomake.json` | Focused platforming, collectible and checkpoint lab                                                                                                                         |
| Sparring Room          | `fighter/fighter.protomake.json`       | Focused two-player local combat lab                                                                                                                                         |

## The Luminous Vault

Move with **A/D** or the arrows, jump with **Space**, attack with **J** or the primary mouse button, switch weapons with **1/2** or **Q**, heal with **H**, toggle the carried lantern with **L**, and restart with **R**.

Start with the Sunblade in the Black Gate, recover the Arc Caster in the Drowned Gallery, wake both wards, then defeat the Reliquary guard and take the Vault Key. The three rooms connect in both directions through short fades and preserve inventory, health, ammunition, pickups, defeated enemies and puzzle state. Opening the lantern provides sight but increases enemy acquisition range; press **L** to trade visibility for stealth.

Every room forces ambient illumination to zero. A short carried light reveals layered masonry, arches, water details, lit pickups and hard architectural shadows; no room has more than three authored environmental lights. Enemy attacks charge visibly before firing, the Warden uses a three-bolt spread, and projectiles stop against solid geometry. Projectile glows are tiny and transient. Across the dungeon, the project uses point, spot and area lights with static, mixed and dynamic mobility, plus pooled particles and eight distinct code-synthesized sound effects. All game rules live in the editable `Assets/Scripts/Showcase.ts` project asset—there are no showcase-only engine shortcuts.

## Builds and source assets

`npm run build:prototypes` creates the launcher and four independent static games in `examples/prototypes/web`. Source checkouts generate those folders after `npm run build:player`; the generated `web` directory is not the canonical source.

Each source folder includes raw images, audio and scripts, and each `.protomake.json` project embeds the same assets. Editing a raw file does not automatically update the embedded project; run `npm run examples:generate` only when intentionally regenerating the checked-in samples.

The workshop remains available as `docs/ProtoMake-Prototype-Workshop.docx` and `docs/workshop.md` for step-by-step reconstruction of the focused labs. The flagship is the recommended first experience; the smaller projects exist to isolate mechanics for learning and debugging.
