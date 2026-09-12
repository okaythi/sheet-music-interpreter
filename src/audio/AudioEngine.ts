import { VoiceBus } from './VoiceBus.js';

export const NOTE_TO_MIDI: Record<string, number> = {
  "Db1": 25, "F1": 29, "Ab1": 32, "C2": 36, "Db2": 37, "F2": 41, "Ab2": 44,
  "Db3": 49, "Eb3": 51, "F3": 53, "Gb3": 54, "Ab3": 56, "Bb3": 58, "B3": 59,
  "C4": 60, "Db4": 61, "Eb4": 63, "E4": 64, "F4": 65, "Gb4": 66, "Ab4": 68,
  "A4": 69, "Bb4": 70, "B4": 71, "C5": 72, "Db5": 73, "Eb5": 75, "E5": 76,
  "F5": 77, "Gb5": 78, "Ab5": 80, "Bb5": 82, "B5": 83, "C6": 84, "Db6": 85,
  "F6": 89, "Ab6": 92, "C7": 96
};

export const ANCHOR_NAMES = Object.keys(NOTE_TO_MIDI);

export class AudioEngine {
  private ctx: AudioContext | null = null;
  public voiceBus: VoiceBus | null = null;
  private audioBuffers: Map<string, AudioBuffer> = new Map();
  private isLoaded = false;
  private isLoading = false;
  private loadProgress = 0;

  constructor() {
    // Lazy initialized on first user gesture
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  public getOutputLatency(): number {
    if (!this.ctx) return 0;
    // outputLatency is supported in modern Chrome, Edge, and Safari
    const latency = (this.ctx as any).outputLatency || 0;
    const baseLatency = this.ctx.baseLatency || 0;
    return Math.max(0, latency + baseLatency);
  }

  public async init(): Promise<void> {
    if (this.isLoaded || this.isLoading) return;
    this.isLoading = true;

    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtxClass();
      this.voiceBus = new VoiceBus(this.ctx);
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    // Concurrency-limited loader: 3 parallel worker queues
    const queue = [...ANCHOR_NAMES];
    const total = queue.length;
    let loadedCount = 0;

    const worker = async () => {
      while (queue.length > 0) {
        const name = queue.shift()!;
        try {
          const res = await fetch(`/audio/piano/${name}.mp3`);
          if (res.ok) {
            const arrayBuf = await res.arrayBuffer();
            if (this.ctx) {
              const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
              this.audioBuffers.set(name, audioBuf);
            }
          }
        } catch (e) {
          console.warn(`Failed to load piano sample ${name}:`, e);
        } finally {
          loadedCount++;
          this.loadProgress = loadedCount / total;
        }
      }
    };

    await Promise.all([worker(), worker(), worker()]);
    this.isLoaded = true;
    this.isLoading = false;
  }

  public getIsReady(): boolean {
    return this.isLoaded;
  }

  public getLoadProgress(): number {
    return this.loadProgress;
  }

  /**
   * Schedule note playback at an exact hardware-clock time
   */
  public scheduleNote(
    noteId: string,
    midiPitch: number,
    hardwareTime: number,
    durationSec: number
  ): void {
    if (!this.ctx || !this.voiceBus || !this.isLoaded) return;

    // Find closest anchor sample
    let bestAnchor: string | null = null;
    let minDiff = 999;

    for (const anchor of ANCHOR_NAMES) {
      const anchorMidi = NOTE_TO_MIDI[anchor];
      const diff = Math.abs(midiPitch - anchorMidi);
      if (diff < minDiff) {
        minDiff = diff;
        bestAnchor = anchor;
      }
    }

    if (!bestAnchor) return;
    const buf = this.audioBuffers.get(bestAnchor);
    if (!buf) return;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const anchorMidi = NOTE_TO_MIDI[bestAnchor];
    // Mathematical semitone pitch transposition
    src.playbackRate.value = Math.pow(2, (midiPitch - anchorMidi) / 12);

    const gain = this.ctx.createGain();
    this.voiceBus.allocateVoice(noteId, midiPitch, src, gain, hardwareTime, durationSec);

    src.connect(gain);
    src.start(hardwareTime);
  }

  public setPedal(engaged: boolean, hardwareTime: number): void {
    this.voiceBus?.setPedal(engaged, hardwareTime);
  }

  public setUnaCorda(engaged: boolean, hardwareTime: number): void {
    this.voiceBus?.setUnaCorda(engaged, hardwareTime);
  }

  public stopAll(): void {
    if (this.ctx && this.voiceBus) {
      this.voiceBus.killAllVoices(this.ctx.currentTime);
    }
  }
}
