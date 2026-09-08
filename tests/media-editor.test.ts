// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { EditorModel } from '../packages/editor/src/model';
import {
  editMedia,
  attachMedia,
  showMixer,
} from '../packages/editor/src/media-editor';
import { CLIP_MIME, CONTROLLER_MIME, Animator } from '@protomake/animation';
import { SpriteRenderer } from '@protomake/renderer';
import { guid } from '@protomake/core';
it('authors frame timing and an Animator using editor controls, then attaches it and edits mixer buses', () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
  const m = new EditorModel();
  m.createEntity('Animated');
  m.addComponent(SpriteRenderer.type);
  m.change('Image', () => {
    m.project.assets.push({
      id: guid(),
      path: 'Assets/Frame.png',
      kind: 'image',
      mime: 'image/png',
      data: 'data:image/png;base64,AA==',
      width: 1,
      height: 1,
    });
  });
  const click = (label: string) => {
    const button = [
      ...document.querySelectorAll<HTMLButtonElement>('dialog button'),
    ].find((b) => b.textContent === label);
    if (!button) throw new Error(`Missing button ${label}`);
    button.click();
  };
  editMedia(m, CLIP_MIME);
  const fps = document.querySelector<HTMLInputElement>(
    '[aria-label="Frames per second"]',
  )!;
  fps.value = '8';
  click('Set all frame durations');
  click('+ Frame');
  click('Save animation');
  expect(document.querySelector('dialog')).toBeNull();
  const clip = m.project.assets.find((a) => a.mime === CLIP_MIME)!;
  expect(JSON.parse(clip.data).frames[0].duration).toBe(0.125);
  expect(JSON.parse(clip.data).frames).toHaveLength(2);
  editMedia(m, CLIP_MIME, clip.id);
  const revisedFps = document.querySelector<HTMLInputElement>(
    '[aria-label="Frames per second"]',
  )!;
  revisedFps.value = '10';
  click('Set all frame durations');
  click('Save animation');
  expect(m.project.assets.filter((a) => a.mime === CLIP_MIME)).toHaveLength(1);
  expect(
    JSON.parse(m.project.assets.find((a) => a.id === clip.id)!.data).frames[0]
      .duration,
  ).toBe(0.1);
  editMedia(m, CONTROLLER_MIME);
  click('+ State');
  click('+ Parameter');
  click('+ Transition');
  click('Save animation');
  expect(document.querySelector('dialog')).toBeNull();
  const controller = m.project.assets.find((a) => a.mime === CONTROLLER_MIME)!;
  editMedia(m, CONTROLLER_MIME, controller.id);
  click('+ State');
  click('Save animation');
  expect(
    m.project.assets.filter((a) => a.mime === CONTROLLER_MIME),
  ).toHaveLength(1);
  expect(
    JSON.parse(m.project.assets.find((a) => a.id === controller.id)!.data)
      .states,
  ).toHaveLength(3);
  attachMedia(m, controller.id);
  expect(
    m.world.read(m.entity([...m.selection][0]!), Animator)?.controller,
  ).toBe(controller.id);
  showMixer(m);
  click('+ Bus');
  click('Apply mixer');
  expect(m.project.mixer).toHaveLength(6);
  m.undo();
  expect(m.project.mixer).toHaveLength(5);
});
