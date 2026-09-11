import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { guid } from '@protomake/core';
import { EditorModel } from '@protomake/editor';
import { Engine } from '@protomake/runtime';
import { InputService } from '@protomake/input';
import { Physics2D } from '@protomake/physics2d/rapier';
import {
  ScriptSystem,
  ScriptBehaviour,
  type ScriptModule,
  type ScriptContext,
} from '@protomake/scripting';
import {
  compileScript,
  scriptFields,
  compileProjectScripts,
  moduleSources,
} from '@protomake/scripting/compiler';
import type { AssetData } from '@protomake/assets';
import fixture from '../examples/physics-playground/Playground.protomake.json';
function asset(path: string, code: string): AssetData {
  return {
    id: guid(),
    path,
    kind: 'text',
    mime: 'text/typescript',
    data: code,
    width: 0,
    height: 0,
  };
}
it('compiles real TypeScript with literal inspector metadata and source-specific errors', () => {
  const source = readFileSync(
    'examples/physics-playground/Scripts/MovingPlatform.ts',
    'utf8',
  );
  const result = compileScript(source, 'MovingPlatform.ts');
  expect(result.code).not.toContain('import type');
  expect(result.fields.speed?.default).toBe(1.2);
  expect(() =>
    compileScript('export default class { broken( }', 'Broken.ts'),
  ).toThrow(/Broken.ts/);
  expect(() =>
    scriptFields(
      'export const fields = { speed: { type: "number", default: Math.random() } }',
    ),
  ).toThrow(/literal/);
});
it('resolves local modules, rejects cycles/missing imports and does not evaluate metadata', () => {
  const helper = asset('Assets/Helper.ts', 'export const value: number = 7;'),
    main = asset(
      'Assets/Main.ts',
      "import {value} from './Helper'; export default class Main { value = value; }",
    );
  const scripts = compileProjectScripts([main, helper]);
  const urls = moduleSources(
    scripts,
    (code) =>
      'data:text/javascript;base64,' + Buffer.from(code).toString('base64'),
  );
  expect(urls.size).toBe(2);
  expect(() => compileProjectScripts([main])).toThrow(
    /missing imported script/,
  );
  expect(() =>
    compileProjectScripts([
      asset('A.ts', "import './B';"),
      asset('B.ts', "import './A';"),
    ]),
  ).toThrow(/Cyclic/);
  expect(() =>
    compileScript("import x from 'https://example.com/a.js'; console.log(x)"),
  ).toThrow(/runtime imports/);
});
it('loads compiled modules and executes two independent project mechanics without engine edits', async () => {
  const editor = new EditorModel();
  editor.load(fixture);
  const compiled = compileProjectScripts(editor.project.assets),
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
  const physics = await Physics2D.create(editor.world, editor.project.physics),
    input = new InputService(editor.project.input),
    scripts = new ScriptSystem(
      editor.world,
      input,
      physics,
      modules,
      new Map(compiled.map((s) => [s.id, s.fields])),
      () => {},
      () => {},
    ),
    engine = new Engine(editor.world);
  engine.addSystem({ id: 'physics-life', stop: () => physics.destroy() });
  engine.addSystem(scripts);
  engine.addSystem({
    id: 'physics',
    fixedUpdate: (c) => physics.fixedUpdate(c),
  });
  const platform = [...editor.world.all()].find(
      (e) => e.name === 'Moving platform',
    )!,
    pulse = [...editor.world.all()].find((e) => e.name === 'Pulse marker')!,
    before = editor.world.worldPosition(platform.id);
  engine.start();
  try {
    for (let i = 0; i < 30; i++) {
      input.sample();
      engine.tick(1 / 60);
      input.endFrame();
    }
    expect(editor.world.worldPosition(platform.id)[0]).toBeGreaterThan(
      before[0] + 30,
    );
    const sprite = editor.world.components(pulse.id).get('protomake.sprite') as {
      opacity: number;
    };
    expect(sprite.opacity).toBeGreaterThan(0.7);
    expect(sprite.opacity).toBeLessThan(1);
    const player = [...editor.world.all()].find((e) => e.name === 'Player')!;
    physics.teleport(player.guid, 270, 160);
    // Let Rapier refresh the contact graph after this discontinuous teleport.
    engine.tick(1 / 60);
    engine.tick(1 / 60);
    expect(
      (
        editor.world.components(player.id).get('protomake.sprite') as {
          tint: string;
        }
      ).tint,
    ).toBe('#8bffb3');
    expect(
      editor.project.scenes[0]!.entities.find((e) => e.id === player.guid)!
        .components['protomake.sprite'],
    ).toMatchObject({ tint: '#ffffff' });
  } finally {
    engine.stop();
  }
});
it('applies exposed overrides and reports callback failures with entity and script context', async () => {
  const editor = new EditorModel(),
    stable = editor.createEntity('Faulty'),
    script = asset('Test.ts', 'export default class Test {}');
  editor.project.assets.push(script);
  editor.world.add(editor.entity(stable), ScriptBehaviour.type, {
    script: script.id,
    values: { speed: 4 },
  });
  const physics = await Physics2D.create(editor.world, editor.project.physics),
    input = new InputService(editor.project.input);
  let received = 0, illumination = -1;
  class Behaviour {
    speed = 0;
    start(ctx: ScriptContext) {
      received = this.speed;
      illumination = ctx.lightAt(0, 0);
      expect(typeof ctx.illumination).toBe('function');
    }
    update() {
      throw new Error('intentional fault');
    }
  }
  const scripts = new ScriptSystem(
      editor.world,
      input,
      physics,
      new Map([[script.id, { default: Behaviour }]]),
      new Map([[script.id, { speed: { type: 'number', default: 1 } }]]),
      () => {},
      () => {},
    ),
    engine = new Engine(editor.world);
  engine.addSystem(scripts);
  engine.start();
  expect(received).toBe(4);
  expect(illumination).toBe(1);
  expect(() => engine.tick(1 / 60)).toThrow(/intentional fault/);
  expect(engine.state).toBe('faulted');
  engine.stop();
  physics.destroy();
});

