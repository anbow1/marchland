import { BufferAttribute, BufferGeometry, Color } from 'three/webgpu';

// Builds flat-shaded geometry out of boxes, roofs, cylinders and cones, with a
// colour per vertex and optional extra per-vertex data. Buildings, trees and
// soldiers are all made with it: one material can then draw every one of them.
// Colours are given as sRGB hex and stored linear, as vertex colours must be.

export type Vec3 = readonly [number, number, number];

export class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colours: number[] = [];
  private readonly extras: number[] = [];
  private readonly colour = new Color();
  /** Per-vertex extra values written with every vertex that follows (see `extraSize`). */
  extra: readonly number[] = [];
  /** Turn (radians about Y) and offset applied to every shape that follows. */
  private turnRad = 0;
  private ox = 0;
  private oy = 0;
  private oz = 0;

  constructor(private readonly extraSize = 0) {}

  /** Places what follows at (x, y, z), turned about the vertical axis. */
  at(x: number, y: number, z: number, turnRad = 0): this {
    this.ox = x;
    this.oy = y;
    this.oz = z;
    this.turnRad = turnRad;
    return this;
  }

  private vertex(p: Vec3, n: Vec3): void {
    const c = Math.cos(this.turnRad);
    const s = Math.sin(this.turnRad);
    this.positions.push(this.ox + p[0] * c + p[2] * s, this.oy + p[1], this.oz - p[0] * s + p[2] * c);
    this.normals.push(n[0] * c + n[2] * s, n[1], -n[0] * s + n[2] * c);
    this.colours.push(this.colour.r, this.colour.g, this.colour.b);
    if (this.extraSize > 0) {
      if (this.extra.length !== this.extraSize) throw new Error(`mesh builder extra has ${this.extra.length} values; expected ${this.extraSize}`);
      for (const v of this.extra) this.extras.push(v);
    }
  }

  /** A flat triangle, counter-clockwise seen from outside. */
  tri(a: Vec3, b: Vec3, c: Vec3, hex: number): this {
    this.colour.setHex(hex);
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    const n: Vec3 = [nx, ny, nz];
    this.vertex(a, n);
    this.vertex(b, n);
    this.vertex(c, n);
    return this;
  }

  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, hex: number): this {
    return this.tri(a, b, c, hex).tri(a, c, d, hex);
  }

  /** A box centred on (cx, cz) standing on `y0`, `sx` wide, `sy` tall, `sz` deep. */
  box(cx: number, y0: number, cz: number, sx: number, sy: number, sz: number, hex: number): this {
    const x0 = cx - sx / 2;
    const x1 = cx + sx / 2;
    const y1 = y0 + sy;
    const z0 = cz - sz / 2;
    const z1 = cz + sz / 2;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], hex);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], hex);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], hex);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], hex);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], hex);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], hex);
    return this;
  }

  /** A gable roof over a `sx` × `sz` rectangle: ridge along X, eaves at `y0`, overhanging by `overhang`. */
  gable(cx: number, y0: number, cz: number, sx: number, sz: number, rise: number, hex: number, gableHex: number, overhang = 0.35): this {
    const x0 = cx - sx / 2 - overhang;
    const x1 = cx + sx / 2 + overhang;
    const z0 = cz - sz / 2 - overhang;
    const z1 = cz + sz / 2 + overhang;
    const yr = y0 + rise;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, yr, cz], [x0, yr, cz], hex);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, yr, cz], [x1, yr, cz], hex);
    // Underside, so the eaves are not see-through from below.
    this.quad([x1, y0, z1], [x0, y0, z1], [x0, yr - 0.05, cz], [x1, yr - 0.05, cz], gableHex);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, yr - 0.05, cz], [x0, yr - 0.05, cz], gableHex);
    // Gable ends, flush with the walls.
    const gx0 = cx - sx / 2;
    const gx1 = cx + sx / 2;
    this.tri([gx0, y0, cz - sz / 2], [gx0, y0, cz + sz / 2], [gx0, yr, cz], gableHex);
    this.tri([gx1, y0, cz + sz / 2], [gx1, y0, cz - sz / 2], [gx1, yr, cz], gableHex);
    return this;
  }

  /** An upright prism of `sides` faces; `r1` is the top radius (0 makes a cone). */
  cylinder(cx: number, y0: number, cz: number, r0: number, r1: number, height: number, sides: number, hex: number): this {
    const y1 = y0 + height;
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const b0: Vec3 = [cx + Math.sin(a0) * r0, y0, cz + Math.cos(a0) * r0];
      const b1: Vec3 = [cx + Math.sin(a1) * r0, y0, cz + Math.cos(a1) * r0];
      if (r1 > 0) {
        const t0: Vec3 = [cx + Math.sin(a0) * r1, y1, cz + Math.cos(a0) * r1];
        const t1: Vec3 = [cx + Math.sin(a1) * r1, y1, cz + Math.cos(a1) * r1];
        this.quad(b0, b1, t1, t0, hex);
        this.tri([cx, y1, cz], t0, t1, hex);
      } else {
        this.tri(b0, b1, [cx, y1, cz], hex);
      }
    }
    return this;
  }

  /** A prism lying along X (a log, a barrel on its side). */
  log(cx: number, cy: number, cz: number, radius: number, length: number, sides: number, hex: number): this {
    const x0 = cx - length / 2;
    const x1 = cx + length / 2;
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const y0 = cy + Math.cos(a0) * radius;
      const z0 = cz + Math.sin(a0) * radius;
      const y1 = cy + Math.cos(a1) * radius;
      const z1 = cz + Math.sin(a1) * radius;
      this.quad([x0, y0, z0], [x0, y1, z1], [x1, y1, z1], [x1, y0, z0], hex);
      this.tri([x1, cy, cz], [x1, y0, z0], [x1, y1, z1], hex);
      this.tri([x0, cy, cz], [x0, y1, z1], [x0, y0, z0], hex);
    }
    return this;
  }

  get triangleCount(): number {
    return this.positions.length / 9;
  }

  /** The geometry: `position`, `normal`, `color`, and `extra` when the builder was given a size for it. */
  build(extraName = 'extra'): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.normals), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.colours), 3));
    if (this.extraSize > 0) g.setAttribute(extraName, new BufferAttribute(new Float32Array(this.extras), this.extraSize));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
