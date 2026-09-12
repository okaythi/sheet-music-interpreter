import type { MusicXmlMeasureAssertion } from '../types/index.js';

export interface ParsedXmlNote {
  pitch: string;
  octave: number;
  midi: number;
  divisions: number;
  voice: number;
  staff: number;
  isRest: boolean;
  isChord: boolean;
  tieStart: boolean;
  tieStop: boolean;
  tupletRatio?: { actual: number; normal: number };
}

export class MusicXmlParser {
  /**
   * Helper: Convert Note letter and alter to MIDI pitch
   */
  public static noteToMidi(step: string, octave: number, alter = 0): number {
    const semitones: Record<string, number> = {
      C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11
    };
    const base = semitones[step.toUpperCase()] ?? 0;
    return (octave + 1) * 12 + base + alter;
  }

  /**
   * Calculates the nominal measure duration in rational divisions.
   * For compound 9/8 meter: 9 eighth notes = 4.5 quarter notes = 4.5 * divisions.
   */
  public static calculateNominalMeasureDivisions(
    beats: number,
    beatType: number,
    divisionsPerQuarter: number
  ): number {
    return Math.round((beats * 4 / beatType) * divisionsPerQuarter);
  }

  /**
   * Validates voice balance and cursor tracking inside a MusicXML measure string.
   * Checks <backup>, <forward>, notes, and rests, asserting cumulative duration per voice.
   */
  public static validateMeasureString(
    measureXml: string,
    beats: number,
    beatType: number,
    divisions: number
  ): MusicXmlMeasureAssertion[] {
    const expectedDivisions = this.calculateNominalMeasureDivisions(beats, beatType, divisions);
    const voiceDurations: Map<number, number> = new Map();
    let measureCursor = 0;
    let currentVoice = 1;

    // Lightweight regex-based XML token scanner for browser/CLI verification
    const tokenRegex = /<(note|backup|forward)[^>]*>([\s\S]*?)<\/\1>/gi;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(measureXml)) !== null) {
      const tag = match[1].toLowerCase();
      const content = match[2];

      const durationMatch = content.match(/<duration>(\d+)<\/duration>/);
      const dur = durationMatch ? parseInt(durationMatch[1], 10) : 0;

      const voiceMatch = content.match(/<voice>(\d+)<\/voice>/);
      if (voiceMatch) {
        currentVoice = parseInt(voiceMatch[1], 10);
      }

      const isChord = /<chord\s*\/>/.test(content);

      if (!voiceDurations.has(currentVoice)) {
        voiceDurations.set(currentVoice, 0);
      }

      if (tag === 'note') {
        if (!isChord) {
          // Advance voice duration and timeline cursor
          voiceDurations.set(currentVoice, voiceDurations.get(currentVoice)! + dur);
          measureCursor += dur;
        }
      } else if (tag === 'backup') {
        // Rewinds global measure cursor for the next voice
        measureCursor = Math.max(0, measureCursor - dur);
      } else if (tag === 'forward') {
        measureCursor += dur;
      }
    }

    const assertions: MusicXmlMeasureAssertion[] = [];
    for (const [voice, cumulative] of voiceDurations.entries()) {
      assertions.push({
        measure: 1,
        voice,
        cumulativeDivisions: cumulative,
        expectedDivisions,
        balanced: cumulative === expectedDivisions
      });
    }

    return assertions;
  }

  /**
   * Handles <time-modification> tuplet scaling (e.g. 2:3 duplet in compound meter)
   */
  public static computeTupletDuration(
    standardDuration: number,
    actualNotes: number,
    normalNotes: number
  ): number {
    // A duplet (2 in the space of 3) occupies 3/2 times standard duration per note
    return Math.round(standardDuration * (normalNotes / actualNotes));
  }
}
