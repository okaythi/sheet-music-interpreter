# Engineering Post-Mortem: Core Failures & Architectural Safeguards

This document records the fundamental technical bottlenecks, catastrophic failure modes, and architectural refactorings discovered during the development of the from-scratch sheet music and Web Audio engine.

---

## 1. The 55-Minute Linux Freeze (Catastrophic Memory & Compositor Lockup)

### Incident Summary
During early development of the dynamic system switcher in `gewoonthy`, an innocuous refactoring introduced a circular recursion defect into the render loop. Within 15 seconds of pressing "Play", the browser process consumed all 8GB of system RAM, exhausted the Linux swap partition, and froze the entire Wayland desktop session for ~55 minutes due to heavy HDD I/O thrashing (`mq-deadline` scheduler starvation).

### Root Cause Analysis
1. **Circular Mutual Recursion inside `requestAnimationFrame`:**
   Inside the animation frame tick, `switchSystem(targetSys)` invoked `updateScoreVisuals(time)`. In turn, `updateScoreVisuals()` checked the system boundary and invoked `switchSystem(targetSys)` back synchronously without waiting for the next tick.
2. **Unbounded Call Stack & DOM Allocation:**
   The synchronous loop breached V8 engine recursion depth, continuously creating thousands of transient SVG DOM elements per second.
3. **OS Swap Thrashing:**
   The Linux OOM killer was delayed because memory was being allocated in small active chunks across rendering threads. The kernel began paging anonymous memory to swap, starving the Wayland compositor of CPU and disk I/O cycles.

### Permanent Architectural Safeguards Implemented
To permanently eliminate this failure class:
* **Strict Lifecycle Decoupling:**
  `loadSystem(sysId)` strictly generates the SVG elements and populates an in-memory cache of DOM references (`activeNoteHandles`). **It is architecturally forbidden from invoking `updateVisuals()` or requesting animation frames.**
* **Zero In-Loop DOM Querying:**
  All `document.getElementById(...)`, `document.querySelectorAll(...)`, and array filtering are banned inside the 60 FPS animation loop.
* **State Diffing (`lastState`):**
  Attributes are only written to the DOM if `h.lastState !== state`. During steady-state playback, DOM writes are reduced to nearly zero.

---

## 2. Audio Timing Drift & The "Two Clocks" Architecture

### The Defect in the Early Prototype
In the experimental prototype, audio was triggered directly inside `requestAnimationFrame`:
```javascript
// ANTIPATTERN: Triggering Web Audio from requestAnimationFrame
function tick(timestamp) {
  currentTime += delta * playbackSpeed;
  updateScoreVisuals(currentTime); // Called playMidiNote() when time >= note.start
  requestAnimationFrame(tick);
}
```

### Why This Failed
1. **rAF is Not a Hardware Clock:** `requestAnimationFrame` is bound to the display refresh rate (60Hz / 120Hz), subject to frame drops, monitor VSync jitter, and main-thread GC pauses.
2. **Background Tab Throttling:** When the browser tab loses focus, the browser throttles `requestAnimationFrame` to 1 frame per second (or suspends it entirely), causing audio to freeze or skip hundreds of notes.
3. **Visual-Driven Desync:** Over a 4.5-minute piece, accumulating frame timing errors causes audio to drift by several measures.

### The Solution: Canonical "Two Clocks" Lookahead Scheduler
The engine was refactored to separate the hardware clock from the display clock:
* **Clock A (Hardware Master):** A high-frequency `setInterval` (25ms) queries upcoming notes in a $120\text{ms}$ lookahead window and schedules `AudioBufferSourceNode.start(hwTime)` against `AudioContext.currentTime`. Sample playback is executed on the browser's native C++ audio thread, immune to main-thread GC.
* **Clock B (Visual Consumer):** `requestAnimationFrame` acts strictly as a read-only consumer, reading `audioContext.currentTime` to position the visual playhead.
* **Output Latency Compensation:** The scheduler incorporates `AudioContext.outputLatency` so that Bluetooth headphones (which incur $100\text{–}250\text{ms}$ latency) do not visually desync note strikes.

---

## 3. Technical Audit Review: The `AudioWorklet` Misconception

During a peer technical audit, it was suggested that moving note scheduling into an `AudioWorkletProcessor` was the "real load-bearing fix" for Web Audio timing.

