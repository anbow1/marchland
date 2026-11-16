import { BufferAttribute, BufferGeometry, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, type Scene } from 'three/webgpu';
import type { World } from '../sim/world.ts';
import type { BuildingKind } from '../sim/types.ts';
import { boneTexture, type RiggedModel, skinnedMaterial } from './armyView.ts';
import { groundUnder } from './townView.ts';

/**
 * Craftsmen drawn at work by their workshops: a modelled, animated man (tools/blender/baked.py) who goes
 * about his yard while the workshop works. One instanced, skinned mesh; each man's frame in the clip is
 * his own, so no two smiths move as one.
 */

/** The workshops a smith works at, and where in front of the door his round starts (the plot's own x, z). */
const SMITH_AT: ReadonlySet<BuildingKind> = new Set(['smelter', 'smithy', 'armourer']);
const SMITH_SPOT: [number, number] = [0, 4.6];
const CAPACITY = 64;

export class WorkersView {
  private smiths: InstancedMesh | null = null;
  private place: InstancedBufferAttribute | null = null;
  private frame: InstancedBufferAttribute | null = null;
  private frames = 1;
  private fps = 12;

  constructor(private readonly scene: Scene) {}

  /** Loads the smith; without the file there are simply no smiths drawn. */
  async load(base: string): Promise<void> {
    try {
      const model = (await (await fetch(`${base}people/smith.json`)).json()) as RiggedModel;
      const clip = model.clips[0];
      if (!clip) return;
      this.frames = clip.frames;
      this.fps = clip.fps;
      const n = model.positions.length / 3;
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(model.positions), 3));
      g.setAttribute('normal', new BufferAttribute(new Float32Array(model.normals), 3));
      g.setAttribute('color', new BufferAttribute(new Float32Array(model.colours), 3));
      g.setAttribute('aSurface', new BufferAttribute(new Float32Array(model.surface), 3));
      g.setAttribute('aSkin', new BufferAttribute(new Float32Array(model.skin), 4));
      g.setAttribute('aWeight', new BufferAttribute(new Float32Array(model.weights), 4));
      // No swinging legs, no turn of the shoulders, no fall: the clip moves him.
      g.setAttribute('aPart', new BufferAttribute(new Float32Array(n * 4), 4));
      g.setIndex(model.triangles);
      g.computeBoundingSphere();
      const instanced = (size: number): InstancedBufferAttribute => {
        const a = new InstancedBufferAttribute(new Float32Array(CAPACITY * size), size);
        a.setUsage(DynamicDrawUsage);
        return a;
      };
      this.place = instanced(4);
      this.frame = instanced(1);
      g.setAttribute('aPlace', this.place);
      g.setAttribute('aAnim', instanced(4));
      g.setAttribute('aSide', instanced(1));
      g.setAttribute('aFrame', this.frame);
      const mesh = new InstancedMesh(g, skinnedMaterial(boneTexture(model)), CAPACITY);
      mesh.name = 'smiths';
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.smiths = mesh;
    } catch {
      this.smiths = null;
    }
  }

  update(world: World): void {
    const mesh = this.smiths;
    const place = this.place;
    const frame = this.frame;
    if (!mesh || !place || !frame) return;
    let count = 0;
    const p = place.array as Float32Array;
    const f = frame.array as Float32Array;
    for (const town of world.towns) {
      for (let slot = 0; slot < town.plots.length; slot++) {
        const b = town.plots[slot];
        if (!b || !SMITH_AT.has(b.kind) || b.constructionLeftS > 0 || b.workRate <= 0 || count >= CAPACITY) continue;
        const c = Math.cos(b.yawRad);
        const s = Math.sin(b.yawRad);
        const [lx, lz] = SMITH_SPOT;
        const x = b.x + lx * c + lz * s;
        const z = b.z - lx * s + lz * c;
        p[count * 4] = x;
        p[count * 4 + 1] = groundUnder(b.x, b.z, b.yawRad)[1];
        p[count * 4 + 2] = z;
        // The clip walks him towards his -Z: turned with the plot, that is from the door's front towards the door.
        p[count * 4 + 3] = b.yawRad;
        f[count] = Math.floor(world.timeS * this.fps + slot * 37 + town.side * 101) % this.frames;
        count++;
      }
    }
    mesh.count = count;
    place.needsUpdate = true;
    frame.needsUpdate = true;
  }
}
