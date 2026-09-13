import { GRAPH_MIME } from '@protomake/graphs';
import {
  createExportManifest,
  serializeInterchange,
  serializeReport,
  type ProtoMakeInterchange,
  type InterchangeAsset,
  type InterchangeEntity,
  type InterchangeScene,
} from './index';
import {
  decodeAssetData,
  encodeText,
  generatedAssetPath,
  safeFileName,
  sortedFiles,
  type ExportFile,
} from './files';

type Data = Record<string, unknown>;

const json = (value: unknown): string => JSON.stringify(value),
  godotString = (value: string): string => JSON.stringify(value),
  number = (value: unknown, fallback = 0): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback,
  boolean = (value: unknown, fallback = false): boolean =>
    typeof value === 'boolean' ? value : fallback,
  text = (value: unknown, fallback = ''): string =>
    typeof value === 'string' ? value : fallback,
  record = (value: unknown): Data =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Data)
      : {};

function component(entity: InterchangeEntity, type: string): Data | undefined {
  const found = entity.components.find((candidate) => candidate.type === type);
  return found ? record(found.data) : undefined;
}

function color(value: string, alpha = 1): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (!match) return `Color(1, 1, 1, ${alpha})`;
  return `Color(${parseInt(match[1]!, 16) / 255}, ${parseInt(match[2]!, 16) / 255}, ${parseInt(match[3]!, 16) / 255}, ${alpha})`;
}

function hierarchy(scene: InterchangeScene): {
  readonly entities: readonly InterchangeEntity[];
  readonly paths: ReadonlyMap<string, string>;
} {
  const byId = new Map(scene.entities.map((entity) => [entity.id, entity])),
    depth = (entity: InterchangeEntity): number => {
      let result = 0,
        current = entity;
      const guard = new Set<string>();
      while (current.parent && byId.has(current.parent)) {
        if (guard.has(current.id))
          throw new Error(`Cyclic hierarchy in ${scene.name}`);
        guard.add(current.id);
        current = byId.get(current.parent)!;
        result++;
      }
      return result;
    },
    entities = [...scene.entities].sort(
      (a, b) => depth(a) - depth(b) || a.id.localeCompare(b.id),
    ),
    paths = new Map<string, string>();
  for (const entity of entities) {
    const own = `${safeFileName(entity.name)}_${entity.id.replaceAll('-', '').slice(0, 8)}`,
      parentPath = entity.parent ? paths.get(entity.parent) : undefined;
    paths.set(entity.id, parentPath ? `${parentPath}/${own}` : own);
  }
  return { entities, paths };
}

class SceneWriter {
  private readonly external = new Map<string, number>();
  private readonly extLines: string[] = [];
  private readonly subLines: string[] = [];
  private subId = 0;

  externalResource(path: string, type: string): number {
    const key = `${type}:${path}`,
      existing = this.external.get(key);
    if (existing) return existing;
    const id = this.external.size + 1;
    this.external.set(key, id);
    this.extLines.push(
      `[ext_resource type=${godotString(type)} path=${godotString(`res://${path}`)} id=${godotString(String(id))}]`,
    );
    return id;
  }

  subResource(type: string, properties: readonly string[]): number {
    const id = ++this.subId;
    this.subLines.push(
      `[sub_resource type=${godotString(type)} id=${godotString(String(id))}]`,
      ...properties,
      '',
    );
    return id;
  }

  render(nodes: readonly string[]): string {
    return [
      `[gd_scene load_steps=${this.external.size + this.subId + 1} format=3]`,
      '',
      ...this.extLines,
      ...(this.extLines.length ? [''] : []),
      ...this.subLines,
      ...nodes,
    ].join('\n');
  }
}

function mainNodeType(entity: InterchangeEntity): string {
  if (component(entity, 'protomake.character-body')) return 'CharacterBody2D';
  const body = component(entity, 'protomake.rigidbody'),
    mode = text(body?.mode, 'dynamic');
  if (mode === 'dynamic') return body ? 'RigidBody2D' : 'Node2D';
  if (mode === 'static') return 'StaticBody2D';
  if (mode === 'kinematic') return 'AnimatableBody2D';
  return 'Node2D';
}

