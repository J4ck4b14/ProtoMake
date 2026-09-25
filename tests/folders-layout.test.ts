// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { EditorModel } from '../packages/editor/src/model';
import {
  folders,
  createFolder,
  moveFolder,
  deleteFolder,
} from '../packages/editor/src/folders';
import { installLayout } from '../packages/editor/src/layout';
import { guid } from '@protomake/core';
it('moves a folder subtree without changing asset GUIDs, retains empty folders and undoes the move', () => {
  const m = new EditorModel(),
    id = guid();
  createFolder(m, 'Assets/Art');
  createFolder(m, 'Assets/Art/Empty');
  m.change('Asset', () => {
    m.project.assets.push({
      id,
      path: 'Assets/Art/notes.txt',
      kind: 'text',
      mime: 'text/plain',
      data: 'a',
      width: 0,
      height: 0,
    });
  });
  moveFolder(m, 'Assets/Art', 'Assets/Visuals');
  expect(m.project.assets[0]!.id).toBe(id);
  expect(m.project.assets[0]!.path).toBe('Assets/Visuals/notes.txt');
  expect(folders(m)).toContain('Assets/Visuals/Empty');
  expect(() => deleteFolder(m, 'Assets/Visuals')).toThrow('contents');
  m.undo();
  expect(m.project.assets[0]!.path).toBe('Assets/Art/notes.txt');
  const loaded = new EditorModel();
  loaded.load(m.project);
  expect(folders(loaded)).toContain('Assets/Art/Empty');
  expect(() => createFolder(loaded, '../Escape')).toThrow();
});
it('remembers keyboard resizing and resets track sizes without editing project data', () => {
  localStorage.clear();
  const app = document.createElement('div'),
    workspace = document.createElement('div'),
    bottom = document.createElement('div');
  for (let i = 0; i < 3; i++) {
    workspace.append(document.createElement('aside'));
    bottom.append(document.createElement('aside'));
  }
  app.append(workspace, bottom);
  document.body.append(app);
  const reset = installLayout(app, workspace, bottom);
  const splitter = app.querySelector('[aria-label="Resize left panel"]')!;
  splitter.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
  );
  expect(app.style.getPropertyValue('--left-size')).toBe('240px');
  expect(JSON.parse(localStorage.getItem('protomake.layout.v1')!).left).toBe(
    240,
  );
  reset();
  expect(app.style.getPropertyValue('--left-size')).toBe('230px');
  app.remove();
});
