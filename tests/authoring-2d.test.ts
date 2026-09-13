import { expect, it } from 'vitest';
import { compose, guid } from '@protomake/core';
import {
  AssetSchema,
  SPRITE_REGION_MIME,
  SpriteRegionSchema,
} from '@protomake/assets';
import { EditorModel } from '@protomake/editor';
import { sliceRegions } from '../packages/editor/src/sprite-slicer';
import { Tilemap2D, TileSetSchema, TILESET_MIME } from '@protomake/tilemap';
import { BoxCollider2D, CharacterBody2D } from '@protomake/physics2d';
import { Physics2D } from '@protomake/physics2d/rapier';
import {
  Camera2D,
  CameraBehaviourSystem,
  CameraFollow2D,
} from '@protomake/renderer';
import { Engine } from '@protomake/runtime';

function image(width = 64, height = 32) {
  return AssetSchema.parse({
    id: guid(),
    path: 'Assets/sheet.png',
    kind: 'image',
    mime: 'image/png',
    data: 'data:image/png;base64,AA==',
    width,
    height,
  });
}

it('slices one source image into stable reusable region assets', () => {
  const source = image(),
    regions = sliceRegions(source, 16, 16);
  expect(regions).toHaveLength(8);
  expect(new Set(regions.map((region) => region.id)).size).toBe(8);
  expect(SpriteRegionSchema.parse(JSON.parse(regions[3]!.data))).toMatchObject({
    source: source.id,
    width: 16,
    height: 16,
  });
  expect(regions.every((region) => region.mime === SPRITE_REGION_MIME)).toBe(
    true,
  );
});

it('validates animated, collidable and rule-driven tile definitions', () => {
  const texture = guid(),
    set = TileSetSchema.parse({
      version: 1,
      name: 'Dungeon',
      tiles: [
        {
          id: 'wall',
          name: 'Wall',
          texture,
          solid: true,
          oneWay: false,
          animation: [{ texture, duration: 0.1 }],
          rules: { north: 'wall', east: '', south: 'wall', west: '' },
        },
      ],
    });
  expect(set.tiles[0]).toMatchObject({ solid: true, animation: [{ texture }] });
});

it('builds chunked tile collision and reports grounded character state', async () => {
  const model = new EditorModel(),
    texture = image(32, 32),
    setId = guid(),
    mapId = model.createEntity('Map');
  model.change('Map', () => {
    model.project.assets.push(
      texture,
      AssetSchema.parse({
        id: setId,
        path: 'Assets/world.tileset.json',
        kind: 'text',
        mime: TILESET_MIME,
        data: JSON.stringify({
          version: 1,
          name: 'World',
          tiles: [
            {
              id: 'solid',
              name: 'Solid',
              texture: texture.id,
              solid: true,
              oneWay: false,
              animation: [],
              rules: null,
            },
          ],
        }),
        width: 0,
        height: 0,
      }),
    );
    model.world.add(model.entity(mapId), Tilemap2D.type, {
      ...Tilemap2D.defaults(),
      tileset: setId,
      layers: [
        {
          id: 'base',
          name: 'Base',
          visible: true,
          order: 0,
          cells: { '0,2': 'solid', '1,2': 'solid' },
        },
      ],
    });
  });
  const actor = model.createEntity('Actor');
  model.change('Character', () => {
    const id = model.entity(actor);
    model.world.setLocalMatrix(id, compose(16, 40));
    model.world.add(id, BoxCollider2D.type, {
      ...BoxCollider2D.defaults(),
      width: 24,
      height: 32,
      layer: 2,
    });
    model.world.add(id, CharacterBody2D.type);
  });
  const physics = await Physics2D.create(
    model.world,
    model.project.physics,
    model.project.assets,
  );
  try {
    physics.step(1 / 60);
    expect(physics.characterState(actor).grounded).toBe(true);
    const moved = physics.moveAndSlide(actor, [100, 0], 0.1);
    expect(moved.velocity[0]).toBe(100);
  } finally {
    physics.destroy();
  }
});

it('follows a target with dead-zone, look-ahead and smoothing controls', () => {
  const model = new EditorModel(),
    target = model.createEntity('Target'),
    camera = model.createEntity('Camera');
  model.change('Camera', () => {
    model.world.setLocalMatrix(model.entity(target), compose(120, 30));
    model.world.add(model.entity(camera), Camera2D.type);
    model.world.add(model.entity(camera), CameraFollow2D.type, {
      ...CameraFollow2D.defaults(),
      target,
      deadZoneWidth: 0,
      deadZoneHeight: 0,
      lookAheadSeconds: 0,
      smoothing: 0,
    });
  });
  const engine = new Engine(model.world);
  engine.addSystem(new CameraBehaviourSystem(model.world));
  engine.start();
  engine.tick(1 / 60);
  expect(model.world.worldPosition(model.entity(camera))).toEqual([120, 30]);
  engine.stop();
});
