// Sound (WebAudio). The fighting is recorded: blades on blades and on plate, blows and falls, stone
// breaking (Kenney's "Impact Sounds" and "RPG Audio", CC0, public/sounds); each play picks one of a few
// takes at a slightly different pitch, so a melee is not one sample on repeat. The rest is made in code: the
// arrow's hiss, a gun's boom under its recorded crack, horns and the fanfare. Until the files are in (or if
// they fail) the code's sounds stand in. Every sound is placed by its distance from the camera: quieter with
// distance, and later by the time sound takes to arrive (343 m/s, rules §8).

const SPEED_OF_SOUND_MS = 343;
/** Distance at which a sound has fallen to half its loudness. */
const HALF_GAIN_M = 70;

export type SoundKind = 'clash' | 'arrow' | 'cannon' | 'mortar' | 'thud' | 'stone' | 'horn' | 'hornLow' | 'fanfare' | 'build' | 'click' | 'deny';

/** The recorded takes of each kind (public/sounds/<name>.mp3), and how loud they play. */
const TAKES: Partial<Record<SoundKind, { files: readonly string[]; level: number }>> = {
  clash: { files: ['impact_metal_medium_000', 'impact_metal_medium_001', 'impact_metal_medium_002', 'impact_metal_light_000', 'impact_metal_light_001', 'impact_plate_medium_000', 'impact_plate_medium_001'], level: 0.55 },
  thud: { files: ['impact_soft_medium_000', 'impact_soft_medium_001', 'impact_punch_medium_000', 'impact_punch_medium_001', 'impact_soft_heavy_000', 'impact_soft_heavy_001', 'impact_punch_heavy_000'], level: 0.7 },
  stone: { files: ['impact_mining_000', 'impact_mining_001', 'impact_mining_002'], level: 0.8 },
};