it('remaps internal script entity references when duplicating multiple roots', () => {
  const editor = new EditorModel();
  editor.load(fixture);
  const player = [...editor.world.all()].find((e) => e.name === 'Player')!,
    trigger = [...editor.world.all()].find((e) => e.name === 'Trigger')!;
  editor.select([player.guid, trigger.guid]);
  editor.duplicate();
  const copied = [...editor.selection].map((id) =>
      editor.world.get(editor.entity(id)),
    ),
    newPlayer = copied.find((e) => e.name === 'Player')!,
    newTrigger = copied.find((e) => e.name === 'Trigger')!;
  expect(editor.world.read(newTrigger.id, ScriptBehaviour)?.values.target).toBe(
    newPlayer.guid,
  );
});

it('dispatches enable/disable/destroy hooks once and leaves physics available during cleanup', async () => {
  const editor = new EditorModel(),
    id = editor.createEntity(),
    script = asset('Lifecycle.ts', 'export default class {}');
  editor.project.assets.push(script);
  editor.world.add(editor.entity(id), ScriptBehaviour.type, {
    script: script.id,
    values: {},
  });
  const calls: string[] = [];
  class Lifecycle {
    awake() {
      calls.push('awake');
    }
    onEnable() {
      calls.push('enable');
    }
    start() {
      calls.push('start');
    }
    onDisable() {
      calls.push('disable');
    }
    onDestroy() {
      calls.push('destroy');
    }
  }
  const physics = await Physics2D.create(editor.world, editor.project.physics),
    system = new ScriptSystem(
      editor.world,
      new InputService(editor.project.input),
      physics,
      new Map([[script.id, { default: Lifecycle }]]),
      new Map([[script.id, {}]]),
      () => {},
      () => {},
    ),
    engine = new Engine(editor.world);
  engine.addSystem(system);
  engine.start();
  editor.world.setEnabled(editor.entity(id), false);
  engine.tick(1 / 60);
  editor.world.setEnabled(editor.entity(id), true);
  engine.tick(1 / 60);
  engine.stop();
  physics.destroy();
  expect(calls).toEqual([
    'awake',
    'enable',
    'start',
    'disable',
    'enable',
    'disable',
    'destroy',
  ]);
});

it('validates rich Inspector metadata without executing project code', () => {
  const fields = scriptFields(`
    export const fields = {
      speed: { type: 'number', default: 4, label: 'Move speed', help: 'Units per second', min: 0, max: 20, step: 0.5 },
      stance: { type: 'string', default: 'patrol', options: ['patrol', 'alert'] },
    } as const;
  `, 'Guard.ts');
  expect(fields.speed).toMatchObject({ label: 'Move speed', min: 0, max: 20, step: 0.5 });
  expect(fields.stance?.options).toEqual(['patrol', 'alert']);
  expect(() => scriptFields(`export const fields = { speed: { type: 'number', default: 1, min: 2, max: 1 } }`, 'Bad.ts')).toThrow(/min must not exceed max/);
});
