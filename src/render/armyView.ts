import { abs, attribute, cos, Fn, mix, normalLocal, sin, vec3 } from 'three/tsl';
import { Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshStandardNodeMaterial, type Node, type Scene } from 'three/webgpu';
import { ARMY, MISSILE, TOWER, UNITS } from '../config.ts';
import { arrowY } from '../sim/missiles.ts';
import type { Soldier } from '../sim/regiment.ts';
import { heightAtM, townX, townZ } from '../sim/terrain.ts';
import { enemyOf } from '../sim/types.ts';
import { groundUnder } from './townView.ts';
import { UNIT_KINDS, type UnitKind } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import { MeshBuilder } from './meshBuilder.ts';
import { TEAM_HEX } from './palette.ts';
import { soldierGeometry } from './soldierGeometry.ts';

// Every soldier on the field, one instanced mesh per kind of unit. The CPU
// writes nine numbers per man (place, heading, stride, strike, fall, side);
// the vertex shader swings legs, arms and weapons about the pivots stored in
// the geometry and puts the man where he stands. Arrows are a seventh
// instanced mesh.

/** Men of one kind on the field at once: both sides at the limit, plus the fallen still shown. */
const CAPACITY = 2 * ARMY.maxSoldiersPerSide + 40;
/** Leg swing at a full stride, and metres of ground one stride cycle covers (foot / horse). */
const WALK_SWING_RAD = 0.62;
const FOOT_STRIDE_M = 1.5;
const HORSE_STRIDE_M = 3.2;
/** A blow is a swing of this many radians that takes this long. */
const STRIKE_RAD = 1.35;
const STRIKE_S = 0.45;
/** A fallen man goes down in this time, then sinks out of sight over the last seconds he is shown. */
const FALL_S = 0.5;
const SINK_S = 2;
/** Size of the arrow model for each missile look: arrow, crossbow bolt, ballista bolt. */
const BOLT_SCALE: readonly number[] = [1, 0.7, 2.6];

interface KindMesh {
  mesh: InstancedMesh;
  /** Per man: x, y, z and yaw. */
  place: InstancedBufferAttribute;
  /** Per man: stride phase, stride strength, strike angle, fall angle. */
  anim: InstancedBufferAttribute;
  /** Per man: 0 or 1, which side he fights for. */
  side: InstancedBufferAttribute;
}

/**
 * The soldiers' material. three r186 applies an instance's matrix before `positionNode` runs, so a
 * limb could not be turned about its pivot in the model's own space; the meshes therefore keep
 * identity instance matrices and the shader does the whole placement itself: limb swing, the fall
 * of the dead, the turn to the heading, the move to the man's place.
 */
function soldierMaterial(mounted: boolean): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ name: mounted ? 'horseman' : 'footman' });
  const part = attribute('aPart', 'vec4') as Node<'vec4'>;
  const surface = attribute('aSurface', 'vec3') as Node<'vec3'>;
  const place = attribute('aPlace', 'vec4') as Node<'vec4'>;
  const anim = attribute('aAnim', 'vec4') as Node<'vec4'>;
  const side = attribute('aSide', 'float') as Node<'float'>;
  const teams = [new Color(TEAM_HEX[0]), new Color(TEAM_HEX[1])] as const;

  /** A point or a normal taken through the fall and the yaw. */
  const pose = (v: Node<'vec3'>): Node<'vec3'> => {
    const cf = cos(anim.w);
    const sf = sin(anim.w);
    // A man falls on his back (about his shoulders' axis), a horse on its side (about its length).
    const fallen = mounted ? vec3(v.x.mul(cf).sub(v.y.mul(sf)), v.x.mul(sf).add(v.y.mul(cf)), v.z) : vec3(v.x, v.y.mul(cf).sub(v.z.mul(sf)), v.y.mul(sf).add(v.z.mul(cf)));
    const cy = cos(place.w);
    const sy = sin(place.w);
    return vec3(fallen.x.mul(cy).add(fallen.z.mul(sy)), fallen.y, fallen.z.mul(cy).sub(fallen.x.mul(sy)));
  };

  m.positionNode = Fn(() => {
    const p = attribute('position', 'vec3') as Node<'vec3'>;
    // Each limb turns about its pivot: a line along X at height part.x and depth part.y.
    const angle = part.z.mul(sin(anim.x)).mul(anim.y).mul(WALK_SWING_RAD).add(part.w.mul(anim.z));
    const c = cos(angle);
    const s = sin(angle);
    const ry = p.y.sub(part.x);
    const rz = p.z.sub(part.y);
    const bob = abs(sin(anim.x)).mul(anim.y).mul(0.05);
    const swung = vec3(p.x, part.x.add(ry.mul(c)).add(rz.mul(s)).add(bob), part.y.sub(ry.mul(s)).add(rz.mul(c)));
    normalLocal.assign(pose(attribute('normal', 'vec3') as Node<'vec3'>));
    return pose(swung).add(place.xyz);
  })();
  m.colorNode = mix(attribute('color', 'vec3') as Node<'vec3'>, mix(vec3(teams[0].r, teams[0].g, teams[0].b), vec3(teams[1].r, teams[1].g, teams[1].b), side), surface.z);
  m.metalnessNode = surface.x;
  m.roughnessNode = surface.y;
  return m;
}

