import { createServer } from 'vite';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
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
  for (const game of ['shooter', 'platformer', 'fighter']) {
    const m = new EditorModel();
    const root = `examples/prototypes/${game}`;
    const assetIds = {};
    const asset = (name, kind, mime, data, width = 0, height = 0) => {
      const id = randomUUID();
      assetIds[name] = id;
      m.project.assets.push({
        id,
        path: `Assets/${name}`,
        kind,
        mime,
        data,
        width,
        height,
      });
      return id;
    };
    const entity = (
      name,
      x,
      y,
      w,
      h,
      tint = '#ffffff',
      texture = '',
      extra = {},
    ) => {
      const id = m.world.create(name);
      m.world.setLocalMatrix(id, [1, 0, 0, 1, x, y]);
      if (w)
        m.world.add(id, 'protomake.sprite', {
          ...m.registry.get('protomake.sprite').defaults(),
          width: w,
          height: h,
          tint,
          texture,
          ...extra,
        });
      return id;
    };
    const component = (id, type, values = {}) =>
      m.world.add(id, type, { ...m.registry.get(type).defaults(), ...values });
    const light = (name, kind, x, y, values = {}) => {
      const id = entity(name, x, y, 0, 0);
      component(id, 'protomake.light', { kind, ...values });
      return id;
    };
    const hud = (name, x, y, width, color) =>
      entity(name, x, y, width, 12, color, '', {
        lit: false,
        anchorX: 0,
        layer: 20,
        order: name.includes('background') ? 0 : 1,
      });
    m.change('Author prototype', () => {
      m.project.name = {
        shooter: 'Signal Patrol',
        platformer: 'Lantern Steps',
        fighter: 'Sparring Room',
      }[game];
      m.project.engineVersion = '0.8.0';
      m.project.folders = [
        'Assets',
        'Assets/Images',
        'Assets/Scripts',
        'Assets/Audio',
        'Assets/Animations',
        'Assets/Prefabs',
        'Scenes',
      ];
      m.project.sceneFolders[m.sceneId] = 'Scenes';
      m.project.physics.gravityY = game === 'platformer' ? 980 : 0;
    });
    // Import the same human-editable files a workshop reader will import through Assets.
    const imageSizes = JSON.parse(
      await readFile(`${root}/Images/sizes.json`, 'utf8'),
    );
    for (const [name, [w, h]] of Object.entries(imageSizes))
      asset(
        `Images/${name}`,
        'image',
        'image/png',
        `data:image/png;base64,${(await readFile(`${root}/Images/${name}`)).toString('base64')}`,
        w,
        h,
      );
    asset(
      'Audio/Action.wav',
      'audio',
      'audio/wav',
      `data:audio/wav;base64,${(await readFile('examples/milestones-5-7/Audio/Jump.wav')).toString('base64')}`,
    );
    await mkdir(`${root}/Audio`, { recursive: true });
    await writeFile(
      `${root}/Audio/Action.wav`,
      await readFile('examples/milestones-5-7/Audio/Jump.wav'),
    );
    for (const name of await readdir(`${root}/Scripts`))
      if (name.endsWith('.ts'))
        asset(
          `Scripts/${name}`,
          'text',
          'text/typescript',
          await readFile(`${root}/Scripts/${name}`, 'utf8'),
        );
    const clips = [];
    for (const [name, frames] of [
      ['Idle', [0, 1]],
      ['Action', [2, 3]],
    ])
      clips.push(
        asset(
          `Animations/${name}.animation.json`,
          'text',
          'application/x-protomake-animation',
          JSON.stringify({
            version: 1,
            name,
            loop: true,
            speed: 1,
            frames: frames.map((i) => ({
              texture: assetIds[`Images/Actor-${i}.png`],
              duration: name === 'Idle' ? 0.3 : 0.08,
            })),
          }),
        ),
      );
    const controller = asset(
      'Animations/Actor.animator.json',
      'text',
      'application/x-protomake-animator',
      JSON.stringify({
        version: 1,
        initial: 'Idle',
        parameters: { active: { type: 'bool', default: false } },
        states: [
          { name: 'Idle', clip: clips[0], speed: 1 },
          { name: 'Action', clip: clips[1], speed: 1 },
        ],
        transitions: [
          {
            from: 'Idle',
            to: 'Action',
            exitTime: null,
            conditions: [{ parameter: 'active', operator: '==', value: true }],
          },
          {
            from: 'Action',
            to: 'Idle',
            exitTime: null,
            conditions: [{ parameter: 'active', operator: '==', value: false }],
          },
        ],
      }),
    );
    m.change('Create scene', () => {
      const camera = entity('Camera', 0, 0, 0, 0);
      component(camera, 'protomake.camera', { zoom: 1, background: '#101820' });
      entity(
        'Backdrop',
        0,
        0,
        800,
        500,
        '#ffffff',
        assetIds['Images/Backdrop.png'],
        { layer: -10, lit: false },
      );
      entity(
        'Instructions',
        0,
        -225,
        760,
        44,
        '#ffffff',
        assetIds['Images/Instructions.png'],
        { layer: 20, lit: false },
      );
      for (const [name, file] of [
        ['Victory', 'Victory.png'],
        ['Defeat', 'Defeat.png'],
      ])
        entity(name, 0, 0, 520, 120, '#ffffff', assetIds[`Images/${file}`], {
          layer: 30,
          visible: false,
          lit: false,
        });
      light('Ambient', 'ambient', 0, 0, { intensity: 0.65, color: '#d4e5ff' });
      light('Warm pool', 'point', -190, 0, {
        range: 350,
        color: '#ffb76b',
        intensity: 0.8,
        falloff: 1.4,
      });
      light('Cool area', 'area', 200, 60, {
        range: 220,
        width: 220,
        height: 100,
        color: '#75caff',
        intensity: 0.65,
      });
      const spot = light('Spotlight', 'spot', -350, -160, {
        range: 700,
        color: '#fff0ce',
        intensity: 0.8,
        innerAngle: 30,
        outerAngle: 75,
      });
      m.world.setLocalMatrix(spot, [
        Math.cos(0.4),
        Math.sin(0.4),
        -Math.sin(0.4),
        Math.cos(0.4),
        -350,
        -160,
      ]);
      const button = (name, keys) => ({
        name,
        kind: 'button',
        positiveX: keys,
        negativeX: [],
        positiveY: [],
        negativeY: [],
      });
      m.project.input.push(button('Restart', ['KeyR']));
      if (game !== 'fighter') {
        hud('Health background', -350, -192, 160, '#26313d');
        hud('Health', -350, -192, 160, '#74e8b8');
        hud('Score background', 190, -192, 160, '#26313d');
        hud('Score', 190, -192, 1, '#f3ac66');
        const player = entity(
          'Player',
          -310,
          game === 'shooter' ? 0 : 130,
          32,
          32,
          '#ffffff',
          assetIds['Images/Actor-0.png'],
        );
        component(player, 'protomake.animator', { controller });
        component(player, 'protomake.audio-source', {
          clip: assetIds['Audio/Action.wav'],
          volume: 0.3,
          bus: 'SFX',
        });
        component(player, 'protomake.script', {
          script:
            assetIds[
              `Scripts/${game === 'shooter' ? 'Shooter' : 'Platformer'}.ts`
            ],
          values: {},
        });
        if (game === 'shooter') {
          m.project.input.push(button('Fire', ['Space', 'Mouse0']));
          for (let i = 0; i < 12; i++)
            entity(`Bullet ${i + 1}`, 0, 0, 16, 5, '#ffdf8e', '', {
              visible: false,
              lit: false,
            });
          for (let i = 0; i < 6; i++)
            entity(
              `Drone ${i + 1}`,
              180 + (i % 2) * 110,
              -140 + Math.floor(i / 2) * 140,
              36,
              36,
              '#ffffff',
              assetIds['Images/Enemy.png'],
            );
        } else {
          component(player, 'protomake.rigidbody');
          component(player, 'protomake.box-collider', {
            width: 28,
            height: 32,
            friction: 0,
          });
          const floor = (name, x, y, w) => {
            const id = entity(
              name,
              x,
              y,
              w,
              24,
              '#ffffff',
              assetIds['Images/Platform.png'],
            );
            component(id, 'protomake.box-collider', { width: w, height: 24 });
            component(id, 'protomake.rigidbody', { mode: 'static' });
          };
          floor('West floor', -240, 180, 240);
          floor('Middle floor', 60, 180, 160);
          floor('East floor', 300, 180, 160);
          floor('Step one', -80, 90, 100);
          floor('Step two', 120, 0, 100);
          [
            [-250, 130],
            [-80, 45],
            [120, -45],
            [300, 105],
          ].forEach(([x, y], i) =>
            entity(
              `Coin ${i + 1}`,
              x,
              y,
              18,
              18,
              '#ffe39c',
              assetIds['Images/Coin.png'],
              { lit: false },
            ),
          );
          entity(
            'Checkpoint',
            -80,
            50,
            20,
            36,
            '#f3ac66',
            assetIds['Images/Flag.png'],
            { lit: false },
          );
          entity(
            'Goal',
            330,
            135,
            32,
            48,
            '#6ee7b7',
            assetIds['Images/Goal.png'],
            { lit: false },
          );
        }
      } else {
        const arena = entity('Arena logic', 0, 0, 0, 0);
        component(arena, 'protomake.script', {
          script: assetIds['Scripts/Fighter.ts'],
          values: {},
        });
        component(arena, 'protomake.audio-source', {
          clip: assetIds['Audio/Action.wav'],
          volume: 0.3,
          bus: 'SFX',
        });
        entity(
          'Ring floor',
          0,
          170,
          760,
          24,
          '#ffffff',
          assetIds['Images/Platform.png'],
        );
        for (let i = 0; i < 2; i++) {
          const id = entity(
            `Fighter ${i + 1}`,
            i ? 160 : -160,
            128,
            36,
            60,
            '#ffffff',
            assetIds['Images/Actor-0.png'],
          );
          component(id, 'protomake.animator', { controller });
          entity(
            `Hitbox ${i + 1}`,
            0,
            0,
            48,
            12,
            i ? '#82baff' : '#f3ac66',
            '',
            { visible: false, lit: false },
          );
          hud(
            `Health background ${i + 1}`,
            i ? 190 : -350,
            -192,
            160,
            '#26313d',
          );
          hud(
            `Health ${i + 1}`,
            i ? 190 : -350,
            -192,
            160,
            i ? '#82baff' : '#f3ac66',
          );
          m.project.input.push(
            {
              name: `Move${i + 1}`,
              kind: 'axis',
              positiveX: [i ? 'ArrowRight' : 'KeyD'],
              negativeX: [i ? 'ArrowLeft' : 'KeyA'],
              positiveY: [],
              negativeY: [],
            },
            button(`Jump${i + 1}`, [i ? 'ArrowUp' : 'Space']),
            button(`Attack${i + 1}`, [i ? 'KeyK' : 'KeyF']),
            button(`Block${i + 1}`, [i ? 'KeyL' : 'KeyG']),
          );
        }
      }
    });
    // Link the repeated object set to an editable prefab without changing its authored layout.
    const names =
      game === 'shooter'
        ? Array.from({ length: 6 }, (_, i) => `Drone ${i + 1}`)
        : game === 'platformer'
          ? ['Coin 1', 'Coin 2', 'Coin 3', 'Coin 4']
          : ['Fighter 1', 'Fighter 2'];
    const first = [...m.world.all()].find((e) => e.name === names[0]);
    m.select([first.guid]);
    const prefab = createPrefab(
      m,
      `Assets/Prefabs/${game === 'shooter' ? 'Drone' : game === 'platformer' ? 'Coin' : 'Fighter'}.prefab.json`,
    );
    for (const name of names.slice(1)) {
      const old = [...m.world.all()].find((e) => e.name === name),
        matrix = m.world.localMatrix(old.id);
      m.change('Replace with instance', () => m.world.destroy(old.id));
      placePrefab(m, prefab);
      m.change('Place instance', () => {
        const id = m.entity([...m.selection][0]);
        m.world.rename(id, name);
        m.world.setLocalMatrix(id, matrix);
      });
    }
    await writeFile(
      `${root}/${game}.protomake.json`,
      JSON.stringify(m.project, null, 2) + '\n',
    );
    console.log(
      `${game}: ${m.project.assets.length} assets; ${[...m.world.all()].length} entities`,
    );
  }
} finally {
  await server.close();
}
