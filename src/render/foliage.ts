import { BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, LinearMipmapLinearFilter, MeshStandardNodeMaterial, SRGBColorSpace, type Texture } from 'three/webgpu';
import { Rng } from '../core/rng.ts';

// Foliage drawn as cards: a crown is a few dozen quads, each carrying a cluster of leaves painted in code
// (no download), cut out by their alpha. Every card's normal is bent out from the middle of the crown, so
// the sun lights the crown as one soft mass with a bright top and a shaded underside, the way a tree reads
// from the air; the vertex colour darkens the cards deep inside and low down (a cheap ambient occlusion).
// The hue comes from each instance's colour, so one texture serves every green and every autumn tint.

export type CrownKind = 'spruce' | 'round' | 'slender' | 'bush';

/** A cluster of leaves (or a spray of needles) on a transparent card: brightness only, with a faint hue jitter. */
function paintCard(needles: boolean, seed: number): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  const rng = new Rng(seed);
  const count = needles ? 520 : 300;
  for (let i = 0; i < count; i++) {
    // Denser and lighter towards the middle: the card's outline is a ragged round clump, not a square.
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * size * 0.46;
    const x = size / 2 + Math.cos(a) * r;
    const y = size / 2 + Math.sin(a) * r * (needles ? 0.75 : 1);
    const depth = i / count;
    const light = 0.45 + depth * 0.5 + rng.range(-0.08, 0.08);
    const hue = rng.range(-0.04, 0.04);
    g.fillStyle = `rgb(${Math.round(255 * Math.min(1, light * (1 + hue)))}, ${Math.round(255 * Math.min(1, light))}, ${Math.round(255 * Math.min(1, light * (1 - hue)))})`;
    g.save();
    g.translate(x, y);
    if (needles) {
      // A drooping spray: thin strokes hanging off a twig.
      g.rotate(Math.PI / 2 + rng.range(-0.7, 0.7));
      g.fillRect(-1, -rng.range(7, 13), 2.2, rng.range(14, 26));
    } else {
      g.rotate(rng.range(0, Math.PI * 2));
      g.beginPath();
      g.ellipse(0, 0, rng.range(7, 12), rng.range(3.5, 6), 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
  return canvas;
}

/** Standing corn on a card: stalks from the bottom edge, each with its ear (brightness only; the instance colour ripens it). */
function paintCorn(seed: number): HTMLCanvasElement {
  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  const rng = new Rng(seed);
  for (let i = 0; i < 110; i++) {
    const x = rng.range(4, w - 4);
    const top = rng.range(h * 0.05, h * 0.3);
    const lean = rng.range(-6, 6);
    const light = rng.range(0.6, 1);
    const c = Math.round(255 * light);
    g.strokeStyle = `rgb(${Math.round(c * 0.92)}, ${c}, ${Math.round(c * 0.8)})`;
    g.lineWidth = rng.range(1.2, 2.2);
    g.beginPath();
    g.moveTo(x, h);
    g.quadraticCurveTo(x + lean * 0.3, (h + top) / 2, x + lean, top);
    g.stroke();
    // The ear: a slim spindle at the top.
    g.fillStyle = `rgb(${c}, ${Math.round(c * 0.95)}, ${Math.round(c * 0.75)})`;
    g.beginPath();
    g.ellipse(x + lean, top - 4, 2.2, 7, lean * 0.04, 0, Math.PI * 2);
    g.fill();
  }
  return canvas;
}

export type CardPaint = 'leaves' | 'needles' | 'corn';

function cardTexture(paint: CardPaint): Texture {
  const t = new CanvasTexture(paint === 'corn' ? paintCorn(5) : paintCard(paint === 'needles', paint === 'needles' ? 7 : 3));
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

/** One material per kind of card; shared by every crown of that kind. */
export function foliageMaterial(needles: boolean): MeshStandardNodeMaterial {
  return cardMaterial(needles ? 'needles' : 'leaves');
}

export function cardMaterial(paint: CardPaint): MeshStandardNodeMaterial {
  return new MeshStandardNodeMaterial({ name: paint, map: cardTexture(paint), alphaTest: 0.42, side: DoubleSide, vertexColors: true, roughness: 0.85, metalness: 0 });
}

/**
 * A patch of standing corn, `sizeM` square and 1 m tall (scaled by its growth): three upright cards crossed
 * like a star, lit as if their faces looked mostly up, darker at the foot.
 */
export function cornPatchGeometry(sizeM: number): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const index: number[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI;
    const dx = (Math.cos(a) * sizeM) / 2;
    const dz = (Math.sin(a) * sizeM) / 2;
    const base = pos.length / 3;
    const corners: [number, number, number, number][] = [
      [-dx, 0, -dz, 0],
      [dx, 0, dz, 1],
      [dx, 1, dz, 1],
      [-dx, 1, -dz, 0],
    ];
    for (const [x, y, z, u] of corners) {
      pos.push(x, y, z);
      // Mostly up, a little sideways: the field lights as a surface, not as a fence of cards.
      const nx = -Math.sin(a) * 0.35;
      const nz = Math.cos(a) * 0.35;
      const l = Math.hypot(nx, 1, nz);
      nor.push(nx / l, 1 / l, nz / l);
      uv.push(u, y);
      const shade = 0.55 + 0.45 * y;
      col.push(shade, shade, shade);
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

interface Shape {
  /** Cards, their size range (m), the crown's middle and its half-sizes (m). */
  cards: number;
  sizeM: [number, number];
  centreY: number;
  radius: number;
  halfHeight: number;
}

const SHAPES: Record<Exclude<CrownKind, 'spruce'>, Shape> = {
  // Oak, beech, lime: a broad dome over a short trunk.
  round: { cards: 38, sizeM: [2.2, 3.1], centreY: 5.4, radius: 3.0, halfHeight: 2.5 },
  // Birch, poplar, alder: tall and narrow.
  slender: { cards: 28, sizeM: [1.6, 2.3], centreY: 6.2, radius: 1.7, halfHeight: 3.4 },
  // A hazel or blackthorn clump on the ground.
  bush: { cards: 12, sizeM: [1.3, 1.9], centreY: 0.9, radius: 1.4, halfHeight: 0.85 },
};

/**
 * The crown of a kind as cards: positions, bent normals, uvs and the occlusion colour. `detail` < 1 takes
 * fewer, larger cards (low quality).
 */
export function crownGeometry(kind: CrownKind, detail: number, seed: number): BufferGeometry {
  const rng = new Rng(seed);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const index: number[] = [];
  /** A card at (cx, cy, cz) facing (nx, ny, nz), `s` metres across, bent towards the crown's own outward direction (ox, oy, oz). */
  const card = (cx: number, cy: number, cz: number, nx: number, ny: number, nz: number, s: number, ox: number, oy: number, oz: number, shade: number): void => {
    let l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    // Two axes across the card.
    let tx = -nz;
    let ty = 0;
    let tz = nx;
    if (Math.abs(ny) > 0.9) {
      tx = 1;
      ty = 0;
      tz = 0;
    }
    l = Math.hypot(tx, ty, tz) || 1;
    tx /= l;
    ty /= l;
    tz /= l;
    const spin = rng.range(0, Math.PI * 2);
    const bx = ny * tz - nz * ty;
    const by = nz * tx - nx * tz;
    const bz = nx * ty - ny * tx;
    const ux = Math.cos(spin) * tx + Math.sin(spin) * bx;
    const uy = Math.cos(spin) * ty + Math.sin(spin) * by;
    const uz = Math.cos(spin) * tz + Math.sin(spin) * bz;
    const vx = ny * uz - nz * uy;
    const vy = nz * ux - nx * uz;
    const vz = nx * uy - ny * ux;
    const h = s / 2;
    const base = pos.length / 3;
    const corners: [number, number][] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    for (const [a, b] of corners) {
      const px = cx + (ux * a + vx * b) * h;
      const py = cy + (uy * a + vy * b) * h;
      const pz = cz + (uz * a + vz * b) * h;
      pos.push(px, py, pz);
      // The normal of the crown's surface where the corner lies, a little of the card's own.
      let mx = ox * 0.8 + nx * 0.2 + (px - cx) * 0.08;
      let my = oy * 0.8 + ny * 0.2 + (py - cy) * 0.08;
      let mz = oz * 0.8 + nz * 0.2 + (pz - cz) * 0.08;
      const ml = Math.hypot(mx, my, mz) || 1;
      mx /= ml;
      my /= ml;
      mz /= ml;
      nor.push(mx, my, mz);
      uv.push((a + 1) / 2, (b + 1) / 2);
      col.push(shade, shade, shade);
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  if (kind === 'spruce') {
    // Tiers of drooping sprays round the trunk, narrowing to the top; one card caps it.
    const tiers = Math.max(4, Math.round(8 * detail));
    for (let k = 0; k < tiers; k++) {
      const t = k / (tiers - 1);
      const y = 2.2 + t * 7.4;
      const r = 2.7 * (1 - t) + 0.35;
      const around = Math.max(3, Math.round((4 + 3 * (1 - t)) * detail));
      for (let j = 0; j < around; j++) {
        const a = (j / around) * Math.PI * 2 + k * 0.9 + rng.range(-0.3, 0.3);
        const ox = Math.cos(a);
        const oz = Math.sin(a);
        const rr = r * rng.range(0.55, 0.85);
        // Sprays lie nearly flat and droop outward.
        card(ox * rr, y - rr * 0.25, oz * rr, ox * 0.35, 1, oz * 0.35, r * 1.25 + 0.7, ox * 0.75, 0.6, oz * 0.75, 0.45 + 0.55 * t);
      }
    }
    card(0, 9.9, 0, 0, 1, 0, 1.3, 0, 1, 0, 1);
  } else {
    const shape = SHAPES[kind];
    const n = Math.max(6, Math.round(shape.cards * detail));
    const grow = detail < 1 ? 1 / Math.sqrt(detail) : 1;
    for (let i = 0; i < n; i++) {
      // Points spread over the crown's shell (golden spiral), pulled a little inward at random.
      const f = (i + 0.5) / n;
      const y = 1 - 2 * f * 0.92;
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const a = i * 2.39996 + rng.range(-0.2, 0.2);
      const depth = rng.range(0.6, 1.0);
      const ox = Math.cos(a) * ring;
      const oy = y;
      const oz = Math.sin(a) * ring;
      const cx = ox * shape.radius * depth;
      const cy = shape.centreY + oy * shape.halfHeight * depth;
      const cz = oz * shape.radius * depth;
      // Cards facing out and somewhat up (the camera is above).
      const s = rng.range(shape.sizeM[0], shape.sizeM[1]) * grow;
      // Darker inside and underneath.
      const shade = Math.min(1, 0.42 + 0.35 * (oy * 0.5 + 0.5) + 0.3 * (depth - 0.6) / 0.4);
      card(cx, cy, cz, ox + rng.range(-0.4, 0.4), oy + 0.45, oz + rng.range(-0.4, 0.4), s, ox, oy * 0.8 + 0.25, oz, shade);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

/**
 * A row of vine foliage trained along a wire, `lengthM` long: cards leaning out either side of the row and
 * a few on top, between 0.3 and 1.2 m up; darker low down.
 */
export function vineRowGeometry(lengthM: number, seed: number): BufferGeometry {
  const rng = new Rng(seed);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const index: number[] = [];
  const steps = Math.round(lengthM / 0.45);
  for (let i = 0; i < steps; i++) {
    const x = -lengthM / 2 + (i + 0.5) * (lengthM / steps) + rng.range(-0.1, 0.1);
    for (const side of [-1, 1, 0]) {
      const y = side === 0 ? 1.0 : rng.range(0.45, 0.85);
      const s = side === 0 ? 0.75 : 0.9;
      // A card upright across the row's side (or flat on top), tilted out and up.
      const nx = rng.range(-0.3, 0.3);
      const ny = side === 0 ? 1 : 0.5;
      const nz = side === 0 ? 0 : side;
      const base = pos.length / 3;
      // Axes across the card: along the row, and up (or across, for the top card).
      const ax: [number, number, number] = [1, 0, 0];
      const bx: [number, number, number] = side === 0 ? [0, 0, 1] : [0, 1, -side * 0.45];
      const cz = side * 0.18;
      for (const [a, b] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        pos.push(x + (ax[0] * a + bx[0] * b) * s * 0.5, y + (ax[1] * a + bx[1] * b) * s * 0.5, cz + (ax[2] * a + bx[2] * b) * s * 0.5);
        const l = Math.hypot(nx, ny, nz);
        nor.push(nx / l, ny / l, nz / l);
        uv.push((a + 1) / 2, (b + 1) / 2);
        const shade = 0.55 + 0.4 * Math.min(1, y / 1.1);
        col.push(shade, shade, shade);
      }
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}
