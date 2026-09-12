import type { ScoreSystem } from '../types/index.js';

export class SvgRenderer {
  public static readonly SMUFL_DEFS = `
    <defs>
      <!-- SMuFL Standard Authentic G-Clef (Treble) -->
      <g id="authentic-gclef">
        <path d="M 28.5 73.2 C 26.8 73.2 25.1 72.5 23.9 71.3 C 22.7 70.1 22.0 68.4 22.0 66.7 C 22.0 64.9 22.7 63.3 23.9 62.1 C 25.1 60.9 26.8 60.2 28.5 60.2 C 30.3 60.2 31.9 60.9 33.1 62.1 C 34.3 63.3 35.0 64.9 35.0 66.7 C 35.0 68.4 34.3 70.1 33.1 71.3 C 31.9 72.5 30.3 73.2 28.5 73.2 Z M 39.8 45.3 C 39.1 47.9 37.6 50.8 35.5 53.6 C 37.2 55.4 38.6 57.6 39.4 60.1 C 40.3 62.6 40.8 65.3 40.8 68.0 C 40.8 72.2 39.5 76.1 37.0 79.2 C 34.5 82.3 31.1 84.1 27.0 84.1 C 22.8 84.1 19.3 82.3 16.6 79.4 C 13.9 76.4 12.5 72.4 12.5 67.7 C 12.5 62.9 14.1 58.7 17.2 55.1 C 20.4 51.5 24.3 49.0 29.1 47.8 L 30.1 43.8 C 28.3 41.7 26.9 39.3 25.9 36.6 C 24.9 33.9 24.4 31.0 24.4 28.1 C 24.4 23.8 25.6 19.8 28.0 16.5 C 30.4 13.2 33.7 11.2 37.8 10.7 L 37.8 8.0 C 37.8 6.9 38.2 6.0 38.9 5.3 C 39.6 4.6 40.5 4.2 41.6 4.2 C 42.7 4.2 43.6 4.6 44.3 5.3 C 45.0 6.0 45.4 6.9 45.4 8.0 L 45.4 46.6 C 47.0 48.0 48.3 49.8 49.2 51.9 C 50.1 54.0 50.5 56.3 50.5 58.6 C 50.5 62.4 49.2 65.8 46.7 68.6 C 44.2 71.4 41.0 73.1 37.2 73.7 L 37.2 70.9 C 39.9 70.3 42.2 69.0 43.9 66.9 C 45.6 64.8 46.5 62.2 46.5 59.3 C 46.5 57.3 46.0 55.5 45.0 53.9 C 44.0 52.3 42.6 51.1 40.9 50.2 L 40.9 51.0 C 40.9 52.0 40.5 52.9 39.8 53.6 C 39.1 54.3 38.2 54.7 37.1 54.7 C 36.0 54.7 35.1 54.3 34.4 53.6 C 33.7 52.9 33.3 52.0 33.3 51.0 L 33.3 48.7 C 31.0 49.4 28.9 50.7 27.2 52.5 C 25.5 54.3 24.4 56.4 23.9 58.9 C 25.3 58.0 26.9 57.5 28.6 57.5 C 31.0 57.5 33.0 58.4 34.7 60.1 C 36.4 61.8 37.2 63.8 37.2 66.2 C 37.2 68.6 36.4 70.6 34.7 72.3 C 33.0 74.0 31.0 74.9 28.6 74.9 C 26.2 74.9 24.2 74.0 22.5 72.3 C 20.8 70.6 20.0 68.6 20.0 66.2 C 20.0 62.8 21.2 59.7 23.5 57.0 C 25.8 54.3 28.7 52.3 32.2 51.1 L 34.5 42.0 C 33.3 40.3 32.4 38.3 31.7 36.1 C 31.0 33.9 30.7 31.6 30.7 29.2 C 30.7 26.2 31.5 23.4 33.1 21.0 C 34.7 18.6 36.9 16.9 39.8 16.1 L 39.8 45.3 Z" fill="currentColor" transform="scale(1.05) translate(-10, -5)" />
      </g>

      <!-- SMuFL Standard Authentic F-Clef (Bass) -->
      <g id="authentic-fclef">
        <path d="M 12.0 42.0 C 12.0 37.0 14.0 33.0 18.0 30.0 C 22.0 27.0 27.0 25.5 33.0 25.5 C 39.0 25.5 44.5 27.5 49.5 31.5 C 54.5 35.5 57.0 41.0 57.0 48.0 C 57.0 54.0 55.0 59.5 51.0 64.5 C 47.0 69.5 41.5 74.5 34.5 79.5 C 27.5 84.5 20.5 89.5 13.5 94.5 L 13.5 90.0 C 19.5 85.5 25.5 81.0 31.5 76.5 C 37.5 72.0 42.0 67.5 45.0 63.0 C 48.0 58.5 49.5 54.0 49.5 49.5 C 49.5 44.5 47.5 40.5 43.5 37.5 C 39.5 34.5 34.5 33.0 28.5 33.0 C 24.5 33.0 21.0 34.5 18.0 37.5 C 15.0 40.5 13.5 44.5 13.5 49.5 C 13.5 53.0 14.5 56.0 16.5 58.5 C 18.5 61.0 21.5 62.5 25.5 63.0 L 25.5 66.0 C 20.5 65.5 16.5 63.5 13.5 60.0 C 10.5 56.5 9.0 52.0 9.0 46.5 C 9.0 40.5 10.5 35.5 13.5 31.5 C 16.5 27.5 20.5 25.5 25.5 25.5 C 29.5 25.5 33.0 26.5 36.0 28.5 C 39.0 30.5 41.0 33.5 42.0 37.5 L 39.0 38.5 C 38.0 35.5 36.5 33.5 34.5 32.5 C 32.5 31.5 30.0 31.0 27.0 31.0 C 23.0 31.0 19.5 32.5 16.5 35.5 C 13.5 38.5 12.0 42.5 12.0 47.5 Z M 63.0 37.5 C 63.0 35.5 63.8 33.8 65.3 32.3 C 66.8 30.8 68.5 30.0 70.5 30.0 C 72.5 30.0 74.2 30.8 75.7 32.3 C 77.2 33.8 78.0 35.5 78.0 37.5 C 78.0 39.5 77.2 41.2 75.7 42.7 C 74.2 44.2 72.5 45.0 70.5 45.0 C 68.5 45.0 66.8 44.2 65.3 42.7 C 63.8 41.2 63.0 39.5 63.0 37.5 Z M 63.0 55.5 C 63.0 53.5 63.8 51.8 65.3 50.3 C 66.8 48.8 68.5 48.0 70.5 48.0 C 72.5 48.0 74.2 48.8 75.7 50.3 C 77.2 51.8 78.0 53.5 78.0 55.5 C 78.0 57.5 77.2 59.2 75.7 60.7 C 74.2 62.2 72.5 63.0 70.5 63.0 C 68.5 63.0 66.8 62.2 65.3 60.7 C 63.8 59.2 63.0 57.5 63.0 55.5 Z" fill="currentColor" transform="scale(0.85) translate(-10, -5)" />
      </g>

      <!-- Classical Flat Accidental Glyph -->
      <g id="classical-flat">
        <path d="M 3.2 0 L 3.2 24 C 3.2 24.5 3.5 25 4 25 C 4.5 25 4.8 24.5 4.8 24 L 4.8 13.5 C 6.2 15.2 8.1 16.2 10.2 16.2 C 12.8 16.2 14.8 14.8 14.8 11.8 C 14.8 8.8 12.5 6.5 8.5 6.5 C 6.5 6.5 4.8 7.2 3.2 8.2 L 3.2 0 Z M 4.8 10.2 C 6.0 9.0 7.4 8.2 9.0 8.2 C 11.5 8.2 13.0 9.8 13.0 11.8 C 13.0 13.8 11.5 14.8 9.5 14.8 C 7.5 14.8 5.8 13.5 4.8 11.8 L 4.8 10.2 Z" fill="currentColor" transform="scale(0.85)" />
      </g>
    </defs>
  `;

