import type { ScoreNote, ScoreSystem, NoteHandle, NoteVisualState } from '../types/index.js';
import { SvgRenderer } from './SvgRenderer.js';

export class NotePresenter {
  private container: SVGSVGElement;
  private backdropGroup: SVGGElement;
  private notesGroup: SVGGElement;
  private playheadLine: SVGLineElement;
  private pedalM1Line: SVGLineElement | null = null;
  private pedalM2Line: SVGLineElement | null = null;

  private activeHandles: NoteHandle[] = [];
  private currentSystemId = -1;
  private timeAnchors: Array<{ time: number; x: number }> = [];

  constructor(svgElement: SVGSVGElement) {
    this.container = svgElement;
    this.container.innerHTML = `
      ${SvgRenderer.SMUFL_DEFS}
      <g id="backdrop-layer"></g>
      <g id="notes-layer"></g>
      <!-- Visual Playhead Cursor -->
      <line id="playhead" x1="156" y1="-20" x2="156" y2="220" stroke="#FF7744" stroke-width="1.8" opacity="0.4" style="transition: opacity 0.2s;" />
      <!-- Continuous Pedal Lines -->
      <line id="pedal-m1-line" x1="156" y1="184" x2="570" y2="184" stroke="rgba(233, 84, 32, 0.2)" stroke-width="2" />
      <line id="pedal-m2-line" x1="582" y1="184" x2="996" y2="184" stroke="rgba(233, 84, 32, 0.2)" stroke-width="2" />
    `;

    this.backdropGroup = this.container.querySelector('#backdrop-layer') as SVGGElement;
    this.notesGroup = this.container.querySelector('#notes-layer') as SVGGElement;
    this.playheadLine = this.container.querySelector('#playhead') as SVGLineElement;
    this.pedalM1Line = this.container.querySelector('#pedal-m1-line') as SVGLineElement;
    this.pedalM2Line = this.container.querySelector('#pedal-m2-line') as SVGLineElement;
  }

  public getCurrentSystemId(): number {
    return this.currentSystemId;
  }

