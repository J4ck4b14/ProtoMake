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
const model = new EditorModel(),
  storage = new ProjectStorage();
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
  status = node('footer');
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
app.append(header, toolbar, workspace, bottom, status);
function log(message: string, error = false): void {
  const line = node(
    'p',
    error ? 'error' : '',
    `${new Date().toLocaleTimeString()}  ${message}`,
  );
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
const viewport = new SceneViewport(canvas, model, (error) =>
    log(String(error), true),
  ),
  inspector = new Inspector(inspectorBody, model, run),
  play = new PlayMode(playHost, model, log, refresh);
let clipboard: SceneData | undefined;
function canLeave(): boolean {
  return (
    !model.dirty ||
    confirm(
      'Discard unsaved changes? Save or export first if you need to keep them.',
    )
  );
}
menu.append(
  button('New project', () =>
    asyncRun(async () => {
      if (model.locked || !canLeave()) return;
      const name = await ask('Project name', 'Untitled project');
      if (name) model.newProject(name);
    }),
  ),
  button('Open', () => asyncRun(openProjects)),
  button('Save', () => asyncRun(save)),
  button('Export JSON', () =>
    run(() => {
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
    }),
  ),
  button('Import JSON', () => fileInput.click()),
);
const fileInput = node('input');
fileInput.type = 'file';
fileInput.accept = '.json';
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
  log(`Saved ${snapshot.name}`);
}
async function openProjects(): Promise<void> {
  if (model.locked) return;
  const projects = await storage.list(),
    dialog = node('dialog'),
    heading = node('h2', '', 'Saved projects');
  dialog.append(heading);
  if (!projects.length)
    dialog.append(
      node('p', '', 'No saved projects yet. Create a project and press Save.'),
    );
  for (const project of projects) {
    const row = node('div', 'saved-project');
    row.append(
      button(project.name, () =>
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
      button('Delete saved copy', () =>
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
toolbar.append(grid.row, snapping.row, spacing.row, node('span', 'spacer'));
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
  status.textContent = `${model.selection.size} selected · ${model.dirty ? 'Unsaved changes' : 'Saved'} · Drag handles to transform · Shift: multi-select · Alt: bypass snapping · Space / middle mouse: pan`;
  renderHierarchy();
  renderProject();
  inspector.render();
  viewport.draw();
}
model.onChange(refresh);
refresh();
log(
  'ProtoMake editor ready. Save stores projects in this browser; export JSON for portable backups.',
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

menu.append(button('Settings', () => showSettings(model, log)));

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
