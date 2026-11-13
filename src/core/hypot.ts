/**
 * Length of (x, z): what Math.hypot(x, z) gives, without its cost. V8's Math.hypot takes any number of
 * arguments and allocates on every call; the simulation measures thousands of distances a step, and
 * those allocations made a garbage collection every few seconds (up to 8 ms each). This one inlines.
 */
export function hypot2(x: number, z: number): number {
  return Math.sqrt(x * x + z * z);
}
