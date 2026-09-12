import { buildGame, downloadBuild, previewBuild } from './build-game';
import { showMixer } from './media-editor';
import { PrefabLink } from '@protomake/prefabs';
import { folders } from './folders';
import { installLayout } from './layout';
import { showScripts } from './scripts-panel';
import { showSettings } from './settings';
import { AssetsPanel, attachRenderer } from './assets-panel';
import {
  serializeProject,
  deserializeProject,
  type SceneData,
} from '@protomake/serialization';
import { EditorModel } from './model';
import { ProjectStorage } from './storage';
import { SceneViewport, type Tool } from './viewport';
import { Inspector } from './inspector';
import { PlayMode } from './play-mode';
import { node, button, input, ask } from './dom';
import './style.css';
import { applyAppearance, loadAppearance } from './appearance';
import { AccountSync } from './account-sync';
import { showAccount } from './account-dialog';
import { RecoveryManager } from './recovery';
import type { RecoverySnapshot } from './storage';
import { LIGHTING_CHANNELS, type LightingChannel } from '@protomake/renderer';
import { editBehaviourGraph } from './graph-editor';
applyAppearance(loadAppearance(), false);
const model = new EditorModel(),
  storage = new ProjectStorage(),
  accountSync = new AccountSync();
const app = document.getElementById('app')!,
  header = node('header'),
  brand = node('div', 'brand', 'F'),
  title = node('div', 'project-title'),
  menu = node('div', 'menu'),
  toolbar = node('div', 'toolbar'),
  workspace = node('div', 'workspace'),
  hierarchy = node('aside', 'hierarchy panel'),
  sceneArea = node('section', 'scene-area'),
  sceneHeader = node('div', 'scene-header'),
  canvas = node('canvas', 'scene-canvas'),
  playHost = node('div', 'play-host'),
  inspectorHost = node('aside', 'inspector panel'),
  bottom = node('div', 'bottom'),
  projectBrowser = node('section', 'project panel'),
  consolePanel = node('section', 'console panel'),
  consoleBody = node('div', 'console-body'),
  status = node('footer'),
  mobileNav = node('nav', 'mobile-nav'),
  mobileViewTools = node('div', 'mobile-view-tools');
canvas.tabIndex = 0;
canvas.setAttribute('aria-label', 'Scene viewport');
playHost.hidden = true;
header.append(brand, title, menu);
sceneHeader.append(node('strong', '', 'Scene'));
sceneArea.append(sceneHeader, canvas, playHost);
hierarchy.append(node('h2', '', 'Hierarchy'));
inspectorHost.append(node('h2', '', 'Inspector'));
const inspectorBody = node('div');
inspectorHost.append(inspectorBody);
workspace.append(hierarchy, sceneArea, inspectorHost);
consolePanel.append(node('h2', '', 'Console'), consoleBody);
bottom.append(projectBrowser, consolePanel);
app.append(
  header,
  toolbar,
  mobileNav,
  mobileViewTools,
  workspace,
  bottom,
  status,
);
function log(message: string, error = false): void {
  const line = node(
      'p',
      error ? 'error' : '',
      `${new Date().toLocaleTimeString()}  ${message}`,
    ),
    scriptLocation = /(?:^|\s)(Assets\/[^:\n]+\.ts):(\d+):(\d+)/.exec(message);
  if (scriptLocation) {
    const asset = model.project.assets.find(
      (candidate) => candidate.path === scriptLocation[1],
    );
    if (asset) {
      const jump = button('Open error', () =>
        showScripts(model, log, asset.id, {
          line: Number(scriptLocation[2]),
          column: Number(scriptLocation[3]),
        }),
      );
      jump.classList.add('console-jump');
      line.append(' ', jump);
    }
  }
  consoleBody.prepend(line);
  while (consoleBody.children.length > 60)
    consoleBody.lastElementChild?.remove();
}
function run(action: () => void): void {
  try {
    action();
  } catch (error) {
    log(String(error), true);
  }
}
function asyncRun(action: () => Promise<void>): void {
  void action().catch((error) => log(String(error), true));
}
const recovery = new RecoveryManager(model, storage, log);
const viewport = new SceneViewport(canvas, model, (error) =>
    log(String(error), true),
  ),
  inspector = new Inspector(
    inspectorBody,
    model,
    run,
    (assetId) => showScripts(model, log, assetId),
    (assetId) => editBehaviourGraph(model, log, assetId),
  ),
  play = new PlayMode(playHost, model, log, refresh);