function imageResource(
  writer: SceneWriter,
  asset: InterchangeAsset | undefined,
  assets: ReadonlyMap<string, InterchangeAsset>,
):
  | {
      readonly resource: string;
      readonly width: number;
      readonly height: number;
    }
  | undefined {
  if (!asset) return undefined;
  if (asset.kind === 'image') {
    const id = writer.externalResource(generatedAssetPath(asset), 'Texture2D');
    return {
      resource: `ExtResource(${godotString(String(id))})`,
      width: asset.width,
      height: asset.height,
    };
  }
  if (asset.mime !== 'application/x-protomake-sprite-region') return undefined;
  const region = record(JSON.parse(asset.data)),
    source = assets.get(text(region.source));
  if (!source || source.kind !== 'image') return undefined;
  const external = writer.externalResource(
      generatedAssetPath(source),
      'Texture2D',
    ),
    width = number(region.width, source.width),
    height = number(region.height, source.height),
    sub = writer.subResource('AtlasTexture', [
      `atlas = ExtResource(${godotString(String(external))})`,
      `region = Rect2(${number(region.x)}, ${number(region.y)}, ${width}, ${height})`,
      'filter_clip = true',
    ]);
  return {
    resource: `SubResource(${godotString(String(sub))})`,
    width,
    height,
  };
}

function collisionMask(layer: number, interchange: ProtoMakeInterchange): number {
  let mask = 0;
  const row = interchange.physics.matrix[layer] ?? [];
  row.forEach((enabled, index) => {
    if (enabled) mask |= 1 << index;
  });
  return mask;
}

function colliderLines(
  writer: SceneWriter,
  entity: InterchangeEntity,
  path: string,
  interchange: ProtoMakeInterchange,
): string[] {
  const result: string[] = [];
  for (const candidate of entity.components) {
    let shapeType = '',
      properties: string[] = [];
    const data = record(candidate.data);
    if (candidate.type === 'protomake.box-collider') {
      shapeType = 'RectangleShape2D';
      properties = [
        `size = Vector2(${number(data.width, 64)}, ${number(data.height, 64)})`,
      ];
    } else if (candidate.type === 'protomake.circle-collider') {
      shapeType = 'CircleShape2D';
      properties = [`radius = ${number(data.radius, 32)}`];
    } else if (candidate.type === 'protomake.capsule-collider') {
      shapeType = 'CapsuleShape2D';
      const radius = number(data.radius, 16),
        halfHeight = number(data.halfHeight, 16);
      properties = [
        `radius = ${radius}`,
        `height = ${2 * (radius + halfHeight)}`,
      ];
    } else continue;
    const sub = writer.subResource(shapeType, properties),
      layer = Math.max(0, Math.trunc(number(data.layer)));
    result.push(
      '',
      `[node name=${godotString(`Collider_${candidate.type.slice(6)}`)} type="CollisionShape2D" parent=${godotString(path)}]`,
      `position = Vector2(${number(data.offsetX)}, ${number(data.offsetY)})`,
      `shape = SubResource(${godotString(String(sub))})`,
      `metadata/protomake_sensor = ${boolean(data.sensor)}`,
      `metadata/protomake_one_way = ${boolean(data.oneWay)}`,
      `metadata/protomake_friction = ${number(data.friction, 0.5)}`,
      `metadata/protomake_restitution = ${number(data.restitution)}`,
      `metadata/protomake_collision_layer = ${1 << layer}`,
      `metadata/protomake_collision_mask = ${collisionMask(layer, interchange)}`,
    );
  }
  return result;
}

