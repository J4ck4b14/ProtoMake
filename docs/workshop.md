# ProtoMake Prototype Workshop

## Build a shooter a platformer and a local fighting game

ProtoMake 0.9.3 • September 2026 • Practical workshop

This workshop takes you from an empty ProtoMake scene to three small playable games. You will author entities, reuse prefabs, connect scripts to named input actions, edit sprite animations, light a scene and export a standalone web build. Each chapter ends with observable checks. The completed projects are included so you can compare your work at any point.

The games deliberately use compact rules and editable placeholder art. Signal Patrol is a side-firing arena shooter. Lantern Steps is a platformer with collectibles and a checkpoint. Sparring Room is a two-player local fighting prototype with attack phases, guarding and rematches. They are teaching projects, not finished commercial games.

**Start with the completed builds.** Extract the release into a fresh folder. Open a terminal in the directory containing package.json and package-lock.json, then run:

```sh
npm ci
npm run preview:prototypes
```

Open the URL printed by the terminal and choose a game. The launcher serves the three bundled production builds. Stop the server with Ctrl+C when finished. To author projects, run `npm run dev`, then use **Import project** to open a project's `.protomake.json` file.

**Reading route.** Chapters 1–6 establish the common workflow. Chapters 7–9 build Signal Patrol; chapters 10–12 build Lantern Steps; chapters 13–15 build Sparring Room. Chapters 16–18 cover prefabs, export and further development. Read the shared setup once; then choose a game.

The new examples target a desktop keyboard and an approximately 800 by 500 game area. Use a browser window large enough to show it. The fighter requires two people at the same keyboard. No computer-controlled opponent or online play is implied.

---

# 1 Set up a reproducible workspace

Use Node.js 22.12 or later. The dependency lockfile is included; npm ci installs its pinned versions. The exported games themselves need only an HTTP server and a browser with WebGL and Web Audio. A direct file double-click is not a supported way to launch them.

1. Run `npm run dev`. Open the exact local URL printed by Vite. The editor opens at the root page. Stop older development servers first so you do not accidentally test an old build.
2. Import one completed project from `examples/prototypes/shooter/shooter.protomake.json`, `platformer/platformer.protomake.json` or `fighter/fighter.protomake.json`. These paths are relative to `examples/prototypes` after the first example.
3. Press Play, then click the game viewport to enable sound and focus input. Stop returns to the authored scene. Changes made by gameplay are disposable runtime state.
4. Use **Save locally** for the browser's project store and **Export backup** for a portable `.protomake.json` backup. Local storage belongs to that browser origin. Export a backup before changing origins/devices or clearing browser data.
5. To build your own version, choose New project and give it a different name. Preserve the completed example as your reference. Work through the following pages and save at each checkpoint.

**What is in each example folder**

| Item                              | Purpose                                        |
| --------------------------------- | ---------------------------------------------- |
| game name followed by .protomake.json | Complete editable project with embedded assets |
| Images                            | Raw PNG artwork and a size manifest            |
| Audio/Action.wav                  | Short action sound used by the prototype       |
| Scripts                           | Main game behaviour and Helpers.ts             |
| ../web/game name                  | Production build linked from the launcher      |

Use the files in Images, Audio and Scripts for a blank-project reconstruction. Do not import sizes.json as a gameplay asset. You do not have to regenerate the projects to use them. `npm run examples:generate` is a maintainer command that writes fresh projects with new identifiers; avoid it while making personal changes to the examples.

---

# 2 Author entities and import assets

ProtoMake uses a centered 2D coordinate system. Positive X goes right; positive Y goes down. Positions and sprite dimensions are in world units. With Camera 2D zoom 1, one world unit occupies approximately one CSS pixel. The Inspector exposes Transform as a, b, c, d, x and y. Change x and y for position; keep a=1, b=0, c=0, d=1 for an unrotated unit scale. Use the viewport Rotate tool for visual rotation.

1. Create a Camera entity with + Entity. Add Camera 2D in the Inspector. Put it at X 0, Y 0, set zoom to 1 and background to #101820. Leave viewport fields at their defaults. Set this scene as the startup scene.
2. In Assets, use + Folder to create Assets/Images, Assets/Audio, Assets/Scripts, Assets/Animations and Assets/Prefabs. Select the appropriate Asset folder before each import.
3. Import all PNG files from your chosen example's Images folder in one operation. Import Action.wav into Assets/Audio. Import both TypeScript files together into Assets/Scripts. Importing the main script before its helper can fail module linking.
4. Create a sprite with + Entity and add Sprite Renderer, or select an image and choose Place sprite. Rename the entity in the Inspector. Set its position, width, height, texture and layer from the construction tables.
5. Use Duplicate for repeated objects, then rename and reposition each copy. Names used by scripts must be unique and match the tables exactly, including spaces and capitalization.

