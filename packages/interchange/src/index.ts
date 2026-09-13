import { BehaviourGraphSchema, GRAPH_MIME } from '@protomake/graphs';
import { deterministicJSON, type ProjectData } from '@protomake/serialization';

export const INTERCHANGE_VERSION = 1;
export type ExportTarget = 'godot' | 'unity' | 'unreal';
export type PortabilityStatus =
  | 'fully-portable'
  | 'approximated'
  | 'manual-work'
  | 'unsupported';
export interface InterchangeAsset {
  readonly id: string;
  readonly path: string;
  readonly kind: string;
  readonly mime: string;
  readonly data: string;
  readonly width: number;
  readonly height: number;
}
export interface InterchangeComponent {
  readonly type: string;
  readonly data: unknown;
}
export interface InterchangeEntity {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly parent: string | null;
  readonly transform: readonly [number, number, number, number, number, number];
  readonly components: readonly InterchangeComponent[];
}
export interface InterchangeScene {
  readonly id: string;
  readonly name: string;
  readonly entities: readonly InterchangeEntity[];
}
export interface ProtoMakeInterchange {
  readonly version: typeof INTERCHANGE_VERSION;
  readonly source: {
    readonly project: string;
    readonly name: string;
    readonly engineVersion: string;
  };
  readonly coordinates: {
    readonly unit: 'pixel';
    readonly x: 'right';
    readonly y: 'down';
    readonly rotation: 'clockwise-radians';
  };
  readonly startupScene: string | null;
  readonly scenes: readonly InterchangeScene[];
  readonly assets: readonly InterchangeAsset[];
  readonly physics: ProjectData['physics'];
  readonly input: ProjectData['input'];
  readonly mixer: ProjectData['mixer'];
  readonly achievements: ProjectData['persistence']['achievements'];
}
export interface Capability {
  readonly status: PortabilityStatus;
  readonly reason: string;
}
export interface PortabilityItem extends Capability {
  readonly feature: string;
  readonly sourceId: string;
  readonly path: string;
}
export interface PortabilityReport {
  readonly target: ExportTarget;
  readonly project: string;
  readonly entities: number;
  readonly summary: Readonly<Record<PortabilityStatus, number>>;
  readonly items: readonly PortabilityItem[];
}
export interface ExportManifest {
  readonly interchangeVersion: number;
  readonly target: ExportTarget;
  readonly sourceProject: string;
  readonly sourceEngineVersion: string;
  readonly sourceHash: string;
  readonly generatedRoot: string;
  readonly ids: Readonly<Record<string, string>>;
  readonly report: PortabilityReport;
}

const full = (reason: string): Capability => ({
    status: 'fully-portable',
    reason,
  }),
  approximate = (reason: string): Capability => ({
    status: 'approximated',
    reason,
  }),
  manual = (reason: string): Capability => ({
    status: 'manual-work',
    reason,
  }),
  unsupported = (reason: string): Capability => ({
    status: 'unsupported',
    reason,
  });

const componentCapabilities: Readonly<
  Record<string, Readonly<Record<ExportTarget, Capability>>>
