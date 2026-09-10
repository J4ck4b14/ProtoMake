# Three playable ProtoMake prototypes

Run `npm ci`, then `npm run preview:prototypes`. Open the printed URL for the three-game launcher. Use `npm run dev` and Import JSON to edit a project.

| Game          | Editable project                 | Controls and objective                                                                                                 |
| ------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Signal Patrol | shooter/shooter.protomake.json       | WASD/arrows move; Space/mouse fire right; destroy six drones; three hits lose; R restart                               |
| Lantern Steps | platformer/platformer.protomake.json | A/D or arrows move; Space jump; collect four coins and reach the gate; checkpoint saves respawn; R restart             |
| Sparring Room | fighter/fighter.protomake.json       | Two-player local: P1 A/D, Space jump, F attack, G guard; P2 arrows, Up jump, K attack, L guard; knockout and R rematch |

The `web` directory contains the launcher and three independent exported games. Serve it over HTTP; do not open index.html as a file. Individual game folders can be hosted independently. Source checkouts can generate these builds using `node scripts/build-prototypes.mjs` after `npm run build:player`.

Every game folder includes its raw Images, Audio and Scripts. The imported project JSON also embeds those assets. Edits to raw files do not automatically change embedded JSON; import or save them through ProtoMake, or intentionally regenerate the sample projects. The maintainer generator writes fresh IDs and overwrites sample JSON; preserve custom projects first.

The full guide is `docs/ProtoMake-Prototype-Workshop.docx` at the release root, with Markdown in `docs/workshop.md`. It explains complete scene reconstruction and the implementation tradeoffs. Lights use per-sprite illumination, without shadows or normals. These are compact teaching prototypes with geometric placeholder art; no mobile touch interface, online multiplayer or persistent game saves are included.
