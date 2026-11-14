import { CAMERA, MAP } from '../config.ts';

// The strategy camera as plain numbers (no three.js, so it is unit-tested):
// a point on the ground it looks at, a distance from it, and a compass turn.
// Pitch follows distance: flat up close to see the ranks, steep from afar to
// read the map. Goals are set by input; the shown values ease towards them.

export interface CameraPose {
  /** Point on the ground the camera looks at. */
  targetX: number;
  targetZ: number;
  distanceM: number;
  /** Turn about the vertical axis; 0 looks along −Z (north). */
  yawRad: number;
  /** The player's own tilt added to the pitch the zoom gives: below 0 flatter, above 0 steeper. */
  tiltRad: number;
}

export function clampDistance(distanceM: number): number {
  return Math.min(CAMERA.maxDistanceM, Math.max(CAMERA.minDistanceM, distanceM));
}

function clampTarget(v: number): number {
  return Math.min(MAP.halfM, Math.max(-MAP.halfM, v));
}

/** Angle below the horizon for a distance. */
export function pitchForDistance(distanceM: number): number {
  const t = (clampDistance(distanceM) - CAMERA.minDistanceM) / (CAMERA.maxDistanceM - CAMERA.minDistanceM);
  // Ease in: most of the steepening happens in the far half of the zoom.
  return CAMERA.pitchNearRad + (CAMERA.pitchFarRad - CAMERA.pitchNearRad) * Math.sqrt(t);
}

export class RtsCamera {
  readonly shown: CameraPose;
  readonly goal: CameraPose;

  constructor(targetX: number, targetZ: number, yawRad: number) {
    this.goal = { targetX: clampTarget(targetX), targetZ: clampTarget(targetZ), distanceM: CAMERA.startDistanceM, yawRad, tiltRad: 0 };
    this.shown = { ...this.goal };
  }

  /** Slides the view: `right` and `forward` in metres along the screen's axes on the ground. */
  pan(rightM: number, forwardM: number): void {
    const sin = Math.sin(this.goal.yawRad);
    const cos = Math.cos(this.goal.yawRad);
    // Forward at yaw 0 is −Z; right is +X.
    this.goal.targetX = clampTarget(this.goal.targetX + rightM * cos + forwardM * sin);
    this.goal.targetZ = clampTarget(this.goal.targetZ + rightM * sin - forwardM * cos);
  }

  rotate(deltaRad: number): void {
    this.goal.yawRad += deltaRad;
  }

  /** Tilts the view: below 0 flatter (towards the horizon), above 0 steeper (towards looking straight down). */
  tilt(deltaRad: number): void {
    this.goal.tiltRad = Math.min(CAMERA.maxTiltRad, Math.max(CAMERA.minTiltRad, this.goal.tiltRad + deltaRad));
  }

  /** Pitch of the shown pose: the zoom's own pitch plus the player's tilt, within bounds. */
  pitch(): number {
    return Math.min(CAMERA.maxPitchRad, Math.max(CAMERA.minPitchRad, pitchForDistance(this.shown.distanceM) + this.shown.tiltRad));
  }

  /**
   * Zooms by `factor` (below 1 = closer) keeping the ground point (anchorX, anchorZ) — the one under
   * the cursor — where it is on screen, as nearly as a change of pitch allows.
   */
  zoomAt(factor: number, anchorX: number, anchorZ: number): void {
    if (!(factor > 0)) throw new Error(`zoom factor '${factor}' must be positive`);
    const before = this.goal.distanceM;
    const after = clampDistance(before * factor);
    const share = after / before;
    this.goal.targetX = clampTarget(anchorX + (this.goal.targetX - anchorX) * share);
    this.goal.targetZ = clampTarget(anchorZ + (this.goal.targetZ - anchorZ) * share);
    this.goal.distanceM = after;
  }

  jumpTo(x: number, z: number): void {
    this.goal.targetX = clampTarget(x);
    this.goal.targetZ = clampTarget(z);
  }

  /** Eases the shown pose towards the goal. */
  update(dtSeconds: number): void {
    const k = 1 - Math.exp(-dtSeconds / CAMERA.smoothingS);
    this.shown.targetX += (this.goal.targetX - this.shown.targetX) * k;
    this.shown.targetZ += (this.goal.targetZ - this.shown.targetZ) * k;
    this.shown.distanceM += (this.goal.distanceM - this.shown.distanceM) * k;
    this.shown.yawRad += (this.goal.yawRad - this.shown.yawRad) * k;
    this.shown.tiltRad += (this.goal.tiltRad - this.shown.tiltRad) * k;
  }

  /** Makes the shown pose the goal at once (the first frame, a debug placement). */
  snap(): void {
    Object.assign(this.shown, this.goal);
  }

  /** Offset of the camera from its target for the shown pose: x, y (up), z. */
  offset(out: { x: number; y: number; z: number }): void {
    const pitch = this.pitch();
    const flat = Math.cos(pitch) * this.shown.distanceM;
    out.x = -Math.sin(this.shown.yawRad) * flat;
    out.y = Math.sin(pitch) * this.shown.distanceM;
    out.z = Math.cos(this.shown.yawRad) * flat;
  }
}
