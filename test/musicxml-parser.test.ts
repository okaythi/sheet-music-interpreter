import { describe, it, expect } from 'vitest';
import { MusicXmlParser } from '../src/compiler/MusicXmlParser.js';

describe('MusicXmlParser', () => {
  it('calculates exact nominal measure divisions for compound 9/8 meter', () => {
    // 9/8 meter, 8 divisions per quarter note:
    // 9 beats of eighth notes = 4.5 quarter notes = 4.5 * 8 = 36 divisions
    const div36 = MusicXmlParser.calculateNominalMeasureDivisions(9, 8, 8);
    expect(div36).toBe(36);

    // 4/4 meter, 16 divisions per quarter note = 4 * 16 = 64 divisions
    const div64 = MusicXmlParser.calculateNominalMeasureDivisions(4, 4, 16);
    expect(div64).toBe(64);
  });

  it('validates voice cursors and backup/forward balance', () => {
    // Measure with 2 voices:
    // Voice 1: note (dur 18) + note (dur 18) = 36
    // Backup: 36
    // Voice 2: note (dur 36) = 36
    const sampleMeasureXml = `
      <measure number="1">
        <note>
          <voice>1</voice>
          <duration>18</duration>
        </note>
        <note>
          <voice>1</voice>
          <duration>18</duration>
        </note>
        <backup>
          <duration>36</duration>
        </backup>
        <note>
          <voice>2</voice>
          <duration>36</duration>
        </note>
      </measure>
    `;

    const assertions = MusicXmlParser.validateMeasureString(sampleMeasureXml, 9, 8, 8);
    expect(assertions.length).toBe(2);

    const v1 = assertions.find(a => a.voice === 1)!;
    const v2 = assertions.find(a => a.voice === 2)!;

    expect(v1.balanced).toBe(true);
    expect(v1.cumulativeDivisions).toBe(36);

    expect(v2.balanced).toBe(true);
    expect(v2.cumulativeDivisions).toBe(36);
  });

  it('computes accurate tuplet duration scaling', () => {
    // A standard eighth note has duration = 4 divisions
    // In 9/8, a 2:3 duplet has 2 actual notes occupying 3 normal slots
    // Scaled duration = 4 * (3 / 2) = 6 divisions
    const dupletDur = MusicXmlParser.computeTupletDuration(4, 2, 3);
    expect(dupletDur).toBe(6);

    // Triplet in 4/4: 3 actual notes in 2 normal slots
    // 6 * (2 / 3) = 4 divisions
    const tripletDur = MusicXmlParser.computeTupletDuration(6, 3, 2);
    expect(tripletDur).toBe(4);
  });
});
