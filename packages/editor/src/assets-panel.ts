import { editMedia, attachMedia } from './media-editor';
import { CLIP_MIME, CONTROLLER_MIME } from '@protomake/animation';
import { PREFAB_MIME } from '@protomake/prefabs';
import { createPrefab, placePrefab, editPrefab } from './prefab-actions';
import { editData } from './data-editor';
import { folders, createFolder, moveFolder, deleteFolder } from './folders';
import {
  AssetDatabase,
  assetReferences,
  importFile,
  type AssetData,
} from '@protomake/assets';
import { SpriteRenderer, renderList } from '@protomake/renderer';
import { compileProjectScripts } from '@protomake/scripting/compiler';
import { PixiRenderer } from '@protomake/renderer/pixi';
import { EditorModel } from './model';
import type { SceneViewport } from './viewport';
import { node, button, ask } from './dom';
import { showScripts } from './scripts-panel';
export class AssetsPanel {
  private folder = 'Assets';
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
      for (const file of files) {
        const asset = await importFile(file);
        asset.path = [this.folder, file.name].filter(Boolean).join('/');
        imported.push(asset);
      }
      this.model.change('Import assets', () => {
        const database = new AssetDatabase(this.model.project.assets);
        for (const asset of imported) database.import(asset);
        this.model.project.assets = database.all();
        compileProjectScripts(this.model.project.assets);
      });
      this.report(`Imported ${imported.length} asset(s)`);
    } catch (error) {
      this.report(String(error), true);
    }
  }
  private moveAsset(id: string, folder: string): void {
    this.model.change('Move asset', () => {
      const db = new AssetDatabase(this.model.project.assets);
      const asset = db.get(id);
      if (!asset) throw new Error('Missing asset');
      db.move(id, folder + '/' + asset.path.split('/').at(-1));
      this.model.project.assets = db.all();
      compileProjectScripts(this.model.project.assets);
    });
  }
  render(): void {
    this.host.replaceChildren(node('h2', '', 'Assets'));
    const file = node('input');
    file.type = 'file';
    file.multiple = true;
    file.accept = '.png,.jpg,.jpeg,.webp,.json,.txt,.ts,.wav,.mp3,.ogg';
    file.hidden = true;
    file.onchange = () => void this.import(file.files);
    const nav = node('div', 'folder-nav'),
      select = node('select');
    select.setAttribute('aria-label', 'Asset folder');
    select.append(new Option('Project root', ''));
    for (const path of folders(this.model))
      select.append(new Option(path, path));
    select.value = this.folder;
    if (select.selectedIndex < 0) {
      this.folder = '';
      select.value = '';
    }
    select.onchange = () => {
      this.folder = select.value;
      this.selected = undefined;
      this.render();
    };
    const query = async (
      label: string,
      value: string,
      action: (path: string) => void,
    ) => {
      try {
        const path = await ask(label, value);
        if (path) this.run(() => action(path));
      } catch (e) {
        this.report(String(e), true);
      }
    };
    nav.append(
      select,
      button(
        '+ Folder',
        () =>
          void query(
            'New folder path',
            this.folder ? this.folder + '/New folder' : 'New folder',
            (path) => createFolder(this.model, path),
          ),
      ),
      button(
        'Rename folder',
        () =>
          void query('Folder path', this.folder, (path) => {
            moveFolder(this.model, this.folder, path);
            this.folder = path;
            this.render();
          }),
      ),
      button('Delete folder', () =>
        this.run(() => {
          deleteFolder(this.model, this.folder);
          this.folder = '';
          this.render();
        }),
      ),
    );
    const actions = node('div', 'actions');
    actions.append(
      button('Import files', () => file.click()),
      button('+ Script', () => showScripts(this.model, this.report)),
      button('Edit script', () =>
        this.run(() => {
          const asset = this.model.project.assets.find(
            (a) => a.id === this.selected,
          );
          if (!asset || asset.mime !== 'text/typescript')
            throw new Error('Select a TypeScript asset');
          showScripts(this.model, this.report, asset.id);
        }),
      ),
      button('+ Animation clip', () =>
        this.run(() => editMedia(this.model, CLIP_MIME)),
      ),
      button('+ Animator', () =>
        this.run(() => editMedia(this.model, CONTROLLER_MIME)),
      ),
      button('Edit animation', () =>
        this.run(() => {
          const asset = this.model.project.assets.find(
            (a) => a.id === this.selected,
          );
          if (!asset || ![CLIP_MIME, CONTROLLER_MIME].includes(asset.mime))
            throw new Error('Select an animation clip or controller');
          editMedia(
            this.model,
            asset.mime as typeof CLIP_MIME | typeof CONTROLLER_MIME,
            asset.id,
          );
        }),
      ),
      button('Attach media', () =>
        this.run(() => attachMedia(this.model, this.selected ?? '')),
      ),
      button(
        'Create prefab',
        () =>
          void query(
            'Prefab path',
            `${this.folder || 'Assets'}/Entity.prefab.json`,
            (path) => createPrefab(this.model, path),
          ),
      ),
      button('Instantiate prefab', () =>
        this.run(() => placePrefab(this.model, this.selected ?? '')),
      ),
      button('Edit prefab base', () =>
        this.run(() => {
          const asset = this.model.project.assets.find(
            (a) => a.id === this.selected && a.mime === PREFAB_MIME,
          );
          if (!asset) throw new Error('Select a prefab asset');
          editData(
            'Prefab base',
            asset.path,
            JSON.parse(asset.data),
            (path, data) => {
              if (path !== asset.path)
                throw new Error('Use Move / rename to rename assets');
              editPrefab(this.model, asset.id, data);
            },
          );
        }),
      ),
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
                compileProjectScripts(this.model.project.assets);
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
            compileProjectScripts(this.model.project.assets);
            this.selected = undefined;
          });
        }),
      ),
    );
    const list = node('div', 'asset-list');
    const direct = folders(this.model).filter(
      (path) => path.split('/').slice(0, -1).join('/') === this.folder,
    );
    for (const path of direct) {
      const b = button('▸ ' + path.split('/').at(-1), () => {
        this.folder = path;
        this.render();
      });
      b.ondragover = (e) => e.preventDefault();
      b.ondrop = (e) => {
        e.preventDefault();
        const id = e.dataTransfer?.getData('application/x-protomake-asset');
        if (id) this.run(() => this.moveAsset(id, path));
      };
      list.append(b);
    }
    for (const asset of [...this.model.project.assets]
      .filter((a) => a.path.split('/').slice(0, -1).join('/') === this.folder)
      .sort((a, b) => a.path.localeCompare(b.path))) {
      const b = button(asset.path.split('/').at(-1)!, () => {
        this.selected = asset.id;
        for (const row of list.querySelectorAll('button'))
          row.classList.remove('selected');
        b.classList.add('selected');
      });
      b.ondblclick = () =>
        this.run(() => {
          if (asset.mime === 'text/typescript')
            showScripts(this.model, this.report, asset.id);
          else if (asset.mime === CLIP_MIME || asset.mime === CONTROLLER_MIME)
            editMedia(this.model, asset.mime, asset.id);
        });
      b.title =
        asset.path +
        (asset.mime === 'text/typescript' ||
        [CLIP_MIME, CONTROLLER_MIME].includes(asset.mime)
          ? ' · Double-click to edit'
          : '');
      b.draggable = !this.model.locked;
      b.ondragstart = (e) =>
        e.dataTransfer?.setData('application/x-protomake-asset', asset.id);
      b.classList.toggle('selected', this.selected === asset.id);
      if (asset.kind === 'image') {
        const image = node('img');
        image.src = asset.data;
        image.alt = '';
        b.prepend(image);
      }
      list.append(b);
    }
    this.host.append(nav, actions, list, file);
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
  let assetSignature = '',
    sceneSignature = '';
  viewport.lightingStats = () => renderer.lightingStats;
  viewport.entityOrder = () => [
    ...[...model.world.all()]
      .filter((e) => !model.world.components(e.id).has(SpriteRenderer.type))
      .map((e) => e.id),
    ...renderList(model.world).map((e) => e.id),
  ];
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
    const nextSceneSignature = JSON.stringify([model.sceneId, model.scene]);
    if (nextSceneSignature !== sceneSignature) {
      sceneSignature = nextSceneSignature;
      renderer.invalidateStaticLighting();
    }
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
