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
import {
  Camera2D,
  SpriteRenderer,
  LIGHTING_CHANNELS,
  channelEnabled,
  type LightingChannel,
} from './components';
import {
  sceneLights,
  sceneShadowCasters,
  type LightSample,
  type ShadowCaster,
} from './lighting';
import { renderList } from './order';
import type { Renderer2D, View } from './adapter';

type ScreenMatrix = readonly [number, number, number, number, number, number];

export interface LightingStats {
  lights: number;
  staticLights: number;
  mixedLights: number;
  dynamicLights: number;
  casters: number;
  shadowCasterTests: number;
  staticCacheHits: number;
  staticCacheMisses: number;
  channelsRendered: number;
  renderMs: number;
}

interface LightSurface {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  staticCanvas: HTMLCanvasElement;
  staticContext: CanvasRenderingContext2D;
  staticKey: string;
}

const emptyStats = (): LightingStats => ({
  lights: 0,
  staticLights: 0,
  mixedLights: 0,
  dynamicLights: 0,
  casters: 0,
  shadowCasterTests: 0,
  staticCacheHits: 0,
  staticCacheMisses: 0,
  channelsRendered: 0,
  renderMs: 0,
});

const rgba = (hex: string, alpha: number) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${Math.min(1, Math.max(0, alpha))})`;
};

function transformPoint(
  m: ScreenMatrix,
  p: readonly [number, number],
): [number, number] {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}

function pointInPolygon(
  x: number,
  y: number,
  points: readonly [number, number][],
): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!,
      [xj, yj] = points[j]!;
    if (
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi
    )
      inside = !inside;
  }
  return inside;
}

function convexHull(points: readonly [number, number][]): [number, number][] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length <= 2) return sorted;
  const cross = (
    a: readonly [number, number],
    b: readonly [number, number],
    c: readonly [number, number],
  ) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = (source: readonly [number, number][]) => {
    const result: [number, number][] = [];
    for (const p of source) {
      while (result.length >= 2 && cross(result.at(-2)!, result.at(-1)!, p) <= 0)
        result.pop();
      result.push(p);
    }
    return result;
  };
  const lower = half(sorted), upper = half([...sorted].reverse());
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function spritePolygon(world: World, id: number): readonly [number, number][] | undefined {
  const data = world.read(id, SpriteRenderer);
  if (!data) return undefined;
  const m = world.worldMatrix(id),
    x0 = -data.anchorX * data.width,
    y0 = -data.anchorY * data.height,
    x1 = x0 + data.width,
    y1 = y0 + data.height;
  const p = (x: number, y: number): [number, number] => [
    m[0] * x + m[2] * y + m[4],
    m[1] * x + m[3] * y + m[5],
  ];
  return [p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1)];
}

function canvasContext(canvas: HTMLCanvasElement, message: string): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error(message);
  return context;
}

export class PixiRenderer implements Renderer2D {
  private readonly root = new Container();
  private readonly debugLines = new Graphics();
  private readonly mask = new Graphics();
  private readonly sprites = new Map<string, Sprite>();
  private readonly textures = new Map<string, { data: string; texture: Texture }>();
  private readonly lightSurfaces = new Map<LightingChannel, LightSurface>();
  private readonly perLightCanvas: HTMLCanvasElement;
  private readonly perLightContext: CanvasRenderingContext2D;
  private readonly frozenLights = new Map<string, LightSample>();
  private frozenStaticCasters: readonly ShadowCaster[] | undefined;
  private width = 1;
  private height = 1;
  private disposed = false;
  private readonly baseCanvas: HTMLCanvasElement;
  private revision = 0;
  private statsValue = emptyStats();

  private constructor(
    private readonly app: Application,
    private readonly transparent: boolean,
    canvas: HTMLCanvasElement,
  ) {
    this.baseCanvas = canvas;
    app.stage.addChild(this.root);
    this.root.addChild(this.debugLines);
    app.stage.addChild(this.mask);
    this.root.mask = this.mask;

    const parent = canvas.parentElement;
    if (parent) {
      const position = getComputedStyle(parent).position;
      if (position === 'static') parent.style.position = 'relative';
    }
    for (const channel of LIGHTING_CHANNELS) {
      const surface = document.createElement('canvas'),
        staticCanvas = document.createElement('canvas');
      surface.className = 'protomake-light-surface';
      surface.dataset.channel = channel;
      surface.setAttribute('aria-hidden', 'true');
      Object.assign(surface.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        pointerEvents: 'none',
        mixBlendMode: 'multiply',
        transformOrigin: 'top left',
      });
      parent?.insertBefore(surface, canvas.nextSibling);
      this.lightSurfaces.set(channel, {
        canvas: surface,
        context: canvasContext(surface, `Lighting Canvas 2D unavailable for ${channel}`),
        staticCanvas,
        staticContext: canvasContext(staticCanvas, `Static lighting buffer unavailable for ${channel}`),
        staticKey: '',
      });
    }
    this.perLightCanvas = document.createElement('canvas');
    this.perLightContext = canvasContext(this.perLightCanvas, 'Lighting buffer unavailable');
  }

  static async create(canvas: HTMLCanvasElement, transparent = false): Promise<PixiRenderer> {
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
    return new PixiRenderer(app, transparent, canvas);
  }

  get lightingStats(): Readonly<LightingStats> {
    return { ...this.statsValue };
  }

  async setAssets(assets: readonly AssetData[]): Promise<void> {
    const revision = ++this.revision,
      images = assets.filter((asset) => asset.kind === 'image');
    for (const [id, cached] of this.textures)
      if (!images.some((asset) => asset.id === id && asset.data === cached.data)) {
        cached.texture.destroy(true);
        this.textures.delete(id);
      }
    await Promise.all(
      images.map(async (asset) => {
        if (this.textures.has(asset.id)) return;
        const image = await loadImage(asset.data);
        if (this.disposed || revision !== this.revision) return;
        this.textures.set(asset.id, { data: asset.data, texture: Texture.from(image) });
      }),
    );
  }

  resize(width: number, height: number): void {
    if (this.width === Math.max(1, width) && this.height === Math.max(1, height)) return;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.app.renderer.resize(this.width, this.height);
    this.invalidateStaticLighting();
    const ratio = Math.min(devicePixelRatio || 1, 2),
      pixelWidth = Math.max(1, Math.round(this.width * ratio)),
      pixelHeight = Math.max(1, Math.round(this.height * ratio));
    for (const surface of this.lightSurfaces.values()) {
      for (const canvas of [surface.canvas, surface.staticCanvas]) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      surface.canvas.style.width = `${this.width}px`;
      surface.canvas.style.height = `${this.height}px`;
      surface.canvas.style.left = `${this.baseCanvas.offsetLeft}px`;
      surface.canvas.style.top = `${this.baseCanvas.offsetTop}px`;
    }
    this.perLightCanvas.width = pixelWidth;
    this.perLightCanvas.height = pixelHeight;
  }

  /** Editor authoring calls this after project changes; runtime intentionally does not. */
  invalidateStaticLighting(): void {
    this.frozenLights.clear();
    this.frozenStaticCasters = undefined;
    for (const surface of this.lightSurfaces.values()) surface.staticKey = '';
  }

  private resolvedLight(light: LightSample): LightSample {
    if (light.data.mobility === 'dynamic' || !light.id) return light;
    let frozen = this.frozenLights.get(light.id);
    if (!frozen) {
      frozen = {
        id: light.id,
        x: light.x,
        y: light.y,
        angle: light.angle,
        data: structuredClone(light.data),
      };
      this.frozenLights.set(light.id, frozen);
    }
    return frozen;
  }

  private lightGradient(
    context: CanvasRenderingContext2D,
    light: LightSample,
    screen: ScreenMatrix,
    zoom: number,
  ): void {
    const center = transformPoint(screen, [light.x, light.y]),
      radius = Math.max(1, light.data.range * zoom),
      gradient = context.createRadialGradient(center[0], center[1], 0, center[0], center[1], radius),
      steps = 10;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps,
        alpha = light.data.intensity * Math.pow(1 - t, light.data.falloff);
      gradient.addColorStop(t, rgba(light.data.color, alpha));
    }
    context.fillStyle = gradient;
    if (light.data.kind === 'spot') {
      const half = (light.data.outerAngle * Math.PI) / 360,
        direction = light.angle + Math.atan2(screen[1], screen[0]);
      context.beginPath();
      context.moveTo(center[0], center[1]);
      context.arc(center[0], center[1], radius, direction - half, direction + half);
      context.closePath();
      context.fill();
    } else {
      context.fillRect(center[0] - radius, center[1] - radius, radius * 2, radius * 2);
    }
  }

  private areaLight(
    context: CanvasRenderingContext2D,
    light: LightSample,
    screen: ScreenMatrix,
  ): void {
    const steps = 12;
    context.save();
    context.transform(...screen);
    context.translate(light.x, light.y);
    context.rotate(light.angle);
    context.globalCompositeOperation = 'lighter';
    for (let i = steps; i >= 0; i--) {
      const t = i / steps,
        expand = light.data.range * t,
        alpha = (light.data.intensity / (steps + 1)) * Math.pow(1 - t, light.data.falloff);
      context.fillStyle = rgba(light.data.color, alpha);
      context.fillRect(
        -light.data.width / 2 - expand,
        -light.data.height / 2 - expand,
        light.data.width + expand * 2,
        light.data.height + expand * 2,
      );
    }
    context.restore();
  }

  private eraseShadows(
    context: CanvasRenderingContext2D,
    light: LightSample,
    casters: readonly ShadowCaster[],
    channel: LightingChannel,
    screen: ScreenMatrix,
    zoom: number,
  ): void {
    if (light.data.kind === 'ambient' || !light.data.castShadows || light.data.shadowOpacity <= 0)
      return;
    context.save();
    context.globalCompositeOperation = 'destination-out';
    context.globalAlpha = light.data.shadowOpacity;
    const softness = Math.min(32, light.data.shadowSoftness * Math.max(0.25, zoom));
    if (softness > 0) context.filter = `blur(${softness}px)`;
    const reach = Math.max(
      light.data.range * 1.4,
      Math.hypot(this.width, this.height) / Math.max(zoom, 0.01),
    );
    for (const caster of casters) {
      if (!channelEnabled(caster.channelMask, channel)) continue;
      this.statsValue.shadowCasterTests++;
      const points = caster.points;
      if (pointInPolygon(light.x, light.y, points)) continue;
      const biased: [number, number][] = [], projected: [number, number][] = [];
      for (const p of points) {
        const dx = p[0] - light.x,
          dy = p[1] - light.y,
          length = Math.hypot(dx, dy) || 1,
          ux = dx / length,
          uy = dy / length,
          start: [number, number] = [
            p[0] + ux * light.data.shadowBias,
            p[1] + uy * light.data.shadowBias,
          ];
        biased.push(start);
        projected.push([start[0] + ux * reach, start[1] + uy * reach]);
      }
      const hull = convexHull([...biased, ...projected]).map((point) => transformPoint(screen, point));
      if (hull.length < 3) continue;
      context.beginPath();
      context.moveTo(hull[0]![0], hull[0]![1]);
      for (let i = 1; i < hull.length; i++) context.lineTo(hull[i]![0], hull[i]![1]);
      context.closePath();
      context.fill();
    }
    context.restore();
  }

  private drawLightContribution(
    destination: CanvasRenderingContext2D,
    light: LightSample,
    casters: readonly ShadowCaster[],
    channel: LightingChannel,
    screen: ScreenMatrix,
    zoom: number,
    vx: number,
    vy: number,
    vw: number,
    vh: number,
  ): void {
    const ratio = Math.min(devicePixelRatio || 1, 2), layer = this.perLightContext;
    layer.setTransform(ratio, 0, 0, ratio, 0, 0);
    layer.clearRect(0, 0, this.width, this.height);
    layer.save();
    layer.beginPath();
    layer.rect(vx, vy, vw, vh);
    layer.clip();
    layer.globalCompositeOperation = 'source-over';
    if (light.data.kind === 'ambient') {
      layer.fillStyle = rgba(light.data.color, light.data.intensity);
      layer.fillRect(vx, vy, vw, vh);
    } else if (light.data.kind === 'area') this.areaLight(layer, light, screen);
    else this.lightGradient(layer, light, screen, zoom);
    this.eraseShadows(layer, light, casters, channel, screen, zoom);
    layer.restore();
    destination.save();
    destination.globalCompositeOperation = 'lighter';
    destination.drawImage(this.perLightCanvas, 0, 0, this.width, this.height);
    destination.restore();
  }

  private staticCacheKey(
    channel: LightingChannel,
    screen: ScreenMatrix,
    vx: number,
    vy: number,
    vw: number,
    vh: number,
    staticLights: readonly LightSample[],
  ): string {
    return JSON.stringify([
      channel,
      ...screen.map((value) => Math.round(value * 1000) / 1000),
      vx, vy, vw, vh,
      staticLights.map((light) => [light.id, light.x, light.y, light.angle, light.data]),
    ]);
  }

  private applyReceiverMask(
    context: CanvasRenderingContext2D,
    world: World,
    channel: LightingChannel,
    screen: ScreenMatrix,
  ): boolean {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    context.save();
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.globalCompositeOperation = 'destination-in';
    context.fillStyle = '#ffffff';
    let receivers = 0;
    for (const [id] of world.query(SpriteRenderer.type)) {
      const data = world.read(id, SpriteRenderer)!;
      if (!world.isActive(id) || !data.visible || !data.lit || data.lightingChannel !== channel) continue;
      const polygon = spritePolygon(world, id);
      if (!polygon) continue;
      const points = polygon.map((point) => transformPoint(screen, point));
      context.beginPath();
      context.moveTo(points[0]![0], points[0]![1]);
      for (let i = 1; i < points.length; i++) context.lineTo(points[i]![0], points[i]![1]);
      context.closePath();
      context.fill();
      receivers++;
    }
    context.restore();
    return receivers > 0;
  }

  private surfaceLighting(
    world: World,
    screen: ScreenMatrix,
    zoom: number,
    vx: number,
    vy: number,
    vw: number,
    vh: number,
  ): void {
    const started = performance.now(),
      lights = sceneLights(world),
      casters = sceneShadowCasters(world),
      ratio = Math.min(devicePixelRatio || 1, 2);
    this.statsValue = {
      ...emptyStats(),
      lights: lights.length,
      staticLights: lights.filter((light) => light.data.mobility === 'static').length,
      mixedLights: lights.filter((light) => light.data.mobility === 'mixed').length,
      dynamicLights: lights.filter((light) => light.data.mobility === 'dynamic').length,
      casters: casters.length,
    };
    for (const surface of this.lightSurfaces.values()) {
      surface.context.setTransform(ratio, 0, 0, ratio, 0, 0);
      surface.context.clearRect(0, 0, this.width, this.height);
    }
    if (!lights.length) {
      this.statsValue.renderMs = performance.now() - started;
      return; // Exact legacy appearance when a scene has no lights.
    }
    if (lights.some((light) => light.data.mobility === 'static') && !this.frozenStaticCasters)
      this.frozenStaticCasters = structuredClone(casters);

    const resolved = lights.map((light) => this.resolvedLight(light));
    for (const channel of LIGHTING_CHANNELS) {
      const surface = this.lightSurfaces.get(channel)!,
        affecting = resolved.filter((light) => channelEnabled(light.data.channelMask, channel));
      // A channel with no receivers should not cost shadow work or add an overlay.
      if (![...world.query(SpriteRenderer.type)].some(([id]) => {
        const sprite = world.read(id, SpriteRenderer)!;
        return world.isActive(id) && sprite.visible && sprite.lit && sprite.lightingChannel === channel;
      })) continue;
      this.statsValue.channelsRendered++;
      const target = surface.context;
      target.setTransform(ratio, 0, 0, ratio, 0, 0);
      target.fillStyle = '#000000';
      target.fillRect(vx, vy, vw, vh);

      const staticLights = affecting.filter((light) => light.data.mobility === 'static'),
        staticKey = this.staticCacheKey(channel, screen, vx, vy, vw, vh, staticLights);
      if (surface.staticKey !== staticKey) {
        this.statsValue.staticCacheMisses++;
        surface.staticKey = staticKey;
        const cache = surface.staticContext;
        cache.setTransform(ratio, 0, 0, ratio, 0, 0);
        cache.clearRect(0, 0, this.width, this.height);
        for (const light of staticLights)
          this.drawLightContribution(
            cache,
            light,
            this.frozenStaticCasters ?? casters,
            channel,
            screen,
            zoom,
            vx,
            vy,
            vw,
            vh,
          );
      } else if (staticLights.length) this.statsValue.staticCacheHits++;
      if (staticLights.length) {
        target.save();
        target.globalCompositeOperation = 'lighter';
        target.drawImage(surface.staticCanvas, 0, 0, this.width, this.height);
        target.restore();
      }
      for (const light of affecting)
        if (light.data.mobility !== 'static')
          this.drawLightContribution(target, light, casters, channel, screen, zoom, vx, vy, vw, vh);
      this.applyReceiverMask(target, world, channel, screen);
    }
    this.statsValue.renderMs = performance.now() - started;
  }

  render(world: World, view?: View): void {
    if (this.disposed) return;
    let x = view?.x ?? 0, y = view?.y ?? 0, zoom = view?.zoom ?? 1;
    let vx = 0, vy = 0, vw = this.width, vh = this.height, rotation = 0;
    if (!view) {
      const cameras = [...world.query(Camera2D.type)]
        .map(([id]) => ({ id, data: world.read(id, Camera2D)! }))
        .filter((camera) => world.isActive(camera.id))
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
      sine = Math.sin(-rotation) * zoom,
      screen: ScreenMatrix = [
        cosine,
        sine,
        -sine,
        cosine,
        vx + vw / 2 - cosine * x + sine * y,
        vy + vh / 2 - sine * x - cosine * y,
      ];
    this.root.setFromMatrix(new Matrix(...screen));
    this.mask.clear().rect(vx, vy, vw, vh).fill(0xffffff);
    const seen = new Set<string>(), ordered = renderList(world);
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
      sprite.tint = data.texture && !this.textures.has(data.texture) ? 0xff00ff : data.tint;
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
    this.root.setChildIndex(this.debugLines, this.root.children.length - 1);
    this.app.render();
    this.surfaceLighting(world, screen, zoom, vx, vy, vw, vh);
  }

  setDebugLines(vertices: Float32Array, colors: Float32Array): void {
    this.debugLines.clear();
    for (let i = 0; i < vertices.length; i += 4) {
      const offset = i * 2;
      this.debugLines
        .moveTo(vertices[i]!, vertices[i + 1]!)
        .lineTo(vertices[i + 2]!, vertices[i + 3]!)
        .stroke({
          width: 1.5,
          color:
            (((colors[offset] ?? 0) * 255) << 16) |
            (((colors[offset + 1] ?? 1) * 255) << 8) |
            ((colors[offset + 2] ?? 0) * 255),
          alpha: 0.9,
        });
    }
  }

  destroy(): void {
    this.disposed = true;
    this.revision++;
    this.invalidateStaticLighting();
    for (const surface of this.lightSurfaces.values()) surface.canvas.remove();
    this.lightSurfaces.clear();
    this.app.destroy(false, { children: true });
    for (const cached of this.textures.values()) cached.texture.destroy(true);
    this.textures.clear();
    this.sprites.clear();
  }
}
