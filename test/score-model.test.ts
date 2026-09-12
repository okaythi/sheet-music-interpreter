import { describe, it, expect } from 'vitest';
import { ScoreModel } from '../src/model/ScoreModel.js';
import { TempoMap } from '../src/model/TempoMap.js';
import type { ScoreData } from '../src/types/index.js';

const MOCK_SCORE_DATA: ScoreData = {
  title: "Clair de lune",
  composer: "Claude Debussy",
  key: "Db Major",
  timeSig: "9/8",
  tempoBpm: 48,
  measureDuration: 3.75,
  totalDuration: 270.0,
  totalMeasures: 72,
  totalSystems: 2,
  systems: [
    { id: 1, m1: 1, m2: 2, title: "Bars 1 & 2", section: "Theme A", staff2Clef: "G", noteCount: 4, startSec: 0.0, endSec: 7.5 },
    { id: 2, m1: 3, m2: 4, title: "Bars 3 & 4", section: "Theme A", staff2Clef: "G", noteCount: 2, startSec: 7.5, endSec: 15.0 }
  ],
  notes: [
    { id: "n1", mn: 1, system: 1, staff: "lower", voice: 1, pitch: "F4", octave: 4, midi: 65, start: 0.417, end: 0.833, dur: 0.417, x: 211, y: 160, stemUp: true, isOpen: false, hasDot: false, tied: "", clef: "G", ledgers: [] },
    { id: "n2", mn: 1, system: 1, staff: "upper", voice: 1, pitch: "F5", octave: 5, midi: 77, start: 0.833, end: 1.25, dur: 0.417, x: 255, y: 36, stemUp: true, isOpen: false, hasDot: false, tied: "", clef: "G", ledgers: [] },
    { id: "n3", mn: 1, system: 1, staff: "lower", voice: 1, pitch: "Ab4", octave: 4, midi: 68, start: 1.25, end: 3.75, dur: 2.5, x: 299, y: 152, stemUp: true, isOpen: true, hasDot: true, tied: "", clef: "G", ledgers: [] },
    { id: "n4", mn: 2, system: 1, staff: "upper", voice: 1, pitch: "Db5", octave: 5, midi: 73, start: 3.75, end: 5.0, dur: 1.25, x: 431, y: 44, stemUp: true, isOpen: false, hasDot: true, tied: "", clef: "G", ledgers: [] },
    { id: "n5", mn: 3, system: 2, staff: "lower", voice: 1, pitch: "F4", octave: 4, midi: 65, start: 7.5, end: 10.0, dur: 2.5, x: 168, y: 160, stemUp: true, isOpen: true, hasDot: true, tied: "", clef: "G", ledgers: [] },
    { id: "n6", mn: 4, system: 2, staff: "upper", voice: 1, pitch: "Bb4", octave: 4, midi: 70, start: 11.25, end: 12.5, dur: 1.25, x: 592, y: 52, stemUp: true, isOpen: false, hasDot: true, tied: "", clef: "G", ledgers: [] }
  ]
};

describe('ScoreModel', () => {
  it('correctly filters notes by system', () => {
    const model = new ScoreModel(MOCK_SCORE_DATA, new TempoMap('metronome'));
    const sys1Notes = model.getNotesForSystem(1);
    const sys2Notes = model.getNotesForSystem(2);

    expect(sys1Notes.length).toBe(4);
    expect(sys2Notes.length).toBe(2);
    expect(sys1Notes.map(n => n.id)).toEqual(["n1", "n2", "n3", "n4"]);
  });

  it('performs binary search lookahead queries accurately', () => {
    const model = new ScoreModel(MOCK_SCORE_DATA, new TempoMap('metronome'));

    // Window [0.0, 0.5) should capture n1 (start 0.417)
    const w1 = model.getNotesInPerfWindow(0.0, 0.5);
    expect(w1.length).toBe(1);
    expect(w1[0].id).toBe('n1');

    // Window [0.5, 1.5) should capture n2 (start 0.833) and n3 (start 1.25)
    const w2 = model.getNotesInPerfWindow(0.5, 1.5);
    expect(w2.length).toBe(2);
    expect(w2.map(n => n.id)).toEqual(['n2', 'n3']);

    // Empty window
    const wEmpty = model.getNotesInPerfWindow(5.5, 7.0);
    expect(wEmpty.length).toBe(0);
  });

  it('reconstructs seek-state at arbitrary time points', () => {
    const model = new ScoreModel(MOCK_SCORE_DATA, new TempoMap('metronome'));

    // At t = 2.0s: n3 is sounding (1.25 to 3.75)
    const stateAt2 = model.getSeekState(2.0);
    expect(stateAt2.systemId).toBe(1);
    expect(stateAt2.activeNoteIds.has('n3')).toBe(true);
    expect(stateAt2.activePitches.has(68)).toBe(true);
    expect(stateAt2.pedalActive).toBe(true);
    expect(stateAt2.unaCordaActive).toBe(true); // Theme A
  });
});