Drag panel dividers to make room for the Inspector or Assets. Use Frame · F to find a selected object. Group selection is useful for organization, but keep gameplay entities at scene root during the workshop: the scripts place them in world space and exact coordinates make comparison easier.

**Shared sprite defaults.** Use white tint, opacity 1, anchorX and anchorY 0.5, no flipping, order 0 and layer 0 unless a table says otherwise. A blank texture is a solid rectangle. Leave entities enabled; hide runtime indicators with Sprite Renderer visible unchecked. Disabling an entity and hiding its sprite have different effects on scripts and animation.

**Checkpoint.** You should be able to create, select, move and resize a textured sprite; Save and reopen the project; then Undo a property edit. Resolve these basics before attaching game logic.

---

# 3 Build the common presentation

All three projects use the same small scene scaffold. Create the following sprites after the Camera. Set lit false on the backdrop and interface so lights do not reduce their readability. Backdrop.png already contains the grid; no extra grid entities are necessary.

| Entity       | Position X Y | Size W H | Texture          | Layer |
| ------------ | ------------ | -------- | ---------------- | ----- |
| Backdrop     | 0 0          | 800 500  | Backdrop.png     | -10   |
| Instructions | 0 -225       | 760 44   | Instructions.png | 20    |
| Victory      | 0 0          | 520 120  | Victory.png      | 30    |
| Defeat       | 0 0          | 520 120  | Defeat.png       | 30    |

Initially uncheck visible on Victory and Defeat. Their scripts reveal them at the appropriate result. Text is baked into PNGs to keep these examples independent of a separate UI/text system. You can replace the PNGs with your own designs while retaining the entity names.

For shooter and platformer, create Health background and Health at (-350, -192), and Score background and Score at (190, -192). Give each a blank texture, height 12, layer 20, lit false, anchorX 0 and anchorY 0.5. Backgrounds have width 160 and tint #26313d. Health starts at width 160, tint #74e8b8. Score starts at width 1, tint #f3ac66; the script hides it when the value is zero. Set background order 0 and foreground order 1 so the fill draws over its backing. The completed projects explicitly use these orders.

The fighter uses Health background 1, Health 1, Health background 2 and Health 2 at the same left and right positions. Both health bars start full. Use #f3ac66 for Player 1 and #82baff for Player 2. There is no score bar in that game.

**Why the left anchor matters.** Helpers.ts changes bar width. An anchorX of 0 keeps the left end stationary as the bar shrinks. A centered anchor makes both ends move, which is usually undesirable for this style of health display.

---

# 4 Create and edit sprite animations

The supplied actor images are separate frames, not an atlas. Every example uses an Idle clip, an Action clip and one two-state controller. Both fighters can reference the same controller because each Animator owns its own playback and parameter state.

1. Choose + Animation clip in Assets. Set the path to Assets/Animations/Idle.animation.json and Clip name to Idle. Keep only two frames; choose Actor-0.png and Actor-1.png. The initial form may contain every imported image, so remove unrelated frames. Set each Seconds field to 0.3, Loop on and Clip speed 1. Save animation.
2. Create Action.animation.json with Actor-2.png and Actor-3.png, duration 0.08 each, Loop on and speed 1. The FPS convenience control sets uniform durations; direct Seconds fields allow unequal timing.
3. Choose + Animator. Set the asset path to Assets/Animations/Actor.animator.json. Rename the two states Idle and Action; assign their corresponding clips. Set Initial state to Idle and both state speeds to 1.
4. Rename the default bool parameter to active and leave its default false. Configure Idle → Action when active == true, and Action → Idle when active == false. Leave Exit time blank for both. Remove any extra transitions.
5. Save animation. Select the actor entity, select the controller asset and use Attach media. It requires a Sprite Renderer. For the fighter, attach the controller separately to both Fighter entities.

**Edit without recreating.** Double-click a clip or controller, or use Edit animation. The entity Inspector also offers Edit controller and Edit clip shortcuts. Saving preserves the asset ID; existing references keep working. Stop Play before editing.

**Use the tools.** Play preview runs the unsaved clip. Scrub Preview time or click a numbered frame segment to inspect its boundary. Segment width represents duration. The state graph draws connections; selecting a node jumps to its fields. Connect adds a one-cycle transition, so change its exit time and conditions deliberately. Arrow labels open the rule fields; Earlier rule and Later rule change priority. The dot marks the initial state. Layout is automatic.

**Checkpoint.** In Play, the shooter animates while firing, the platformer while moving, and the fighter while attacking. Make Idle noticeably slower, save, replay and then Undo. No controller or clip needs to be recreated.

---

# 5 Add lights with predictable behavior

