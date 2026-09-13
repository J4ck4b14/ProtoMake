# The Luminous Vault: Blackward

ProtoMake's flagship vertical slice is a three-room action-platforming dungeon built entirely from ordinary project entities and one editable TypeScript behaviour.

## Play

- **A / D** or arrows — move
- **Space** — jump
- **J** or primary mouse — attack
- **1 / 2** or **Q** — equip the Sunblade / Arc Caster
- **H** — consume a restorative charge
- **L** — toggle the carried lantern
- **R** — restart

Cross the Black Gate, recover the Arc Caster in the Drowned Gallery, wake both wards, and defeat the Reliquary guard to expose the Vault Key. Every room can be revisited through its thresholds. Health, weapons, ammunition, pickups, defeated enemies and ward state travel with the player.

## What it demonstrates

- exactly zero ambient illumination and a player-following radial mask that guarantees pure black beyond the reveal radius;
- a short dynamic lantern parented to the player;
- three or fewer tiny environmental lights in each room;
- emissive enemy shots with small transient red glows;
- point, spot and rectangular area lights across static/mixed/dynamic mobility;
- live caster shadows from dungeon architecture;
- visibly lit background/world receivers plus emissive UI, pickups and projectiles;
- platforming physics, jump buffering and coyote time;
- pooled friendly and hostile projectiles;
- melee and ranged combat, health, ammunition and weapon switching;
- bidirectional scene thresholds backed by run-scoped state;
- inventory pickups, a multi-stage environmental puzzle and an achievement;
- runtime UI text, animation, sound and camera shake/kick/zoom feedback.

Import `showcase.protomake.json` into ProtoMake to inspect every entity, light and script. The standalone launcher build is generated with `npm run build:prototypes`.
