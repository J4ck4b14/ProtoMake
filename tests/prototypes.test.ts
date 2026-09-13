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
import { Light2D, SpriteRenderer } from '@protomake/renderer';
import { UiText } from '@protomake/ui';
import { Engine } from '@protomake/runtime';
async function game(name: string) {
  const model = new EditorModel();
  model.load(
    JSON.parse(
      await readFile(`examples/prototypes/${name}/${name}.protomake.json`, 'utf8'),
    ),
  );
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
    engine = new Engine(model.world);
  const sounds: string[] = [];
  const achievements = new Set<string>();
  engine.addSystem(
    new ScriptSystem(
      model.world,
      input,
      physics,
      modules,
      new Map(compiled.map((s) => [s.id, s.fields])),
      () => {},
      () => {},
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
        cameraEffects: {
          shake: () => {},
          kick: () => {},
          zoomPulse: () => {},
        },
      },
    ),
  );
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
    close: () => {
      engine.stop();
      physics.destroy();
    },
  };
}

it('showcase combines readable lighting, both combat styles, inventory and a multi-stage vault puzzle', async () => {
  const g = await game('showcase');
  try {
    const lights = [...g.model.world.query(Light2D.type)].map(([id]) =>
      g.model.world.read(id, Light2D),
    );
    expect(new Set(lights.map((light) => light?.kind))).toEqual(
      new Set(['ambient', 'point', 'spot', 'area']),
    );
    expect(new Set(lights.map((light) => light?.mobility))).toEqual(
      new Set(['static', 'mixed', 'dynamic']),
    );
    expect(g.sprite('Lit vault backdrop').lit).toBe(true);

    const press = (code: string, frames = 2) => {
      g.key(code, true);
      g.tick();
      g.key(code, false);
      g.tick(frames);
    };

    g.place('Player', -118, 166);
    g.physics.setVelocity(g.id('Player'), 0, 0);
    press('KeyJ', 20);
    press('KeyJ', 20);
    expect(g.sprite('Sentinel 1').visible).toBe(false);

    g.place('Player', -277, 163);
    g.physics.setVelocity(g.id('Player'), 0, 0);
    g.tick(2);
    expect(g.sprite('Arc Caster pickup').visible).toBe(false);
    expect(g.text('Inventory')).toContain('Caster ✓');

    g.place('Player', -158, 161);
    g.physics.setVelocity(g.id('Player'), 0, 0);
    press('KeyJ', 12);
    expect(g.light('Crystal light 1').intensity).toBeGreaterThan(1);

    g.place('Player', -42, 82);
    g.physics.setVelocity(g.id('Player'), 0, 0);
    press('KeyJ', 12);
    expect(g.light('Crystal light 2').intensity).toBeGreaterThan(1);
    expect(g.sprite('Seal barrier').visible).toBe(false);
    expect(g.sprite('Bridge').visible).toBe(true);
    expect(g.sprite('Vault Key').visible).toBe(true);

    g.place('Player', 177, 162);
    g.physics.setVelocity(g.id('Player'), 0, 0);
    g.tick(2);
    expect(g.sprite('Vault Key').visible).toBe(false);
    expect(g.light('Exit area light').intensity).toBeCloseTo(0.92);
    expect(g.text('Objective')).toContain('illuminated exit');

    g.place('Player', 330, -61);
    g.physics.setVelocity(g.id('Player'), 0, 0);
    g.tick(2);
    expect(g.sprite('Victory').visible).toBe(true);
    expect(g.achievements.has('vaultbreaker')).toBe(true);
  } finally {
    g.close();
  }
});
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