> = {
  'protomake.tags': {
    godot: full('Metadata'),
    unity: full('Tags/metadata'),
    unreal: full('Actor tags'),
  },
  'protomake.sprite': {
    godot: full('Sprite2D'),
    unity: full('SpriteRenderer'),
    unreal: approximate('Paper2D sprite'),
  },
  'protomake.camera': {
    godot: full('Camera2D'),
    unity: full('Camera'),
    unreal: approximate('Orthographic camera actor'),
  },
  'protomake.camera-follow': {
    godot: manual('Follow settings retained for target-side implementation'),
    unity: approximate('Generated follow component'),
    unreal: manual('Follow settings retained for target-side implementation'),
  },
  'protomake.camera-zone': {
    godot: manual('Zone settings retained for target-side implementation'),
    unity: approximate('Generated trigger/component'),
    unreal: manual('Zone settings retained for target-side implementation'),
  },
  'protomake.rigidbody': {
    godot: full('Body2D type'),
    unity: full('Rigidbody2D'),
    unreal: approximate('Paper2D-compatible physics component'),
  },
  'protomake.character-body': {
    godot: full('CharacterBody2D'),
    unity: approximate('Rigidbody2D controller'),
    unreal: manual('Character settings retained for target-side Pawn movement'),
  },
  'protomake.box-collider': {
    godot: full('RectangleShape2D'),
    unity: full('BoxCollider2D'),
    unreal: approximate('Box collision component'),
  },
  'protomake.circle-collider': {
    godot: full('CircleShape2D'),
    unity: full('CircleCollider2D'),
    unreal: approximate('Sphere collision component'),
  },
  'protomake.capsule-collider': {
    godot: full('CapsuleShape2D'),
    unity: full('CapsuleCollider2D'),
    unreal: approximate('Capsule collision component'),
  },
  'protomake.light': {
    godot: approximate('PointLight2D radial-light reconstruction'),
    unity: manual(
      'Light settings retained; install and configure a 2D render pipeline',
    ),
    unreal: manual(
      'Light settings retained for target-side 2D rendering setup',
    ),
  },
  'protomake.shadow-caster': {
    godot: manual('Occluder bounds retained for target-side implementation'),
    unity: manual('Shadow bounds retained; configure a 2D render pipeline'),
    unreal: unsupported('No reliable Paper2D shadow equivalent'),
  },
  'protomake.animator': {
    godot: manual('Animator metadata retained for target-side implementation'),
    unity: approximate(
      'AnimatorController and clips generated; advanced conditions require review',
    ),
    unreal: approximate('Flipbook state component'),
  },
  'protomake.audio-source': {
    godot: full('AudioStreamPlayer2D'),
    unity: approximate(
      'AudioSource; custom buses and polyphony need target-side setup',
    ),
    unreal: approximate(
      'Audio component; mixer routing and attenuation need review',
    ),
  },
  'protomake.tilemap': {
    godot: manual('Tile map data retained for target-side reconstruction'),
    unity: manual('Tile map data retained for target-side reconstruction'),
    unreal: manual(
      'Tile map data retained for target-side Paper2D reconstruction',
    ),
  },
  'protomake.particle-emitter': {
    godot: manual('Emitter settings retained for target-side reconstruction'),
    unity: approximate('ParticleSystem'),
    unreal: manual('Emitter settings retained for target-side Niagara setup'),
  },
  'protomake.ui-layout': {
    godot: manual('Layout data retained for target-side reconstruction'),
    unity: manual('Layout data retained for target-side reconstruction'),
    unreal: manual('Layout data retained for target-side UMG reconstruction'),
  },
  'protomake.ui-root': {
    godot: manual('UI root data retained for target-side reconstruction'),
    unity: manual('UI root data retained for target-side reconstruction'),
    unreal: manual('UI root data retained for target-side UMG reconstruction'),
  },
  'protomake.ui-panel': {
    godot: manual('Panel data retained for target-side reconstruction'),
    unity: manual('Panel data retained for target-side reconstruction'),
    unreal: manual('Panel data retained for target-side UMG reconstruction'),
  },
  'protomake.ui-text': {
    godot: manual('Text data retained for target-side reconstruction'),
    unity: manual('Text data retained for target-side reconstruction'),
    unreal: manual('Text data retained for target-side UMG reconstruction'),
  },
  'protomake.ui-image': {
    godot: manual('Image data retained for target-side reconstruction'),
    unity: manual('Image data retained for target-side reconstruction'),
    unreal: manual('Image data retained for target-side UMG reconstruction'),
  },
  'protomake.ui-button': {
    godot: manual('Button data retained for target-side reconstruction'),
    unity: manual('Button data retained for target-side reconstruction'),
    unreal: manual('Button data retained for target-side UMG reconstruction'),
  },
  'protomake.ui-progress': {
    godot: manual('Progress data retained for target-side reconstruction'),
    unity: manual('Progress data retained for target-side reconstruction'),
    unreal: manual('Progress data retained for target-side UMG reconstruction'),
  },
  'protomake.ui-slider': {
    godot: manual('Slider data retained for target-side reconstruction'),
    unity: manual('Slider data retained for target-side reconstruction'),
    unreal: manual('Slider data retained for target-side UMG reconstruction'),
  },
  'protomake.ui-toggle': {
    godot: manual('Toggle data retained for target-side reconstruction'),
    unity: manual('Toggle data retained for target-side reconstruction'),
    unreal: manual('Toggle data retained for target-side UMG reconstruction'),
  },
  'protomake.ui-input': {
    godot: manual('Input data retained for target-side reconstruction'),
    unity: manual('Input data retained for target-side reconstruction'),
    unreal: manual('Input data retained for target-side UMG reconstruction'),
  },
  'protomake.ui-text-input': {
    godot: manual('Text-input data retained for target-side reconstruction'),
    unity: manual('Text-input data retained for target-side reconstruction'),
    unreal: manual(
      'Text-input data retained for target-side UMG reconstruction',
    ),
  },
  'protomake.ui-scroll': {
    godot: manual('Scroll data retained for target-side reconstruction'),
    unity: manual('Scroll data retained for target-side reconstruction'),
    unreal: manual('Scroll data retained for target-side UMG reconstruction'),
  },
  'protomake.perception': {
    godot: manual('Gameplay perception requires target-side behaviour'),
    unity: manual('Gameplay perception requires target-side behaviour'),
    unreal: manual('Gameplay perception requires target-side behaviour'),
  },
  'protomake.prefab': {
    godot: manual(
      'Source prefab metadata retained; scene instances are expanded',
    ),
    unity: manual(
      'Source prefab metadata retained; scene instances are expanded',
    ),
    unreal: manual(
      'Source prefab metadata retained; scene instances are expanded',
    ),
  },
  'editor.note': {
    godot: manual('Editor note retained in manifest'),
    unity: manual('Editor note retained in manifest'),
    unreal: manual('Editor note retained in manifest'),
  },
};

