import { Color, DoubleSide, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicNodeMaterial, MeshStandardNodeMaterial, PlaneGeometry, Quaternion, RingGeometry, type Scene, Vector3 } from 'three/webgpu';
import { TOWN } from '../config.ts';
import { placeX, placeZ, type Regiment } from '../sim/regiment.ts';
import { heightAtM, townX, townZ } from '../sim/terrain.ts';
import { PLAYER } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import { MeshBuilder } from './meshBuilder.ts';
import { TEAM_HEX } from './palette.ts';

// What the player reads the field by: a banner over every regiment, rings
// under the men of selected regiments, ghost marks where they have been sent,
// a ring round the selected building, and the tiles of a road or a field the
// player is about to lay.

const MAX_BANNERS = 48;
const MAX_RINGS = 260;
/** Rings and plot outlines float this far above the ground so they do not fight it for depth. */
const LIFT_M = 0.12;

const SELECT_COLOUR = new Color(0xf2e6a0);
const GHOST_COLOUR = new Color(0x9fe08a);
const PLOT_SELECTED = new Color(0xffffff);
const TILE_OK = new Color(0x9fe08a);
const TILE_BAD = new Color(0xe0604a);
const MAX_TILES = 400;

/** Flat rectangles to draw on the ground this frame: the road being drawn, a farm's fields-to-be. */
export interface GroundTiles {
  /** x, z, length (across), width (deep), yaw: five numbers a tile. */
  values: number[];
  count: number;
  allowed: boolean;
}

export class Markers {
  private readonly banners: InstancedMesh;
  private readonly rings: InstancedMesh;
  private readonly plots: InstancedMesh;
  private readonly tiles: InstancedMesh;
  private readonly m = new Matrix4();
  private readonly p = new Vector3();
  private readonly q = new Quaternion();
  private readonly s = new Vector3(1, 1, 1);
  private readonly up = new Vector3(0, 1, 0);
  private readonly teamColours: [Color, Color] = [new Color(TEAM_HEX[0]), new Color(TEAM_HEX[1])];
  private readonly dim = new Color();

