// The rebindable layer between keys and what the game does (rules §10): the
// game asks for actions, never for key codes. `BINDINGS` is the one place a
// key is named; change it here (or load a player's own map into it) to rebind.

export type Action = 'panLeft' | 'panRight' | 'panForward' | 'panBack' | 'rotateLeft' | 'rotateRight' | 'zoomIn' | 'zoomOut' | 'halt' | 'selectAll' | 'cancel' | 'debug' | 'add' | 'turnBuilding' | 'road';

export const BINDINGS: Record<Action, readonly string[]> = {
  panLeft: ['KeyA', 'ArrowLeft'],
  panRight: ['KeyD', 'ArrowRight'],
  panForward: ['KeyW', 'ArrowUp'],
  panBack: ['KeyS', 'ArrowDown'],
  rotateLeft: ['KeyQ'],
  rotateRight: ['KeyE'],
  zoomIn: ['Equal', 'NumpadAdd'],
  zoomOut: ['Minus', 'NumpadSubtract'],
  halt: ['KeyH'],
  turnBuilding: ['KeyR'],
  road: ['KeyG'],
  selectAll: ['KeyA'],
  cancel: ['Escape'],
  debug: ['F3'],
  add: ['ShiftLeft', 'ShiftRight'],
};

/** Actions that need Ctrl held; the same key without it does something else (A pans, Ctrl+A selects). */
const NEEDS_CTRL: ReadonlySet<Action> = new Set<Action>(['selectAll']);

export class ActionState {
  private readonly held = new Set<string>();
  private ctrl = false;

  /** `onPress` gets every action whose key went down. Returns the function that removes the listeners. */
  listen(onPress: (action: Action) => void): () => void {
    const down = (e: KeyboardEvent): void => {
      this.ctrl = e.ctrlKey || e.metaKey;
      if (e.repeat) return;
      this.held.add(e.code);
      for (const action of Object.keys(BINDINGS) as Action[]) {
        if (!BINDINGS[action].includes(e.code)) continue;
        if (NEEDS_CTRL.has(action) !== this.ctrl) continue;
        // Keep the browser from acting on keys the game uses (Ctrl+A, F3, arrows).
        e.preventDefault();
        onPress(action);
      }
    };
    const up = (e: KeyboardEvent): void => {
      this.ctrl = e.ctrlKey || e.metaKey;
      this.held.delete(e.code);
    };
    const blur = (): void => {
      this.held.clear();
      this.ctrl = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }

  isHeld(action: Action): boolean {
    if (NEEDS_CTRL.has(action) !== this.ctrl) return false;
    for (const code of BINDINGS[action]) if (this.held.has(code)) return true;
    return false;
  }
}
