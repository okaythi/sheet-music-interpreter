import { describe, it, expect } from 'vitest';
import { TempoMap } from '../src/model/TempoMap.js';

describe('TempoMap', () => {
  it('computes exact metronomic 48 BPM time mappings', () => {
    const map = new TempoMap('metronome');

    // In metronomic mode, score time equals perf time
    expect(map.scoreTimeToPerfTime(0)).toBe(0);
    expect(map.scoreTimeToPerfTime(3.75)).toBe(3.75);
    expect(map.scoreTimeToPerfTime(37.5)).toBe(37.5);
    expect(map.perfTimeToScoreTime(3.75)).toBe(3.75);

    // Total duration for 72 measures: 72 * 3.75s = 270.0s
    expect(map.getTotalPerfDuration()).toBeCloseTo(270.0, 1);
  });

  it('computes expressive rubato curves smoothly', () => {
    const map = new TempoMap('rubato');

    // Total duration in rubato mode should be in a musically valid range (~250-290s)
    const total = map.getTotalPerfDuration();
    expect(total).toBeGreaterThan(240);
    expect(total).toBeLessThan(300);

    // Monotonicity: Perf time must increase as score time increases
    const t0 = map.scoreTimeToPerfTime(0);
    const t1 = map.scoreTimeToPerfTime(10.0);
    const t2 = map.scoreTimeToPerfTime(50.0);
    const t3 = map.scoreTimeToPerfTime(150.0);

    expect(t0).toBe(0);
    expect(t1).toBeGreaterThan(t0);
    expect(t2).toBeGreaterThan(t1);
    expect(t3).toBeGreaterThan(t2);

    // Roundtrip consistency
    const roundtrip = map.perfTimeToScoreTime(t2);
    expect(roundtrip).toBeCloseTo(50.0, 1);
  });

  it('interpolates DTW alignment markers correctly', () => {
    const map = new TempoMap('dtw');
    map.setAlignmentMarkers([
      { measure: 1, scoreTime: 0, audioTime: 0 },
      { measure: 15, scoreTime: 52.5, audioTime: 55.2 },
      { measure: 72, scoreTime: 270.0, audioTime: 285.0 }
    ]);

    expect(map.getMeasureStartPerf(1)).toBe(0);
    expect(map.getMeasureStartPerf(15)).toBe(55.2);
    expect(map.getTotalPerfDuration()).toBe(285.0);
  });
});
