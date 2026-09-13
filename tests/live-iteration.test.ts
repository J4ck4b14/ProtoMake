// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { EditorModel } from '@protomake/editor';
import { RuntimeInspector } from '../packages/editor/src/runtime-inspector';
import { PlayMode } from '../packages/editor/src/play-mode';

it('renders runtime hierarchy, profiler and live/apply controls', () => {
  HTMLDialogElement.prototype.show = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
  const model = new EditorModel(),
    id = model.createEntity('Hero'),
    host = document.createElement('div'),
    play = new PlayMode(
      host,
      model,
      () => {},
      () => {},
    ),
    runtime = new RuntimeInspector(play, model, () => {});
  play.snapshot = {
    scene: 'Arena',
    state: 'running',
    settings: [
      { path: 'gravityY', label: 'Gravity Y', kind: 'number', value: 980 },
    ],
    entities: [
      {
        id,
        name: 'Hero',
        enabled: true,
        active: true,
        parent: null,
        components: [
          {
            type: 'protomake.transform',
            name: 'Transform',
            properties: [
              { path: 'local.4', label: 'x', kind: 'number', value: 12 },
            ],
          },
        ],
      },
    ],
    behaviours: [],
    graphs: [
      {
        graph: 'movement',
        node: 'speed',
        phase: 'update',
        values: { speed: 4 },
      },
    ],
    profile: {
      frameMs: 2,
      fixedSteps: 1,
      droppedSeconds: 0,
      systems: { scripts: 0.4 },
    },
  };
  runtime.open();
  const dialog = document.querySelector('.runtime-inspector')!;
  expect(dialog.textContent).toContain('Live hierarchy');
  expect(dialog.textContent).toContain('Hero');
  expect(dialog.textContent).toContain('Profiler');
  expect(dialog.textContent).toContain('Graph values');
  expect(dialog.querySelectorAll('button')).not.toHaveLength(0);
  dialog.querySelector<HTMLButtonElement>('[title="Close"]')!.click();
});
