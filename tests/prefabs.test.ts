import { it, expect } from 'vitest';
import { EditorModel } from '../packages/editor/src/model';
import {
  createPrefab,
  placePrefab,
  editPrefab,
  prefabBases,
  revertPrefab,
  applyPrefabOverride,
  unpackPrefab,
} from '../packages/editor/src/prefab-actions';
import { PrefabLink } from '@protomake/prefabs';
import { SpriteRenderer } from '@protomake/renderer';
import { Behaviours, type ScriptBehaviourData } from '@protomake/scripting';
import { guid } from '@protomake/core';
import { validateProject } from '@protomake/serialization';
function behaviour(m: EditorModel, entity: string): ScriptBehaviourData {
  const data = m.world.read(m.entity(entity), Behaviours)!;
  const item = data.items[data.order[0]!]!;
  if (item.kind !== 'script') throw new Error('Expected script behaviour');
  return item;
}
function setup() {
  const m = new EditorModel(),
    root = m.createEntity('Enemy');
  m.addComponent(SpriteRenderer.type);
  const script = guid();
  m.change('Script', () => {
    m.project.assets.push({
      id: script,
      path: 'Assets/Enemy.ts',
      kind: 'text',
      mime: 'text/typescript',
      data: 'export const fields={speed:{type:"number",default:2}};export default class Enemy {}',
      width: 0,
      height: 0,
    });
  });
  m.addScriptBehaviour(script, { speed: 2 });
  const prefab = createPrefab(m, 'Assets/Enemy.prefab.json');
  return { m, root, prefab };
}
it('propagates a base sprite change to ten instances and preserves one speed override, with undo/reload', () => {
  const { m, prefab } = setup();
  for (let i = 0; i < 9; i++) placePrefab(m, prefab);
  const custom = [...m.selection][0]!;
  m.setBehaviourProperty(behaviour(m, custom).id, 'values.speed', 7);
  const base = prefabBases(m).get(prefab)!;
  (base.entities[0]!.components[SpriteRenderer.type] as { tint: string }).tint =
    '#abcdef';
  editPrefab(m, prefab, base);
  expect([...m.world.query(SpriteRenderer.type)].length).toBe(10);
  for (const [id] of m.world.query(SpriteRenderer.type))
    expect(m.world.read(id, SpriteRenderer)!.tint).toBe('#abcdef');
  expect(behaviour(m, custom).values.speed).toBe(7);
  m.undo();
  expect(m.world.read(m.entity(custom), SpriteRenderer)!.tint).not.toBe(
    '#abcdef',
  );
  m.redo();
  const loaded = new EditorModel();
  loaded.load(m.project);
  expect(behaviour(loaded, custom).values.speed).toBe(7);
  revertPrefab(loaded, custom);
  expect(behaviour(loaded, custom).values.speed).toBe(2);
});
it('applies individual property overrides without publishing root placement', () => {
  const { m, root, prefab } = setup();
  placePrefab(m, prefab);
  const other = [...m.selection][0]!;
  m.setBehaviourProperty(behaviour(m, other).id, 'values.speed', 9);
  const patch = m.world
    .read(m.entity(other), PrefabLink)!
    .overrides.find((p) => p.path.at(-1) === 'speed')!;
  applyPrefabOverride(m, other, patch);
  expect(behaviour(m, root).values.speed).toBe(9);
  expect(m.world.read(m.entity(other), PrefabLink)!.overrides).toHaveLength(0);
  m.translate(10, 0);
  const transform = m.world.read(m.entity(other), PrefabLink)!.overrides[0]!;
  expect(() => applyPrefabOverride(m, other, transform)).toThrow('placement');
});
it('remaps internal references and linked root when duplicating a prefab hierarchy', () => {
  const { m, root } = setup();
  unpackPrefab(m, root);
  const child = m.createEntity('Child', root);
  m.select([root]);
  m.change('Internal ref', () => {
    const data = structuredClone(m.world.read(m.entity(root), Behaviours)!),
      item = data.items[data.order[0]!]!;
    item.values = { ...item.values, target: child };
    m.world.set(m.entity(root), Behaviours.type, data);
  });
  const prefab = createPrefab(m, 'Assets/Parent.prefab.json');
  placePrefab(m, prefab);
  const instance = [...m.selection][0]!;
  const instanceChild = m.world.children(m.entity(instance))[0]!;
  expect(behaviour(m, instance).values.target).toBe(
    m.world.get(instanceChild).guid,
  );
  // The source metadata declares target as an entity reference for ordinary clipboard duplication too.
  m.change('Metadata', () => {
    m.project.assets.find((a) => a.mime === 'text/typescript')!.data =
      'export const fields={speed:{type:"number",default:2},target:{type:"entity",default:""}};export default class Enemy {}';
  });
  m.duplicate();
  const duplicate = [...m.selection][0]!;
  expect(m.world.read(m.entity(duplicate), PrefabLink)!.root).toBe(duplicate);
  expect(behaviour(m, duplicate).values.target).toBe(
    m.world.get(m.world.children(m.entity(duplicate))[0]!).guid,
  );
});
it('blocks incomplete hierarchies and dangling links atomically, and supports unpacking', () => {
  const m = new EditorModel(),
    root = m.createEntity('Parent'),
    child = m.createEntity('Child', root);
  m.select([root]);
  createPrefab(m, 'Assets/Parent.prefab.json');
  m.select([child]);
  expect(() => m.deleteSelection()).toThrow('incomplete');
  expect(m.world.find(child)).toBeDefined();
  const bad = structuredClone(m.project);
  bad.assets = [];
  expect(() => validateProject(bad, m.registry)).toThrow('link');
  unpackPrefab(m, root);
  m.select([child]);
  m.deleteSelection();
  expect(m.world.find(child)).toBeUndefined();
});
it('propagates to inactive scenes and rejects nested prefabs', () => {
  const { m, prefab, root } = setup();
  expect(() => createPrefab(m, 'Assets/Nested.prefab.json')).toThrow('Unpack');
  m.createScene('Second');
  placePrefab(m, prefab);
  const base = prefabBases(m).get(prefab)!;
  (
    base.entities[0]!.components[SpriteRenderer.type] as { width: number }
  ).width = 88;
  editPrefab(m, prefab, base);
  m.switchScene(m.project.scenes[0]!.id);
  expect(m.world.read(m.entity(root), SpriteRenderer)!.width).toBe(88);
});
it('resolves inherited base properties on project load while retaining recorded overrides', () => {
  const { m, prefab, root } = setup();
  m.setBehaviourProperty(behaviour(m, root).id, 'values.speed', 5);
  const project = structuredClone(m.project),
    asset = project.assets.find((a) => a.id === prefab)!,
    base = JSON.parse(asset.data);
  base.entities[0].components['protomake.sprite'].tint = '#112233';
  asset.data = JSON.stringify(base);
  const restored = new EditorModel();
  restored.load(project);
  expect(restored.world.read(restored.entity(root), SpriteRenderer)!.tint).toBe(
    '#112233',
  );
  expect(behaviour(restored, root).values.speed).toBe(5);
});
