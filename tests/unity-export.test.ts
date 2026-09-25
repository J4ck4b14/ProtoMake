import { expect, it } from 'vitest';
import { guid } from '@protomake/core';
import { EditorModel } from '@protomake/editor';
import { lowerProject } from '@protomake/interchange';
import { exportUnity } from '@protomake/interchange/unity';

const decoded = (data: Uint8Array): string => new TextDecoder().decode(data);

it('generates a deterministic Unity project driven by supported Editor APIs', () => {
  const model = new EditorModel(),
    actor = model.createEntity('Actor'),
    image = guid();
  model.project.name = 'Unity Fixture';
  model.change('Build Unity fixture', () => {
    model.project.assets.push({
      id: image,
      path: 'Assets/actor.png',
      kind: 'image',
      mime: 'image/png',
      data: 'data:image/png;base64,AQID',
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
    model.world.add(entity, 'protomake.circle-collider');
  });

  const interchange = lowerProject(model.project),
    first = exportUnity(interchange),
    second = exportUnity(interchange),
    files = new Map(first.map((file) => [file.path, file.data])),
    importer = decoded(
      files.get('Assets/ProtoMake/Editor/ProtoMakeImporter.cs')!,
    ),
    runtime = decoded(
      files.get('Assets/ProtoMake/Runtime/ProtoMakeGraphBehaviour.cs')!,
    );

  expect(first).toEqual(second);
  expect(first.map((file) => file.path)).toEqual(
    [...first.map((file) => file.path)].sort(),
  );
  expect(decoded(files.get('Packages/manifest.json')!)).toContain(
    'com.unity.inputsystem',
  );
  expect(importer).toContain('EditorSceneManager.SaveScene');
  expect(importer).toContain('AssetDatabase.CreateAsset');
  expect(importer).toContain('new GameObject');
  expect(importer).toContain('AddComponent<Rigidbody2D>');
  expect(importer).toContain('InputActionAsset');
  expect(importer).toContain('AnimationUtility.SetObjectReferenceCurve');
  expect(importer).toContain(
    'AnimatorController.CreateAnimatorControllerAtPath',
  );
  expect(runtime).toContain('physics.setVelocity');
  expect(
    decoded(files.get('Assets/ProtoMake/Runtime/ProtoMakeCoordinates.cs')!),
  ).toContain('UnitsPerPixel = 0.01f');
  expect(files.get(`Assets/Generated/ProtoMake/Assets/${image}.png`)).toEqual(
    Uint8Array.of(1, 2, 3),
  );
  expect(first.some((file) => file.path.endsWith('.unity'))).toBe(false);
  expect(first.some((file) => file.path.endsWith('.meta'))).toBe(false);
});
