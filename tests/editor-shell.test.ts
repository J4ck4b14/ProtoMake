// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
vi.mock('@protomake/renderer/pixi', () => ({
  PixiRenderer: {
    create: async () => ({
      resize() {},
      render() {},
      setAssets: async () => {},
      invalidateStaticLighting() {},
      destroy() {},
    }),
  },
}));
it('boots the complete editor and executes create/edit/save/open through its controls', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal('confirm', () => true);
  localStorage.setItem('protomake.storage-notice.v1', 'seen');
  const context = new Proxy({}, { get: () => () => {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as never,
  );
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
  document.body.innerHTML = '<div id="app"></div>';
  await import('../packages/editor/src/app');
  const click = (name: string) => {
    const button = [...document.querySelectorAll('button')].find(
      (b) => b.textContent === name,
    );
    if (!button) throw new Error(`Missing button ${name}`);
    button.click();
  };
  expect(document.querySelector('.console-body')?.textContent).toContain(
    'ProtoMake editor ready',
  );
  click('+ Entity');
  expect(document.querySelector('.tree')?.textContent).toContain('Entity');
  const name = document.querySelector<HTMLInputElement>('[aria-label="Name"]')!;
  name.value = 'Saved actor';
  name.dispatchEvent(new Event('change'));
  click('Save locally');
  await vi.waitFor(() =>
    expect(document.querySelector('.console-body')?.textContent).toContain(
      'Saved Untitled project',
    ),
  );
  click('Open local');
  await vi.waitFor(() =>
    expect(document.querySelector('dialog')?.textContent).toContain(
      'Untitled project',
    ),
  );
  const saved = [...document.querySelectorAll('dialog button')].find((b) =>
    b.textContent?.startsWith('Untitled project · '),
  )! as HTMLButtonElement;
  saved.click();
  await vi.waitFor(() =>
    expect(document.querySelector('.tree')?.textContent).toContain(
      'Saved actor',
    ),
  );
  click('Settings');
  expect(
    document.querySelector('[aria-label="Input action definitions"]'),
  ).not.toBeNull();
  click('Cancel');
  click('Scripts');
  expect(document.querySelector('[aria-label="Script source"]')).not.toBeNull();
  click('Compile');
  expect(document.querySelector('.script-diagnostics')?.textContent).toContain(
    'Compilation passed',
  );
  click('Close');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
