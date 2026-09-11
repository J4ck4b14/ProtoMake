# ProtoMake editor — Milestones 1–4

Run `npm ci` and `npm run dev` from the directory containing package.json. The root page now opens the editor; `/foundation.html` keeps the original Milestone 0 harness.

Create entities through Hierarchy; select in the tree or scene, with Shift/Ctrl for multi-selection. Empty-space dragging selects a marquee. Q/W/E/R/H select selection/move/rotation/scale/pan tools. Use the visible axis handles, rotation ring or scale squares to transform. F frames selected entities (or all entities when selection is empty). Middle-drag or Space-drag pans; wheel zooms at the pointer. Grid and snapping have independent toggles; Alt bypasses snapping. Rotate snaps in 15-degree increments; scale snaps in 0.1 increments. Arrow keys nudge by one world unit; Shift uses grid spacing. Escape cancels an active gesture.

The Inspector edits registered component properties. Transform exposes its canonical affine basis and x/y translation, retaining shear exactly. Author note is a working editor annotation component, not a runtime behavior. Add/remove/reset participate in undo. Parent selection and hierarchy dropping preserve world transforms. Dropping on the root control unparents selected roots. Duplicate/Delete apply to selected subtrees. Ctrl/Cmd+C/V uses a session-local scene clipboard; pasted roots receive a 24-unit offset. Ctrl/Cmd+D duplicates. Ctrl/Cmd+Z and Shift+Z undo/redo. Continuous gestures commit one history entry; history retains 100 project snapshots and is not serialized.

Project Browser creates, opens, renames, duplicates and deletes scenes, and sets the startup scene. Project name edits are undoable. Save/Ctrl+S always writes to IndexedDB under the current browser origin. Open lists those local saves. Export JSON remains the portable offline backup. The optional **Account** dialog can also save/open projects through a reachable ProtoMake account server; linked projects sync on normal Save and cloud writes use revision-conflict checks so an older device cannot silently overwrite a newer copy. See [account continuity](account-sync.md).

Play creates a separate iframe containing a deserialized world. Pause/Step/Resume control its engine; Stop destroys that context and unlocks authored editing. Play renders through Pixi, simulates through Rapier and executes compiled project scripts. Click the game viewport to focus input. Script edits require Stop and rebuild on the next Play.

Automated acceptance covers save/reopen equivalence through an IndexedDB implementation, command undo/redo, transform gestures, component editing and isolation. DOM tests exercise the actual inspector and viewport event handlers with a mocked canvas context; they do not claim GPU or visual validation.

Assets imports images/text/scripts, places image sprites, moves or renames assets without changing their UUID, and blocks referenced deletion. Layer/order integers define deterministic sprite sorting. The highest-priority enabled Camera2D controls the game view; editor navigation stays independent.

Settings edits gravity, named physics layers, their symmetric collision matrix and JSON input definitions. It also exposes editor accent/surface colours; ProtoMake automatically chooses contrasting text/focus colours. Physics debug draws runtime collider geometry while Play is active. **Assets → + Script** creates TypeScript in the editor and double-clicking a `.ts` asset opens the source editor; the Scripts menu remains a shortcut. The source editor protects unsaved browser-local drafts and supports Ctrl/Cmd+S. Exposed fields appear in Inspector after attachment; see docs/scripting.md.

## Workspace and organization

Panel dividers support pointer dragging, keyboard arrows and double-click reset. Sizes persist per browser in local storage; Reset layout restores defaults. Asset folders support empty folders, subtree moves, drag-to-folder rows and dependency-safe deletion. Project scenes have explicit folder assignments. Hierarchy Group selection creates a normal parent transform. Folder and grouping changes participate in project history; layout preferences do not.

Prefab actions and override visualization are documented in [prefabs](prefabs.md). Frame/controller forms and Mixer are in [animation/audio](animation-audio.md). Build ZIP and production Preview build are in [web build](web-build.md).


## Mobile workspace

Desktop remains the primary layout. At 800 CSS pixels and below, the editor switches to a single-panel tab workspace instead of forcing the desktop split view. Hierarchy, Scene, Inspector, Project, Console and Assets are available as touch-sized tabs. The Scene tab adds explicit Pan, zoom-out, zoom-in and Frame controls so navigation does not depend on a mouse wheel or middle button. Dialogs and script editing expand to the small viewport. The desktop splitter layout is unchanged above the breakpoint.

Mobile support means the authoring UI is usable on a modern touch browser; it does not imply that every large-project workflow is equally comfortable on a phone. Account continuity is the intended way to move a project between desktop and mobile without relying on one browser's IndexedDB.