const mobilePanels = [
  ['hierarchy', 'Hierarchy'],
  ['scene', 'Scene'],
  ['inspector', 'Inspector'],
  ['project', 'Project'],
  ['console', 'Console'],
  ['assets', 'Assets'],
] as const;
function setMobilePanel(panel: (typeof mobilePanels)[number][0]): void {
  app.dataset.mobilePanel = panel;
  for (const child of mobileNav.querySelectorAll('button'))
    child.classList.toggle('active', child.dataset.panel === panel);
  requestAnimationFrame(() => viewport.draw());
}
for (const [panel, label] of mobilePanels) {
  const control = button(label, () => setMobilePanel(panel));
  control.dataset.panel = panel;
  mobileNav.append(control);
}
mobileViewTools.append(
  button('Pan', () => {
    viewport.tool = 'pan';
    refresh();
  }),
  button('−', () => viewport.zoomBy(1 / 1.25), 'Zoom out'),
  button('+', () => viewport.zoomBy(1.25), 'Zoom in'),
  button('Frame', () => viewport.frameSelected()),
  button('Gizmos', () => {
    viewport.showGizmos = !viewport.showGizmos;
    viewport.draw();
  }),
  button('Light debug', () => {
    viewport.lightingDebug = !viewport.lightingDebug;
    viewport.draw();
  }),
);
setMobilePanel('scene');

let clipboard: SceneData | undefined;
function canLeave(): boolean {
  return (
    !model.dirty ||
    confirm(
      'Discard unsaved changes? Save or export first if you need to keep them.',
    )
  );
}
function exportBackup(): void {
  const blob = new Blob([serializeProject(model.project, model.registry)], {
      type: 'application/json',
    }),
    url = URL.createObjectURL(blob),
    anchor = node('a');
  anchor.href = url;
  anchor.download =
    model.project.name.replace(/[^a-zA-Z0-9_-]/g, '_') + '.protomake.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  log(`Exported portable backup for ${model.project.name}`);
}

menu.append(
  button('New project', () =>
    asyncRun(async () => {
      if (model.locked || !canLeave()) return;
      const name = await ask('Project name', 'Untitled project');
      if (name) model.newProject(name);
    }),
  ),
  button(
    'Open local',
    () => asyncRun(openProjects),
    'Open a project saved in this browser',
  ),
  button(
    'Save locally',
    () => asyncRun(save),
    'Save this project in this browser · Ctrl/Cmd+S',
  ),
  button(
    'Export backup',
    () => run(exportBackup),
    'Download a portable .protomake.json backup',
  ),
  button(
    'Import project',
    () => fileInput.click(),
    'Open a portable .protomake.json project',
  ),
);
const fileInput = node('input');
fileInput.type = 'file';
fileInput.accept = '.protomake.json,.json,application/json';
fileInput.hidden = true;
fileInput.onchange = () =>
  asyncRun(async () => {
    const file = fileInput.files?.[0];
    if (file && canLeave()) {
      model.load(deserializeProject(await file.text(), model.registry));
      log(`Imported ${file.name}`);
    }
    fileInput.value = '';
  });
