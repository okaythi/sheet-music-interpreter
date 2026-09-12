import type { TimingStrategy } from '../types/index.js';

export interface TransportBarCallbacks {
  onPlayToggle: () => void;
  onReset: () => void;
  onSoundToggle: () => void;
  onLoopToggle: () => void;
  onAutoPageToggle: () => void;
  onPrevSystem: () => void;
  onNextSystem: () => void;
  onJumpToSystem: (sysId: number) => void;
  onSpeedChange: (speed: number) => void;
  onStrategyChange: (strategy: TimingStrategy) => void;
  onScrub: (pct: number) => void;
}

export class TransportBar {
  private callbacks: TransportBarCallbacks;

  // DOM references
  private btnPlay: HTMLElement;
  private btnReset: HTMLElement;
  private btnSound: HTMLElement;
  private btnLoop: HTMLElement;
  private btnAutoPage: HTMLElement;
  private btnPrevSys: HTMLElement;
  private btnNextSys: HTMLElement;
  private sysTitleBadge: HTMLElement;
  private hudTime: HTMLElement;
  private currTimeDisp: HTMLElement;
  private scrubberTrack: HTMLElement;
  private scrubberFill: HTMLElement;
  private pedalIndicator: HTMLElement;
  private conSordinaBadge: HTMLElement;
  private timingSelect: HTMLSelectElement;
  private sectionPills: NodeListOf<HTMLElement>;
  private speedPills: NodeListOf<HTMLElement>;

  constructor(callbacks: TransportBarCallbacks) {
    this.callbacks = callbacks;

    this.btnPlay = document.getElementById('btn-play')!;
    this.btnReset = document.getElementById('btn-reset')!;
    this.btnSound = document.getElementById('btn-sound')!;
    this.btnLoop = document.getElementById('btn-loop')!;
    this.btnAutoPage = document.getElementById('btn-autopage')!;
    this.btnPrevSys = document.getElementById('btn-prev-sys')!;
    this.btnNextSys = document.getElementById('btn-next-sys')!;
    this.sysTitleBadge = document.getElementById('current-sys-title')!;
    this.hudTime = document.getElementById('hud-time')!;
    this.currTimeDisp = document.getElementById('time-current')!;
    this.scrubberTrack = document.getElementById('scrubber-track')!;
    this.scrubberFill = document.getElementById('scrubber-fill')!;
    this.pedalIndicator = document.getElementById('pedal-indicator')!;
    this.conSordinaBadge = document.getElementById('badge-consordina')!;
    this.timingSelect = document.getElementById('timing-strategy-select') as HTMLSelectElement;
    this.sectionPills = document.querySelectorAll('.sec-pill');
    this.speedPills = document.querySelectorAll('.speed-pill');

    this.bindEvents();
  }

  private bindEvents(): void {
    this.btnPlay.addEventListener('click', () => this.callbacks.onPlayToggle());
    this.btnReset.addEventListener('click', () => this.callbacks.onReset());
    this.btnSound.addEventListener('click', () => this.callbacks.onSoundToggle());
    this.btnLoop.addEventListener('click', () => this.callbacks.onLoopToggle());
    this.btnAutoPage.addEventListener('click', () => this.callbacks.onAutoPageToggle());
    this.btnPrevSys.addEventListener('click', () => this.callbacks.onPrevSystem());
    this.btnNextSys.addEventListener('click', () => this.callbacks.onNextSystem());

    this.timingSelect?.addEventListener('change', () => {
      this.callbacks.onStrategyChange(this.timingSelect.value as TimingStrategy);
    });

    this.sectionPills.forEach(pill => {
      pill.addEventListener('click', () => {
        const sysId = parseInt(pill.dataset.sys || '1', 10);
        this.callbacks.onJumpToSystem(sysId);
      });
    });

    this.speedPills.forEach(btn => {
      btn.addEventListener('click', () => {
        this.speedPills.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const speed = parseFloat(btn.dataset.speed || '1.0');
        this.callbacks.onSpeedChange(speed);
      });
    });

    this.scrubberTrack.addEventListener('click', (e) => {
      const rect = this.scrubberTrack.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.callbacks.onScrub(pct);
    });
  }

  public setPlaying(isPlaying: boolean): void {
    const playIcon = this.btnPlay.querySelector('svg')!;
    const playText = this.btnPlay.querySelector('span')!;
    if (isPlaying) {
      playIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
      playText.textContent = 'Pause';
      this.btnPlay.classList.add('active');
    } else {
      playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
      playText.textContent = 'Play';
      this.btnPlay.classList.remove('active');
    }
  }

  public setSoundEnabled(enabled: boolean): void {
    this.btnSound.classList.toggle('active', enabled);
    this.btnSound.textContent = `Acoustic Piano: ${enabled ? 'ON' : 'OFF'}`;
  }

  public setLooping(isLooping: boolean): void {
    this.btnLoop.classList.toggle('active', isLooping);
  }

  public setAutoPage(autoPage: boolean): void {
    this.btnAutoPage.classList.toggle('active', autoPage);
    this.btnAutoPage.textContent = `Auto-Paging: ${autoPage ? 'ON' : 'OFF'}`;
  }

  public setPedalActive(active: boolean): void {
    this.pedalIndicator.classList.toggle('active', active);
  }

  public setUnaCordaActive(active: boolean): void {
    this.conSordinaBadge.style.opacity = active ? '1.0' : '0.4';
  }

  public updateSystemHUD(sysId: number, totalSystems: number, title: string): void {
    this.sysTitleBadge.textContent = `System ${sysId} of ${totalSystems} (${title})`;

    this.sectionPills.forEach(pill => {
      const pSys = parseInt(pill.dataset.sys || '1', 10);
      const nextPill = pill.nextElementSibling as HTMLElement | null;
      const nextSys = nextPill && nextPill.dataset.sys ? parseInt(nextPill.dataset.sys, 10) : 37;
      const isActive = (sysId >= pSys && sysId < nextSys);
      pill.classList.toggle('active', isActive);
    });
  }

  public updateProgress(perfTime: number, totalDuration: number): void {
    const pct = Math.min(100, Math.max(0, (perfTime / totalDuration) * 100));
    this.scrubberFill.style.width = `${pct.toFixed(2)}%`;

    const formattedCur = this.formatTime(perfTime);
    const formattedTotal = this.formatTime(totalDuration);
    this.currTimeDisp.textContent = formattedCur;
    this.hudTime.textContent = `${formattedCur} / ${formattedTotal}`;
  }

  private formatTime(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
}
