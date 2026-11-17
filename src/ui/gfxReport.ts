import { T } from './strings.ts';

// A report for a device where the 3D view stays empty (an old tablet's GPU refusing a shader, say): the
// graphics errors of the first seconds, with the browser and the GPU, in a box the player can photograph
// and send. A button tries again on the WebGL2 path. Nothing is sent anywhere.

const PATTERN = /THREE|WebGL|WebGPU|WGSL|GLSL|shader|GPU|GL_|validation|context lost/i;
const MAX = 12;
/** Notes three.js always prints on the WebGL2 path: not faults. */
const HARMLESS = /WebGPU is not available|toInspector|captureStackTrace/;

const caught: string[] = [];
/** WebGPU refused a pipeline or a shader: this device draws nothing on that path. */
const PIPELINE_FAULT = /pipeline creation failed|ShaderModule|Invalid .*Pipeline|exceeds the maximum/i;
/** Kept on the device: once WebGPU failed here, every later start goes straight to WebGL2. */
export const FORCE_GL_KEY = 'marchland.forceWebGL';
let pipelineFault = false;
let shown = false;

function note(text: string): void {
  if (PIPELINE_FAULT.test(text)) pipelineFault = true;
  if (caught.length >= MAX || !PATTERN.test(text) || HARMLESS.test(text)) return;
  caught.push(text.length > 600 ? `${text.slice(0, 600)}…` : text);
}

/** Starts listening: call before the renderer is made. */
export function watchGraphics(): void {
  // Warnings too: a shader's compile messages may come as one (the harmless notes are filtered out).
  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]): void => {
      try {
        note(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(' '));
      } catch {
        // Never let the report break the game.
      }
      original(...args);
    };
  }
  window.addEventListener('error', (e) => note(`${e.message} (${e.filename}:${e.lineno})`));
  window.addEventListener('unhandledrejection', (e) => note(String((e as PromiseRejectionEvent).reason)));
}

/**
 * On WebGPU with a refused pipeline: remembers to use WebGL2 on this device and starts again on it (true:
 * the page is reloading). Once only: on WebGL2 the report shows whatever still fails.
 */
export function fallBackToWebGL(backend: string): boolean {
  if (!pipelineFault || backend !== 'WebGPU') return false;
  try {
    localStorage.setItem(FORCE_GL_KEY, '1');
  } catch {
    // Not kept: the address carries it this time.
  }
  const params = new URLSearchParams(location.search);
  if (params.has('gl')) return false;
  params.set('gl', '1');
  location.search = params.toString();
  return true;
}

/** The GPU's name as WebGL reports it ("unknown" where hidden). */
function gpuName(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
    if (!gl) return 'no WebGL';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return `${String(name)} (${gl instanceof WebGL2RenderingContext ? 'WebGL2' : 'WebGL1 only'})`;
  } catch {
    return 'unknown';
  }
}

/** Shows the report if graphics errors were caught (or `force`). `backend` names the renderer in use. */
export function reportGraphics(root: HTMLElement, backend: string, force = false): void {
  if (shown || (caught.length === 0 && !force)) return;
  shown = true;
  const box = document.createElement('div');
  box.className = 'gfxReport';
  const lines = [
    `Marchland · ${backend}`,
    `GPU: ${gpuName()}`,
    `${navigator.userAgent}`,
    `screen ${screen.width}×${screen.height} @${window.devicePixelRatio}`,
    '',
    ...caught,
  ];
  const pre = document.createElement('pre');
  pre.textContent = lines.join('\n');
  const text = document.createElement('p');
  text.textContent = T.gfxProblem;
  const retry = document.createElement('button');
  retry.textContent = 'WebGL2';
  retry.addEventListener('click', () => {
    const params = new URLSearchParams(location.search);
    params.set('gl', '1');
    location.search = params.toString();
  });
  const close = document.createElement('button');
  close.textContent = T.closeNote;
  close.addEventListener('click', () => box.remove());
  box.append(text, pre, retry, close);
  root.appendChild(box);
}