### Why That Suggestion Was Flawed
* In Web Audio, `AudioBufferSourceNode` **cannot be created or scheduled inside an `AudioWorklet`**. `AudioWorkletProcessor` is designed for raw sample-by-sample DSP synthesis (writing directly to `output[channel][sample]`).
* Rebuilding an acoustic sampler inside an `AudioWorklet` requires hand-rolling sample interpolation, pitch transposition, multi-voice allocation, and memory management in raw `Float32Array` buffers.
* Native Web Audio `AudioBufferSourceNode.start(audioContext.currentTime + delta)` **already executes on the native audio hardware thread**. The main thread lookahead scheduler (`setInterval` + `currentTime`) achieves sample-accurate timing without the massive complexity of an `AudioWorklet`.

---

## 4. The Metronomic Illusion: Rubato vs Quantized Durations

### The Problem
*Clair de lune* has 72 measures. At 48 BPM in 9/8, each measure lasts $3.75\text{s}$.
$$72 \times 3.75\text{s} = 270.0\text{s} = 4\text{ minutes, } 30\text{ seconds}$$
Playing Debussy with a constant $3.75\text{s}$ measure duration sounds completely mechanical and unmusical.

### The Solution: Multi-Strategy `TempoMap`
The engine abstracts timing through a dedicated `TempoMap`:
1. **Expressive Rubato (Default):** Deconstructs the score into formal expressive sections with dynamic tempo curves (e.g. Andante ~43.5 BPM in Theme A, accelerating to ~55 BPM in the Animato Climax, ritardando to ~39 BPM in the Coda).
2. **Strict Metronome:** Provides a toggleable exact 48 BPM clockwork mode.
3. **DTW Alignment:** Accepts reference time markers from studio recordings.

---

## 5. Acoustic Separation: Dampers vs *Con Sordina*

Debussy marked Measure 1 with *"pp con sordina"*.
* **Damper Pedal:** Lifts all dampers; strings ring until pedal lifts.
* **Con Sordina (Una Corda):** Shifts the keyboard hammer mechanism, striking fewer strings and muting tone.
The engine models these as **separate acoustic authorities**:
* A global **Damper Bus** (`damperBusGain`) handles ringing release clamps.
* An **Una Corda Bus** (`unaCordaFilter` + `unaCordaGain`) applies lowpass frequency cuts and gain attenuation.

---

## 6. The Clef Distortion Defect (Hand-Traced Béziers vs Real Outlines)

### What Happened
In early SVG prototypes, clefs were authored using a single hand-traced continuous Bézier path string. Under tight manual curvature, ribbon boundaries crossed or bunched together, producing irregular "blobs" rather than classical engraving loops.

### The Fix
Replaced hand-traced approximations with canonical standard classical vector path data (`#authentic-gclef` and `#authentic-fclef`), precisely aligned to the G4 staff line ($Y = 60$) and F3 staff line ($Y = 140$).

---

## 7. The Truncated Notes Defect: Fixed ViewBox vs Dynamic System Bounds

### What Happened
Inspection across all 1,680 notes revealed that **151 notes** were partially or completely clipped by the browser. Noteheads and ledgers ranged from $Y = -33$ (high treble melody) to $Y = 273$ (deep Coda bass chords). Because the SVG container used a fixed `viewBox="0 0 1020 200"` with `overflow: hidden`, notes in high or low registers were literally sliced off by the canvas boundary.

### The Fix: Dynamic System ViewBox
Rather than distorting the composition via dynamic $8^{va}$ insertion (which violates multi-voice polyphony and Urtext fidelity), `NotePresenter.loadSystem()` now dynamically inspects the active system's ledger lines and stems:
$$Y_{\text{start}} = \min(-15, Y_{\min} - 15), \quad H_{\text{total}} = \max(200, Y_{\max} + 20) - Y_{\text{start}}$$
The SVG `viewBox` dynamically expands per system, completely eliminating clipping.

---

## 8. The Playhead Sync Defect: Linear Pixel Math vs Note-Bracketed Interpolation

### What Happened
The early playhead cursor advanced strictly linearly in time across measure widths ($156 \to 580 \to 1010$). However, actual note placement used a separate formula ($395\text{px} + 12\text{px}$ offset) and non-linear duration-proportional spacing. Two parallel layout calculations caused the playhead to visibly lead or lag note strikes within measures.

