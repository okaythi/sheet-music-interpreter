import { describe, it, expect } from 'vitest';
import { ScoreModel } from '../src/model/ScoreModel.js';
import { TempoMap } from '../src/model/TempoMap.js';
import { MusicXmlParser } from '../src/compiler/MusicXmlParser.js';
import type { ScoreData } from '../src/types/index.js';

describe('Universal Data-Driven Engine Architecture', () => {
  it('supports unpedaled / dry Classical pieces (e.g. Bach Invention)', () => {
    const BACH_INVENTION_4_4: ScoreData = {
      title: "Invention No. 1 in C Major, BWV 772",
      composer: "Johann Sebastian Bach",
      key: "C Major",
      timeSig: "4/4",
      tempoBpm: 100, // 60/100 * 4 = 2.4s per measure
      measureDuration: 2.4,
      totalDuration: 52.8,
      totalMeasures: 22,
      totalSystems: 4,
      systems: [
        { id: 1, m1: 1, m2: 5, title: "Bars 1-5", section: "Exposition", staff2Clef: "F", noteCount: 40, startSec: 0, endSec: 12.0 }
      ],
      notes: [
        { id: "b1", mn: 1, system: 1, staff: "upper", voice: 1, pitch: "C4", octave: 4, midi: 60, start: 0.0, end: 0.3, dur: 0.3, x: 100, y: 80, stemUp: true, isOpen: false, hasDot: false, tied: "", clef: "G", ledgers: [] }
      ]
      // No pedalEvents, no timbreEvents!
    };

    const tempoMap = new TempoMap(BACH_INVENTION_4_4, 'metronome');
    const model = new ScoreModel(BACH_INVENTION_4_4, tempoMap);

    // Measure duration should be 2.4s, total duration 22 * 2.4 = 52.8s
    expect(tempoMap.getMeasureNominalDuration(1)).toBeCloseTo(2.4, 2);
    expect(tempoMap.getTotalPerfDuration()).toBeCloseTo(52.8, 1);

    // Seek states must remain strictly dry (no pedal, no una corda)
    const seek1 = model.getSeekState(0.0);
    expect(seek1.pedalActive).toBe(false);
    expect(seek1.unaCordaActive).toBe(false);

    const seek2 = model.getSeekState(15.0);
    expect(seek2.pedalActive).toBe(false);
    expect(seek2.unaCordaActive).toBe(false);

    // No pedal or timbre events should be returned in any window
    expect(model.getPedalEventsInPerfWindow(0, 10)).toHaveLength(0);
    expect(model.getTimbreEventsInPerfWindow(0, 10)).toHaveLength(0);
  });

  it('supports non-uniform multi-meter scores (e.g. alternating 3/4 and 4/4)', () => {
    // Measure 1: 3/4 at 120 bpm = 1.5s
    // Measure 2: 4/4 at 120 bpm = 2.0s
    // Measure 3: 3/4 at 120 bpm = 1.5s
    const MULTI_METER_SCORE: ScoreData = {
      title: "Mixed Meter Study",
      composer: "Modern Composer",
      key: "G Major",
      timeSig: "mixed",
      tempoBpm: 120,
      measureDuration: 1.5,
      totalDuration: 5.0,
      totalMeasures: 3,
      totalSystems: 1,
      systems: [
        { id: 1, m1: 1, m2: 3, title: "Bars 1-3", section: "Main", staff2Clef: "F", noteCount: 10, startSec: 0, endSec: 5.0 }
      ],
      notes: [],
      measures: [
        { index: 1, timeSig: "3/4", startSec: 0.0, durationSec: 1.5, bpm: 120 },
        { index: 2, timeSig: "4/4", startSec: 1.5, durationSec: 2.0, bpm: 120 },
        { index: 3, timeSig: "3/4", startSec: 3.5, durationSec: 1.5, bpm: 120 }
      ]
    };

    const tempoMap = new TempoMap(MULTI_METER_SCORE, 'metronome');
    const model = new ScoreModel(MULTI_METER_SCORE, tempoMap);

    expect(tempoMap.getMeasureNominalStart(1)).toBe(0.0);
    expect(tempoMap.getMeasureNominalDuration(1)).toBe(1.5);

    expect(tempoMap.getMeasureNominalStart(2)).toBe(1.5);
    expect(tempoMap.getMeasureNominalDuration(2)).toBe(2.0);

    expect(tempoMap.getMeasureNominalStart(3)).toBe(3.5);
    expect(tempoMap.getMeasureNominalDuration(3)).toBe(1.5);

    expect(tempoMap.getTotalPerfDuration()).toBeCloseTo(5.0, 2);

    expect(model.getSeekState(0.0).systemId).toBe(1);
    expect(model.getSeekState(2.5).time).toBe(2.5);
  });

  it('correctly schedules data-driven pedal and timbre event streams', () => {
    const CHOPIN_NOCTURNE: ScoreData = {
      title: "Nocturne in C minor",
      composer: "Frédéric Chopin",
      key: "C minor",
      timeSig: "4/4",
      tempoBpm: 60,
      measureDuration: 4.0,
      totalDuration: 16.0,
      totalMeasures: 4,
      totalSystems: 1,
      systems: [
        { id: 1, m1: 1, m2: 4, title: "Bars 1-4", section: "Theme", staff2Clef: "F", noteCount: 20, startSec: 0, endSec: 16.0 }
      ],
      notes: [],
      pedalEvents: [
        { id: "p1", time: 0.0, type: "down" },
        { id: "p2", time: 3.8, type: "up" },
        { id: "p3", time: 4.0, type: "down" }
      ],
      timbreEvents: [
        { id: "t1", time: 4.0, unaCorda: true },
        { id: "t2", time: 12.0, unaCorda: false }
      ]
    };

    const tempoMap = new TempoMap(CHOPIN_NOCTURNE, 'metronome');
    const model = new ScoreModel(CHOPIN_NOCTURNE, tempoMap);

    // Window [0.0, 2.0) should capture p1 (time 0.0)
    const pEvents1 = model.getPedalEventsInPerfWindow(0.0, 2.0);
    expect(pEvents1).toHaveLength(1);
    expect(pEvents1[0].id).toBe("p1");

    // Window [3.5, 4.5) should capture p2 (3.8) and p3 (4.0)
    const pEvents2 = model.getPedalEventsInPerfWindow(3.5, 4.5);
    expect(pEvents2).toHaveLength(2);
    expect(pEvents2.map(e => e.id)).toEqual(["p2", "p3"]);

    // Timbre events
    const tEvents = model.getTimbreEventsInPerfWindow(3.0, 5.0);
    expect(tEvents).toHaveLength(1);
    expect(tEvents[0].id).toBe("t1");
    expect(tEvents[0].unaCorda).toBe(true);

    // Seek states
    expect(model.getSeekState(1.0).pedalActive).toBe(true);
    expect(model.getSeekState(1.0).unaCordaActive).toBe(false);

    expect(model.getSeekState(3.9).pedalActive).toBe(false);

    expect(model.getSeekState(5.0).pedalActive).toBe(true);
    expect(model.getSeekState(5.0).unaCordaActive).toBe(true);

    expect(model.getSeekState(13.0).unaCordaActive).toBe(false);
  });

  it('extracts MusicXML pedal and timbre directions accurately', () => {
    const xmlMeasure = `
      <measure number="1">
        <direction placement="below">
          <direction-type>
            <words font-style="italic">con sordina</words>
          </direction-type>
        </direction>
        <direction placement="below">
          <direction-type>
            <pedal type="start" line="yes"/>
          </direction-type>
        </direction>
        <note>
          <pitch><step>C</step><octave>4</octave></pitch>
          <duration>4</duration>
          <voice>1</voice>
        </note>
      </measure>
    `;

    const pedals = MusicXmlParser.parsePedalDirections(xmlMeasure, 0.0);
    expect(pedals).toHaveLength(1);
    expect(pedals[0].type).toBe('down');

    const timbres = MusicXmlParser.parseTimbreDirections(xmlMeasure, 0.0);
    expect(timbres).toHaveLength(1);
    expect(timbres[0].unaCorda).toBe(true);

    const xmlRelease = `
      <measure number="2">
        <direction placement="below">
          <direction-type>
            <words>senza sordina</words>
          </direction-type>
        </direction>
        <direction placement="below">
          <direction-type>
            <pedal type="stop" line="yes"/>
          </direction-type>
        </direction>
      </measure>
    `;

    const pedals2 = MusicXmlParser.parsePedalDirections(xmlRelease, 3.75);
    expect(pedals2).toHaveLength(1);
    expect(pedals2[0].type).toBe('up');

    const timbres2 = MusicXmlParser.parseTimbreDirections(xmlRelease, 3.75);
    expect(timbres2).toHaveLength(1);
    expect(timbres2[0].unaCorda).toBe(false);
  });
});
