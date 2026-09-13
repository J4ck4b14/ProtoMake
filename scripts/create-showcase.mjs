import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { format } from 'prettier';

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
});

try {
  const { EditorModel } = await server.ssrLoadModule(
    '/packages/editor/src/model.ts',
  );
  const m = new EditorModel(),
    root = 'examples/prototypes/showcase',
    assetIds = {};
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
    width = 0,
    height = 0,
    tint = '#ffffff',
    texture = '',
    extra = {},
  ) => {
    const id = m.world.create(name);
    m.world.setLocalMatrix(id, [1, 0, 0, 1, x, y]);
    if (width)
      m.world.add(id, 'protomake.sprite', {
        ...m.registry.get('protomake.sprite').defaults(),
        width,
        height,
        tint,
        texture,
        ...extra,
      });
    return id;
  };
  const component = (id, type, values = {}) =>
    m.world.add(id, type, { ...m.registry.get(type).defaults(), ...values });
  const light = (name, kind, mobility, x, y, values = {}) => {
    const id = entity(name, x, y);
    component(id, 'protomake.light', { kind, mobility, ...values });
    return id;
  };
  const platform = (name, x, y, width, visible = true) => {
    const id = entity(
      name,
      x,
      y,
      width,
      26,
      '#8fc9bd',
      assetIds['Images/Platform.png'],
      { lit: true, visible },
    );
    component(id, 'protomake.box-collider', { width, height: 26 });
    component(id, 'protomake.rigidbody', { mode: 'static' });
    return id;
  };
  const uiText = (
    name,
    text,
    anchor,
    width,
    color = '#eef7ff',
    size = 14,
    align = 'left',
  ) => {
    const id = entity(name, 0, 0);
    component(id, 'protomake.ui-text', {
      text,
      font: 'ui-monospace, SFMono-Regular, Consolas, monospace',
      size,
      color,
      align,
      wrap: true,
    });
    component(id, 'protomake.ui-panel', { color: '#101924', opacity: 0.88 });
    component(id, 'protomake.ui-layout', {
      anchor,
      width,
      padding: 9,
      margin: 12,
      align: 'center',
      justify: 'center',
    });
    return id;
  };
  const button = (name, keys) => ({
    name,
    map: 'Gameplay',
    kind: 'button',
    sensitivity: 1,
    deadZone: 0.15,
    invertX: false,
    invertY: false,
    positiveX: keys,
    negativeX: [],
    positiveY: [],
    negativeY: [],
  });

  m.change('Configure Luminous Vault', () => {
    m.project.name = 'The Luminous Vault';
    m.project.engineVersion = '0.16.3';
    m.project.folders = [
      'Assets',
      'Assets/Images',
      'Assets/Scripts',
      'Assets/Audio',
      'Assets/Animations',
      'Scenes',
    ];
    m.project.sceneFolders[m.sceneId] = 'Scenes';
    m.project.physics.gravityY = 980;
    m.project.persistence.achievements = [
      {
        id: 'vaultbreaker',
        name: 'Vaultbreaker',
        description: 'Awaken both sun crystals and escape the Luminous Vault.',
        icon: '',
        hidden: false,
      },
    ];
    m.project.input = [
      {
        name: 'Move',
        map: 'Gameplay',
        kind: 'axis',
        sensitivity: 1,
        deadZone: 0.15,
        invertX: false,
        invertY: false,
        positiveX: ['KeyD', 'ArrowRight'],
        negativeX: ['KeyA', 'ArrowLeft'],
        positiveY: [],
        negativeY: [],
      },
      button('Jump', ['Space']),
      button('Attack', ['KeyJ', 'Mouse0']),
      button('Switch', ['KeyQ', 'Tab']),
      button('Sword', ['Digit1']),
      button('Blaster', ['Digit2']),
      button('Potion', ['KeyH']),
      button('Lantern', ['KeyL']),
      button('Restart', ['KeyR']),
    ];
  });

  const imageSizes = JSON.parse(
    await readFile(`${root}/Images/sizes.json`, 'utf8'),
  );
  for (const [name, [width, height]] of Object.entries(imageSizes))
    asset(
      `Images/${name}`,
      'image',
      'image/png',
      `data:image/png;base64,${(
        await readFile(`${root}/Images/${name}`)
      ).toString('base64')}`,
      width,
      height,
    );
  asset(
    'Audio/Action.wav',
    'audio',
    'audio/wav',
    `data:audio/wav;base64,${(
      await readFile(`${root}/Audio/Action.wav`)
    ).toString('base64')}`,
  );
  for (const name of ['Helpers.ts', 'Showcase.ts'])
    asset(
      `Scripts/${name}`,
      'text',
      'text/typescript',
      await readFile(`${root}/Scripts/${name}`, 'utf8'),
    );

  const clips = [];
  for (const [name, frames, duration] of [
    ['Idle', [0, 1], 0.32],
    ['Action', [2, 3], 0.08],
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
          frames: frames.map((index) => ({
            texture: assetIds[`Images/Actor-${index}.png`],
            duration,
          })),
        }),
      ),
    );
  const controller = asset(
    'Animations/Vaultbreaker.animator.json',
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

  m.change('Author Luminous Vault scene', () => {
    const camera = entity('Camera', 0, 0);
    component(camera, 'protomake.camera', { background: '#070d15', zoom: 1 });

    entity(
      'Lit vault backdrop',
      0,
      0,
      800,
      500,
      '#9fb6c5',
      assetIds['Images/Backdrop.png'],
      { layer: -20, lit: true, lightingChannel: 'World' },
    );
    entity('Upper darkness', 0, -208, 800, 80, '#132231', '', {
      layer: -18,
      lit: true,
    });
    entity('Lower darkness', 0, 232, 800, 36, '#0a111b', '', {
      layer: -18,
      lit: true,
    });

    platform('Entrance floor', -300, 205, 200);
    platform('Lower hall', -70, 205, 220);
    platform('Bridge', 90, 205, 100, false);
    platform('Inner floor', 260, 205, 240);
    platform('Puzzle ledge', -10, 120, 130);
    platform('Ascent one', 170, 116, 115);
    platform('Ascent two', 282, 26, 120);

    for (const [name, x, y, width, height] of [
      ['West pillar', -382, 55, 30, 310],
      ['Seal pillar', 83, 73, 26, 235],
      ['East pillar', 386, 55, 28, 310],
      ['Upper beam', 245, -125, 280, 22],
    ]) {
      const id = entity(
        name,
        x,
        y,
        width,
        height,
        '#6f9e9a',
        assetIds['Images/Platform.png'],
        { lit: true, castShadow: true, layer: -1 },
      );
      component(id, 'protomake.shadow-caster', { width, height });
    }

    entity('Seal barrier', 78, 82, 18, 236, '#6df0ff', '', {
      lit: false,
      layer: 4,
      opacity: 0.82,
    });
    entity('Exit aura', 330, -61, 90, 126, '#7ff5ff', '', {
      lit: false,
      layer: 2,
      opacity: 0.18,
      visible: false,
    });
    entity(
      'Exit gate',
      330,
      -61,
      42,
      70,
      '#a9f8ff',
      assetIds['Images/Goal.png'],
      { lit: false, layer: 3 },
    );

    const player = entity(
      'Player',
      -345,
      166,
      32,
      38,
      '#ffffff',
      assetIds['Images/Actor-0.png'],
      { lit: true, castShadow: true, lightingChannel: 'Characters', layer: 2 },
    );
    component(player, 'protomake.rigidbody', { continuous: true });
    component(player, 'protomake.box-collider', {
      width: 27,
      height: 37,
      friction: 0,
    });
    component(player, 'protomake.animator', { controller });
    component(player, 'protomake.audio-source', {
      clip: assetIds['Audio/Action.wav'],
      volume: 0.24,
      bus: 'SFX',
    });
    const behaviour = randomUUID();
    component(player, 'protomake.behaviours', {
      order: [behaviour],
      items: {
        [behaviour]: {
          id: behaviour,
          kind: 'script',
          enabled: true,
          script: assetIds['Scripts/Showcase.ts'],
          values: {},
        },
      },
    });

    const lantern = light('Player lantern', 'point', 'dynamic', 0, 0, {
      color: '#ffd18a',
      intensity: 1.15,
      range: 235,
      falloff: 1.5,
      shadowSoftness: 4,
      channelMask: 3,
    });
    m.world.setParent(lantern, player);
    m.world.setLocalMatrix(lantern, [1, 0, 0, 1, 8, -5]);

    entity('Slash', 0, 0, 60, 18, '#fff2a1', '', {
      visible: false,
      lit: false,
      layer: 5,
      opacity: 0.85,
    });
    for (let index = 1; index <= 10; index++)
      entity(`Player bolt ${index}`, 0, 0, 19, 6, '#8cf5ff', '', {
        visible: false,
        lit: false,
        layer: 5,
      });
    for (let index = 1; index <= 8; index++)
      entity(`Enemy bolt ${index}`, 0, 0, 11, 11, '#ff6e91', '', {
        visible: false,
        lit: false,
        layer: 5,
      });

    for (const [index, x, y] of [
      [1, -70, 166],
      [2, 205, 166],
      [3, 285, -6],
    ])
      entity(
        `Sentinel ${index}`,
        x,
        y,
        38,
        38,
        '#ffffff',
        assetIds['Images/Enemy.png'],
        {
          lit: true,
          castShadow: true,
          lightingChannel: 'Characters',
          layer: 2,
        },
      );

    entity('Arc Caster pickup', -277, 163, 34, 13, '#79eaff', '', {
      lit: false,
      layer: 3,
    });
    entity(
      'Potion pickup',
      -205,
      162,
      20,
      20,
      '#6ff0a8',
      assetIds['Images/Coin.png'],
      { lit: false, layer: 3 },
    );
    for (const [index, x, y] of [
      [1, -18, 82],
      [2, 190, 72],
    ])
      entity(
        `Energy cell ${index}`,
        x,
        y,
        18,
        18,
        '#79eaff',
        assetIds['Images/Coin.png'],
        { lit: false, layer: 3 },
      );
    entity(
      'Vault Key',
      177,
      162,
      19,
      30,
      '#ffe289',
      assetIds['Images/Flag.png'],
      { lit: false, layer: 3, visible: false },
    );

    for (const [index, x, y] of [
      [1, -116, 161],
      [2, 22, 82],
    ]) {
      entity(
        `Sun crystal ${index}`,
        x,
        y,
        26,
        26,
        '#586579',
        assetIds['Images/Coin.png'],
        { lit: false, layer: 3 },
      );
      light(`Crystal light ${index}`, 'point', 'dynamic', x, y, {
        color: '#ffe98a',
        intensity: 0.05,
        range: 185,
        falloff: 1.15,
        shadowSoftness: 2,
      });
    }

    light('Vault ambient', 'ambient', 'static', 0, 0, {
      color: '#7387a1',
      intensity: 0.16,
      castShadows: false,
    });
    const entranceSpot = light(
      'Entrance spotlight',
      'spot',
      'static',
      -350,
      -188,
      {
        color: '#a5c8ff',
        intensity: 0.72,
        range: 480,
        falloff: 1.25,
        innerAngle: 20,
        outerAngle: 54,
        shadowSoftness: 5,
      },
    );
    const spotAngle = 0.9;
    m.world.setLocalMatrix(entranceSpot, [
      Math.cos(spotAngle),
      Math.sin(spotAngle),
      -Math.sin(spotAngle),
      Math.cos(spotAngle),
      -350,
      -188,
    ]);
    light('Seal sconce', 'point', 'mixed', 58, 38, {
      color: '#6ddfff',
      intensity: 0.58,
      range: 220,
      falloff: 1.35,
      shadowSoftness: 6,
    });
    light('Inner furnace', 'point', 'mixed', 238, 150, {
      color: '#ff8a55',
      intensity: 0.72,
      range: 250,
      falloff: 1.5,
      shadowSoftness: 7,
    });
    light('Exit area light', 'area', 'dynamic', 316, -72, {
      color: '#78ecff',
      intensity: 0.12,
      range: 150,
      width: 120,
      height: 86,
      falloff: 1.4,
      castShadows: false,
    });

    uiText('Status', 'HEALTH ◆◆◆◆◆   SUNBLADE', 'top-left', '350px');
    uiText(
      'Objective',
      'OBJECTIVE  Find the Arc Caster',
      'top-right',
      '365px',
      '#ffe49a',
      13,
      'right',
    );
    uiText(
      'Inventory',
      'INVENTORY  Caster —  Crystals 0/2  Key —  Restorative 0',
      'bottom-left',
      '540px',
      '#b8cde0',
      12,
    );
    uiText(
      'Controls',
      'A/D move  •  SPACE jump  •  J attack  •  1/2 or Q switch  •  H heal  •  L lantern  •  R restart',
      'bottom-right',
      '690px',
      '#93a9bb',
      11,
      'right',
    );
    uiText(
      'Message',
      'Recover the Arc Caster. Its bolts can wake the two sun crystals.',
      'bottom',
      '680px',
      '#ffffff',
      14,
      'center',
    );

    entity(
      'Victory',
      0,
      0,
      520,
      120,
      '#ffffff',
      assetIds['Images/Victory.png'],
      { layer: 30, visible: false, lit: false },
    );
    entity('Defeat', 0, 0, 520, 120, '#ffffff', assetIds['Images/Defeat.png'], {
      layer: 30,
      visible: false,
      lit: false,
    });
  });

  const json = await format(JSON.stringify(m.project), { parser: 'json' });
  await writeFile(`${root}/showcase.protomake.json`, json);
  await mkdir('public/examples', { recursive: true });
  await writeFile('public/examples/showcase.protomake.json', json);
  console.log(
    `showcase: ${m.project.assets.length} assets; ${[...m.world.all()].length} entities`,
  );
} finally {
  await server.close();
}
