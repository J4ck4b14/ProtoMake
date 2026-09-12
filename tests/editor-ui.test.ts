// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import { EditorModel } from '@protomake/editor';
import { Inspector } from '../packages/editor/src/inspector';
import { SceneViewport } from '../packages/editor/src/viewport';
it('generic inspector edits and adds/removes a real component', () => {
  const model = new EditorModel(),
    id = model.createEntity('Actor'),
    host = document.createElement('div');
  document.body.append(host);
  const inspector = new Inspector(host, model, (action) => action());
  model.onChange(() => inspector.render());
  inspector.render();
  const name = host.querySelector<HTMLInputElement>('[aria-label="Name"]')!;
  name.value = 'Renamed';
  name.dispatchEvent(new Event('change'));
  expect(model.world.get(model.entity(id)).name).toBe('Renamed');
  host.querySelector<HTMLSelectElement>(
    '[aria-label="Component type"]',
  )!.value = 'editor.note';
  [...host.querySelectorAll('button')]
    .find((b) => b.textContent === 'Add component')!
    .click();
  expect(model.world.components(model.entity(id)).has('editor.note')).toBe(
    true,
  );
  const note = host.querySelector<HTMLInputElement>('[aria-label="Note"]')!;
  note.value = 'Keep this';
  note.dispatchEvent(new Event('change'));
  expect(model.world.components(model.entity(id)).get('editor.note')).toEqual({
    text: 'Keep this',
  });
  [...host.querySelectorAll('button')]
    .find((b) => b.textContent === 'Remove')!
    .click();
  expect(model.world.components(model.entity(id)).has('editor.note')).toBe(
    false,
  );
  host.remove();
});
it('viewport move handle makes one reversible transform and cancellation restores it', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('devicePixelRatio', 1);
  const context = new Proxy({}, { get: () => () => {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as never,
  );
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  canvas.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 800,
    height: 600,
    right: 800,
    bottom: 600,
    toJSON: () => ({}),
  });
  canvas.setPointerCapture = () => {};
  const model = new EditorModel(),
    id = model.createEntity();
  const viewport = new SceneViewport(canvas, model, (error) => {
    throw error;
  });
  viewport.snapping = false;
  function pointer(type: string, x: number, y: number) {
    canvas.dispatchEvent(
      new MouseEvent(type, {
        clientX: x,
        clientY: y,
        button: 0,
        bubbles: true,
      }),
    );
  }
  pointer('pointerdown', 440, 300);
  pointer('pointermove', 490, 330);
  pointer('pointerup', 490, 330);
  expect(model.world.worldPosition(model.entity(id))).toEqual([50, 0]);
  model.undo();
  expect(model.world.worldPosition(model.entity(id))).toEqual([0, 0]);
  pointer('pointerdown', 400, 300);
  pointer('pointermove', 500, 400);
  canvas.dispatchEvent(new Event('pointercancel'));
  expect(model.world.worldPosition(model.entity(id))).toEqual([0, 0]);
  viewport.dispose();
  canvas.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