Create four empty entities and add Light 2D to each. These settings are a readable baseline; the dedicated Lantern Shadow Lab example below pushes them further. Keep Transform scale at 1; light dimensions use world units. Aim Spotlight down and right with approximately 23 degrees of rotation. For an exact Inspector entry, set a=0.921061, b=0.389418, c=-0.389418 and d=0.921061; retain its x and y. Set Ambient, Cool area and Spotlight to **static**; set Warm pool to **mixed**.

| Entity and type | Position  | Color and intensity | Shape settings                 |
| --------------- | --------- | ------------------- | ------------------------------ |
| Ambient ambient | 0 0       | #d4e5ff 0.65        | No distance falloff            |
| Warm pool point | -190 0    | #ffb76b 0.8         | range 350 falloff 1.4          |
| Cool area area  | 200 60    | #75caff 0.65        | range 220 width 220 height 100 |
| Spotlight spot  | -350 -160 | #fff0ce 0.8         | range 700 inner 30 outer 75    |

Leave unlisted falloff values at 1. Cone angles are full angles in degrees; a spot faces local +X before rotation. Area lights measure falloff from the nearest point on their rotated rectangle. Their range starts outside that rectangle. Selected lights display their range, cone or rectangle in the scene viewport.

**What this renderer computes.** With at least one active light, ProtoMake builds a screen-space light surface. Point and spot lights create visible gradients across large floors and walls instead of tinting a whole sprite from one center sample; area lights emit from a rotated rectangle. Contributions accumulate and multiply the rendered scene. The model is deliberately LDR: it has no normal maps, HDR energy model or bloom.

With no active lights, sprites retain their original appearance. Start with a low ambient fill so objects outside local light ranges remain readable. Uncheck a sprite's **Lit** property for HUD, signs or emissive-looking markers. Enable **Cast Shadow** on Sprite Renderer for rectangular sprite occlusion, or add **Shadow Caster 2D** when the blocking geometry should be invisible or differ from the sprite. Ambient light is never shadowed.

**Exercise.** Lower Ambient intensity to 0.2 and enable Cast Shadow on a wall or platform between Warm pool and the actor. Move the light in Edit mode and watch the illuminated surface and projected shadow update. Then switch Warm pool to **dynamic**, parent it to the actor and Play: the pool now travels with the actor. A **mixed** light keeps its authored light definition fixed at runtime but recomputes shadows from moving casters; a **static** light also snapshots caster geometry. Raising intensity beyond 1 is allowed, but the LDR result saturates rather than producing HDR glow.

**Reference example.** Import `examples/lighting-shadow-demo/lighting-shadow-demo.protomake.json`. **Lantern Shadow Lab** combines a dim static ambient fill, static fixtures, a mixed fixed lamp with live caster shadows, a dynamic player torch and shadow-casting platforms. Scripts can use `ctx.illumination()` or `ctx.lightAt(x, y)` to turn the same attenuation/occlusion rules into stealth exposure checks.

---

# 6 Wire input and project scripts

Open Settings and use the Input Actions editor. Retain the default Gameplay map, add the game-specific actions described on the relevant game page, then enter each keyboard, mouse or gamepad binding in its directional field. Sensitivity, dead zone and inversion are authored per action.

```json
{
  "name": "Restart",
  "kind": "button",
  "positiveX": ["KeyR"],
  "negativeX": [],
  "positiveY": [],
  "negativeY": []
}
```

Use physical codes such as KeyF, Space and ArrowLeft. Action names are case-sensitive. Keep commas between array records, and choose Apply settings. An invalid binding is reported rather than silently ignored. The shooter adds Fire; the platformer uses the default Move and Jump; the fighter defines separate actions for each player.

1. Select the entity that will own the game behaviour. In Assets, double-click its imported `.ts` file (or use Scripts), Compile, Save, then Attach to selection. Ctrl/Cmd+S saves from the source editor, and unsaved source is protected as a browser-local draft. Helpers.ts is an imported utility module; do not attach it to an entity.
2. The Inspector displays the behaviour's exposed numeric fields. Keep their supplied defaults initially. A main script can call its helper using `import { bar } from './Helpers'` because both files live in the same Assets/Scripts folder.
3. Add Audio Source to the behaviour owner, choose Action.wav, set volume 0.3, bus SFX, and leave Loop and Play on awake off. For the fighter the owner is Arena logic; for the other games it is Player.
4. Open Mixer if you want to adjust SFX without altering source clips. Click the game viewport after Play to unlock sound. Standalone games perform that unlock through Start.

**Lifecycle.** start establishes references and resets the round. update reads frame input. fixedUpdate handles fixed-step simulation. Stop disposes runtime state. Browser compilation checks syntax and module linking; `npm run typecheck` checks the supplied TypeScript semantically. A successful Compile message is not proof that entity names or game rules are correct.

**Checkpoint.** Play should begin without a red Console error. If a reference is missing, check the exact entity name, script attachment and controller before changing the engine.

---

