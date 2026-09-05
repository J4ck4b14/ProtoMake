import { z } from 'zod';
import { guid, GUID_PATTERN, type ComponentRegistry } from '@protomake/core';
export const AssetSchema = z
  .strictObject({
    id: z.string().regex(GUID_PATTERN),
    path: z
      .string()
      .min(1)
      .refine(
        (p) =>
          !p.startsWith('/') &&
          !p.includes('\\') &&
          !p.split('/').some((s) => !s || s === '.' || s === '..'),
        'Use a relative path without traversal',
      ),
    kind: z.enum(['image', 'text', 'audio']),
    mime: z.enum([
      'image/png',
      'image/jpeg',
      'image/webp',
      'text/plain',
      'application/json',
      'text/typescript',
      'application/x-protomake-prefab',
      'application/x-protomake-animation',
      'application/x-protomake-animator',
      'audio/wav',
      'audio/mpeg',
      'audio/ogg',
    ]),
    data: z.string(),
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative(),
  })
  .superRefine((asset, ctx) => {
    if (asset.kind === 'image') {
      if (
        !asset.mime.startsWith('image/') ||
        !asset.data.startsWith(`data:${asset.mime};base64,`) ||
        asset.width < 1 ||
        asset.height < 1
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Invalid image metadata or data URL',
        });
    } else if (asset.kind === 'audio') {
      if (
        !asset.mime.startsWith('audio/') ||
        !asset.data.startsWith(`data:${asset.mime};base64,`)
      )
        ctx.addIssue({ code: 'custom', message: 'Invalid audio data URL' });
    } else if (
      asset.mime.startsWith('image/') ||
      asset.mime.startsWith('audio/')
    )
      ctx.addIssue({ code: 'custom', message: 'Text cannot use image MIME' });
  });
export type AssetData = z.infer<typeof AssetSchema>;
export interface AssetReference {
  scene: string;
  entity: string;
  component: string;
  path: string;
  asset: string;
}
export function assetReferences(
  scenes: readonly {
    name: string;
    entities: readonly { name: string; components: Record<string, unknown> }[];
  }[],
  registry: ComponentRegistry,
): AssetReference[] {
  const references: AssetReference[] = [];
  for (const scene of scenes)
    for (const entity of scene.entities)
      for (const [type, data] of Object.entries(entity.components))
        for (const field of registry.get(type).inspector)
          if (field.kind === 'asset') {
            let value: unknown = data;
            for (const part of field.path.split('.'))
              value =
                value && typeof value === 'object'
                  ? (value as Record<string, unknown>)[part]
                  : undefined;
            if (typeof value === 'string' && value)
              references.push({
                scene: scene.name,
                entity: entity.name,
                component: type,
                path: field.path,
                asset: value,
              });
          }
  return references;
}
export class AssetDatabase {
  private readonly ids = new Map<string, AssetData>();
  private readonly paths = new Map<string, string>();
  constructor(assets: readonly AssetData[] = []) {
    for (const asset of assets) this.import(asset);
  }
  import(input: AssetData): void {
    const asset = AssetSchema.parse(input);
    if (this.ids.has(asset.id))
      throw new Error(`Duplicate asset ID: ${asset.id}`);
    if (this.paths.has(asset.path.toLowerCase()))
      throw new Error(`Asset path already exists: ${asset.path}`);
    this.ids.set(asset.id, asset);
    this.paths.set(asset.path.toLowerCase(), asset.id);
  }
  get(id: string): AssetData | undefined {
    const asset = this.ids.get(id);
    return asset ? structuredClone(asset) : undefined;
  }
  byPath(path: string): AssetData | undefined {
    const id = this.paths.get(path.toLowerCase());
    return id ? this.get(id) : undefined;
  }
  all(): AssetData[] {
    return [...this.ids.values()].map((a) => structuredClone(a));
  }
  move(id: string, path: string): void {
    const previous = this.ids.get(id);
    if (!previous) throw new Error(`Missing asset: ${id}`);
    const asset = AssetSchema.parse({ ...previous, path }),
      existing = this.paths.get(path.toLowerCase());
    if (existing && existing !== id)
      throw new Error(`Asset path already exists: ${path}`);
    this.paths.delete(previous.path.toLowerCase());
    this.paths.set(path.toLowerCase(), id);
    this.ids.set(id, asset);
  }
  delete(id: string, references: readonly AssetReference[] = []): void {
    const asset = this.ids.get(id);
    if (!asset) throw new Error(`Missing asset: ${id}`);
    const used = references.filter((r) => r.asset === id);
    if (used.length)
      throw new Error(
        `Asset ${asset.path} is referenced by ${used.map((r) => `${r.scene}/${r.entity}`).join(', ')}`,
      );
    this.ids.delete(id);
    this.paths.delete(asset.path.toLowerCase());
  }
  missing(references: readonly AssetReference[]): AssetReference[] {
    return references.filter((r) => !this.ids.has(r.asset));
  }
}
export async function importFile(file: File): Promise<AssetData> {
  if (file.size > 20 * 1024 * 1024)
    throw new Error('Import limit is 20 MiB per file');
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  const mime =
    extension === 'wav'
      ? 'audio/wav'
      : extension === 'mp3'
        ? 'audio/mpeg'
        : extension === 'ogg'
          ? 'audio/ogg'
          : extension === 'png'
            ? 'image/png'
            : extension === 'jpg' || extension === 'jpeg'
              ? 'image/jpeg'
              : extension === 'webp'
                ? 'image/webp'
                : extension === 'json'
                  ? 'application/json'
                  : extension === 'ts'
                    ? 'text/typescript'
                    : extension === 'txt'
                      ? 'text/plain'
                      : undefined;
  if (!mime) throw new Error(`Unsupported file type: ${file.name}`);
  if (!mime.startsWith('image/') && !mime.startsWith('audio/'))
    return AssetSchema.parse({
      id: guid(),
      path: `Assets/${file.name}`,
      kind: 'text',
      mime,
      data: await file.text(),
      width: 0,
      height: 0,
    });
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(String(reader.result).replace(/^data:[^;]*;/, `data:${mime};`));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  if (mime.startsWith('audio/'))
    return AssetSchema.parse({
      id: guid(),
      path: `Assets/${file.name}`,
      kind: 'audio',
      mime,
      data,
      width: 0,
      height: 0,
    });
  const image = await loadImage(data);
  return AssetSchema.parse({
    id: guid(),
    path: `Assets/${file.name}`,
    kind: 'image',
    mime,
    data,
    width: image.naturalWidth,
    height: image.naturalHeight,
  });
}
export function loadImage(data: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image decoding failed'));
    image.src = data;
  });
}
