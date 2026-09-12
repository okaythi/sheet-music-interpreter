import type { ScoreData, TimingStrategy } from './types/index.js';
import { ScoreModel } from './model/ScoreModel.js';
import { TempoMap } from './model/TempoMap.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { Scheduler } from './audio/Scheduler.js';
import { NotePresenter } from './notation/NotePresenter.js';
import { TransportBar } from './ui/TransportBar.js';

class App {
  private scoreModel!: ScoreModel;
  private tempoMap!: TempoMap;
  private audioEngine!: AudioEngine;
  private scheduler!: Scheduler;
  private presenter!: NotePresenter;
  private transport!: TransportBar;

  private currentSystemId = 1;
  private autoPage = true;
  private isLooping = false;
  private soundEnabled = true;

  public async init(): Promise<void> {
    // 1. Fetch unabridged score dataset
    const res = await fetch('/data/clair_full_72m.json');
    const scoreData: ScoreData = await res.json();

    // 2. Initialize Models & Engines
    this.tempoMap = new TempoMap('rubato');
    this.scoreModel = new ScoreModel(scoreData, this.tempoMap);
    this.audioEngine = new AudioEngine();
    this.scheduler = new Scheduler(this.audioEngine, this.scoreModel);

    // 3. Initialize Visual Presenter
    const svgEl = document.getElementById('sheet-svg') as unknown as SVGSVGElement;
    this.presenter = new NotePresenter(svgEl);

    // 4. Initialize Transport Bar UI
    this.transport = new TransportBar({
      onPlayToggle: () => this.togglePlay(),
      onReset: () => this.reset(),
      onSoundToggle: () => this.toggleSound(),
      onLoopToggle: () => this.toggleLoop(),
      onAutoPageToggle: () => this.toggleAutoPage(),
      onPrevSystem: () => this.jumpSystem(this.currentSystemId - 1),
      onNextSystem: () => this.jumpSystem(this.currentSystemId + 1),
      onJumpToSystem: (sysId) => this.jumpSystem(sysId),
      onSpeedChange: (speed) => this.scheduler.setPlaybackSpeed(speed),
      onStrategyChange: (strat) => this.setTimingStrategy(strat),
      onScrub: (pct) => this.scrub(pct)
    });

    // 5. Initial system load
    this.loadSystem(1);
    this.updateVisualFrame();

    // 6. Handle background tab / visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.scheduler.getIsPlaying()) {
        // Scheduler timer continues sample-accurately in background!
      }
    });
  }

  private loadSystem(sysId: number): void {
    const clamped = Math.max(1, Math.min(this.scoreModel.data.totalSystems, sysId));
    this.currentSystemId = clamped;

    const sys = this.scoreModel.getSystemById(clamped);
    if (!sys) return;

    const notes = this.scoreModel.getNotesForSystem(clamped);
    this.presenter.loadSystem(sys, notes);
    this.transport.updateSystemHUD(clamped, this.scoreModel.data.totalSystems, sys.title);
  }

  private jumpSystem(sysId: number): void {
    this.autoPage = false;
    this.transport.setAutoPage(false);

    const clamped = Math.max(1, Math.min(this.scoreModel.data.totalSystems, sysId));
    this.loadSystem(clamped);

    // If paused, jump visual playhead to the beginning of the selected system
    if (!this.scheduler.getIsPlaying()) {
      const bounds = this.scoreModel.getSystemPerfBounds(clamped);
      this.scheduler.seek(bounds.startPerf);
      this.updateVisualFrame();
    }
  }

  private async togglePlay(): Promise<void> {
    if (this.scheduler.getIsPlaying()) {
      this.scheduler.pause();
      this.transport.setPlaying(false);
    } else {
      if (this.soundEnabled && !this.audioEngine.getIsReady()) {
        await this.audioEngine.init();
      }
      this.scheduler.start(this.scheduler.getCurrentPerfTime());
      this.transport.setPlaying(true);
      requestAnimationFrame(() => this.animationLoop());
    }
  }

  private reset(): void {
    this.scheduler.pause();
    this.scheduler.seek(0);
    this.transport.setPlaying(false);
    if (this.autoPage) {
      this.loadSystem(1);
    }
    this.updateVisualFrame();
  }

  private toggleSound(): void {
    this.soundEnabled = !this.soundEnabled;
    this.transport.setSoundEnabled(this.soundEnabled);
    if (this.audioEngine.voiceBus) {
      this.audioEngine.voiceBus.masterGain.gain.value = this.soundEnabled ? 1.0 : 0.0;
    }
    if (this.soundEnabled) {
      this.audioEngine.init();
    }
  }

  private toggleLoop(): void {
    this.isLooping = !this.isLooping;
    this.transport.setLooping(this.isLooping);
  }

  private toggleAutoPage(): void {
    this.autoPage = !this.autoPage;
    this.transport.setAutoPage(this.autoPage);
  }

  private setTimingStrategy(strategy: TimingStrategy): void {
    const curPerf = this.scheduler.getCurrentPerfTime();
    const curScore = this.tempoMap.perfTimeToScoreTime(curPerf);

    this.tempoMap.setStrategy(strategy);

    // Re-anchor scheduler to new performance time equivalent
    const newPerf = this.tempoMap.scoreTimeToPerfTime(curScore);
    this.scheduler.seek(newPerf);
    this.updateVisualFrame();
  }

  private scrub(pct: number): void {
    const totalPerf = this.tempoMap.getTotalPerfDuration();
    const targetPerf = pct * totalPerf;
    this.scheduler.seek(targetPerf);

    if (this.autoPage) {
      const targetSys = this.scoreModel.getSystemForPerfTime(targetPerf);
      if (targetSys.id !== this.currentSystemId) {
        this.loadSystem(targetSys.id);
      }
    }

    this.updateVisualFrame();
  }

  /**
   * The Visual Loop (strictly reads hardware clock from Scheduler)
   */
  private animationLoop(): void {
    if (!this.scheduler.getIsPlaying()) return;

    this.updateVisualFrame();

    const curPerf = this.scheduler.getCurrentPerfTime();
    const totalPerf = this.tempoMap.getTotalPerfDuration();

    if (curPerf >= totalPerf) {
      if (this.isLooping) {
        this.scheduler.seek(0);
        if (this.autoPage) this.loadSystem(1);
      } else {
        this.scheduler.pause();
        this.transport.setPlaying(false);
        return;
      }
    }

    requestAnimationFrame(() => this.animationLoop());
  }

  private updateVisualFrame(): void {
    const visualPerf = this.scheduler.getVisualPerfTime();
    const scoreTime = this.tempoMap.perfTimeToScoreTime(visualPerf);
    const totalPerf = this.tempoMap.getTotalPerfDuration();

    // Auto-Paging
    if (this.autoPage && this.scheduler.getIsPlaying()) {
      const targetSys = this.scoreModel.getSystemForPerfTime(visualPerf);
      if (targetSys.id !== this.currentSystemId) {
        this.loadSystem(targetSys.id);
      }
    }

    const sys = this.scoreModel.getSystemById(this.currentSystemId);
    if (!sys) return;

    const seekState = this.scoreModel.getSeekState(visualPerf);

    // Update Visuals on NotePresenter
    this.presenter.updateVisuals(
      scoreTime,
      sys.startSec,
      this.scoreModel.data.measureDuration,
      this.scheduler.getIsPlaying(),
      seekState.pedalActive
    );

    // Update HUD & Controls
    this.transport.updateProgress(visualPerf, totalPerf);
    this.transport.setPedalActive(seekState.pedalActive);
    this.transport.setUnaCordaActive(seekState.unaCordaActive);
  }
}

// Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init().catch(err => {
    console.error('App initialization error:', err);
  });
});