app.append(fileInput);
async function save(): Promise<void> {
  if (model.locked) return;
  const snapshot = structuredClone(model.project);
  await storage.save(snapshot, model.sceneId);
  model.markSaved(snapshot);
  recovery.clearEmergency(snapshot.id);
  log(`Saved ${snapshot.name} locally`);
  if (accountSync.signedIn && accountSync.isLinked(snapshot.id)) {
    const revision = await accountSync.save(snapshot, model.sceneId);
    log(`Synced ${snapshot.name} to account · cloud revision ${revision}`);
  }
}
async function openProjects(): Promise<void> {
  if (model.locked) return;
  const projects = await storage.list(),
    dialog = node('dialog'),
    heading = node('h2', '', 'Local projects');
  dialog.append(heading);
  if (!projects.length)
    dialog.append(
      node(
        'p',
        '',
        'No local projects yet. Create a project and choose Save locally.',
      ),
    );
  for (const project of projects) {
    const row = node('div', 'saved-project');
    row.append(
      button(
        `${project.name} · ${new Date(project.updated).toLocaleString()}`,
        () =>
          asyncRun(async () => {
            if (!canLeave()) return;
            const saved = await storage.loadSession(project.id);
            model.load(saved.project);
            if (
              saved.activeScene &&
              model.project.scenes.some((s) => s.id === saved.activeScene)
            )
              model.switchScene(saved.activeScene);
            dialog.close();
            log(`Opened ${project.name}`);
          }),
      ),
      button('Delete local copy', () =>
        asyncRun(async () => {
          if (!confirm(`Delete the saved copy of ${project.name}?`)) return;
          await storage.delete(project.id);
          row.remove();
        }),
      ),
    );
    dialog.append(row);
  }
  dialog.append(button('Close', () => dialog.close()));
  dialog.onclose = () => dialog.remove();
  document.body.append(dialog);
  dialog.showModal();
}
function recoverySummary(snapshot: RecoverySnapshot): string {
  const scenes = snapshot.project.scenes.length,
    entities = snapshot.project.scenes.reduce(
      (total, scene) => total + scene.entities.length,
      0,
    ),
    assets = snapshot.project.assets.length;
  return `${scenes} scene${scenes === 1 ? '' : 's'} · ${entities} entities · ${assets} assets`;
}

function restoreRecovery(snapshot: RecoverySnapshot): void {
  if (!canLeave()) return;
  model.load(snapshot.project, false);
  if (
    snapshot.activeScene &&
    model.project.scenes.some((scene) => scene.id === snapshot.activeScene)
  )
    model.switchScene(snapshot.activeScene);
  log(
    `Restored recovery snapshot for ${snapshot.projectName}; save when satisfied`,
  );
}

function compareRecovery(snapshot: RecoverySnapshot): void {
  const dialog = node('dialog'),
    heading = node('h2', '', 'Recovery comparison'),
    current = structuredClone(model.project);
  const currentScenes = current.scenes.length,
    currentEntities = current.scenes.reduce(
      (total, scene) => total + scene.entities.length,
      0,
    ),
    snapshotEntities = snapshot.project.scenes.reduce(
      (total, scene) => total + scene.entities.length,
      0,
    );
  dialog.append(
    heading,
    node(
      'p',
      '',
      `Recovery · ${new Date(snapshot.updated).toLocaleString()} · ${recoverySummary(snapshot)}`,
    ),
    node(
      'p',
      '',
      `Current · ${currentScenes} scenes · ${currentEntities} entities · ${current.assets.length} assets`,
    ),
    node('p', 'settings-note', ''),
    button('Close', () => dialog.close()),
  );
  const note = dialog.querySelector('.settings-note');
  if (note)
    note.textContent = `${snapshotEntities - currentEntities >= 0 ? '+' : ''}${snapshotEntities - currentEntities} entities · ${snapshot.project.assets.length - current.assets.length >= 0 ? '+' : ''}${snapshot.project.assets.length - current.assets.length} assets compared with the current project.`;
  dialog.onclose = () => dialog.remove();
  document.body.append(dialog);
  dialog.showModal();
}

