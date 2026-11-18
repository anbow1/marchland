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

/** Every error of this run, graphics or not, kept on the device for the next start (a tablet that cannot
 * take a screenshot: the menu offers the text to copy). */
const LAST_KEY = 'marchland.lastErrors';
const others: string[] = [];

function keep(): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ at: new Date().toISOString(), lines: [...caught, ...others].slice(0, 20) }));
  } catch {
    // No storage: this run's box only.
  }
}

function note(text: string, error: boolean): void {
  if (PIPELINE_FAULT.test(text)) pipelineFault = true;
  if (HARMLESS.test(text)) return;
  const line = text.length > 600 ? `${text.slice(0, 600)}…` : text;
  if (PATTERN.test(text)) {
    if (caught.length >= MAX) return;
    caught.push(line);
  } else if (error && others.length < MAX) others.push(line);
  else return;
  keep();
}

/** The errors kept from the last run that had any, as text to copy; null when there were none. */
export function lastErrors(): string | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const kept = JSON.parse(raw) as { at: string; lines: string[] };
    return kept.lines.length > 0 ? [`Marchland · ${kept.at}`, `GPU: ${gpuName()}`, gpuLimits(), navigator.userAgent, '', ...kept.lines].join('\n') : null;
  } catch {
    return null;
  }
}

/** True once this run has met an error worth keeping. */
export function errorsThisRun(): boolean {
  return caught.length + others.length > 0;
}

/** Forgets the kept errors (the player copied them, or the run went well). */
export function clearLastErrors(): void {
  try {
    localStorage.removeItem(LAST_KEY);
  } catch {
    // Nothing kept.
  }
}

/** Starts listening: call before the renderer is made. */
export function watchGraphics(): void {
  // Warnings too: a shader's compile messages may come as one (the harmless notes are filtered out).
  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]): void => {
      try {
        note(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(' '), level === 'error');
      } catch {
        // Never let the report break the game.
      }
      original(...args);
    };
  }
  watchPrograms();
  window.addEventListener('error', (e) => note(`${e.message} (${e.filename}:${e.lineno})`, true));
  window.addEventListener('unhandledrejection', (e) => note(String((e as PromiseRejectionEvent).reason), true));
  // A lost GPU context (memory pressure on a small tablet) leaves the view black.
  window.addEventListener('webglcontextlost', () => note('WebGL context lost', true), true);
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

/**
 * A WebGL2 program the driver will not link often comes with an empty log (an older Adreno): note what that
 * program was (its length, samplers, texture reads, varyings) so the report can name the shader.
 */
function watchPrograms(): void {
  if (typeof WebGL2RenderingContext === 'undefined') return;
  const P = WebGL2RenderingContext.prototype;
  const sources = new WeakMap<WebGLShader, string>();
  const attached = new WeakMap<WebGLProgram, string[]>();
  const reported = new WeakSet<WebGLProgram>();
  const shaderSource = P.shaderSource;
  const attachShader = P.attachShader;
  const getProgramParameter = P.getProgramParameter;
  P.shaderSource = function (shader: WebGLShader, source: string): void {
    sources.set(shader, source);
    shaderSource.call(this, shader, source);
  };
  P.attachShader = function (program: WebGLProgram, shader: WebGLShader): void {
    const list = attached.get(program) ?? [];
    list.push(sources.get(shader) ?? '');
    attached.set(program, list);
    attachShader.call(this, program, shader);
  };
  P.getProgramParameter = function (program: WebGLProgram, name: GLenum): unknown {
    const value: unknown = getProgramParameter.call(this, program, name);
    if (name === this.LINK_STATUS && value === false && !reported.has(program)) {
      reported.add(program);
      try {
        const [vert = '', frag = ''] = [...(attached.get(program) ?? [])].sort((a, b) => Number(/gl_Position/.test(b)) - Number(/gl_Position/.test(a)));
        const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;
        note(
          `WebGL link failed: vertex ${vert.length} chars, ${count(vert, /uniform\s+\w*sampler/g)} samplers, ${count(vert, /^\s*layout\s*\(\s*location[^)]*\)\s*in\s/gm)} attributes, ${count(vert, /^\s*(flat\s+)?out\s/gm)} varyings; fragment ${frag.length} chars, ${count(frag, /uniform\s+\w*sampler/g)} samplers, ${count(frag, /texture\w*\(/g)} texture reads`,
          true,
        );
      } catch {
        // The report never breaks the game.
      }
    }
    return value;
  };
}

/** The GPU's limits that most often refuse a shader on a phone or tablet. */
function gpuLimits(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return '';
    const p = (n: GLenum): string => String(gl.getParameter(n));
    const line = `limits: attribs ${p(gl.MAX_VERTEX_ATTRIBS)}, varyings ${p(gl.MAX_VARYING_VECTORS)}, vertex uniforms ${p(gl.MAX_VERTEX_UNIFORM_VECTORS)}, fragment uniforms ${p(gl.MAX_FRAGMENT_UNIFORM_VECTORS)}, textures ${p(gl.MAX_TEXTURE_IMAGE_UNITS)}/${p(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS)} vertex, uniform blocks ${p(gl.MAX_VERTEX_UNIFORM_BLOCKS)}/${p(gl.MAX_FRAGMENT_UNIFORM_BLOCKS)}, block size ${p(gl.MAX_UNIFORM_BLOCK_SIZE)}`;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return line;
  } catch {
    return '';
  }
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
  caught.push(...others);
  shown = true;
  const box = document.createElement('div');
  box.className = 'gfxReport';
  const lines = [
    `Marchland · ${backend}`,
    `GPU: ${gpuName()}`,
    gpuLimits(),
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

/** A box with the last run's errors as text to copy (where a screenshot cannot be taken), and a close. */
export function showLastErrors(root: HTMLElement, text: string): void {
  const box = document.createElement('div');
  box.className = 'gfxReport';
  const area = document.createElement('textarea');
  area.value = text;
  area.readOnly = true;
  area.rows = 12;
  area.style.width = '100%';
  const copy = document.createElement('button');
  copy.textContent = T.copyText;
  copy.addEventListener('click', () => {
    area.select();
    void navigator.clipboard?.writeText(text).catch(() => document.execCommand('copy'));
    copy.textContent = T.copied;
  });
  const close = document.createElement('button');
  close.textContent = T.closeNote;
  close.addEventListener('click', () => {
    clearLastErrors();
    box.remove();
  });
  const head = document.createElement('p');
  head.textContent = T.lastErrorsAbout;
  box.append(head, area, copy, close);
  root.appendChild(box);
}