  /**
   * Render System SVG Elements & Cache DOM Handles
   * Dynamic ViewBox: Expands vertical canvas to prevent high treble & low bass clipping.
   */
  public loadSystem(sys: ScoreSystem, notes: ScoreNote[]): void {
    this.currentSystemId = sys.id;
    this.activeHandles = [];

    // 1. Dynamic ViewBox calculation based on ledger lines and stems
    let minY = 36;
    let maxY = 164;
    for (const n of notes) {
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
      if (n.stemUp) {
        minY = Math.min(minY, n.y - 25);
      } else {
        maxY = Math.max(maxY, n.y + 25);
      }
      if (n.ledgers && n.ledgers.length > 0) {
        for (const ly of n.ledgers) {
          minY = Math.min(minY, ly - 4);
          maxY = Math.max(maxY, ly + 4);
        }
      }
    }

    const yStart = Math.min(-15, minY - 15);
    const yEnd = Math.max(200, maxY + 20);
    const totalHeight = yEnd - yStart;

    this.container.setAttribute('viewBox', `0 ${yStart.toFixed(1)} 1020 ${totalHeight.toFixed(1)}`);
    this.playheadLine.setAttribute('y1', `${yStart.toFixed(1)}`);
    this.playheadLine.setAttribute('y2', `${yEnd.toFixed(1)}`);

    // 2. Precompute note-bracketed playhead anchors
    const anchorMap = new Map<number, number>();
    anchorMap.set(sys.startSec, 156);
    anchorMap.set(sys.startSec + (sys.endSec - sys.startSec) / 2, 580);
    anchorMap.set(sys.endSec, 1000);

    for (const n of notes) {
      if (!anchorMap.has(n.start) || anchorMap.get(n.start)! > n.x) {
        anchorMap.set(n.start, n.x);
      }
    }

    this.timeAnchors = Array.from(anchorMap.entries())
      .map(([time, x]) => ({ time, x }))
      .sort((a, b) => a.time - b.time);

    // Render static Grand Staff backdrop
    this.backdropGroup.innerHTML = SvgRenderer.renderBackdrop(sys);

    // Build notes SVG
    let notesHtml = '';
    for (const n of notes) {
      const isUp = n.stemUp;
      const stemX = isUp ? (n.x + 4.6) : (n.x - 4.6);
      const stemY2 = isUp ? (n.y - 25) : (n.y + 25);
      const dotX = n.x + 7.5;
      const dotY = n.y;
      const openCls = n.isOpen ? 'open-note' : '';

      // Ledger lines
      let ledgersHtml = '';
      if (n.ledgers && n.ledgers.length > 0) {
        for (const ly of n.ledgers) {
          ledgersHtml += `<line class="ledger-line" x1="${n.x - 7.5}" y1="${ly}" x2="${n.x + 7.5}" y2="${ly}" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" />`;
        }
      }

      // Tie curve
      let tieHtml = '';
      if (n.tied === '1' && n.tieToX) {
        const midX = (n.x + n.tieToX) / 2;
        const tieOffset = isUp ? -8 : 8;
        tieHtml = `<path id="tie-${n.id}" class="tie-curve" d="M ${n.x + 2} ${n.y + (isUp ? -3 : 3)} Q ${midX} ${n.y + tieOffset} ${n.tieToX - 2} ${n.y + (isUp ? -3 : 3)}" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1.2" />`;
      }

      notesHtml += `
        <g id="g-${n.id}" class="note-group">
          ${ledgersHtml}
          ${tieHtml}
          <ellipse id="head-${n.id}" class="note-el note-idle ${openCls}" cx="${n.x}" cy="${n.y}" rx="4.8" ry="3.5" transform="rotate(-20 ${n.x} ${n.y})" fill="${n.isOpen ? '#101010' : '#525252'}" stroke="#525252" stroke-width="${n.isOpen ? '1.8' : '1.0'}" />
          <line id="stem-${n.id}" class="note-el note-idle" x1="${stemX}" y1="${n.y}" x2="${stemX}" y2="${stemY2}" stroke="#525252" stroke-width="1.2" />
          ${n.hasDot ? `<circle id="dot-${n.id}" class="note-el note-idle" cx="${dotX}" cy="${dotY}" r="1.5" fill="#525252" stroke="#525252" />` : ''}
        </g>
      `;
    }

    this.notesGroup.innerHTML = notesHtml;

    // Cache pre-indexed DOM handles for fast animation frame updates
    for (const n of notes) {
      const g = this.container.querySelector(`#g-${n.id}`) as SVGElement;
      if (!g) continue;

      const head = g.querySelector(`#head-${n.id}`) as SVGElement | null;
      const stem = g.querySelector(`#stem-${n.id}`) as SVGElement | null;
      const dot = g.querySelector(`#dot-${n.id}`) as SVGElement | null;
      const tie = g.querySelector(`#tie-${n.id}`) as SVGElement | null;

      this.activeHandles.push({
        note: n,
        el: g,
        head,
        stem,
        dot,
        tie,
        openClass: n.isOpen ? 'open-note' : '',
        lastState: 'note-idle'
      });
    }
  }

