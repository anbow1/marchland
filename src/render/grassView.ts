import { float, max, smoothstep, texture, uniform, vec2, vec4 } from 'three/tsl';
import { type Texture, Vector2, type Vector3 } from 'three/webgpu';
import { MAP } from '../config.ts';
import { GrassField } from './grassField.ts';
import type { Quality } from './stage.ts';
import type { TerrainGrid } from './terrainView.ts';

// Grass blades round the camera when it is down near the ground, from the field the FPS games share
// (grassField.ts, docs/graphics-playbook.md §5.6): real Bezier blades placed by the GPU in tiles round
// the camera, three rings, three draw calls, rooted on the terrain mesh's own triangles. Where they grow
// is read in the shader from the same maps the ground is painted with: none in the woods, on rock, on
// the lake's muddy banks, nor on roads, yards and fields as people make them (the works map), so a new
// road is bare at once. From the usual strategy height a blade is under a pixel: the field is off there.

/** Camera height above the ground it looks at (m) below which the field is drawn. */
const VISIBLE_BELOW_M = 95;

export class GrassView {
  readonly field: GrassField;
  private readonly time = uniform(0);
  private visible = true;

  constructor(grid: TerrainGrid, works: Texture, quality: Quality) {
    const high = quality === 'high';
    const wind = uniform(new Vector2(1.6, 0.7));
    const { cover, extentM } = grid;
    this.field = new GrassField(
      { heights: grid.heights, originX: grid.originX, originZ: grid.originZ, cellM: grid.cellM, samplesX: grid.samples, samplesZ: grid.samples, split: 'bc' },
      (xz) => {
        const what = texture(cover, xz.div(extentM).add(0.5)).level(float(0));
        const made = texture(works, xz.div(MAP.sizeM).add(0.5)).level(float(0));
        // Open grassland: not wood, rock, mud, nor anything people have trodden, paved or ploughed.
        const open = float(1)
          .sub(smoothstep(0.35, 0.6, what.b))
          .mul(float(1).sub(smoothstep(0.25, 0.5, what.a)))
          .mul(float(1).sub(smoothstep(0.2, 0.45, max(what.g, made.r))))
          .mul(float(1).sub(smoothstep(0.2, 0.45, made.g)))
          .mul(float(1).sub(smoothstep(0.2, 0.45, made.a)));
        // Dry crests grow the paler, stiffer grass; the edge of the wood is shaded.
        const dry = smoothstep(0.5, 0.75, what.r);
        const inside = smoothstep(float(MAP.halfM + 40), float(MAP.halfM), max(xz.x.abs(), xz.y.abs()));
        const grow = open.mul(inside);
        return { density: vec4(grow.mul(float(1).sub(dry.mul(0.6))), grow.mul(dry).mul(0.6), 0, smoothstep(0.1, 0.5, what.b)) };
      },
      {
        tileM: 4,
        bladesPerTile: high ? 520 : 220,
        radiusM: high ? 52 : 34,
        wind: wind.add(vec2(0, 0)),
        time: this.time,
        // Seen from a strategy camera tens of metres up: fewer, broader, leaning blades read as tufts of
        // grass rather than a fine carpet (the Tanks settings, a little stronger again).
        widthScale: 3.6,
        heightScale: 1.4,
        leanScale: 2.0,
        rootShade: 0.88,
        // Linear albedo near the meadow the ground shader paints (its photograph's greens).
        colours: {
          meadow: [0.15, 0.29, 0.04],
          beach: [0.27, 0.29, 0.08],
          sedge: [0.09, 0.19, 0.05],
          dry: [0.26, 0.25, 0.08],
        },
        matte: true,
      },
    );
    this.field.group.name = 'grass';
  }

  /** Per frame: on near the ground only; tiles follow the camera, the wind blows. */
  update(camera: Vector3, groundY: number, timeS: number, dtS: number, fovDeg: number, viewportHeightPx: number): void {
    const on = camera.y - groundY < VISIBLE_BELOW_M;
    if (on !== this.visible) {
      this.visible = on;
      this.field.group.visible = on;
    }
    if (!on) return;
    this.time.value = timeS;
    this.field.update(camera, dtS, fovDeg, viewportHeightPx);
  }
}
