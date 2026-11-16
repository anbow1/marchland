import { BufferAttribute, BufferGeometry, Color } from 'three/webgpu';

// Builds flat-shaded geometry out of boxes, roofs, cylinders and cones, with a
// colour per vertex and optional extra per-vertex data. Buildings, trees and
// soldiers are all made with it: one material can then draw every one of them.
// Colours are given as sRGB hex and stored linear, as vertex colours must be.
//
// A colour can also stand for a scanned surface (`paints`): shapes drawn with
// it then carry that surface's layer and scale in `aLayer`, and a tint in
// place of the colour, for surfaces.ts' material.

/** A scanned surface a colour constant stands for: its layer, metres per repeat, and a tint (white = as scanned). */
export interface Paint {
  layer: number;
  sizeM: number;
  tintHex: number;
}

export type Vec3 = readonly [number, number, number];

export class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colours: number[] = [];
  private readonly extras: number[] = [];
  private readonly layers: number[] = [];
  private readonly colour = new Color();
  private layer = -1;
  private repeatsPerM = 1;
  /** Per-vertex extra values written with every vertex that follows (see `extraSize`). */
  extra: readonly number[] = [];
  /** Turn (radians about Y) and offset applied to every shape that follows. */
  private turnRad = 0;
  private ox = 0;
  private oy = 0;
  private oz = 0;

  /** `paints` maps colour constants to scanned surfaces; with it the geometry gets an `aLayer` attribute. */
  constructor(
    private readonly extraSize = 0,
    private readonly paints: ReadonlyMap<number, Paint> | null = null,
  ) {}

  /** Sets the colour, or the surface and tint that colour stands for, of the vertices that follow. */
  private paint(hex: number): void {
    const paint = this.paints?.get(hex);
    if (paint) {
      this.colour.setHex(paint.tintHex);
      this.layer = paint.layer;
      this.repeatsPerM = 1 / paint.sizeM;
    } else {
      this.colour.setHex(hex);
      this.layer = -1;
      this.repeatsPerM = 1;
    }
  }

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
    if (this.paints) this.layers.push(this.layer, this.repeatsPerM);
    if (this.extraSize > 0) {
      if (this.extra.length !== this.extraSize) throw new Error(`mesh builder extra has ${this.extra.length} values; expected ${this.extraSize}`);
      for (const v of this.extra) this.extras.push(v);
    }
  }

  /** A modelled shape (unindexed through its triangles, its own linear colours, plain paint) placed at
   * (x, y, z), turned about the vertical and scaled. */
  model(m: { positions: readonly number[]; normals: readonly number[]; colours: readonly number[]; triangles: readonly number[] }, x: number, y: number, z: number, turnRad: number, scale: number): void {
    const keep = [this.ox, this.oy, this.oz, this.turnRad] as const;
    this.at(x, y, z, turnRad);
    this.layer = -1;
    this.repeatsPerM = 1;
    for (const v of m.triangles) {
      this.colour.setRGB(m.colours[v * 3] as number, m.colours[v * 3 + 1] as number, m.colours[v * 3 + 2] as number);
      this.vertex(
        [(m.positions[v * 3] as number) * scale, (m.positions[v * 3 + 1] as number) * scale, (m.positions[v * 3 + 2] as number) * scale],
        [m.normals[v * 3] as number, m.normals[v * 3 + 1] as number, m.normals[v * 3 + 2] as number],
      );
    }
    this.at(...keep);
  }

  /** A flat triangle, counter-clockwise seen from outside. */
  tri(a: Vec3, b: Vec3, c: Vec3, hex: number): this {
    this.paint(hex);
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

  /** A quad whose normal is made to point away from `inside` (a point within the solid it belongs to). */
  private quadOut(a: Vec3, b: Vec3, c: Vec3, d: Vec3, inside: Vec3, hex: number): this {
    const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const outward = nx * (a[0] - inside[0]) + ny * (a[1] - inside[1]) + nz * (a[2] - inside[2]) >= 0;
    return outward ? this.quad(a, b, c, d, hex) : this.quad(a, d, c, b, hex);
  }

  /** A squared timber from `a` to `b`, `width` across and `depth` the other way: a brace, a rafter, a rail. */
  strut(a: Vec3, b: Vec3, width: number, depth: number, hex: number): this {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const length = Math.hypot(ux, uy, uz);
    if (length < 1e-6) throw new Error('strut needs two different end points');
    // Any direction not along the timber gives a first side; the second is square to both.
    const upright = Math.abs(uy) > 0.99 * length;
    let sx = upright ? 1 : -uz;
    let sy = 0;
    let sz = upright ? 0 : ux;
    const sl = Math.hypot(sx, sy, sz);
    sx = (sx / sl) * (width / 2);
    sz = (sz / sl) * (width / 2);
    let tx = (sy * uz - sz * uy) / length;
    let ty = (sz * ux - sx * uz) / length;
    let tz = (sx * uy - sy * ux) / length;
    const tl = Math.hypot(tx, ty, tz);
    tx = (tx / tl) * (depth / 2);
    ty = (ty / tl) * (depth / 2);
    tz = (tz / tl) * (depth / 2);
    sy = 0;
    const corner = (end: Vec3, i: number, j: number): Vec3 => [end[0] + sx * i + tx * j, end[1] + sy * i + ty * j, end[2] + sz * i + tz * j];
    const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const ring: readonly (readonly [number, number])[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let k = 0; k < 4; k++) {
      const [i0, j0] = ring[k] as readonly [number, number];
      const [i1, j1] = ring[(k + 1) % 4] as readonly [number, number];
      this.quadOut(corner(a, i0, j0), corner(a, i1, j1), corner(b, i1, j1), corner(b, i0, j0), mid, hex);
    }
    this.quadOut(corner(a, -1, -1), corner(a, 1, -1), corner(a, 1, 1), corner(a, -1, 1), mid, hex);
    this.quadOut(corner(b, -1, -1), corner(b, 1, -1), corner(b, 1, 1), corner(b, -1, 1), mid, hex);
    return this;
  }

  /**
   * A roof with thickness over a `sx` × `sz` rectangle whose eaves are at `y0`: the ridge runs along
   * X and rises by `rise`. `hip` shortens the ridge at each end, sloping the ends too (0 leaves open
   * gables for the wall to fill); `overhang` carries the eaves past the walls; `thick` is the depth of
   * the covering, shown at the eaves in `edgeHex`.
   */
  roof(cx: number, y0: number, cz: number, sx: number, sz: number, rise: number, hip: number, overhang: number, thick: number, hex: number, edgeHex: number): this {
    const x0 = cx - sx / 2 - overhang;
    const x1 = cx + sx / 2 + overhang;
    const z0 = cz - sz / 2 - overhang;
    const z1 = cz + sz / 2 + overhang;
    // The slope continues past the wall, so the overhanging eave hangs lower than the wall head.
    const drop = (rise / (sz / 2)) * overhang;
    const ye = y0 - drop;
    const yr = y0 + rise;
    const r0 = x0 + (hip > 0 ? hip + overhang : 0);
    const r1 = x1 - (hip > 0 ? hip + overhang : 0);
    const inside: Vec3 = [cx, y0, cz];
    const lift = (p: Vec3): Vec3 => [p[0], p[1] + thick, p[2]];
    const a: Vec3 = [x0, ye, z1];
    const b: Vec3 = [x1, ye, z1];
    const c: Vec3 = [x1, ye, z0];
    const d: Vec3 = [x0, ye, z0];
    const e: Vec3 = [r0, yr, cz];
    const f: Vec3 = [r1, yr, cz];
    // Top, then the underside (so the roof is a closed solid for shadows), then the rim.
    this.quadOut(lift(a), lift(b), lift(f), lift(e), inside, hex);
    this.quadOut(lift(c), lift(d), lift(e), lift(f), inside, hex);
    this.quad(b, a, e, f, edgeHex);
    this.quad(d, c, f, e, edgeHex);
    if (hip > 0) {
      this.tri(lift(d), lift(a), lift(e), hex);
      this.tri(lift(b), lift(c), lift(f), hex);
      this.tri(a, d, e, edgeHex);
      this.tri(c, b, f, edgeHex);
    }
    const rim: readonly (readonly [Vec3, Vec3])[] = hip > 0 ? [[a, b], [b, c], [c, d], [d, a]] : [[a, b], [c, d], [b, f], [f, c], [d, e], [e, a]];
    for (const [p, q] of rim) this.quadOut(p, q, lift(q), lift(p), inside, edgeHex);
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
    if (this.paints) g.setAttribute('aLayer', new BufferAttribute(new Float32Array(this.layers), 2));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
