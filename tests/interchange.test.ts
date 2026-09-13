import { expect, it } from 'vitest';
import { guid } from '@protomake/core';
import { EditorModel } from '@protomake/editor';
import {
  analyzePortability,
  convertPoint,
  convertRotation,
  createExportManifest,
  lowerProject,
  serializeInterchange,
} from '@protomake/interchange';

it('lowers hierarchy and assets into deterministic target-neutral IR', () => {
  const model = new EditorModel(),
    parent = model.createEntity('Parent'),
    child = model.createEntity('Child', parent),
    script = guid();
  model.change('Portable fixture', () => {
    model.project.assets.push({
      id: script,
      path: 'Assets/Native.ts',
      kind: 'text',
      mime: 'text/typescript',
      data: 'export default class Native { update() {} }',
      width: 0,
      height: 0,
    });
  });
  model.select([child]);
  model.addScriptBehaviour(script);
  const first = lowerProject(model.project),
    reordered = structuredClone(model.project);
  reordered.scenes.reverse();
  reordered.assets.reverse();
  for (const scene of reordered.scenes) scene.entities.reverse();
  expect(serializeInterchange(lowerProject(reordered))).toBe(
    serializeInterchange(first),
  );
  const childIr = first.scenes[0]!.entities.find(
    (entity) => entity.id === child,
  )!;
  expect(childIr.parent).toBe(parent);
  expect(childIr.transform).toHaveLength(6);
});

it('reports full, approximate and manual portability without silent drops', () => {
  const model = new EditorModel(),
    entity = model.createEntity('Actor'),
    script = guid();
  model.change('Capabilities', () => {
    model.project.assets.push({
      id: script,
      path: 'Assets/Combat.ts',
      kind: 'text',
      mime: 'text/typescript',
      data: 'export default class Combat { update() {} }',
      width: 0,
      height: 0,
    });
    model.world.add(model.entity(entity), 'protomake.light');
  });
  model.select([entity]);
  model.addScriptBehaviour(script);
  const ir = lowerProject(model.project),
    report = analyzePortability(ir, 'unity');
  expect(report.entities).toBe(1);
  expect(report.summary['fully-portable']).toBeGreaterThan(0);
  expect(report.summary.approximated).toBeGreaterThan(0);
  expect(report.summary['manual-work']).toBeGreaterThan(0);
  expect(report.items.some((item) => item.path.includes('Combat.ts'))).toBe(
    true,
  );
});

it('centralizes coordinate conversion, stable target IDs and source manifests', () => {
  expect(convertPoint([100, 50], 'godot')).toEqual([100, 50]);
  expect(convertPoint([100, 50], 'unity')).toEqual([1, -0.5]);
  expect(convertPoint([100, 50], 'unreal')).toEqual([100, -50]);
  expect(convertRotation(Math.PI / 2, 'unity')).toBeCloseTo(-90);
  const ir = lowerProject(new EditorModel().project),
    first = createExportManifest(ir, 'godot'),
    second = createExportManifest(ir, 'godot');
  expect(first).toEqual(second);
  expect(first.ids[ir.source.project]).toMatch(/^protomake_[0-9a-f]{32}$/);
  expect(first.generatedRoot).toBe('Generated/ProtoMake');
});
