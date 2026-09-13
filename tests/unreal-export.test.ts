import { expect, it } from 'vitest';
import { guid } from '@protomake/core';
import { EditorModel } from '@protomake/editor';
import { lowerProject } from '@protomake/interchange';
import { exportUnreal } from '@protomake/interchange/unreal';

const decoded = (data: Uint8Array): string => new TextDecoder().decode(data);

it('generates a deterministic UE5 C++ importer bundle without binary assets', () => {
  const model = new EditorModel(),
    actor = model.createEntity('Paper Actor'),
    image = guid();
  model.project.name = 'Unreal Fixture';
  model.change('Build Unreal fixture', () => {
    model.project.assets.push({
      id: image,
      path: 'Assets/actor.png',
      kind: 'image',
      mime: 'image/png',
      data: 'data:image/png;base64,BAUG',
      width: 16,
      height: 16,
    });
    const entity = model.entity(actor);
    model.world.add(entity, 'protomake.sprite', {
      texture: image,
      secondaryTexture: '',
      blend: 1,
      lit: true,
      castShadow: false,
      lightingChannel: 'World',
      width: 32,
      height: 32,
      tint: '#ffffff',
      opacity: 1,
      visible: true,
      flipX: false,
      flipY: false,
      anchorX: 0.5,
      anchorY: 0.5,
      useTexturePivot: true,
      layer: 0,
      order: 0,
    });
    model.world.add(entity, 'protomake.rigidbody');
    model.world.add(entity, 'protomake.box-collider');
  });

  const interchange = lowerProject(model.project),
    first = exportUnreal(interchange),
    second = exportUnreal(interchange),
    files = new Map(first.map((file) => [file.path, file.data])),
    importerPath = [...files.keys()].find((path) =>
      path.endsWith('ProtoMakeImporterModule.cpp'),
    )!,
    graphPath = [...files.keys()].find((path) =>
      path.endsWith('ProtoMakeGraphComponent.cpp'),
    )!,
    importer = decoded(files.get(importerPath)!),
    graph = decoded(files.get(graphPath)!);

  expect(first).toEqual(second);
  expect(first.map((file) => file.path)).toEqual(
    [...first.map((file) => file.path)].sort(),
  );
  expect(decoded(files.get('Unreal_Fixture.uproject')!)).toContain('Paper2D');
  expect(importer).toContain('ImportAssetTasks');
  expect(importer).toContain('UWorldFactory');
  expect(importer).toContain('FactoryCreateNew');
  expect(importer).toContain('UPaperSpriteComponent');
  expect(importer).toContain('UInputMappingContext');
  expect(importer).toContain('UPaperFlipbook');
  expect(graph).toContain('physics.setVelocity');
  expect(graph).toContain('UEnhancedPlayerInput');
  expect(files.get(`ProtoMakeSource/Assets/${image}.png`)).toEqual(
    Uint8Array.of(4, 5, 6),
  );
  expect(first.some((file) => file.path.endsWith('.uasset'))).toBe(false);
  expect(first.some((file) => file.path.endsWith('.umap'))).toBe(false);
  expect(first.some((file) => file.path.endsWith('.py'))).toBe(false);
});