async function showRecovery(preferred?: RecoverySnapshot): Promise<void> {
  const snapshots = preferred
      ? [
          preferred,
          ...(await recovery.list()).filter(
            (item) => item.key !== preferred.key,
          ),
        ]
      : await recovery.list(),
    dialog = node('dialog', 'recovery-dialog'),
    heading = node('h2', '', 'Recovery journal');
  dialog.append(
    heading,
    node(
      'p',
      'settings-note',
      'Autosaves are separate from Save and rotate automatically. Restore keeps the recovered project dirty so you can inspect it before committing.',
    ),
  );
  if (!snapshots.length)
    dialog.append(node('p', 'empty', 'No recovery snapshots yet.'));
  for (const snapshot of snapshots) {
    const row = node('div', 'recovery-row'),
      info = node('div');
    info.append(
      node('strong', '', snapshot.projectName),
      node(
        'div',
        'settings-note',
        `${snapshot.reason === 'checkpoint' ? 'Checkpoint' : snapshot.key.startsWith('emergency:') ? 'Emergency' : 'Autosave'} · ${new Date(snapshot.updated).toLocaleString()}`,
      ),
      node('div', 'settings-note', recoverySummary(snapshot)),
    );
    const actions = node('div', 'actions');
    actions.append(
      button('Restore', () => {
        restoreRecovery(snapshot);
        dialog.close();
      }),
      button('Compare', () => compareRecovery(snapshot)),
      button('Discard', () =>
        asyncRun(async () => {
          await recovery.discard(snapshot);
          row.remove();
        }),
      ),
    );
    row.append(info, actions);
    dialog.append(row);
  }
  const actions = node('div', 'actions');
  actions.append(
    button('Create checkpoint', () =>
      asyncRun(async () => {
        await recovery.capture('checkpoint');
        dialog.close();
      }),
    ),
    button('Close', () => dialog.close()),
  );
  dialog.append(actions);
  dialog.onclose = () => dialog.remove();
  document.body.append(dialog);
  dialog.showModal();
}

const undo = button('Undo', () => run(() => model.undo())),
  redo = button('Redo', () => run(() => model.redo()));
toolbar.append(undo, redo, node('span', 'divider'));
const toolButtons = new Map<Tool, HTMLButtonElement>();
for (const [tool, label] of [
  ['select', 'Select · Q'],
  ['move', 'Move · W'],
  ['rotate', 'Rotate · E'],
  ['scale', 'Scale · R'],
  ['pan', 'Pan · H'],
] as const) {
  const b = button(label, () => {
    viewport.tool = tool;
    refresh();
  });
  toolButtons.set(tool, b);
  toolbar.append(b);
}
toolbar.append(button('Frame · F', () => viewport.frameSelected()));
const grid = input('Grid', '', 'checkbox');
grid.input.checked = true;
grid.input.onchange = () => {
  viewport.grid = grid.input.checked;
  viewport.draw();
};
const snapping = input('Snap', '', 'checkbox');
snapping.input.checked = true;
snapping.input.onchange = () => {
  viewport.snapping = snapping.input.checked;
};
const spacing = input('px', '16', 'number');
spacing.input.min = '1';
spacing.input.max = '512';
spacing.input.onchange = () => {
  if (
    Number.isFinite(spacing.input.valueAsNumber) &&
    spacing.input.valueAsNumber >= 1
  ) {
    viewport.spacing = spacing.input.valueAsNumber;
    viewport.draw();
  }
};
const gizmos = input('Gizmos', '', 'checkbox');
gizmos.input.checked = true;
gizmos.input.onchange = () => {
  viewport.showGizmos = gizmos.input.checked;
  viewport.draw();
};
const colliders = input('Colliders', '', 'checkbox');
colliders.input.checked = true;
colliders.input.onchange = () => {
  viewport.showColliders = colliders.input.checked;
  viewport.draw();
};
const lightingDebug = input('Light debug', '', 'checkbox');
lightingDebug.input.onchange = () => {
  viewport.lightingDebug = lightingDebug.input.checked;
  viewport.draw();
};
const lightingChannel = node('select');
lightingChannel.setAttribute('aria-label', 'Lighting debug channel');
for (const channel of LIGHTING_CHANNELS)
  lightingChannel.append(new Option(channel, channel));
lightingChannel.value = viewport.lightingChannel;
lightingChannel.onchange = () => {
  viewport.lightingChannel = lightingChannel.value as LightingChannel;
  viewport.draw();
};
toolbar.append(
  grid.row,
  snapping.row,
  spacing.row,
  gizmos.row,
  colliders.row,
  lightingDebug.row,
  lightingChannel,
  node('span', 'spacer'),
);
const playButton = button('▶ Play', () => run(() => play.start())),
  pause = button('Pause', () => run(() => play.pause())),
  step = button('Step', () => run(() => play.step())),
  stop = button('Stop', () => run(() => play.stop()));
