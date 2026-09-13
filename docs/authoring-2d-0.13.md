# ProtoMake 0.13: 2D authoring

ProtoMake 0.13 turns repeated 2D setup into reusable authored data. Sprite regions and tile sets are project assets with GUID identity; tilemaps, character motion and camera behaviours are ordinary scene components. Editor Play and standalone builds consume the same records.

## Sprite regions

Select an imported image and choose **Slice sprite**. A regular grid creates lightweight region assets that reference the original pixels and retain pixel bounds, pivot, nearest/linear filtering and an atlas label. Renaming or moving either asset does not break the GUID reference. Sprite Renderer can use a complete image or a region and optionally adopts the region pivot.

## Tilemaps

Create a tile set from an image or region, then edit tile names, texture, solid and one-way flags. The tile-set format also supports ordered animation frames and four-neighbour rule metadata. Select an entity and choose **Edit tilemap** to paint sparse cells on an ordered layer.

Runtime rendering resolves each cell through the tile set. Physics groups solid cells under one fixed Rapier body per configured chunk rather than creating one body per cell. Tilemap object layers and arbitrary polygon tiles are outside this release.

## Characters and cameras

Character Body 2D provides move-and-slide plus floor, wall and ceiling queries over the shared physics world. It exposes speed, acceleration/deceleration, slope threshold, ground snap, skin width, up direction and platform layer. Project scripts call `ctx.character.moveAndSlide()` and inspect `ctx.character.state()` instead of rebuilding grounded rays for each game.

Camera Follow 2D adds a target, dead zone, velocity look-ahead, exponential smoothing and optional bounds. Camera Zone 2D blends the camera toward an authored zoom while its target is inside the zone; overlapping zones use priority. `ctx.camera.shake()` supplies a reusable decaying shake effect.
