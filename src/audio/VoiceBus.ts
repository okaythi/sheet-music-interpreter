import type { ActiveVoice } from '../types/index.js';

export const dbToGain = (db: number): number => Math.pow(10, db / 20);

export class VoiceBus {
  // Acoustic Busses
  private ctx: AudioContext;
  public readonly masterGain: GainNode;
  public readonly damperBusGain: GainNode;
  public readonly unaCordaFilter: BiquadFilterNode;
  public readonly unaCordaGain: GainNode;

  // Active sounding voice allocation
  private activeVoicesByPitch: Map<number, ActiveVoice[]> = new Map();
  private isPedalEngaged = false;
  private isUnaCordaEngaged = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 1.0;

    // Damper release bus: all sustain-held notes pass through this bus
    this.damperBusGain = ctx.createGain();
    this.damperBusGain.gain.value = 1.0;

    // Una Corda (soft pedal) bus: shifts timbre via lowpass filter + attenuation
    this.unaCordaFilter = ctx.createBiquadFilter();
    this.unaCordaFilter.type = 'lowpass';
    this.unaCordaFilter.frequency.value = 20000; // default wide open

    this.unaCordaGain = ctx.createGain();
    this.unaCordaGain.gain.value = 1.0;

    // Signal chain: [Voices] -> [DamperBus] -> [UnaCordaFilter/Gain] -> [MasterGain] -> [Destination]
    this.damperBusGain.connect(this.unaCordaFilter);
    this.unaCordaFilter.connect(this.unaCordaGain);
    this.unaCordaGain.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);
  }

  public setPedal(engaged: boolean, audioTime: number): void {
    if (this.isPedalEngaged === engaged) return;
    this.isPedalEngaged = engaged;

    if (!engaged) {
      // Pedal lifted: clamp all currently ringing pedal-held voices
      this.releaseDamperHeldVoices(audioTime);
    }
  }

  public setUnaCorda(engaged: boolean, audioTime: number): void {
    if (this.isUnaCordaEngaged === engaged) return;
    this.isUnaCordaEngaged = engaged;

    const targetFreq = engaged ? 2800 : 20000;
    const targetGain = engaged ? dbToGain(-2.2) : 1.0;

    this.unaCordaFilter.frequency.cancelScheduledValues(audioTime);
    this.unaCordaFilter.frequency.setValueAtTime(this.unaCordaFilter.frequency.value, audioTime);
    this.unaCordaFilter.frequency.exponentialRampToValueAtTime(targetFreq, audioTime + 0.12);

    this.unaCordaGain.gain.cancelScheduledValues(audioTime);
    this.unaCordaGain.gain.setValueAtTime(this.unaCordaGain.gain.value, audioTime);
    this.unaCordaGain.gain.linearRampToValueAtTime(targetGain, audioTime + 0.12);
  }

  /**
   * Allocate and connect a new sounding voice with re-strike crossfading
   */
  public allocateVoice(
    noteId: string,
    midiPitch: number,
    src: AudioBufferSourceNode,
    gain: GainNode,
    audioTime: number,
    durationSec: number
  ): ActiveVoice {
    // 1. Re-strike crossfade: If same pitch is already ringing, fade it out in 15ms
    const existing = this.activeVoicesByPitch.get(midiPitch);
    if (existing && existing.length > 0) {
      for (const oldVoice of existing) {
        try {
          const effectiveTime = Math.max(this.ctx.currentTime, audioTime);
          if (typeof (oldVoice.gain.gain as any).cancelAndHoldAtTime === 'function') {
            (oldVoice.gain.gain as any).cancelAndHoldAtTime(effectiveTime);
          } else {
            oldVoice.gain.gain.cancelScheduledValues(effectiveTime);
            oldVoice.gain.gain.setValueAtTime(Math.max(0.0001, oldVoice.gain.gain.value), effectiveTime);
          }
          oldVoice.gain.gain.linearRampToValueAtTime(0.0001, effectiveTime + 0.015);
          oldVoice.src.stop(effectiveTime + 0.02);
        } catch {
          // already stopped
        }
      }
      this.activeVoicesByPitch.set(midiPitch, []);
    }

    // 2. Setup natural piano attack and decay envelopes
    // Initial attack to natural release
    gain.gain.setValueAtTime(0.92, audioTime);
    gain.gain.exponentialRampToValueAtTime(0.48, audioTime + Math.min(1.2, durationSec * 0.8));
    
    // Natural ring-out time (longer if pedal is down)
    const decayDuration = this.isPedalEngaged ? 5.5 : Math.max(durationSec + 0.5, 1.8);
    const stopTime = audioTime + decayDuration;
    gain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

    // Connect to Damper Bus
    gain.connect(this.damperBusGain);

    const keyReleaseTime = audioTime + durationSec;

    const voice: ActiveVoice = {
      id: noteId,
      midi: midiPitch,
      src,
      gain,
      startTime: audioTime,
      keyReleaseTime,
      scheduledStopTime: stopTime,
      isPedalHeld: this.isPedalEngaged
    };

    if (!this.activeVoicesByPitch.has(midiPitch)) {
      this.activeVoicesByPitch.set(midiPitch, []);
    }
    this.activeVoicesByPitch.get(midiPitch)!.push(voice);

    // Auto cleanup on stop
    src.onended = () => {
      this.removeVoice(voice);
    };

    return voice;
  }

  public releaseDamperHeldVoices(audioTime: number): void {
    const effectiveAudioTime = Math.max(this.ctx.currentTime, audioTime);
    const clampTime = effectiveAudioTime + 0.09; // 90ms natural felt damper release

    for (const [, voices] of this.activeVoicesByPitch.entries()) {
      for (const v of voices) {
        // Acoustic Reality: Damper pedal release ONLY clamps strings where the key
        // has already been released by the pianist's fingers!
        // If the key is still physically held (or note starts in the future), the damper
        // is physically held away from the string by the key lever mechanism.
        if (audioTime <= v.startTime || audioTime < v.keyReleaseTime - 0.02) {
          continue;
        }

        if (v.isPedalHeld) {
          try {
            if (typeof (v.gain.gain as any).cancelAndHoldAtTime === 'function') {
              (v.gain.gain as any).cancelAndHoldAtTime(effectiveAudioTime);
            } else {
              v.gain.gain.cancelScheduledValues(effectiveAudioTime);
              v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), effectiveAudioTime);
            }
            v.gain.gain.exponentialRampToValueAtTime(0.0001, clampTime);
            v.src.stop(clampTime + 0.01);
            v.isPedalHeld = false;
          } catch {
            try {
              v.gain.gain.linearRampToValueAtTime(0.0001, clampTime);
              v.src.stop(clampTime + 0.01);
              v.isPedalHeld = false;
            } catch {
              // Already ended
            }
          }
        }
      }
    }
  }

  public killAllVoices(audioTime: number): void {
    const effectiveAudioTime = Math.max(this.ctx.currentTime, audioTime);
    for (const [, voices] of this.activeVoicesByPitch.entries()) {
      for (const v of voices) {
        try {
          v.gain.gain.cancelScheduledValues(effectiveAudioTime);
          v.gain.gain.setValueAtTime(0.0001, effectiveAudioTime);
          v.src.stop(effectiveAudioTime + 0.005);
        } catch {
          // Already stopped
        }
      }
    }
    this.activeVoicesByPitch.clear();
  }

  private removeVoice(voice: ActiveVoice): void {
    const list = this.activeVoicesByPitch.get(voice.midi);
    if (list) {
      const idx = list.indexOf(voice);
      if (idx !== -1) list.splice(idx, 1);
      if (list.length === 0) this.activeVoicesByPitch.delete(voice.midi);
    }
  }
}
