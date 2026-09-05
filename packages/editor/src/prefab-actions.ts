import { guid } from '@protomake/core';
import { AssetSchema } from '@protomake/assets';
import {
  captureScene,
  instantiateScene,
  validateScene,
  type SceneData,
} from '@protomake/serialization';
import {
  PREFAB_MIME,
  PrefabLink,
  linkOf,
  instantiatePrefab,
  propagatePrefab,
  recordOverrides,
  content,
  remap,
  applyPatches,
  type PropertyPatch,
} from '@protomake/prefabs';
import type { EditorModel } from './model';
export function prefabBases(model: EditorModel): Map<string, SceneData> {
  return new Map(
    model.project.assets
      .filter((a) => a.mime === PREFAB_MIME)
      .map((a) => [a.id, JSON.parse(a.data) as SceneData]),
  );
}
export function captureOverrides(model: EditorModel, scene: SceneData): void {
  recordOverrides(scene, prefabBases(model));
}
export function createPrefab(model: EditorModel, path: string): string {
  let id = '';
  model.change('Create prefab', () => {
    const base = model.clipboard();
    if (base.entities.filter((e) => e.parent === null).length !== 1)
      throw new Error('Select exactly one hierarchy root');
    if (base.entities.some((e) => linkOf(e)))
      throw new Error(
        'Unpack an existing instance before creating another prefab',
      );
    id = guid();
    base.id = id;
    base.name = path;
    model.project.assets.push(
      AssetSchema.parse({
        id,
        path,
        kind: 'text',
        mime: PREFAB_MIME,
        data: JSON.stringify(base),
        width: 0,
        height: 0,
      }),
    );
    const root = base.entities.find((e) => e.parent === null)!.id;
    for (const e of base.entities)
      model.world.add(model.entity(e.id), PrefabLink.type, {
        prefab: id,
        source: e.id,
        root,
        overrides: [],
      });
  });
  return id;
}
export function placePrefab(model: EditorModel, id: string): void {
  model.change('Instantiate prefab', () => {
    const base = prefabBases(model).get(id);
    if (!base) throw new Error('Select a prefab asset');
    const entities = instantiatePrefab(base, id),
      scene = captureScene(model.world, model.scene);
    scene.entities.push(...entities);
    model.world = instantiateScene(scene, model.registry).world;
    model.selection.clear();
    model.selection.add(entities.find((e) => e.parent === null)!.id);
  });
}
export function editPrefab(
  model: EditorModel,
  id: string,
  input: unknown,
): void {
  model.change('Edit prefab base', () => {
    const base = validateScene(input, model.registry),
      asset = model.project.assets.find(
        (a) => a.id === id && a.mime === PREFAB_MIME,
      );
    if (!asset) throw new Error('Missing prefab');
    const previous = prefabBases(model).get(id)!;
    if (
      base.id !== previous.id ||
      base.entities.find((e) => e.parent === null)?.id !==
        previous.entities.find((e) => e.parent === null)?.id
    )
      throw new Error('Keep prefab and root identity unchanged');
    asset.data = JSON.stringify(base);
    for (const scene of model.project.scenes) propagatePrefab(scene, id, base);
    model.world = instantiateScene(model.scene, model.registry).world;
  });
}
export function revertPrefab(
  model: EditorModel,
  entity: string,
  path?: string[],
): void {
  model.change('Revert prefab overrides', () => {
    const scene = captureScene(model.world, model.scene),
      e = scene.entities.find((e) => e.id === entity)!,
      link = linkOf(e);
    if (!link) throw new Error('Select a prefab instance');
    for (const member of scene.entities) {
      const item = linkOf(member);
      if (!item || item.root !== link.root) continue;
      if (path) {
        if (member.id === entity)
          item.overrides = item.overrides.filter(
            (p) => JSON.stringify(p.path) !== JSON.stringify(path),
          );
      } else
        item.overrides = item.overrides.filter(
          (p) =>
            member.id === item.root &&
            p.path[0] === 'components' &&
            p.path[1] === 'protomake.transform',
        );
      member.components[PrefabLink.type] = item;
    }
    propagatePrefab(scene, link.prefab, prefabBases(model).get(link.prefab)!);
    model.world = instantiateScene(scene, model.registry).world;
  });
}
export function applyPrefabOverride(
  model: EditorModel,
  entity: string,
  patch: PropertyPatch,
): void {
  const scene = captureScene(model.world, model.scene),
    e = scene.entities.find((e) => e.id === entity)!,
    link = linkOf(e);
  if (!link) throw new Error('Select a prefab instance');
  if (
    patch.path[0] === 'components' &&
    patch.path[1] === 'protomake.transform' &&
    entity === link.root
  )
    throw new Error('Instance root placement cannot be applied to the base');
  const base = prefabBases(model).get(link.prefab)!,
    source = base.entities.find((e) => e.id === link.source)!;
  const ids = new Map(
    scene.entities
      .filter((e) => linkOf(e)?.root === link.root)
      .map((e) => [e.id, linkOf(e)!.source]),
  );
  const mapped = remap(patch.value, ids);
  const external = (value: unknown): boolean =>
    typeof value === 'string'
      ? scene.entities.some((e) => e.id === value) && !ids.has(value)
      : Array.isArray(value)
        ? value.some(external)
        : value !== null && typeof value === 'object'
          ? Object.values(value).some(external)
          : false;
  if (external(patch.value))
    throw new Error(
      'Cannot apply an external scene entity reference to a prefab',
    );
  Object.assign(
    source,
    applyPatches(content(source), [{ ...patch, value: mapped }]),
  );
  editPrefab(model, link.prefab, base);
}
export function unpackPrefab(model: EditorModel, entity: string): void {
  model.change('Unpack prefab', () => {
    const link = model.world.read(model.entity(entity), PrefabLink);
    if (!link) return;
    for (const e of model.world.all()) {
      const other = model.world.read(e.id, PrefabLink);
      if (other?.root === link.root) model.world.remove(e.id, PrefabLink.type);
    }
  });
}
