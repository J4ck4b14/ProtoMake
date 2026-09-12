// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { EditorModel } from '@protomake/editor';
import { GRAPH_MIME } from '@protomake/graphs';
import { editBehaviourGraph } from '../packages/editor/src/graph-editor';

it('creates and edits a graph through the searchable node workspace', () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
  const model = new EditorModel();
  editBehaviourGraph(model, () => {});
  const search = document.querySelector<HTMLInputElement>(
    '[aria-label="Node search"]',
  )!;
  search.value = 'play sound';
  search.dispatchEvent(new Event('input'));
  [...document.querySelectorAll<HTMLButtonElement>('.graph-palette button')]
    .find((item) => item.textContent?.includes('Play Audio'))!
    .click();
  expect(document.querySelectorAll('.graph-node')).toHaveLength(1);
  [...document.querySelectorAll<HTMLButtonElement>('dialog button')]
    .find((item) => item.textContent === 'Duplicate')!
    .click();
  expect(document.querySelectorAll('.graph-node')).toHaveLength(2);
  const graphAsset = model.project.assets.find(
    (item) => item.mime === GRAPH_MIME,
  )!;
  expect(JSON.parse(graphAsset.data).nodes).toHaveLength(2);
  document
    .querySelector<HTMLButtonElement>('dialog button[title="Close"]')!
    .click();
  expect(document.querySelector('.graph-dialog')).toBeNull();
});
