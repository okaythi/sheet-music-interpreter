/**
 * Global Type Definitions for Sheet Music Interpreter & Playback Engine
 */

export type StaffType = 'upper' | 'lower';
export type ClefType = 'G' | 'F';
export type NoteVisualState = 'note-idle' | 'note-active' | 'note-sustain' | 'note-past';

export interface ScoreNote {
  id: string;
  mn: number;
  system: number;
  staff: StaffType;
  voice: number;
  pitch: string;
  octave: number;
  midi: number;
  start: number;
  end: number;
  dur: number;
  x: number;
  y: number;
  stemUp: boolean;
  isOpen: boolean;
  hasDot: boolean;
  tied: string; // "1" start, "-1" stop, "0" continue, "" none
  clef: ClefType;
  ledgers: number[];
  tieToX?: number;
}

export interface ScoreSystem {
  id: number;
  m1: number;
  m2: number;
  title: string;
  section: string;
  staff2Clef: ClefType;
  noteCount: number;
  startSec: number;
  endSec: number;
}

export interface MeasureMeta {
  index: number;
  timeSig: string;
  startSec: number;
  durationSec: number;
  bpm?: number;
}

export type PedalEventType = 'down' | 'up' | 'change';

export interface PedalEvent {
  id: string;
  time: number;
  type: PedalEventType;
}

export interface TimbreEvent {
  id: string;
  time: number;
  unaCorda: boolean;
}

export interface ScoreData {
  title: string;
  composer: string;
  key: string;
  timeSig: string;
  tempoBpm: number;
  measureDuration: number;
  totalDuration: number;
  totalMeasures: number;
  totalSystems: number;
  systems: ScoreSystem[];
  notes: ScoreNote[];
  measures?: MeasureMeta[];
  pedalEvents?: PedalEvent[];
  timbreEvents?: TimbreEvent[];
  tempoSections?: TempoSection[];
}

export type TimingStrategy = 'rubato' | 'metronome' | 'dtw';

export interface TempoSection {
  name: string;
  startMeasure: number;
  endMeasure: number;
  bpm: number;
  curve?: 'accelerando' | 'ritardando' | 'steady';
  tempoFactor?: number;
  rubatoFactor?: number;
}

export interface AlignmentMarker {
  measure: number;
  scoreTime: number;
  audioTime: number;
}

export interface NoteHandle {
  note: ScoreNote;
  el: SVGElement;
  head: SVGElement | null;
  stem: SVGElement | null;
  dot: SVGElement | null;
  tie: SVGElement | null;
  openClass: string;
  lastState: NoteVisualState | null;
}

export interface ActiveVoice {
  id: string;
  midi: number;
  src: AudioBufferSourceNode;
  gain: GainNode;
  filter?: BiquadFilterNode;
  startTime: number;
  keyReleaseTime: number;
  scheduledStopTime: number;
  isPedalHeld: boolean;
}

export interface SeekState {
  time: number;
  systemId: number;
  activeNoteIds: Set<string>;
  activePitches: Set<number>;
  pedalActive: boolean;
  unaCordaActive: boolean;
}

export interface SchedulerCallback {
  onNoteStart: (note: ScoreNote, audioTime: number) => void;
  onPedalChange: (engaged: boolean, audioTime: number) => void;
  onMeasureStart?: (measure: number, audioTime: number) => void;
}

export interface MusicXmlMeasureAssertion {
  measure: number;
  voice: number;
  cumulativeDivisions: number;
  expectedDivisions: number;
  balanced: boolean;
}