  /**
   * Fast In-Loop Note Highlighting & Playhead Advancement
   * SAFEGUARD: Strict state diffing (only sets attributes if state !== lastState).
   */
  public updateVisuals(
    scoreTime: number,
    sysStartScore: number,
    measureDur: number,
    isPlaying: boolean,
    pedalActive: boolean
  ): void {
    // 1. Note State Diffing
    for (let i = 0; i < this.activeHandles.length; i++) {
      const h = this.activeHandles[i];
      const n = h.note;
      let state: NoteVisualState = 'note-idle';

      if (scoreTime >= n.start && scoreTime < n.end) {
        state = (scoreTime - n.start < 0.2) ? 'note-active' : 'note-sustain';
      } else if (scoreTime >= n.end) {
        state = 'note-past';
      }

      if (h.lastState !== state) {
        h.lastState = state;
        const openCls = h.openClass;
        
        let fillColor = '#525252';
        let strokeColor = '#525252';
        let strokeWidth = '1.0';
        let glowFilter = '';

        if (state === 'note-past') {
          fillColor = openCls ? '#101010' : '#2c2c2c';
          strokeColor = '#2c2c2c';
        } else if (state === 'note-active') {
          fillColor = openCls ? '#101010' : '#FF7744';
          strokeColor = '#FF7744';
          strokeWidth = openCls ? '2.2' : '1.2';
          glowFilter = 'drop-shadow(0 0 7px rgba(255, 119, 68, 0.95))';
        } else if (state === 'note-sustain') {
          fillColor = openCls ? '#101010' : 'rgba(233, 84, 32, 0.85)';
          strokeColor = 'rgba(233, 84, 32, 0.85)';
          strokeWidth = openCls ? '2.0' : '1.2';
          glowFilter = 'drop-shadow(0 0 4px rgba(233, 84, 32, 0.65))';
        } else {
          fillColor = openCls ? '#101010' : '#525252';
          strokeColor = '#525252';
        }

        if (h.head) {
          h.head.setAttribute('fill', fillColor);
          h.head.setAttribute('stroke', strokeColor);
          h.head.setAttribute('stroke-width', strokeWidth);
          h.head.style.filter = glowFilter;
        }
        if (h.stem) {
          h.stem.setAttribute('stroke', strokeColor);
          h.stem.style.filter = glowFilter;
        }
        if (h.dot) {
          h.dot.setAttribute('fill', strokeColor);
          h.dot.setAttribute('stroke', strokeColor);
        }
        if (h.tie) {
          const isTieActive = (state === 'note-active' || state === 'note-sustain');
          h.tie.setAttribute('stroke', isTieActive ? '#FF7744' : 'rgba(255,255,255,0.25)');
          h.tie.style.filter = isTieActive ? 'drop-shadow(0 0 3px rgba(233, 84, 32, 0.8))' : '';
        }
      }
    }

    // 2. Playhead cursor advancement via Note-Bracketed Interpolation
    let headX = 156;
    if (this.timeAnchors.length > 0) {
      if (scoreTime <= this.timeAnchors[0].time) {
        headX = this.timeAnchors[0].x;
      } else if (scoreTime >= this.timeAnchors[this.timeAnchors.length - 1].time) {
        headX = this.timeAnchors[this.timeAnchors.length - 1].x;
      } else {
        // Binary search for bracketing anchors
        let low = 0;
        let high = this.timeAnchors.length - 2;
        let leftIdx = 0;

        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          if (this.timeAnchors[mid].time <= scoreTime) {
            leftIdx = mid;
            low = mid + 1;
          } else {
            high = mid - 1;
          }
        }

        const left = this.timeAnchors[leftIdx];
        const right = this.timeAnchors[leftIdx + 1];
        const span = right.time - left.time;
        const frac = span > 0 ? (scoreTime - left.time) / span : 0;
        headX = left.x + frac * (right.x - left.x);
      }
    }

    this.playheadLine.setAttribute('x1', headX.toFixed(1));
    this.playheadLine.setAttribute('x2', headX.toFixed(1));
    this.playheadLine.setAttribute('opacity', isPlaying ? '0.85' : '0.35');

    // 3. Pedal line active indicators
    const sysTime = scoreTime - sysStartScore;
    if (this.pedalM1Line && this.pedalM2Line) {
      const m1Active = pedalActive && (sysTime >= 0.4 && sysTime < measureDur);
      const m2Active = pedalActive && (sysTime >= measureDur && sysTime < measureDur * 2);

      this.pedalM1Line.setAttribute('stroke', m1Active ? '#E95420' : 'rgba(233, 84, 32, 0.2)');
      this.pedalM1Line.style.filter = m1Active ? 'drop-shadow(0 0 4px rgba(233, 84, 32, 0.7))' : '';

      this.pedalM2Line.setAttribute('stroke', m2Active ? '#E95420' : 'rgba(233, 84, 32, 0.2)');
      this.pedalM2Line.style.filter = m2Active ? 'drop-shadow(0 0 4px rgba(233, 84, 32, 0.7))' : '';
    }
  }
}
