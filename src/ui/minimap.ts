import { MAP, TOWN } from '../config.ts';
import { forestCoverAt, heightAtM, plotX, plotZ, townX, townZ } from '../sim/terrain.ts';
import type { World } from '../sim/world.ts';
import { TEAM_CSS } from '../render/palette.ts';

// The map in the corner: land and forest drawn once, then towns, regiments and
// the outline of what the camera sees, a few times a second. A click or a drag
// on it moves the camera there.

const SIZE_CSS_PX = 176;

export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly background: HTMLCanvasElement;
  private readonly px: number;

  constructor(onJump: (x: number, z: number) => void) {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    this.px = Math.round(SIZE_CSS_PX * ratio);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap';
    this.canvas.width = this.canvas.height = this.px;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available for the minimap');
    this.ctx = ctx;
    this.background = this.drawBackground();
    const jump = (e: PointerEvent): void => {
      const rect = this.canvas.getBoundingClientRect();
      onJump(((e.clientX - rect.left) / rect.width - 0.5) * MAP.sizeM, ((e.clientY - rect.top) / rect.height - 0.5) * MAP.sizeM);
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      jump(e);
      e.stopPropagation();
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.buttons !== 0) jump(e);
    });
  }

  private toPx(v: number): number {
    return (v / MAP.sizeM + 0.5) * this.px;
  }

  private drawBackground(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = this.px;
    // Drawn once and read back by drawImage only.
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D canvas is not available for the minimap');
    const image = ctx.createImageData(this.px, this.px);
    for (let y = 0; y < this.px; y++) {
      for (let x = 0; x < this.px; x++) {
        const wx = ((x + 0.5) / this.px - 0.5) * MAP.sizeM;
        const wz = ((y + 0.5) / this.px - 0.5) * MAP.sizeM;
        const forest = forestCoverAt(wx, wz);
        const light = 0.85 + heightAtM(wx, wz) / (MAP.hillHeightM * 5);
        const o = (y * this.px + x) * 4;
        image.data[o] = (96 - forest * 52) * light;
        image.data[o + 1] = (118 - forest * 46) * light;
        image.data[o + 2] = (62 - forest * 26) * light;
        image.data[o + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    // Town yards.
    for (const side of [0, 1] as const) {
      ctx.fillStyle = 'rgba(150, 126, 92, 0.75)';
      ctx.beginPath();
      ctx.arc(this.toPx(townX(side)), this.toPx(townZ(side)), ((TOWN.outerRadiusM + 8) / MAP.sizeM) * this.px, 0, Math.PI * 2);
      ctx.fill();
    }
    return canvas;
  }

  /** `corners`: the four ground points at the screen's corners (x, z pairs), or null when the view leaves the ground. */
  draw(world: World, selected: ReadonlySet<number>, corners: readonly number[] | null): void {
    const ctx = this.ctx;
    ctx.drawImage(this.background, 0, 0);
    const unit = this.px / SIZE_CSS_PX;
    for (const town of world.towns) {
      ctx.fillStyle = TEAM_CSS[town.side];
      for (let plot = 0; plot < town.plots.length; plot++) {
        if (!town.plots[plot]) continue;
        ctx.fillRect(this.toPx(plotX(town.side, plot)) - 1.5 * unit, this.toPx(plotZ(town.side, plot)) - 1.5 * unit, 3 * unit, 3 * unit);
      }
      if (town.keepHp > 0) {
        ctx.fillRect(this.toPx(townX(town.side)) - 4 * unit, this.toPx(townZ(town.side)) - 4 * unit, 8 * unit, 8 * unit);
        ctx.strokeStyle = '#f4ecd8';
        ctx.lineWidth = unit;
        ctx.strokeRect(this.toPx(townX(town.side)) - 4 * unit, this.toPx(townZ(town.side)) - 4 * unit, 8 * unit, 8 * unit);
      }
    }
    for (const r of world.regiments) {
      if (r.aliveMen === 0) continue;
      const x = this.toPx(r.centreX);
      const y = this.toPx(r.centreZ);
      const half = (r.def.cavalry ? 3.2 : 2.6) * unit;
      ctx.fillStyle = r.state === 'routing' ? '#d9d2bd' : TEAM_CSS[r.side];
      ctx.beginPath();
      ctx.arc(x, y, half, 0, Math.PI * 2);
      ctx.fill();
      if (selected.has(r.id)) {
        ctx.strokeStyle = '#fff6b8';
        ctx.lineWidth = 1.5 * unit;
        ctx.stroke();
      }
    }
    if (corners) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = unit;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const x = this.toPx(corners[i * 2] as number);
        const y = this.toPx(corners[i * 2 + 1] as number);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
}
