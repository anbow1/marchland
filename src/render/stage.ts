import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { sharpen } from 'three/addons/tsl/display/SharpenNode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { dot, max, mix, mrt, output, pass, pow, vec3, vec4, velocity } from 'three/tsl';
import { HalfFloatType, NeutralToneMapping, type Node, PerspectiveCamera, RenderPipeline, Scene, SRGBColorSpace, WebGPURenderer } from 'three/webgpu';
import { CAMERA } from '../config.ts';
import { FrameGovernor, PassTimer } from './perf.ts';
import { installWebGpuCompat } from './webgpuCompat.ts';

// Renderer and post chain (rules §2). One code path: WebGPURenderer falls back
// to WebGL2 by itself. HDR scene pass with a velocity target; TRAA and a light
// sharpen on High, FXAA on Low; bloom from physical brightness; tone map and
// sRGB once, in the output stage. Lights arrive pre-exposed (lighting.ts), so
// the renderer's own exposure stays at 1.
//
// Tone map: ACES. This game has no fire or afterburner for ACES to bend, and
// its warm shift suits sunlit grass and thatch; AgX stays an option for later
// (rules §2.1 asks for the choice to be written down).

export type Quality = 'high' | 'low';

export interface StageSettings {
  quality: Quality;
  /** Ceiling on device pixels per CSS pixel before the governor's scale. */
  maxPixelRatio: number;
}

interface GovernorStep {
  scale: number;
}

const GOVERNOR_STEPS: readonly GovernorStep[] = [{ scale: 1 }, { scale: 0.87 }, { scale: 0.76 }, { scale: 0.67 }, { scale: 0.58 }, { scale: 0.5 }, { scale: 0.42 }];

/** Near and far planes: the camera never comes closer than 20 m to what it looks at. */
const CAMERA_NEAR_M = 1;
const CAMERA_FAR_M = 6000;

/**
 * A grade before the tone curve: the scans are photographed under grey skies and read dull (grass,
 * plaster and tiles drift towards one beige), so colour is pushed back out from grey and the mid-tones are given a
 * little more contrast round middle grey. Linear HDR in, linear HDR out.
 */
const GRADE_SATURATION = 1.35;
const GRADE_CONTRAST = 1.14;
const MIDDLE_GREY = 0.18;

function grade(c: Node<'vec4'>): Node<'vec4'> {
  const rgb = max(c.rgb, vec3(0));
  const luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  const saturated = max(mix(vec3(luma), rgb, GRADE_SATURATION), vec3(0));
  const contrasted = pow(saturated.div(MIDDLE_GREY), vec3(GRADE_CONTRAST)).mul(MIDDLE_GREY);
  return vec4(contrasted, c.a);
}

export class Stage {
  readonly renderer: WebGPURenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly passTimer = new PassTimer();
  readonly governor: FrameGovernor<GovernorStep>;
  private dynamicScale = 1;
  private pipeline: RenderPipeline | null = null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly settings: StageSettings,
  ) {
    installWebGpuCompat();
    // `?gl` forces the WebGL2 path (a device whose WebGPU starts but draws nothing).
    const forceWebGL = new URLSearchParams(location.search).has('gl');
    this.renderer = new WebGPURenderer({ canvas, antialias: false, powerPreference: 'high-performance', trackTimestamp: true, forceWebGL });
    this.renderer.inspector = this.passTimer;
    this.renderer.outputColorSpace = SRGBColorSpace;
    // Khronos PBR Neutral: keeps hue and saturation through the curve, where ACES greyed the scans.
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.camera = new PerspectiveCamera(CAMERA.fovDeg, 16 / 9, CAMERA_NEAR_M, CAMERA_FAR_M);
    this.scene.add(this.camera);
    this.passTimer.mainScene = this.scene;
    this.passTimer.mainCamera = this.camera;
    this.governor = new FrameGovernor(GOVERNOR_STEPS, (step) => {
      if (step.scale !== this.dynamicScale) {
        this.dynamicScale = step.scale;
        this.resize();
      }
    });
  }

  async init(): Promise<void> {
    await this.renderer.init();
    this.buildPipeline();
    this.resize();
  }

  get backendName(): string {
    const backend: unknown = this.renderer.backend;
    return typeof backend === 'object' && backend !== null && 'isWebGPUBackend' in backend ? 'WebGPU' : 'WebGL2 (fallback)';
  }

  get governorLabel(): string {
    return `${Math.round(this.governor.step.scale * 100)} %`;
  }

  private buildPipeline(): void {
    const high = this.settings.quality === 'high';
    const scenePass = pass(this.scene, this.camera, { type: HalfFloatType });
    scenePass.setMRT(mrt({ output, velocity }));
    const colour = scenePass.getTextureNode('output');
    const depth = scenePass.getTextureNode('depth');
    const motion = scenePass.getTextureNode('velocity');
    const pipeline = new RenderPipeline(this.renderer);
    if (high) {
      const aa = traa(colour, depth, motion, this.camera);
      // Sun on helmets and blades is the only thing bright enough to bloom.
      const lit = aa.add(bloom(aa, 0.04, 0.3, 0));
      pipeline.outputNode = grade(sharpen(lit, 0.3));
    } else {
      pipeline.outputNode = grade(fxaa(colour) as unknown as Node<'vec4'>);
    }
    this.pipeline?.dispose();
    this.pipeline = pipeline;
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.settings.maxPixelRatio) * this.dynamicScale);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    if (!this.pipeline) throw new Error('stage.render() before init()');
    this.pipeline.render();
    this.passTimer.poll(this.renderer);
  }
}