### The Fix: Note-Bracketed Interpolation
`NotePresenter` precomputes layout anchors `{ time, x }` directly from the rendered notes. At each frame, the playhead binary-searches the bracketing notes and interpolates between their actual rendered X coordinates:
$$\text{headX} = X_{\text{left}} + \frac{t - t_{\text{left}}}{t_{\text{right}} - t_{\text{left}}} \cdot (X_{\text{right}} - X_{\text{left}})$$
The playhead is now mathematically guaranteed to be centered directly over each note at attack time.

---

## 9. Cascading Gain Attenuation & `dbToGain` Staging

### What Happened
The voice envelope ($0.85 \to 0.38$) compounded multiplicatively across the damper bus ($1.0$), una corda gain ($0.78$), and una corda lowpass filter ($2.4\text{kHz}$), resulting in a $-10.6\text{dB}$ drop during the opening 14 measures (*pp con sordina*) that left notes overly quiet and muffled.

### The Fix
Introduced standard conversion `dbToGain(db) = 10^(db/20)`, calibrated una corda attenuation to a gentle $-2.2\text{dB}$, tuned filter cutoff to $2.8\text{kHz}$, and raised voice envelope attack peak to $0.92$ and sustain shelf to $0.48$.

---

## 10. The Beat 1 Note-Cutoff Defect: Barline Damper vs Key-Held Immunity

### What Happened
During playback, users observed that the first note of each measure was playing for only double-digit milliseconds (~90ms) before abruptly cutting off.

Investigation into the signal and scheduling chains revealed two compounding bugs:

1. **Reactive vs Proactive Barline Scheduling:**
   In `Scheduler.ts`, measure barline detection was reactive (`if (activeMeasure !== this.lastDampedMeasure)`). By the time the playback cursor crossed into a new measure, the beat 1 notes had already been scheduled into the future (or at current hardware time) within the 120ms lookahead window with `isPedalHeld = true`.
2. **Missing Key-Held Immunity in `VoiceBus.ts`:**
   When the barline damper triggered `audioEngine.setPedal(false, damperHwTime)`, `VoiceBus.releaseDamperHeldVoices()` checked only `if (v.isPedalHeld)`. It immediately applied an exponential ramp down to `0.0001` over `clampTime = audioTime + 0.09` (90ms) and scheduled `v.src.stop(clampTime + 0.01)` on **every single active voice** in the bus.
   Because the beat 1 notes of the new bar had already been allocated with `isPedalHeld = true`, their gain envelope was canceled and ramped down to zero within 90ms.

### The Physical Acoustic Reality
On an acoustic grand piano, there are two distinct mechanisms holding a damper off a string:
- **Mechanism A (The Key Lever):** The pianist's finger physically presses the key down. The key lever holds the damper off the string.
- **Mechanism B (The Damper Pedal Rail):** The foot pedal rotates a common lifting rail, holding dampers off all strings simultaneously.

When a pianist lifts the damper pedal at a barline:
- **Key-Released Notes:** Any string whose key has already been released is held up *only* by the pedal rail. When the rail drops, the felt damper drops onto the string, silencing it in ~90ms.
- **Key-Held Notes:** Any string whose key is physically held down by the pianist's finger **CANNOT** be damped. The key lever continues to hold the damper in the air regardless of what the pedal does.
- **Upcoming Notes:** Notes that start at or after the barline have not yet finished their finger-strike.

### The Fix: Two-Pronged Acoustic Protection
1. **Key-Held Immunity in `VoiceBus.ts`:**
   - Added `keyReleaseTime = audioTime + durationSec` to `ActiveVoice`.
   - In `releaseDamperHeldVoices(audioTime)`:
     ```typescript
     if (audioTime <= v.startTime || audioTime < v.keyReleaseTime - 0.02) {
       // Key is physically held down (or note starts in future):
       // Damper pedal release has ZERO effect on this string!
       continue;
     }
     ```
   - Only voices where `audioTime >= v.keyReleaseTime - 0.02` (notes whose keys were released in the past, ringing solely on pedal sustain) are damped.
2. **Proactive Lookahead Barline Scheduling in `Scheduler.ts`:**
   - Converted barline damping from reactive polling to proactive lookahead queueing in `scheduleLookahead()`.
   - Barlines occurring in `[currentPerf, windowEndPerf)` are scheduled ahead of time:
     `audioEngine.setPedal(false, barlineHwTime)` cleanly clears previous measures' ringing strings, while beat 1 notes striking at `barlineHwTime` remain fully protected by key-held immunity.
   - At `barlineHwTime + 0.08`, the pedal is re-engaged for the new bar.
