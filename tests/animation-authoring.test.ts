// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { EditorModel } from '@protomake/editor';
import { editMedia } from '../packages/editor/src/media-editor';
import { CLIP_MIME, CONTROLLER_MIME } from '@protomake/animation';
it('scrubs and previews an existing clip, then cleans state references and edits transition priority', () => {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.dispatchEvent(new Event('close'));
  };
  try {
    const m = new EditorModel();
    m.load(
      JSON.parse(
        readFileSync('examples/prototypes/shooter/shooter.protomake.json', 'utf8'),
      ),
    );
    const clip = m.project.assets.find((a) => a.mime === CLIP_MIME)!;
    const click = (label: string) => {
      const b = [
        ...document.querySelectorAll<HTMLButtonElement>('dialog button'),
      ].find((b) => b.textContent === label);
      if (!b) throw new Error(label);
      b.click();
    };
    editMedia(m, CLIP_MIME, clip.id);
    click('Play preview');
    expect(document.querySelector('output')!.textContent).toContain('Frame 1');
    const scrub = document.querySelector<HTMLInputElement>(
      '[aria-label="Preview time"]',
    )!;
    scrub.value = '0.4';
    scrub.dispatchEvent(new Event('input'));
    expect(document.querySelector('output')!.textContent).toContain('Frame 2');
    click('Save animation');
    expect(cancelAnimationFrame).toHaveBeenCalled();
    const controller = m.project.assets.find(
      (a) => a.mime === CONTROLLER_MIME,
    )!;
    editMedia(m, CONTROLLER_MIME, controller.id);
    expect(document.querySelectorAll('.graph-states svg path')).toHaveLength(2);
    click('Later rule');
    click('Save animation');
    expect(
      JSON.parse(m.project.assets.find((a) => a.id === controller.id)!.data)
        .transitions[0].from,
    ).toBe('Action');
    editMedia(m, CONTROLLER_MIME, controller.id);
    click('Remove state');
    click('Save animation');
    const saved = JSON.parse(
      m.project.assets.find((a) => a.id === controller.id)!.data,
    );
    expect(saved.states).toHaveLength(1);
    expect(saved.initial).toBe('Action');
    expect(saved.transitions).toHaveLength(0);
    m.undo();
    expect(
      JSON.parse(m.project.assets.find((a) => a.id === controller.id)!.data)
        .states,
    ).toHaveLength(2);
  } finally {
    vi.unstubAllGlobals();
    document.querySelectorAll('dialog').forEach((d) => d.remove());
  }
});