const portableGraphNodes = new Set([
  'event.start',
  'event.update',
  'event.fixedUpdate',
  'flow.branch',
  'flow.sequence',
  'flow.once',
  'value.constant',
  'variable.get',
  'variable.set',
  'math.add',
  'math.compare',
  'entity.self',
  'transform.position',
  'transform.setPosition',
  'input.axis',
  'input.vector2',
  'physics.velocity',
  'physics.setVelocity',
  'debug.log',
]);

export function graphNodeCapability(
  type: string,
  target: ExportTarget,
): Capability {
  if (!portableGraphNodes.has(type))
    return manual(`Graph node ${type} has no declared target translation`);
  return target === 'unreal'
    ? approximate(`Graph node ${type} uses the generated C++ component runtime`)
    : full(
        `Graph node ${type} maps to generated ${target === 'godot' ? 'GDScript' : 'C#'}`,
      );
}

export const TARGET_COORDINATES = {
  godot: { unitsPerPixel: 1, invertY: false, rotationSign: 1 },
  unity: { unitsPerPixel: 0.01, invertY: true, rotationSign: -1 },
  unreal: { unitsPerPixel: 1, invertY: true, rotationSign: -1 },
} as const;

export function convertPoint(
  point: readonly [number, number],
  target: ExportTarget,
): readonly [number, number] {
  const profile = TARGET_COORDINATES[target];
  return [
    point[0] * profile.unitsPerPixel,
    point[1] * profile.unitsPerPixel * (profile.invertY ? -1 : 1),
  ];
}
export function convertRotation(radians: number, target: ExportTarget): number {
  const degrees = (radians * 180) / Math.PI;
  return degrees * TARGET_COORDINATES[target].rotationSign;
}
export function convertScale(
  scale: readonly [number, number],
): readonly [number, number] {
  return [scale[0], scale[1]];
}

