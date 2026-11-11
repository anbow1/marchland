import { describe, expect, it } from 'vitest';
import { groundHit } from '../src/app/picking.ts';
import { pitchForDistance, RtsCamera } from '../src/app/rtsCamera.ts';
import { CAMERA, MAP, TOWN } from '../src/config.ts';
import { heightAtM, isForest, plotX, plotZ, townX, townZ } from '../src/sim/terrain.ts';

describe('strategy camera', () => {
  it('zoom keeps the point under the cursor in the same proportion to the target', () => {
    const cam = new RtsCamera(0, 0, 0);
    const before = cam.goal.distanceM;
    cam.zoomAt(0.5, 40, -20);
    expect(cam.goal.distanceM).toBeCloseTo(before * 0.5, 10);
    // The target has moved halfway to the anchor.
    expect(cam.goal.targetX).toBeCloseTo(20, 10);
    expect(cam.goal.targetZ).toBeCloseTo(-10, 10);
  });

  it('zoom stops at its limits and does not drift once there', () => {
    const cam = new RtsCamera(10, 10, 0);
    for (let i = 0; i < 40; i++) cam.zoomAt(1 / CAMERA.zoomStepFactor, 50, 50);
    expect(cam.goal.distanceM).toBe(CAMERA.minDistanceM);
    const x = cam.goal.targetX;
    cam.zoomAt(1 / CAMERA.zoomStepFactor, 50, 50);
    expect(cam.goal.targetX).toBe(x);
    for (let i = 0; i < 60; i++) cam.zoomAt(CAMERA.zoomStepFactor, 0, 0);
    expect(cam.goal.distanceM).toBe(CAMERA.maxDistanceM);
    expect(() => cam.zoomAt(0, 0, 0)).toThrow(/must be positive/);
  });

  it('panning follows the screen axes whichever way the camera is turned', () => {
    const north = new RtsCamera(0, 0, 0);
    north.pan(10, 0);
    expect(north.goal.targetX).toBeCloseTo(10, 10);
    north.pan(0, 10);
    // Forward at yaw 0 is north, −Z.
    expect(north.goal.targetZ).toBeCloseTo(-10, 10);
    const east = new RtsCamera(0, 0, Math.PI / 2);
    east.pan(0, 10);
    expect(east.goal.targetX).toBeCloseTo(10, 10);
    expect(east.goal.targetZ).toBeCloseTo(0, 10);
  });

  it('the view never leaves the map', () => {
    const cam = new RtsCamera(0, 0, 0);
    cam.pan(10_000, -10_000);
    expect(cam.goal.targetX).toBe(MAP.halfM);
    expect(cam.goal.targetZ).toBe(MAP.halfM);
    cam.jumpTo(-9999, -9999);
    expect(cam.goal.targetX).toBe(-MAP.halfM);
  });

  it('looks flatter up close than from afar, and eases to its goal', () => {
    expect(pitchForDistance(CAMERA.minDistanceM)).toBeCloseTo(CAMERA.pitchNearRad, 10);
    expect(pitchForDistance(CAMERA.maxDistanceM)).toBeCloseTo(CAMERA.pitchFarRad, 10);
    const cam = new RtsCamera(0, 0, 0);
    cam.jumpTo(100, 0);
    cam.update(0);
    expect(cam.shown.targetX).toBe(0);
    for (let i = 0; i < 120; i++) cam.update(1 / 60);
    expect(cam.shown.targetX).toBeCloseTo(100, 2);
    const offset = { x: 0, y: 0, z: 0 };
    cam.offset(offset);
    expect(Math.hypot(offset.x, offset.y, offset.z)).toBeCloseTo(cam.shown.distanceM, 8);
    expect(offset.z).toBeGreaterThan(0);
  });
});

describe('picking and the map', () => {
  it('a ray straight down hits the ground under it', () => {
    const hit = { x: 0, z: 0 };
    expect(groundHit({ ox: 30, oy: 200, oz: -40, dx: 0, dy: -1, dz: 0 }, hit)).toBe(true);
    expect(hit.x).toBeCloseTo(30, 6);
    expect(hit.z).toBeCloseTo(-40, 6);
  });

  it('a slanted ray lands on the terrain surface, and a ray at the sky misses', () => {
    const hit = { x: 0, z: 0 };
    const d = Math.SQRT1_2;
    expect(groundHit({ ox: 0, oy: 80, oz: 0, dx: d, dy: -d, dz: 0 }, hit)).toBe(true);
    // On the surface: the ray's height at the hit equals the ground's, within the bisection's step.
    const along = hit.x / d;
    expect(80 - along * d).toBeCloseTo(heightAtM(hit.x, hit.z), 1);
    expect(groundHit({ ox: 0, oy: 80, oz: 0, dx: d, dy: d, dz: 0 }, hit)).toBe(false);
  });

  it('towns stand on level, open ground and their plots do not overlap', () => {
    for (const side of [0, 1] as const) {
      expect(heightAtM(townX(side), townZ(side))).toBeCloseTo(0, 10);
      expect(isForest(townX(side), townZ(side))).toBe(false);
      for (let a = 0; a < TOWN.plotCount; a++) {
        expect(heightAtM(plotX(side, a), plotZ(side, a))).toBeCloseTo(0, 10);
        expect(Math.hypot(plotX(side, a) - townX(side), plotZ(side, a) - townZ(side))).toBeGreaterThan(TOWN.keepRadiusM + TOWN.buildingRadiusM);
        for (let b = a + 1; b < TOWN.plotCount; b++) {
          expect(Math.hypot(plotX(side, a) - plotX(side, b), plotZ(side, a) - plotZ(side, b))).toBeGreaterThan(2 * TOWN.buildingRadiusM);
        }
      }
    }
    expect(() => plotX(0, TOWN.plotCount)).toThrow(/plot/);
  });

  it('the field between the towns is open, and there is forest to fight in elsewhere', () => {
    for (let t = -0.6; t <= 0.6; t += 0.1) expect(isForest(t * MAP.townOffsetM, -t * MAP.townOffsetM)).toBe(false);
    let wooded = 0;
    for (let x = -190; x <= 190; x += 10) for (let z = -190; z <= 190; z += 10) if (isForest(x, z)) wooded++;
    expect(wooded).toBeGreaterThan(100);
    expect(wooded).toBeLessThan(39 * 39 * 0.5);
  });
});
