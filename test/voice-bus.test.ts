import { describe, it, expect, vi } from 'vitest';
import { VoiceBus, dbToGain } from '../src/audio/VoiceBus.js';

// Minimal Web Audio Mock for Vitest
function createMockAudioContext() {
  const ctx = {
    currentTime: 1.0,
    destination: {},
    createGain: () => {
      const gain = {
        value: 1.0,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
        cancelAndHoldAtTime: vi.fn()
      };
      return {
        gain,
        connect: vi.fn()
      } as unknown as GainNode;
    },
    createBiquadFilter: () => {
      const freq = {
        value: 20000,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn()
      };
      return {
        type: 'lowpass',
        frequency: freq,
        connect: vi.fn()
      } as unknown as BiquadFilterNode;
    }
  };
  return ctx as unknown as AudioContext;
}

function createMockSource() {
  return {
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as (() => void) | null
  } as unknown as AudioBufferSourceNode;
}

describe('VoiceBus & Damper Key-Held Immunity', () => {
  it('converts decibels to linear gain accurately', () => {
    expect(dbToGain(0)).toBeCloseTo(1.0, 5);
    expect(dbToGain(-6)).toBeCloseTo(0.501187, 4);
    expect(dbToGain(-2.2)).toBeCloseTo(0.776247, 4);
  });

  it('allocates voice with correct keyReleaseTime', () => {
    const ctx = createMockAudioContext();
    const bus = new VoiceBus(ctx);
    const src = createMockSource();
    const gainNode = ctx.createGain();

    const voice = bus.allocateVoice('note-m2-beat1', 66, src, gainNode, 3.75, 2.5);

    expect(voice.id).toBe('note-m2-beat1');
    expect(voice.midi).toBe(66);
    expect(voice.startTime).toBe(3.75);
    expect(voice.keyReleaseTime).toBe(6.25); // 3.75 + 2.5
    expect(voice.isPedalHeld).toBe(false); // Pedal was initially false
  });

  it('preserves beat-1 notes when pedal is lifted at barline (Key-Held Immunity)', () => {
    const ctx = createMockAudioContext();
    const bus = new VoiceBus(ctx);

    // Engage pedal
    bus.setPedal(true, 0.0);

    // 1. Old note from Measure 1: started at 1.25, ended at 2.5 (key released at 2.5)
    const oldSrc = createMockSource();
    const oldGain = ctx.createGain();
    const oldVoice = bus.allocateVoice('old-m1-note', 60, oldSrc, oldGain, 1.25, 1.25);
    expect(oldVoice.keyReleaseTime).toBe(2.5);
    expect(oldVoice.isPedalHeld).toBe(true);

    // 2. New beat-1 note of Measure 2: starts at 3.75, duration 2.5 (key held until 6.25)
    const newSrc = createMockSource();
    const newGain = ctx.createGain();
    const newVoice = bus.allocateVoice('new-m2-beat1', 66, newSrc, newGain, 3.75, 2.5);
    expect(newVoice.keyReleaseTime).toBe(6.25);
    expect(newVoice.isPedalHeld).toBe(true);

    // Now barline damper executes at 3.75 (barline of Measure 2)
    bus.setPedal(false, 3.75);

    // Old note key was released at 2.5 (2.5 <= 3.75 - 0.02):
    // MUST BE CLAMPED at audioTime + 0.09 = 3.84!
    expect(oldGain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 3.84);
    expect(oldSrc.stop).toHaveBeenCalled();
    expect((oldSrc.stop as any).mock.calls[0][0]).toBeCloseTo(3.85, 3);
    expect(oldVoice.isPedalHeld).toBe(false);

    // New beat-1 note key is held until 6.25 (3.75 <= 3.75 or 3.75 < 6.25 - 0.02):
    // MUST NOT BE CLAMPED by damper release (Key-Held Immunity)!
    // It should NOT have been clamped at 3.84, nor should its src.stop be called!
    expect(newGain.gain.exponentialRampToValueAtTime).not.toHaveBeenCalledWith(0.0001, 3.84);
    expect(newSrc.stop).not.toHaveBeenCalled();
    // Voice remains sounding undisturbed
    expect(newVoice.startTime).toBe(3.75);
    expect(newVoice.keyReleaseTime).toBe(6.25);
  });

  it('preserves notes tied across barline during damper release', () => {
    const ctx = createMockAudioContext();
    const bus = new VoiceBus(ctx);

    bus.setPedal(true, 0.0);

    // Tied note across barline: started at 2.5 in Bar 1, tied into Bar 2 until 5.0
    const tiedSrc = createMockSource();
    const tiedGain = ctx.createGain();
    const tiedVoice = bus.allocateVoice('tied-note', 70, tiedSrc, tiedGain, 2.5, 2.5);
    expect(tiedVoice.keyReleaseTime).toBe(5.0);

    // Barline damper at Bar 2 start (3.75)
    bus.setPedal(false, 3.75);

    // Key is held until 5.0 (3.75 < 5.0 - 0.02):
    // MUST NOT BE CLAMPED!
    expect(tiedGain.gain.exponentialRampToValueAtTime).not.toHaveBeenCalledWith(0.0001, 3.84);
    expect(tiedSrc.stop).not.toHaveBeenCalled();
  });
});