# 7 Signal Patrol scene construction

Create the shared scaffold, animations, lights and bars from chapters 1–6. Set gravity Y to 0 in Settings. Add Fire as a button with positiveX bindings Space and Mouse0; keep all other Fire arrays empty. Keep default Move and add Restart on KeyR.

| Entity                     | Position X Y | Size W H | Texture and notes                                |
| -------------------------- | ------------ | -------- | ------------------------------------------------ |
| Player                     | -280 0       | 32 32    | Actor-0.png; Animator and Audio Source           |
| Drone 1                    | 180 -140     | 36 36    | Enemy.png                                        |
| Drone 2                    | 290 -140     | 36 36    | Enemy.png                                        |
| Drone 3                    | 180 0        | 36 36    | Enemy.png                                        |
| Drone 4                    | 290 0        | 36 36    | Enemy.png                                        |
| Drone 5                    | 180 140      | 36 36    | Enemy.png                                        |
| Drone 6                    | 290 140      | 36 36    | Enemy.png                                        |
| Bullet 1 through Bullet 12 | 0 0          | 16 5     | Blank texture; #ffdf8e; lit false; visible false |

Attach Shooter.ts to Player. Its speed field defaults to 230 units per second. No Rigidbody or Collider is required: this prototype implements a constrained projectile-versus-target sweep in script. Do not add physics components expecting them to improve this particular hit model automatically.

Turn Drone 1 into a prefab with Create prefab, path Assets/Prefabs/Drone.prefab.json. Instantiate it five times and set the remaining names and positions. The completed scene contains six linked instances. Runtime movement does not author prefab overrides.

**Play loop.** Move with WASD or arrows. Hold Space or left mouse to fire right. Drones drift left; collision with the player or a drone escaping the left edge costs health, subject to a one-second invulnerability period. Escaped drones wrap to the right. Destroy all six to win. Three damage events end the attempt. R resets the entire round.

The top-left bar is health; the top-right bar is destroyed drones. Firing drives the actor's active animation parameter. The short WAV plays on shot creation. There is no mouse aiming: shots always travel right. Treat that as a clear initial constraint when changing the design.

---

# 8 Signal Patrol projectile logic

Open Shooter.ts in the supplied Scripts folder. Read start, reset, damage and update in that order. start resolves the twelve bullet entities and six drones once. reset hides bullets, restores drones, health and score, and clears both result overlays. update moves the player, advances drones and performs shot sweeps.

**The pool.** A bullet record contains an entity ID and an alive flag. Firing takes the first inactive record, places its entity at the muzzle and reveals it. A hit or leaving the play area releases it. No entity is created or destroyed during normal firing. The cooldown is 0.18 seconds, and bullet speed is 650 units per second.

The important hit condition is a swept interval, not a distance test at the final bullet position:

```ts
const [ex, ey] = c.position(e.id);
return bx <= ex + 18 && next >= ex - 18 && Math.abs(by - ey) < 22;
```

Here bx is the previous bullet X, next its proposed X, and (ex, ey) the drone position. A fast bullet can cross a drone between frames; the interval still detects that crossing. Candidates are ordered by X so the first encountered living drone receives the hit. This is appropriate for horizontal shots and axis-aligned targets. Arbitrary-direction bullets require a segment-versus-shape test or a suitable physics query.

**Avoid the tempting mistakes.** Hiding a hit drone without clearing alive lets it absorb later bullets. Reusing a bullet without restoring its position causes a visible jump or immediate hit. Testing only the final point permits tunnelling. Multiplying speed by elapsed time instead of delta accelerates movement incorrectly. The example caps its update delta to 0.05 seconds, trading some catch-up accuracy for stability after a long frame.

**Make one controlled change.** Change the exposed speed from 230 to 300 and replay. Then restore it and change cooldown to 0.3 in Shooter.ts. Save script and restart Play. Compare movement and firing separately; changing both at once makes the cause of a feel change harder to identify.

---

# 9 Signal Patrol acceptance and extension

Work through these checks on your own project, then compare with the completed shooter. Test in editor Play and once in the standalone build.

1. Move diagonally and horizontally for the same time. The named vector input is normalized, so diagonal motion should not gain a speed advantage. The player remains inside the arena bounds.
2. Fire across each of the three drone rows. Every destroyed drone disappears and increments the score bar once. The same projectile cannot destroy several drones.
3. Hold Fire long enough to reuse the entire pool. Shots continue; there should be no growing collection of bullet entities. Stop should return to the original authored scene.
4. Touch a drone. Health drops, the actor flashes warm red, and immediate repeated contact does not consume all health in one frame. Wait for invulnerability to expire and repeat.
5. Let drones escape until the defeat screen appears. Press R. Check full health, restored drones, no stale bullets and hidden result panels.
6. Destroy all six. The victory screen appears. R also resets a won round. The supplied automated test drives this path through compiled project scripts.