export class ArmyView {
  private readonly kinds = new Map<UnitKind, KindMesh>();
  private readonly arrows: InstancedMesh;
  private readonly stones: InstancedMesh;

  constructor(scene: Scene) {
    const footman = soldierMaterial(false);
    const horseman = soldierMaterial(true);
    const identity = new Matrix4();
    for (const kind of UNIT_KINDS) {
      const geometry = soldierGeometry(kind);
      const place = new InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4);
      const anim = new InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4);
      const side = new InstancedBufferAttribute(new Float32Array(CAPACITY), 1);
      for (const attr of [place, anim, side]) attr.setUsage(DynamicDrawUsage);
      geometry.setAttribute('aPlace', place);
      geometry.setAttribute('aAnim', anim);
      geometry.setAttribute('aSide', side);
      const mesh = new InstancedMesh(geometry, UNITS[kind].cavalry ? horseman : footman, CAPACITY);
      mesh.name = `soldiers ${kind}`;
      for (let i = 0; i < CAPACITY; i++) mesh.setMatrixAt(i, identity);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // The shader places the men: the mesh's own bounds mean nothing.
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.kinds.set(kind, { mesh, place, anim, side });
    }
    // An arrow: a 75 cm shaft along −Z with fletching.
    const b = new MeshBuilder();
    b.box(0, -0.012, 0, 0.024, 0.024, 0.75, 0x8a7a5a);
    b.box(0, -0.04, 0.33, 0.08, 0.08, 0.1, 0xd8d2c0);
    const arrowMaterial = new MeshStandardNodeMaterial({ name: 'arrow', vertexColors: true, roughness: 0.8 });
    this.arrows = new InstancedMesh(b.build(), arrowMaterial, MISSILE.poolSize);
    this.arrows.name = 'arrows';
    this.arrows.instanceMatrix.setUsage(DynamicDrawUsage);
    this.arrows.count = 0;
    this.arrows.frustumCulled = false;
    scene.add(this.arrows);
    // A trebuchet's stone: about 45 cm across.
    const stone = new MeshBuilder();
    stone.cylinder(0, -0.2, 0, 0.16, 0.23, 0.2, 7, 0x7a7672);
    stone.cylinder(0, 0, 0, 0.23, 0.12, 0.2, 7, 0x8a857e);
    this.stones = new InstancedMesh(stone.build(), arrowMaterial, 32);
    this.stones.name = 'stones';
    this.stones.instanceMatrix.setUsage(DynamicDrawUsage);
    this.stones.count = 0;
    this.stones.frustumCulled = false;
    this.stones.castShadow = true;
    scene.add(this.stones);
  }

  /** Writes one man into slot `i` of his kind's mesh. */
  private write(k: KindMesh, i: number, s: Soldier): void {
    const r = s.regiment;
    let fall = 0;
    let y = heightAtM(s.x, s.z);
    if (!s.alive) {
      fall = Math.min(1, s.deadS / FALL_S) * (Math.PI / 2);
      y -= Math.max(0, s.deadS - (ARMY.bodySeconds - SINK_S)) * 0.45;
    }
    const p = k.place.array as Float32Array;
    p[i * 4] = s.x;
    p[i * 4 + 1] = y;
    p[i * 4 + 2] = s.z;
    // The models face −Z; a heading h looks along (sin h, cos h): turn by h + π.
    p[i * 4 + 3] = s.headingRad + Math.PI;
    const a = k.anim.array as Float32Array;
    const speed = s.alive ? Math.hypot(s.vx, s.vz) : 0;
    const stride = r.def.cavalry ? HORSE_STRIDE_M : FOOT_STRIDE_M;
    // Wrapped to one turn: a large angle loses precision in a 32-bit sine.
    a[i * 4] = ((s.strideM / stride) % 1) * Math.PI * 2;
    // Legs swing fully from a brisk walk up; a shuffle into place barely moves them.
    a[i * 4 + 1] = Math.min(1, speed / (r.def.walkSpeedMs * 0.9));
    const strike = s.alive && s.sinceAttackS < STRIKE_S ? Math.sin((s.sinceAttackS / STRIKE_S) * Math.PI) : 0;
    a[i * 4 + 2] = strike * STRIKE_RAD;
    a[i * 4 + 3] = fall;
    (k.side.array as Float32Array)[i] = r.side;
  }

  update(world: World): void {
    for (const k of this.kinds.values()) k.mesh.count = 0;
    for (const r of world.regiments) {
      const k = this.kinds.get(r.kind) as KindMesh;
      for (const s of r.soldiers) {
        if (!s.alive && s.deadS >= ARMY.bodySeconds) continue;
        if (k.mesh.count >= CAPACITY) break;
        this.write(k, k.mesh.count++, s);
      }
    }
    this.writeGarrisons(world);
    for (const k of this.kinds.values()) {
      k.place.needsUpdate = true;
      k.anim.needsUpdate = true;
      k.side.needsUpdate = true;
    }
    this.updateArrows(world);
  }

  /** The men manning each watchtower, on its top: one at each corner, looking out towards the enemy's keep. */
  private writeGarrisons(world: World): void {
    for (const town of world.towns) {
      const foe = enemyOf(town.side);
      for (const b of town.plots) {
        if (!b || b.kind !== 'tower' || b.garrison <= 0 || b.garrisonKind === null || b.constructionLeftS > 0) continue;
        const k = this.kinds.get(b.garrisonKind) as KindMesh;
        const top = groundUnder(b.x, b.z, b.yawRad)[1] + TOWER.topM;
        const look = Math.atan2(townX(foe) - b.x, townZ(foe) - b.z);
        // Drawing and loosing while the tower shoots: a man's arms come up for the first part of each reload.
        const reload = UNITS[b.garrisonKind].reloadS / Math.max(1, b.garrison);
        const strike = b.shotS > reload * 0.6 ? Math.sin(((reload - b.shotS) / (reload * 0.4)) * Math.PI) : 0;
        const c = Math.cos(b.yawRad);
        const sn = Math.sin(b.yawRad);
        for (let m = 0; m < Math.min(b.garrison, TOWER.maxGarrison); m++) {
          if (k.mesh.count >= CAPACITY) break;
          const i = k.mesh.count++;
          // The corners of the platform, turned with the tower.
          const ax = (m % 2 === 0 ? -1 : 1) * 1.3;
          const az = (m < 2 ? -1 : 1) * 1.3;
          const p = k.place.array as Float32Array;
          p[i * 4] = b.x + ax * c + az * sn;
          p[i * 4 + 1] = top;
          p[i * 4 + 2] = b.z - ax * sn + az * c;
          p[i * 4 + 3] = look + Math.PI;
          const a = k.anim.array as Float32Array;
          a[i * 4] = 0;
          a[i * 4 + 1] = 0;
          a[i * 4 + 2] = m === 0 ? strike * STRIKE_RAD : 0;
          a[i * 4 + 3] = 0;
          (k.side.array as Float32Array)[i] = town.side;
        }
      }
    }
  }

  private updateArrows(world: World): void {
    const e = this.arrows.instanceMatrix.array as Float32Array;
    const st = this.stones.instanceMatrix.array as Float32Array;
    let n = 0;
    let stones = 0;
    for (const a of world.arrows) {
      if (!a.active) continue;
      const x = a.x0 + a.vx * a.ageS;
      const y = arrowY(a);
      const z = a.z0 + a.vz * a.ageS;
      if (a.look === 3) {
        if (stones >= 32) continue;
        // A stone tumbles: no heading, just a place.
        const o = stones * 16;
        st.fill(0, o, o + 16);
        st[o] = st[o + 5] = st[o + 10] = st[o + 15] = 1;
        st[o + 12] = x;
        st[o + 13] = y;
        st[o + 14] = z;
        stones++;
        continue;
      }
      // Forward (−Z of the model) along the velocity: build the basis from it.
      const vy = a.vy - MISSILE.gravityMs2 * a.ageS;
      const len = Math.hypot(a.vx, vy, a.vz) || 1;
      const fx = a.vx / len;
      const fy = vy / len;
      const fz = a.vz / len;
      // right = forward × up, normalised; up' = right × forward.
      const flat = Math.hypot(fx, fz) || 1;
      const rx = -fz / flat;
      const rz = fx / flat;
      const ux = -rz * fy;
      const uy = rz * fx - rx * fz;
      const uz = rx * fy;
      // A crossbow bolt is short and stout, a ballista's is a small spear.
      const size = BOLT_SCALE[a.look] ?? 1;
      const o = n * 16;
      e[o] = rx * size;
      e[o + 1] = 0;
      e[o + 2] = rz * size;
      e[o + 3] = 0;
      e[o + 4] = ux * size;
      e[o + 5] = uy * size;
      e[o + 6] = uz * size;
      e[o + 7] = 0;
      e[o + 8] = -fx * size;
      e[o + 9] = -fy * size;
      e[o + 10] = -fz * size;
      e[o + 11] = 0;
      e[o + 12] = x;
      e[o + 13] = y;
      e[o + 14] = z;
      e[o + 15] = 1;
      n++;
    }
    this.arrows.count = n;
    this.arrows.instanceMatrix.needsUpdate = true;
    this.stones.count = stones;
    this.stones.instanceMatrix.needsUpdate = true;
  }
}