  constructor(scene: Scene) {
    // A banner: a pole and a flag; the instance colour tints the (white) flag.
    const b = new MeshBuilder();
    b.box(0, 0, 0, 0.09, 4.6, 0.09, 0x6a5038);
    b.quad([0.05, 4.5, 0], [0.05, 3.3, 0], [1.9, 3.3, 0], [1.9, 4.5, 0], 0xffffff);
    b.quad([1.9, 4.5, 0], [1.9, 3.3, 0], [0.05, 3.3, 0], [0.05, 4.5, 0], 0xffffff);
    this.banners = new InstancedMesh(b.build(), new MeshStandardNodeMaterial({ name: 'banner', vertexColors: true, roughness: 0.8 }), MAX_BANNERS);
    this.banners.name = 'banners';
    this.banners.castShadow = true;

    const flat = new MeshBasicNodeMaterial({ name: 'marker', transparent: true, opacity: 0.85, depthWrite: false, side: DoubleSide, fog: false });
    this.rings = new InstancedMesh(new RingGeometry(0.42, 0.56, 14).rotateX(-Math.PI / 2), flat, MAX_RINGS);
    this.rings.name = 'selection rings';
    this.plots = new InstancedMesh(new RingGeometry(TOWN.buildingRadiusM + 0.4, TOWN.buildingRadiusM + 0.9, 36).rotateX(-Math.PI / 2), flat, 1);
    this.plots.name = 'building ring';
    this.tiles = new InstancedMesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new MeshBasicNodeMaterial({ name: 'tiles', transparent: true, opacity: 0.5, depthWrite: false, side: DoubleSide, fog: false }), MAX_TILES);
    this.tiles.name = 'ground tiles';
    for (const mesh of [this.banners, this.rings, this.plots, this.tiles]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      // Every instance needs a colour slot from the start, or the first tint would rebuild the shader.
      mesh.setColorAt(0, SELECT_COLOUR);
      scene.add(mesh);
    }
    this.rings.renderOrder = 2;
    this.plots.renderOrder = 2;
    this.tiles.renderOrder = 2;
  }

  private ring(i: number, x: number, z: number, scale: number, colour: Color): void {
    this.p.set(x, heightAtM(x, z) + LIFT_M, z);
    this.q.identity();
    this.s.set(scale, 1, scale);
    this.rings.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    this.rings.setColorAt(i, colour);
  }

  /** `cameraYawRad` turns the flags to face the camera; `selected` holds regiment ids; `selectedPlot` is -1 for the keep, -2 for none. */
  update(world: World, selected: ReadonlySet<number>, selectedPlot: number, cameraYawRad: number, tiles: GroundTiles | null): void {
    let banners = 0;
    let rings = 0;
    for (const r of world.regiments) {
      if (r.aliveMen === 0) continue;
      if (banners < MAX_BANNERS) {
        this.p.set(r.centreX, heightAtM(r.centreX, r.centreZ), r.centreZ);
        this.q.setFromAxisAngle(this.up, -cameraYawRad);
        this.s.set(1, 1, 1);
        this.banners.setMatrixAt(banners, this.m.compose(this.p, this.q, this.s));
        // A routing regiment's banner is drained of colour.
        const colour = r.state === 'routing' ? this.dim.copy(this.teamColours[r.side]).lerp(SELECT_COLOUR, 0.75) : this.teamColours[r.side];
        this.banners.setColorAt(banners, colour);
        banners++;
      }
      if (!selected.has(r.id)) continue;
      const scale = r.def.cavalry ? 2 : 1;
      for (const s of r.soldiers) {
        if (!s.alive || rings >= MAX_RINGS) continue;
        this.ring(rings++, s.x, s.z, scale, SELECT_COLOUR);
      }
      rings = this.ghosts(r, rings, scale);
    }
    this.banners.count = banners;
    this.rings.count = rings;
    this.banners.instanceMatrix.needsUpdate = true;
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.banners.instanceColor) this.banners.instanceColor.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;

    // A ring round the selected building (or the keep).
    const town = world.towns[PLAYER];
    const b = selectedPlot >= 0 ? town.plots[selectedPlot] : null;
    if (b || selectedPlot === -1) {
      const x = b ? b.x : townX(PLAYER);
      const z = b ? b.z : townZ(PLAYER);
      const scale = b ? 1 : (TOWN.keepRadiusM + 1.5) / TOWN.buildingRadiusM;
      this.p.set(x, heightAtM(x, z) + LIFT_M * 2, z);
      this.q.identity();
      this.s.set(scale, 1, scale);
      this.plots.setMatrixAt(0, this.m.compose(this.p, this.q, this.s));
      this.plots.setColorAt(0, PLOT_SELECTED);
      this.plots.count = 1;
      this.plots.instanceMatrix.needsUpdate = true;
      if (this.plots.instanceColor) this.plots.instanceColor.needsUpdate = true;
    } else {
      this.plots.count = 0;
    }

    let shown = 0;
    if (tiles) {
      const colour = tiles.allowed ? TILE_OK : TILE_BAD;
      for (let i = 0; i < tiles.count && shown < MAX_TILES; i++) {
        const x = tiles.values[i * 5] as number;
        const z = tiles.values[i * 5 + 1] as number;
        this.p.set(x, heightAtM(x, z) + LIFT_M * 2.5, z);
        this.q.setFromAxisAngle(this.up, tiles.values[i * 5 + 4] as number);
        this.s.set(tiles.values[i * 5 + 2] as number, 1, tiles.values[i * 5 + 3] as number);
        this.tiles.setMatrixAt(shown, this.m.compose(this.p, this.q, this.s));
        this.tiles.setColorAt(shown, colour);
        shown++;
      }
    }
    this.tiles.count = shown;
    this.tiles.instanceMatrix.needsUpdate = true;
    if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
  }

  /** Small marks where a selected regiment's men will stand once its move is done. */
  private ghosts(r: Regiment, from: number, scale: number): number {
    if (r.order !== 'move') return from;
    let rings = from;
    for (let slot = 0; slot < r.aliveMen && rings < MAX_RINGS; slot++) {
      this.ring(rings++, placeX(r, slot, r.destX, r.destFacingRad), placeZ(r, slot, r.destZ, r.destFacingRad), scale * 0.55, GHOST_COLOUR);
    }
    return rings;
  }
}