export function lowerProject(project: ProjectData): ProtoMakeInterchange {
  const scenes = [...project.scenes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((scene) => ({
      id: scene.id,
      name: scene.name,
      entities: [...scene.entities]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((entity) => {
          const transform = entity.components['protomake.transform'] as unknown as {
            local: readonly [number, number, number, number, number, number];
          };
          return {
            id: entity.id,
            name: entity.name,
            enabled: entity.enabled,
            parent: entity.parent,
            transform: [...transform.local] as InterchangeEntity['transform'],
            components: Object.entries(entity.components)
              .filter(([type]) => type !== 'protomake.transform')
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([type, data]) => ({ type, data: structuredClone(data) })),
          };
        }),
    }));
  return {
    version: INTERCHANGE_VERSION,
    source: {
      project: project.id,
      name: project.name,
      engineVersion: project.engineVersion,
    },
    coordinates: {
      unit: 'pixel',
      x: 'right',
      y: 'down',
      rotation: 'clockwise-radians',
    },
    startupScene: project.startupScene,
    scenes,
    assets: [...project.assets]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((asset) => ({ ...structuredClone(asset) })),
    physics: structuredClone(project.physics),
    input: structuredClone(project.input),
    mixer: structuredClone(project.mixer),
    achievements: structuredClone(project.persistence.achievements),
  };
}

function assetCapability(
  asset: InterchangeAsset,
  target: ExportTarget,
): Capability {
  if (asset.kind === 'image' || asset.kind === 'audio')
    return full('Source asset copied with stable ProtoMake identity');
  if (asset.mime === 'text/typescript')
    return manual(
      'Arbitrary ProtoMake TypeScript requires a manual target-engine port',
    );
  if (asset.mime === GRAPH_MIME) {
    const graph = BehaviourGraphSchema.parse(JSON.parse(asset.data)),
      unsupportedNodes = graph.nodes
        .filter(
          (node) =>
            graphNodeCapability(node.type, target).status === 'manual-work',
        )
        .map((node) => node.type);
    return unsupportedNodes.length
      ? manual(
          `Graph nodes need manual translation: ${[...new Set(unsupportedNodes)].sort().join(', ')}`,
        )
      : target === 'unreal'
        ? approximate(
            'Portable graph lowered for generated C++ component runtime',
          )
        : full(
            `Portable graph lowered for generated ${target === 'godot' ? 'GDScript' : 'C#'} runtime`,
          );
  }
  if (asset.mime === 'application/x-protomake-animation')
    return target === 'unity'
      ? approximate(
          'AnimationClip and events generated; atlas slicing requires review',
        )
      : approximate('Sprite animation reconstructed through target runtime');
  if (asset.mime === 'application/x-protomake-animator')
    return target === 'unity'
      ? approximate(
          'AnimatorController generated; exact threshold semantics require review',
        )
      : approximate(
          'State machine reconstructed through generated target code',
        );
  if (asset.mime === 'application/x-protomake-sprite-region')
    return target === 'unity' || target === 'unreal'
      ? approximate(
          'Source atlas is assigned; slice rectangle and pivot require target review',
        )
      : full('Atlas rectangle and pivot retained');
  if (asset.mime === 'application/x-protomake-tileset')
    return target === 'godot'
      ? manual('TileSet source retained for target-side reconstruction')
      : target === 'unity'
        ? manual('TileSet source retained for target-side reconstruction')
        : manual('TileSet source retained for target-side reconstruction');
  if (asset.mime === 'application/x-protomake-prefab')
    return manual(
      'Prefab source retained; exported scenes contain expanded instances',
    );
  return unsupported(`No ${target} mapping for asset MIME ${asset.mime}`);
}

function behaviourItems(
  data: unknown,
): readonly { id: string; kind: string; source: string }[] {
  if (!data || typeof data !== 'object' || !('items' in data)) return [];
  const items = data.items;
  if (!items || typeof items !== 'object') return [];
  return Object.values(items).flatMap((item) => {
    if (
      !item ||
      typeof item !== 'object' ||
      !('id' in item) ||
      !('kind' in item)
    )
      return [];
    return [
      {
        id: String(item.id),
        kind: String(item.kind),
        source:
          'script' in item
            ? String(item.script)
            : 'graph' in item
              ? String(item.graph)
              : '',
      },
    ];
  });
}

