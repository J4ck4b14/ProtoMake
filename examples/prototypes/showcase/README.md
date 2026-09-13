# The Luminous Vault

ProtoMake's flagship vertical slice is a compact action-platforming dungeon built entirely from ordinary project entities and one editable TypeScript behaviour.

## Play

- **A / D** or arrows — move
- **Space** — jump
- **J** or primary mouse — attack
- **1 / 2** or **Q** — equip the Sunblade / Arc Caster
- **H** — consume a restorative charge
- **L** — toggle the carried lantern
- **R** — restart

Recover the Arc Caster, activate both sun crystals with ranged shots, cross the formed bridge, collect the Vault Key and climb to the illuminated exit. Sentinels can be fought with either weapon. Falling, enemy contact and hostile bolts cost health.

## What it demonstrates

- static ambient and spot lighting;
- mixed point lights with live caster shadows;
- a dynamic lantern parented to the player;
- dynamic crystal lights and a rectangular exit light driven by game state;
- visibly lit background/world receivers plus emissive UI, pickups and projectiles;
- platforming physics, jump buffering and coyote time;
- pooled friendly and hostile projectiles;
- melee and ranged combat, health, ammunition and weapon switching;
- inventory pickups, a multi-step environmental puzzle and an achievement;
- runtime UI text, animation, sound and camera shake/kick/zoom feedback.

Import `showcase.protomake.json` into ProtoMake to inspect every entity, light and script. The standalone launcher build is generated with `npm run build:prototypes`.
