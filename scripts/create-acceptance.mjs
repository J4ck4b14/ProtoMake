import { createServer } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
});
try {
  const { EditorModel } = await server.ssrLoadModule(
    '/packages/editor/src/model.ts',
  );
  const { createPrefab, placePrefab } = await server.ssrLoadModule(
    '/packages/editor/src/prefab-actions.ts',
  );
  const model = new EditorModel();
  model.load(
    JSON.parse(
      await readFile(
        'examples/physics-playground/Playground.protomake.json',
        'utf8',
      ),
    ),
  );
  const ids = Array.from({ length: 9 }, () => randomUUID()),
    images = ids.slice(0, 4),
    idle = ids[4],
    run = ids[5],
    controller = ids[6],
    audio = ids[7],
    enemyScript = ids[8];
  const assets = [];
  for (let i = 0; i < 4; i++)
    assets.push({
      id: images[i],
      path: `Assets/Images/Frame-${i + 1}.png`,
      kind: 'image',
      mime: 'image/png',
      data:
        'data:image/png;base64,' +
        (
          await readFile(`examples/milestones-5-7/Images/Frame-${i + 1}.png`)
        ).toString('base64'),
      width: 48,
      height: 48,
    });
  assets.push({
    id: audio,
    path: 'Assets/Audio/Jump.wav',
    kind: 'audio',
    mime: 'audio/wav',
    data:
      'data:audio/wav;base64,' +
      (await readFile('examples/milestones-5-7/Audio/Jump.wav')).toString(
        'base64',
      ),
    width: 0,
    height: 0,
  });
  const textAsset = (id, path, mime, data) => ({
    id,
    path,
    kind: 'text',
    mime,
    data: typeof data === 'string' ? data : JSON.stringify(data),
    width: 0,
    height: 0,
  });
  assets.push(
    textAsset(
      idle,
      'Assets/Animations/Rest.animation.json',
      'application/x-protomake-animation',
      {
        version: 1,
        name: 'Rest',
        loop: true,
        speed: 1,
        frames: images
          .slice(0, 2)
          .map((texture) => ({ texture, duration: 0.35 })),
      },
    ),
  );
  assets.push(
    textAsset(
      run,
      'Assets/Animations/Moving.animation.json',
      'application/x-protomake-animation',
      {
        version: 1,
        name: 'Moving',
        loop: true,
        speed: 1,
        frames: images.slice(2).map((texture) => ({ texture, duration: 0.09 })),
      },
    ),
  );
  assets.push(
    textAsset(
      controller,
      'Assets/Animations/Player.animator.json',
      'application/x-protomake-animator',
      {
        version: 1,
        initial: 'Rest',
        parameters: { moving: { type: 'bool', default: false } },
        states: [
          { name: 'Rest', clip: idle, speed: 1 },
          { name: 'Moving', clip: run, speed: 1 },
        ],
        transitions: [
          {
            from: 'Rest',
            to: 'Moving',
            exitTime: null,
            conditions: [{ parameter: 'moving', operator: '==', value: true }],
          },
          {
            from: 'Moving',
            to: 'Rest',
            exitTime: null,
            conditions: [{ parameter: 'moving', operator: '==', value: false }],
          },
        ],
      },
    ),
  );
  assets.push(
    textAsset(
      enemyScript,
      'Assets/Scripts/Enemy.ts',
      'text/typescript',
      await readFile('examples/milestones-5-7/Scripts/Enemy.ts', 'utf8'),
    ),
  );
  const player = [...model.world.all()].find((e) => e.name === 'Player'),
    playerBehaviours = model.world
      .components(player.id)
      .get('protomake.behaviours'),
    script = playerBehaviours.items[playerBehaviours.order[0]].script;
  const playerSource = await readFile(
    'examples/milestones-5-7/Scripts/PlayerController.ts',
    'utf8',
  );
  model.change('Example media', () => {
    model.project.name = 'ProtoMake · Prefabs, Animation & Audio';
    model.project.engineVersion = '0.10.0';
    model.project.assets.push(...assets);
    model.project.assets.find((a) => a.id === script).data = playerSource;
    model.project.folders = [
      'Assets',
      'Assets/Images',
      'Assets/Audio',
      'Assets/Animations',
      'Assets/Scripts',
      'Assets/Prefabs',
      'Assets/Empty folder',
      'Scenes',
    ];
    model.project.sceneFolders[model.sceneId] = 'Scenes';
    model.world.add(player.id, 'protomake.animator', { controller, speed: 1 });
    model.world.add(player.id, 'protomake.audio-source', {
      clip: audio,
      volume: 0.7,
      loop: false,
      rate: 1,
      bus: 'SFX',
      playOnAwake: false,
    });
    model.world.set(player.id, 'protomake.sprite', {
      ...model.world.components(player.id).get('protomake.sprite'),
      texture: images[0],
    });
  });
  const root = model.createEntity('Enemy 01');
  model.addComponent('protomake.sprite');
  model.addScriptBehaviour(enemyScript, { speed: 1 });
  model.change('Enemy behaviour', () => {
    model.world.set(model.entity(root), 'protomake.sprite', {
      ...model.world.components(model.entity(root)).get('protomake.sprite'),
      texture: images[2],
      width: 30,
      height: 34,
    });
    model.world.setLocalMatrix(model.entity(root), [1, 0, 0, 1, -360, -130]);
  });
  const prefab = createPrefab(model, 'Assets/Prefabs/Enemy.prefab.json');
  for (let i = 1; i < 10; i++) {
    placePrefab(model, prefab);
    const id = [...model.selection][0];
    model.change('Arrange instances', () => {
      model.world.rename(
        model.entity(id),
        `Enemy ${String(i + 1).padStart(2, '0')}`,
      );
      model.world.setLocalMatrix(model.entity(id), [
        1,
        0,
        0,
        1,
        -360 + i * 80,
        -130,
      ]);
    });
    if (i === 9) {
      const behaviours = model.world
        .components(model.entity(id))
        .get('protomake.behaviours');
      model.setBehaviourProperty(behaviours.order[0], 'values.speed', 3);
    }
  }
  model.select([player.guid]);
  await writeFile(
    'examples/milestones-5-7/Workshop.protomake.json',
    JSON.stringify(model.project, null, 2) + '\n',
  );
  console.log(
    'Acceptance project saved: 10 linked Enemy instances, parameter-driven animation and jump AudioSource.',
  );
} finally {
  await server.close();
}
