import { CAMERA } from '../config.ts';
import { type Action, ActionState } from './bindings.ts';
import type { RtsCamera } from './rtsCamera.ts';

// Pointer and keyboard on the map. Mouse: left selects (drag for a box), right
// orders (drag to set the front, twice for a run), middle drags the map, the
// wheel zooms to the cursor. Touch: one finger drags the map, two pinch, a tap
// selects or orders. What the gestures mean is the game's business (`ControlTarget`).

export interface ControlTarget {
  /** Ground point under a screen point; false when there is none. */
  ground(screenX: number, screenY: number, out: { x: number; z: number }): boolean;
  /** A click or tap that selects. */
  select(screenX: number, screenY: number, additive: boolean): void;
  boxSelect(x0: number, y0: number, x1: number, y1: number, additive: boolean): void;
  showBox(x0: number, y0: number, x1: number, y1: number, visible: boolean): void;
  /** An order at a screen point; `faceX/faceZ` set when the player dragged out a facing. */
  order(screenX: number, screenY: number, run: boolean, faceToX: number | null, faceToZ: number | null): void;
  /** A tap: selects, or orders when troops are selected and the tap is not on something selectable. */
  tap(screenX: number, screenY: number, double: boolean): void;
  press(action: Action): void;
}

const DRAG_PX = 7;
const DOUBLE_MS = 380;

interface Pointer {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  button: number;
  touch: boolean;
  dragging: boolean;
}