**Troubleshooting.** A missing drone or bullet name produces a script reference error. A shot that looks invisible may have visible unchecked after you changed the script's reset logic. If the score bar shrinks from both ends, restore anchorX 0. If it is covered by its background, set foreground order 1 and background order 0.

**Extension exercise.** Add a second six-drone wave. Decide which state belongs to the match and which belongs to a wave. Score may survive between waves; bullet activity and spawn positions should reset. Write the reset list before changing code. Test the transition with a bullet already in flight so the new wave cannot be hit by a stale shot unintentionally.

**Boundary.** This is a finite arena shooter with rightward projectiles, scripted hit tests and one enemy behavior. Aim controls, enemy projectiles, arbitrary geometry, weapon switching and persistent high scores are deliberate next features. Do not infer them from the presence of a physics engine elsewhere in ProtoMake.

---

# 10 Lantern Steps scene construction

Start from the shared scaffold. Set gravity Y to 980, keep default Move and Jump, and add Restart on KeyR. Create Player at (-310, 130), size 32 by 32, using Actor-0.png. Attach its Animator, Audio Source and Platformer.ts. Keep speed 220 and jumpSpeed 480.

Add Rigidbody 2D to Player: dynamic, mass 1, gravityScale 1, freezeRotation true, continuous true, and zero initial velocity. Add Box Collider 2D with width 28, height 32, friction 0 and restitution 0. The slightly narrower collider reduces visual snagging at ledges.

| Entity       | Position X Y | Size W H | Components beyond Sprite Renderer       |
| ------------ | ------------ | -------- | --------------------------------------- |
| West floor   | -240 180     | 240 24   | Static Rigidbody; matching Box Collider |
| Middle floor | 60 180       | 160 24   | Static Rigidbody; matching Box Collider |
| East floor   | 300 180      | 160 24   | Static Rigidbody; matching Box Collider |
| Step one     | -80 90       | 100 24   | Static Rigidbody; matching Box Collider |
| Step two     | 120 0        | 100 24   | Static Rigidbody; matching Box Collider |
| Coin 1       | -250 130     | 18 18    | Coin.png; lit false                     |
| Coin 2       | -80 45       | 18 18    | Coin.png; lit false                     |
| Coin 3       | 120 -45      | 18 18    | Coin.png; lit false                     |
| Coin 4       | 300 105      | 18 18    | Coin.png; lit false                     |
| Checkpoint   | -80 50       | 20 36    | Flag.png; tint #f3ac66; lit false       |
| Goal         | 330 135      | 32 48    | Goal.png; tint #6ee7b7; lit false       |

Use Platform.png for the floors. Coins use tint #ffe39c. Make Coin 1 a prefab and instantiate the other three. Collectibles, checkpoint and goal have no colliders in this example; their script uses radius checks. Ground colliders remain solid, with sensor false.

**Checkpoint.** Before jumping, let the character settle. It should land on the west floor rather than falling through. Verify collider dimensions and gravity if it does not. Space should then move it upward, because upward velocity is negative Y.

---

# 11 Lantern Steps jump timing

The platformer separates frame input from physics. update captures the press edge and stores a short buffer. fixedUpdate checks ground proximity, consumes the buffered request and writes velocity. This is necessary because a rendered frame can contain zero, one or several fixed steps.

```ts
// In update
if (!this.done && c.input.wasPressed('Jump')) this.buffer = 0.12;

// In fixedUpdate after updating timers
if (this.buffer > 0 && this.coyote > 0) {
  vy = -this.jumpSpeed;
  this.buffer = 0;
  this.coyote = 0;
  c.playAudio();
}
```

The actual file also decreases the buffer and coyote timers by the fixed delta. A successful ground query refreshes coyote time to 0.1 seconds. That allows a brief jump opportunity after walking off an edge; the 0.12-second buffer allows a press shortly before landing to trigger once ground is available.

The ground ray starts at (x, y + 15), points down, has length 8 and excludes the player's own body. Grounding also requires nonnegative vertical velocity, preventing the feet ray from immediately refreshing coyote time during upward takeoff. Horizontal velocity follows Move while vertical velocity remains controlled by gravity except when jumping.

**Why not move the Transform directly?** A dynamic body's motion must stay consistent with the physics service. The example uses setVelocity for motion and c.setPosition for deliberate respawns; that context method routes bodies through the physics adapter. Writing raw local matrices each frame would fight the simulation.

**Tuning experiment.** Keep gravity 980 and compare jumpSpeed 430, 480 and 530. At 480, the ideal free-flight rise is approximately 118 units before collision effects; the level's 90-unit second step is intentional. If a jump cannot reach, inspect height and horizontal gap separately. Raising restitution is not a replacement for a controlled jump impulse.

