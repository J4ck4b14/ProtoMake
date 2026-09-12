import { runtimeRegistry } from '@protomake/player';
import { PrefabLink } from '@protomake/prefabs';
import { captureOverrides } from './prefab-actions';
import { scriptFields } from '@protomake/scripting/compiler';
import {
  Behaviours,
  graphBehaviour,
  scriptBehaviour,
  type GraphBehaviourData,
  type ScriptBehaviourData,
} from '@protomake/scripting';
import {
  World,
  guid,
  compose,
  multiply,
  inverse,
  IDENTITY,
  Tags,
  composeAffine,
  decompose,
  type Guid,
  type Matrix2D,
} from '@protomake/core';
import {
  createProject,
  captureScene,
  instantiateScene,
  validateProject,
  deterministicJSON,
  type ProjectData,
  type SceneData,
} from '@protomake/serialization';
import { History } from './history';
export { NoteComponent } from '@protomake/player';
export const editorRegistry = runtimeRegistry;
interface Snapshot {
  project: ProjectData;
  sceneId: Guid;
  selection: Guid[];
}
export class EditorModel {
  readonly history = new History();
  readonly selection = new Set<Guid>();
  private listeners = new Set<() => void>();
  private saved = '';
  private gesture: Snapshot | undefined;
  project: ProjectData;
  sceneId: Guid;
  world: World;
  locked = false;
  constructor(readonly registry = editorRegistry()) {
    this.project = createProject('Untitled project');
    this.world = new World(registry);
    const scene = captureScene(this.world, { id: guid(), name: 'Scene 1' });
    this.project.scenes.push(scene);
    this.project.startupScene = scene.id;
    this.sceneId = scene.id;
  }
  get scene(): SceneData {
    const scene = this.project.scenes.find((s) => s.id === this.sceneId);
    if (!scene) throw new Error('No active scene');
    return scene;
  }
  get dirty(): boolean {
    return deterministicJSON(this.project) !== this.saved;
  }
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  notify(): void {
    for (const listener of this.listeners) listener();
  }
  private ensureEditable(): void {
    if (this.locked) throw new Error('Stop Play Mode before editing');
  }
  private snapshot(): Snapshot {
    return structuredClone({
      project: this.project,
      sceneId: this.sceneId,
      selection: [...this.selection],
    });
  }
  private restore(snapshot: Snapshot): void {
    this.project = structuredClone(snapshot.project);
    this.sceneId = snapshot.sceneId;
    this.world = instantiateScene(this.scene, this.registry).world;
    this.selection.clear();
    for (const id of snapshot.selection)
      if (this.world.find(id) !== undefined) this.selection.add(id);
  }
  private flush(): void {
    const index = this.project.scenes.findIndex((s) => s.id === this.sceneId);
    const scene = captureScene(this.world, this.scene);
    captureOverrides(this, scene);
    this.project.scenes[index] = scene;
    for (const e of scene.entities)
      if (e.components[PrefabLink.type])
        this.world.set(
          this.entity(e.id),
          PrefabLink.type,
          e.components[PrefabLink.type],
        );
  }
  private record(label: string, before: Snapshot): void {
    const after = this.snapshot();
    if (deterministicJSON(before.project) !== deterministicJSON(after.project))
      this.history.push({
        label,
        undo: () => this.restore(before),
        redo: () => this.restore(after),
      });
  }
  change(label: string, operation: () => void): void {
    this.ensureEditable();
    if (this.gesture) throw new Error('Finish the active gesture first');
    const before = this.snapshot();
    try {
      operation();
      this.flush();
      validateProject(this.project, this.registry);
      this.record(label, before);
    } catch (error) {
      this.restore(before);
      throw error;
    } finally {
      this.notify();
    }
  }
  select(ids: Iterable<Guid>, append = false): void {
    if (!append) this.selection.clear();
    for (const id of ids)
      if (this.world.find(id) !== undefined) this.selection.add(id);
    this.notify();
  }
  toggle(id: Guid): void {
    if (this.selection.has(id)) this.selection.delete(id);
    else if (this.world.find(id) !== undefined) this.selection.add(id);
    this.notify();
  }
  undo(): void {
    this.ensureEditable();
    if (this.gesture) this.cancelGesture();
    this.history.undo();
    this.notify();
  }
  redo(): void {
    this.ensureEditable();
    if (this.gesture) this.cancelGesture();
    this.history.redo();
    this.notify();
  }
  beginGesture(): void {
    this.ensureEditable();
    if (this.gesture) throw new Error('Gesture already active');
    this.gesture = this.snapshot();
  }
  finishGesture(label: string): void {
    if (!this.gesture) return;
    const before = this.gesture;
    this.gesture = undefined;
    try {
      this.flush();
      validateProject(this.project, this.registry);
      this.record(label, before);
    } catch (error) {
      this.restore(before);
      throw error;
    } finally {
      this.notify();
    }
  }
  cancelGesture(): void {
    if (!this.gesture) return;
    this.restore(this.gesture);
    this.gesture = undefined;
    this.notify();
  }
  newProject(name: string): void {
    this.ensureEditable();
    this.load(new EditorModel(this.registry).project);
    this.project.name = name.trim() || 'Untitled project';
    this.saved = '';
    this.notify();
  }
  load(input: unknown, markAsSaved = true): void {
    this.ensureEditable();
    const project = validateProject(input, this.registry);
    if (project.scenes.length === 0) {
      const scene = captureScene(new World(this.registry), {
        id: guid(),
        name: 'Scene 1',
      });
      project.scenes.push(scene);
      project.startupScene = scene.id;
    }
    this.project = project;
    this.sceneId = project.startupScene ?? project.scenes[0]!.id;
    this.world = instantiateScene(this.scene, this.registry).world;
    this.selection.clear();
    this.history.clear();
    this.gesture = undefined;
    this.saved = markAsSaved ? deterministicJSON(project) : '';
    this.notify();
  }
  markSaved(snapshot: ProjectData = this.project): void {
    this.saved = deterministicJSON(snapshot);
    this.notify();
  }
  switchScene(id: Guid): void {
    this.ensureEditable();
    if (this.gesture) this.cancelGesture();
    const scene = this.project.scenes.find((s) => s.id === id);
    if (!scene) throw new Error('Missing scene');
    this.world = instantiateScene(scene, this.registry).world;
    this.sceneId = id;
    this.selection.clear();
    this.notify();
  }
  createScene(name: string): void {
    this.change('Create scene', () => {
      const scene = captureScene(new World(this.registry), {
        id: guid(),
        name,
      });
      this.project.scenes.push(scene);
      this.sceneId = scene.id;
      this.world = new World(this.registry);
      this.selection.clear();
    });
  }
  renameScene(name: string): void {
    this.change('Rename scene', () => {
      this.scene.name = name;
    });
  }
  duplicateScene(): void {
    this.change('Duplicate scene', () => {
      const scene = structuredClone(this.scene);
      scene.id = guid();
      scene.name += ' copy';
      this.project.scenes.push(scene);
      this.sceneId = scene.id;
      this.world = instantiateScene(scene, this.registry).world;
      this.selection.clear();
    });
  }
  deleteScene(): void {
    if (this.project.scenes.length === 1)
      throw new Error('Keep at least one scene');
    this.change('Delete scene', () => {
      delete this.project.sceneFolders[this.sceneId];
      this.project.scenes = this.project.scenes.filter(
        (s) => s.id !== this.sceneId,
      );
      if (this.project.startupScene === this.sceneId)
        this.project.startupScene = this.project.scenes[0]!.id;
      this.sceneId = this.project.scenes[0]!.id;
      this.world = instantiateScene(this.scene, this.registry).world;
      this.selection.clear();
    });
  }
  createEntity(name = 'Entity', parent: Guid | null = null): Guid {
    let stable = '';
    this.change('Create entity', () => {
      const id = this.world.create(name);
      if (parent !== null) this.world.setParent(id, this.entity(parent));
      stable = this.world.get(id).guid;
      this.selection.clear();
      this.selection.add(stable);
    });
    return stable;
  }
  entity(id: Guid): number {
    const entity = this.world.find(id);
    if (entity === undefined) throw new Error(`Entity ${id} no longer exists`);
    return entity;
  }
  roots(ids: Iterable<Guid> = this.selection): Guid[] {
    const selected = new Set(ids);
    return [...selected].filter((id) => {
      let parent = this.world.get(this.entity(id)).parent;
      while (parent !== null) {
        if (selected.has(this.world.get(parent).guid)) return false;
        parent = this.world.get(parent).parent;
      }
      return true;
    });
  }
  deleteSelection(): void {
    this.change('Delete entities', () => {
      for (const id of this.roots()) this.world.destroy(this.entity(id));
      this.selection.clear();
    });
  }
  reparent(parent: Guid | null): void {
    this.change('Reparent entities', () => {
      for (const id of this.roots())
        this.world.setParent(
          this.entity(id),
          parent === null ? null : this.entity(parent),
          'world',
        );
    });
  }
  clipboard(): SceneData {
    const included = new Set<Guid>();
    const pending = this.roots().map((id) => this.entity(id));
    while (pending.length) {
      const id = pending.pop()!;
      included.add(this.world.get(id).guid);
      pending.push(...this.world.children(id));
    }
    const scene = captureScene(this.world, { id: guid(), name: 'Clipboard' });
    scene.entities = scene.entities.filter((e) => included.has(e.id));
    for (const e of scene.entities) {
      const link = e.components[PrefabLink.type] as
        | { root: string }
        | undefined;
      if (link && !included.has(link.root))
        delete e.components[PrefabLink.type];
    }
    for (const e of scene.entities)
      if (e.parent !== null && !included.has(e.parent)) {
        e.parent = null;
        e.components['protomake.transform'] = {
          local: [...this.world.worldMatrix(this.entity(e.id))],
        };
      }
    return scene;
  }
  paste(scene: SceneData): void {
    this.change('Paste entities', () => {
      const source = instantiateScene(scene, this.registry).scene;
      const ids = new Map(source.entities.map((e) => [e.id, guid()]));
      const combined = captureScene(this.world, this.scene);
      for (const e of source.entities) {
        const copy = structuredClone(e);
        copy.id = ids.get(e.id)!;
        const prefab = copy.components[PrefabLink.type] as
          | { root: string }
          | undefined;
        if (prefab) prefab.root = ids.get(prefab.root) ?? prefab.root;
        copy.parent = e.parent === null ? null : ids.get(e.parent)!;
        if (copy.parent === null) {
          const local = (
            copy.components['protomake.transform'] as { local: number[] }
          ).local;
          local[4]! += 24;
          local[5]! += 24;
        }
        for (const [type, data] of Object.entries(copy.components)) {
          const paths = this.registry
            .get(type)
            .inspector.filter((f) => f.kind === 'entity')
            .map((f) => f.path);
          if (type === Behaviours.type) {
            const behaviours = Behaviours.schema.parse(data);
            for (const behaviourId of behaviours.order) {
              const item = behaviours.items[behaviourId]!;
              if (item.kind !== 'script') continue;
              const script = this.project.assets.find(
                (a) => a.id === item.script,
              );
              if (script)
                for (const [name, field] of Object.entries(
                  scriptFields(script.data, script.path),
                ))
                  if (field.type === 'entity')
                    paths.push(`items.${behaviourId}.values.${name}`);
            }
          }
          for (const path of paths) {
            const previous = getPath(data, path);
            if (typeof previous === 'string' && ids.has(previous))
              setPath(data, path, ids.get(previous)!);
          }
        }
        combined.entities.push(copy);
      }
      this.world = instantiateScene(combined, this.registry).world;
      this.selection.clear();
      for (const e of source.entities)
        if (e.parent === null) this.selection.add(ids.get(e.id)!);
    });
  }
  duplicate(): void {
    if (this.selection.size) this.paste(this.clipboard());
  }
  setWorld(id: Guid, world: Matrix2D): void {
    const entity = this.entity(id),
      parent = this.world.get(entity).parent;
    this.world.setLocalMatrix(
      entity,
      parent === null
        ? world
        : multiply(inverse(this.world.worldMatrix(parent)), world),
    );
  }
  transformSelection(
    delta: Matrix2D,
    original: ReadonlyMap<Guid, Matrix2D>,
  ): void {
    for (const [id, world] of original)
      this.setWorld(id, multiply(delta, world));
  }
  translate(dx: number, dy: number): void {
    this.change('Move entities', () => {
      for (const id of this.roots())
        this.setWorld(
          id,
          multiply(compose(dx, dy), this.world.worldMatrix(this.entity(id))),
        );
    });
  }
  addComponent(type: string): void {
    this.change('Add component', () => {
      for (const id of this.selection)
        if (!this.world.components(this.entity(id)).has(type))
          this.world.add(this.entity(id), type);
    });
  }
  addScriptBehaviour(
    script: string,
    values: ScriptBehaviourData['values'] = {},
  ): void {
    this.change('Add script behaviour', () => {
      for (const stable of this.selection) {
        const entity = this.entity(stable),
          id = guid(),
          current =
            this.world.read(entity, Behaviours) ?? Behaviours.defaults(),
          next = structuredClone(current);
        next.order.push(id);
        next.items[id] = scriptBehaviour(id, script, values);
        if (this.world.components(entity).has(Behaviours.type))
          this.world.set(entity, Behaviours.type, next);
        else this.world.add(entity, Behaviours.type, next);
      }
    });
  }
  addGraphBehaviour(
    graph: string,
    values: GraphBehaviourData['values'] = {},
  ): void {
    this.change('Add graph behaviour', () => {
      for (const stable of this.selection) {
        const entity = this.entity(stable),
          id = guid(),
          current =
            this.world.read(entity, Behaviours) ?? Behaviours.defaults(),
          next = structuredClone(current);
        next.order.push(id);
        next.items[id] = graphBehaviour(id, graph, values);
        if (this.world.components(entity).has(Behaviours.type))
          this.world.set(entity, Behaviours.type, next);
        else this.world.add(entity, Behaviours.type, next);
      }
    });
  }
  removeBehaviour(id: string): void {
    this.change('Remove behaviour', () => {
      for (const stable of this.selection) {
        const entity = this.entity(stable),
          current = this.world.read(entity, Behaviours);
        if (!current?.items[id]) continue;
        const next = structuredClone(current);
        next.order = next.order.filter((candidate) => candidate !== id);
        delete next.items[id];
        this.world.set(entity, Behaviours.type, next);
      }
    });
  }
  setBehaviourProperty(id: string, path: string, value: unknown): void {
    this.change('Edit behaviour', () => {
      for (const stable of this.selection) {
        const entity = this.entity(stable),
          current = this.world.read(entity, Behaviours);
        if (!current?.items[id]) continue;
        const next = structuredClone(current);
        setPath(next, `items.${id}.${path}`, value);
        this.world.set(entity, Behaviours.type, next);
      }
    });
  }
  replaceBehaviourScript(id: string, script: string): void {
    this.change('Replace behaviour script', () => {
      for (const stable of this.selection) {
        const entity = this.entity(stable),
          current = this.world.read(entity, Behaviours);
        if (!current?.items[id] || current.items[id].kind !== 'script')
          continue;
        const next = structuredClone(current),
          item = next.items[id]!;
        if (item.kind !== 'script') continue;
        item.script = script;
        item.values = {};
        this.world.set(entity, Behaviours.type, next);
      }
    });
  }
  replaceBehaviourGraph(id: string, graph: string): void {
    this.change('Replace behaviour graph', () => {
      for (const stable of this.selection) {
        const entity = this.entity(stable),
          current = this.world.read(entity, Behaviours);
        if (!current?.items[id] || current.items[id].kind !== 'graph') continue;
        const next = structuredClone(current),
          item = next.items[id]!;
        if (item.kind !== 'graph') continue;
        item.graph = graph;
        item.values = {};
        this.world.set(entity, Behaviours.type, next);
      }
    });
  }
  setTransformProperty(
    property: 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY',
    value: number,
  ): void {
    if (!Number.isFinite(value))
      throw new Error('Transform value must be finite');
    this.change('Edit transform', () => {
      for (const stable of this.selection) {
        const entity = this.entity(stable),
          parts = decompose(this.world.localMatrix(entity));
        this.world.setLocalMatrix(
          entity,
          composeAffine({ ...parts, [property]: value }),
        );
      }
    });
  }
  setTags(values: readonly string[]): void {
    this.change('Edit tags', () => {
      for (const stable of this.selection) {
        const entity = this.entity(stable),
          data = { values: [...new Set(values)] };
        if (this.world.components(entity).has(Tags.type))
          this.world.set(entity, Tags.type, data);
        else this.world.add(entity, Tags.type, data);
      }
    });
  }
  removeComponent(type: string): void {
    this.change('Remove component', () => {
      for (const id of this.selection) this.world.remove(this.entity(id), type);
    });
  }
  resetComponent(type: string): void {
    this.change('Reset component', () => {
      for (const id of this.selection)
        if (this.world.components(this.entity(id)).has(type))
          this.world.set(
            this.entity(id),
            type,
            this.registry.get(type).defaults(),
          );
    });
  }
  setProperty(type: string, path: string, value: unknown): void {
    this.change('Edit component', () => {
      for (const stable of this.selection) {
        const id = this.entity(stable);
        if (!this.world.components(id).has(type)) continue;
        const data = structuredClone(this.world.components(id).get(type));
        setPath(data, path, value);
        this.world.set(id, type, data);
      }
    });
  }
}
export function getPath(data: unknown, path: string): unknown {
  let value = data;
  for (const key of path.split('.')) {
    if (value === null || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
export function setPath(data: unknown, path: string, value: unknown): void {
  const keys = path.split('.');
  if (keys.some((k) => ['__proto__', 'prototype', 'constructor'].includes(k)))
    throw new Error('Unsafe property path');
  let object = data;
  for (const key of keys.slice(0, -1)) {
    if (!object || typeof object !== 'object')
      throw new Error('Invalid property path');
    object = (object as Record<string, unknown>)[key];
  }
  if (!object || typeof object !== 'object')
    throw new Error('Invalid property path');
  (object as Record<string, unknown>)[keys.at(-1)!] = value;
}
export function pivotDelta(
  x: number,
  y: number,
  rotation = 0,
  sx = 1,
  sy = 1,
): Matrix2D {
  return multiply(
    multiply(compose(x, y), compose(0, 0, rotation, sx, sy)),
    compose(-x, -y),
  );
}
export { IDENTITY };
