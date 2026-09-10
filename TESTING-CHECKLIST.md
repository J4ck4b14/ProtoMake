# ProtoMake 0.7 hands-on acceptance

Start with the new Milestones 5–7 checks below, then briefly regress editing/save/physics. The automated tests do not establish rendered pixels, audible output, actual downloads or browser Service Worker behavior.

## 1. Start and import

Extract into a fresh folder. Run `npm ci` then `npm run dev` beside package.json and package-lock.json. The first command to start the editor now builds the standalone player first; wait for Vite's URL. Import `examples/milestones-5-7/Workshop.protomake.json` with **Import JSON**.

Expected: the physics playground plus **Enemy 01–10**, all linked to one prefab. The Assets folder selector includes Images, Audio, Animations, Scripts, Prefabs and an empty folder. Existing v1–v3 projects migrate automatically when opened; export a backup before replacing your working copy.

## 2. Resize and organize

- Drag both vertical dividers beside the Scene and the horizontal divider above the bottom panels. Resize Project, Console and Assets using their bottom-row vertical dividers.
- Focus a divider with Tab and use arrow keys. Double-click a divider to reset it, or use **Reset layout** for everything. Reload: the chosen sizes should remain.
- In Assets, create a folder, enter it and import an image. Create a child folder; drag an asset onto its folder row. Use **Move / rename** to move a selected asset to a different full relative path.
- Rename a folder that contains assets. IDs and existing references must remain intact. Deleting a populated folder should fail; deleting an empty one should succeed. Undo/Redo and save/reopen.
- Assign the active scene a folder using **Scene folder** in Project. Its path should appear in the sorted scene list and survive reopening.
- In Hierarchy, select plain entities and **Group selection**. Use children/parenting to organize scene objects. Groups are transform entities, not asset folders.

Expected: resizing affects only your local layout, not the scene or Undo history. Very narrow screens retain a desktop minimum width. An asset folder rename that would break imports from outside that folder is rejected with a script diagnostic.

## 3. Prefabs

- Select **Enemy 10**. Its exposed script speed is **3**; the other enemies use **1**. The Inspector shows the prefab path and overrides.
- Select **Enemy 01**, change Sprite Renderer tint and click **Apply to base** beside that tint override. Every enemy should inherit the tint; Enemy 10 must keep speed 3 and all instances must keep their individual positions.
- Undo once, then Redo. Save/reopen and verify the same result.
- On Enemy 10, click **Revert** beside speed. It should become 1. Undo restores 3.
- Select the prefab asset under Assets/Prefabs and click **Instantiate prefab**. Move it, duplicate it, then change the base again: both copies should remain linked.
- Create a plain parent/child hierarchy, select its root and **Create prefab**. Instantiate it and confirm both entities and their relationship appear.
- **Unpack instance** should preserve appearance but stop inheritance. Deleting/reparenting linked children should require unpacking; deleting a whole instance should work and Undo should restore it.

## 4. Animation and sound

- Play, then click the game viewport. Move with A/D or arrows; jump with Space.
- At rest, the player alternates between two warm-colored frames. While moving, it alternates faster between two blue frames. Stopping returns to the resting state. Jumping plays a short tone through its AudioSource.
- Pause: movement, animation and sound freeze. Step advances one simulation interval; sound stays suspended until Resume. Stop restores authored positions/properties. Repeat Play/Stop and check for duplicate audio or leftover movement.
- Stop. Under Assets/Animations, select a clip and **Edit animation**. Reorder frames, change duration/FPS, loop and speed. Save and Play again.
- Edit the Animator controller. Inspect initial state, named states, bool parameter `moving` and both transition rules. Change a state clip or condition, save and verify the result. Invalid state/clip/parameter references should fail rather than save silently.
- Create your own clip with **+ Animation clip**, then **+ Animator**. Select a Sprite Renderer entity and **Attach media** with the controller selected.
- Import your own WAV/MP3/OGG, attach it, enable Play on awake and looping. Test volume, playback rate and the Music bus. In **Mixer**, mute Music: only that bus should mute; Master should mute everything. Add a custom bus and assign it to the source.

Expected: gamepad and real audio-device/codec behavior require your hardware. The workshop's animation and audio are ordinary project data and script calls, not engine special cases.

## 5. Standalone game build

- Stop Play; set the desired startup scene. Click **Build ZIP**. Expect a successful Console result and a downloaded ZIP.
- Click **Preview build**, allow its popup if needed and click Start. Test movement, animation, jumping sound, collisions and the trigger. Hide the tab and return: Resume should be offered.
- Extract the downloaded ZIP to an empty directory and serve it independently, or upload the entire directory to static hosting. Test it with the ProtoMake editor closed. Test a subdirectory URL as well as a root URL.
- The download must contain index.html, assets/, scripts/, scripts.json, project.protomake.json, BUILD-REPORT.json and DEPLOY.txt. No npm install should be required on the game host.
- To test the bundled example locally, run `npm run preview:game` from the repository and open the printed URL. This serves only `examples/milestones-5-7/web-build/`.
- Break a script's syntax or remove a required asset in a copied project and build: expect a clear error before a ZIP is created. Restore the project afterward.

## 6. Regression and report

Briefly check multi-selection, move/rotate/scale, undo/redo, save/reopen, JSON round trip, physics debug, input focus loss and Play isolation.

For any failure send the numbered check, shortest reproduction, expected vs actual result, Console text/screenshot, browser/OS, and exported project if relevant. Distinguish editor Play, Preview build and independently hosted game. Milestone implementation is not a substitute for this manual acceptance run.

## Preview and authoring patch acceptance

- Run `npm run preview:game` and open the printed URL. Loading should advance through stages, then show the project title and Start. Start should enter the game; check movement, jumping, animation and sound. Changing tabs should offer Resume.
- In the editor import the Workshop JSON, choose Preview build and repeat. Also extract a fresh Build ZIP and serve it over HTTP. Old exports do not receive this patch automatically.
- Double-click an existing animation clip in Assets, change frame durations and save. Reopen it to check persistence, then Undo and check playback. Repeat for an Animator state or transition. Verify the entity's Animator Inspector shortcuts open its existing controller and clips.
- Set both a dynamic collider and its floor to restitution 1.5. The bounce should gain height. Restore ordinary values afterwards. Finite, nonnegative values remain required.
- If startup still fails, send the displayed stage/error, browser/version, and the first red browser Console message. Spinner motion proves only that the UI is responsive; stage text and timeout reveal loading progress or a stall.

## Complete release examples

Run `npm run preview:prototypes` and use the launcher. Play all three through a result and restart. Fighter controls: Player 1 A/D, Space, F attack, G guard; Player 2 arrows, Up jump, K attack, L guard. R rematches. The fighter is two-player local only.

Import each project's JSON to inspect and edit it. Scrub a clip, change a duration, connect states and reorder rules, then save/reopen and Undo. Change Ambient intensity and move/rotate a local light; verify editor Play and a rebuilt export show the same changes.

See the workshop chapters for per-game success/failure checks. `tests/prototypes.test.ts` additionally completes the platformer with keyboard input only, so a reachable route is covered beyond isolated jump tests.
