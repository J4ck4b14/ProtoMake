import { it, expect } from 'vitest';
import { guid } from '@protomake/core';
import { AssetDatabase, assetReferences, type AssetData } from '@protomake/assets';
import { SpriteRenderer, Camera2D, renderList } from '@protomake/renderer';
import { EditorModel } from '@protomake/editor';
import {
  validateProject,
  deserializeProject,
  serializeProject,
} from '@protomake/serialization';
function image(path = 'Assets/test.png'): AssetData {
  return {
    id: guid(),
    path,
    kind: 'image',
    mime: 'image/png',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',
    width: 1,
    height: 1,
  };
}
it('keeps durable identity and reference validity after rename/move', () => {
  const e = new EditorModel(),
    asset = image();
  e.change('Import', () => {
    e.project.assets.push(asset);
  });
  e.createEntity();
  e.addComponent(SpriteRenderer.type);
  e.setProperty(SpriteRenderer.type, 'texture', asset.id);
  const database = new AssetDatabase(e.project.assets);
  database.move(asset.id, 'Assets/Characters/hero.png');
  e.project.assets = database.all();
  expect(database.byPath('assets/characters/HERO.png')?.id).toBe(asset.id);
  expect(validateProject(e.project, e.registry).assets[0]?.path).toContain(
    'hero',
  );
  expect(
    database.missing(assetReferences(e.project.scenes, e.registry)),
  ).toEqual([]);
});
it('rejects referenced deletion, duplicate paths and missing references', () => {
  const e = new EditorModel(),
    asset = image(),
    database = new AssetDatabase([asset]);
  e.project.assets.push(asset);
  e.createEntity();
  e.addComponent(SpriteRenderer.type);
  e.setProperty(SpriteRenderer.type, 'texture', asset.id);
  expect(() =>
    database.delete(asset.id, assetReferences(e.project.scenes, e.registry)),
  ).toThrow(/referenced/);
  expect(() => database.import(image('assets/TEST.png'))).toThrow(
    /already exists/,
  );
  e.project.assets = [];
  expect(() => validateProject(e.project, e.registry)).toThrow(/Missing asset/);
});
it('round-trips imported assets and rejects traversal paths', () => {
  const e = new EditorModel();
  e.project.assets.push(image());
  expect(
    deserializeProject(serializeProject(e.project, e.registry), e.registry),
  ).toEqual(e.project);
  expect(() => new AssetDatabase([image('../bad.png')])).toThrow();
});
it('migrates the original project schema to the current version without losing entities', () => {
  const e = new EditorModel();
  e.createEntity('Original');
  const original = structuredClone(e.project) as unknown as Record<
    string,
    unknown
  >;
  original.schemaVersion = 1;
  delete original.assets;
  const loaded = validateProject(original, e.registry);
  expect(loaded.schemaVersion).toBe(9);
  expect(loaded.assets).toEqual([]);
  expect(loaded.scenes[0]?.entities[0]?.name).toBe('Original');
});
it('sorts sprites deterministically by layer, order and stable identity', () => {
  const e = new EditorModel();
  for (const [layer, order] of [
    [2, 0],
    [0, 9],
    [0, 1],
  ]) {
    e.createEntity();
    e.addComponent(SpriteRenderer.type);
    e.setProperty(SpriteRenderer.type, 'layer', layer);
    e.setProperty(SpriteRenderer.type, 'order', order);
  }
  expect(renderList(e.world).map((r) => [r.data.layer, r.data.order])).toEqual([
    [0, 1],
    [0, 9],
    [2, 0],
  ]);
});
it('validates sprite opacity, dimensions and camera viewport', () => {
  expect(() =>
    SpriteRenderer.schema.parse({ ...SpriteRenderer.defaults(), opacity: 2 }),
  ).toThrow();
  expect(() =>
    SpriteRenderer.schema.parse({ ...SpriteRenderer.defaults(), width: 0 }),
  ).toThrow();
  expect(() =>
    Camera2D.schema.parse({
      ...Camera2D.defaults(),
      viewportX: 0.5,
      viewportWidth: 1,
    }),
  ).toThrow();
});
