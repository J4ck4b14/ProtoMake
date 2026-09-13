import { z } from 'zod';
import type { ComponentDefinition, ComponentRegistry } from '@protomake/core';

export const TILESET_MIME = 'application/x-protomake-tileset';
const TileFrameSchema = z.strictObject({
  texture: z.string().min(1),
  duration: z.number().finite().positive(),
});
export const TileSetSchema = z.strictObject({
  version: z.literal(1),
  name: z.string().min(1),
  tiles: z.array(
    z.strictObject({
      id: z.string().min(1),
      name: z.string().min(1),
      texture: z.string().min(1),
      solid: z.boolean(),
      oneWay: z.boolean(),
      animation: z.array(TileFrameSchema),
      rules: z
        .strictObject({
          north: z.string(),
          east: z.string(),
          south: z.string(),
          west: z.string(),
        })
        .nullable(),
    }),
  ),
});
export type TileSetData = z.infer<typeof TileSetSchema>;
const TileLayerSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  visible: z.boolean(),
  order: z.number().int(),
  cells: z.record(z.string().regex(/^-?\d+,-?\d+$/), z.string().min(1)),
});
const TilemapSchema = z.strictObject({
  tileset: z.string(),
  cellWidth: z.number().finite().positive(),
  cellHeight: z.number().finite().positive(),
  chunkSize: z.number().int().min(4).max(128),
  collisionLayer: z.number().int().min(0).max(15),
  layers: z.array(TileLayerSchema).min(1),
});
export type TilemapData = z.infer<typeof TilemapSchema>;
export const Tilemap2D: ComponentDefinition<TilemapData> = {
  type: 'protomake.tilemap',
  displayName: 'Tilemap 2D',
  schema: TilemapSchema,
  defaults: () => ({
    tileset: '',
    cellWidth: 32,
    cellHeight: 32,
    chunkSize: 16,
    collisionLayer: 1,
    layers: [{ id: 'base', name: 'Base', visible: true, order: 0, cells: {} }],
  }),
  inspector: [
    { path: 'tileset', label: 'Tile set', kind: 'asset' },
    { path: 'cellWidth', label: 'Cell width', kind: 'number', min: 1 },
    { path: 'cellHeight', label: 'Cell height', kind: 'number', min: 1 },
    { path: 'chunkSize', label: 'Chunk size', kind: 'number', min: 4 },
    {
      path: 'collisionLayer',
      label: 'Collision layer',
      kind: 'number',
      min: 0,
      max: 15,
    },
  ],
};
export function registerTilemap(registry: ComponentRegistry): void {
  registry.register(Tilemap2D);
}
export function parseCell(key: string): readonly [number, number] {
  const [x, y] = key.split(',').map(Number);
  if (!Number.isInteger(x) || !Number.isInteger(y))
    throw new Error(`Invalid tile cell ${key}`);
  return [x!, y!];
}
export function cellPosition(
  key: string,
  width: number,
  height: number,
): readonly [number, number] {
  const [x, y] = parseCell(key);
  return [x * width, y * height];
}
