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

  /**
   * Extracts <pedal type="start|stop|change"/> events from MusicXML
   */
  public static parsePedalDirections(
    xmlString: string,
    measureStartTime = 0
  ): { id: string; time: number; type: 'down' | 'up' | 'change' }[] {
    const events: { id: string; time: number; type: 'down' | 'up' | 'change' }[] = [];
    const pedalRegex = /<pedal\s+[^>]*type=["'](start|stop|change)["'][^>]*\/>/gi;
    let match: RegExpExecArray | null;
    let idx = 1;

    while ((match = pedalRegex.exec(xmlString)) !== null) {
      const typeStr = match[1].toLowerCase();
      const type = typeStr === 'start' ? 'down' : typeStr === 'stop' ? 'up' : 'change';
      events.push({
        id: `pedal-${idx++}-${measureStartTime}`,
        time: measureStartTime,
        type
      });
    }
    return events;
  }

  /**
   * Extracts <words> directions such as "con sordina", "una corda", "senza sordina", "tre corde"
   */
  public static parseTimbreDirections(
    xmlString: string,
    measureStartTime = 0
  ): { id: string; time: number; unaCorda: boolean }[] {
    const events: { id: string; time: number; unaCorda: boolean }[] = [];
    const wordsRegex = /<words[^>]*>([\s\S]*?)<\/words>/gi;
    let match: RegExpExecArray | null;
    let idx = 1;

    while ((match = wordsRegex.exec(xmlString)) !== null) {
      const text = match[1].toLowerCase().trim();
      if (text.includes('con sordina') || text.includes('una corda')) {
        events.push({
          id: `timbre-${idx++}-${measureStartTime}`,
          time: measureStartTime,
          unaCorda: true
        });
      } else if (text.includes('senza sordina') || text.includes('tre corde') || text.includes('toutes les cordes')) {
        events.push({
          id: `timbre-${idx++}-${measureStartTime}`,
          time: measureStartTime,
          unaCorda: false
        });
      }
    }
    return events;
  }

  /**
   * Extracts <time> signature from measure XML
   */
  public static parseTimeSignature(measureXml: string): { beats: number; beatType: number } | null {
    const beatsMatch = measureXml.match(/<beats>(\d+)<\/beats>/);
    const typeMatch = measureXml.match(/<beat-type>(\d+)<\/beat-type>/);
    if (beatsMatch && typeMatch) {
      return {
        beats: parseInt(beatsMatch[1], 10),
        beatType: parseInt(typeMatch[1], 10)
      };
    }
    return null;
  }

  /**
   * Extracts tempo from <sound tempo="..."/> or <per-minute>
   */
  public static parseTempo(measureXml: string): number | null {
    const soundMatch = measureXml.match(/<sound[^>]*tempo=["']([\d.]+)["']/i);
    if (soundMatch) {
      return parseFloat(soundMatch[1]);
    }
    const perMinMatch = measureXml.match(/<per-minute>([\d.]+)<\/per-minute>/i);
    if (perMinMatch) {
      return parseFloat(perMinMatch[1]);
    }
    return null;
  }
}
