import { AssetSchema, SPRITE_REGION_MIME } from '@protomake/assets';
import { guid } from '@protomake/core';
import { TILESET_MIME, TileSetSchema, Tilemap2D } from '@protomake/tilemap';
import type { EditorModel } from './model';
import { button, input, node } from './dom';

export function createTileSet(
  model: EditorModel,
  selected: string | undefined,
  path: string,
): void {
  const texture = model.project.assets.find(
    (asset) =>
      asset.id === selected &&
      (asset.kind === 'image' || asset.mime === SPRITE_REGION_MIME),
  );
  if (!texture) throw new Error('Select an image or sprite region first');
  model.change('Create tile set', () => {
    model.project.assets.push(
      AssetSchema.parse({
        id: guid(),
        path,
        kind: 'text',
        mime: TILESET_MIME,
        data: JSON.stringify({
          version: 1,
          name: path.split('/').at(-1) ?? 'Tile set',
          tiles: [
            {
              id: 'tile-1',
              name: 'Tile 1',
              texture: texture.id,
              solid: true,
              oneWay: false,
              animation: [],
              rules: null,
            },
          ],
        }),
        width: 0,
        height: 0,
      }),
    );
  });
}

export function editTileSet(
  model: EditorModel,
  selected: string | undefined,
  report: (message: string, error?: boolean) => void,
): void {
  const asset = model.project.assets.find(
    (candidate) => candidate.id === selected && candidate.mime === TILESET_MIME,
  );
  if (!asset) throw new Error('Select a tile set');
  const data = TileSetSchema.parse(JSON.parse(asset.data)),
    dialog = node('dialog', 'settings'),
    body = node('div'),
    textures = model.project.assets.filter(
      (candidate) =>
        candidate.kind === 'image' || candidate.mime === SPRITE_REGION_MIME,
    );
  const render = () => {
    body.replaceChildren();
    for (const [index, tile] of data.tiles.entries()) {
      const row = node('div', 'animation-row'),
        name = input('Tile name', tile.name),
        texture = node('select'),
        solid = input('Solid', '', 'checkbox'),
        oneWay = input('One way', '', 'checkbox');
      for (const candidate of textures)
        texture.append(new Option(candidate.path, candidate.id));
      texture.value = tile.texture;
      solid.input.checked = tile.solid;
      oneWay.input.checked = tile.oneWay;
      name.input.onchange = () => (tile.name = name.input.value);
      texture.onchange = () => (tile.texture = texture.value);
      solid.input.onchange = () => (tile.solid = solid.input.checked);
      oneWay.input.onchange = () => (tile.oneWay = oneWay.input.checked);
      row.append(
        name.row,
        texture,
        solid.row,
        oneWay.row,
        button('Remove', () => {
          data.tiles.splice(index, 1);
          render();
        }),
      );
      body.append(row);
    }
  };
  render();
  dialog.append(
    node('h2', '', `Tile set · ${asset.path}`),
    body,
    button('+ Tile', () => {
      data.tiles.push({
        id: guid(),
        name: `Tile ${data.tiles.length + 1}`,
        texture: textures[0]?.id ?? '',
        solid: false,
        oneWay: false,
        animation: [],
        rules: null,
      });
      render();
    }),
    button('Save tile set', () => {
      try {
        const parsed = TileSetSchema.parse(data);
        model.change('Edit tile set', () => {
          const index = model.project.assets.findIndex(
            (candidate) => candidate.id === asset.id,
          );
          model.project.assets[index] = {
            ...asset,
            data: JSON.stringify(parsed),
          };
        });
        dialog.close();
      } catch (cause) {
        report(String(cause), true);
      }
    }),
    button('Cancel', () => dialog.close()),
  );
  dialog.onclose = () => dialog.remove();
  document.body.append(dialog);
  dialog.showModal();
}