function affineShear(value: InterchangeEntity['transform']): number {
  const scaleX = Math.hypot(value[0], value[1]),
    determinant = value[0] * value[3] - value[1] * value[2],
    scaleY = scaleX < 1e-12 ? 0 : determinant / scaleX;
  return scaleX < 1e-12 || Math.abs(scaleY) < 1e-12
    ? 0
    : (value[0] * value[2] + value[1] * value[3]) / (scaleX * scaleY);
}

export function analyzePortability(
  interchange: ProtoMakeInterchange,
  target: ExportTarget,
): PortabilityReport {
  const items: PortabilityItem[] = [];
  items.push({
    ...(target === 'godot'
      ? full(
          'Gravity and collision layer matrix lower through project/body settings',
        )
      : approximate(
          'Physics settings lower through the target importer and require simulation review',
        )),
    feature: 'project:physics',
    sourceId: interchange.source.project,
    path: interchange.source.name,
  });
  for (const action of interchange.input) {
    const unityNeedsProcessor =
      target === 'unity' &&
      (action.sensitivity !== 1 || action.invertX || action.invertY);
    items.push({
      ...(unityNeedsProcessor
        ? approximate(
            'Bindings are generated; sensitivity/inversion needs an Input System processor review',
          )
        : target === 'unreal'
          ? approximate(
              'Input Mapping Context reconstruction requires importer review',
            )
          : full(
              target === 'godot'
                ? 'InputMap actions generated at startup'
                : 'Input actions generated through the editor importer',
            )),
      feature: `input:${action.kind}`,
      sourceId: action.name,
      path: `${interchange.source.name}/Input/${action.map}/${action.name}`,
    });
  }
  items.push({
    ...(target === 'godot'
      ? full('Audio bus layout generated')
      : target === 'unity'
        ? approximate('Mixer values reconstructed by target importer')
        : manual(
            'Mixer data retained for target-side Sound Class/Submix setup',
          )),
    feature: 'project:mixer',
    sourceId: interchange.source.project,
    path: `${interchange.source.name}/Audio`,
  });
  for (const achievement of interchange.achievements)
    items.push({
      ...manual(
        'Definition retained; platform achievement integration is target-side work',
      ),
      feature: 'project:achievement',
      sourceId: achievement.id,
      path: `${interchange.source.name}/Achievements/${achievement.id}`,
    });
  for (const asset of interchange.assets) {
    const capability = assetCapability(asset, target);
    items.push({
      ...capability,
      feature: `asset:${asset.mime}`,
      sourceId: asset.id,
      path: asset.path,
    });
  }
  for (const scene of interchange.scenes)
    for (const entity of scene.entities) {
      items.push({
        ...(target !== 'godot' && Math.abs(affineShear(entity.transform)) > 1e-6
          ? approximate(
              'Hierarchy is preserved; affine shear is reduced to target TRS',
            )
          : full(
              'Hierarchy and affine transform lowered through the central coordinate profile',
            )),
        feature: 'entity',
        sourceId: entity.id,
        path: `${scene.name}/${entity.name}`,
      });
      for (const component of entity.components) {
        if (component.type === 'protomake.behaviours') {
          for (const behaviour of behaviourItems(component.data)) {
            const asset = interchange.assets.find(
                (candidate) => candidate.id === behaviour.source,
              ),
              capability = asset
                ? assetCapability(asset, target)
                : unsupported('Behaviour source asset is missing');
            items.push({
              ...capability,
              feature: `behaviour:${behaviour.kind}`,
              sourceId: `${entity.id}:${behaviour.id}`,
              path: `${scene.name}/${entity.name}/${asset?.path ?? behaviour.source}`,
            });
          }
          continue;
        }
        let capability =
          componentCapabilities[component.type]?.[target] ??
          unsupported(`No declared ${target} component mapping`);
        const data =
          component.data && typeof component.data === 'object'
            ? (component.data as Record<string, unknown>)
            : {};
        if (
          target === 'godot' &&
          component.type === 'protomake.sprite' &&
          data.secondaryTexture &&
          data.blend !== 1
        )
          capability = approximate(
            'Primary Sprite2D is generated; active cross-fade needs target-side animation work',
          );
        if (target === 'unity' && component.type === 'protomake.sprite') {
          const texture = interchange.assets.find(
            (asset) => asset.id === data.texture,
          );
          if (
            texture?.mime === 'application/x-protomake-sprite-region' ||
            data.secondaryTexture ||
            data.anchorX !== 0.5 ||
            data.anchorY !== 0.5
          )
            capability = approximate(
              'Sprite is generated; atlas pivot, custom anchor or active cross-fade requires review',
            );
        }
        if (
          target === 'unity' &&
          component.type === 'protomake.camera' &&
          (data.viewportX !== 0 ||
            data.viewportY !== 0 ||
            data.viewportWidth !== 1 ||
            data.viewportHeight !== 1)
        )
          capability = approximate(
            'Camera is generated; non-default viewport composition requires review',
          );
        if (
          target === 'godot' &&
          [
            'protomake.box-collider',
            'protomake.circle-collider',
            'protomake.capsule-collider',
          ].includes(component.type) &&
          (data.sensor === true || data.oneWay === true)
        )
          capability = approximate(
            'Collision shape is generated; sensor/one-way semantics require target-side review',
          );
        items.push({
          ...capability,
          feature: `component:${component.type}`,
          sourceId: entity.id,
          path: `${scene.name}/${entity.name}`,
        });
      }
    }
  items.sort(
    (a, b) =>
      a.status.localeCompare(b.status) ||
      a.path.localeCompare(b.path) ||
      a.feature.localeCompare(b.feature) ||
      a.sourceId.localeCompare(b.sourceId),
  );
  const summary: Record<PortabilityStatus, number> = {
    'fully-portable': 0,
    approximated: 0,
    'manual-work': 0,
    unsupported: 0,
  };
  for (const item of items) summary[item.status]++;
  return {
    target,
    project: interchange.source.project,
    entities: interchange.scenes.reduce(
      (count, scene) => count + scene.entities.length,
      0,
    ),
    summary,
    items,
  };
}

