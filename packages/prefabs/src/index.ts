import { z } from 'zod';
import { guid, GUID_PATTERN, type ComponentDefinition } from '@protomake/core';
type Json = z.infer<ReturnType<typeof z.json>>;
export interface PrefabEntity {
  id: string;
  name: string;
  enabled: boolean;
  parent: string | null;
  components: Record<string, Json>;
}
export interface PrefabDocument {
  entities: PrefabEntity[];
}
const uuid = z.string().regex(GUID_PATTERN);
const PatchSchema = z.strictObject({
  path: z
    .array(z.string())
    .min(1)
    .refine(
      (p) =>
        ['name', 'enabled', 'components'].includes(p[0]!) &&
        !p.some((k) =>
          [
            '__proto__',
            'constructor',
            'prototype',
            'protomake.prefab',
          ].includes(k),
        ),
      'Unsafe override path',
    ),
  removed: z.boolean(),
  value: z.json(),
});
const LinkSchema = z.strictObject({
  prefab: uuid.or(z.literal('')),
  source: uuid.or(z.literal('')),
  root: uuid.or(z.literal('')),
  overrides: z.array(PatchSchema),
});
export type PrefabLinkData = z.infer<typeof LinkSchema>;
export type PropertyPatch = z.infer<typeof PatchSchema>;
export const PrefabLink: ComponentDefinition<PrefabLinkData> = {
  type: 'protomake.prefab',
  displayName: 'Prefab instance',
  schema: LinkSchema,
  defaults: () => ({ prefab: '', source: '', root: '', overrides: [] }),
  inspector: [
    { path: 'prefab', label: 'Prefab', kind: 'asset' },
    { path: 'root', label: 'Instance root', kind: 'entity' },
  ],
};
export const PREFAB_MIME = 'application/x-protomake-prefab';
export function linkOf(entity: PrefabEntity): PrefabLinkData | undefined {
  const value = entity.components[PrefabLink.type];
  return value ? LinkSchema.parse(value) : undefined;
}
export function content(entity: PrefabEntity): Json {
  const components = structuredClone(entity.components);
  delete components[PrefabLink.type];
  return { name: entity.name, enabled: entity.enabled, components };
}
function object(value: Json | undefined): value is Record<string, Json> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
/** Arrays are atomic; object leaves use tokenized paths, so dots in component IDs are unambiguous. */
export function differences(
  base: Json,
  value: Json,
  path: string[] = [],
): PropertyPatch[] {
  if (JSON.stringify(base) === JSON.stringify(value)) return [];
  if (object(base) && object(value))
    return [...new Set([...Object.keys(base), ...Object.keys(value)])].flatMap(
      (key) =>
        !Object.hasOwn(value, key)
          ? [{ path: [...path, key], removed: true, value: null }]
          : !Object.hasOwn(base, key)
            ? [{ path: [...path, key], removed: false, value: value[key]! }]
            : differences(base[key]!, value[key]!, [...path, key]),
    );
  return [{ path, removed: false, value }];
}
export function applyPatches(
  base: Json,
  patches: readonly PropertyPatch[],
): Json {
  const result = structuredClone(base);
  for (const input of patches) {
    const patch = PatchSchema.parse(input);
    let target = result;
    for (const key of patch.path.slice(0, -1)) {
      if (!object(target)) throw new Error('Override parent is not an object');
      if (!object(target[key])) target[key] = {};
      target = target[key]!;
    }
    if (!object(target)) throw new Error('Invalid override target');
    const key = patch.path.at(-1)!;
    if (patch.removed) delete target[key];
    else target[key] = structuredClone(patch.value);
  }
  return result;
}
/** Reference remapping is restricted to values matching known local GUIDs, including script fields. */
export function remap(value: Json, ids: ReadonlyMap<string, string>): Json {
  if (typeof value === 'string') return ids.get(value) ?? value;
  if (Array.isArray(value)) return value.map((v) => remap(v, ids));
  if (object(value))
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, remap(v, ids)]),
    );
  return value;
}
export function validatePrefab(document: PrefabDocument): void {
  if (document.entities.filter((e) => e.parent === null).length !== 1)
    throw new Error('A prefab must contain exactly one root');
  if (document.entities.some((e) => e.components[PrefabLink.type]))
    throw new Error('Nested prefabs are not supported; unpack first');
}
export function instantiatePrefab(
  document: PrefabDocument,
  prefab: string,
): PrefabEntity[] {
  validatePrefab(document);
  const ids = new Map(document.entities.map((e) => [e.id, guid()]));
  const root = ids.get(document.entities.find((e) => e.parent === null)!.id)!;
  return document.entities.map((e) => ({
    ...e,
    id: ids.get(e.id)!,
    parent: e.parent === null ? null : ids.get(e.parent)!,
    components: {
      ...(remap(e.components, ids) as Record<string, Json>),
      [PrefabLink.type]: { prefab, source: e.id, root, overrides: [] },
    },
  }));
}
export function recordOverrides(
  scene: PrefabDocument,
  bases: ReadonlyMap<string, PrefabDocument>,
): void {
  for (const e of scene.entities) {
    const link = linkOf(e);
    if (!link) continue;
    const base = bases
      .get(link.prefab)
      ?.entities.find((b) => b.id === link.source);
    if (!base)
      throw new Error(`Missing prefab source ${link.prefab}/${link.source}`);
    const ids = new Map(
      scene.entities
        .filter((x) => linkOf(x)?.root === link.root)
        .map((x) => [linkOf(x)!.source, x.id]),
    );
    link.overrides = differences(remap(content(base), ids), content(e));
    e.components[PrefabLink.type] = link;
  }
}
export function propagatePrefab(
  scene: PrefabDocument,
  prefab: string,
  base: PrefabDocument,
): void {
  validatePrefab(base);
  const roots = [
    ...new Set(
      scene.entities
        .filter((e) => linkOf(e)?.prefab === prefab)
        .map((e) => linkOf(e)!.root),
    ),
  ];
  for (const root of roots) {
    const members = scene.entities.filter((e) => linkOf(e)?.root === root);
    const ids = new Map(members.map((e) => [linkOf(e)!.source, e.id]));
    for (const b of base.entities) if (!ids.has(b.id)) ids.set(b.id, guid());
    const baseIds = new Set(base.entities.map((e) => e.id));
    for (const e of members)
      if (!baseIds.has(linkOf(e)!.source))
        throw new Error('Unpack instances before removing base entities');
    for (const b of base.entities) {
      let e = members.find((x) => linkOf(x)!.source === b.id);
      const link = e
        ? linkOf(e)!
        : { prefab, source: b.id, root, overrides: [] };
      const value = applyPatches(remap(content(b), ids), link.overrides) as {
        name: string;
        enabled: boolean;
        components: Record<string, Json>;
      };
      const parent =
        b.parent === null ? (e?.parent ?? null) : ids.get(b.parent)!;
      if (e) {
        Object.assign(e, value, { parent });
      } else {
        e = { ...value, id: ids.get(b.id)!, parent };
        scene.entities.push(e);
      }
      e.components[PrefabLink.type] = link;
    }
  }
}
export function validateLinks(
  scene: PrefabDocument,
  bases: ReadonlyMap<string, PrefabDocument>,
): void {
  for (const e of scene.entities) {
    const link = linkOf(e);
    if (!link) continue;
    const base = bases.get(link.prefab);
    const source = base?.entities.find((b) => b.id === link.source);
    const root = scene.entities.find((x) => x.id === link.root);
    if (
      !source ||
      !root ||
      linkOf(root)?.prefab !== link.prefab ||
      linkOf(root)?.root !== root.id
    )
      throw new Error('Invalid prefab instance link');
    const members = scene.entities.filter((x) => linkOf(x)?.root === link.root);
    if (
      members.length !== base!.entities.length ||
      new Set(members.map((x) => linkOf(x)!.source)).size !== members.length
    )
      throw new Error(
        'Prefab hierarchy is incomplete; unpack before deleting a child',
      );
    if (source.parent === null && e.id !== root.id)
      throw new Error('Prefab root source mismatch');
    const expectedParent =
      source.parent === null
        ? e.parent
        : members.find((x) => linkOf(x)!.source === source.parent)?.id;
    if (expectedParent !== e.parent)
      throw new Error('Unpack a prefab before changing its internal hierarchy');
  }
}
