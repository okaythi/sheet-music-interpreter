import { AudioEngine } from './AudioEngine.js';
import { ScoreModel } from '../model/ScoreModel.js';
import type { SchedulerCallback } from '../types/index.js';

export class Scheduler {
  private audioEngine: AudioEngine;
  private scoreModel: ScoreModel;
  private callbacks: SchedulerCallback[] = [];

  // Two Clocks timing configuration
  private lookaheadMs = 120; // Lookahead window into the future
  private intervalMs = 25;   // Timer poll interval
  private timerId: number | null = null;

  // Playback state
  private isPlaying = false;
  private playbackSpeed = 1.0;
  
  // Hardware clock anchor mapping
  private anchorHwTime = 0;
  private startPerfOffset = 0;
  private lastScheduledPerfTime = 0;

  // Track scheduled notes to prevent duplicate queuing
  private scheduledNoteIds = new Set<string>();

  // Track measure barlines for damping
  private lastDampedMeasure = -1;

  constructor(audioEngine: AudioEngine, scoreModel: ScoreModel) {
    this.audioEngine = audioEngine;
    this.scoreModel = scoreModel;
  }

  public registerCallback(cb: SchedulerCallback): void {
    this.callbacks.push(cb);
  }

  public setPlaybackSpeed(speed: number): void {
    if (this.isPlaying) {
      // Re-anchor hardware clock when speed changes to prevent time warp jumps
      const currentPerf = this.getCurrentPerfTime();
      const ctx = this.audioEngine.getContext();
      if (ctx) {
        this.anchorHwTime = ctx.currentTime;
        this.startPerfOffset = currentPerf;
      }
    }
    this.playbackSpeed = speed;
  }

  public getPlaybackSpeed(): number {
    return this.playbackSpeed;
  }

  public start(fromPerfTime = 0): void {
    const ctx = this.audioEngine.getContext();
    if (!ctx) return;

    this.isPlaying = true;
    this.anchorHwTime = ctx.currentTime;
    this.startPerfOffset = fromPerfTime;
    this.lastScheduledPerfTime = fromPerfTime;
    this.scheduledNoteIds.clear();
    this.lastDampedMeasure = Math.floor(this.scoreModel.tempoMap.perfTimeToScoreTime(fromPerfTime) / this.scoreModel.data.measureDuration);

    // Initial immediate scheduling burst
    this.scheduleLookahead();

    // Start 25ms timer
    this.timerId = window.setInterval(() => {
      this.scheduleLookahead();
    }, this.intervalMs);
  }

  public pause(): number {
    const currentPerf = this.getCurrentPerfTime();
    this.isPlaying = false;
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    this.audioEngine.stopAll();
    this.scheduledNoteIds.clear();
    return currentPerf;
  }

  public seek(toPerfTime: number): void {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    this.startPerfOffset = toPerfTime;
    this.lastScheduledPerfTime = toPerfTime;
    this.scheduledNoteIds.clear();
    this.audioEngine.stopAll();

    if (wasPlaying) {
      this.start(toPerfTime);
    }
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Returns current hardware-synchronized performance time (in seconds)
   */
  public getCurrentPerfTime(): number {
    if (!this.isPlaying) {
      return this.startPerfOffset;
    }
    const ctx = this.audioEngine.getContext();
    if (!ctx) return this.startPerfOffset;

    const hwDelta = ctx.currentTime - this.anchorHwTime;
    const current = this.startPerfOffset + hwDelta * this.playbackSpeed;
    const total = this.scoreModel.tempoMap.getTotalPerfDuration();
    return Math.min(total, Math.max(0, current));
  }

  /**
   * Returns visual performance time adjusted for output audio latency (Bluetooth, OS buffers)
   */
  public getVisualPerfTime(): number {
    const currentPerf = this.getCurrentPerfTime();
    if (!this.isPlaying) return currentPerf;

    const latency = this.audioEngine.getOutputLatency();
    const compensated = currentPerf - latency * this.playbackSpeed;
    return Math.max(0, compensated);
  }

  /**
   * The Hardware Lookahead Queue:
   * Finds all notes in [lastScheduledPerfTime, windowEndPerfTime) and schedules them on the hardware clock.
   */
  private scheduleLookahead(): void {
    const ctx = this.audioEngine.getContext();
    if (!ctx || !this.isPlaying) return;

    const currentHw = ctx.currentTime;
    const currentPerf = this.getCurrentPerfTime();
    const lookaheadSec = (this.lookaheadMs / 1000) * this.playbackSpeed;
    const windowEndPerf = currentPerf + lookaheadSec;

    // 1. Query upcoming notes in window
    const notes = this.scoreModel.getNotesInPerfWindow(this.lastScheduledPerfTime, windowEndPerf);

    for (const note of notes) {
      if (this.scheduledNoteIds.has(note.id)) continue;
      this.scheduledNoteIds.add(note.id);

      const notePerfStart = this.scoreModel.tempoMap.scoreTimeToPerfTime(note.start);
      const notePerfEnd = this.scoreModel.tempoMap.scoreTimeToPerfTime(note.end);
      const notePerfDur = Math.max(0.1, notePerfEnd - notePerfStart);

      // Compute precise future hardware time
      const hwDelta = (notePerfStart - this.startPerfOffset) / this.playbackSpeed;
      const targetHwTime = Math.max(currentHw, this.anchorHwTime + hwDelta);

      // Schedule audio buffer
      this.audioEngine.scheduleNote(note.id, note.midi, targetHwTime, notePerfDur);

      for (const cb of this.callbacks) {
        cb.onNoteStart(note, targetHwTime);
      }
    }

    // 2. Barline Damper Scheduling
    const currentScoreTime = this.scoreModel.tempoMap.perfTimeToScoreTime(currentPerf);
    const activeMeasure = Math.floor(currentScoreTime / this.scoreModel.data.measureDuration);
    
    if (activeMeasure !== this.lastDampedMeasure && activeMeasure > 0) {
      const measureStartPerf = this.scoreModel.tempoMap.getMeasureStartPerf(activeMeasure + 1);
      const hwDelta = (measureStartPerf - this.startPerfOffset) / this.playbackSpeed;
      const damperHwTime = Math.max(currentHw, this.anchorHwTime + hwDelta);

      // Momentary pedal lift at barline
      this.audioEngine.setPedal(false, damperHwTime);
      this.audioEngine.setPedal(true, damperHwTime + 0.08);

      for (const cb of this.callbacks) {
        cb.onPedalChange(false, damperHwTime);
        cb.onPedalChange(true, damperHwTime + 0.08);
      }
      this.lastDampedMeasure = activeMeasure;
    }

    // 3. Dynamic Una Corda (con sordina) Check
    const isUnaCorda = (activeMeasure < 14) || (activeMeasure >= 65);
    this.audioEngine.setUnaCorda(isUnaCorda, currentHw);

    this.lastScheduledPerfTime = windowEndPerf;

    // Check completion
    const totalPerf = this.scoreModel.tempoMap.getTotalPerfDuration();
    if (currentPerf >= totalPerf) {
      this.pause();
    }
  }
}
