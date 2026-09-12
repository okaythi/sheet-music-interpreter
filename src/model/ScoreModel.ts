import type { ScoreData, ScoreNote, ScoreSystem, SeekState } from '../types/index.js';
import { TempoMap } from './TempoMap.js';

export class ScoreModel {
  public readonly data: ScoreData;
  public readonly tempoMap: TempoMap;
  
  // Sorted note indices for ultra-fast lookahead queries and seek
  private notesSortedByStart: ScoreNote[] = [];
  private notesBySystem: Map<number, ScoreNote[]> = new Map();

  constructor(scoreData: ScoreData, tempoMap?: TempoMap) {
    this.data = scoreData;
    this.tempoMap = tempoMap || new TempoMap('rubato');
    this.init();
  }

  private init(): void {
    // Clone and sort notes strictly by nominal score start time
    this.notesSortedByStart = [...this.data.notes].sort((a, b) => a.start - b.start);

    // Group notes by system for instant system switching
    for (const sys of this.data.systems) {
      this.notesBySystem.set(sys.id, []);
    }
    for (const note of this.data.notes) {
      const list = this.notesBySystem.get(note.system);
      if (list) {
        list.push(note);
      }
    }
  }

  public getNotesForSystem(systemId: number): ScoreNote[] {
    return this.notesBySystem.get(systemId) || [];
  }

  public getSystemById(systemId: number): ScoreSystem | undefined {
    return this.data.systems.find(s => s.id === systemId);
  }

  public getSystemPerfBounds(systemId: number): { startPerf: number; endPerf: number } {
    const sys = this.getSystemById(systemId);
    if (!sys) return { startPerf: 0, endPerf: 0 };
    return {
      startPerf: this.tempoMap.scoreTimeToPerfTime(sys.startSec),
      endPerf: this.tempoMap.scoreTimeToPerfTime(sys.endSec)
    };
  }

  public getSystemForPerfTime(perfTime: number): ScoreSystem {
    const scoreTime = this.tempoMap.perfTimeToScoreTime(perfTime);
    for (let i = 0; i < this.data.systems.length; i++) {
      const sys = this.data.systems[i];
      if (scoreTime >= sys.startSec && scoreTime < sys.endSec) {
        return sys;
      }
    }
    return this.data.systems[this.data.systems.length - 1] || this.data.systems[0];
  }

  /**
   * Lookahead query: Find notes starting within [startPerfSec, endPerfSec)
   * Converts perf window to nominal score window and queries via binary search.
   */
  public getNotesInPerfWindow(startPerfSec: number, endPerfSec: number): ScoreNote[] {
    const startScore = this.tempoMap.perfTimeToScoreTime(startPerfSec);
    const endScore = this.tempoMap.perfTimeToScoreTime(endPerfSec);

    if (startScore >= endScore) return [];

    // Binary search for first note with start >= startScore
    let low = 0;
    let high = this.notesSortedByStart.length - 1;
    let firstIdx = this.notesSortedByStart.length;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.notesSortedByStart[mid].start >= startScore) {
        firstIdx = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    const matches: ScoreNote[] = [];
    for (let i = firstIdx; i < this.notesSortedByStart.length; i++) {
      const n = this.notesSortedByStart[i];
      if (n.start >= endScore) break;
      matches.push(n);
    }
    return matches;
  }

  /**
   * State Reconstruction on Seek:
   * Returns exact active sounding note IDs, active pitches, pedal state, and system ID at any timestamp T.
   */
  public getSeekState(perfTime: number): SeekState {
    const scoreTime = this.tempoMap.perfTimeToScoreTime(perfTime);
    const currentSys = this.getSystemForPerfTime(perfTime);

    const activeNoteIds = new Set<string>();
    const activePitches = new Set<number>();

    // Scan backwards from seek point to find all currently sounding notes
    for (const note of this.notesSortedByStart) {
      if (note.start > scoreTime) break;
      if (scoreTime >= note.start && scoreTime < note.end) {
        activeNoteIds.add(note.id);
        activePitches.add(note.midi);
      }
    }

    // Pedal is active in Clair de lune throughout (with barline dampers)
    const pedalActive = perfTime >= 0.4 && perfTime < this.tempoMap.getTotalPerfDuration();
    
    // Con Sordina (soft pedal) is marked pp con sordina in Theme A (Bars 1-14) and Coda (Bars 66-72)
    const currentMeasure = Math.floor(scoreTime / this.data.measureDuration) + 1;
    const unaCordaActive = (currentMeasure >= 1 && currentMeasure <= 14) || (currentMeasure >= 66);

    return {
      time: perfTime,
      systemId: currentSys.id,
      activeNoteIds,
      activePitches,
      pedalActive,
      unaCordaActive
    };
  }
}
