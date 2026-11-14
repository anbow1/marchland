import { Color, DynamicDrawUsage, InstancedMesh, Matrix4, Quaternion, type Scene, Vector3 } from 'three/webgpu';
import { FIELDS } from '../config.ts';
import type { Building } from '../sim/economy.ts';
import { heightAtM } from '../sim/terrain.ts';
import type { World } from '../sim/world.ts';
import { MeshBuilder, type Paint } from './meshBuilder.ts';
import { layerOf, surfaceMaterial, type SurfaceLibrary } from './surfaces.ts';
import { cardMaterial, vineRowGeometry } from './foliage.ts';

// The vines on a vineyard's strips: rows of posts and wires with the leaves
// trained along them, running across the strip, and bunches of grapes that
// swell and darken as the vintage comes. A strip not yet planted is bare; a
// young planting is low; the rows are as many as the strip is wide.

/** Metres between rows, and the length of one segment of a row (one instance). */
const ROW_GAP_M = 1.6;
const SEGMENT_M = 2.4;
const MAX_SEGMENTS = 2400;
const POST = 0x5c4a3a;
const GRAPE = 0xffffff;

function segmentGeometry(paints: Map<number, Paint>): MeshBuilder {
  const b = new MeshBuilder(0, paints);
  // A post at one end, a wire, and the foliage trained along it.
  b.box(-SEGMENT_M / 2, 0, 0, 0.08, 1.35, 0.08, POST);
  b.box(0, 1.1, 0, SEGMENT_M, 0.02, 0.02, POST);
  b.box(0, 0.25, 0, 0.1, 0.35, 0.1, POST);
  return b;
}

function grapesGeometry(): MeshBuilder {
  const b = new MeshBuilder(0, new Map());
  for (let i = 0; i < 6; i++) {
    const x = -SEGMENT_M / 2 + 0.25 + i * 0.38;
    const side = i % 2 === 0 ? 1 : -1;
    b.box(x, 0.45, side * 0.24, 0.14, 0.2, 0.12, GRAPE);
  }
  return b;
}

export class VinesView {
  private readonly vines: InstancedMesh;
  private readonly grapes: InstancedMesh;
  /** The leaves trained along each segment, as cards. */
  private readonly leaves: InstancedMesh;
  private readonly m = new Matrix4();
  private readonly p = new Vector3();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly tint = new Color();
  private signature = '';

  constructor(scene: Scene, lib: SurfaceLibrary) {
    const paints = new Map<number, Paint>([
      [POST, { layer: layerOf('bark'), sizeM: lib.sizeM.bark, tintHex: 0xffffff }],
    ]);
    const material = surfaceMaterial(lib, 'vines');
    this.vines = new InstancedMesh(segmentGeometry(paints).build(), material, MAX_SEGMENTS);
    this.grapes = new InstancedMesh(grapesGeometry().build(), surfaceMaterial(lib, 'grapes'), MAX_SEGMENTS);
    this.leaves = new InstancedMesh(vineRowGeometry(SEGMENT_M, 41), cardMaterial('leaves'), MAX_SEGMENTS);
    this.leaves.name = 'vine leaves';
    for (const mesh of [this.vines, this.grapes, this.leaves]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.setColorAt(0, new Color(1, 1, 1));
      scene.add(mesh);
    }
    this.vines.name = 'vines';
    this.grapes.name = 'grapes';
  }

  /** Redraws when a strip is planted or its grapes have grown a step. */
  update(world: World): void {
    let signature = '';
    for (const town of world.towns) {
      for (const b of town.plots) {
        if (!b || b.kind !== 'vineyard') continue;
        signature += `|${b.x.toFixed(1)}${b.level}`;
        for (const strip of b.strips) signature += strip.state === 'wild' ? 'w' : strip.state === 'ripe' ? 'r' : Math.floor(strip.growth * 30);
      }
    }
    if (signature === this.signature) return;
    this.signature = signature;
    let vines = 0;
    let grapes = 0;
    for (const town of world.towns) {
      for (const b of town.plots) {
        if (!b || b.kind !== 'vineyard') continue;
        const worked = Math.min(FIELDS.stripsPerLevel[b.level - 1] as number, b.strips.length);
        for (let i = 0; i < worked; i++) {
          const strip = b.strips[i] as Building['strips'][number];
          if (strip.state === 'wild') continue;
          [vines, grapes] = this.plantStrip(b, strip, vines, grapes);
        }
      }
    }
    this.vines.count = vines;
    this.leaves.count = vines;
    this.grapes.count = grapes;
    for (const mesh of [this.vines, this.grapes, this.leaves]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private plantStrip(b: Building, strip: Building['strips'][number], vines: number, grapes: number): [number, number] {
    // Rows run across the strip (along the building's side axis), spaced along its depth.
    const across = { x: Math.cos(b.yawRad), z: -Math.sin(b.yawRad) };
    const deep = { x: Math.sin(b.yawRad), z: Math.cos(b.yawRad) };
    const rows = Math.max(1, Math.floor(FIELDS.stripWidthM / ROW_GAP_M));
    const segments = Math.max(1, Math.floor(FIELDS.stripLengthM / SEGMENT_M));
    // The first season the vines are young and low; after that, full grown.
    const ripe = strip.state === 'ripe';
    const height = 0.55 + 0.45 * Math.min(1, strip.growth * 1.5 + (ripe ? 1 : 0));
    const bunch = ripe ? 1 : Math.max(0, (strip.growth - 0.35) / 0.65);
    this.q.setFromAxisAngle(this.up, b.yawRad);
    for (let r = 0; r < rows; r++) {
      const d = (r - (rows - 1) / 2) * ROW_GAP_M;
      for (let k = 0; k < segments; k++) {
        if (vines >= MAX_SEGMENTS) return [vines, grapes];
        const a = (k - (segments - 1) / 2) * SEGMENT_M;
        const x = strip.x + across.x * a + deep.x * d;
        const z = strip.z + across.z * a + deep.z * d;
        this.p.set(x, heightAtM(x, z), z);
        this.s.set(1, height, 1);
        this.vines.setMatrixAt(vines, this.m.compose(this.p, this.q, this.s));
        // Leaves turn a little yellow as the grapes ripen.
        const yellow = bunch * 0.25;
        this.vines.setColorAt(vines, this.tint.setRGB(1, 1, 1));
        this.leaves.setMatrixAt(vines, this.m);
        this.leaves.setColorAt(vines, this.tint.setHex(0x5f8a30).multiplyScalar(1.5).lerp(new Color(0xb09a3c), yellow));
        vines++;
        if (bunch > 0.05) {
          const size = 0.4 + 0.6 * bunch;
          this.s.set(1, size * height, size);
          this.grapes.setMatrixAt(grapes, this.m.compose(this.p, this.q, this.s));
          // Green bunches darken to purple.
          this.grapes.setColorAt(grapes, this.tint.setRGB(0.35 - 0.2 * bunch, 0.45 - 0.38 * bunch, 0.12 + 0.12 * bunch));
          grapes++;
        }
      }
    }
    return [vines, grapes];
  }
}
