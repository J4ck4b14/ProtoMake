# ProtoMake Milestones 1–4: hands-on acceptance

Work through this in order. A failure is useful: record what you did, expected vs actual behavior, and any Console error. Stop before Milestone 5 until these checks are satisfactory.

## 1. Boot and load the example

- Extract this archive into a separate folder. Run `npm ci` and `npm run dev` beside package.json. Open the URL printed by this run, not a stale tab pointing to the Milestone 0 server.
- You should see Hierarchy, Scene, Inspector, Project, Assets and Console panels.
- Click **Import JSON** and choose `examples/physics-playground/Playground.protomake.json`.
- You should see eight entities: Player, Floor, Step, Moving platform, Upper ledge, Trigger, Pulse marker and Camera. Assets should include two PNGs and four TypeScript files.
- Press F to frame the scene. Resize the browser at normal desktop widths; the Scene should resize and the panels remain usable.

Expected: no red errors on load. Empty non-rendering entities are editor markers; they are not sprites in Play.

## 2. Play, physics and isolation

- Press **Play**, wait for loading, then click the game viewport to focus it.
- Move with A/D or left/right arrows. Jump with Space. The player should fall onto the floor, stop at solid geometry and jump onto the step/platform. Holding jump must not produce repeated mid-air jumps.
- The moving platform should move side-to-side. The small marker above the upper ledge should pulse in opacity.
- Walk into the green trigger on the right. It should allow passage, change the player's tint and log entry/exit messages in the editor Console.
- Enable **Physics debug** while playing. Lines should match collider geometry. Toggle it off and confirm they disappear.
- Pause. Physics and scripted movement should stop. Step should advance one fixed interval. Resume should continue. Click outside the game while holding movement, then return; no key should remain stuck.
- Stop. The player, platform, tint and other runtime changes must return to the authored scene. Repeat Play/Stop three times and watch for errors or duplicated behavior.

Expected: runtime changes never become authored changes automatically. Sprite flip is visual; collider geometry is configured separately.

## 3. Editor selection and transforms

- Select Player in Hierarchy, then select it in the scene. Both selections must agree.
- Shift-click several entities; drag a marquee from empty space. Ctrl/Cmd+A selects all.
- Use **W / Move**: drag the red X arrow, green Y arrow and center square separately. Only the selected axis should move for an axis drag.
- Use **E / Rotate** and drag the ring. Use **R / Scale** and drag the square handles.
- Test snapping, Alt to bypass it, the grid toggle, wheel zoom and middle-mouse/Space dragging to pan. F should frame the selection.
- Undo each drag once: the entire gesture should revert in one step. Redo should restore it. Escape during a drag should cancel it.
- Create a plain entity and a child. Reparent using the Inspector and hierarchy drag/drop. Unparent to scene root. World placement should stay unchanged.
- Duplicate a parent subtree; edit the duplicate and confirm the original is independent. Delete it and Undo.

Expected: cycles and invalid transforms report errors without half-applying a change. Physics entities with shear or zero scale are rejected at Play; test arbitrary affine hierarchy edits on plain entities first.

## 4. Persistence and scenes

- Create a second scene, add/rename entities, and add an Author note component. Edit the note, reset it, remove it, Undo and Redo.
- Rename the scene, duplicate it, delete the duplicate and Undo. Switch back to the first scene and verify its data remains intact.
- Save while the second scene is active. Reload the page, click Open and select the project.
- The same project and active scene should reopen with matching entities, parents, properties and assets.
- Export JSON, create a fresh project, then import the exported file. Check the scene again.

Expected: Save clears the unsaved indicator only on success. New projects do not erase other saved projects. Browser storage is local to its origin; exported JSON is your portable backup.

## 5. Rendering and asset references

- Import `Images/Actor.png` and `Images/Tile.png` from the example folder into a **new project** (so their paths do not collide with existing assets).
- Select each asset and use **Place sprite**. Import one of your own PNG/JPEG/WebP files too.
- Change sprite width/height, tint, opacity, flipX/flipY and anchorX/anchorY. Overlap sprites and change layer/order: higher values should appear in front. Clicking overlaps should select the visually topmost sprite.
- Select an asset, choose **Move / rename**, and move it to another relative Assets path. Existing sprites must retain it.
- Try deleting a referenced asset. The editor should report which entity uses it. Delete an unreferenced asset and confirm it is removed.
- Add Camera 2D to an entity, change its zoom/background/viewport and press Play. Camera zoom controls the game view independently of editor navigation.

Expected: image files decode, persist and render in both Scene and Play. Missing/incompatible references are errors, not silently dropped content.

## 6. Physics and input configuration

- In the example select Player and vary gravityScale, damping and velocity defaults. Stop/Edit/Play between changes.
- Change a collider to a sensor and verify it reports contact without blocking. In a test scene try Circle Collider and Capsule Collider on uniformly scaled entities.
- Open Settings. Temporarily change gravity Y to zero. Play: the player should no longer fall under gravity.
- Restore gravity. Disable the **Actors ↔ World** pair in the collision matrix. Play: the player should pass through World-layer platforms. Restore it afterward.
- In input definitions change Jump's `Space` binding to `KeyJ`. Play: J should jump and Space should stop jumping. Undo settings or restore Space.
- If you have a gamepad, test its left stick and bottom face button. This needs your hardware; the automated gamepad test uses a synthetic device state.

Expected: the two halves of the matrix update together; undefined layers, duplicate action names and unknown bindings are rejected.

## 7. Create your own script

- Create/select a plain entity and add Sprite Renderer. Keep its texture empty for a visible tinted rectangle.
- Click **Scripts**, leave New script selected and give it a new path such as `Assets/Scripts/MyMover.ts`.
- Compile and Save the provided MovingPlatform template. Then **Attach to selection** and Close.
- In Inspector edit `speed` and `distance`. Play: the rectangle should move. Stop: it should return to its authored transform.
- Reopen the script, change its motion, Save and Play again. The changed source should be compiled afresh.
- Test a completely different behavior: create another script from `examples/physics-playground/Scripts/Pulse.ts` under a new path and attach it to another sprite. Both behaviors must work without editing packages/.
- For an error check, remove a closing brace and press Compile. Expect a source-specific diagnostic. Restore it. Then temporarily throw `new Error('Acceptance test')` inside update, Save and Play. Expect a contextual runtime error and stopped/faulted execution. Stop, remove the throw and retry.
- On the example's Trigger entity, change the exposed `target` entity reference and check the chosen sprite receives the tint.

Expected: fields come from static `export const fields` metadata. Script source is project data. Stop/Edit/Play is the supported rebuild loop; there is no state-preserving hot reload yet.

## Send back

For each failed check, send:

- The numbered section and shortest reproduction steps.
- What you expected and what happened.
- A screenshot plus the editor Console message (and browser Console if the editor did not start).
- Browser/OS, and whether `npm run dev` or `npm run preview` was used.
- Your exported `.protomake.json` if the problem depends on the project.

If all sections pass, the next work is Milestone 5 (prefabs), followed by 6 (animation/audio), then 7 (creator-game web export).