toolbar.append(playButton, pause, step, stop);
function renderHierarchy(): void {
  hierarchy.replaceChildren(node('h2', '', 'Hierarchy'));
  const actions = node('div', 'actions');
  actions.append(
    button('+ Entity', () => run(() => model.createEntity())),
    button('Group selection', () =>
      run(() => {
        const roots = model.roots();
        model.change('Group selection', () => {
          const group = model.world.create('Group');
          for (const id of roots)
            model.world.setParent(model.entity(id), group, 'world');
          model.selection.clear();
          model.selection.add(model.world.get(group).guid);
        });
      }),
    ),
    button('+ Child', () =>
      run(() => model.createEntity('Child', [...model.selection][0] ?? null)),
    ),
    button('Duplicate', () => run(() => model.duplicate())),
    button('Delete', () => run(() => model.deleteSelection())),
  );
  hierarchy.append(actions);
  const tree = node('div', 'tree');
  tree.setAttribute('role', 'tree');
  tree.setAttribute('aria-label', 'Scene hierarchy');
  tree.setAttribute('aria-multiselectable', 'true');
  const entities = [...model.world.all()],
    pending = entities
      .filter((e) => e.parent === null)
      .reverse()
      .map((e) => ({ id: e.id, depth: 0 }));
  while (pending.length) {
    const { id, depth } = pending.pop()!,
      entity = model.world.get(id),
      row = node(
        'button',
        `tree-row ${model.selection.has(entity.guid) ? 'selected' : ''} ${model.world.isActive(id) ? '' : 'muted'}`,
        `${model.world.read(id, PrefabLink) ? '◆' : model.world.children(id).length ? '▾' : '◇'}  ${entity.name}`,
      );
    row.type = 'button';
    row.style.paddingLeft = `${12 + depth * 14}px`;
    row.setAttribute('role', 'treeitem');
    row.setAttribute('aria-selected', String(model.selection.has(entity.guid)));
    row.draggable = !model.locked;
    row.onclick = (e) => {
      if (e.shiftKey || e.ctrlKey || e.metaKey) model.toggle(entity.guid);
      else model.select([entity.guid]);
    };
    row.ondragstart = (e) => {
      if (!model.selection.has(entity.guid)) {
        model.selection.clear();
        model.selection.add(entity.guid);
        viewport.draw();
        inspector.render();
      }
      e.dataTransfer?.setData('application/x-protomake-entity', entity.guid);
    };
    row.ondragover = (e) => e.preventDefault();
    row.ondrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer?.types.includes('application/x-protomake-entity'))
        run(() => model.reparent(entity.guid));
    };
    tree.append(row);
    for (const child of [...model.world.children(id)].reverse())
      pending.push({ id: child, depth: depth + 1 });
  }
  const rootDrop = button('↳ Unparent to scene root', () =>
    run(() => model.reparent(null)),
  );
  rootDrop.ondragover = (e) => e.preventDefault();
  rootDrop.ondrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer?.types.includes('application/x-protomake-entity'))
      run(() => model.reparent(null));
  };
  hierarchy.append(tree, rootDrop);
  if (!entities.length)
    tree.append(node('p', 'empty', 'Create an entity to begin.'));
  if (model.locked)
    for (const b of hierarchy.querySelectorAll('button')) b.disabled = true;
}
function renderProject(): void {
  projectBrowser.replaceChildren(node('h2', '', 'Project'));
  const actions = node('div', 'actions');
  actions.append(
    button('+ Scene', () =>
      asyncRun(async () => {
        const name = await ask(
          'Scene name',
          `Scene ${model.project.scenes.length + 1}`,
        );
        if (name) run(() => model.createScene(name));
      }),
    ),
    button('Rename scene', () =>
      asyncRun(async () => {
        const name = await ask('Scene name', model.scene.name);
        if (name) run(() => model.renameScene(name));
      }),
    ),
    button('Duplicate scene', () => run(() => model.duplicateScene())),
    button('Delete scene', () => run(() => model.deleteScene())),
    button('Project name', () =>
      asyncRun(async () => {
        const name = await ask('Project name', model.project.name);
        if (name)
          run(() =>
            model.change('Rename project', () => {
              model.project.name = name;
            }),
          );
      }),
    ),
  );
  const folderSelect = node('select');
  folderSelect.setAttribute('aria-label', 'Scene folder');
  folderSelect.append(new Option('Project root', ''));
  for (const path of folders(model))
    folderSelect.append(new Option(path, path));
  folderSelect.value = model.project.sceneFolders[model.sceneId] ?? '';
  folderSelect.onchange = () =>
    run(() =>
      model.change('Move scene to folder', () => {
        if (folderSelect.value)
          model.project.sceneFolders[model.sceneId] = folderSelect.value;
        else delete model.project.sceneFolders[model.sceneId];
      }),
    );
  actions.append(folderSelect);
  const scenes = node('div', 'scene-list');
  for (const scene of [...model.project.scenes].sort(
    (a, b) =>
      (model.project.sceneFolders[a.id] ?? '').localeCompare(
        model.project.sceneFolders[b.id] ?? '',
      ) || a.name.localeCompare(b.name),
  )) {
    const b = button(
      `${scene.id === model.project.startupScene ? '◆' : '◇'} ${model.project.sceneFolders[scene.id] ? model.project.sceneFolders[scene.id] + '/' : ''}${scene.name}`,
      () => run(() => model.switchScene(scene.id)),
    );
    b.classList.toggle('selected', scene.id === model.sceneId);
    scenes.append(b);
  }
  actions.append(
    button('Set startup scene', () =>
      run(() =>
        model.change('Startup scene', () => {
          model.project.startupScene = model.sceneId;
        }),
      ),
    ),
  );
  projectBrowser.append(actions, scenes);
  if (model.locked)
    for (const b of projectBrowser.querySelectorAll('button'))
      b.disabled = true;
}
function refresh(): void {
  title.textContent = `${model.project.name}${model.dirty ? ' •' : ''}`;
  sceneHeader.replaceChildren(
    node('strong', '', model.scene.name),
    node(
      'span',
      '',
      `${model.world ? [...model.world.all()].length : 0} entities`,
    ),
  );
  undo.disabled = model.locked || !model.history.undoLabel;
  redo.disabled = model.locked || !model.history.redoLabel;
  undo.title = model.history.undoLabel ?? 'Nothing to undo';
  redo.title = model.history.redoLabel ?? 'Nothing to redo';
  for (const [tool, b] of toolButtons) {
    b.classList.toggle('active', viewport.tool === tool);
    b.disabled = model.locked;
  }
  playButton.disabled = play.state !== 'stopped';
  pause.disabled =
    play.state === 'stopped' ||
    play.state === 'loading' ||
    play.state === 'faulted';
  pause.textContent = play.state === 'paused' ? 'Resume' : 'Pause';
  step.disabled = play.state !== 'paused';
  stop.disabled = play.state === 'stopped';
  for (const b of menu.querySelectorAll('button')) b.disabled = model.locked;
  status.textContent = `${model.selection.size} selected · ${model.dirty ? 'Unsaved changes' : 'Saved locally'} · Drag handles to transform · Shift: multi-select · Alt: bypass snapping · Space / middle mouse: pan`;
  renderHierarchy();
  renderProject();
  inspector.render();
  viewport.draw();
}
model.onChange(refresh);
refresh();
log(
  'ProtoMake editor ready. Save locally stores projects in this browser; Export backup creates a portable .protomake.json file.',
);
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement)?.closest('input,textarea,select,dialog'))
    return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    asyncRun(save);
    return;
  }
  if (model.locked) return;
  const key = e.key.toLowerCase();
  if (mod && key === 'z') {
    e.preventDefault();
    run(() => (e.shiftKey ? model.redo() : model.undo()));
  } else if (mod && key === 'y') {
    e.preventDefault();
    run(() => model.redo());
  } else if (mod && key === 'd') {
    e.preventDefault();
    run(() => model.duplicate());
  } else if (mod && key === 'c') {
    e.preventDefault();
    clipboard = model.clipboard();
  } else if (mod && key === 'v') {
    e.preventDefault();
    if (clipboard) run(() => model.paste(clipboard!));
  } else if (mod && key === 'a') {
    e.preventDefault();
    model.select([...model.world.all()].map((entity) => entity.guid));
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    run(() => model.deleteSelection());
  } else if (!mod) {
    const tools: Record<string, Tool> = {
      q: 'select',
      w: 'move',
      e: 'rotate',
      r: 'scale',
      h: 'pan',
    };
    if (tools[key]) {
      viewport.tool = tools[key];
      refresh();
    } else if (key === 'f') viewport.frameSelected();
    else if (key === 'escape') {
      viewport.cancel();
      model.select([]);
    } else if (
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
    ) {
      e.preventDefault();
      const n = e.shiftKey ? viewport.spacing : 1;
      run(() =>
        model.translate(
          e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0,
          e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0,
        ),
      );
    }
  }
});
window.addEventListener('beforeunload', (e) => {
  if (model.dirty) {
    recovery.saveEmergency();
    e.preventDefault();
    e.returnValue = '';
  }
});