function sceneFile(
  scene: InterchangeScene,
  interchange: ProtoMakeInterchange,
): string {
  const writer = new SceneWriter(),
    assets = new Map(interchange.assets.map((asset) => [asset.id, asset])),
    ordered = hierarchy(scene),
    nodes: string[] = [
      `[node name=${godotString(safeFileName(scene.name))} type="Node2D"]`,
      `metadata/protomake_id = ${godotString(scene.id)}`,
    ];
  for (const entity of ordered.entities) {
    const fullPath = ordered.paths.get(entity.id)!,
      name = fullPath.split('/').at(-1)!,
      parentPath = entity.parent ? ordered.paths.get(entity.parent)! : '.',
      [a, b, c, d, x, y] = entity.transform,
      body = component(entity, 'protomake.rigidbody'),
      firstCollider = entity.components.find((candidate) =>
        [
          'protomake.box-collider',
          'protomake.circle-collider',
          'protomake.capsule-collider',
        ].includes(candidate.type),
      ),
      firstColliderData = record(firstCollider?.data),
      tags = component(entity, 'protomake.tags'),
      groups = Array.isArray(tags?.tags)
        ? (tags.tags as unknown[]).filter(
            (tag): tag is string => typeof tag === 'string',
          )
        : [],
      groupSuffix = groups.length
        ? ` groups=[${groups.map(godotString).join(', ')}]`
        : '';
    nodes.push(
      '',
      `[node name=${godotString(name)} type=${godotString(mainNodeType(entity))} parent=${godotString(parentPath)}${groupSuffix}]`,
      `transform = Transform2D(${a}, ${b}, ${c}, ${d}, ${x}, ${y})`,
      `visible = ${entity.enabled}`,
      `metadata/protomake_id = ${godotString(entity.id)}`,
      `metadata/protomake_components = ${godotString(json(entity.components))}`,
    );
    if (firstCollider) {
      const layer = Math.max(0, Math.trunc(number(firstColliderData.layer)));
      nodes.push(
        `collision_layer = ${1 << layer}`,
        `collision_mask = ${collisionMask(layer, interchange)}`,
      );
    }
    if (body && text(body.mode) === 'dynamic')
      nodes.push(
        `mass = ${number(body.mass, 1)}`,
        `gravity_scale = ${number(body.gravityScale, 1)}`,
        `linear_damp = ${number(body.linearDamping)}`,
        `angular_damp = ${number(body.angularDamping)}`,
        `lock_rotation = ${boolean(body.freezeRotation, true)}`,
        `continuous_cd = ${boolean(body.continuous) ? 2 : 0}`,
        `linear_velocity = Vector2(${number(body.velocityX)}, ${number(body.velocityY)})`,
        `angular_velocity = ${number(body.angularVelocity)}`,
      );
    const sprite = component(entity, 'protomake.sprite');
    if (sprite) {
      const texture = imageResource(
        writer,
        assets.get(text(sprite.texture)),
        assets,
      );
      nodes.push(
        '',
        `[node name="Sprite2D" type="Sprite2D" parent=${godotString(fullPath)}]`,
        `visible = ${boolean(sprite.visible, true)}`,
        `position = Vector2(${-number(sprite.anchorX, 0.5) * number(sprite.width, 64)}, ${-number(sprite.anchorY, 0.5) * number(sprite.height, 64)})`,
        'centered = false',
        `flip_h = ${boolean(sprite.flipX)}`,
        `flip_v = ${boolean(sprite.flipY)}`,
        `z_index = ${number(sprite.layer) * 1000 + number(sprite.order)}`,
        `modulate = ${color(text(sprite.tint, '#ffffff'), number(sprite.opacity, 1))}`,
      );
      if (texture)
        nodes.push(
          `texture = ${texture.resource}`,
          `scale = Vector2(${number(sprite.width, 64) / texture.width}, ${number(sprite.height, 64) / texture.height})`,
        );
    }
    const camera = component(entity, 'protomake.camera');
    if (camera)
      nodes.push(
        '',
        `[node name="Camera2D" type="Camera2D" parent=${godotString(fullPath)}]`,
        `zoom = Vector2(${number(camera.zoom, 1)}, ${number(camera.zoom, 1)})`,
        'position_smoothing_enabled = false',
        'enabled = true',
        `metadata/protomake_priority = ${number(camera.priority)}`,
        `metadata/protomake_background = ${godotString(text(camera.background, '#101820'))}`,
      );
    const light = component(entity, 'protomake.light');
    if (light && text(light.kind) !== 'ambient') {
      const texture = writer.externalResource(
        'Generated/ProtoMake/Textures/radial-light.svg',
        'Texture2D',
      );
      nodes.push(
        '',
        `[node name="Light2D" type="PointLight2D" parent=${godotString(fullPath)}]`,
        `texture = ExtResource(${godotString(String(texture))})`,
        `texture_scale = ${number(light.range, 256) / 256}`,
        `energy = ${number(light.intensity, 1)}`,
        `color = ${color(text(light.color, '#ffffff'))}`,
        `shadow_enabled = ${boolean(light.castShadows, true)}`,
        `metadata/protomake_kind = ${godotString(text(light.kind, 'point'))}`,
        `metadata/protomake_falloff = ${number(light.falloff, 1)}`,
        `metadata/protomake_inner_angle = ${number(light.innerAngle)}`,
        `metadata/protomake_outer_angle = ${number(light.outerAngle, 360)}`,
      );
    }
    const audio = component(entity, 'protomake.audio-source');
    if (audio) {
      const clip = assets.get(text(audio.clip)),
        resource =
          clip?.kind === 'audio'
            ? writer.externalResource(generatedAssetPath(clip), 'AudioStream')
            : undefined,
        volume = Math.max(0.0001, number(audio.volume, 1));
      nodes.push(
        '',
        `[node name="Audio" type=${godotString(boolean(audio.spatial) ? 'AudioStreamPlayer2D' : 'AudioStreamPlayer')} parent=${godotString(fullPath)}]`,
        `autoplay = ${boolean(audio.playOnAwake)}`,
        `stream_paused = false`,
        `volume_db = ${20 * Math.log10(volume)}`,
        `pitch_scale = ${number(audio.rate, 1)}`,
        `bus = ${godotString(text(audio.bus, 'Master'))}`,
        `max_polyphony = ${Math.trunc(number(audio.polyphony, 4))}`,
      );
      if (resource)
        nodes.push(`stream = ExtResource(${godotString(String(resource))})`);
      if (boolean(audio.spatial))
        nodes.push(
          `max_distance = ${number(audio.maxDistance, 800)}`,
          `attenuation = ${number(audio.rolloff, 1)}`,
          `panning_strength = ${Math.abs(number(audio.pan))}`,
        );
    }
    const behaviours = component(entity, 'protomake.behaviours'),
      items = record(behaviours?.items),
      order = Array.isArray(behaviours?.order) ? behaviours.order : [];
    for (const id of order) {
      const behaviour = record(items[String(id)]);
      if (text(behaviour.kind) !== 'graph') continue;
      const graph = assets.get(text(behaviour.graph));
      if (!graph || graph.mime !== GRAPH_MIME) continue;
      const script = writer.externalResource(
        'Generated/ProtoMake/Scripts/ProtoMakeGraphRuntime.gd',
        'Script',
      );
      nodes.push(
        '',
        `[node name=${godotString(`Graph_${safeFileName(String(id))}`)} type="Node" parent=${godotString(fullPath)}]`,
        `process_mode = ${boolean(behaviour.enabled, true) ? 0 : 4}`,
        `script = ExtResource(${godotString(String(script))})`,
        `graph_path = ${godotString(`res://Generated/ProtoMake/Data/graphs/${graph.id}.json`)}`,
        `protomake_entity_id = ${godotString(entity.id)}`,
        `overrides_json = ${godotString(json(record(behaviour.values)))}`,
      );
    }
    nodes.push(...colliderLines(writer, entity, fullPath, interchange));
  }
  return writer.render(nodes) + '\n';
}