**Boundary.** This is a compact dynamic-body controller. It does not implement slopes, one-way platforms, moving-platform attachment, variable jump height or a full kinematic character solver.

---

# 12 Lantern Steps progression and recovery

Coins use a set of collected names. When the player's center comes within 30 units of a coin, its sprite is hidden and the score bar updates. The name enters the set before it can be counted again. Four coins are required before the goal accepts the player.

The checkpoint activates within 35 units of its center. It changes color to green and moves the respawn location to (-80, 55), above Step one. Falling below Y 270 or moving beyond absolute X 400 removes one life and teleports the player to the current spawn. Velocity and jump timers are cleared, but collected coins remain collected. After three falls, the defeat panel appears. R resets the full run, including coins and checkpoint.

1. Collect Coin 1 and verify the score changes only once while standing at its old position.
2. Jump from around X -220 toward Step one, collect Coin 2 and touch the flag. Start before the edge so the actor clears the platform underside. The flag becomes green. Deliberately fall into a gap; you should respawn on Step one with one less life and the first coins still absent.
3. Reach Step two and collect Coin 3. Return to the east floor for Coin 4. Touch Goal after collecting all four. The victory panel appears. Touching Goal early should not finish the level.
4. Repeat three falls in a fresh run. After defeat, press R. Verify full health, all four coins restored, the flag orange again and the original west-floor spawn.
5. Save locally and Export backup for the authored project. Stop/Play should start a new run: runtime progress is not written into the saved project.

**Common failures.** An oversized ground ray allows jumping while far above a platform. Forgetting to clear the jump buffer after consumption creates repeated jumps. Preserving vertical velocity during respawn can send the character straight back into a death zone. Disabling collected entities would work for this simple scene, but hiding their sprites is enough and avoids changing unrelated component lifecycles.

**Extension exercise.** Add a fifth coin and a second checkpoint. Update the loop bound, score maximum and completion condition together. Then decide whether activating the second checkpoint should replace or coexist with the first. Test a death between coin collection and checkpoint activation. Progression bugs often come from an incomplete reset contract rather than collision detection.

---

# 13 Sparring Room local controls and scene

This prototype is for two players sharing one desktop keyboard. It has no bot, networking, rollback or matchmaking. Use the common backdrop and result panels, but replace the common health/score bars with the two fighter health bars described in chapter 3. Set gravity Y to 0; the coordinator implements its own vertical motion.

| Action             | Player 1              | Player 2                     | Input kind |
| ------------------ | --------------------- | ---------------------------- | ---------- |
| Move1 or Move2     | A negative D positive | Left negative Right positive | axis       |
| Jump1 or Jump2     | Space                 | ArrowUp                      | button     |
| Attack1 or Attack2 | F                     | K                            | button     |
| Block1 or Block2   | G                     | L                            | button     |
| Restart            | R                     | R shared                     | button     |

Use physical bindings KeyA, KeyD, KeyF, KeyG, KeyK and KeyL in Settings. Unused input arrays are empty. Keep default actions if desired, but the fighter reads only the names in this table plus Restart.

Create Arena logic at (0, 0), without a sprite. Attach Fighter.ts and Audio Source to it. Set the exposed speed to 180. Create Ring floor at (0, 170), size 760 by 24, Platform.png. This is visual geometry, not a physics collider.

Create Fighter 1 at (-160, 128) and Fighter 2 at (160, 128), each size 36 by 60 with Actor-0.png and an Animator. Make Fighter 1 a prefab; instantiate Fighter 2 from it. Neither needs a Rigidbody, Collider or Script Behaviour. The shared Arena logic owns both fighters' match state and drives their position, facing and animations.

Create Hitbox 1 and Hitbox 2 at (0, 0), size 48 by 12, blank texture, lit false and visible false. Tint them #f3ac66 and #82baff respectively. These rectangles are visible active-phase indicators. They are not ProtoMake physics colliders, and their dimensions are not the hit-rule parameters.

**Checkpoint.** Both characters should stand on the ring. Each player's movement and jump keys control only that player. They automatically face the opponent when free to turn. Check your keyboard's simultaneous-key support before diagnosing missed combinations as a combat bug.

---

# 14 Sparring Room attack phases

Fighter.ts stores two FighterState records: position, vertical speed, health, attack time remaining, whether the attack has hit, stun, facing and blocking. update latches attack and jump edges; fixedUpdate consumes them. A shared simulation step makes phase timing and simultaneous decisions easier to reason about.

| Phase    | Duration | Remaining attack time   | Behavior                    |
| -------- | -------- | ----------------------- | --------------------------- |
| Startup  | 0.10 s   | 0.43 down to 0.33       | Wind-up; cannot hit         |
| Active   | 0.08 s   | 0.33 down to above 0.25 | One eligible hit            |
| Recovery | 0.25 s   | 0.25 down to 0          | Cannot start another attack |

