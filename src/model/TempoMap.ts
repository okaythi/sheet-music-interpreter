import type { TimingStrategy, TempoSection, AlignmentMarker, ScoreData, MeasureMeta } from '../types/index.js';

export class TempoMap {
  private strategy: TimingStrategy = 'rubato';
  private nominalBpm = 48;
  private nominalMeasureDur = 3.75;
  private totalMeasures = 72;
  private measures: MeasureMeta[] = [];

  // Configurable Expressive Rubato Sections
  private sections: TempoSection[] = [
    { name: 'Theme A', startMeasure: 1, endMeasure: 14, bpm: 43.5 },
    { name: 'Transition', startMeasure: 15, endMeasure: 26, bpm: 47.0 },
    { name: 'Middle Section', startMeasure: 27, endMeasure: 42, bpm: 48.5 },
    { name: 'Climax', startMeasure: 43, endMeasure: 50, bpm: 55.0, curve: 'accelerando', tempoFactor: 4.0 },
    { name: 'Recapitulation', startMeasure: 51, endMeasure: 65, bpm: 45.0 },
    { name: 'Coda', startMeasure: 66, endMeasure: 72, bpm: 39.0, curve: 'ritardando', tempoFactor: 8.0 }
  ];

  // Optional external audio recording alignment markers (DTW / studio reference)
  private alignmentMarkers: AlignmentMarker[] = [];

  // Precomputed measure boundary lookup tables for performance time
  private measureStartsPerf: number[] = [];
  private totalPerfDuration = 270.0;

  constructor(scoreOrStrategy?: ScoreData | TimingStrategy, strategy: TimingStrategy = 'rubato') {
    if (typeof scoreOrStrategy === 'string') {
      this.strategy = scoreOrStrategy;
    } else if (scoreOrStrategy) {
      this.strategy = strategy;
      this.initScoreData(scoreOrStrategy);
      return;
    } else {
      this.strategy = strategy;
    }
    this.recompute();
  }

  public initScoreData(scoreData: ScoreData): void {
    this.totalMeasures = scoreData.totalMeasures || 1;
    this.nominalMeasureDur = scoreData.measureDuration || (scoreData.tempoBpm ? (60 / scoreData.tempoBpm) * 4 : 2.0);
    this.nominalBpm = scoreData.tempoBpm || 120;
    this.measures = scoreData.measures || [];

    if (scoreData.tempoSections && scoreData.tempoSections.length > 0) {
      this.sections = [...scoreData.tempoSections];
    } else if (scoreData.tempoBpm) {
      this.sections = [
        { name: 'Default', startMeasure: 1, endMeasure: this.totalMeasures, bpm: this.nominalBpm }
      ];
    }
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

  public getMeasureNominalDuration(m: number): number {
    if (this.measures && this.measures.length >= m && this.measures[m - 1]) {
      return this.measures[m - 1].durationSec;
    }
    return this.nominalMeasureDur;
  }

  public getMeasureNominalStart(m: number): number {
    if (this.measures && this.measures.length > 0) {
      if (m <= this.measures.length && this.measures[m - 1]) {
        return this.measures[m - 1].startSec;
      }
      const lastMeta = this.measures[this.measures.length - 1];
      const excess = m - this.measures.length - 1;
      return lastMeta.startSec + lastMeta.durationSec + excess * this.nominalMeasureDur;
    }
    return (m - 1) * this.nominalMeasureDur;
  }

  private recompute(): void {
    this.measureStartsPerf = new Array(this.totalMeasures + 2).fill(0);

    if (this.strategy === 'metronome') {
      for (let m = 1; m <= this.totalMeasures + 1; m++) {
        this.measureStartsPerf[m] = this.getMeasureNominalStart(m);
      }
      this.totalPerfDuration = this.getMeasureNominalStart(this.totalMeasures + 1);
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

    // Default: Dynamic Rubato Curve scaled from nominal measure durations
    let currentPerfTime = 0;
    for (let m = 1; m <= this.totalMeasures; m++) {
      this.measureStartsPerf[m] = currentPerfTime;
      const sec = this.sections.find(s => m >= s.startMeasure && m <= s.endMeasure) || this.sections[0];
      
      let bpmMod = sec.bpm;
      const span = Math.max(1, sec.endMeasure - sec.startMeasure + 1);
      const progress = (m - sec.startMeasure) / span;

      if (sec.curve === 'accelerando') {
        const factor = sec.tempoFactor ?? 4.0;
        bpmMod = sec.bpm + Math.sin(progress * Math.PI) * factor;
      } else if (sec.curve === 'ritardando') {
        const factor = sec.tempoFactor ?? 8.0;
        bpmMod = sec.bpm - progress * factor;
      } else if (sec.name.includes('Animato') || sec.name.includes('Climax')) {
        bpmMod = sec.bpm + Math.sin(progress * Math.PI) * 4.0;
      } else if (sec.name.includes('Coda')) {
        bpmMod = sec.bpm - progress * 8.0;
      }

      const nominalM = this.getMeasureNominalDuration(m);
      const measureDur = nominalM * (this.nominalBpm / Math.max(20, bpmMod));
      currentPerfTime += measureDur;
    }
    this.measureStartsPerf[this.totalMeasures + 1] = currentPerfTime;
    this.totalPerfDuration = currentPerfTime;
  }

  /**
   * Convert nominal score time to performance seconds
   */
  public scoreTimeToPerfTime(scoreSec: number): number {
    if (this.strategy === 'metronome') return scoreSec;
    if (scoreSec <= 0) return 0;

    let m = 1;
    if (this.measures && this.measures.length > 0) {
      let low = 1;
      let high = this.totalMeasures;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const meta = this.measures[mid - 1];
        if (meta && meta.startSec <= scoreSec) {
          m = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
    } else {
      const mFloat = 1 + scoreSec / this.nominalMeasureDur;
      m = Math.floor(mFloat);
    }

    if (m < 1) return 0;
    if (m > this.totalMeasures) return this.totalPerfDuration;

    const mNomStart = this.getMeasureNominalStart(m);
    const mNomDur = this.getMeasureNominalDuration(m);
    const mFrac = Math.min(1.0, Math.max(0.0, (scoreSec - mNomStart) / Math.max(0.001, mNomDur)));

    const mStartPerf = this.measureStartsPerf[m];
    const mNextPerf = this.measureStartsPerf[m + 1] || (mStartPerf + mNomDur);
    return mStartPerf + mFrac * (mNextPerf - mStartPerf);
  }

  /**
   * Convert performance seconds back to nominal score seconds
   */
  public perfTimeToScoreTime(perfSec: number): number {
    if (this.strategy === 'metronome') return perfSec;
    if (perfSec <= 0) return 0;
    if (perfSec >= this.totalPerfDuration) {
      const lastM = this.totalMeasures;
      return this.getMeasureNominalStart(lastM) + this.getMeasureNominalDuration(lastM);
    }

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
    const mNext = this.measureStartsPerf[m + 1] || (mStart + this.getMeasureNominalDuration(m));
    const frac = Math.min(1.0, Math.max(0.0, (perfSec - mStart) / Math.max(0.001, mNext - mStart)));

    const mNomStart = this.getMeasureNominalStart(m);
    const mNomDur = this.getMeasureNominalDuration(m);
    return mNomStart + frac * mNomDur;
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