function scenePath(scene: InterchangeScene): string {
  return `Scenes/${safeFileName(scene.name)}-${scene.id.replaceAll('-', '').slice(0, 8)}.tscn`;
}

function projectFile(interchange: ProtoMakeInterchange): string {
  const startup =
      interchange.scenes.find(
        (scene) => scene.id === interchange.startupScene,
      ) ?? interchange.scenes[0],
    gravity = Math.hypot(
      interchange.physics.gravityX,
      interchange.physics.gravityY,
    ),
    direction = gravity
      ? [
          interchange.physics.gravityX / gravity,
          interchange.physics.gravityY / gravity,
        ]
      : [0, 1];
  return [
    '; Generated by ProtoMake. Edit source in ProtoMake and export again.',
    'config_version=5',
    '',
    '[application]',
    `config/name=${godotString(interchange.source.name)}`,
    ...(startup
      ? [`run/main_scene=${godotString(`res://${scenePath(startup)}`)}`]
      : []),
    '',
    '[autoload]',
    `ProtoMakeInput=${godotString('*res://Generated/ProtoMake/Scripts/ProtoMakeInput.gd')}`,
    '',
    '[audio]',
    'default_bus_layout="res://Generated/ProtoMake/default_bus_layout.tres"',
    '',
    '[display]',
    'window/size/viewport_width=1280',
    'window/size/viewport_height=720',
    'window/stretch/mode="canvas_items"',
    '',
    '[physics]',
    `2d/default_gravity=${gravity}`,
    `2d/default_gravity_vector=Vector2(${direction[0]}, ${direction[1]})`,
    '',
    '[rendering]',
    'renderer/rendering_method="gl_compatibility"',
    'renderer/rendering_method.mobile="gl_compatibility"',
    'textures/default_filters/use_nearest_mipmap_filter=false',
    '',
    '[layer_names]',
    ...interchange.physics.layers.map(
      (layer, index) => `2d_physics/layer_${index + 1}=${godotString(layer)}`,
    ),
    '',
  ].join('\n');
}

function mixerFile(interchange: ProtoMakeInterchange): string {
  const lines = ['[gd_resource format=3]', '', '[resource]'];
  interchange.mixer.forEach((bus, index) => {
    const volume = Math.max(0.0001, bus.volume);
    lines.push(
      `bus/${index}/name = &${godotString(bus.name)}`,
      `bus/${index}/solo = false`,
      `bus/${index}/mute = ${bus.muted}`,
      `bus/${index}/bypass_fx = false`,
      `bus/${index}/volume_db = ${20 * Math.log10(volume)}`,
      `bus/${index}/send = &${godotString(index === 0 ? '' : 'Master')}`,
    );
  });
  return lines.join('\n') + '\n';
}

const RADIAL_LIGHT = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><radialGradient id="g"><stop offset="0" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient></defs><rect width="512" height="512" fill="url(#g)"/></svg>\n`;

function inputScript(interchange: ProtoMakeInterchange): string {
  return `extends Node

const ACTIONS = ${json(interchange.input)}

func _ready():
\tfor action in ACTIONS:
\t\tvar name = str(action["name"])
\t\tif action["kind"] == "button":
\t\t\t_add_action(_action(name), action["deadZone"], action["positiveX"])
\t\telse:
\t\t\t_add_action(_direction(name, "px"), action["deadZone"], action["positiveX"])
\t\t\t_add_action(_direction(name, "nx"), action["deadZone"], action["negativeX"])
\t\t\t_add_action(_direction(name, "py"), action["deadZone"], action["positiveY"])
\t\t\t_add_action(_direction(name, "ny"), action["deadZone"], action["negativeY"])

func _add_action(name: StringName, dead_zone: float, bindings: Array):
\tif not InputMap.has_action(name): InputMap.add_action(name, dead_zone)
\tfor binding in bindings:
\t\tvar event = _event(str(binding))
\t\tif event: InputMap.action_add_event(name, event)

func _event(binding: String):
\tif binding.begins_with("Mouse"):
\t\tvar event = InputEventMouseButton.new()
\t\tevent.button_index = int(binding.trim_prefix("Mouse")) + 1
\t\treturn event
\tif binding.begins_with("GamepadButton"):
\t\tvar event = InputEventJoypadButton.new()
\t\tevent.button_index = int(binding.trim_prefix("GamepadButton"))
\t\treturn event
\tif binding.begins_with("GamepadAxis"):
\t\tvar event = InputEventJoypadMotion.new()
\t\tvar raw = binding.trim_prefix("GamepadAxis")
\t\tevent.axis = int(raw.left(raw.length() - 1))
\t\tevent.axis_value = 1.0 if raw.ends_with("+") else -1.0
\t\treturn event
\tvar event = InputEventKey.new()
\tvar key = binding.trim_prefix("Key").trim_prefix("Digit")
\tvar names = {"ArrowUp":"Up", "ArrowDown":"Down", "ArrowLeft":"Left", "ArrowRight":"Right", "Space":"Space"}
\tevent.physical_keycode = OS.find_keycode_from_string(names.get(binding, key))
\treturn event

static func _action(name: String) -> StringName: return StringName("protomake_" + name.to_snake_case())
static func _direction(name: String, suffix: String) -> StringName: return StringName(str(_action(name)) + "_" + suffix)

static func axis(name: String) -> float:
\tvar action = _definition(name)
\tvar value = Input.get_action_strength(_direction(name, "px")) - Input.get_action_strength(_direction(name, "nx"))
\treturn value * float(action.get("sensitivity", 1.0)) * (-1.0 if action.get("invertX", false) else 1.0)

static func vector(name: String) -> Vector2:
\tvar action = _definition(name)
\tvar value = Input.get_vector(_direction(name, "nx"), _direction(name, "px"), _direction(name, "ny"), _direction(name, "py"))
\tvalue *= float(action.get("sensitivity", 1.0))
\tvalue.x *= -1.0 if action.get("invertX", false) else 1.0
\tvalue.y *= -1.0 if action.get("invertY", false) else 1.0
\treturn value.limit_length(1.0)

static func _definition(name: String) -> Dictionary:
\tfor action in ACTIONS:
\t\tif action.get("name") == name: return action
\treturn {}
`;
}

const GRAPH_RUNTIME = `class_name ProtoMakeGraphRuntime
extends Node

@export_file("*.json") var graph_path: String
@export var protomake_entity_id: String
@export_multiline var overrides_json: String = "{}"
var graph: Dictionary = {}
var variables: Dictionary = {}
var node_state: Dictionary = {}

func _ready():
\tvar file = FileAccess.open(graph_path, FileAccess.READ)
\tif file == null:
\t\tpush_error("ProtoMake graph missing: " + graph_path)
\t\treturn
\tgraph = JSON.parse_string(file.get_as_text())
\tfor key in graph.get("variables", {}): variables[key] = graph["variables"][key].get("default")
\tvar supplied = JSON.parse_string(overrides_json)
\tif supplied is Dictionary:
\t\tfor key in supplied: variables[key] = supplied[key]
\t_fire("event.start")

func _process(_delta): _fire("event.update")
func _physics_process(_delta): _fire("event.fixedUpdate")

func _fire(type: String):
\tfor node in graph.get("nodes", []):
\t\tif node.get("type") == type: _flow(node, "out")

func _flow(source: Dictionary, port: String):
\tfor connection in graph.get("connections", []):
\t\tvar origin = connection.get("fro" + "m", {})
\t\tif origin.get("node") == source["id"] and origin.get("port") == port:
\t\t\t_execute(_node(connection["to"]["node"]))

func _execute(node: Dictionary):
\tvar type = node.get("type", "")
\tif type == "flow.branch": _flow(node, "true" if bool(_input(node, "condition")) else "false")
\telif type == "flow.sequence":
\t\t_flow(node, "first")
\t\t_flow(node, "then")
\telif type == "flow.once":
\t\tif not node_state.get(node["id"], false):
\t\t\tnode_state[node["id"]] = true
\t\t\t_flow(node, "out")
\telif type == "variable.set":
\t\tvariables[str(node["properties"].get("name", ""))] = _input(node, "value")
\t\t_flow(node, "out")
\telif type == "transform.setPosition":
\t\tvar target = _entity(_input(node, "entity"))
\t\tvar value = _input(node, "position")
\t\tif target and value is Array and value.size() >= 2: target.position = Vector2(value[0], value[1])
\t\t_flow(node, "out")
\telif type == "physics.setVelocity":
\t\tvar target = _entity(_input(node, "entity"))
\t\tvar value = _input(node, "velocity")
\t\tif target is RigidBody2D and value is Array and value.size() >= 2: target.linear_velocity = Vector2(value[0], value[1])
\t\t_flow(node, "out")
\telif type == "debug.log":
\t\tprint(_input(node, "message") if _input(node, "message") != null else node["properties"].get("message", ""))
\t\t_flow(node, "out")

func _value(node: Dictionary, _port: String):
\tvar type = node.get("type", "")
\tif type == "value.constant": return node["properties"].get("value", 0)
\tif type == "variable.get": return variables.get(str(node["properties"].get("name", "")))
\tif type == "math.add": return float(_input(node, "a")) + float(_input(node, "b"))
\tif type == "math.compare": return float(_input(node, "a")) >= float(_input(node, "b"))
\tif type == "entity.self": return protomake_entity_id
\tif type == "transform.position":
\t\tvar target = _entity(_input(node, "entity"))
\t\treturn [target.position.x, target.position.y] if target else [0, 0]
\tif type == "input.axis": return ProtoMakeInput.axis(str(node["properties"].get("action", "")))
\tif type == "input.vector2":
\t\tvar value = ProtoMakeInput.vector(str(node["properties"].get("action", "")))
\t\treturn [value.x, value.y]
\tif type == "physics.velocity":
\t\tvar target = _entity(_input(node, "entity"))
\t\treturn [target.linear_velocity.x, target.linear_velocity.y] if target is RigidBody2D else [0, 0]
\treturn null

func _input(node: Dictionary, port: String):
\tfor connection in graph.get("connections", []):
\t\tif connection["to"]["node"] == node["id"] and connection["to"]["port"] == port:
\t\t\tvar origin = connection.get("fro" + "m", {})
\t\t\treturn _value(_node(origin.get("node", "")), origin.get("port", ""))
\treturn node.get("properties", {}).get(port)

func _node(id: String) -> Dictionary:
\tfor node in graph.get("nodes", []):
\t\tif node["id"] == id: return node
\treturn {}

func _entity(id):
\tvar wanted = protomake_entity_id if id == null or str(id).is_empty() else str(id)
\treturn _find_entity(get_tree().current_scene, wanted)

func _find_entity(root: Node, id: String):
\tif root.get_meta("protomake_id", "") == id: return root
\tfor child in root.get_children():
\t\tvar found = _find_entity(child, id)
\t\tif found: return found
\treturn null
`;

function readme(interchange: ProtoMakeInterchange): string {
  const report = createExportManifest(interchange, 'godot').report;
  return `# ${interchange.source.name} — Godot export

Generated for Godot 4.x by ProtoMake ${interchange.source.engineVersion}. Open \`project.godot\` in the Godot editor. Generated content lives under \`Generated/ProtoMake\`; keep target-side custom work outside that directory because re-export replaces it.

ProtoMake remains the source of truth. This is a one-way export, not a round trip. Review \`Generated/ProtoMake/portability-report.json\` before shipping.

- Fully portable: ${report.summary['fully-portable']}
- Approximated: ${report.summary.approximated}
- Manual work: ${report.summary['manual-work']}
- Unsupported: ${report.summary.unsupported}
`;
}

