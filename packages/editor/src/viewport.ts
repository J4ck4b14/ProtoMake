import {
  Camera2D,
  Light2D,
  ShadowCaster2D,
  createLightingSampler,
  hasLineOfSight,
  SpriteRenderer,
  type LightingChannel,
} from '@protomake/renderer';
import {
  BoxCollider2D,
  CircleCollider2D,
  CapsuleCollider2D,
} from '@protomake/physics2d';
import type { LightingStats } from '@protomake/renderer/pixi';
import { Perception2D } from '@protomake/scripting';
import { compose, type Matrix2D } from '@protomake/core';
import { EditorModel, pivotDelta } from './model';
import { point, hitBox, bounds, snap, type Point } from './geometry';
export type Tool = 'select' | 'move' | 'rotate' | 'scale' | 'pan';
interface Pinch {
  ids: readonly [number, number];
  startDistance: number;
  startZoom: number;
  anchorWorld: Point;
}
interface Drag {
  kind: 'pan' | 'marquee' | 'move' | 'rotate' | 'scale' | 'light-range';
  start: Point;
  last: Point;
  origin: Point;
  axis: 'x' | 'y' | 'xy';
  original: Map<string, Matrix2D>;
  append: boolean;
  initialSelection: string[];
  lightId?: string;
  originalRange?: number;
}
export class SceneViewport {
  tool: Tool = 'move';
  zoom = 1;
  center: Point = [0, 0];
  snapping = true;
  spacing = 16;
  grid = true;
  showGizmos = true;
  showShadowCasters = true;
  showColliders = true;
  lightingDebug = false;
  lightingChannel: LightingChannel = 'World';
  lightingStats: (() => Readonly<LightingStats>) | undefined;
  private readonly pointers = new Map<number, Point>();
  private pinch: Pinch | undefined;
  private drag: Drag | undefined;
  private space = false;
  private context: CanvasRenderingContext2D;
  private observer: ResizeObserver;
  private width = 1;
  private height = 1;
  /** Optional renderer overlay integration; the editor owns navigation, not runtime camera state. */
  onViewChange: (() => void) | undefined;
  drawEntity:
    | ((
        context: CanvasRenderingContext2D,
        id: string,
        matrix: Matrix2D,
      ) => boolean)
    | undefined;
  entityOrder: (() => number[]) | undefined;
  entityBounds:
    | ((id: string) => {
        width: number;
        height: number;
        offsetX?: number;
        offsetY?: number;
      })
    | undefined;
  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly model: EditorModel,
    private readonly report: (error: unknown) => void,
  ) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D unavailable');
    this.context = context;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
    canvas.addEventListener('pointerdown', (e) =>
      this.safe(() => this.down(e)),
    );
    canvas.addEventListener('pointermove', (e) =>
      this.safe(() => this.move(e)),
    );
    canvas.addEventListener('pointerup', (e) => this.safe(() => this.up(e)));
    canvas.addEventListener('pointercancel', (e) =>
      this.safe(() => this.pointerCancel(e)),
    );
    canvas.addEventListener('lostpointercapture', () => {
      if (this.drag) this.cancel();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (this.drag) return;
        const screen = this.screen(e),
          before = this.toWorld(screen);
        this.zoom = Math.min(
          8,
          Math.max(0.1, this.zoom * Math.exp(-e.deltaY * 0.001)),
        );
        const after = this.toWorld(screen);
        this.center = [
          this.center[0] + before[0] - after[0],
          this.center[1] + before[1] - after[1],
        ];
        this.draw();
      },
      { passive: false },
    );
    canvas.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        this.space = true;
      }
      if (e.key === 'Escape') this.cancel();
    });
    canvas.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.space = false;
    });
    canvas.addEventListener('blur', () => {
      this.space = false;
      this.cancel();
    });
    model.onChange(() => this.draw());
  }
  private safe(operation: () => void): void {
    try {
      operation();
    } catch (error) {
      this.cancel();
      this.report(error);
    }
  }
  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    const ratio = devicePixelRatio || 1;
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    this.draw();
  }
  get view(): {
    x: number;
    y: number;
    zoom: number;
    width: number;
    height: number;
  } {
    return {
      x: this.center[0],
      y: this.center[1],
      zoom: this.zoom,
      width: this.width,
      height: this.height,
    };
  }
  toWorld(screen: Point): Point {
    return [
      (screen[0] - this.width / 2) / this.zoom + this.center[0],
      (screen[1] - this.height / 2) / this.zoom + this.center[1],
    ];
  }
  toScreen(world: Point): Point {
    return [
      (world[0] - this.center[0]) * this.zoom + this.width / 2,
      (world[1] - this.center[1]) * this.zoom + this.height / 2,
    ];
  }
  zoomBy(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.zoom = Math.min(8, Math.max(0.1, this.zoom * factor));
    this.draw();
  }
  private screen(e: MouseEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }
  private pivot(): Point {
    const selected = [...this.model.selection];
    if (!selected.length) return [0, 0];
    const positions = selected.map((id) =>
      this.model.world.worldPosition(this.model.entity(id)),
    );
    return [
      positions.reduce((a, p) => a + p[0], 0) / positions.length,
      positions.reduce((a, p) => a + p[1], 0) / positions.length,
    ];
  }
  private down(e: PointerEvent): void {
    if (this.model.locked) return;
    this.canvas.focus();
    if (e.button !== 0 && e.button !== 1) return;
    const screen = this.screen(e);
    if (e.pointerType === 'touch') {
      this.pointers.set(e.pointerId, screen);
      this.canvas.setPointerCapture(e.pointerId);
      if (this.pointers.size >= 2) {
        if (this.drag) this.cancel();
        const pair = [...this.pointers.entries()].slice(0, 2) as [
          [number, Point],
          [number, Point],
        ];
        const a = pair[0][1],
          b = pair[1][1],
          midpoint: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        this.pinch = {
          ids: [pair[0][0], pair[1][0]],
          startDistance: Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1])),
          startZoom: this.zoom,
          anchorWorld: this.toWorld(midpoint),
        };
        e.preventDefault();
        return;
      }
    }
    if (this.pinch) return;
    const position = this.toWorld(screen),
      origin = this.pivot(),
      pivot = this.toScreen(origin),
      dx = screen[0] - pivot[0],
      dy = screen[1] - pivot[1];
    let kind: Drag['kind'] | undefined,
      axis: Drag['axis'] = 'xy',
      lightId: string | undefined,
      originalRange: number | undefined;
    if (e.button === 1 || this.space || this.tool === 'pan') kind = 'pan';
    else if (this.model.selection.size === 1 && this.showGizmos) {
      const selectedId = [...this.model.selection][0]!,
        light = this.model.world.read(this.model.entity(selectedId), Light2D);
      if (light && (light.kind === 'point' || light.kind === 'spot')) {
        const matrix = this.model.world.worldMatrix(
            this.model.entity(selectedId),
          ),
          angle = Math.atan2(matrix[1], matrix[0]),
          handle = this.toScreen([
            origin[0] + Math.cos(angle) * light.range,
            origin[1] + Math.sin(angle) * light.range,
          ]);
        if (Math.hypot(screen[0] - handle[0], screen[1] - handle[1]) <= 12) {
          kind = 'light-range';
          lightId = selectedId;
          originalRange = light.range;
        }
      }
    }
    if (!kind && this.model.selection.size) {
      if (this.tool === 'move') {
        if (Math.abs(dy) < 9 && dx > 12 && dx < 80) {
          kind = 'move';
          axis = 'x';
        } else if (Math.abs(dx) < 9 && dy < -12 && dy > -80) {
          kind = 'move';
          axis = 'y';
        } else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) kind = 'move';
      }
      if (this.tool === 'rotate' && Math.abs(Math.hypot(dx, dy) - 64) < 10)
        kind = 'rotate';
      if (this.tool === 'scale') {
        if (Math.abs(dx - 64) < 10 && Math.abs(dy) < 10) {
          kind = 'scale';
          axis = 'x';
        } else if (Math.abs(dx) < 10 && Math.abs(dy + 64) < 10) {
          kind = 'scale';
          axis = 'y';
        } else if (Math.abs(dx - 64) < 10 && Math.abs(dy + 64) < 10)
          kind = 'scale';
      }
    }
    if (!kind) {
      const hit = this.ordered()
        .reverse()
        .find((entity) => {
          const size = this.entityBounds?.(entity.guid) ?? {
            width: 48,
            height: 48,
          };
          return hitBox(
            this.shapeMatrix(entity.guid),
            position,
            size.width,
            size.height,
          );
        });
      if (hit) {
        if (e.shiftKey || e.ctrlKey || e.metaKey) this.model.toggle(hit.guid);
        else this.model.select([hit.guid]);
        this.draw();
        return;
      }
      kind = 'marquee';
    }
    const original = new Map(
      this.model
        .roots()
        .map((id) => [id, this.model.world.worldMatrix(this.model.entity(id))]),
    );
    this.drag = {
      kind,
      start: screen,
      last: screen,
      origin,
      axis,
      original,
      append: e.shiftKey || e.ctrlKey || e.metaKey,
      initialSelection: [...this.model.selection],
      ...(lightId ? { lightId } : {}),
      ...(originalRange !== undefined ? { originalRange } : {}),
    };
    if (['move', 'rotate', 'scale', 'light-range'].includes(kind))
      this.model.beginGesture();
    this.canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  private move(e: PointerEvent): void {
    const screen = this.screen(e);
    if (e.pointerType === 'touch' && this.pointers.has(e.pointerId))
      this.pointers.set(e.pointerId, screen);
    if (this.pinch) {
      const a = this.pointers.get(this.pinch.ids[0]),
        b = this.pointers.get(this.pinch.ids[1]);
      if (!a || !b) return;
      const midpoint: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
        distance = Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1]));
      this.zoom = Math.min(
        8,
        Math.max(
          0.1,
          (this.pinch.startZoom * distance) / this.pinch.startDistance,
        ),
      );
      this.center = [
        this.pinch.anchorWorld[0] - (midpoint[0] - this.width / 2) / this.zoom,
        this.pinch.anchorWorld[1] - (midpoint[1] - this.height / 2) / this.zoom,
      ];
      this.draw();
      e.preventDefault();
      return;
    }
    const drag = this.drag;
    if (!drag) return;
    if (drag.kind === 'pan') {
      this.center = [
        this.center[0] - (screen[0] - drag.last[0]) / this.zoom,
        this.center[1] - (screen[1] - drag.last[1]) / this.zoom,
      ];
    } else if (drag.kind === 'move') {
      let dx = (screen[0] - drag.start[0]) / this.zoom,
        dy = (screen[1] - drag.start[1]) / this.zoom;
      if (this.snapping && !e.altKey) {
        dx = snap(drag.origin[0] + dx, this.spacing) - drag.origin[0];
        dy = snap(drag.origin[1] + dy, this.spacing) - drag.origin[1];
      }
      if (drag.axis === 'x') dy = 0;
      if (drag.axis === 'y') dx = 0;
      this.model.transformSelection(compose(dx, dy), drag.original);
    } else if (drag.kind === 'rotate') {
      const pivot = this.toScreen(drag.origin);
      let angle =
        Math.atan2(screen[1] - pivot[1], screen[0] - pivot[0]) -
        Math.atan2(drag.start[1] - pivot[1], drag.start[0] - pivot[0]);
      if (this.snapping && !e.altKey) angle = snap(angle, Math.PI / 12);
      this.model.transformSelection(
        pivotDelta(...drag.origin, angle),
        drag.original,
      );
    } else if (drag.kind === 'scale') {
      let sx = Math.max(0.05, 1 + (screen[0] - drag.start[0]) / 64),
        sy = Math.max(0.05, 1 - (screen[1] - drag.start[1]) / 64);
      if (drag.axis === 'x') sy = 1;
      else if (drag.axis === 'y') sx = 1;
      else sy = sx;
      if (this.snapping && !e.altKey) {
        sx = Math.max(0.1, snap(sx, 0.1));
        sy = Math.max(0.1, snap(sy, 0.1));
      }
      this.model.transformSelection(
        pivotDelta(...drag.origin, 0, sx, sy),
        drag.original,
      );
    } else if (drag.kind === 'light-range' && drag.lightId) {
      const entity = this.model.entity(drag.lightId),
        light = this.model.world.read(entity, Light2D);
      if (light) {
        let range = Math.max(
          1,
          Math.hypot(
            (screen[0] - this.toScreen(drag.origin)[0]) / this.zoom,
            (screen[1] - this.toScreen(drag.origin)[1]) / this.zoom,
          ),
        );
        if (this.snapping && !e.altKey)
          range = Math.max(1, snap(range, this.spacing));
        this.model.world.set(entity, Light2D.type, { ...light, range });
      }
    }
    drag.last = screen;
    this.draw();
  }
  private up(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      this.pointers.delete(e.pointerId);
      if (this.pinch?.ids.includes(e.pointerId)) {
        this.pinch = undefined;
        this.draw();
        return;
      }
    }
    const drag = this.drag;
    if (!drag) return;
    this.drag = undefined;
    if (drag.kind === 'marquee') {
      const left = Math.min(drag.start[0], drag.last[0]),
        top = Math.min(drag.start[1], drag.last[1]),
        right = Math.max(drag.start[0], drag.last[0]),
        bottom = Math.max(drag.start[1], drag.last[1]);
      const ids = [...this.model.world.all()]
        .filter((e) => {
          const size = this.entityBounds?.(e.guid) ?? { width: 48, height: 48 },
            b = bounds(this.shapeMatrix(e.guid), size.width, size.height),
            a = this.toScreen([b.x, b.y]),
            z = this.toScreen([b.x + b.width, b.y + b.height]);
          return a[0] <= right && z[0] >= left && a[1] <= bottom && z[1] >= top;
        })
        .map((e) => e.guid);
      this.model.select(drag.append ? [...drag.initialSelection, ...ids] : ids);
    } else if (drag.kind !== 'pan')
      this.model.finishGesture(
        drag.kind === 'light-range'
          ? 'Resize light range'
          : `${drag.kind[0]!.toUpperCase() + drag.kind.slice(1)} entities`,
      );
    this.draw();
  }
  private pointerCancel(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pinch?.ids.includes(e.pointerId)) this.pinch = undefined;
    this.cancel();
  }
  cancel(): void {
    this.drag = undefined;
    this.pinch = undefined;
    this.model.cancelGesture();
    this.draw();
  }
  frameSelected(): void {
    const ids = this.model.selection.size
      ? [...this.model.selection]
      : [...this.model.world.all()].map((e) => e.guid);
    if (!ids.length) {
      this.center = [0, 0];
      this.zoom = 1;
      this.draw();
      return;
    }
    const boxes = ids.map((id) => {
      const size = this.entityBounds?.(id) ?? { width: 48, height: 48 };
      return bounds(this.shapeMatrix(id), size.width, size.height);
    });
    const x = Math.min(...boxes.map((b) => b.x)),
      y = Math.min(...boxes.map((b) => b.y)),
      right = Math.max(...boxes.map((b) => b.x + b.width)),
      bottom = Math.max(...boxes.map((b) => b.y + b.height));
    this.center = [(x + right) / 2, (y + bottom) / 2];
    this.zoom = Math.max(
      0.1,
      Math.min(
        2,
        (this.width - 160) / Math.max(100, right - x),
        (this.height - 160) / Math.max(100, bottom - y),
      ),
    );
    this.draw();
  }
  private ordered() {
    return this.entityOrder
      ? this.entityOrder().map((id) => this.model.world.get(id))
      : [...this.model.world.all()];
  }
  private shapeMatrix(id: string): Matrix2D {
    const m = this.model.world.worldMatrix(this.model.entity(id)),
      size = this.entityBounds?.(id);
    if (!size) return m;
    const offset = point(m, [size.offsetX ?? 0, size.offsetY ?? 0]);
    return [m[0], m[1], m[2], m[3], offset[0], offset[1]];
  }

  private drawLightingHeatmap(c: CanvasRenderingContext2D): void {
    if (!this.lightingDebug) return;
    const sample = createLightingSampler(this.model.world),
      cell = 44;
    c.save();
    c.font = '9px ui-monospace, monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let y = 0; y < this.height; y += cell)
      for (let x = 0; x < this.width; x += cell) {
        const world = this.toWorld([x + cell / 2, y + cell / 2]),
          intensity = Math.max(
            0,
            Math.min(
              1,
              sample(world[0], world[1], undefined, this.lightingChannel)
                .intensity,
            ),
          );
        c.fillStyle = `rgba(255, 166, 82, ${0.05 + intensity * 0.3})`;
        c.fillRect(x, y, cell, cell);
        c.fillStyle = intensity > 0.52 ? '#111820' : '#f4dac0';
        c.fillText(intensity.toFixed(2), x + cell / 2, y + cell / 2);
      }
    c.restore();
  }

  private drawComponentGizmos(
    c: CanvasRenderingContext2D,
    entityId: number,
    m: Matrix2D,
    selected: boolean,
  ): void {
    if (!this.showGizmos) return;
    const ratio = devicePixelRatio || 1,
      position = this.toScreen([m[4], m[5]]),
      rotation = Math.atan2(m[1], m[0]);
    c.save();
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.translate(...position);
    c.rotate(rotation);
    c.scale(this.zoom, this.zoom);
    c.lineWidth = (selected ? 2 : 1) / this.zoom;

    const light = this.model.world.read(entityId, Light2D);
    if (light) {
      c.strokeStyle = selected ? light.color : `${light.color}99`;
      c.setLineDash([5 / this.zoom, 4 / this.zoom]);
      c.beginPath();
      if (light.kind === 'area') {
        c.rect(-light.width / 2, -light.height / 2, light.width, light.height);
        if (light.range > 0)
          c.rect(
            -light.width / 2 - light.range,
            -light.height / 2 - light.range,
            light.width + light.range * 2,
            light.height + light.range * 2,
          );
      } else if (light.kind === 'spot') {
        const angle = (light.outerAngle * Math.PI) / 360;
        c.moveTo(0, 0);
        c.arc(0, 0, light.range, -angle, angle);
        c.closePath();
      } else
        c.arc(
          0,
          0,
          light.kind === 'ambient' ? 18 : light.range,
          0,
          Math.PI * 2,
        );
      c.stroke();
      if (selected && (light.kind === 'point' || light.kind === 'spot')) {
        c.setLineDash([]);
        c.fillStyle = light.color;
        c.beginPath();
        c.arc(light.range, 0, 6 / this.zoom, 0, Math.PI * 2);
        c.fill();
      }
    }

    const caster = this.model.world.read(entityId, ShadowCaster2D);
    if (caster && this.showShadowCasters) {
      c.strokeStyle = '#b58cff';
      c.setLineDash([6 / this.zoom, 4 / this.zoom]);
      c.strokeRect(
        caster.offsetX - caster.width / 2,
        caster.offsetY - caster.height / 2,
        caster.width,
        caster.height,
      );
    }
    const sprite = this.model.world.read(entityId, SpriteRenderer);
    if (sprite?.castShadow && this.showShadowCasters) {
      c.strokeStyle = '#9d78df';
      c.setLineDash([3 / this.zoom, 3 / this.zoom]);
      c.strokeRect(
        -sprite.anchorX * sprite.width,
        -sprite.anchorY * sprite.height,
        sprite.width,
        sprite.height,
      );
    }

    if (this.showColliders) {
      const box = this.model.world.read(entityId, BoxCollider2D),
        circle = this.model.world.read(entityId, CircleCollider2D),
        capsule = this.model.world.read(entityId, CapsuleCollider2D),
        collider = box ?? circle ?? capsule;
      if (collider) {
        c.strokeStyle = collider.sensor ? '#f3b55c' : '#56d6b2';
        c.setLineDash(collider.sensor ? [7 / this.zoom, 4 / this.zoom] : []);
        c.beginPath();
        if (box)
          c.rect(
            box.offsetX - box.width / 2,
            box.offsetY - box.height / 2,
            box.width,
            box.height,
          );
        else if (circle)
          c.arc(circle.offsetX, circle.offsetY, circle.radius, 0, Math.PI * 2);
        else if (capsule) {
          const r = capsule.radius,
            half = capsule.halfHeight;
          c.moveTo(capsule.offsetX - r, capsule.offsetY - half);
          c.arc(capsule.offsetX, capsule.offsetY - half, r, Math.PI, 0);
          c.lineTo(capsule.offsetX + r, capsule.offsetY + half);
          c.arc(capsule.offsetX, capsule.offsetY + half, r, 0, Math.PI);
          c.closePath();
        }
        c.stroke();
      }
    }

    const perception = this.model.world.read(entityId, Perception2D);
    if (perception?.debug) {
      const half = (perception.fovDegrees * Math.PI) / 360;
      c.strokeStyle = '#ffcf6e';
      c.fillStyle = '#ffcf6e12';
      c.setLineDash([5 / this.zoom, 4 / this.zoom]);
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, perception.range, -half, half);
      c.closePath();
      c.fill();
      c.stroke();
      if (
        perception.target &&
        this.model.world.find(perception.target) !== undefined
      ) {
        const targetId = this.model.world.find(perception.target)!,
          targetPos = this.model.world.worldPosition(targetId),
          localX =
            Math.cos(-rotation) * (targetPos[0] - m[4]) -
            Math.sin(-rotation) * (targetPos[1] - m[5]),
          localY =
            Math.sin(-rotation) * (targetPos[0] - m[4]) +
            Math.cos(-rotation) * (targetPos[1] - m[5]),
          sampler = createLightingSampler(this.model.world),
          targetSprite = this.model.world.read(targetId, SpriteRenderer),
          channel = targetSprite?.lightingChannel ?? 'World',
          illumination = sampler(
            targetPos[0],
            targetPos[1],
            perception.target,
            channel,
          ).intensity,
          distance = Math.hypot(localX, localY),
          angle = Math.abs(Math.atan2(localY, localX)),
          inCone =
            distance <= perception.range &&
            (perception.fovDegrees >= 360 || angle <= half),
          visible =
            inCone &&
            hasLineOfSight(
              this.model.world,
              this.model.world.get(entityId).guid,
              perception.target,
              channel,
            ),
          exposed = visible && illumination >= perception.illuminationThreshold;
        c.setLineDash([]);
        c.strokeStyle = exposed ? '#ff7373' : visible ? '#d7ae68' : '#7f91a2';
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(localX, localY);
        c.stroke();
        c.fillStyle = '#0c1118dc';
        c.fillRect(
          8 / this.zoom,
          8 / this.zoom,
          118 / this.zoom,
          34 / this.zoom,
        );
        c.fillStyle = exposed ? '#ff8a8a' : '#c9d5df';
        c.font = `${10 / this.zoom}px ui-monospace, monospace`;
        c.fillText(
          `light ${illumination.toFixed(2)} / ${perception.illuminationThreshold.toFixed(2)}`,
          13 / this.zoom,
          22 / this.zoom,
        );
        c.fillText(
          exposed
            ? 'EXPOSED'
            : visible
              ? 'visible / too dark'
              : 'occluded / out of cone',
          13 / this.zoom,
          34 / this.zoom,
        );
      }
    }

    const camera = this.model.world.read(entityId, Camera2D);
    if (camera) {
      c.strokeStyle = '#6eb7ff';
      c.setLineDash([8 / this.zoom, 5 / this.zoom]);
      const w =
          (this.width * camera.viewportWidth) / Math.max(0.001, camera.zoom),
        h =
          (this.height * camera.viewportHeight) / Math.max(0.001, camera.zoom);
      c.strokeRect(-w / 2, -h / 2, w, h);
    }
    c.restore();
  }

  private drawLightingStats(c: CanvasRenderingContext2D): void {
    if (!this.lightingDebug || !this.lightingStats) return;
    const s = this.lightingStats(),
      lines = [
        `Lighting · ${this.lightingChannel}`,
        `${s.lights} lights  S:${s.staticLights} M:${s.mixedLights} D:${s.dynamicLights}`,
        `${s.casters} casters · ${s.shadowCasterTests} shadow tests`,
        `static cache ${s.staticCacheHits} hit / ${s.staticCacheMisses} miss`,
        `${s.channelsRendered} channels · ${s.renderMs.toFixed(2)} ms`,
      ];
    c.save();
    c.font = '10px ui-monospace, monospace';
    const width =
        Math.max(...lines.map((line) => c.measureText(line).width)) + 18,
      x = this.width - width - 10,
      y = 10;
    c.fillStyle = '#0c1118dc';
    c.fillRect(x, y, width, lines.length * 16 + 10);
    c.strokeStyle = '#536779';
    c.strokeRect(x, y, width, lines.length * 16 + 10);
    lines.forEach((line, index) => {
      c.fillStyle = index === 0 ? '#ffc286' : '#d9e2eb';
      c.fillText(line, x + 9, y + 16 + index * 16);
    });
    c.restore();
  }

  draw(): void {
    const c = this.context,
      ratio = devicePixelRatio || 1;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.clearRect(0, 0, this.width, this.height);
    if (this.grid) {
      let spacing = this.spacing * this.zoom;
      while (spacing < 12) spacing *= 2;
      const zero = this.toScreen([0, 0]);
      c.lineWidth = 1;
      c.strokeStyle = '#26313c';
      c.beginPath();
      for (let x = zero[0] % spacing; x < this.width; x += spacing) {
        c.moveTo(x, 0);
        c.lineTo(x, this.height);
      }
      for (let y = zero[1] % spacing; y < this.height; y += spacing) {
        c.moveTo(0, y);
        c.lineTo(this.width, y);
      }
      c.stroke();
      c.strokeStyle = '#455465';
      c.beginPath();
      c.moveTo(zero[0], 0);
      c.lineTo(zero[0], this.height);
      c.moveTo(0, zero[1]);
      c.lineTo(this.width, zero[1]);
      c.stroke();
    }
    this.drawLightingHeatmap(c);
    for (const entity of this.ordered()) {
      const m = this.shapeMatrix(entity.guid),
        position = this.toScreen([m[4], m[5]]),
        selected = this.model.selection.has(entity.guid),
        size = this.entityBounds?.(entity.guid) ?? { width: 48, height: 48 };
      c.save();
      c.translate(...position);
      c.transform(
        m[0] * this.zoom,
        m[1] * this.zoom,
        m[2] * this.zoom,
        m[3] * this.zoom,
        0,
        0,
      );
      const drawn = this.drawEntity?.(c, entity.guid, m) ?? false;
      if (!drawn) {
        c.fillStyle = this.model.world.isActive(entity.id)
          ? '#506778'
          : '#303943';
        c.fillRect(-size.width / 2, -size.height / 2, size.width, size.height);
      }
      c.strokeStyle = selected ? '#ffb66f' : '#738696';
      c.lineWidth = 1.5 / this.zoom;
      if (selected || !drawn)
        c.strokeRect(
          -size.width / 2,
          -size.height / 2,
          size.width,
          size.height,
        );
      c.restore();
      this.drawComponentGizmos(c, entity.id, m, selected);
      if (selected) {
        c.fillStyle = '#e3eaf0';
        c.font = '11px system-ui';
        c.fillText(entity.name, position[0] + 12, position[1] + 30);
      }
    }
    if (this.model.selection.size && !this.model.locked) {
      const p = this.toScreen(this.pivot());
      c.save();
      c.translate(...p);
      c.lineWidth = 2;
      if (this.tool === 'move') {
        c.strokeStyle = '#ef797c';
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(76, 0);
        c.lineTo(65, -5);
        c.moveTo(76, 0);
        c.lineTo(65, 5);
        c.stroke();
        c.strokeStyle = '#80d6ad';
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(0, -76);
        c.lineTo(-5, -65);
        c.moveTo(0, -76);
        c.lineTo(5, -65);
        c.stroke();
        c.fillStyle = '#ffc286';
        c.fillRect(-6, -6, 12, 12);
      }
      if (this.tool === 'rotate') {
        c.strokeStyle = '#ffc286';
        c.beginPath();
        c.arc(0, 0, 64, 0, Math.PI * 2);
        c.stroke();
      }
      if (this.tool === 'scale') {
        c.strokeStyle = '#ffc286';
        c.beginPath();
        c.moveTo(0, -64);
        c.lineTo(0, 0);
        c.lineTo(64, 0);
        c.stroke();
        for (const [x, y] of [
          [64, 0],
          [0, -64],
          [64, -64],
        ]) {
          c.fillStyle = '#ffc286';
          c.fillRect(x! - 5, y! - 5, 10, 10);
        }
      }
      c.restore();
    }
    if (this.drag?.kind === 'marquee') {
      c.fillStyle = '#ffb66f22';
      c.strokeStyle = '#ffb66f';
      c.fillRect(
        this.drag.start[0],
        this.drag.start[1],
        this.drag.last[0] - this.drag.start[0],
        this.drag.last[1] - this.drag.start[1],
      );
      c.strokeRect(
        this.drag.start[0],
        this.drag.start[1],
        this.drag.last[0] - this.drag.start[0],
        this.drag.last[1] - this.drag.start[1],
      );
    }
    this.drawLightingStats(c);
    this.onViewChange?.();
  }
  dispose(): void {
    this.observer.disconnect();
  }
}
