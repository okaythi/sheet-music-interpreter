# Future Roadmap & Repertoire Pipeline

This document outlines the planned expansion milestones for the **Sheet Music Interpreter & Playback Engine** as it transitions from a standalone proof-of-concept into a full-scale repertoire platform.

---

## Milestone 1: Automated MusicXML Compiler CLI (`bin/compile-score.js`)

* **Objective:** Ingest uncompressed `.musicxml` or compressed `.mxl` files and automatically produce standardized score JSON datasets.
* **Key Capabilities:**
  * Exact rational tick tracking (`divisions` per quarter note) with measure duration assertions.
  * Robust `<backup>` and `<forward>` voice cursor management.
  * `<time-modification>` ratio calculation for arbitrary tuplets (duplets, triplets, quintuplets, septuplets).
  * Automatic system splitting (2 to 4 measures per system based on visual density).
  * Diatonic step-to-staff Y-coordinate projection for all standard clefs (G, F, C-Alto, C-Tenor).
  * Automated ledger-line detection and tie-curve endpoint resolution.

---

## Milestone 2: Studio Audio Alignment via Dynamic Time Warping (DTW)

* **Objective:** Synchronize the visual score and playhead with legendary acoustic recordings in addition to the synthetic Web Audio micro-sampler.
* **Approach:**
  * Extract chromagram / constant-Q transform (CQT) features from historical audio (e.g. Walter Gieseking 1953, Claudio Arrau 1991, Pascal Rogé).
  * Run Dynamic Time Warping (DTW) against the score's synthesized MIDI onsets to derive fine-grained time-alignment markers.
  * Integrate into `TempoMap.setAlignmentMarkers()`, allowing users to switch between "Acoustic Synthesizer" and "Master Recording" playback with synchronized sheet music animation.

---

## Milestone 3: SMuFL Standard Font Layout & Engraving Collision Engine

* **Objective:** Upgrade from manual pixel layout to professional, publication-grade engraving rules based on Elaine Gould's *Behind Bars* and SMuFL metadata.
* **Features:**
  * Ingest SMuFL glyph anchor points (`glyphBBoxes`, `stemCoordinates`, `opticalCenter`) from `bravura_metadata.json`.
  * Donald Byrd non-linear spacing combining logarithmic duration scaling with a hard minimum glyph bounding-box floor:
    $$W(d) = \max(W_{\min}, k \cdot d^{\gamma})$$
  * Multi-column accidental packing algorithm to prevent flat/sharp collisions on complex polyphonic chords.
  * Bézier curve phrase slurs with staff-line obstacle avoidance.

---

## Milestone 4: Interactive Practice Mode & Web MIDI Ingestion

* **Objective:** Transform the spectator karaoke view into an interactive practice and pedagogical tool.
* **Features:**
  * **Web MIDI API Integration:** Connect physical USB/Bluetooth MIDI keyboards to the browser.
  * **"Wait for Note" Practice Mode:** Pause the score playhead until the pianist strikes the correct pitch and chord.
  * **Visual Error Feedback:** Color struck notes green for correct pitch/timing or red for pitch discrepancies.
  * **Tempo Slider & Metronome Click:** Adjustable practice tempos from 20 BPM to 120 BPM with downbeat accent audio clicks.

---

## Milestone 5: Classical Repertoire Expansion

Expand beyond *Clair de lune* to masterworks across diverse stylistic idioms:
1. **Claude Debussy:** *Suite bergamasque* complete (I. Prélude, II. Menuet, III. Clair de lune, IV. Passepied), *Préludes, Livre 1* (*La fille aux cheveux de lin*, *La cathédrale engloutie*).
2. **Frédéric Chopin:** *Nocturnes* (Op. 9 No. 2 in E♭, Op. 48 No. 1 in C minor), *Ballade No. 1 in G minor*, Op. 23.
3. **Erik Satie:** *Gymnopédies* and *Gnossiennes*.
4. **Maurice Ravel:** *Pavane pour une infante défunte*.
