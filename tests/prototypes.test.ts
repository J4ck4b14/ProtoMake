import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { EditorModel } from '@protomake/editor';
import {
  compileProjectScripts,
  moduleSources,
} from '@protomake/scripting/compiler';
import { ScriptSystem, type ScriptModule } from '@protomake/scripting';
import { Physics2D } from '@protomake/physics2d/rapier';
import { InputService } from '@protomake/input';
import { AnimationSystem } from '@protomake/animation';
import {
  Light2D,
  ParticleSystem,
  SpriteRenderer,
  sampleLighting,
  type LightData,
} from '@protomake/renderer';
import { UiText } from '@protomake/ui';
import { Engine, TweenService } from '@protomake/runtime';
import { SessionStateService } from '@protomake/persistence';
async function game(
  name: string,
  sceneName?: string,
  session = new SessionStateService(),
) {
  const model = new EditorModel();
  model.load(
    JSON.parse(
      await readFile(
        `examples/prototypes/${name}/${name}.protomake.json`,
        'utf8',
      ),
    ),
  );
  if (sceneName) {
    const scene = model.project.scenes.find((item) => item.name === sceneName)!;
    model.switchScene(scene.id);
  }
  const compiled = compileProjectScripts(model.project.assets);
  const urls = moduleSources(
    compiled,
    (code) =>
      'data:text/javascript;base64,' + Buffer.from(code).toString('base64'),
  );
  const modules = new Map<string, ScriptModule>();
  for (const s of compiled)
    modules.set(s.id, await import(/* @vite-ignore */ urls.get(s.id)!));
  const physics = await Physics2D.create(model.world, model.project.physics),
    input = new InputService(model.project.input),
    animation = new AnimationSystem(model.world, model.project.assets),
    engine = new Engine(model.world),
    tweens = new TweenService(model.world),
    particles = new ParticleSystem(model.world);
  const sounds: string[] = [];
  const achievements = new Set<string>();
  const transitions: string[] = [];
  engine.addSystem(
    new ScriptSystem(
      model.world,
      input,
      physics,
      modules,
      new Map(compiled.map((s) => [s.id, s.fields])),
      () => {},
      (scene) => transitions.push(scene),
      {
        animation,
        audio: {
          play: (id) => {
            sounds.push(id);
          },
          pauseSource: () => {},
          stopSource: () => {},
          setBus: () => {},
        },
      },
      {
        ui: {
          setText: (stable, text) => {
            const entity = model.world.find(stable)!,
              current = model.world.read(entity, UiText)!;
            model.world.set(entity, UiText.type, { ...current, text });
          },
          setVisible: (stable, visible) => {
            model.world.setEnabled(model.world.find(stable)!, visible);
          },
          setValue: () => {},
        },
        achievements: {
          unlock: (id) => {
            const fresh = !achievements.has(id);
            achievements.add(id);
            return fresh;
          },
          isUnlocked: (id) => achievements.has(id),
        },
        session,
        cameraEffects: {
          shake: () => {},
          kick: () => {},
          zoomPulse: () => {},
        },
        tweens,
        particles,
      },
    ),
  );
  engine.addSystem(tweens);
  engine.addSystem(particles);
  engine.addSystem(animation);
  engine.addSystem(physics);
  engine.start();
  const id = (name: string) =>
    [...model.world.all()].find((e) => e.name === name)!.guid;
  const sprite = (name: string) =>
    model.world.read(model.entity(id(name)), SpriteRenderer)!;
  const position = (name: string) =>
    model.world.worldPosition(model.entity(id(name)));
  const text = (name: string) =>
    model.world.read(model.entity(id(name)), UiText)!.text;
  const light = (name: string) =>
    model.world.read(model.entity(id(name)), Light2D)!;
  const place = (name: string, x: number, y: number) => {
    const stable = id(name);
    if (physics.hasBody(stable)) physics.movePosition(stable, x, y);
    else model.world.setLocalMatrix(model.entity(stable), [1, 0, 0, 1, x, y]);
  };
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      input.sample();
      engine.tick(1 / 60);
      input.endFrame();
    }
  };
  const key = (code: string, down: boolean) => input.setPhysical(code, down);
  return {
    model,
    physics,
    input,
    id,
    sprite,
    position,
    text,
    light,
    place,
    tick,
    key,
    sounds,
    achievements,
    session,
    transitions,
    close: () => {
      engine.stop();
      physics.destroy();
    },
  };
}

