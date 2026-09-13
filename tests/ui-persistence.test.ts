// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createRegistry, World } from '@protomake/core';
import { SignalService } from '@protomake/runtime';
import {
  RuntimeUiSystem,
  UiButton,
  UiLayout,
  UiProgress,
  UiRoot,
  UiSlider,
  UiText,
  registerUi,
} from '@protomake/ui';
import {
  AchievementService,
  MemorySaveBackend,
  SaveService,
  SessionStateService,
  createPersistentServices,
} from '@protomake/persistence';

describe('runtime UI', () => {
  it('renders accessible hierarchy controls and routes interaction through signals', () => {
    const registry = createRegistry();
    registerUi(registry);
    const world = new World(registry),
      root = world.create('HUD'),
      label = world.create('Score'),
      button = world.create('Pause'),
      progress = world.create('Health'),
      slider = world.create('Volume'),
      signals = new SignalService(),
      host = document.createElement('div');
    document.body.append(host);
    world.add(root, UiRoot.type);
    world.add(root, UiLayout.type, {
      ...UiLayout.defaults(),
      anchor: 'stretch',
    });
    world.add(label, UiText.type, { ...UiText.defaults(), text: 'Score: 10' });
    world.add(button, UiButton.type, {
      label: 'Pause',
      signal: 'game.pause',
      disabled: false,
    });
    world.add(progress, UiProgress.type, {
      value: 75,
      min: 0,
      max: 100,
      signal: '',
    });
    world.add(slider, UiSlider.type, {
      value: 5,
      min: 0,
      max: 10,
      step: 1,
      signal: 'audio.volume',
    });
    for (const child of [label, button, progress, slider])
      world.setParent(child, root);
    const pause = vi.fn(),
      volume = vi.fn();
    signals.on('game.pause', 'test', pause);
    signals.on('audio.volume', 'test', volume);
    const ui = new RuntimeUiSystem(world, host, [], signals);
    ui.start();
    expect(host.querySelector('.protomake-game-ui')?.textContent).toContain(
      'Score: 10',
    );
    host.querySelector<HTMLButtonElement>('button')!.click();
    expect(pause).toHaveBeenCalledWith({ entity: world.get(button).guid });
    const range = host.querySelector<HTMLInputElement>('input[type="range"]')!;
    range.value = '8';
    range.dispatchEvent(new Event('input'));
    expect(volume).toHaveBeenCalledWith({
      entity: world.get(slider).guid,
      value: 8,
    });
    ui.setText(world.get(label).guid, 'Score: 20');
    ui.setValue(world.get(progress).guid, 50);
    ui.update();
    expect(host.querySelector('.protomake-game-ui')?.textContent).toContain(
      'Score: 20',
    );
    expect(host.querySelector<HTMLProgressElement>('progress')?.value).toBe(
      0.5,
    );
    ui.stop();
    expect(host.querySelector('.protomake-game-ui')).toBeNull();
  });
});

describe('game persistence', () => {
  it('shares cloned run state between scenes without writing a save slot', () => {
    const session = new SessionStateService(),
      inventory = { weapon: 'caster', keys: ['gallery'] };
    session.set('vault.run', inventory);
    inventory.keys.push('outside');
    const restored = session.get<typeof inventory>('vault.run')!;
    expect(restored).toEqual({ weapon: 'caster', keys: ['gallery'] });
    restored.keys.push('mutated-copy');
    expect(session.get<typeof inventory>('vault.run')!.keys).toEqual([
      'gallery',
    ]);
    expect(session.has('vault.run')).toBe(true);
    expect(session.delete('vault.run')).toBe(true);
    expect(session.has('vault.run')).toBe(false);
  });

  it('supports profiles, slots, registered state, migration and integrity checks', async () => {
    const backend = new MemorySaveBackend();
    let score = 12;
    const version1 = new SaveService('game', 1, backend);
    version1.register('player', 'player.score', {
      capture: () => score,
      restore: (value) => {
        score = Number(value);
      },
    });
    await version1.save('Ada', 'slot-1');
    score = 40;
    await version1.save('Grace', 'slot-1');
    expect(await version1.list()).toHaveLength(2);
    const version2 = new SaveService('game', 2, backend);
    version2.register('player', 'player.score', {
      capture: () => score,
      restore: (value) => {
        score = Number(value);
      },
    });
    version2.migrate(1, (state) => ({
      ...state,
      'player.score': Number(state['player.score']) + 1,
    }));
    score = 0;
    await version2.load('Ada', 'slot-1');
    expect(score).toBe(13);
    const record = await backend.read('game', 'Grace', 'slot-1');
    await backend.write({ ...record!, state: { 'player.score': 999 } });
    await expect(version2.load('Grace', 'slot-1')).rejects.toThrow(/integrity/);
  });

  it('persists vendor-neutral achievements across two profiles', async () => {
    const backend = new MemorySaveBackend(),
      settings = {
        version: 1,
        autosave: false,
        achievements: [
          {
            id: 'first_step',
            name: 'First Step',
            description: 'Begin',
            icon: '',
            hidden: false,
          },
        ],
      },
      first = createPersistentServices('achievements-game', settings, backend);
    first.achievements.unlock('first_step');
    await first.save.save('PlayerOne', 'auto');
    await first.save.save('PlayerTwo', 'auto');
    const restored = createPersistentServices(
      'achievements-game',
      settings,
      backend,
    );
    expect(restored.achievements.isUnlocked('first_step')).toBe(false);
    await restored.save.load('PlayerOne', 'auto');
    expect(restored.achievements.isUnlocked('first_step')).toBe(true);
    expect(
      new AchievementService(settings.achievements).all()[0]?.definition.name,
    ).toBe('First Step');
    const autosaving = createPersistentServices(
      'autosave-game',
      { ...settings, autosave: true },
      backend,
    );
    autosaving.autosave?.tick(30);
    await vi.waitFor(async () =>
      expect(await autosaving.save.list('default')).toHaveLength(1),
    );
  });
});
