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
  * In-memory index of notes sorted by nominal score start time.
  * System-partitioned note buckets (`getNotesForSystem(sysId)`) for instant system switching.
  * Logarithmic lookahead querying via binary search (`getNotesInPerfWindow(start, end)`).
  * Data-driven event stream indexing: `getPedalEventsInPerfWindow` and `getTimbreEventsInPerfWindow`.
  * State reconstruction on arbitrary seek: computes exact active sounding notes, pedal states, and timbre settings dynamically from the score's event streams without hardcoded song heuristics.
* **`TempoMap.ts`**:
  * Decouples notational time from performance time generically for any piece, time signature, or tempo.
  * Supports dynamic measure boundaries (`measures: MeasureMeta[]`), accommodating mixed and alternating meters (e.g. 3/4 to 4/4).
  * Supports three interchangeable timing strategies:
    1. **Expressive Rubato:** Evaluates generic section curves (`accelerando`, `ritardando`, `steady`) scaled dynamically from nominal measure durations: $D_{\text{perf}} = D_{\text{nom}} \times (B_{\text{nom}} / B_{\text{mod}})$.
    2. **Strict Metronome:** Clockwork playback where performance seconds match score time across all measures.
    3. **DTW Alignment:** Piecewise linear time-warp against real studio recordings.

### 2.2 Audio Layer (`src/audio/`)

* **`Scheduler.ts` (The Two-Clock Engine):**
  * Operates a 25ms `setInterval` lookahead loop querying notes, pedal events, and timbre events $120\text{ms}$ into the future.
  * Calculates exact hardware timestamps:
    $$\text{hwTime} = \text{anchorHwTime} + \frac{\text{eventPerfTime} - \text{startPerfOffset}}{\text{playbackSpeed}}$$
  * **Data-Driven Event Dispatch:** Schedules `setPedal` and `setUnaCorda` strictly from score event streams (`PedalEvent` and `TimbreEvent`), eliminating hardcoded song-specific loops or measure bounds. Dry pieces remain unpedaled.
  * Compensates for `AudioContext.outputLatency` (Bluetooth/OS buffer delays) so visual playheads match acoustic sound arriving at the listener's ears.
* **`VoiceBus.ts` (Acoustic Authority):**
  * **Damper Bus & Key-Held Immunity:** Models acoustic grand piano key levers vs damper rail. When the sustain pedal lifts, `releaseDamperHeldVoices` damps *only* strings whose keys have already been released by the fingers (`audioTime >= keyReleaseTime - 0.02`). Active notes and upcoming beat 1 chords are physically immune to barline damper lifts and continue ringing.
  * **Una Corda Bus:** Soft pedal shifts hammer strike timbre via dynamic lowpass filter cutoff ($2.8\text{kHz}$) and calibrated $-2.2\text{dB}$ gain attenuation (`dbToGain`).
  * **Re-strike Crossfader:** When the same pitch is struck again while ringing under pedal, crossfades the old voice down in $15\text{ms}$ using `cancelAndHoldAtTime` to prevent acoustic clicks.
* **`AudioEngine.ts`:**
  * Concurrency-limited streaming queue for 39 acoustic grand piano samples.
  * Semitone pitch transposition via `playbackRate = 2^((targetMidi - anchorMidi) / 12)`.
  * Autoplay policy unlock on user gesture.

### 2.3 Notation & Rendering Layer (`src/notation/`)

* **`SvgRenderer.ts`:**
  * Grand Staff geometry (upper treble staff $y=36\dots68$, lower staff $y=132\dots164$).
  * Authentic standard classical vector clef definitions (`#authentic-gclef`, `#authentic-fclef`), replacing distorted hand-traced approximations.
  * Dynamic clef switching: Lower staff renders G-clef for Bars 1–5, transitioning to F-clef on System 3 (Measure 6).
* **`NotePresenter.ts`:**
  * **Dynamic System ViewBox:** Computes true vertical extents across all noteheads, stems, and ledger lines per system, dynamically expanding the SVG `viewBox` (e.g., $Y \in [-35, 275]$) to permanently eliminate clipping on high treble and deep bass chords.
  * **Note-Bracketed Playhead Interpolation:** Replaces brittle linear pixel-per-measure math with piecewise interpolation between the actual rendered notehead coordinates bracketing the current score time:
    $$\text{headX} = X_{\text{prev}} + \frac{t - t_{\text{prev}}}{t_{\text{next}} - t_{\text{prev}}} \cdot (X_{\text{next}} - X_{\text{prev}})$$
    This ensures that when $t = t_{\text{note}}$, the playhead is mathematically dead-center over the notehead.
  * Employs strict DOM attribute diffing (`if (h.lastState !== state)`) to eliminate DOM churn during 60 FPS animation.

### 2.4 Ingestion & Compiler Layer (`src/compiler/`)

* **`MusicXmlParser.ts`:**
  * Enforces exact rational divisions arithmetic (`divisionsPerQuarter`).
  * Asserts per-voice cumulative duration invariants against nominal measure lengths.
  * Correctly models `<backup>` and `<forward>` as global timeline cursor manipulation rather than voice duration truncation.
  * Scales `<time-modification>` tuplet ratios (e.g. 2:3 duplets in compound 9/8 time).