export function exportGodot(interchange: ProtoMakeInterchange): ExportFile[] {
  const manifest = createExportManifest(interchange, 'godot'),
    files: ExportFile[] = [
      { path: 'project.godot', data: encodeText(projectFile(interchange)) },
      { path: 'README_IMPORT.md', data: encodeText(readme(interchange)) },
      {
        path: 'Generated/ProtoMake/protomake-ir.json',
        data: encodeText(serializeInterchange(interchange)),
      },
      {
        path: 'Generated/ProtoMake/export-manifest.json',
        data: encodeText(json(manifest)),
      },
      {
        path: 'Generated/ProtoMake/portability-report.json',
        data: encodeText(serializeReport(manifest.report)),
      },
      {
        path: 'Generated/ProtoMake/Scripts/ProtoMakeInput.gd',
        data: encodeText(inputScript(interchange)),
      },
      {
        path: 'Generated/ProtoMake/Scripts/ProtoMakeGraphRuntime.gd',
        data: encodeText(GRAPH_RUNTIME),
      },
      {
        path: 'Generated/ProtoMake/default_bus_layout.tres',
        data: encodeText(mixerFile(interchange)),
      },
      {
        path: 'Generated/ProtoMake/Textures/radial-light.svg',
        data: encodeText(RADIAL_LIGHT),
      },
    ];
  for (const scene of interchange.scenes)
    files.push({
      path: scenePath(scene),
      data: encodeText(sceneFile(scene, interchange)),
    });
  for (const asset of interchange.assets) {
    if (asset.kind === 'image' || asset.kind === 'audio')
      files.push({
        path: generatedAssetPath(asset),
        data: decodeAssetData(asset),
      });
    if (asset.mime === GRAPH_MIME)
      files.push({
        path: `Generated/ProtoMake/Data/graphs/${asset.id}.json`,
        data: encodeText(asset.data),
      });
  }
  return sortedFiles(files);
}
