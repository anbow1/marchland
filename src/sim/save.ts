import { UNITS } from '../config.ts';
import type { UnitKind } from './types.ts';
import { EventQueue } from './events.ts';
import { LAYOUT, START } from './layout.ts';
import { SpatialGrid } from './movement.ts';
import { Rng } from '../core/rng.ts';
import type { World } from './world.ts';

// Saving a game: the world, whole, as text. The world is a graph, not a tree (a soldier points at his
// regiment, a carrier at the building he carries to, the same building sits in its town's list), so
// every object is written once with a number and every further mention of it as that number; typed
// arrays go as base64, sets and maps as lists, and the few classes (the random numbers, the event
// queue, the spatial grid) come back with their methods. A save also names the map's layout and the
// place of the keeps, which are fixed when the page loads: a save made on another map loads after a
// reload onto that map.

/** What a save holds besides the world: where it was made. */
export interface SaveHeader {
  version: 1;
  savedAt: string;
  start: number;
  layout: string;
  timeS: number;
}

const CLASSES: Record<string, object> = {
  Rng: Rng.prototype,
  EventQueue: EventQueue.prototype,
  SpatialGrid: SpatialGrid.prototype,
};

type Typed = Float32Array | Float64Array | Int32Array | Int16Array | Uint8Array | Uint16Array | Uint32Array | Int8Array;
const TYPED: Record<string, new (buffer: ArrayBuffer) => Typed> = {
  Float32Array,
  Float64Array,
  Int32Array,
  Int16Array,
  Int8Array,
  Uint8Array,
  Uint16Array,
  Uint32Array,
};

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

function fromBase64(text: string): Uint8Array {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Writes the world as text. */
export function saveWorld(world: World): string {
  const ids = new Map<object, number>();
  const table: unknown[] = [];
  const encode = (value: unknown): unknown => {
    if (value === null || typeof value !== 'object') {
      if (typeof value === 'number' && !Number.isFinite(value)) return { $n: String(value) };
      return value;
    }
    const known = ids.get(value);
    if (known !== undefined) return { $r: known };
    const id = table.length;
    ids.set(value, id);
    table.push(null);
    let out: unknown;
    if (ArrayBuffer.isView(value)) {
      const typed = value as Typed;
      out = { $t: typed.constructor.name, b: toBase64(new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength)) };
    } else if (Array.isArray(value)) out = { $a: value.map(encode) };
    else if (value instanceof Set) out = { $s: [...value].map(encode) };
    else if (value instanceof Map) out = { $m: [...value].map(([k, v]) => [encode(k), encode(v)]) };
    else {
      const proto = Object.getPrototypeOf(value);
      const cls = Object.entries(CLASSES).find(([, p]) => p === proto)?.[0];
      const fields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) if (typeof v !== 'function') fields[k] = encode(v);
      out = cls ? { $c: cls, f: fields } : { $o: fields };
    }
    table[id] = out;
    return { $r: id };
  };
  const root = encode(world);
  const header: SaveHeader = { version: 1, savedAt: new Date().toISOString(), start: START, layout: LAYOUT, timeS: world.timeS };
  return JSON.stringify({ header, root, table });
}

/** Just the header of a save: where and when it was made. */
export function saveHeader(text: string): SaveHeader | null {
  try {
    return (JSON.parse(text) as { header: SaveHeader }).header ?? null;
  } catch {
    return null;
  }
}

/** Reads a world back from text written by saveWorld. */
export function loadWorld(text: string): World {
  const { root, table } = JSON.parse(text) as { root: unknown; table: Record<string, unknown>[] };
  const built: unknown[] = new Array(table.length);
  const decode = (value: unknown): unknown => {
    if (value === null || typeof value !== 'object') return value;
    const v = value as Record<string, unknown>;
    if ('$n' in v) return Number(v['$n']);
    if ('$r' in v) return build(v['$r'] as number);
    return value;
  };
  const build = (id: number): unknown => {
    if (built[id] !== undefined) return built[id];
    const entry = table[id] as Record<string, unknown>;
    if ('$t' in entry) {
      const bytes = fromBase64(entry['b'] as string);
      const Kind = TYPED[entry['$t'] as string];
      if (!Kind) throw new Error(`a save holds an unknown array kind '${String(entry['$t'])}'`);
      built[id] = new Kind(bytes.buffer as ArrayBuffer);
      return built[id];
    }
    if ('$a' in entry) {
      const list: unknown[] = [];
      built[id] = list;
      for (const item of entry['$a'] as unknown[]) list.push(decode(item));
      return list;
    }
    if ('$s' in entry) {
      const set = new Set<unknown>();
      built[id] = set;
      for (const item of entry['$s'] as unknown[]) set.add(decode(item));
      return set;
    }
    if ('$m' in entry) {
      const map = new Map<unknown, unknown>();
      built[id] = map;
      for (const [k, item] of entry['$m'] as [unknown, unknown][]) map.set(decode(k), decode(item));
      return map;
    }
    const cls = entry['$c'] as string | undefined;
    const object: Record<string, unknown> = cls ? Object.create(CLASSES[cls] ?? Object.prototype) : {};
    built[id] = object;
    for (const [k, item] of Object.entries((entry['f'] ?? entry['$o']) as Record<string, unknown>)) object[k] = decode(item);
    return object;
  };
  return upgrade(decode(root) as World);
}

/** Fills in what saves made before a field existed lack, with the value a new game starts from. */
function upgrade(world: World): World {
  for (const town of world.towns) {
    town.reinforced ??= [];
    town.payOwed ??= 0;
    town.unpaid ??= false;
    town.transportLevel ??= 1;
    town.transportUpgradeLeftS ??= 0;
    town.priority ??= {};
    town.orders ??= {};
    town.kindPriority ??= {};
  }
  // Ballistae and trebuchets became cannon and mortars (2026-11-16): an old save's engines are cast anew.
  const renamed: Record<string, UnitKind> = { ballista: 'cannon', trebuchet: 'mortar' };
  for (const town of world.towns) {
    for (const order of town.recruitQueue) order.kind = renamed[order.kind] ?? order.kind;
    town.trained = town.trained.map((k) => renamed[k] ?? k);
  }
  for (const r of world.regiments) {
    const now = renamed[r.kind];
    if (now) {
      r.kind = now;
      r.def = UNITS[now];
    }
    r.xp ??= 0;
    r.paceCapMs ??= 0;
    r.route ??= [];
    r.routeAt ??= 0;
    r.routeGoalX ??= r.anchorX;
    r.routeGoalZ ??= r.anchorZ;
    r.routeVersion ??= -1;
    r.routeCheckS ??= 0;
    r.marchFiles ??= 0;
    r.queue ??= [];
  }
  for (const a of world.arrows) a.shooterId ??= -1;
  if (world.ai) world.ai.walled ??= false;
  return world;
}