These are second-based thresholds sampled by a fixed clock, so boundary events occur on the next fixed step. Animation is feedback; it does not decide damage timing. The active indicator appears only during the eligible phase. Changing clip FPS should not secretly change attack reach or damage.

A target must be in front, less than 78 units away horizontally and less than 44 vertically. The attack's hit flag prevents repeated damage across active steps. A hit deals 18 damage; a correctly facing grounded guard reduces it to 2 chip damage. Guarding is unavailable during attack or stun. An unblocked hit applies 0.2 seconds of stun, cancels the target's attack and pushes it 24 units away.

```ts
// Collect eligible hits for both fighters first.
hits.push({
  attacker: f,
  target: other,
  blocked: other.block && (f.x - other.x) * other.facing > 0,
});
f.hit = true;
// Apply damage only after gathering the full step.
```

Gathering before applying lets simultaneous active attacks trade. Applying Player 1's damage immediately could cancel Player 2's attack before its eligibility is examined, creating an order-dependent advantage. The example still uses a compact sequential movement pass and simple push-apart logic; it is a learning base, not a tournament combat engine.

Health is 100. A knockout freezes further combat and displays the result. A simultaneous knockout uses the Player 2 wins or draw panel; inspect both empty health bars to distinguish a draw. R resets all match state.

---

# 15 Sparring Room acceptance and extension

Test with a second person if available; otherwise operate one character at a time. Stand far apart before the first check. A punch should not hit simply because the target exists in the scene.

1. Press F out of range. Player 2 keeps full health. Approach until the characters push against one another, then press F once. Player 2 loses 18 health once, even though the active phase spans several fixed steps.
2. Hold G as Player 1 while Player 2 attacks with K. Player 1 turns blue while guarding and loses only 2 health on a correctly facing block. Release guard and repeat: normal damage and hit reaction return.
3. Attempt another attack during recovery. It should not start immediately. There is no input buffer for attacks pressed during recovery in this prototype; adding one should be a conscious design choice.
4. Jump over an attack or move outside horizontal range. The hit should miss. The visible Hitbox rectangle is a timing aid, so use the scripted distance rules when diagnosing edge cases.
5. Attack together while in range. Both attacks can connect on the same step. Neither player should gain a damage advantage solely because their record comes first in the array.
6. Knock out a fighter. The correct result panel appears and health is empty. Press R; both fighters return to their starting positions at full health, without stale hitboxes, stun or attack requests.

The automated acceptance test checks range, single-hit damage, blocking, knockout and rematch through the compiled scripts. Human testing remains necessary for input feel, simultaneous keyboard combinations and visual clarity.

**Extension exercise.** Add a heavy attack with a longer startup, greater range and longer recovery. Put its timings and damage into a move definition rather than duplicating the entire combat loop. Decide whether chip damage may knock out, whether air blocking exists, and whether attacks can trade. Write those decisions before implementing them.

**Avoid accidental complexity.** Do not add online synchronization until your local combat state and reset behavior are explicit. Two local input maps are not networking. A visual animation transition is not an authoritative combat-state transition. Keep those responsibilities separate so later animation edits cannot change damage rules unexpectedly.

---

# 16 Prefabs references and safe iteration

The examples contain six linked drones, four linked coins or two linked fighters. Select one instance to inspect its prefab reference and overrides. The asset browser can instantiate the same prefab again. The scripting examples use fixed name lists, so an extra instance does not automatically join gameplay; update the corresponding script contract when expanding the scene.

1. Select a drone instance and change Sprite Renderer width from 36 to 42. The Inspector records a property override. Other drones should retain their original width.
2. Use the override's Apply action to change the prefab base. Instances without an overriding value inherit it. Revert restores the inherited property for an individual instance. Undo should reverse an authored edit.
3. Use Unpack instance when you deliberately want an independent entity. Do not unpack merely to change a single property; an override already expresses that intention.
4. Save locally, close and reopen your project. Confirm references and overrides survive. Export a backup before experimenting with destructive structural changes.

**Stable references versus names.** Assets use IDs, so Move / rename preserves their references. Controllers point to clip IDs, clips point to image IDs and components point to controller IDs. Recreating an asset with the same filename creates a new identity. Editing an existing asset avoids that break. By contrast, the workshop scripts deliberately resolve scene entities by exact names for readability. Renaming Player or Coin 1 without changing the script is a different operation from renaming an asset.

**Deletion behavior.** The Animator editor prevents removing its last state, updates transition references when a state is renamed and removes attached transitions when a state is deleted. Deleting a parameter also removes rules using it; this avoids accidentally turning a conditional rule into an always-true transition. Undo the save if that deletion was unintended.

**Prefab boundary.** Nested prefabs and arbitrary structural overrides are outside this release. For significant structural changes, inspect the prefab base carefully or unpack intentionally. Do not assume the workflow has every capability of Unity or Unreal's prefab systems.