function stableTargetId(id: string, target: ExportTarget): string {
  const hex = id.replaceAll('-', '').toLowerCase();
  if (target === 'unity') return hex;
  return `protomake_${hex}`;
}
export function createIdMap(
  interchange: ProtoMakeInterchange,
  target: ExportTarget,
): Readonly<Record<string, string>> {
  const ids = new Set<string>([
    interchange.source.project,
    ...interchange.scenes.map((scene) => scene.id),
    ...interchange.scenes.flatMap((scene) =>
      scene.entities.map((entity) => entity.id),
    ),
    ...interchange.assets.map((asset) => asset.id),
  ]);
  return Object.fromEntries(
    [...ids].sort().map((id) => [id, stableTargetId(id, target)]),
  );
}
function fingerprint(value: string): string {
  let result = 2166136261;
  for (const character of value)
    result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return (result >>> 0).toString(16).padStart(8, '0');
}
export function createExportManifest(
  interchange: ProtoMakeInterchange,
  target: ExportTarget,
): ExportManifest {
  return {
    interchangeVersion: interchange.version,
    target,
    sourceProject: interchange.source.project,
    sourceEngineVersion: interchange.source.engineVersion,
    sourceHash: fingerprint(serializeInterchange(interchange)),
    generatedRoot: 'Generated/ProtoMake',
    ids: createIdMap(interchange, target),
    report: analyzePortability(interchange, target),
  };
}
export function serializeInterchange(interchange: ProtoMakeInterchange): string {
  return deterministicJSON(interchange);
}
export function serializeReport(report: PortabilityReport): string {
  return deterministicJSON(report);
}

export * from './files';
