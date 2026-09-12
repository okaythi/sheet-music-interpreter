import type { TimingStrategy, TempoSection, AlignmentMarker } from '../types/index.js';

export class TempoMap {
  private strategy: TimingStrategy = 'rubato';
  private nominalMeasureDur = 3.75; // 9/8 at 48 bpm = (60/48) * 3 = 3.75s
  private totalMeasures = 72;

  // Curated Expressive Rubato Sections
  private sections: TempoSection[] = [
    { name: 'Theme A (Andante très expressif)', startMeasure: 1, endMeasure: 14, bpm: 43.5 },
    { name: 'Tempo rubato Transition', startMeasure: 15, endMeasure: 26, bpm: 47.0 },
    { name: 'Calmato (Arpeggios)', startMeasure: 27, endMeasure: 42, bpm: 48.5 },
    { name: 'Animato Climax', startMeasure: 43, endMeasure: 50, bpm: 55.0 },
    { name: 'Theme A Recapitulation', startMeasure: 51, endMeasure: 65, bpm: 45.0 },
    { name: 'Coda & Final Chords (Ritardando)', startMeasure: 66, endMeasure: 72, bpm: 39.0 }
  ];

  // Optional external audio recording alignment markers (DTW / studio reference)
  private alignmentMarkers: AlignmentMarker[] = [];

  // Precomputed measure boundary lookup tables for performance time
  private measureStartsPerf: number[] = [];
  private totalPerfDuration = 270.0;

  constructor(strategy: TimingStrategy = 'rubato') {
    this.strategy = strategy;
    this.recompute();
  }

  public setStrategy(strategy: TimingStrategy): void {
    this.strategy = strategy;
    this.recompute();
  }

  public getStrategy(): TimingStrategy {
    return this.strategy;
  }

  public setAlignmentMarkers(markers: AlignmentMarker[]): void {
    this.alignmentMarkers = [...markers].sort((a, b) => a.measure - b.measure);
    if (this.strategy === 'dtw') {
      this.recompute();
    }
  }

  private recompute(): void {
    this.measureStartsPerf = new Array(this.totalMeasures + 2).fill(0);

    if (this.strategy === 'metronome') {
      for (let m = 1; m <= this.totalMeasures + 1; m++) {
        this.measureStartsPerf[m] = (m - 1) * this.nominalMeasureDur;
      }
      this.totalPerfDuration = this.totalMeasures * this.nominalMeasureDur;
      return;
    }

    if (this.strategy === 'dtw' && this.alignmentMarkers.length > 1) {
      // Build piecewise linear interpolation from DTW markers
      let prevMarker = this.alignmentMarkers[0];
      this.measureStartsPerf[1] = prevMarker.audioTime;

      for (let i = 1; i < this.alignmentMarkers.length; i++) {
        const nextMarker = this.alignmentMarkers[i];
        const mSpan = nextMarker.measure - prevMarker.measure;
        const tSpan = nextMarker.audioTime - prevMarker.audioTime;

        for (let m = prevMarker.measure; m < nextMarker.measure; m++) {
          const frac = (m - prevMarker.measure) / mSpan;
          this.measureStartsPerf[m] = prevMarker.audioTime + frac * tSpan;
        }
        prevMarker = nextMarker;
      }
      this.measureStartsPerf[prevMarker.measure] = prevMarker.audioTime;
      this.totalPerfDuration = prevMarker.audioTime;
      return;
    }

    // Default: Expressive Rubato Curve
    let currentPerfTime = 0;
    for (let m = 1; m <= this.totalMeasures; m++) {
      this.measureStartsPerf[m] = currentPerfTime;
      const sec = this.sections.find(s => m >= s.startMeasure && m <= s.endMeasure) || this.sections[0];
      
      // Fine-grained micro-rubato within sections
      let bpmMod = sec.bpm;
      if (sec.name === 'Animato Climax') {
        // Accelerando towards climax at measure 47-48
        const progress = (m - sec.startMeasure) / (sec.endMeasure - sec.startMeasure + 1);
        bpmMod = sec.bpm + Math.sin(progress * Math.PI) * 4.0;
      } else if (sec.name.includes('Coda')) {
        // Gradual ritardando into the pianissimo resolution
        const progress = (m - sec.startMeasure) / (sec.endMeasure - sec.startMeasure + 1);
        bpmMod = sec.bpm - progress * 8.0;
      }

      const beatDur = 60 / Math.max(25, bpmMod);
      const measureDur = beatDur * 3; // 3 dotted-quarter beats in 9/8
      currentPerfTime += measureDur;
    }
    this.measureStartsPerf[this.totalMeasures + 1] = currentPerfTime;
    this.totalPerfDuration = currentPerfTime;
  }

  /**
   * Convert nominal score time (at 48bpm, 3.75s per measure) to performance seconds
   */
  public scoreTimeToPerfTime(scoreSec: number): number {
    if (this.strategy === 'metronome') return scoreSec;

    // Nominal measure index
    const mFloat = 1 + scoreSec / this.nominalMeasureDur;
    const mBase = Math.floor(mFloat);
    const mFrac = mFloat - mBase;

    if (mBase < 1) return 0;
    if (mBase > this.totalMeasures) return this.totalPerfDuration;

    const mStart = this.measureStartsPerf[mBase];
    const mNext = this.measureStartsPerf[mBase + 1] || (mStart + this.nominalMeasureDur);
    return mStart + mFrac * (mNext - mStart);
  }

  /**
   * Convert performance seconds back to nominal score seconds
   */
  public perfTimeToScoreTime(perfSec: number): number {
    if (this.strategy === 'metronome') return perfSec;
    if (perfSec <= 0) return 0;
    if (perfSec >= this.totalPerfDuration) return this.totalMeasures * this.nominalMeasureDur;

    // Binary search for measure in measureStartsPerf
    let low = 1;
    let high = this.totalMeasures;
    let m = 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.measureStartsPerf[mid] <= perfSec) {
        m = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const mStart = this.measureStartsPerf[m];
    const mNext = this.measureStartsPerf[m + 1] || (mStart + this.nominalMeasureDur);
    const frac = Math.min(1.0, Math.max(0.0, (perfSec - mStart) / Math.max(0.001, mNext - mStart)));

    return (m - 1) * this.nominalMeasureDur + frac * this.nominalMeasureDur;
  }

  public getMeasureStartPerf(m: number): number {
    const clamped = Math.max(1, Math.min(this.totalMeasures + 1, m));
    return this.measureStartsPerf[clamped] || 0;
  }

  public getTotalPerfDuration(): number {
    return this.totalPerfDuration;
  }

  public getSections(): TempoSection[] {
    return this.sections;
  }
}
