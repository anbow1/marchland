import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Color, DynamicDrawUsage, InstancedMesh, type Material, Matrix4, Mesh, Quaternion, type Scene, Vector3 } from 'three/webgpu';
import { GATE, WALLS } from '../config.ts';
import { cellX, cellZ } from '../sim/nav.ts';
import { heightAtM } from '../sim/terrain.ts';
import type { Gate, World } from '../sim/world.ts';
import { surfacePaint } from './buildingParts.ts';
import { MeshBuilder, type Paint } from './meshBuilder.ts';
import { surfaceGeometry, surfaceModel, type SurfaceModel } from './surfaceModel.ts';
import { freshUrl } from '../version.ts';
import { surfaceMaterial, type SurfaceLibrary } from './surfaces.ts';

// The walls: a stretch of masonry with a merlon for every 2 m cell, turned along the line it was
// drawn on (diagonal cells are stretched to meet). Battered stretches crumble lower and darken; fallen ones lie
// as heaps of their stone, spilled to both sides.
// The stretch is public/buildings/wall.glb (tools/blender/walls.py, from LucasPresoto's Tower and
// Castle Walls); until it loads, or if it does not, a plainer one from code. A gate (gate.glb, from the
// same set) stands in place of the stretches of its cells, its two leaves swinging open while the side's
// own men or people come near it; a gate with no model draws as plain wall.

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

/** A heap of fallen masonry over a 2 m cell: blocks and rubble of the wall's stone, spilling to both sides. */
function rubble(paints: Map<number, Paint>): MeshBuilder {
  const b = new MeshBuilder(0, paints);
  // Fixed scatter (the same heap everywhere, turned and scaled per cell): big blocks low, smaller ones on top.
  const blocks: [number, number, number, number, number, number][] = [
    [0, 0.25, 0, 2.0, 0.5, 1.4],
    [-0.5, 0.55, 0.15, 0.9, 0.45, 0.8],
    [0.45, 0.5, -0.2, 0.8, 0.5, 0.7],
    [0.1, 0.85, 0.05, 0.7, 0.35, 0.55],
    [-0.8, 0.18, 1.1, 0.6, 0.36, 0.5],
    [0.7, 0.15, -1.15, 0.7, 0.3, 0.55],
    [0.2, 0.12, 1.4, 0.45, 0.24, 0.4],
    [-0.4, 0.1, -1.45, 0.5, 0.2, 0.35],
  ];
  blocks.forEach(([x, y, z, sx, sy, sz], i) => b.box(x, y - sy / 2, z, sx, sy, sz, i % 3 === 2 ? CAP : BODY));
  return b;
}

