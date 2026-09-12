# Architecture Specification: Sheet Music Interpreter & Playback Engine

## 1. Overview & Core Tenets

The **Sheet Music Interpreter** is a zero-dependency, library-grade classical notation and Web Audio performance engine built from scratch. It is engineered with three non-negotiable principles:

1. **Zero External Framework Lock-in:** Pure ES Modules, strictly typed with TypeScript, rendering standard SVG vector notation and scheduling Web Audio on native browser APIs.
2. **Audio-First Deterministic Timing:** Audio playback is strictly scheduled ahead on the hardware clock (`AudioContext.currentTime`). The visual animation frame (`requestAnimationFrame`) is a read-only consumer and never triggers sound.
3. **Hard Real-Time Memory & Thread Safety:** The rendering pipeline strictly decouples DOM element creation from per-frame styling to eliminate GC pauses and memory thrashing.

---

## 2. System Layering & Component Architecture

```
                    ┌────────────────────────────┐
                    │      TransportBar (UI)     │
                    │ Controls, Scrubber, HUD    │
                    └──────────────┬─────────────┘
                                   │
                                   ▼
                    ┌────────────────────────────┐
                    │         App (Main)         │
                    │   Coordinates Subsystems   │
                    └──────────────┬─────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
         ▼                         ▼                         ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│    ScoreModel    │      │    Scheduler     │      │  NotePresenter   │
│ Note Index, Seek │      │ Two-Clock Engine │      │ DOM Diffing, SVG │
└────────┬─────────┘      └────────┬─────────┘      └────────┬─────────┘
         │                         │                         │
         ▼                         ▼                         ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│     TempoMap     │      │   AudioEngine    │      │   SvgRenderer    │
│ Rubato, Metronome│      │ VoiceBus, Buffer │      │ SMuFL Vectors    │
└──────────────────┘      └──────────────────┘      └──────────────────┘
```

### 2.1 Model Layer (`src/model/`)

* **`ScoreModel.ts`**:
  * In-memory index of 1,680 notes sorted by nominal score start time.
  * System-partitioned note buckets (`getNotesForSystem(sysId)`) for instant system switching.
  * Logarithmic lookahead querying via binary search (`getNotesInPerfWindow(start, end)`).
  * State reconstruction on arbitrary seek: returns active sounding pitches, voice handles, and pedal states without scanning the entire score.
* **`TempoMap.ts`**:
  * Decouples notational time from performance time.
  * Supports three interchangeable timing strategies:
    1. **Expressive Rubato:** Piecewise tempo curves modeled on Debussy's formal indications (Andante très expressif $\to$ Rubato $\to$ Calmato $\to$ Animato Climax $\to$ Recap $\to$ Coda ritardando).
    2. **Strict Metronome:** Fixed 48 BPM ($3.75\text{s}$ per measure, $270.0\text{s}$ total).
    3. **DTW Alignment:** Piecewise linear time-warp against real studio recordings.

### 2.2 Audio Layer (`src/audio/`)

* **`Scheduler.ts` (The Two-Clock Engine):**
  * Operates a 25ms `setInterval` lookahead loop querying notes $120\text{ms}$ into the future.
  * Calculates exact hardware timestamps:
    $$\text{hwTime} = \text{anchorHwTime} + \frac{\text{notePerfStart} - \text{startPerfOffset}}{\text{playbackSpeed}}$$
  * Compensates for `AudioContext.outputLatency` (Bluetooth/OS buffer delays) so visual playheads match acoustic sound arriving at the listener's ears.
* **`VoiceBus.ts` (Acoustic Authority):**
  * **Damper Bus:** Held notes ring until natural key decay OR until damper pedal lifts. When damper lifts, all pedal-held voices clamp simultaneously in $90\text{ms}$.
  * **Una Corda Bus:** Soft pedal shifts hammer strike timbre via dynamic lowpass filter cutoff ($2.4\text{kHz}$) and $-2\text{dB}$ gain attenuation.
  * **Re-strike Crossfader:** When the same pitch is struck again while ringing under pedal, crossfades the old voice down in $15\text{ms}$ to prevent acoustic clicks.
* **`AudioEngine.ts`:**
  * Concurrency-limited streaming queue for 39 acoustic grand piano samples.
  * Semitone pitch transposition via `playbackRate = 2^((targetMidi - anchorMidi) / 12)`.
  * Autoplay policy unlock on user gesture.

### 2.3 Notation & Rendering Layer (`src/notation/`)

* **`SvgRenderer.ts`:**
  * Grand Staff geometry (upper treble staff $y=36\dots68$, lower staff $y=132\dots164$).
  * Authentic SMuFL vector clef definitions (`#authentic-gclef`, `#authentic-fclef`).
  * Dynamic clef switching: Lower staff renders G-clef for Bars 1–5, transitioning to F-clef on System 3 (Measure 6).
* **`NotePresenter.ts`:**
  * Manages SVG note groups, ledger lines, ties, and playhead cursor.
  * Employs strict DOM attribute diffing (`if (h.lastState !== state)`) to eliminate DOM churn during 60 FPS animation.

### 2.4 Ingestion & Compiler Layer (`src/compiler/`)

* **`MusicXmlParser.ts`:**
  * Enforces exact rational divisions arithmetic (`divisionsPerQuarter`).
  * Asserts per-voice cumulative duration invariants against nominal measure lengths.
  * Correctly models `<backup>` and `<forward>` as global timeline cursor manipulation rather than voice duration truncation.
  * Scales `<time-modification>` tuplet ratios (e.g. 2:3 duplets in compound 9/8 time).