it('showcase carries combat, inventory and puzzle state through three bidirectional rooms', async () => {
  const session = new SessionStateService(),
    press = (g: Awaited<ReturnType<typeof game>>, code: string, frames = 2) => {
      g.key(code, true);
      g.tick();
      g.key(code, false);
      g.tick(frames);
    },
    walk = (g: Awaited<ReturnType<typeof game>>, code: string, frames = 36) => {
      g.key(code, true);
      g.tick(frames);
      g.key(code, false);
    };
  let g = await game('showcase', 'The Black Gate', session);
  try {
    expect(g.model.project.scenes.map((scene) => scene.name)).toEqual([
      'The Black Gate',
      'The Drowned Gallery',
      'The Reliquary',
    ]);
    expect(g.sprite('Black stone backdrop').lit).toBe(true);
    expect(g.sprite('Black stone backdrop').texture).toBe('');
    expect(g.sprite('Potion pickup').lit).toBe(true);
    expect(g.sprite('Transition veil')).toMatchObject({
      visible: true,
      opacity: 1,
    });
    expect(
      g.model.project.assets.filter((asset) => asset.kind === 'audio'),
    ).toHaveLength(9);
    expect(
      g.model.project.scenes.every((scene) => scene.entities.length > 150),
    ).toBe(true);
    expect(g.light('Absolute black')).toMatchObject({
      kind: 'ambient',
      intensity: 0,
      mobility: 'static',
    });
    expect(g.light('Player lantern')).toMatchObject({
      kind: 'point',
      mobility: 'dynamic',
      range: 152,
    });
    const darknessAsset = g.model.project.assets.find(
      (asset) => asset.path === 'Assets/Images/DarknessMask.png',
    );
    expect(darknessAsset).toMatchObject({
      kind: 'image',
      mime: 'image/png',
      width: 1800,
      height: 1800,
    });
    expect(g.sprite('Lantern darkness')).toMatchObject({
      texture: darknessAsset?.id,
      lit: false,
      layer: 20,
      width: 1800,
      height: 1800,
    });
    expect(g.position('Lantern darkness')).toEqual(g.position('Player'));
    expect(
      sampleLighting(g.model.world, 0, 230, undefined, 'World').intensity,
    ).toBe(0);
    expect(
      sampleLighting(g.model.world, -350, 166, g.id('Player'), 'Characters')
        .intensity,
    ).toBeGreaterThan(0.75);
    const projectLights = g.model.project.scenes.flatMap((scene) =>
      scene.entities.flatMap((entity) => {
        const value = entity.components[Light2D.type];
        return value && typeof value === 'object'
          ? [value as { kind: string; mobility: string }]
          : [];
      }),
    );
    expect(new Set(projectLights.map((light) => light.kind))).toEqual(
      new Set(['ambient', 'point', 'spot', 'area']),
    );
    expect(new Set(projectLights.map((light) => light.mobility))).toEqual(
      new Set(['static', 'mixed', 'dynamic']),
    );
    for (const scene of g.model.project.scenes) {
      const lights = scene.entities.flatMap((entity) => {
          const value = entity.components[Light2D.type];
          return value && typeof value === 'object'
            ? [{ name: entity.name, ...(value as LightData) }]
            : [];
        }),
        environment = lights.filter(
          (light) =>
            light.name !== 'Absolute black' &&
            light.name !== 'Player lantern' &&
            !light.name.includes('bolt glow'),
        );
      expect(
        lights.find((light) => light.name === 'Absolute black')?.intensity,
        `${scene.name} must have no ambient fill`,
      ).toBe(0);
      expect(
        environment.length,
        `${scene.name} environmental light budget`,
      ).toBeLessThanOrEqual(3);
    }
    const authored = [...g.model.world.query(Light2D.type)].filter(([id]) => {
      const name = g.model.world.get(id).name;
      return (
        name !== 'Absolute black' &&
        name !== 'Player lantern' &&
        !name.includes('bolt glow')
      );
    });
    expect(authored).toHaveLength(3);
    expect(
      authored.every(([id]) => g.model.world.read(id, Light2D)!.range <= 52),
    ).toBe(true);

    g.place('Player', -128, 166);
    g.physics.setVelocity(g.id('Player'), 0, 0);
    press(g, 'KeyJ', 20);
    g.place('Player', -128, 166);
    press(g, 'KeyJ', 20);
    expect(g.sprite('Sentinel 1').visible).toBe(false);
    expect(g.sounds).toContain(g.id('Sword audio'));
    g.place('Player', 350, 166);
    g.physics.setVelocity(g.id('Player'), 0, 0);
    g.tick(2);
    walk(g, 'KeyD');
    expect(g.transitions).toEqual(['The Drowned Gallery']);
  } finally {
    g.close();
  }

  g = await game('showcase', 'The Drowned Gallery', session);
  try {
    expect(g.position('Player')[0]).toBeCloseTo(-350);
    g.place('Player', -276, 165);
    g.physics.setVelocity(g.id('Player'), 0, 0);
    g.tick(2);
    expect(g.sprite('Arc Caster pickup').visible).toBe(false);
    expect(g.sprite('Arc Caster pickup').lit).toBe(true);
    expect(g.text('Inventory')).toContain('CASTER ✓');

    g.place('Player', -176, 164);
    g.physics.setVelocity(g.id('Player'), 0, 0);
    press(g, 'KeyJ', 10);
    expect(g.light('Ward light 1').intensity).toBeCloseTo(0.34);
    expect(g.sounds).toContain(g.id('Ward audio'));
    g.place('Player', 110, 28);
    g.physics.setVelocity(g.id('Player'), 0, 0);
    press(g, 'KeyJ', 10);
    expect(g.light('Ward light 2').intensity).toBeCloseTo(0.34);
    expect(g.model.world.isActive(g.model.entity(g.id('Ward bridge')))).toBe(
      true,
    );
    expect(g.model.world.isActive(g.model.entity(g.id('East seal')))).toBe(
      false,
    );
    g.place('Player', 350, -82);
    g.physics.setVelocity(g.id('Player'), 0, 0);
    g.tick(2);
    walk(g, 'KeyD');
    expect(g.transitions).toEqual(['The Reliquary']);
  } finally {
    g.close();
  }

  g = await game('showcase', 'The Reliquary', session);
  try {
    expect(g.text('Inventory')).toContain('CASTER ✓');
    g.place('Player', -350, 166);
    g.physics.setVelocity(g.id('Player'), 0, 0);
    g.tick(2);
    walk(g, 'KeyA');
    expect(g.transitions).toEqual(['The Drowned Gallery']);
  } finally {
    g.close();
  }

  g = await game('showcase', 'The Drowned Gallery', session);
  try {
    expect(g.position('Player')).toEqual([342, -82]);
    expect(g.text('Inventory')).toContain('WARDS 2/2');
    g.place('Player', 350, -82);
    g.physics.setVelocity(g.id('Player'), 0, 0);
    g.tick(2);
    walk(g, 'KeyD');
  } finally {
    g.close();
  }

  g = await game('showcase', 'The Reliquary', session);
  try {
    press(g, 'Digit1');
    for (const [name, hits] of [
      ['Sentinel 1', 2],
      ['Sentinel 2', 2],
      ['Sentinel 3', 2],
      ['Warden', 4],
    ] as const) {
      for (let hit = 0; hit < hits; hit++) {
        const [x, y] = g.position(name);
        g.place('Player', x - 42, y);
        g.physics.setVelocity(g.id('Player'), 0, 0);
        press(g, 'KeyJ', 20);
      }
      expect(g.sprite(name).visible, `${name} should be defeated`).toBe(false);
    }
    expect(g.sprite('Vault Key').visible).toBe(true);
    g.place('Player', 82, 166);
    g.physics.setVelocity(g.id('Player'), 0, 0);
    g.tick();
    expect(g.sprite('Vault Key').visible).toBe(false);
    expect(g.light('Exit area light').intensity).toBeCloseTo(0.62);
    g.place('Player', 350, 166);
    g.physics.setVelocity(g.id('Player'), 0, 0);
    g.tick(2);
    walk(g, 'KeyD');
    expect(g.sprite('Victory').visible).toBe(true);
    expect(g.achievements.has('vaultbreaker')).toBe(true);
  } finally {
    g.close();
  }
}, 10_000);