/** Least seconds between two sounds of one kind: a melee would otherwise be one long noise. */
const MIN_GAP_S: Record<SoundKind, number> = { clash: 0.07, arrow: 0.05, cannon: 0.15, mortar: 0.2, thud: 0.12, stone: 0.15, horn: 1.5, hornLow: 1.5, fanfare: 3, build: 0.3, click: 0.03, deny: 0.2 };

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly lastAt = new Map<SoundKind, number>();
  /** Decoded takes by kind, once loaded. */
  private readonly takes = new Map<SoundKind, AudioBuffer[]>();
  private base = './';

  /** Where public/ is served from (import.meta.env.BASE_URL): the takes load from there once audio starts. */
  setBase(base: string): void {
    this.base = base;
  }

  /** Fetches and decodes the recorded takes; a kind whose files fail keeps the sound made in code. */
  private loadTakes(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const [kind, set] of Object.entries(TAKES) as [SoundKind, { files: readonly string[] }][]) {
      void Promise.all(
        set.files.map(async (name) => {
          try {
            const response = await fetch(`${this.base}sounds/${name}.mp3`);
            if (!response.ok) return null;
            return await ctx.decodeAudioData(await response.arrayBuffer());
          } catch {
            return null;
          }
        }),
      ).then((buffers) => {
        const ok = buffers.filter((b): b is AudioBuffer => b !== null);
        if (ok.length > 0) this.takes.set(kind, ok);
      });
    }
  }

  /** One of a kind's takes, at a pitch a little off its own, `level` loud, from `at`. */
  private take(kind: SoundKind, at: number, level: number, rate = 1): boolean {
    const list = this.takes.get(kind);
    const ctx = this.ctx;
    if (!list || !ctx) return false;
    const src = ctx.createBufferSource();
    src.buffer = list[Math.floor(Math.random() * list.length)] as AudioBuffer;
    src.playbackRate.value = rate * (0.9 + Math.random() * 0.2);
    const g = ctx.createGain();
    g.gain.value = level;
    src.connect(g).connect(this.master as GainNode);
    src.start(at);
    return true;
  }
  volume = 0.6;

  /** 0 (silent) to 1. */
  setVolume(volume: number): void {
    this.volume = volume;
    if (this.master) this.master.gain.value = volume;
  }

  /** Browsers allow audio only after a gesture: call from the first click. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    // One second of white noise, reused by every percussive sound.
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1103515245) + 12345) | 0;
      data[i] = (seed >>> 8) / 8388608 - 1;
    }
    this.loadTakes();
  }

  /** Plays a sound heard from `distanceM` away (0 for interface sounds). */
  play(kind: SoundKind, distanceM = 0): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || ctx.state !== 'running') return;
    const last = this.lastAt.get(kind) ?? -10;
    if (ctx.currentTime - last < MIN_GAP_S[kind]) return;
    this.lastAt.set(kind, ctx.currentTime);
    const gain = 1 / (1 + (distanceM / HALF_GAIN_M) ** 2);
    if (gain < 0.02) return;
    const at = ctx.currentTime + distanceM / SPEED_OF_SOUND_MS;
    switch (kind) {
      case 'clash':
        if (this.take('clash', at, gain * (TAKES.clash?.level ?? 1))) break;
        this.burst(at, 0.09, 2600 + Math.random() * 1800, 3, gain * 0.5);
        this.tone(at, 0.12, 1900 + Math.random() * 900, 'triangle', gain * 0.12);
        break;
      case 'arrow':
        this.burst(at, 0.16, 5200, 1.2, gain * 0.22);
        break;
      case 'cannon':
        // The crack of the charge (rock splitting, slowed down) over the boom rolling after it and a low thump.
        if (!this.take('stone', at, gain * 0.9, 0.5)) this.burst(at, 0.06, 1800, 0.8, gain * 0.7);
        this.rumble(at, 1.4, 260, gain * 1.1);
        this.drop(at, 0.5, 90, 38, gain * 0.9);
        break;
      case 'mortar':
        // Duller and deeper: the charge in a short barrel, aimed at the sky.
        if (!this.take('stone', at, gain * 0.7, 0.38)) this.burst(at, 0.05, 900, 0.8, gain * 0.45);
        this.rumble(at, 1.1, 160, gain * 1.0);
        this.drop(at, 0.6, 70, 30, gain * 1.0);
        break;
      case 'stone':
        if (this.take('stone', at, gain * (TAKES.stone?.level ?? 1))) break;
        this.burst(at, 0.2, 180, 1.2, gain * 0.7);
        break;
      case 'thud':
        if (this.take('thud', at, gain * (TAKES.thud?.level ?? 1))) break;
        this.burst(at, 0.14, 220, 1.5, gain * 0.6);
        break;
      case 'horn':
        this.tone(at, 0.9, 233, 'sawtooth', gain * 0.22);
        this.tone(at + 0.28, 0.9, 311, 'sawtooth', gain * 0.22);
        break;
      case 'hornLow':
        this.tone(at, 1.3, 155, 'sawtooth', gain * 0.26);
        break;
      case 'fanfare':
        [262, 330, 392, 523].forEach((hz, i) => this.tone(at + i * 0.22, 0.5, hz, 'sawtooth', 0.2));
        break;
      case 'build':
        this.burst(at, 0.05, 900, 4, 0.5);
        this.burst(at + 0.16, 0.05, 1100, 4, 0.5);
        break;
      case 'click':
        this.burst(at, 0.025, 2400, 3, 0.25);
        break;
      case 'deny':
        this.tone(at, 0.14, 140, 'square', 0.12);
        break;
    }
  }

  /** A band of noise with a fast decay. */
  private burst(at: number, seconds: number, hz: number, q: number, level: number): void {
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = hz;
    filter.Q.value = q;
    const g = ctx.createGain();
    // Silent until its time: a parameter sits at its default until its first event (rules §8).
    g.gain.value = 0;
    g.gain.setValueAtTime(level, at);
    g.gain.exponentialRampToValueAtTime(0.0008, at + seconds);
    src.connect(filter).connect(g).connect(this.master as GainNode);
    src.start(at, Math.random() * 0.5, seconds + 0.02);
  }

  /** Noise through a low-pass that closes as it fades: a boom rolling away. */
  private rumble(at: number, seconds: number, hz: number, level: number): void {
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = hz;
    filter.frequency.setValueAtTime(hz, at);
    filter.frequency.exponentialRampToValueAtTime(hz * 0.3, at + seconds);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(level, at);
    g.gain.exponentialRampToValueAtTime(0.0008, at + seconds);
    // Longer than the second of noise: it loops.
    src.loop = true;
    src.connect(filter).connect(g).connect(this.master as GainNode);
    src.start(at, Math.random() * 0.3);
    src.stop(at + seconds + 0.02);
  }

  /** A sine whose pitch falls fast: the thump of a charge going off. */
  private drop(at: number, seconds: number, fromHz: number, toHz: number, level: number): void {
    const ctx = this.ctx as AudioContext;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = fromHz;
    osc.frequency.setValueAtTime(fromHz, at);
    osc.frequency.exponentialRampToValueAtTime(toHz, at + seconds);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(level, at);
    g.gain.exponentialRampToValueAtTime(0.0008, at + seconds);
    osc.connect(g).connect(this.master as GainNode);
    osc.start(at);
    osc.stop(at + seconds + 0.02);
  }

  /** A tone through a low-pass, with a soft attack and release. */
  private tone(at: number, seconds: number, hz: number, type: OscillatorType, level: number): void {
    const ctx = this.ctx as AudioContext;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = hz;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = hz * 4;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(level, at + Math.min(0.06, seconds * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0008, at + seconds);
    osc.connect(filter).connect(g).connect(this.master as GainNode);
    osc.start(at);
    osc.stop(at + seconds + 0.02);
  }
}
