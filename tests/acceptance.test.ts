import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { EditorModel } from '../packages/editor/src/model';
import {
  compileProjectScripts,
  moduleSources,
} from '@protomake/scripting/compiler';
import { ScriptSystem, type ScriptModule } from '@protomake/scripting';
import { AnimationSystem } from '@protomake/animation';
import { Physics2D } from '@protomake/physics2d/rapier';
import { InputService } from '@protomake/input';
import { Engine } from '@protomake/runtime';
it('runs the shipped workshop with compiled scripts, real physics, animation parameters and an AudioSource command', async () => {
  const m = new EditorModel();
  m.load(
    JSON.parse(
      await readFile('examples/milestones-5-7/Workshop.protomake.json', 'utf8'),
    ),
  );
  const player = [...m.world.all()].find((e) => e.name === 'Player')!;
  expect([...m.world.query('protomake.prefab')]).toHaveLength(10);
  const compiled = compileProjectScripts(m.project.assets),
    urls = moduleSources(
      compiled,
      (code) =>
        'data:text/javascript;base64,' + Buffer.from(code).toString('base64'),
    ),
    modules = new Map<string, ScriptModule>();
  for (const script of compiled)
    modules.set(
      script.id,
      (await import(/* @vite-ignore */ urls.get(script.id)!)) as ScriptModule,
    );
  const physics = await Physics2D.create(m.world, m.project.physics),
    input = new InputService(m.project.input),
    animation = new AnimationSystem(m.world, m.project.assets),
    engine = new Engine(m.world),
    played: string[] = [];
  const scripts = new ScriptSystem(
    m.world,
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
          played.push(id);
        },
        pauseSource: () => {},
        stopSource: () => {},
        setBus: () => {},
      },
    },
  );
  engine.addSystem(scripts);
  engine.addSystem(animation);
  engine.addSystem(physics);
  try {
    engine.start();
    for (let i = 0; i < 90; i++) engine.tick(1 / 60);
    input.setPhysical('KeyD', true);
    input.sample();
    engine.tick(1 / 60);
    expect(animation.state(player.guid)).toBe('Moving');
    input.setPhysical('KeyD', false);
    input.sample();
    engine.tick(1 / 60);
    expect(animation.state(player.guid)).toBe('Rest');
    input.setPhysical('Space', true);
    input.sample();
    for (let i = 0; i < 3; i++) engine.tick(1 / 60);
    expect(played).toContain(player.guid);
  } finally {
    engine.stop();
    physics.destroy();
  }
});
