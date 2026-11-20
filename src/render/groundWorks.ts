import { ClampToEdgeWrapping, DataTexture, LinearFilter, NoColorSpace, RGBAFormat, UnsignedByteType } from 'three/webgpu';
import { FIELDS, MAP, ROADS, TOWN } from '../config.ts';
import { cellX, cellZ } from '../sim/nav.ts';
import { townX, townZ } from '../sim/terrain.ts';
import type { World } from '../sim/world.ts';

// What people have done to the ground, as a texture the terrain shader reads:
// R = trodden earth (roads, the yards round buildings), G = ploughed soil,
// B = the corn on it (0 none, rising as it grows, 1 ripe), A = paving (the roads). It covers the
// playable square and is redrawn when a road, a building or a field changes;
// so a road is a road on any slope, with no geometry to float or sink.

/** Edge of the texture in texels: about 0.8 m each. */
const WORKS_PX = 640;
/** Least seconds between two redraws (corn grows slowly). */
const REDRAW_GAP_S = 0.5;

export class GroundWorks {
  readonly texture: DataTexture;
  private readonly data = new Uint8Array(WORKS_PX * WORKS_PX * 4);
  private signature = '';
  private ageS = REDRAW_GAP_S;

  constructor() {
    this.texture = new DataTexture(this.data, WORKS_PX, WORKS_PX, RGBAFormat, UnsignedByteType);
    this.texture.wrapS = this.texture.wrapT = ClampToEdgeWrapping;
    this.texture.magFilter = LinearFilter;
    this.texture.minFilter = LinearFilter;
    this.texture.colorSpace = NoColorSpace;
    this.texture.needsUpdate = true;
  }

  private toPx(v: number): number {
    return (v / MAP.sizeM + 0.5) * WORKS_PX;
  }