export function editTilemap(
  model: EditorModel,
  report: (message: string, error?: boolean) => void,
): void {
  const stable = [...model.selection][0];
  if (!stable) throw new Error('Select an entity for tilemap editing');
  const id = model.entity(stable),
    data = structuredClone(
      model.world.read(id, Tilemap2D) ?? Tilemap2D.defaults(),
    ),
    sets = model.project.assets.filter((asset) => asset.mime === TILESET_MIME);
  if (!sets.length) throw new Error('Create a tile set first');
  if (!data.tileset) data.tileset = sets[0]!.id;
  const dialog = node('dialog', 'tilemap-dialog'),
    palette = node('div', 'tile-palette'),
    canvas = node('canvas', 'tile-canvas'),
    context = canvas.getContext('2d')!,
    setSelect = node('select'),
    layerSelect = node('select');
  canvas.width = 640;
  canvas.height = 480;
  let activeTile = '',
    erase = false;
  for (const set of sets) setSelect.append(new Option(set.path, set.id));
  const draw = () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#30404e';
    for (let x = 0; x < canvas.width; x += data.cellWidth)
      for (let y = 0; y < canvas.height; y += data.cellHeight)
        context.strokeRect(x, y, data.cellWidth, data.cellHeight);
    const layer = data.layers.find(
      (candidate) => candidate.id === layerSelect.value,
    )!;
    context.fillStyle = '#63b3ed';
    for (const key of Object.keys(layer.cells)) {
      const [x, y] = key.split(',').map(Number);
      context.fillRect(
        x! * data.cellWidth + 2,
        y! * data.cellHeight + 2,
        data.cellWidth - 4,
        data.cellHeight - 4,
      );
    }
  };
  const renderPalette = () => {
    palette.replaceChildren(setSelect, layerSelect);
    const set = TileSetSchema.parse(
      JSON.parse(sets.find((asset) => asset.id === data.tileset)!.data),
    );
    activeTile = set.tiles.some((tile) => tile.id === activeTile)
      ? activeTile
      : (set.tiles[0]?.id ?? '');
    for (const tile of set.tiles) {
      const control = button(tile.name, () => {
        activeTile = tile.id;
        erase = false;
        renderPalette();
      });
      control.classList.toggle('selected', tile.id === activeTile && !erase);
      palette.append(control);
    }
    const eraser = button('Eraser', () => {
      erase = true;
      renderPalette();
    });
    eraser.classList.toggle('selected', erase);
    palette.append(eraser);
  };
  setSelect.value = data.tileset;
  setSelect.onchange = () => {
    data.tileset = setSelect.value;
    renderPalette();
  };
  for (const layer of data.layers)
    layerSelect.append(new Option(layer.name, layer.id));
  layerSelect.value = data.layers[0]!.id;
  layerSelect.onchange = draw;
  canvas.onclick = (event) => {
    const rect = canvas.getBoundingClientRect(),
      x = Math.floor(
        ((event.clientX - rect.left) * canvas.width) /
          rect.width /
          data.cellWidth,
      ),
      y = Math.floor(
        ((event.clientY - rect.top) * canvas.height) /
          rect.height /
          data.cellHeight,
      ),
      cells = data.layers.find(
        (layer) => layer.id === layerSelect.value,
      )!.cells;
    if (erase) delete cells[`${x},${y}`];
    else if (activeTile) cells[`${x},${y}`] = activeTile;
    draw();
  };
  renderPalette();
  draw();
  const layout = node('div', 'tilemap-editor');
  layout.append(palette, canvas);
  dialog.append(
    node('h2', '', 'Tilemap palette'),
    layout,
    button('Save tilemap', () => {
      try {
        const parsed = Tilemap2D.schema.parse(data);
        model.change('Paint tilemap', () => {
          if (model.world.components(id).has(Tilemap2D.type))
            model.world.set(id, Tilemap2D.type, parsed);
          else model.world.add(id, Tilemap2D.type, parsed);
        });
        dialog.close();
      } catch (cause) {
        report(String(cause), true);
      }
    }),
    button('Cancel', () => dialog.close()),
  );
  dialog.onclose = () => dialog.remove();
  document.body.append(dialog);
  dialog.showModal();
}