/** A number in [0, 1) from a cell index: each heap turned and sized its own way. */
function jitter(cell: number, k: number): number {
  const h = Math.imul(cell ^ (k * 0x9e3779b1), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

export class WallView {
  private readonly mesh: InstancedMesh;
  /** Where a stretch was battered down: heaps of its stone. */
  private readonly rubble: InstancedMesh;
  private readonly m = new Matrix4();
  private readonly p = new Vector3();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly c = new Color();
  private version = -1;
  private gateModel: SurfaceModel | null = null;
  private readonly gateMaterial: Material;
  /** One per gate in world.gates, in its order: the arch, its leaves, and how far open they are. */
  private readonly gates: { body: Mesh; leaves: Mesh[]; open: number }[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly lib: SurfaceLibrary,
  ) {
    this.gateMaterial = surfaceMaterial(lib, 'building');
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
    this.rubble = new InstancedMesh(rubble(paints).build(), surfaceMaterial(lib, 'wall rubble'), MAX_CELLS);
    this.rubble.name = 'wall rubble';
    this.rubble.instanceMatrix.setUsage(DynamicDrawUsage);
    this.rubble.count = 0;
    this.rubble.frustumCulled = false;
    this.rubble.castShadow = true;
    this.rubble.receiveShadow = true;
    scene.add(this.rubble);
  }

  /** Swaps the stretch from code for the modelled one; keeps the former if the file does not load. */
  async loadModel(base: string): Promise<void> {
    try {
      const gltf = await new GLTFLoader().loadAsync(freshUrl(base, 'buildings/wall.glb'));
      const old = this.mesh.geometry;
      this.mesh.geometry = surfaceGeometry(gltf.scene, this.lib);
      old.dispose();
    } catch (error) {
      console.warn(`[models] wall.glb did not load: ${String(error)}`);
    }
    try {
      const gltf = await new GLTFLoader().loadAsync(freshUrl(base, 'buildings/gate.glb'));
      this.gateModel = surfaceModel(gltf.scene, this.lib, 0xffffff);
    } catch (error) {
      console.warn(`[models] gate.glb did not load: ${String(error)}`);
    }
  }

  update(world: World, frameSeconds = 0): void {
    this.updateGates(world, frameSeconds);
    const nav = world.nav;
    if (nav.version === this.version) return;
    this.version = nav.version;
    let n = 0;
    let heaps = 0;
    for (let cell = 0; cell < nav.wallHp.length && n < MAX_CELLS; cell++) {
      const hp = nav.wallHp[cell] as number;
      if (hp === 0) {
        if (nav.wallRubble?.[cell] === 1 && heaps < MAX_CELLS) {
          const x = cellX(cell);
          const z = cellZ(cell);
          this.p.set(x, heightAtM(x, z), z);
          this.q.setFromAxisAngle(this.up, (YAW[nav.wallDir[cell] as number] as number) + (jitter(cell, 1) - 0.5) * 0.9);
          const size = 1.0 + jitter(cell, 2) * 0.45;
          this.s.set(size, 1.0 + jitter(cell, 3) * 0.7, size);
          this.rubble.setMatrixAt(heaps++, this.m.compose(this.p, this.q, this.s));
        }
        continue;
      }
      // A gate's cells are drawn by the gate (as wall when there is no gate model).
      if (nav.wallGate[cell] === 1 && this.gateModel) continue;
      const dir = nav.wallDir[cell] as number;
      const x = cellX(cell);
      const z = cellZ(cell);
      this.p.set(x, heightAtM(x, z), z);
      this.q.setFromAxisAngle(this.up, YAW[dir] as number);
      // Battered stretches crumble: lower (down to half their height as they near falling) and darker.
      const whole = Math.min(1, hp / WALLS.hp);
      this.s.set(STRETCH[dir] as number, whole >= 1 ? 1 : 0.5 + 0.5 * whole, 1);
      this.mesh.setMatrixAt(n, this.m.compose(this.p, this.q, this.s));
      const share = 0.55 + 0.45 * whole;
      this.mesh.setColorAt(n, this.c.setRGB(share, share, share));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.rubble.count = heaps;
    this.rubble.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Makes the meshes of gates new since the last frame, hides fallen ones, and swings the leaves. */
  private updateGates(world: World, frameSeconds: number): void {
    const model = this.gateModel;
    if (!model) return;
    while (this.gates.length < world.gates.length) {
      const g = world.gates[this.gates.length] as Gate;
      const body = new Mesh(model.body, this.gateMaterial);
      body.name = 'gate';
      body.castShadow = true;
      body.receiveShadow = true;
      body.position.set(g.x, heightAtM(g.x, g.z), g.z);
      body.rotation.y = YAW[g.dir] as number;
      // The model spans three cells: a wider gate (GATE.cells) stretches it, the leaves with it.
      body.scale.set(((STRETCH[g.dir] as number) * g.cells.length) / 3, 1, 1);
      const leaves = model.parts.map((part) => {
        const leaf = new Mesh(part.geometry, this.gateMaterial);
        leaf.position.copy(part.pivot);
        leaf.castShadow = true;
        leaf.userData['hingeSign'] = Math.sign(part.pivot.x) || 1;
        body.add(leaf);
        return leaf;
      });
      this.scene.add(body);
      this.gates.push({ body, leaves, open: 0 });
    }
    const nav = world.nav;
    world.gates.forEach((g, i) => {
      const view = this.gates[i] as (typeof this.gates)[number];
      view.body.visible = g.cells.some((c) => (nav.wallHp[c] as number) > 0);
      if (!view.body.visible) return;
      const want = this.ownNear(world, g) ? 1 : 0;
      const step = Math.min(1, frameSeconds * 1.6);
      view.open += Math.max(-step, Math.min(step, want - view.open));
      // Each leaf swings back on its hinge, inwards, about a right angle.
      for (const leaf of view.leaves) leaf.rotation.y = -(leaf.userData['hingeSign'] as number) * view.open * 1.45;
    });
  }

  /** True while one of the gate's own side's men or people is near it. */
  private ownNear(world: World, g: Gate): boolean {
    const r2 = GATE.openRadiusM * GATE.openRadiusM;
    for (const r of world.regiments) {
      if (r.side !== g.side || r.aliveMen === 0) continue;
      const reach = GATE.openRadiusM + r.radiusM;
      if ((r.centreX - g.x) ** 2 + (r.centreZ - g.z) ** 2 > reach * reach) continue;
      for (const s of r.soldiers) if (s.alive && (s.x - g.x) ** 2 + (s.z - g.z) ** 2 < r2) return true;
    }
    for (const p of world.people) if (p.alive && p.side === g.side && (p.x - g.x) ** 2 + (p.z - g.z) ** 2 < r2) return true;
    return false;
  }
}
