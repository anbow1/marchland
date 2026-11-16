import {
  attribute,
  cameraPosition,
  cameraViewMatrix,
  clamp,
  cos,
  dot,
  faceDirection,
  float,
  floor,
  Fn,
  fract,
  hash,
  int,
  ivec2,
  length,
  max,
  min,
  mix,
  mod,
  normalize,
  positionWorld,
  pow,
  select,
  sin,
  smoothstep,
  sqrt,
  texture,
  textureLoad,
  uniform,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import {
  BufferAttribute,
  DataTexture,
  DoubleSide,
  FloatType,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  MeshPhysicalNodeMaterial,
  MeshStandardNodeMaterial,
  NearestFilter,
  type Node,
  RedFormat,
  RGBAFormat,
  UnsignedByteType,
  Vector2,
  type Vector3,
} from 'three/webgpu';

// GPU grass field, shared file for file by Field Line, Castaway Lagoon, Tanks
// and Ridgeline (docs/graphics-playbook.md §5.6). Real blades, not cards:
//
// - One 4 m tile holds N blades in R2 low-discrepancy order (Roberts 2018), so
//   any prefix of the list is an even subset. Tiles are instanced around the
//   camera in three rings (4, 3 and 2 segments per blade: three draw calls);
//   each ring's draw range keeps the prefix its distance needs, and a blade
//   whose rank is near the cut shrinks into the ground instead of popping, the
//   survivors growing wider (never under ~0.8 px).
// - Each blade is a quadratic Bézier strip rooted exactly on the terrain mesh:
//   heights come from the mesh's own grid, interpolated on the same triangle
//   split, so no blade floats or sinks. Tiles are mirrored/rotated in 8 ways.
// - A density map (meadow, beach grass, sedge, canopy shade) decides kind and
//   presence; gust waves travel with the wind; a trampling map around the
//   player bends and flattens blades and recovers over ~9 s, and a blown
//   disc (a rotor's downwash, a blast) lays them outward and sets them
//   thrashing while it lasts.
// - The ground and the density may instead be functions in the shader (a
//   game whose terrain and cover are already on the GPU: Ridgeline), and the
//   density function may give the colour of the ground, which the blades
//   then take on: the sward matches the field it grows in.
// - Colour varies per blade, tips dry, roots darken; blades receive shadows and
//   cast none. No shadow pass, no MRT-heavy extras: a phone draws the Low field.

type F = Node<'float'>;
type V2 = Node<'vec2'>;

/** The terrain mesh's height grid (row-major, x fastest) and its triangle split. */
export interface GrassGround {
  heights: Float32Array;
  originX: number;
  originZ: number;
  cellM: number;
  samplesX: number;
  samplesZ: number;
  /**
   * 'bc': each cell is cut from (i+1, j) to (i, j+1) — triangles (i,j),(i,j+1),(i+1,j) and
   * (i+1,j),(i,j+1),(i+1,j+1) — as the Field Line and Tanks meshes are built.
   * 'ad': cut from (i, j) to (i+1, j+1).
   */
  split: 'bc' | 'ad';
}

/** The ground as a shader function instead of a grid: world xz → the rendered surface's height. */
export type GrassGroundNode = (xz: V2) => F;

/** Density (meadow, beach, sedge, shade 0…1) and optionally the ground's colour at a root, in the shader. */
export type GrassSurfaceNode = (xz: V2, groundY: F) => { density: Node<'vec4'>; colour?: Node<'vec3'> };

/** Where grass grows, RGBA 0..255: meadow, beach grass, sedge, canopy shade; a square grid. */
export interface GrassDensity {
  data: Uint8Array;
  originX: number;
  originZ: number;
  cellM: number;
  size: number;
}

export interface GrassColours {
  meadow: [number, number, number];
  beach: [number, number, number];
  sedge: [number, number, number];
  dry: [number, number, number];
}

export interface GrassOptions {
  tileM: number;
  bladesPerTile: number;
  /** Grass ends here (m); the rings split it at 30 % and 65 %. */
  radiusM: number;
  /** World wind (m/s, x and z) and time (s). */
  wind: Node<'vec2'>;
  time: Node<'float'>;
  colours: GrassColours;
  /** Blade size multipliers (1 = meadow grass ~0.25–0.5 m tall, 12 mm wide). */
  widthScale?: number;
  heightScale?: number;
  /**
   * Brightness at a blade's root, 0–1 (default 0.6): the dark base sells depth at eye height, but
   * from a camera several metres up (Tanks) it turns a meadow into dark dashes.
   */
  rootShade?: number;
  /** Skylight lost under the canopy at full shade (the density map's fourth channel), 0 = none. */
  shadeOcclusion?: number;
  /**
   * Lean multiplier (default 1). Seen from several metres up (a tank's commander), upright blades
   * project as parallel vertical strokes and a meadow reads as corduroy; leaning them further, each its
   * own way, breaks the strokes into a mottled sward.
   */
  leanScale?: number;
  /** Blade heights per kind (m, before heightScale): meadow, beach, sedge. */
  kindHeightsM?: [[number, number], [number, number], [number, number]];
  /** Share of a blade's colour taken from the ground colour a GrassSurfaceNode gives (default 0.7). */
  groundTint?: number;
  /** Trampling map cell size (m, default 0.3): the map is 128 cells a side round its focus. */
  trampleCellM?: number;
  /**
   * No specular (a physical material with specular intensity 0; the diffuse sky light stays — a
   * Lambert material lost it and the blades went black). A blade's shading normal leans up, so seen
   * from a few metres up it is lit at a grazing angle, where Fresnel reflects ~40 % of the sky:
   * under a bright sky probe (Ridgeline) the sward turned to frost.
   */
  matte?: boolean;
}

/** Share of the blades kept at the inner edge of each ring. */
const RING_KEEP = [1, 0.45, 0.2] as const;
const RING_SEGMENTS = [4, 3, 2] as const;
const RING_SPLIT = [0.3, 0.65, 1] as const;
/** Trampling map: texels per side and metres per texel (a ~38 m window round the player). */
const TRAMPLE_N = 128;
/** Trampled blades stand up again with this time constant (s): ~9 s to recover. */
const TRAMPLE_RECOVER_S = 3;
/** Blown blades stop thrashing this fast (s) once the wind is gone. */
const AGITATION_DECAY_S = 0.35;

export class GrassField {
  readonly group = new Group();
  readonly material: MeshStandardNodeMaterial;
  private readonly rings: { mesh: Mesh; geometry: InstancedBufferGeometry; tiles: InstancedBufferAttribute; from: number; to: number; bladeIdx: number }[] = [];
  private readonly trample = new Float32Array(TRAMPLE_N * TRAMPLE_N * 4);
  private readonly cellM: number;
  private readonly trampleBytes = new Uint8Array(TRAMPLE_N * TRAMPLE_N * 4);
  private readonly trampleTex: DataTexture;
  private readonly trampleOrigin = uniform(new Vector2());
  private readonly pixelAngle = uniform(0.001);
  private trampleX = 0;
  private trampleZ = 0;
  private trampleDirty = true;

  constructor(ground: GrassGround | GrassGroundNode, density: GrassDensity | GrassSurfaceNode, private readonly opts: GrassOptions) {
    this.group.name = 'grass';
    this.cellM = opts.trampleCellM ?? 0.3;
    this.trampleTex = new DataTexture(this.trampleBytes, TRAMPLE_N, TRAMPLE_N, RGBAFormat, UnsignedByteType);
    this.trampleTex.magFilter = this.trampleTex.minFilter = LinearFilter;
    // x, z push at 0.5; flattening and agitation at 0
    for (let i = 0; i < this.trampleBytes.length; i += 4) {
      this.trampleBytes[i] = 128;
      this.trampleBytes[i + 1] = 128;
      this.trampleBytes[i + 2] = 0;
      this.trampleBytes[i + 3] = 0;
    }
    this.trampleTex.needsUpdate = true;

    const N = opts.bladesPerTile;
    const R = opts.radiusM;

    const groundY = typeof ground === 'function' ? ground : GrassField.gridHeight(ground);
    const surface = typeof density === 'function' ? density : GrassField.gridDensity(density);

    const m = opts.matte
      ? new MeshPhysicalNodeMaterial({ side: DoubleSide, roughness: 0.9, metalness: 0, specularIntensity: 0 })
      : new MeshStandardNodeMaterial({ side: DoubleSide, roughness: 0.8, metalness: 0 });
    m.name = 'grass';
    const blade = attribute('blade', 'float');
    const bt = attribute('bt', 'vec2');
    const tile = attribute('iTile', 'vec3');
    const t = bt.x;
    const side = bt.y;
    // position in the tile: R2 sequence, the tile mirrored / transposed by its orientation code
    const q0 = fract(vec2(blade.mul(0.7548776662), blade.mul(0.569840291)).add(0.5));
    const o = tile.z;
    const swap = mod(o, 2).greaterThanEqual(1);
    const q1 = select(swap, q0.yx, q0);
    const mx = mod(floor(o.div(2)), 2);
    const mz = floor(o.div(4));
    const qm = vec2(mix(q1.x, float(1).sub(q1.x), mx), mix(q1.y, float(1).sub(q1.y), mz));
    // A random toroidal shift per tile (a Cranley–Patterson rotation): the set stays evenly spread,
    // but no two tiles share their rows. With the 8 orientations alone, every tile repeated the same
    // lattice and from a few metres up the meadow read as a fixed screen-door pattern.
    const shift = vec2(hash(tile.x.mul(12.9898).add(tile.y.mul(78.233))), hash(tile.x.mul(39.346).add(tile.y.mul(11.135)).add(5.1)));
    const q = fract(qm.add(shift));
    const seed = blade.add(tile.x.mul(3.17)).add(tile.y.mul(7.31));
    const r1 = hash(seed);
    const r2 = hash(seed.add(11.3));
    const r3 = hash(seed.add(27.1));
    const r4 = hash(seed.add(41.7));
    // jitter within the lattice spacing: R2 alone reads as a regular grid from above
    const spacing = opts.tileM / Math.sqrt(N);
    const jitter = vec2(hash(seed.add(53.9)), hash(seed.add(67.3))).sub(0.5).mul(spacing * 0.9);
    const rootXZ = tile.xy.add(q.mul(opts.tileM)).add(jitter);
    const rootY = groundY(rootXZ);
    const site = surface(rootXZ, rootY);
    const dens = site.density;
    const meadow = dens.r;
    const beach = dens.g;
    const sedge = dens.b;
    const shade = dens.a;
    // natural clumping: a smooth interference pattern thins and thickens the sward every few metres
    const clump = sin(rootXZ.x.mul(0.61).add(sin(rootXZ.y.mul(0.37)).mul(2.1))).mul(sin(rootXZ.y.mul(0.53).add(sin(rootXZ.x.mul(0.29)).mul(1.7))));
    const presence = clamp(meadow.add(beach).add(sedge), 0, 1).mul(smoothstep(-0.75, 0.35, clump));
    const pick = r1.mul(max(meadow.add(beach).add(sedge), 1e-3));
    const isMeadow = pick.lessThan(meadow);
    const isBeach = pick.greaterThanEqual(meadow).and(pick.lessThan(meadow.add(beach)));
    const [hM, hB, hS] = opts.kindHeightsM ?? [
      [0.24, 0.5],
      [0.35, 0.65],
      [0.4, 0.75],
    ];
    const kindH0 = select(isMeadow, mix(hM[0], hM[1], r2).mul(shade.mul(0.5).add(1)), select(isBeach, mix(hB[0], hB[1], r2), mix(hS[0], hS[1], r2)));
    const kindH = kindH0.mul(opts.heightScale ?? 1).mul(smoothstep(-0.75, 0.6, clump).mul(0.5).add(0.6));
    const kindW = select(isMeadow, float(0.012), select(isBeach, float(0.008), float(0.03))).mul(opts.widthScale ?? 1);
    const kindLean = select(isMeadow, mix(0.12, 0.35, r3), select(isBeach, mix(0.05, 0.15, r3), mix(0.45, 0.7, r3))).mul(opts.leanScale ?? 1);
    // distance thinning: the share of this tile's blades kept here; ranks near the cut shrink
    const dist = length(rootXZ.sub(cameraPosition.xz));
    const [s0, s1] = [RING_SPLIT[0] * R, RING_SPLIT[1] * R];
    const keep = select(
      dist.lessThan(s0),
      float(1),
      select(dist.lessThan(s1), mix(1, RING_KEEP[1], dist.sub(s0).div(s1 - s0)), mix(RING_KEEP[1], RING_KEEP[2], clamp(dist.sub(s1).div(R - s1), 0, 1))),
    ).mul(float(1).sub(smoothstep(R * 0.85, R, dist)));
    const rank = blade.div(N);
    const vis = float(1).sub(smoothstep(keep.mul(0.85), keep, rank)).mul(select(r4.lessThan(presence), float(1), float(0)));
    // survivors widen as the field thins, and never drop under ~1.3 px: thinner, a blade flickers
    // in and out between pixels as the TRAA jitter moves, and the field shimmers like static
    const width = max(kindW.div(sqrt(max(keep, 0.15))), this.pixelAngle.mul(dist).mul(1.3));
    // Toward the edge of the field blades get shorter and lose their dark roots, so they melt into
    // the ground instead of reading as a carpet of dark dashes from a high camera.
    const far = smoothstep(R * 0.3, R * 0.9, dist);
    const H = kindH.mul(vis).mul(float(1).sub(far.mul(0.45)));
    // lean, wind gusts travelling across the field, flutter, trampling
    const a = r2.mul(Math.PI * 2);
    const dir = vec2(cos(a), sin(a));
    const wLen = length(opts.wind);
    const wDir = opts.wind.div(max(wLen, 1e-3));
    const gust = sin(dot(rootXZ, wDir).mul(0.35).sub(opts.time.mul(1.9))).mul(0.5).add(0.5);
    const flutter = sin(opts.time.mul(3.3).add(r3.mul(40))).mul(0.05);
    const tr = texture(this.trampleTex, rootXZ.sub(this.trampleOrigin).div(TRAMPLE_N * this.cellM).add(0.5)).level(float(0));
    const trBend = tr.xy.mul(2).sub(1);
    // blown blades (tr.w) thrash: the push pulses and the blade whips across it, each at its own phase
    const thrash = tr.w;
    const pulse = sin(opts.time.mul(19).add(r3.mul(40))).mul(thrash.mul(0.45));
    const whip = vec2(trBend.y.negate(), trBend.x).mul(sin(opts.time.mul(27).add(r1.mul(60))).mul(thrash.mul(0.5)));
    const B = dir
      .mul(kindLean)
      .add(wDir.mul(min(wLen.mul(0.06).mul(gust.add(0.4)), 0.9)))
      .add(dir.mul(flutter))
      .add(trBend.mul(pulse.add(1.3)))
      .add(whip);
    const Hf = H.mul(float(1).sub(tr.z.mul(0.6)));
    const b2 = min(dot(B, B), 1.6);
    const root = vec3(rootXZ.x, rootY.sub(0.02), rootXZ.y);
    const p1 = root.add(vec3(B.x.mul(Hf).mul(0.15), Hf.mul(0.62), B.y.mul(Hf).mul(0.15)));
    const p2 = root.add(vec3(B.x.mul(Hf), Hf.mul(sqrt(max(float(1).sub(b2.mul(0.45)), 0.08))), B.y.mul(Hf)));
    const u = float(1).sub(t);
    const pos = root.mul(u.mul(u)).add(p1.mul(u.mul(t).mul(2))).add(p2.mul(t.mul(t)));
    const tangent = p1.sub(root).mul(u.mul(2)).add(p2.sub(p1).mul(t.mul(2)));
    const across = normalize(vec3(dir.y.negate(), 0, dir.x));
    const w = width.mul(pow(max(u, 0), 0.7)).mul(0.5);
    m.positionNode = pos.add(across.mul(side.mul(w)));
    const nBlade = normalize(tangent.cross(across));
    const vN = varying(nBlade, 'vGrassN');
    // colour: kind, per-blade variation, dry tips, dark roots, darker in the shade of the canopy
    const c = opts.colours;
    const kindCol = select(isMeadow, vec3(...c.meadow), select(isBeach, vec3(...c.beach), vec3(...c.sedge)));
    // over a coloured ground the blade takes most of its colour from the field it grows in, a little lifted
    const tinted = site.colour ? mix(kindCol, site.colour.mul(1.12), opts.groundTint ?? 0.7) : kindCol;
    const base = tinted.mul(r3.mul(0.35).add(0.8));
    const tipDry = mix(base, vec3(...c.dry), t.mul(t).mul(r4.mul(0.7).add(0.15)));
    const col = tipDry.mul(mix(mix(opts.rootShade ?? 0.6, 1, sqrt(t)), float(1), far.mul(0.8))).mul(float(1).sub(shade.mul(0.3)));
    m.colorNode = varying(col, 'vGrassCol');
    // Shadow lookups from a point lifted above the blade. A blade's lower half sits right at the
    // terrain's own depth in the sun's shadow map, so it shadowed itself at random: fine grain
    // in the near cascade, blocky squares in the coarse far one, and a straight line on the ground
    // where the cascades meet. The lift grows with distance like the cascade texels; it is far
    // smaller than a tree or a hull, so their shadows still fall on the grass.
    const shadowLift = length(positionWorld.xz.sub(cameraPosition.xz)).mul(0.01).add(0.35);
    m.receivedShadowPositionNode = positionWorld.add(vec3(0, shadowLift, 0));
    // lit mostly as the ground it covers, a little as the blade: no black backs, no glare
    const nW = normalize(vec3(0, 1, 0).mul(0.6).add(vN.mul(faceDirection).mul(0.4)));
    m.normalNode = normalize(cameraViewMatrix.mul(vec4(nW, 0)).xyz);
    // The canopy's sky occlusion, as the ground under it takes it (indirect light only; the sun has real
    // shadows): without it a blade in a crown's shade got twice the ground's skylight and stood out pale
    // against the dark litter it grows from (photo critic loop, both games).
    const occlusion = opts.shadeOcclusion ?? 0;
    if (occlusion > 0) m.aoNode = varying(float(1).sub(shade.mul(occlusion)), 'vGrassAo');
    this.material = m;

    RING_SEGMENTS.forEach((S, ringIdx) => {
      const g = new InstancedBufferGeometry();
      const perBlade = 2 * (S + 1);
      const bladeAttr = new Float32Array(N * perBlade);
      const btAttr = new Float32Array(N * perBlade * 2);
      const idx: number[] = [];
      for (let b = 0; b < N; b++) {
        for (let k = 0; k <= S; k++) {
          for (let s = 0; s < 2; s++) {
            const v = b * perBlade + k * 2 + s;
            bladeAttr[v] = b;
            btAttr[v * 2] = k / S;
            btAttr[v * 2 + 1] = s === 0 ? -1 : 1;
          }
        }
        for (let k = 0; k < S; k++) {
          const v = b * perBlade + k * 2;
          idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
        }
      }
      g.setAttribute('position', new BufferAttribute(new Float32Array(N * perBlade * 3), 3));
      g.setAttribute('blade', new BufferAttribute(bladeAttr, 1));
      g.setAttribute('bt', new BufferAttribute(btAttr, 2));
      g.setIndex(idx);
      const maxTiles = Math.ceil(((Math.PI * (RING_SPLIT[ringIdx] as number) ** 2 * R * R) / (opts.tileM * opts.tileM)) * 1.6) + 16;
      const tiles = new InstancedBufferAttribute(new Float32Array(maxTiles * 3), 3);
      g.setAttribute('iTile', tiles);
      g.instanceCount = 0;
      // the prefix of blades this ring can ever show: its inner edge's share
      const keepMax = RING_KEEP[ringIdx] as number;
      g.setDrawRange(0, Math.ceil(N * keepMax) * S * 6);
      const mesh = new Mesh(g, m);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.name = `grass-ring${ringIdx}`;
      this.group.add(mesh);
      this.rings.push({ mesh, geometry: g, tiles, from: ringIdx === 0 ? 0 : (RING_SPLIT[ringIdx - 1] as number) * R, to: (RING_SPLIT[ringIdx] as number) * R, bladeIdx: ringIdx });
    });
  }

  /** Terrain height on a grid mesh's own triangles (the mesh's split, not a bilinear). */
  private static gridHeight(ground: GrassGround): GrassGroundNode {
    const heightTex = new DataTexture(ground.heights, ground.samplesX, ground.samplesZ, RedFormat, FloatType);
    heightTex.magFilter = heightTex.minFilter = NearestFilter;
    heightTex.needsUpdate = true;
    return Fn(([xz]: [V2]) => {
      const f = xz.sub(vec2(ground.originX, ground.originZ)).div(ground.cellM);
      const fc = clamp(f, vec2(0), vec2(ground.samplesX - 1.001, ground.samplesZ - 1.001));
      const i0 = floor(fc);
      const uv = fc.sub(i0);
      const ii = ivec2(i0);
      const h = (dx: number, dz: number): F => textureLoad(heightTex, ii.add(ivec2(int(dx), int(dz)))).r;
      const h00 = h(0, 0);
      const h10 = h(1, 0);
      const h01 = h(0, 1);
      const h11 = h(1, 1);
      if (ground.split === 'bc') {
        const lower = h00.add(h10.sub(h00).mul(uv.x)).add(h01.sub(h00).mul(uv.y));
        const upper = h11.add(h01.sub(h11).mul(float(1).sub(uv.x))).add(h10.sub(h11).mul(float(1).sub(uv.y)));
        return select(uv.x.add(uv.y).lessThanEqual(1), lower, upper);
      }
      const a = h00.add(h10.sub(h00).mul(uv.x)).add(h11.sub(h10).mul(uv.y));
      const b = h00.add(h11.sub(h01).mul(uv.x)).add(h01.sub(h00).mul(uv.y));
      return select(uv.x.greaterThanEqual(uv.y), a, b);
    }) as unknown as GrassGroundNode;
  }

  /** The density grid as a shader lookup. */
  private static gridDensity(density: GrassDensity): GrassSurfaceNode {
    const densTex = new DataTexture(density.data, density.size, density.size, RGBAFormat, UnsignedByteType);
    densTex.magFilter = densTex.minFilter = LinearFilter;
    densTex.needsUpdate = true;
    return (xz) => ({ density: texture(densTex, xz.sub(vec2(density.originX, density.originZ)).div(density.cellM * density.size)).level(float(0)) });
  }

  /**
   * Bend and flatten blades in a disc (a foot, a thrown stone, a tank's track): `dirX/dirZ` is the
   * push direction, `strength` 0..1.
   */
  stamp(x: number, z: number, radiusM: number, dirX: number, dirZ: number, strength: number): void {
    const n = TRAMPLE_N;
    const cx = (x - this.trampleX) / this.cellM + n / 2;
    const cz = (z - this.trampleZ) / this.cellM + n / 2;
    const r = radiusM / this.cellM;
    const len = Math.hypot(dirX, dirZ) || 1;
    for (let j = Math.max(0, Math.floor(cz - r)); j <= Math.min(n - 1, Math.ceil(cz + r)); j++) {
      for (let i = Math.max(0, Math.floor(cx - r)); i <= Math.min(n - 1, Math.ceil(cx + r)); i++) {
        const d = Math.hypot(i - cx, j - cz) / r;
        if (d >= 1) continue;
        const k = strength * (1 - d * d);
        const o = (j * n + i) * 4;
        // outward from the centre where there is no push direction, along it otherwise
        const ox = (i - cx) / Math.max(r * d, 1e-3);
        const oz = (j - cz) / Math.max(r * d, 1e-3);
        const bx = (dirX / len) * 0.7 + ox * 0.3;
        const bz = (dirZ / len) * 0.7 + oz * 0.3;
        this.trample[o] = clamp1(this.trample[o]! + bx * k * 0.5);
        this.trample[o + 1] = clamp1(this.trample[o + 1]! + bz * k * 0.5);
        this.trample[o + 2] = Math.min(1, this.trample[o + 2]! + k * 0.5);
      }
    }
    this.trampleDirty = true;
  }

  /**
   * A wind blowing out from a point over a disc — a rotor's downwash, a blast — `strength` 0..1: lays
   * the blades outward and sets them thrashing. Call every frame while it blows; it holds (the
   * strongest of this and what is there), it does not pile up.
   */
  blow(x: number, z: number, radiusM: number, strength: number): void {
    const n = TRAMPLE_N;
    const cx = (x - this.trampleX) / this.cellM + n / 2;
    const cz = (z - this.trampleZ) / this.cellM + n / 2;
    const r = radiusM / this.cellM;
    for (let j = Math.max(0, Math.floor(cz - r)); j <= Math.min(n - 1, Math.ceil(cz + r)); j++) {
      for (let i = Math.max(0, Math.floor(cx - r)); i <= Math.min(n - 1, Math.ceil(cx + r)); i++) {
        const dist = Math.hypot(i - cx, j - cz);
        const d = dist / r;
        if (d >= 1) continue;
        // the outflow is strongest a little way out from the centre, where the column turns along the ground
        const k = strength * Math.min(1, d * 3) * (1 - d * d);
        const ox = (i - cx) / Math.max(dist, 1e-3);
        const oz = (j - cz) / Math.max(dist, 1e-3);
        const o = (j * n + i) * 4;
        const t = this.trample;
        if (Math.abs(ox * k) > Math.abs(t[o]!)) t[o] = clamp1(ox * k);
        if (Math.abs(oz * k) > Math.abs(t[o + 1]!)) t[o + 1] = clamp1(oz * k);
        t[o + 2] = Math.max(t[o + 2]!, k * 0.55);
        t[o + 3] = Math.max(t[o + 3]!, Math.min(1, strength * (1 - d)));
      }
    }
    this.trampleDirty = true;
  }

  /**
   * Once per frame: tiles for each ring around the camera, trampling recovery and scrolling. The
   * trampling map follows `focus` (default the camera): the player, or a helicopter seen from its chase camera.
   */
  update(camera: Vector3, dtS: number, verticalFovDeg: number, viewportHeightPx: number, focus?: { x: number; z: number }): void {
    this.pixelAngle.value = ((verticalFovDeg * Math.PI) / 180) / Math.max(1, viewportHeightPx);
    this.updateTrample(focus ?? camera, dtS);
    const tm = this.opts.tileM;
    const R = this.opts.radiusM;
    const ci = Math.floor(camera.x / tm);
    const cj = Math.floor(camera.z / tm);
    const reach = Math.ceil(R / tm) + 1;
    const counts = [0, 0, 0];
    for (let dj = -reach; dj <= reach; dj++) {
      for (let di = -reach; di <= reach; di++) {
        const x0 = (ci + di) * tm;
        const z0 = (cj + dj) * tm;
        // the ring is chosen by the tile's nearest point, so blades never outrun their ring's range
        const nx = Math.max(x0, Math.min(camera.x, x0 + tm));
        const nz = Math.max(z0, Math.min(camera.z, z0 + tm));
        const d = Math.hypot(nx - camera.x, nz - camera.z);
        if (d >= R) continue;
        const ring = this.rings.find((r) => d >= r.from && d < r.to) ?? this.rings[this.rings.length - 1]!;
        const k = counts[ring.bladeIdx]!;
        if (k * 3 + 3 > ring.tiles.array.length) continue;
        const a = ring.tiles.array as Float32Array;
        a[k * 3] = x0;
        a[k * 3 + 1] = z0;
        // one of 8 orientations per tile, hashed from its grid position, hides the repeat
        a[k * 3 + 2] = (((ci + di) * 73856093) ^ ((cj + dj) * 19349663)) & 7;
        counts[ring.bladeIdx] = k + 1;
      }
    }
    for (const r of this.rings) {
      const k = counts[r.bladeIdx]!;
      r.geometry.instanceCount = k;
      r.tiles.clearUpdateRanges();
      r.tiles.addUpdateRange(0, Math.max(1, k) * 3);
      r.tiles.needsUpdate = true;
    }
  }

  private updateTrample(focus: { x: number; z: number }, dtS: number): void {
    const n = TRAMPLE_N;
    const cell = this.cellM;
    // keep the window centred: shift the map by whole texels when the focus has moved 4 m
    const sx = Math.round((focus.x - this.trampleX) / cell);
    const sz = Math.round((focus.z - this.trampleZ) / cell);
    if (Math.abs(sx) * cell > 4 || Math.abs(sz) * cell > 4) {
      const old = this.trample.slice();
      this.trample.fill(0);
      for (let j = 0; j < n; j++) {
        const oj = j + sz;
        if (oj < 0 || oj >= n) continue;
        for (let i = 0; i < n; i++) {
          const oi = i + sx;
          if (oi < 0 || oi >= n) continue;
          const d = (j * n + i) * 4;
          const s = (oj * n + oi) * 4;
          this.trample[d] = old[s]!;
          this.trample[d + 1] = old[s + 1]!;
          this.trample[d + 2] = old[s + 2]!;
          this.trample[d + 3] = old[s + 3]!;
        }
      }
      this.trampleX += sx * cell;
      this.trampleZ += sz * cell;
      this.trampleDirty = true;
    }
    this.trampleOrigin.value.set(this.trampleX, this.trampleZ);
    if (!this.trampleDirty || dtS <= 0) return;
    const decay = Math.exp(-dtS / TRAMPLE_RECOVER_S);
    const calm = Math.exp(-dtS / AGITATION_DECAY_S);
    let any = false;
    const b = this.trampleBytes;
    for (let i = 0; i < this.trample.length; i += 4) {
      const x = this.trample[i]! * decay;
      const z = this.trample[i + 1]! * decay;
      const f = this.trample[i + 2]! * decay;
      const a = this.trample[i + 3]! * calm;
      this.trample[i] = Math.abs(x) < 1e-3 ? 0 : x;
      this.trample[i + 1] = Math.abs(z) < 1e-3 ? 0 : z;
      this.trample[i + 2] = f < 1e-3 ? 0 : f;
      this.trample[i + 3] = a < 1e-3 ? 0 : a;
      if (f >= 1e-3 || a >= 1e-3 || Math.abs(x) >= 1e-3 || Math.abs(z) >= 1e-3) any = true;
      b[i] = Math.round((x * 0.5 + 0.5) * 255);
      b[i + 1] = Math.round((z * 0.5 + 0.5) * 255);
      b[i + 2] = Math.round(f * 255);
      b[i + 3] = Math.round(a * 255);
    }
    this.trampleTex.needsUpdate = true;
    // nothing left to recover: stop re-uploading until the next stamp
    this.trampleDirty = any;
  }
}

function clamp1(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}