const assetHost = node('section', 'assets panel');
bottom.append(assetHost);
new AssetsPanel(assetHost, model, log);
void attachRenderer(sceneArea, viewport, model, log).catch((error) =>
  log(`Renderer unavailable: ${String(error)}`, true),
);

const STORAGE_NOTICE_KEY = 'protomake.storage-notice.v1';
function showStorageNotice(): void {
  try {
    if (localStorage.getItem(STORAGE_NOTICE_KEY)) return;
  } catch {
    // Browsers that block localStorage still have the visible save/export actions.
  }
  const dialog = node('dialog', 'storage-notice'),
    heading = node('h2', '', 'Where ProtoMake saves your work'),
    actions = node('div', 'actions');
  dialog.append(
    heading,
    node(
      'p',
      '',
      'Save locally stores the complete project in this browser using IndexedDB. It does not require an account or backend.',
    ),
    node(
      'p',
      '',
      'Browser storage is convenient, not a portable backup. Clearing site data, using private browsing, changing device, or moving ProtoMake to a different site can make local saves unavailable.',
    ),
    node(
      'p',
      'storage-notice-important',
      'Use Export backup regularly. The downloaded .protomake.json can be kept anywhere and reopened later with Import project.',
    ),
  );
  const dismiss = () => dialog.close();
  actions.append(
    button('Export backup now', () => run(exportBackup)),
    button('Got it', dismiss),
  );
  dialog.append(actions);
  dialog.onclose = () => {
    try {
      localStorage.setItem(STORAGE_NOTICE_KEY, 'seen');
    } catch {
      // The notice simply appears again next session when storage is unavailable.
    }
    dialog.remove();
  };
  document.body.append(dialog);
  dialog.showModal();
}

