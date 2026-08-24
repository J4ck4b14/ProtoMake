import {
  Application,
  Container,
  Sprite,
  Texture,
  Matrix,
  Graphics,
} from 'pixi.js';
import { loadImage, type AssetData } from '@protomake/assets';
import type { World } from '@protomake/core';
import { Camera2D } from './components';
import { renderList } from './order';
import type { Renderer2D, View } from './adapter';
export class PixiRenderer implements Renderer2D {
  private readonly root = new Container();
  private readonly mask = new Graphics();
  private readonly sprites = new Map<string, Sprite>();
  private readonly textures = new Map<
    string,
    { data: string; texture: Texture }
  >();
  private width = 1;
  private height = 1;
  private disposed = false;
  private revision = 0;
  private constructor(
    private readonly app: Application,
    private readonly transparent: boolean,
  ) {
    app.stage.addChild(this.root);
    app.stage.addChild(this.mask);
    this.root.mask = this.mask;
  }
  static async create(
    canvas: HTMLCanvasElement,
    transparent = false,
  ): Promise<PixiRenderer> {
    const app = new Application();
    await app.init({
      canvas,
      width: 1,
      height: 1,
      antialias: true,
      autoStart: false,
      preference: 'webgl',
      backgroundAlpha: transparent ? 0 : 1,
      resolution: Math.min(devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    return new PixiRenderer(app, transparent);
  }
  async setAssets(assets: readonly AssetData[]): Promise<void> {
    const revision = ++this.revision;
    const images = assets.filter((a) => a.kind === 'image');
    for (const [id, cached] of this.textures)
      if (!images.some((a) => a.id === id && a.data === cached.data)) {
        cached.texture.destroy(true);
        this.textures.delete(id);
      }
    await Promise.all(
      images.map(async (asset) => {
        if (this.textures.has(asset.id)) return;
        const image = await loadImage(asset.data);
        if (this.disposed || revision !== this.revision) return;
        this.textures.set(asset.id, {
          data: asset.data,
          texture: Texture.from(image),
        });
      }),
    );
  }
  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.app.renderer.resize(this.width, this.height);
  }
  render(world: World, view?: View): void {
    if (this.disposed) return;
    let x = view?.x ?? 0,
      y = view?.y ?? 0,
      zoom = view?.zoom ?? 1;
    let vx = 0,
      vy = 0,
      vw = this.width,
      vh = this.height,
      rotation = 0;
    if (!view) {
      const cameras = [...world.query(Camera2D.type)]
        .map(([id]) => ({ id, data: world.read(id, Camera2D)! }))
        .filter((c) => world.isActive(c.id))
        .sort(
          (a, b) =>
            b.data.priority - a.data.priority ||
            world.get(a.id).guid.localeCompare(world.get(b.id).guid),
        );
      const camera = cameras[0];
      if (camera) {
        const m = world.worldMatrix(camera.id);
        x = m[4];
        y = m[5];
        rotation = Math.atan2(m[1], m[0]);
        zoom = camera.data.zoom;
        vx = camera.data.viewportX * this.width;
        vy = camera.data.viewportY * this.height;
        vw = camera.data.viewportWidth * this.width;
        vh = camera.data.viewportHeight * this.height;
        this.app.renderer.background.color = camera.data.background;
      }
    }
    if (this.transparent) this.app.renderer.background.alpha = 0;
    const cosine = Math.cos(-rotation) * zoom,
      sine = Math.sin(-rotation) * zoom;
    this.root.setFromMatrix(
      new Matrix(
        cosine,
        sine,
        -sine,
        cosine,
        vx + vw / 2 - cosine * x + sine * y,
        vy + vh / 2 - sine * x - cosine * y,
      ),
    );
    this.mask.clear().rect(vx, vy, vw, vh).fill(0xffffff);
    const seen = new Set<string>(),
      ordered = renderList(world);
    for (const { id, guid, data } of ordered) {
      seen.add(guid);
      let sprite = this.sprites.get(guid);
      if (!sprite) {
        sprite = new Sprite();
        this.sprites.set(guid, sprite);
        this.root.addChild(sprite);
      }
      sprite.texture = data.texture
        ? (this.textures.get(data.texture)?.texture ?? Texture.WHITE)
        : Texture.WHITE;
      sprite.visible = world.isActive(id) && data.visible;
      sprite.tint =
        data.texture && !this.textures.has(data.texture) ? 0xff00ff : data.tint;
      sprite.alpha = data.opacity;
      sprite.anchor.set(data.anchorX, data.anchorY);
      const m = world.worldMatrix(id),
        sx = (data.width / sprite.texture.width) * (data.flipX ? -1 : 1),
        sy = (data.height / sprite.texture.height) * (data.flipY ? -1 : 1);
      sprite.setFromMatrix(
        new Matrix(m[0] * sx, m[1] * sx, m[2] * sy, m[3] * sy, m[4], m[5]),
      );
      this.root.setChildIndex(sprite, this.root.children.length - 1);
    }
    for (const [id, sprite] of this.sprites)
      if (!seen.has(id)) {
        sprite.destroy();
        this.sprites.delete(id);
      }
    this.app.render();
  }
  destroy(): void {
    this.disposed = true;
    this.revision++;
    this.app.destroy(false, { children: true });
    for (const cached of this.textures.values()) cached.texture.destroy(true);
    this.textures.clear();
    this.sprites.clear();
  }
}
