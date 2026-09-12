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
