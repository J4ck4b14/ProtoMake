import type { World } from '@protomake/core';
import { SpriteRenderer, type SpriteData } from './components';
export function renderList(
  world: World,
): { id: number; guid: string; data: SpriteData }[] {
  return [...world.query(SpriteRenderer.type)]
    .map(([id]) => ({
      id,
      guid: world.get(id).guid,
      data: world.read(id, SpriteRenderer)!,
    }))
    .sort(
      (a, b) =>
        a.data.layer - b.data.layer ||
        a.data.order - b.data.order ||
        (a.guid < b.guid ? -1 : a.guid > b.guid ? 1 : 0),
    );
}