export class Controls {
  readonly actions = new ActionState();
  private readonly pointers = new Map<number, Pointer>();
  private readonly a = { x: 0, z: 0 };
  private readonly b = { x: 0, z: 0 };
  private lastOrderMs = 0;
  private lastOrderX = 0;
  private lastOrderY = 0;
  private lastTapMs = 0;
  private pinchPx = 0;
  private mouseX = -1;
  private mouseY = -1;
  private mouseInside = false;
  /** Scrolling at the screen's edge; off for touch and for automated runs. */
  edgeScroll = true;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: RtsCamera,
    private readonly target: ControlTarget,
  ) {
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.cancel);
    canvas.addEventListener('wheel', this.wheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      this.mouseInside = true;
    });
    document.addEventListener('mouseleave', () => {
      this.mouseInside = false;
    });
    this.actions.listen((action) => target.press(action));
  }

  private readonly down = (e: PointerEvent): void => {
    this.canvas.setPointerCapture(e.pointerId);
    const touch = e.pointerType === 'touch';
    if (touch) this.edgeScroll = false;
    this.pointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, button: e.button, touch, dragging: false });
    if (this.pointers.size === 2) this.pinchPx = this.pinchDistance();
  };

  private pinchDistance(): number {
    const [p, q] = [...this.pointers.values()] as [Pointer, Pointer];
    return Math.hypot(p.x - q.x, p.y - q.y);
  }

  /** Slides the map so the ground point that was under (fromX, fromY) is under (toX, toY). */
  private dragMap(fromX: number, fromY: number, toX: number, toY: number): void {
    if (!this.target.ground(fromX, fromY, this.a) || !this.target.ground(toX, toY, this.b)) return;
    this.camera.jumpTo(this.camera.goal.targetX + this.a.x - this.b.x, this.camera.goal.targetZ + this.a.z - this.b.z);
    // A drag follows the finger: no easing behind it.
    this.camera.shown.targetX = this.camera.goal.targetX;
    this.camera.shown.targetZ = this.camera.goal.targetZ;
  }

  private readonly move = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const prevX = p.x;
    const prevY = p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (!p.dragging && Math.hypot(p.x - p.startX, p.y - p.startY) > DRAG_PX) p.dragging = true;
    if (this.pointers.size === 2 && p.touch) {
      // Pinch: zoom about the midpoint of the two fingers.
      const now = this.pinchDistance();
      const [first, second] = [...this.pointers.values()] as [Pointer, Pointer];
      if (this.pinchPx > 0 && now > 0 && this.target.ground((first.x + second.x) / 2, (first.y + second.y) / 2, this.a)) {
        this.camera.zoomAt(this.pinchPx / now, this.a.x, this.a.z);
      }
      this.pinchPx = now;
      for (const other of this.pointers.values()) other.dragging = true;
      return;
    }
    if (!p.dragging) return;
    if (p.touch || p.button === 1) this.dragMap(prevX, prevY, p.x, p.y);
    else if (p.button === 0) this.target.showBox(p.startX, p.startY, p.x, p.y, true);
  };

  private readonly up = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    const now = performance.now();
    if (p.touch) {
      if (!p.dragging) {
        this.target.tap(p.x, p.y, now - this.lastTapMs < DOUBLE_MS);
        this.lastTapMs = now;
      }
      return;
    }
    if (p.button === 0) {
      this.target.showBox(0, 0, 0, 0, false);
      if (p.dragging) this.target.boxSelect(p.startX, p.startY, p.x, p.y, this.actions.isHeld('add'));
      else this.target.select(p.x, p.y, this.actions.isHeld('add'));
    } else if (p.button === 2) {
      // The second of two quick clicks on one spot means "run".
      const double = now - this.lastOrderMs < DOUBLE_MS && Math.hypot(p.startX - this.lastOrderX, p.startY - this.lastOrderY) < 24;
      this.lastOrderMs = now;
      this.lastOrderX = p.startX;
      this.lastOrderY = p.startY;
      if (p.dragging && this.target.ground(p.x, p.y, this.a)) this.target.order(p.startX, p.startY, double, this.a.x, this.a.z);
      else this.target.order(p.startX, p.startY, double, null, null);
    }
  };

  private readonly cancel = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    this.target.showBox(0, 0, 0, 0, false);
  };

  private readonly wheel = (e: WheelEvent): void => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? CAMERA.zoomStepFactor : 1 / CAMERA.zoomStepFactor;
    if (this.target.ground(e.clientX, e.clientY, this.a)) this.camera.zoomAt(factor, this.a.x, this.a.z);
    else this.camera.zoomAt(factor, this.camera.goal.targetX, this.camera.goal.targetZ);
  };

  /** Held keys and the screen's edge, once per frame. */
  update(frameSeconds: number): void {
    const held = this.actions;
    let right = (held.isHeld('panRight') ? 1 : 0) - (held.isHeld('panLeft') ? 1 : 0);
    let forward = (held.isHeld('panForward') ? 1 : 0) - (held.isHeld('panBack') ? 1 : 0);
    if (this.edgeScroll && this.mouseInside && this.pointers.size === 0 && document.hasFocus()) {
      if (this.mouseX <= CAMERA.edgeScrollPx) right -= 1;
      else if (this.mouseX >= window.innerWidth - CAMERA.edgeScrollPx) right += 1;
      if (this.mouseY <= CAMERA.edgeScrollPx) forward += 1;
      else if (this.mouseY >= window.innerHeight - CAMERA.edgeScrollPx) forward -= 1;
    }
    if (right !== 0 || forward !== 0) {
      const stepM = this.camera.goal.distanceM * CAMERA.panSpeedPerDistance * frameSeconds;
      this.camera.pan(Math.sign(right) * stepM, Math.sign(forward) * stepM);
    }
    const turn = (held.isHeld('rotateRight') ? 1 : 0) - (held.isHeld('rotateLeft') ? 1 : 0);
    if (turn !== 0) this.camera.rotate(turn * CAMERA.rotateSpeedRadS * frameSeconds);
    const zoom = (held.isHeld('zoomOut') ? 1 : 0) - (held.isHeld('zoomIn') ? 1 : 0);
    if (zoom !== 0) this.camera.zoomAt(CAMERA.zoomStepFactor ** (zoom * frameSeconds * 4), this.camera.goal.targetX, this.camera.goal.targetZ);
  }
}
