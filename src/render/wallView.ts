import { Color, DynamicDrawUsage, InstancedMesh, Matrix4, Quaternion, type Scene, Vector3 } from 'three/webgpu';
import { WALLS } from '../config.ts';
import { cellX, cellZ } from '../sim/nav.ts';
import { heightAtM } from '../sim/terrain.ts';
import type { World } from '../sim/world.ts';
import { surfacePaint } from './buildingParts.ts';
import { MeshBuilder, type Paint } from './meshBuilder.ts';
import { surfaceMaterial, type SurfaceLibrary } from './surfaces.ts';

// The walls: a stretch of masonry with two merlons for every 2 m cell, turned along the line it was
// drawn on (diagonal cells are stretched to meet). Battered stretches darken; fallen ones are gone.

const MAX_CELLS = 3000;
const BODY = 0x8f8a80;
const CAP = 0x979087;
/** Yaw and length factor of a cell's segment, by its line (nav.ts: 0 along X, 1 along Z, 2 and 3 diagonals). */
const YAW = [0, Math.PI / 2, -Math.PI / 4, Math.PI / 4];
const STRETCH = [1, 1, Math.SQRT2, Math.SQRT2];

function segment(paints: Map<number, Paint>): MeshBuilder {
  const b = new MeshBuilder(0, paints);
  b.box(0, -0.6, 0, 2.08, 3.0, 0.95, BODY);
  b.box(0, 2.4, 0, 2.08, 0.12, 1.05, CAP);
  for (const x of [-0.52, 0.52]) b.box(x, 2.52, 0, 0.6, 0.62, 1.0, CAP);
  return b;
}

export class WallView {
  private readonly mesh: InstancedMesh;
  private readonly m = new Matrix4();
  private readonly p = new Vector3();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly c = new Color();
  private version = -1;

  constructor(scene: Scene, lib: SurfaceLibrary) {
    const paints = new Map<number, Paint>([
      [BODY, surfacePaint(lib, 'rubble')],
      [CAP, surfacePaint(lib, 'ashlar', 0xf2efe8)],
    ]);
    this.mesh = new InstancedMesh(segment(paints).build(), surfaceMaterial(lib, 'walls'), MAX_CELLS);
    this.mesh.name = 'walls';
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.setColorAt(0, new Color(1, 1, 1));
    scene.add(this.mesh);
  }

  update(world: World): void {
    const nav = world.nav;
    if (nav.version === this.version) return;
    this.version = nav.version;
    let n = 0;
    for (let cell = 0; cell < nav.wallHp.length && n < MAX_CELLS; cell++) {
      const hp = nav.wallHp[cell] as number;
      if (hp === 0) continue;
      const dir = nav.wallDir[cell] as number;
      const x = cellX(cell);
      const z = cellZ(cell);
      this.p.set(x, heightAtM(x, z), z);
      this.q.setFromAxisAngle(this.up, YAW[dir] as number);
      this.s.set(STRETCH[dir] as number, 1, 1);
      this.mesh.setMatrixAt(n, this.m.compose(this.p, this.q, this.s));
      const share = 0.55 + 0.45 * (hp / WALLS.hp);
      this.mesh.setColorAt(n, this.c.setRGB(share, share, share));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
