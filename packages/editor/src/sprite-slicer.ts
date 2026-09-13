import { AssetSchema, SPRITE_REGION_MIME, type AssetData } from '@protomake/assets';
import { guid } from '@protomake/core';
import type { EditorModel } from './model';
import { button, input, node } from './dom';

export function sliceRegions(
  source: AssetData,
  cellWidth: number,
  cellHeight: number,
): AssetData[] {
  if (source.kind !== 'image') throw new Error('Select an image to slice');
  if (
    !Number.isSafeInteger(cellWidth) ||
    !Number.isSafeInteger(cellHeight) ||
    cellWidth < 1 ||
    cellHeight < 1
  )
    throw new Error('Slice size must use positive whole pixels');
  const stem = source.path.replace(/\.[^/.]+$/, '');
  const regions: AssetData[] = [];
  for (
    let y = 0, row = 0;
    y + cellHeight <= source.height;
    y += cellHeight, row++
  )
    for (
      let x = 0, column = 0;
      x + cellWidth <= source.width;
      x += cellWidth, column++
    )
      regions.push(
        AssetSchema.parse({
          id: guid(),
          path: `${stem}_${row}_${column}.sprite.json`,
          kind: 'text',
          mime: SPRITE_REGION_MIME,
          data: JSON.stringify({
            version: 1,
            source: source.id,
            x,
            y,
            width: cellWidth,
            height: cellHeight,
            pivotX: 0.5,
            pivotY: 0.5,
            filter: 'nearest',
            trim: false,
            atlas: stem.split('/').at(-1) ?? '',
          }),
          width: 0,
          height: 0,
        }),
      );
  if (!regions.length) throw new Error('Slice size exceeds the image');
  return regions;
}

export function sliceSprite(
  model: EditorModel,
  selected: string | undefined,
  report: (message: string, error?: boolean) => void,
): void {
  const source = model.project.assets.find(
    (asset) => asset.id === selected && asset.kind === 'image',
  );
  if (!source) throw new Error('Select an image to slice');
  const dialog = node('dialog', 'settings'),
    width = input('Cell width', String(source.width), 'number'),
    height = input('Cell height', String(source.height), 'number'),
    error = node('p', 'error');
  dialog.append(
    node('h2', '', `Slice ${source.path}`),
    width.row,
    height.row,
    node(
      'p',
      'settings-note',
      'Creates reusable region assets. Source pixels remain stored once in the original image.',
    ),
    error,
    button('Create regions', () => {
      try {
        const regions = sliceRegions(
          source,
          width.input.valueAsNumber,
          height.input.valueAsNumber,
        );
        model.change('Slice sprite', () => {
          model.project.assets.push(...regions);
        });
        report(`Created ${regions.length} sprite region(s)`);
        dialog.close();
      } catch (cause) {
        error.textContent = String(cause);
      }
    }),
    button('Cancel', () => dialog.close()),
  );
  dialog.onclose = () => dialog.remove();
  document.body.append(dialog);
  dialog.showModal();
}
