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
      24,
      '#78908f',
      assetIds['Images/Platform.png'],
      {
        lit: true,
        visible,
        castShadow: true,
        lightingChannel: 'World',
        layer: 0,
      },
    );
    component(id, 'protomake.box-collider', { width, height: 24 });
    component(id, 'protomake.rigidbody', { mode: 'static' });
    return id;
  };
  const wall = (name, x, y, width, height, tint = '#526969') => {
    const id = entity(
      name,
      x,
      y,
      width,
      height,
      tint,
      assetIds['Images/Platform.png'],
      {
        lit: true,
        castShadow: true,
        lightingChannel: 'World',
        layer: -1,
      },
    );
    component(id, 'protomake.box-collider', { width, height });
    component(id, 'protomake.rigidbody', { mode: 'static' });
    component(id, 'protomake.shadow-caster', { width, height });
    return id;
  };
  const uiText = (
    name,
    text,
    anchor,
    width,
    color = '#eef7ff',
    size = 13,
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
    component(id, 'protomake.ui-panel', { color: '#05090e', opacity: 0.82 });
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
    m.project.name = 'The Luminous Vault: Blackward';
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
        description: 'Carry the light through all three rooms of Blackward.',
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
    'Animations/Blackward.animator.json',
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

  const baseRoom = (room) => {
    const camera = entity('Camera', 0, 0);
    component(camera, 'protomake.camera', { background: '#000000', zoom: 1 });

    entity(
      'Black stone backdrop',
      0,
      0,
      800,
      500,
      '#36505d',
      assetIds['Images/Backdrop.png'],
      { layer: -30, lit: true, lightingChannel: 'World' },
    );
    entity('Black water', 0, 238, 800, 26, '#274656', '', {
      layer: -20,
      lit: true,
      lightingChannel: 'World',
    });
    light('Absolute black', 'ambient', 'static', 0, 0, {
      color: '#000000',
      intensity: 0,
      castShadows: false,
      channelMask: 3,
    });

    const player = entity(
      'Player',
      -350,
      166,
      32,
      38,
      '#ffffff',
      assetIds['Images/Actor-0.png'],
      {
        lit: true,
        castShadow: true,
        lightingChannel: 'Characters',
        layer: 3,
      },
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
      volume: 0.23,
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
          values: { room },
        },
      },
    });

    const lantern = light('Player lantern', 'point', 'dynamic', 0, 0, {
      color: '#ffd59a',
      intensity: 1.05,
      range: 152,
      falloff: 1.42,
      shadowOpacity: 1,
      shadowSoftness: 2,
      channelMask: 3,
    });
    m.world.setParent(lantern, player);
    m.world.setLocalMatrix(lantern, [1, 0, 0, 1, 8, -7]);
    const flame = entity('Lantern flame', 0, 0, 7, 9, '#ffe7a8', '', {
      lit: false,
      layer: 7,
    });
    m.world.setParent(flame, player);
    m.world.setLocalMatrix(flame, [1, 0, 0, 1, 8, -8]);

    entity('Slash', 0, 0, 58, 16, '#fff2b0', '', {
      visible: false,
      lit: false,
      layer: 8,
      opacity: 0.9,
    });
    for (let index = 1; index <= 8; index++) {
      entity(`Player bolt ${index}`, 0, 0, 18, 6, '#74eaff', '', {
        visible: false,
        lit: false,
        layer: 8,
      });
      light(`Player bolt glow ${index}`, 'point', 'dynamic', 0, 0, {
        color: '#55dfff',
        intensity: 0,
        range: 38,
        falloff: 2.2,
        castShadows: false,
        channelMask: 3,
      });
      entity(`Enemy bolt ${index}`, 0, 0, 10, 10, '#ff456b', '', {
        visible: false,
        lit: false,
        layer: 8,
      });
      light(`Enemy bolt glow ${index}`, 'point', 'dynamic', 0, 0, {
        color: '#ff204f',
        intensity: 0,
        range: 48,
        falloff: 2.4,
        castShadows: false,
        channelMask: 3,
      });
    }

    uiText('Status', 'HEALTH ◆◆◆◆◆  SUNBLADE', 'top-left', '335px');
    uiText(
      'Objective',
      'BLACKWARD',
      'top-right',
      '385px',
      '#d8ecf3',
      12,
      'right',
    );
    uiText(
      'Inventory',
      'CASTER —   WARDS 0/2   KEY —   RESTORE 0',
      'bottom-left',
      '500px',
      '#91a8b4',
      11,
    );
    uiText(
      'Controls',
      'A/D MOVE · SPACE JUMP · J ATTACK · Q SWITCH · H HEAL · L LANTERN · R RESET',
      'bottom-right',
      '620px',
      '#718995',
      10,
      'right',
    );
    uiText('Message', '', 'bottom', '660px', '#f5e5c0', 13, 'center');
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
  };

  const sentinel = (name, x, y, scale = 38) =>
    entity(name, x, y, scale, scale, '#ffffff', assetIds['Images/Enemy.png'], {
      lit: true,
      castShadow: true,
      lightingChannel: 'Characters',
      layer: 3,
    });
  const microLight = (name, kind, mobility, x, y, color = '#6f91a3') => {
    entity(`${name} ember`, x, y, 4, 4, color, '', {
      lit: false,
      opacity: 0.85,
      layer: 5,
    });
    return light(name, kind, mobility, x, y, {
      color,
      intensity: 0.11,
      range: 52,
      falloff: 3.1,
      innerAngle: 12,
      outerAngle: 24,
      width: 8,
      height: 14,
      shadowSoftness: 1,
      channelMask: 3,
    });
  };

  const buildGate = () => {
    baseRoom('gate');
    platform('West threshold', -320, 205, 160);
    platform('Broken nave', -100, 205, 190);
    platform('East threshold', 250, 205, 300);
    platform('West shelf', -210, 126, 105);
    platform('Central shelf', -35, 73, 105);
    platform('East shelf', 145, 128, 120);
    wall('West buttress', -246, 42, 26, 145);
    wall('Central column', 52, -34, 30, 168);
    wall('Ceiling lintel', 235, -188, 290, 22);
    wall('East arch', 326, 52, 24, 166);
    sentinel('Sentinel 1', -86, 166);
    sentinel('Sentinel 2', 205, 166);
    entity(
      'Potion pickup',
      -205,
      92,
      18,
      18,
      '#6ff0a8',
      assetIds['Images/Coin.png'],
      { lit: false, layer: 5 },
    );
    microLight('West pin light', 'point', 'static', -310, 92, '#7291a0');
    microLight('Nave pin light', 'point', 'mixed', -5, -70, '#6e8199');
    microLight('East pin light', 'point', 'static', 318, 106, '#8d765e');
  };

  const buildGallery = () => {
    baseRoom('gallery');
    platform('West gallery floor', -300, 205, 200);
    platform('Lower gallery', -92, 205, 150);
    platform('First ascent', 30, 137, 110);
    platform('Second ascent', 151, 68, 105);
    platform('Ward bridge', 267, -4, 112, false);
    platform('East landing', 359, -52, 82);
    wall('Drowned pillar', -187, 70, 28, 188);
    wall('Broken pier', 92, -35, 25, 130);
    wall('East seal', 318, -118, 20, 156);
    wall('Gallery ceiling', -240, -211, 300, 20);
    sentinel('Sentinel 1', -82, 166);
    sentinel('Sentinel 2', 150, 29);
    entity('Arc Caster pickup', -276, 165, 34, 12, '#74eaff', '', {
      lit: false,
      layer: 5,
    });
    for (const [index, x, y] of [
      [1, -135, 164],
      [2, 150, 28],
    ]) {
      entity(
        `Ward crystal ${index}`,
        x,
        y,
        24,
        24,
        '#33485a',
        assetIds['Images/Coin.png'],
        { lit: false, layer: 5 },
      );
      light(`Ward light ${index}`, 'point', 'dynamic', x, y, {
        color: '#6be9ff',
        intensity: 0.03,
        range: 58,
        falloff: 2.8,
        shadowSoftness: 1,
        channelMask: 3,
      });
    }
    entity(
      'Energy cell 1',
      28,
      101,
      16,
      16,
      '#63dcff',
      assetIds['Images/Coin.png'],
      { lit: false, layer: 5 },
    );
    entity(
      'Energy cell 2',
      255,
      -38,
      16,
      16,
      '#63dcff',
      assetIds['Images/Coin.png'],
      { lit: false, layer: 5 },
    );
    const guide = microLight(
      'Gallery slit light',
      'spot',
      'static',
      -20,
      -180,
      '#607d8d',
    );
    const angle = Math.PI / 2;
    m.world.setLocalMatrix(guide, [
      Math.cos(angle),
      Math.sin(angle),
      -Math.sin(angle),
      Math.cos(angle),
      -20,
      -180,
    ]);
  };

  const buildReliquary = () => {
    baseRoom('reliquary');
    platform('West reliquary floor', -300, 205, 200);
    platform('Arena floor', -42, 205, 270);
    platform('East reliquary floor', 270, 205, 250);
    platform('Warden dais', 82, 119, 125);
    platform('West balcony', -205, 72, 110);
    platform('East balcony', 263, 55, 116);
    wall('Reliquary tooth west', -286, -15, 28, 160);
    wall('Reliquary tooth east', 232, -35, 28, 165);
    wall('Reliquary crown', 0, -207, 310, 22);
    sentinel('Sentinel 1', -160, 166);
    sentinel('Sentinel 2', 258, 166);
    sentinel('Sentinel 3', -202, 33);
    sentinel('Warden', 82, 77, 54);
    entity(
      'Vault Key',
      82,
      77,
      18,
      28,
      '#ffe2a0',
      assetIds['Images/Flag.png'],
      { lit: false, visible: false, layer: 6 },
    );
    entity('Exit sigil', 385, 130, 20, 120, '#caefff', '', {
      lit: false,
      visible: false,
      opacity: 0.68,
      layer: 5,
    });
    microLight('Reliquary pin west', 'point', 'static', -330, 100, '#6d8791');
    microLight('Reliquary pin crown', 'point', 'mixed', 8, -166, '#85725f');
    light('Exit area light', 'area', 'dynamic', 379, 130, {
      color: '#b9edff',
      intensity: 0,
      range: 42,
      falloff: 2.6,
      width: 18,
      height: 108,
      castShadows: false,
      channelMask: 3,
    });
  };

  m.change('Author The Black Gate', buildGate);
  const startup = m.sceneId;
  m.renameScene('The Black Gate');
  m.createScene('The Drowned Gallery');
  m.project.sceneFolders[m.sceneId] = 'Scenes';
  m.change('Author The Drowned Gallery', buildGallery);
  m.createScene('The Reliquary');
  m.project.sceneFolders[m.sceneId] = 'Scenes';
  m.change('Author The Reliquary', buildReliquary);
  m.project.startupScene = startup;

  const json = await format(JSON.stringify(m.project), { parser: 'json' });
  await writeFile(`${root}/showcase.protomake.json`, json);
  await mkdir('public/examples', { recursive: true });
  await writeFile('public/examples/showcase.protomake.json', json);
  console.log(
    `showcase: ${m.project.scenes.length} scenes; ${m.project.assets.length} assets; ` +
      `${m.project.scenes.reduce((total, scene) => total + scene.entities.length, 0)} entities`,
  );
} finally {
  await server.close();
}
