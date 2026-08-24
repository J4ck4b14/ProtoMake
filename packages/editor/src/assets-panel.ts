import {
  AssetDatabase,
  assetReferences,
  importFile,
  type AssetData,
} from '@protomake/assets';
import { SpriteRenderer } from '@protomake/renderer';
import { PixiRenderer } from '@protomake/renderer/pixi';
import { EditorModel } from './model';
import type { SceneViewport } from './viewport';
import { node, button, ask } from './dom';
export class AssetsPanel {
  private selected: string | undefined;
  constructor(
    private readonly host: HTMLElement,
    private readonly model: EditorModel,
    private readonly report: (message: string, error?: boolean) => void,
  ) {
    model.onChange(() => this.render());
    this.render();
  }
  private run(action: () => void): void {
    try {
      action();
    } catch (error) {
      this.report(String(error), true);
    }
  }
  private async import(files: FileList | null): Promise<void> {
    if (!files || this.model.locked) return;
    try {
      const imported: AssetData[] = [];
      for (const file of files) imported.push(await importFile(file));
      this.model.change('Import assets', () => {
        const database = new AssetDatabase(this.model.project.assets);
        for (const asset of imported) database.import(asset);
        this.model.project.assets = database.all();
      });
      this.report(`Imported ${imported.length} asset(s)`);
    } catch (error) {
      this.report(String(error), true);
    }
  }
  render(): void {
    this.host.replaceChildren(node('h2', '', 'Assets'));
    const file = node('input');
    file.type = 'file';
    file.multiple = true;
    file.accept = '.png,.jpg,.jpeg,.webp,.json,.txt,.ts';
    file.hidden = true;
    file.onchange = () => void this.import(file.files);
    const actions = node('div', 'actions');
    actions.append(
      button('Import files', () => file.click()),
      button('Place sprite', () =>
        this.run(() => {
          const asset = this.model.project.assets.find(
            (a) => a.id === this.selected,
          );
          if (!asset || asset.kind !== 'image')
            throw new Error('Select an image asset first');
          this.model.change('Place sprite', () => {
            const id = this.model.world.create(asset.path.split('/').at(-1)!);
            this.model.world.add(id, SpriteRenderer.type, {
              ...SpriteRenderer.defaults(),
              texture: asset.id,
              width: asset.width,
              height: asset.height,
            });
            this.model.selection.clear();
            this.model.selection.add(this.model.world.get(id).guid);
          });
        }),
      ),
      button('Move / rename', () => {
        void (async () => {
          const asset = this.model.project.assets.find(
            (a) => a.id === this.selected,
          );
          if (!asset) return;
          const path = await ask('Asset path', asset.path);
          if (path)
            this.run(() =>
              this.model.change('Move asset', () => {
                const database = new AssetDatabase(this.model.project.assets);
                database.move(asset.id, path);
                this.model.project.assets = database.all();
              }),
            );
        })().catch((error) => this.report(String(error), true));
      }),
      button('Delete asset', () =>
        this.run(() => {
          if (!this.selected) return;
          this.model.change('Delete asset', () => {
            const database = new AssetDatabase(this.model.project.assets);
            database.delete(
              this.selected!,
              assetReferences(this.model.project.scenes, this.model.registry),
            );
            this.model.project.assets = database.all();
            this.selected = undefined;
          });
        }),
      ),
    );
    const list = node('div', 'asset-list');
    for (const asset of this.model.project.assets) {
      const b = button(asset.path, () => {
        this.selected = asset.id;
        this.render();
      });
      b.classList.toggle('selected', this.selected === asset.id);
      if (asset.kind === 'image') {
        const image = node('img');
        image.src = asset.data;
        image.alt = '';
        b.prepend(image);
      }
      list.append(b);
    }
    this.host.append(actions, list, file);
    if (this.model.locked)
      for (const b of this.host.querySelectorAll('button')) b.disabled = true;
  }
}
export async function attachRenderer(
  area: HTMLElement,
  viewport: SceneViewport,
  model: EditorModel,
  report: (message: string, error?: boolean) => void,
): Promise<void> {
  const canvas = node('canvas', 'render-canvas');
  area.prepend(canvas);
  const renderer = await PixiRenderer.create(canvas, true);
  let assetSignature = '';
  viewport.drawEntity = (_context, id) =>
    model.world.components(model.entity(id)).has(SpriteRenderer.type);
  viewport.entityBounds = (id) => {
    const data = model.world.read(model.entity(id), SpriteRenderer);
    return data
      ? {
          width: data.width,
          height: data.height,
          offsetX: (0.5 - data.anchorX) * data.width * (data.flipX ? -1 : 1),
          offsetY: (0.5 - data.anchorY) * data.height * (data.flipY ? -1 : 1),
        }
      : { width: 48, height: 48 };
  };
  viewport.onViewChange = () => {
    const view = viewport.view;
    renderer.resize(view.width, view.height);
    renderer.render(model.world, view);
  };
  const sync = () => {
    const signature = JSON.stringify(model.project.assets);
    if (signature !== assetSignature) {
      assetSignature = signature;
      void renderer
        .setAssets(model.project.assets)
        .then(() => viewport.draw())
        .catch((error) => report(String(error), true));
    }
    viewport.draw();
  };
  model.onChange(sync);
  sync();
}