asyncRun(async () => {
  const snapshot = await recovery.newestRecoverable();
  if (snapshot) await showRecovery(snapshot);
  else showStorageNotice();
});

menu.append(
  button('Recovery', () => asyncRun(() => showRecovery())),
  button(
    'Cloud sync',
    () => showAccount(model, accountSync, log, canLeave),
    'Optional account-backed project continuity',
  ),
  button('Settings', () => showSettings(model, log)),
);

const debugControl = input('Physics debug', '', 'checkbox');
debugControl.input.onchange = () => play.setDebug(debugControl.input.checked);
toolbar.append(debugControl.row);

menu.append(button('Scripts', () => showScripts(model, log)));

const resetLayout = installLayout(app, workspace, bottom);
menu.append(button('Reset layout', resetLayout));

menu.append(button('Mixer', () => showMixer(model)));

let building = false;
menu.append(
  button('Build ZIP', () =>
    asyncRun(async () => {
      if (building) return;
      building = true;
      try {
        log('Building game…');
        const files = await buildGame(model);
        downloadBuild(files, model.project.name);
        log(`Build passed: ${files.length} static files`);
      } finally {
        building = false;
      }
    }),
  ),
  button('Preview build', () => {
    if (building) return;
    const tab = window.open('about:blank', '_blank');
    asyncRun(async () => {
      building = true;
      try {
        const files = await buildGame(model);
        await previewBuild(files, tab);
        log('Opened standalone production preview');
      } catch (e) {
        tab?.close();
        throw e;
      } finally {
        building = false;
      }
    });
  }),
);