  public static renderBackdrop(sys: ScoreSystem): string {
    const isSys1 = sys.id === 1;

    // Grand staff connector, bracket and brace
    let html = `
      <line x1="85" y1="36" x2="85" y2="180" stroke="rgba(255,255,255,0.4)" stroke-width="2.5" />
      <path d="M 85 36 C 75 36 70 48 70 60 L 70 100 C 70 108 64 112 58 114 C 64 116 70 120 70 128 L 70 156 C 70 168 75 180 85 180" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="1.8" />
    `;

    // Upper Staff (Treble): Lines at Y = 36, 44, 52, 60, 68
    for (let y = 36; y <= 68; y += 8) {
      html += `<line x1="85" y1="${y}" x2="1010" y2="${y}" stroke="rgba(255,255,255,0.18)" stroke-width="1.1" />`;
    }

    // Lower Staff: Lines at Y = 132, 140, 148, 156, 164
    for (let y = 132; y <= 164; y += 8) {
      html += `<line x1="85" y1="${y}" x2="1010" y2="${y}" stroke="rgba(255,255,255,0.18)" stroke-width="1.1" />`;
    }

    // Measure Barlines: System start (85), Mid-system (580), System end (1010)
    html += `
      <line x1="580" y1="36" x2="580" y2="68" stroke="rgba(255,255,255,0.3)" stroke-width="1.2" />
      <line x1="580" y1="132" x2="580" y2="164" stroke="rgba(255,255,255,0.3)" stroke-width="1.2" />
      <line x1="1010" y1="36" x2="1010" y2="68" stroke="rgba(255,255,255,0.3)" stroke-width="1.2" />
      <line x1="1010" y1="132" x2="1010" y2="164" stroke="rgba(255,255,255,0.3)" stroke-width="1.2" />
    `;

    // Clefs & Key Signatures
    // Upper Clef: Always Treble G-clef (anchored at G4 line, y=60)
    html += `
      <g transform="translate(88, 22)" style="color: rgba(255,255,255,0.85);">
        <use href="#authentic-gclef" />
      </g>
      <!-- Upper Staff Db Major Key Signature: Bb4(52), Eb5(40), Ab4(56), Db5(44), Gb4(60) -->
      <use href="#classical-flat" x="114" y="44" style="color: rgba(255,255,255,0.6);" />
      <use href="#classical-flat" x="122" y="32" style="color: rgba(255,255,255,0.6);" />
      <use href="#classical-flat" x="130" y="48" style="color: rgba(255,255,255,0.6);" />
      <use href="#classical-flat" x="138" y="36" style="color: rgba(255,255,255,0.6);" />
      <use href="#classical-flat" x="146" y="52" style="color: rgba(255,255,255,0.6);" />
    `;

    // Lower Clef: Dynamic G or F Clef
    if (sys.staff2Clef === 'G') {
      html += `
        <g transform="translate(88, 118)" style="color: rgba(255,255,255,0.8);">
          <use href="#authentic-gclef" />
        </g>
        <use href="#classical-flat" x="114" y="140" style="color: rgba(255,255,255,0.6);" />
        <use href="#classical-flat" x="122" y="128" style="color: rgba(255,255,255,0.6);" />
        <use href="#classical-flat" x="130" y="144" style="color: rgba(255,255,255,0.6);" />
        <use href="#classical-flat" x="138" y="132" style="color: rgba(255,255,255,0.6);" />
        <use href="#classical-flat" x="146" y="148" style="color: rgba(255,255,255,0.6);" />
      `;
    } else {
      html += `
        <g transform="translate(88, 130)" style="color: rgba(255,255,255,0.85);">
          <use href="#authentic-fclef" />
        </g>
        <!-- Lower Staff Bass Clef Db Major: Bb3(148), Eb3(136), Ab3(152), Db3(140), Gb3(156) -->
        <use href="#classical-flat" x="114" y="140" style="color: rgba(255,255,255,0.6);" />
        <use href="#classical-flat" x="122" y="128" style="color: rgba(255,255,255,0.6);" />
        <use href="#classical-flat" x="130" y="144" style="color: rgba(255,255,255,0.6);" />
        <use href="#classical-flat" x="138" y="132" style="color: rgba(255,255,255,0.6);" />
        <use href="#classical-flat" x="146" y="148" style="color: rgba(255,255,255,0.6);" />
      `;
    }

    // Time signature: 9/8 (Only drawn on System 1)
    if (isSys1) {
      html += `
        <text x="156" y="52" fill="rgba(255,255,255,0.85)" font-family="'JetBrains Mono', monospace" font-size="15" font-weight="700">9</text>
        <text x="156" y="66" fill="rgba(255,255,255,0.85)" font-family="'JetBrains Mono', monospace" font-size="15" font-weight="700">8</text>
        <text x="156" y="148" fill="rgba(255,255,255,0.85)" font-family="'JetBrains Mono', monospace" font-size="15" font-weight="700">9</text>
        <text x="156" y="162" fill="rgba(255,255,255,0.85)" font-family="'JetBrains Mono', monospace" font-size="15" font-weight="700">8</text>
        
        <!-- Score Direction Annotations for Measure 1 -->
        <text x="180" y="24" fill="rgba(255,255,255,0.9)" font-family="'Plus Jakarta Sans', serif" font-style="italic" font-size="12" font-weight="600">Andante très expressif (J. = 48)</text>
        <text x="180" y="124" fill="rgba(255,255,255,0.7)" font-family="'Plus Jakarta Sans', serif" font-style="italic" font-size="11">pp con sordina</text>
      `;
    }

    // Measure numbers
    html += `
      <text x="90" y="30" fill="rgba(255,255,255,0.4)" font-family="'JetBrains Mono', monospace" font-size="10">${sys.m1}</text>
      <text x="584" y="30" fill="rgba(255,255,255,0.4)" font-family="'JetBrains Mono', monospace" font-size="10">${sys.m2}</text>
    `;

    return html;
  }
}
