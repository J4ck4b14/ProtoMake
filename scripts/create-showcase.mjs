import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
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
  const wave = (
    duration,
    startFrequency,
    endFrequency,
    noiseAmount = 0,
    harmonic = 0,
  ) => {
    const sampleRate = 22050,
      samples = Math.floor(duration * sampleRate),
      buffer = Buffer.alloc(44 + samples * 2);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + samples * 2, 4);
    buffer.write('WAVEfmt ', 8);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(samples * 2, 40);
    let phase = 0,
      seed = 0x7f4a7c15;
    for (let index = 0; index < samples; index++) {
      const progress = index / Math.max(1, samples - 1),
        frequency = startFrequency + (endFrequency - startFrequency) * progress;
      phase += (Math.PI * 2 * frequency) / sampleRate;
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const noise = ((seed >>> 0) / 0x7fffffff - 1) * noiseAmount,
        attack = Math.min(1, progress / 0.045),
        release = (1 - progress) ** 1.8,
        body =
          Math.sin(phase) * (1 - harmonic) +
          Math.sin(phase * 2.01) * harmonic +
          noise,
        sample = Math.max(-1, Math.min(1, body * attack * release * 0.72));
      buffer.writeInt16LE(Math.round(sample * 32767), 44 + index * 2);
    }
    return `data:audio/wav;base64,${buffer.toString('base64')}`;
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
  const rotate = (id, x, y, degrees) => {
    const angle = (degrees * Math.PI) / 180;
    m.world.setLocalMatrix(id, [
      Math.cos(angle),
      Math.sin(angle),
      -Math.sin(angle),
      Math.cos(angle),
      x,
      y,
    ]);
    return id;
  };
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
  const shadowShape = (name, x, y, width, height, tint = '#526969') => {
    const id = entity(name, x, y, width, height, tint, '', {
      lit: true,
      castShadow: true,
      lightingChannel: 'World',
      layer: -1,
    });
    component(id, 'protomake.shadow-caster', { width, height });
    return id;
  };
  const decor = (
    name,
    x,
    y,
    width,
    height,
    tint = '#263940',
    layer = -10,
    opacity = 1,
  ) =>
    entity(name, x, y, width, height, tint, '', {
      lit: true,
      lightingChannel: 'World',
      layer,
      opacity,
    });
  const masonry = (prefix, tint = '#26383e') => {
    for (let row = 0; row < 6; row++) {
      const y = -208 + row * 80;
      decor(`${prefix} course ${row + 1}`, 0, y, 800, 2, '#111d22', -12, 0.9);
      for (let column = 0; column < 9; column++) {
        const offset = row % 2 ? 45 : 0,
          x = -400 + column * 90 + offset;
        decor(
          `${prefix} joint ${row + 1}.${column + 1}`,
          x,
          y + 40,
          2,
          78,
          '#142229',
          -12,
          0.88,
        );
      }
    }
    for (const [index, x, y, width, height] of [
      [1, -292, -116, 116, 62],
      [2, 242, -92, 154, 76],
      [3, -18, 114, 134, 56],
    ])
      decor(
        `${prefix} weathered stone ${index}`,
        x,
        y,
        width,
        height,
        tint,
        -13,
        0.55,
      );
  };
  const arch = (prefix, x, y, width, height, tint = '#31464b') => {
    decor(
      `${prefix} recess`,
      x,
      y - height * 0.18,
      width - 28,
      height,
      '#0a1116',
      -9,
    );
    decor(`${prefix} left pier`, x - width / 2, y, 18, height, tint, -7);
    decor(`${prefix} right pier`, x + width / 2, y, 18, height, tint, -7);
    decor(`${prefix} lintel`, x, y - height / 2, width + 18, 18, tint, -7);
    rotate(
      decor(
        `${prefix} west voussoir`,
        x - width * 0.32,
        y - height * 0.46,
        width * 0.38,
        13,
        tint,
        -6,
      ),
      x - width * 0.32,
      y - height * 0.46,
      -18,
    );
    rotate(
      decor(
        `${prefix} east voussoir`,
        x + width * 0.32,
        y - height * 0.46,
        width * 0.38,
        13,
        tint,
        -6,
      ),
      x + width * 0.32,
      y - height * 0.46,
      18,
    );
    decor(`${prefix} keystone`, x, y - height * 0.55, 18, 25, '#435a5c', -5);
  };
  const emitter = (name, values = {}) => {
    const id = entity(name, 0, 0);
    component(id, 'protomake.particle-emitter', {
      emitting: false,
      playOnAwake: false,
      rate: 0,
      burst: 0,
      lifetimeMin: 0.12,
      lifetimeMax: 0.3,
      speedMin: 35,
      speedMax: 105,
      angle: -90,
      spread: 100,
      gravityY: 120,
      startSize: 7,
      endSize: 1,
      startColor: '#ffe7a8',
      endColor: '#a95a35',
      layer: 10,
      maxParticles: 48,
      ...values,
    });
    return id;
  };
  const sound = (name, clip, volume) => {
    const id = entity(name, 0, 0);
    component(id, 'protomake.audio-source', {
      clip: assetIds[`Audio/${clip}.wav`],
      volume,
      bus: 'SFX',
    });
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
  for (const [name, duration, start, end, noise, harmonic] of [
    ['Sword', 0.2, 190, 76, 0.42, 0.08],
    ['Caster', 0.16, 920, 260, 0.04, 0.32],
    ['Enemy', 0.22, 125, 410, 0.08, 0.22],
    ['Impact', 0.13, 150, 54, 0.55, 0.08],
    ['Pickup', 0.32, 350, 870, 0.02, 0.34],
    ['Ward', 0.58, 170, 560, 0.03, 0.38],
    ['Hurt', 0.24, 105, 46, 0.48, 0.05],
    ['Transition', 0.38, 82, 34, 0.24, 0.18],
  ])
    asset(
      `Audio/${name}.wav`,
      'audio',
      'audio/wav',
      wave(duration, start, end, noise, harmonic),
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

    entity('Black stone backdrop', 0, 0, 800, 500, '#1c2a31', '', {
      layer: -30,
      lit: true,
      lightingChannel: 'World',
    });
    masonry(`${room} masonry`);
    decor(`${room} roof shadow`, 0, -235, 800, 42, '#0a1115', -8);
    entity('Black water', 0, 238, 800, 26, '#18343e', '', {
      layer: -20,
      lit: true,
      lightingChannel: 'World',
    });
    for (let index = 1; index <= 7; index++)
      entity(
        `Water glint ${index}`,
        -350 + index * 92,
        230 + (index % 2) * 4,
        46 + (index % 3) * 17,
        2,
        index % 2 ? '#477583' : '#315b68',
        '',
        {
          layer: -19,
          lit: true,
          lightingChannel: 'World',
          opacity: 0.46,
        },
      );
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
      layer: 24,
    });
    m.world.setParent(flame, player);
    m.world.setLocalMatrix(flame, [1, 0, 0, 1, 8, -8]);
    const darkness = entity(
      'Lantern darkness',
      0,
      0,
      1800,
      1800,
      '#ffffff',
      assetIds['Images/DarknessMask.png'],
      { lit: false, layer: 20 },
    );
    m.world.setParent(darkness, player);
    m.world.setLocalMatrix(darkness, [1, 0, 0, 1, 0, 0]);
    const shutter = entity('Lantern shutter', 0, 0, 460, 460, '#000000', '', {
      lit: false,
      visible: false,
      layer: 21,
    });
    m.world.setParent(shutter, player);
    m.world.setLocalMatrix(shutter, [1, 0, 0, 1, 0, 0]);

    emitter('Gold impact', {
      startColor: '#fff1b5',
      endColor: '#a65329',
      spread: 150,
    });
    emitter('Cyan impact', {
      startColor: '#d8ffff',
      endColor: '#26728c',
      gravityY: 28,
      spread: 220,
    });
    emitter('Red impact', {
      startColor: '#ffb0b9',
      endColor: '#7c1838',
      gravityY: 80,
      spread: 190,
    });
    emitter('Water impact', {
      lifetimeMin: 0.22,
      lifetimeMax: 0.48,
      speedMin: 65,
      speedMax: 150,
      spread: 72,
      gravityY: 230,
      startSize: 8,
      startColor: '#82c5d4',
      endColor: '#214b5a',
    });

    sound('Sword audio', 'Sword', 0.27);
    sound('Caster audio', 'Caster', 0.24);
    sound('Enemy audio', 'Enemy', 0.2);
    sound('Impact audio', 'Impact', 0.24);
    sound('Pickup audio', 'Pickup', 0.24);
    sound('Ward audio', 'Ward', 0.28);
    sound('Hurt audio', 'Hurt', 0.28);
    sound('Transition audio', 'Transition', 0.2);

    entity('Slash', 0, 0, 58, 16, '#fff2b0', '', {
      visible: false,
      lit: false,
      layer: 24,
      opacity: 0.9,
    });
    for (let index = 1; index <= 8; index++) {
      entity(`Player bolt ${index}`, 0, 0, 18, 6, '#74eaff', '', {
        visible: false,
        lit: false,
        layer: 24,
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
        layer: 24,
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

    uiText('Status', 'HEALTH ◆◆◆◆◆  SUNBLADE', 'top-left', '315px');
    uiText(
      'Objective',
      'BLACKWARD',
      'top-right',
      '350px',
      '#d8ecf3',
      12,
      'right',
    );
    uiText(
      'Inventory',
      'CASTER —   WARDS 0/2   KEY —   RESTORE 0',
      'bottom-left',
      '455px',
      '#91a8b4',
      11,
    );
    uiText(
      'Controls',
      'A/D MOVE · SPACE JUMP · J ATTACK\nQ WEAPON · H HEAL · L LIGHT · R RESET',
      'bottom-right',
      '290px',
      '#718995',
      10,
      'right',
    );
    uiText('Message', '', 'center', '570px', '#f5e5c0', 13, 'center');
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
    entity('Transition veil', 0, 0, 820, 520, '#000000', '', {
      layer: 28,
      visible: true,
      lit: false,
      opacity: 1,
    });
  };

  const sentinel = (name, x, y, scale = 38) => {
    const id = entity(
      name,
      x,
      y,
      scale,
      scale,
      '#ffffff',
      assetIds['Images/Enemy.png'],
      {
        lit: true,
        castShadow: true,
        lightingChannel: 'Characters',
        layer: 3,
      },
    );
    const match = name.match(/\d+/),
      index = name === 'Warden' ? 4 : Number(match?.[0] ?? 1);
    entity(`Enemy tell ${index}`, x, y, 8, 8, '#ff3158', '', {
      lit: false,
      visible: false,
      layer: 24,
      opacity: 0.9,
    });
    return id;
  };
  const microLight = (name, kind, mobility, x, y, color = '#6f91a3') => {
    entity(`${name} ember`, x, y, 4, 4, color, '', {
      lit: false,
      opacity: 0.85,
      layer: 24,
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
  const chain = (prefix, x, y, links) => {
    for (let index = 0; index < links; index++) {
      const linkY = y + index * 14,
        link = decor(
          `${prefix} link ${index + 1}`,
          x + (index % 2 ? 2 : -2),
          linkY,
          4,
          11,
          '#4a5c5e',
          -4,
          0.78,
        );
      rotate(link, x + (index % 2 ? 2 : -2), linkY, index % 2 ? 20 : -20);
    }
  };

  const buildGate = () => {
    baseRoom('gate');
    arch('West threshold arch', -336, 92, 118, 228, '#34494c');
    arch('East threshold arch', 340, 86, 126, 242, '#3a4e4d');
    arch('Blind nave arch', -70, 28, 142, 196, '#293e43');
    decor('Gate heraldic slab', 116, -108, 74, 96, '#273b40', -7, 0.86);
    decor('Gate heraldic cut', 116, -108, 12, 68, '#0d171c', -6, 0.92);
    rotate(
      decor('Gate broken brace west', -152, -126, 92, 10, '#3c4e4e', -5),
      -152,
      -126,
      -22,
    );
    rotate(
      decor('Gate broken brace east', 226, -86, 104, 10, '#35494a', -5),
      226,
      -86,
      18,
    );
    chain('Gate chain', -268, -202, 8);
    platform('West threshold', -320, 205, 160);
    platform('Broken nave', -110, 205, 230);
    platform('East threshold', 250, 205, 300);
    platform('West shelf', -170, 140, 130);
    platform('Central shelf', -25, 95, 130);
    platform('East shelf', 120, 140, 130);
    shadowShape('West buttress', -246, 42, 26, 145);
    shadowShape('Central column', 52, -34, 30, 168);
    shadowShape('Ceiling lintel', 235, -188, 290, 22);
    shadowShape('East arch', 326, 52, 24, 166);
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
      { lit: true, lightingChannel: 'World', layer: 5 },
    );
    microLight('West pin light', 'point', 'static', -310, 92, '#7291a0');
    microLight('Nave pin light', 'point', 'mixed', -5, -70, '#6e8199');
    microLight('East pin light', 'point', 'static', 318, 106, '#8d765e');
  };

  const buildGallery = () => {
    baseRoom('gallery');
    arch('Gallery lower arch', -294, 92, 146, 226, '#2b444b');
    arch('Gallery upper arch', 354, -92, 104, 214, '#30484d');
    decor('Gallery sluice', -8, -116, 116, 156, '#172930', -8, 0.82);
    for (let index = 0; index < 4; index++)
      decor(
        `Gallery sluice bar ${index + 1}`,
        -47 + index * 26,
        -116,
        7,
        142,
        '#31484c',
        -6,
        0.82,
      );
    rotate(
      decor('Gallery fallen beam', -78, 5, 180, 12, '#3a4c4d', -5),
      -78,
      5,
      14,
    );
    chain('Gallery chain west', -224, -208, 12);
    chain('Gallery chain east', 242, -208, 7);
    platform('West gallery floor', -300, 205, 200);
    platform('Lower gallery', -92, 205, 150);
    platform('First ascent', 30, 137, 110);
    platform('Second ascent', 151, 68, 105);
    platform('Ward bridge', 267, -4, 112, false);
    platform('East landing', 359, -52, 82);
    shadowShape('Drowned pillar', -187, 70, 28, 188);
    shadowShape('Broken pier', 92, -35, 25, 130);
    wall('East seal', 318, -118, 20, 156);
    shadowShape('Gallery ceiling', -240, -211, 300, 20);
    sentinel('Sentinel 1', -82, 166);
    sentinel('Sentinel 2', 150, 29);
    entity('Arc Caster pickup', -276, 165, 34, 12, '#74eaff', '', {
      lit: true,
      lightingChannel: 'World',
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
        { lit: true, lightingChannel: 'World', layer: 5 },
      );
      entity(`Ward beacon ${index}`, x, y, 4, 4, '#9af5ff', '', {
        lit: false,
        visible: false,
        layer: 24,
      });
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
      { lit: true, lightingChannel: 'World', layer: 5 },
    );
    entity(
      'Energy cell 2',
      255,
      -38,
      16,
      16,
      '#63dcff',
      assetIds['Images/Coin.png'],
      { lit: true, lightingChannel: 'World', layer: 5 },
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
    arch('Reliquary west arch', -328, 84, 114, 238, '#37494a');
    arch('Reliquary east arch', 344, 78, 112, 246, '#37494a');
    arch('Reliquary apse', 76, 26, 188, 258, '#31464a');
    decor('Reliquary altar shadow', 78, 83, 100, 78, '#111d22', -5);
    decor('Reliquary altar face', 78, 112, 116, 30, '#3b5050', -4);
    decor('Reliquary seal vertical', 78, -58, 10, 98, '#425658', -4);
    decor('Reliquary seal horizontal', 78, -58, 78, 10, '#425658', -4);
    for (let index = 0; index < 6; index++) {
      const angle = index * 60,
        radians = (angle * Math.PI) / 180,
        x = 78 + Math.cos(radians) * 69,
        y = -58 + Math.sin(radians) * 69;
      rotate(
        decor(
          `Reliquary seal ray ${index + 1}`,
          x,
          y,
          38,
          6,
          '#354b4e',
          -5,
          0.9,
        ),
        x,
        y,
        angle,
      );
    }
    chain('Reliquary chain west', -244, -208, 9);
    chain('Reliquary chain east', 270, -208, 10);
    platform('West reliquary floor', -300, 205, 200);
    platform('Arena floor', -16, 205, 322);
    platform('East reliquary floor', 270, 205, 250);
    platform('Warden dais', 82, 119, 125);
    platform('West balcony', -205, 72, 110);
    platform('East balcony', 263, 55, 116);
    shadowShape('Reliquary tooth west', -286, -15, 28, 160);
    shadowShape('Reliquary tooth east', 232, -35, 28, 165);
    shadowShape('Reliquary crown', 0, -207, 310, 22);
    sentinel('Sentinel 1', -160, 166);
    sentinel('Sentinel 2', 258, 166);
    sentinel('Sentinel 3', -202, 33);
    sentinel('Warden', 82, 77, 54);
    entity(
      'Vault Key',
      82,
      166,
      18,
      28,
      '#ffe2a0',
      assetIds['Images/Flag.png'],
      {
        lit: true,
        lightingChannel: 'World',
        visible: false,
        layer: 24,
      },
    );
    entity('Exit sigil', 385, 130, 20, 120, '#caefff', '', {
      lit: true,
      lightingChannel: 'World',
      visible: false,
      opacity: 0.68,
      layer: 24,
    });
    microLight('Reliquary pin west', 'point', 'static', -330, 100, '#6d8791');
    light('Relic glimmer', 'point', 'dynamic', 82, 166, {
      color: '#ffe1a1',
      intensity: 0,
      range: 44,
      falloff: 2.9,
      castShadows: false,
      channelMask: 3,
    });
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
