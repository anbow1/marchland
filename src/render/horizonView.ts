import { BufferAttribute, BufferGeometry, Mesh, MeshStandardNodeMaterial, PlaneGeometry, type Scene } from 'three/webgpu';
import { fbm2 } from '../core/noise.ts';
import { MAP } from '../config.ts';

// What lies beyond the map: wooded lowland out to a ring of hills, so a low
// camera sees a horizon instead of the edge of the world. Flat colour only;
// the haze turns it blue with distance, which is all the eye reads out there.

/** The ring of hills: where it starts, where its crest is, where it ends, and how high it stands. */
const HILLS_FROM_M = 1300;
const HILLS_CREST_M = 2100;
const HILLS_TO_M = 3000;
const HILLS_HEIGHT_M = 260;
const SEGMENTS = 160;

/** Canopy seen from afar, sRGB (pine foliage on the PBR sheet, darkened by its own shade). */
const WOODLAND = 0x2f3d26;

export function addHorizon(scene: Scene): void {
  const material = new MeshStandardNodeMaterial({ name: 'horizon', color: WOODLAND, roughness: 1, metalness: 0 });
  // The lowland: one big sheet just under the terrain mesh's edge.
  const lowland = new Mesh(new PlaneGeometry(2 * HILLS_TO_M, 2 * HILLS_TO_M).rotateX(-Math.PI / 2), material);
  lowland.name = 'lowland';
  lowland.position.y = -1.5;
  scene.add(lowland);

  // The hills: three rings of vertices (foot, crest, back), the crest raised by noise.
  const positions = new Float32Array((SEGMENTS + 1) * 3 * 3);
  const index: number[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const a = (i / SEGMENTS) * Math.PI * 2;
    const sin = Math.sin(a);
    const cos = Math.cos(a);
    // Sampled round a circle, so the first and last columns meet.
    const crest = HILLS_HEIGHT_M * (0.45 + 0.55 * (0.5 + 0.5 * fbm2(sin * 2.6 + 9.1, cos * 2.6 - 3.7, 4, MAP.terrainSeed + 5)));
    const rings: readonly (readonly [number, number])[] = [[HILLS_FROM_M, -1.5], [HILLS_CREST_M, crest], [HILLS_TO_M, -40]];
    rings.forEach(([radius, y], ring) => {
      const o = (i * 3 + ring) * 3;
      positions[o] = sin * radius;
      positions[o + 1] = y;
      positions[o + 2] = cos * radius;
    });
    if (i === SEGMENTS) continue;
    for (let ring = 0; ring < 2; ring++) {
      const p = i * 3 + ring;
      index.push(p, p + 3, p + 1, p + 1, p + 3, p + 4);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const hills = new Mesh(geometry, material);
  hills.name = 'hills';
  scene.add(hills);
}