  /** Raises one channel towards `value` inside a disc, fading over the last `fadeM`. The outermost texels stay empty. */
  private disc(x: number, z: number, radiusM: number, fadeM: number, channel: number, value: number): void {
    const perM = WORKS_PX / MAP.sizeM;
    const cx = this.toPx(x);
    const cy = this.toPx(z);
    const r = radiusM * perM;
    const x0 = Math.max(1, Math.floor(cx - r));
    const x1 = Math.min(WORKS_PX - 2, Math.ceil(cx + r));
    const y0 = Math.max(1, Math.floor(cy - r));
    const y1 = Math.min(WORKS_PX - 2, Math.ceil(cy + r));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy) / perM;
        if (d > radiusM) continue;
        const v = Math.round(value * 255 * Math.min(1, (radiusM - d) / fadeM));
        const o = (py * WORKS_PX + px) * 4 + channel;
        if (v > (this.data[o] as number)) this.data[o] = v;
      }
    }
  }

  /** Sets soil and corn inside a strip: a rectangle `lengthM` across (along the farm's side axis) and `widthM` deep, turned by `yawRad`. */
  private strip(x: number, z: number, yawRad: number, lengthM: number, widthM: number, corn: number): void {
    const perM = WORKS_PX / MAP.sizeM;
    const sin = Math.sin(yawRad);
    const cos = Math.cos(yawRad);
    const reach = Math.hypot(lengthM, widthM) / 2;
    const x0 = Math.max(1, Math.floor(this.toPx(x - reach)));
    const x1 = Math.min(WORKS_PX - 2, Math.ceil(this.toPx(x + reach)));
    const y0 = Math.max(1, Math.floor(this.toPx(z - reach)));
    const y1 = Math.min(WORKS_PX - 2, Math.ceil(this.toPx(z + reach)));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = (px + 0.5) / perM - MAP.halfM - x;
        const dz = (py + 0.5) / perM - MAP.halfM - z;
        // Along the door's direction (depth) and across it (length).
        const deep = Math.abs(dx * sin + dz * cos);
        const across = Math.abs(dx * cos - dz * sin);
        if (deep > widthM / 2 || across > lengthM / 2) continue;
        const o = (py * WORKS_PX + px) * 4;
        this.data[o + 1] = 255;
        this.data[o + 2] = Math.round(corn * 255);
      }
    }
  }

  /** The edge of a strip of land not yet worked: a thin band of trodden earth round it, half strength. */
  private balk(x: number, z: number, yawRad: number, lengthM: number, widthM: number): void {
    const perM = WORKS_PX / MAP.sizeM;
    const sin = Math.sin(yawRad);
    const cos = Math.cos(yawRad);
    const reach = Math.hypot(lengthM, widthM) / 2;
    const x0 = Math.max(1, Math.floor(this.toPx(x - reach)));
    const x1 = Math.min(WORKS_PX - 2, Math.ceil(this.toPx(x + reach)));
    const y0 = Math.max(1, Math.floor(this.toPx(z - reach)));
    const y1 = Math.min(WORKS_PX - 2, Math.ceil(this.toPx(z + reach)));
    const edge = Math.max(0.9, 2 / perM);
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = (px + 0.5) / perM - MAP.halfM - x;
        const dz = (py + 0.5) / perM - MAP.halfM - z;
        const deep = Math.abs(dx * sin + dz * cos);
        const across = Math.abs(dx * cos - dz * sin);
        if (deep > widthM / 2 || across > lengthM / 2) continue;
        if (deep < widthM / 2 - edge && across < lengthM / 2 - edge) continue;
        const o = (py * WORKS_PX + px) * 4;
        this.data[o] = Math.max(this.data[o] as number, 190);
      }
    }
  }

  /** Call once a frame; redraws only when something on the ground has changed. */
  update(world: World, frameSeconds: number): void {
    this.ageS += frameSeconds;
    if (this.ageS < REDRAW_GAP_S) return;
    let signature = `${world.nav.version}`;
    for (const town of world.towns) {
      for (let plot = 0; plot < town.plots.length; plot++) {
        const b = town.plots[plot];
        if (!b) continue;
        signature += `|${plot}${b.kind}${b.level}`;
        for (const s of b.strips) signature += s.state === 'wild' ? 'w' : s.state === 'bare' ? 'b' : s.state === 'ripe' ? 'r' : Math.floor(s.growth * 10);
      }
    }
    if (signature === this.signature) return;
    this.signature = signature;
    this.ageS = 0;
    this.data.fill(0);
    // Roads.
    const road = world.nav.road;
    for (let cell = 0; cell < road.length; cell++) {
      if (road[cell] === 0) continue;
      this.disc(cellX(cell), cellZ(cell), ROADS.cellM * 0.95, 0.9, 0, 1);
      this.disc(cellX(cell), cellZ(cell), ROADS.cellM * 0.85, 0.7, 3, 1);
    }
    for (const town of world.towns) {
      // The keep's yard.
      this.disc(townX(town.side), townZ(town.side), TOWN.keepRadiusM + 4, 4, 0, 0.9);
      for (const b of town.plots) {
        if (!b) continue;
        // A farm's land: only the strips its level works, once they are broken.
        const worked = Math.min(FIELDS.stripsPerLevel[b.level - 1] as number, b.strips.length);
        // The land kept for its higher levels: marked out by a trodden edge (a balk), so the player sees it is taken.
        for (let i = worked; i < b.strips.length; i++) {
          const s = b.strips[i] as (typeof b.strips)[number];
          this.balk(s.x, s.z, b.yawRad, FIELDS.stripLengthM, FIELDS.stripWidthM);
        }
        for (let i = 0; i < worked; i++) {
          const s = b.strips[i] as (typeof b.strips)[number];
          if (s.state === 'wild') continue;
          // Corn on a farm's strips; a vineyard's are bare earth between the rows (the vines are drawn as models).
          const corn = b.kind === 'vineyard' ? 0 : s.state === 'ripe' ? 1 : s.state === 'growing' ? 0.15 + 0.7 * s.growth : 0;
          this.strip(s.x, s.z, b.yawRad, FIELDS.stripLengthM, FIELDS.stripWidthM, corn);
        }
        // The yard, and the worn ground at the door.
        this.disc(b.x, b.z, TOWN.buildingRadiusM - 0.6, 3.5, 0, 0.8);
        this.disc(b.x + Math.sin(b.yawRad) * (TOWN.buildingRadiusM + 1), b.z + Math.cos(b.yawRad) * (TOWN.buildingRadiusM + 1), 2.2, 1.5, 0, 1);
      }
    }
    this.texture.needsUpdate = true;
  }
}
