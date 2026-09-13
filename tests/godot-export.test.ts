import { expect, it } from 'vitest';
import { compose, guid } from '@protomake/core';
import { EditorModel } from '@protomake/editor';
import { GRAPH_MIME } from '@protomake/graphs';
import { lowerProject } from '@protomake/interchange';
import { exportGodot } from '@protomake/interchange/godot';

const decoded = (data: Uint8Array): string => new TextDecoder().decode(data);

it('generates a deterministic Godot 4 project with scenes, assets and graphs', () => {
  const model = new EditorModel(),
    parent = model.createEntity('Player'),
    child = model.createEntity('Weapon', parent),
    image = guid(),
    graph = guid();
  model.project.name = 'Godot Fixture';
  model.change('Build Godot fixture', () => {
    model.project.assets.push(
      {
        id: image,
        path: 'Assets/player.png',
        kind: 'image',
        mime: 'image/png',
        data: 'data:image/png;base64,AA==',
        width: 32,
        height: 16,
      },
      {
        id: graph,
        path: 'Assets/move.graph.json',
        kind: 'text',
        mime: GRAPH_MIME,
        data: JSON.stringify({
          version: 1,
          id: 'move_graph',
          nodes: [
            { id: 'start', type: 'event.start', x: 0, y: 0, properties: {} },
            {
              id: 'log',
              type: 'debug.log',
              x: 200,
              y: 0,
              properties: { message: 'ready' },
            },
          ],
          connections: [
            {
              id: 'start_log',
              from: { node: 'start', port: 'out' },
              to: { node: 'log', port: 'in' },
            },
          ],
          variables: {},
          groups: [],
        }),
        width: 0,
        height: 0,
      },
    );
    const player = model.entity(parent),
      weapon = model.entity(child);
    model.world.setLocalMatrix(player, compose(120, 80, Math.PI / 4, 2, 1));
    model.world.setLocalMatrix(weapon, compose(16, -4));
    model.world.add(player, 'protomake.sprite', {
      texture: image,
      secondaryTexture: '',
      blend: 1,
      lit: true,
      castShadow: false,
      lightingChannel: 'World',
      width: 64,
      height: 32,
      tint: '#ff8040',
      opacity: 0.75,
      visible: true,
      flipX: false,
      flipY: false,
      anchorX: 0.5,
      anchorY: 0.5,
      useTexturePivot: true,
      layer: 1,
      order: 2,
    });
    model.world.add(player, 'protomake.camera');
    model.world.add(player, 'protomake.rigidbody');
    model.world.add(player, 'protomake.box-collider', {
      offsetX: 0,
      offsetY: 2,
      sensor: false,
      friction: 0.5,
      restitution: 0,
      layer: 2,
      oneWay: false,
      width: 28,
      height: 14,
    });
  });
  model.select([parent]);
  model.addGraphBehaviour(graph, { speed: 120 });

  const interchange = lowerProject(model.project),
    first = exportGodot(interchange),
    second = exportGodot(interchange),
    files = new Map(first.map((file) => [file.path, file.data]));

  expect(first).toEqual(second);
  expect(decoded(files.get('project.godot')!)).toContain(
    'run/main_scene="res://Scenes/Scene_1-',
  );
  const scenePath = [...files.keys()].find((path) => path.endsWith('.tscn'))!,
    scene = decoded(files.get(scenePath)!);
  expect(scene).toContain('type="RigidBody2D"');
  expect(scene).toContain('transform = Transform2D(');
  expect(scene).toContain(', 120, 80)');
  expect(scene).toContain('type="Sprite2D"');
  expect(scene).toContain('type="CollisionShape2D"');
  expect(scene).toContain('type="Camera2D"');
  expect(scene).toContain('ProtoMakeGraphRuntime.gd');
  expect(scene).toContain(`metadata/protomake_id = "${child}"`);
  expect(files.get(`Generated/ProtoMake/Assets/${image}.png`)).toEqual(
    Uint8Array.of(0),
  );
  expect(
    decoded(files.get('Generated/ProtoMake/portability-report.json')!),
  ).toContain('fully-portable');
  expect(
    decoded(files.get('Generated/ProtoMake/Scripts/ProtoMakeGraphRuntime.gd')!),
  ).toContain('physics.setVelocity');
});