it('showcase lantern trades visibility for stealth before a telegraphed attack', async () => {
  const g = await game('showcase', 'The Black Gate');
  try {
    g.place('Player', -300, 166);
    g.key('KeyL', true);
    g.tick();
    g.key('KeyL', false);
    g.tick(90);
    expect(g.text('Inventory')).toContain('LIGHT SHUTTERED');
    expect(g.sprite('Lantern shutter').visible).toBe(true);
    expect(g.sounds).not.toContain(g.id('Enemy audio'));
    expect(g.sprite('Enemy tell 1').visible).toBe(false);

    g.key('KeyL', true);
    g.tick();
    g.key('KeyL', false);
    g.tick(70);
    expect(g.text('Inventory')).toContain('LIGHT OPEN');
    expect(g.sprite('Lantern shutter').visible).toBe(false);
    expect(g.sounds).toContain(g.id('Enemy audio'));
  } finally {
    g.close();
  }
});

it('showcase can cross the Black Gate with mapped input and real collisions', async () => {
  const g = await game('showcase', 'The Black Gate'),
    tap = (code: string) => {
      g.key(code, true);
      g.tick();
      g.key(code, false);
      g.tick();
    };
  try {
    tap('KeyL');
    g.key('KeyD', true);
    for (let frame = 0; frame < 480 && !g.transitions.length; frame++) {
      if (frame % 10 === 0) g.key('Space', true);
      if (frame % 10 === 2) g.key('Space', false);
      g.tick();
    }
    g.key('KeyD', false);
    g.key('Space', false);
    expect(
      g.transitions,
      `player stopped at ${g.position('Player').join(', ')}`,
    ).toEqual(['The Drowned Gallery']);
  } finally {
    g.close();
  }
});