---

# 17 Export and verify a standalone game

Stop Play and set the intended startup scene. Choose Preview build to open the production files in another tab. The preview requires localhost or HTTPS, Service Workers and permission to open a tab. Choose Build ZIP to download the same kind of static build for independent hosting.

1. Extract the entire game ZIP into a fresh directory. Keep index.html, project data, scripts and all assets together. A partial copy can produce a loader error or missing script.
2. Serve that directory over HTTP. From the ProtoMake project root, the included helper can serve an arbitrary export directory: `npm run preview:game -- my-game 4180`.
3. Confirm loading stages advance, Start appears, and gameplay begins after clicking it. Switch away and return; use Resume. Test a win or defeat and R restart. Test sound after an interaction gesture.
4. Upload the whole directory to your chosen static host. Relative paths support subdirectory hosting. Repeat the same checks at the deployed URL. No ProtoMake editor, external CDN or runtime TypeScript compiler is required by the game.

A reproducible command-line export uses:

```sh
npm run build:player
npm run export:game -- examples/prototypes/shooter/shooter.protomake.json my-game
npm run preview:game -- my-game 4180
```

The export destination must be empty. Do not overwrite your only custom build as a troubleshooting step. The bundled `npm run preview:prototypes` command serves all three completed examples from one launcher.

**Loading diagnostics.** The player displays a spinner, stage and elapsed seconds. Individual asynchronous stages time out after 30 seconds; an independent HTML watchdog reports a 35-second stall. A spinner only proves the UI is responsive. The stage/error text identifies where initialization stopped. An infinite synchronous user script can block both rendering and timers.

**Regression lesson.** The earlier player hung because startup awaited a renderer module that imported shared exports from the waiting entry module. Startup now runs inside an async function without blocking module evaluation. The build rejects top-level await in player chunks. File availability and passing logic tests alone had not caught that browser module-evaluation problem.

---

# 18 Troubleshooting and your next prototype

| Symptom                  | First useful check                                                               |
| ------------------------ | -------------------------------------------------------------------------------- |
| npm ci fails             | Correct folder, package-lock.json present, supported Node version, fresh archive |
| Play fails on a name     | Exact entity name and capitalization; attach only the main behaviour             |
| Script import fails      | Import Helpers.ts and the main script together into Assets/Scripts               |
| Dark sprites             | Ambient fill, active lights, sprite lit flag, range and cone direction           |
| Animation never changes  | Controller attached, active bool exists, conditions and script owner correct     |
| Sound is silent          | Click game/Start, SFX bus unmuted, source clip set, browser audio allowed        |
| Platformer falls through | Solid collider dimensions, body mode, gravity and collision matrix               |
| Preview tab fails        | Popups, Service Worker support, localhost/HTTPS; try the independent export      |
| Player file cannot load  | Serve the whole export over HTTP; do not mix old and new chunks                  |

**Verification evidence.** The release's automated suite covers the three gameplay flows, real Rapier integration, compiled script modules, animation edits, loading feedback and lighting math. Production and export checks are recorded in the repository. Automated checks do not replace manual GPU, keyboard, audio and interaction verification in target browsers, so each example should also be playtested before release.

**Useful source entry points.** Read the main script in each example's Scripts folder for game rules; Helpers.ts for bars and sprite visibility; packages/scripting/src/runtime.ts for ScriptContext; packages/animation/src/index.ts for playback and transitions; packages/renderer/src/lighting.ts for illumination; and tests/prototypes.test.ts for executable gameplay checks. These local sources are the implementation authority for this workshop. docs/lighting.md, docs/animation-audio.md and docs/web-build.md provide focused references.

**Mobile, appearance and continuity.** At 800 CSS pixels or below the editor switches to touch-sized Hierarchy, Scene, Inspector, Project, Console and Assets tabs; the Scene tab adds explicit Pan, zoom and Frame controls. Settings lets you choose the editor accent and surface colours while ProtoMake derives readable foreground colours automatically. Cloud sync is optional: with `npm run dev:account` or a deployed ProtoMake account server, projects can be saved and reopened across browsers/devices with revision-conflict protection. The public GitHub Pages alpha needs no backend: Save locally uses IndexedDB, while Export backup/Import project provide portable cross-device continuity.

**Next step.** Choose one example and make a small original variation with a clear completion condition. Write three acceptance checks before adding features. Keep an exported playable build and a `.protomake.json` backup at each milestone. A useful portfolio extension should explain a design choice, demonstrate its implementation and show how you verified it—not merely add more systems.

The supplied geometric PNGs and short WAV are workshop placeholder assets. They are included for use and modification with the project; retain the repository license and third-party notices when redistributing ProtoMake. Replace the presentation with your own art and sound when developing a distinctive game.
