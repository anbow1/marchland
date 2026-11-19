import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Color, CylinderGeometry, DoubleSide, Mesh, MeshBasicNodeMaterial, type MeshStandardNodeMaterial, PlaneGeometry, RingGeometry, type Scene } from 'three/webgpu';
import { POINTS } from '../config.ts';
import type { Point } from '../sim/points.ts';
import { LAYOUT } from '../sim/layout.ts';
import { heightAtM, SIDE_X, SIDE_Z } from '../sim/terrain.ts';
import type { World } from '../sim/world.ts';
import { freshUrl } from '../version.ts';
import { TEAM_HEX } from './palette.ts';
import { surfaceModel } from './surfaceModel.ts';
import { surfaceMaterial, type SurfaceLibrary } from './surfaces.ts';

// The places in the middle (sim/points.ts): each a mast with a banner in its holder's colour (pale while
// no one holds it), a ring on the ground where a regiment must stand, and what makes it worth holding —
// a mine's adit, a quarry's face, a village's three houses — from the town's own building models.

const NEUTRAL = new Color(0xd8d0b8);
const MAST_M = 9;

/** The buildings at each kind of place: model, and its spot as (along the side axis, along the forward axis) from the place; doors face the place. */
const DRESSING: Record<Point['kind'], { model: string; at: [number, number] }[]> = {
  mine: [{ model: 'ironMine_1.glb', at: [13, 0] }],
  quarry: [{ model: 'quarry_1.glb', at: [-13, 0] }],
  village: [
    { model: 'house_1.glb', at: [15, 6] },
    { model: 'house_2.glb', at: [-15, -4] },
    { model: 'house_1.glb', at: [2, 17] },
  ],
};

/**
 * On the crossing the places stand on the river's line (the fords, the causeway): their buildings go on the banks,
 * beside the way over and back from the water, never at the ends of the crossing where the regiments come off it.
 */
const DRESSING_RIVER: Record<Point['kind'], { model: string; at: [number, number] }[]> = {
  mine: [{ model: 'ironMine_1.glb', at: [24, 24] }],
  quarry: [{ model: 'quarry_1.glb', at: [-24, -24] }],
  village: [
    { model: 'house_1.glb', at: [24, 26] },
    { model: 'house_2.glb', at: [-24, -27] },
    { model: 'house_1.glb', at: [-26, 30] },
  ],
};

export class PointsView {
  private readonly banners: { mesh: Mesh; material: MeshBasicNodeMaterial }[] = [];
  private readonly material: MeshStandardNodeMaterial;

  constructor(
    private readonly scene: Scene,
    private readonly lib: SurfaceLibrary,
    private readonly places: readonly Point[],
  ) {
    this.material = surfaceMaterial(lib, 'building');
    const mastMaterial = new MeshBasicNodeMaterial({ name: 'mast', color: 0x4a3b30 });
    for (const p of places) {
      const y = heightAtM(p.x, p.z);
      const mast = new Mesh(new CylinderGeometry(0.09, 0.12, MAST_M, 6), mastMaterial);
      mast.position.set(p.x, y + MAST_M / 2, p.z);
      mast.castShadow = true;
      scene.add(mast);
      const material = new MeshBasicNodeMaterial({ name: 'point banner', color: NEUTRAL.clone(), side: DoubleSide });
      const banner = new Mesh(new PlaneGeometry(2.6, 1.5), material);
      banner.position.set(p.x + 1.35, y + MAST_M - 0.9, p.z);
      banner.castShadow = true;
      scene.add(banner);
      this.banners.push({ mesh: banner, material });
      const ring = new Mesh(new RingGeometry(POINTS.radiusM - 0.6, POINTS.radiusM, 48).rotateX(-Math.PI / 2), new MeshBasicNodeMaterial({ name: 'point ring', color: 0xf2e6a0, transparent: true, opacity: 0.35, depthWrite: false }));
      ring.position.set(p.x, y + 0.15, p.z);
      ring.renderOrder = 2;
      scene.add(ring);
    }
  }

  /** Loads the buildings that dress the places; a place without them is still its mast and ring. */
  async load(base: string): Promise<void> {
    const loader = new GLTFLoader();
    const cache = new Map<string, Promise<ReturnType<typeof surfaceModel> | null>>();
    const modelOf = (file: string): Promise<ReturnType<typeof surfaceModel> | null> => {
      let job = cache.get(file);
      if (!job) {
        job = loader
          .loadAsync(freshUrl(base, `buildings/${file}`))
          .then((gltf) => surfaceModel(gltf.scene, this.lib, NEUTRAL.getHex()))
          .catch(() => null);
        cache.set(file, job);
      }
      return job;
    };
    // The forward axis is the side axis turned a right angle back.
    const fx = SIDE_Z;
    const fz = -SIDE_X;
    for (const p of this.places) {
      for (const d of (LAYOUT === 'river' ? DRESSING_RIVER : DRESSING)[p.kind]) {
        const model = await modelOf(d.model);
        if (!model) continue;
        const x = p.x + SIDE_X * d.at[0] + fx * d.at[1];
        const z = p.z + SIDE_Z * d.at[0] + fz * d.at[1];
        const mesh = new Mesh(model.body, this.material);
        mesh.position.set(x, heightAtM(x, z), z);
        // Doors towards the place.
        mesh.rotation.y = Math.atan2(p.x - x, p.z - z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
      }
    }
  }

  /** Banners in the holder's colours; a place being taken flickers towards the taker's. */
  update(world: World, nowS: number): void {
    world.points.forEach((p, i) => {
      const banner = this.banners[i];
      if (!banner) return;
      const base = p.owner === -1 ? NEUTRAL : new Color(TEAM_HEX[p.owner]);
      if (p.taker !== -1 && Math.sin(nowS * 6) > 0) banner.material.color.set(TEAM_HEX[p.taker]);
      else banner.material.color.copy(base);
      banner.mesh.rotation.y = Math.sin(nowS * 1.3 + i) * 0.25;
    });
  }
}