it('showcase can finish all three rooms using only mapped controls', async () => {
  const session = new SessionStateService(),
    tap = (g: Awaited<ReturnType<typeof game>>, code: string, settle = 2) => {
      g.key(code, true);
      g.tick();
      g.key(code, false);
      g.tick(settle);
    },
    drive = (
      g: Awaited<ReturnType<typeof game>>,
      code: 'KeyA' | 'KeyD',
      frames: number,
      stop?: () => boolean,
      jump = true,
    ) => {
      g.key(code, true);
      for (let frame = 0; frame < frames && !stop?.(); frame++) {
        if (jump && frame % 10 === 0) g.key('Space', true);
        if (jump && frame % 10 === 2) g.key('Space', false);
        g.tick();
      }
      g.key(code, false);
      g.key('Space', false);
      g.tick();
    };

  let g = await game('showcase', 'The Black Gate', session);
  try {
    tap(g, 'KeyL');
    drive(g, 'KeyD', 480, () => g.transitions.length > 0);
    expect(
      g.transitions,
      `Black Gate stopped at ${g.position('Player').join(', ')}`,
    ).toEqual(['The Drowned Gallery']);
  } finally {
    g.close();
  }

  g = await game('showcase', 'The Drowned Gallery', session);
  try {
    drive(g, 'KeyD', 34, undefined, false);
    expect(g.text('Inventory')).toContain('CASTER ✓');

    tap(g, 'KeyJ', 24);
    expect(g.light('Ward light 1').intensity).toBeCloseTo(0.34);

    drive(
      g,
      'KeyD',
      420,
      () => g.position('Player')[0] > 105 && g.position('Player')[1] < 90,
    );
    tap(g, 'KeyJ', 24);
    expect(g.light('Ward light 2').intensity).toBeCloseTo(0.34);
    expect(g.model.world.isActive(g.model.entity(g.id('Ward bridge')))).toBe(
      true,
    );

    drive(g, 'KeyD', 480, () => g.transitions.length > 0);
    expect(
      g.transitions,
      `Drowned Gallery stopped at ${g.position('Player').join(', ')}`,
    ).toEqual(['The Reliquary']);
  } finally {
    g.close();
  }

  g = await game('showcase', 'The Reliquary', session);
  try {
    drive(g, 'KeyD', 16);
    for (let shot = 0; shot < 9; shot++) tap(g, 'KeyJ', 15);
    expect(g.sprite('Sentinel 1').visible).toBe(false);
    expect(g.sprite('Sentinel 3').visible).toBe(false);

    drive(g, 'KeyD', 66);
    for (let shot = 0; shot < 15; shot++) tap(g, 'KeyJ', 15);
    for (const name of ['Sentinel 2', 'Warden'])
      expect(g.sprite(name).visible, `${name} should be defeated`).toBe(false);
    expect(
      g.sprite('Vault Key').visible,
      `key missing after combat at ${g.position('Player').join(', ')}`,
    ).toBe(true);

    drive(g, 'KeyD', 180, () => g.text('Inventory').includes('KEY ✓'), false);
    expect(
      g.text('Inventory'),
      `key route stopped at ${g.position('Player').join(', ')} with ${JSON.stringify(session.get('luminous-vault.run'))}`,
    ).toContain('KEY ✓');
    drive(g, 'KeyD', 360, () => g.sprite('Victory').visible);
    expect(
      g.sprite('Victory').visible,
      `Reliquary stopped at ${g.position('Player').join(', ')}`,
    ).toBe(true);
    expect(g.achievements.has('vaultbreaker')).toBe(true);
  } finally {
    g.close();
  }
}, 20_000);
it('shooter destroys six prefab drones with pooled swept projectiles and restarts a won game', async () => {
  const g = await game('shooter');
  try {
    expect([...g.model.world.query('protomake.prefab')]).toHaveLength(6);
    g.key('Space', true);
    for (const y of [-140, 0, 140]) {
      g.place('Player', 0, y);
      g.tick(90);
    }
    expect(g.sprite('Victory').visible).toBe(true);
    expect(g.sounds.length).toBeGreaterThan(0);
    g.key('Space', false);
    g.key('KeyR', true);
    g.tick();
    expect(g.sprite('Victory').visible).toBe(false);
    expect(g.sprite('Drone 1').visible).toBe(true);
    expect(g.sprite('Score').visible).toBe(false);
  } finally {
    g.close();
  }
});
it('platformer jumps, retains coins after a checkpoint fall, completes the goal and resets', async () => {
  const g = await game('platformer');
  try {
    g.tick(45);
    const before = g.position('Player')[1];
    g.key('Space', true);
    g.tick(8);
    g.key('Space', false);
    expect(g.position('Player')[1]).toBeLessThan(before - 20);
    expect(g.sounds.length).toBeGreaterThan(0);
    for (let i = 1; i <= 4; i++) {
      const p = g.position(`Coin ${i}`);
      g.place('Player', p[0], p[1]);
      g.physics.setVelocity(g.id('Player'), 0, 0);
      g.tick(2);
      expect(g.sprite(`Coin ${i}`).visible).toBe(false);
    }
    g.place('Player', -80, 50);
    g.tick(2);
    expect(g.sprite('Checkpoint').tint).toBe('#6ee7b7');
    g.place('Player', 0, 300);
    g.tick(2);
    expect(g.position('Player')[0]).toBe(-80);
    expect(g.sprite('Health').width).toBeCloseTo((160 * 2) / 3);
    g.place('Player', 330, 135);
    g.tick(2);
    expect(g.sprite('Victory').visible).toBe(true);
    g.key('KeyR', true);
    g.tick();
    expect(g.sprite('Coin 1').visible).toBe(true);
    expect(g.sprite('Victory').visible).toBe(false);
  } finally {
    g.close();
  }
});
it('fighter has range checks, one hit per attack, blocking, knockout and rematch', async () => {
  const g = await game('fighter');
  try {
    const press = (key: string) => {
      g.key(key, true);
      g.tick();
      g.key(key, false);
      g.tick(32);
    };
    press('KeyF');
    expect(g.sprite('Health 2').width).toBe(160);
    g.key('KeyD', true);
    g.key('ArrowLeft', true);
    g.tick(55);
    g.key('KeyD', false);
    g.key('ArrowLeft', false);
    press('KeyF');
    expect(g.sprite('Health 2').width).toBeCloseTo(160 * 0.82);
    g.key('KeyG', true);
    press('KeyK');
    g.key('KeyG', false);
    expect(g.sprite('Health 1').width).toBeCloseTo(160 * 0.98);
    for (let i = 0; i < 5; i++) {
      g.key('KeyD', true);
      g.tick(15);
      g.key('KeyD', false);
      press('KeyF');
    }
    expect(g.sprite('Victory').visible).toBe(true);
    expect(g.sprite('Health 2').visible).toBe(false);
    press('KeyR');
    expect(g.sprite('Victory').visible).toBe(false);
    expect(g.sprite('Health 2').width).toBe(160);
  } finally {
    g.close();
  }
});

it('completes the platformer route using only input without teleporting past jumps', async () => {
  const g = await game('platformer');
  try {
    g.tick(45);
    g.key('KeyD', true);
    g.tick(25);
    const jump = () => {
      g.key('Space', true);
      g.tick(2);
      g.key('Space', false);
    };
    jump();
    g.tick(36);
    g.key('KeyD', false);
    g.tick(30);
    expect(
      g.sprite('Coin 2').visible,
      JSON.stringify({
        position: g.position('Player'),
        coin: g.position('Coin 2'),
      }),
    ).toBe(false);
    expect(g.sprite('Checkpoint').tint).toBe('#6ee7b7');
    g.key('KeyD', true);
    g.tick(13);
    jump();
    g.tick(38);
    g.key('KeyD', false);
    g.tick(12);
    expect(g.sprite('Coin 3').visible).toBe(false);
    g.key('KeyD', true);
    jump();
    g.tick(49);
    g.key('KeyD', false);
    g.tick(45);
    expect(g.sprite('Coin 4').visible).toBe(false);
    g.key('KeyD', true);
    g.tick(9);
    g.key('KeyD', false);
    expect(g.sprite('Victory').visible).toBe(true);
  } finally {
    g.close();
  }
});
