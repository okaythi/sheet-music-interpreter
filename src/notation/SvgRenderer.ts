import type { ScoreSystem } from '../types/index.js';

export class SvgRenderer {
  public static readonly SMUFL_DEFS = `
    <defs>
      <!-- Standard Classical G-Clef (Treble) -->
      <g id="authentic-gclef">
        <g transform="matrix(1.010278,0,0,1.010278,-24.38602,-0.986803)">
          <path d="M 39.708934,63.678683 C 39.317094,65.77065 41.499606,70.115061 45.890584,70.256984 C 51.19892,70.428558 54.590321,66.367906 53.010333,59.740875 L 45.086538,23.171517 C 44.143281,18.81826 44.851281,16.457097 45.354941,15.049945 C 46.698676,11.295749 50.055822,9.7473042 50.873134,10.949208 C 51.339763,11.635413 52.468042,14.844006 49.256275,20.590821 C 46.751378,25.072835 35.096985,30.950138 34.2417,41.468011 C 33.501282,50.614249 43.075689,57.369301 51.339266,54.71374 C 56.825686,52.950639 59.653965,44.62402 56.258057,40.328987 C 47.29624,28.994371 32.923702,46.341263 46.846564,51.0935 C 45.332604,49.90238 44.300646,48.980054 44.1085,47.852721 C 42.237755,36.876941 58.741182,39.774741 54.294493,50.18735 C 52.466001,54.469045 45.080341,55.297323 40.874269,51.477433 C 37.350853,48.277521 35.787387,42.113231 39.708327,37.687888 C 45.018831,31.694223 51.288782,26.31366 52.954064,18.108736 C 54.923313,8.4061491 48.493821,0.84188926 44.429027,10.385835 C 43.065093,13.588288 42.557016,16.803074 43.863006,22.963534 L 51.780549,60.311215 C 52.347386,62.985028 51.967911,66.664419 49.472374,68.355474 C 48.236187,69.193154 43.861784,69.769668 42.791575,67.770092" fill="currentColor" />
          <path transform="matrix(-1.08512,-2.036848e-2,2.036848e-2,-1.08512,90.68868,135.0572)" d="M 48.24903 64.584198 A 3.439605 3.4987047 0 1 1  41.36982,64.584198 A 3.439605 3.4987047 0 1 1  48.24903 64.584198 z" fill="currentColor" />
        </g>
      </g>

      <!-- Standard Classical F-Clef (Bass) -->
      <g id="authentic-fclef">
        <path d="M 1239,8245 C 1397,8138 1515,8057 1591,8001 C 1667,7946 1747,7877 1829,7795 C 1911,7713 1980,7620 2036,7517 C 2080,7441 2118,7353 2149,7253 C 2180,7154 2196,7058 2199,6967 C 2199,6882 2188,6801 2165,6725 C 2143,6648 2105,6585 2051,6534 C 1997,6484 1927,6459 1840,6459 C 1756,6459 1677,6476 1603,6509 C 1530,6543 1478,6597 1449,6673 C 1449,6680 1445,6689 1439,6702 C 1441,6718 1449,6730 1464,6739 C 1479,6748 1492,6752 1504,6752 C 1510,6752 1527,6749 1553,6743 C 1580,6737 1602,6733 1620,6733 C 1673,6733 1720,6752 1763,6789 C 1805,6826 1826,6871 1826,6924 C 1826,6962 1815,6998 1794,7031 C 1773,7064 1744,7091 1707,7110 C 1670,7130 1629,7139 1585,7139 C 1505,7139 1437,7115 1381,7066 C 1326,7016 1298,6953 1298,6874 C 1298,6773 1329,6686 1390,6612 C 1452,6538 1530,6483 1626,6446 C 1721,6408 1817,6390 1915,6390 C 2022,6390 2124,6417 2219,6472 C 2315,6526 2390,6601 2446,6694 C 2502,6788 2531,6888 2531,6996 C 2531,7188 2467,7366 2339,7531 C 2211,7696 2053,7839 1864,7961 C 1738,8044 1534,8156 1253,8297 L 1239,8245 z M 2628,6698 C 2628,6662 2641,6632 2667,6608 C 2692,6583 2723,6571 2760,6571 C 2792,6571 2822,6585 2849,6612 C 2876,6638 2889,6669 2889,6703 C 2889,6739 2875,6770 2849,6795 C 2821,6819 2790,6831 2755,6831 C 2718,6831 2688,6819 2664,6792 C 2640,6766 2628,6735 2628,6698 z M 2628,7222 C 2628,7186 2641,7155 2665,7131 C 2690,7106 2721,7094 2760,7094 C 2792,7094 2821,7107 2849,7134 C 2875,7161 2889,7190 2889,7222 C 2889,7261 2876,7292 2851,7317 C 2825,7342 2795,7355 2760,7355 C 2721,7355 2690,7342 2665,7318 C 2641,7294 2628,7262 2628,7222 z" fill="currentColor" transform="scale(0.01353638) translate(-1239, -6968)" />
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
      <g transform="translate(88, 14.5)" style="color: rgba(255,255,255,0.85);">
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
        <g transform="translate(88, 110.5)" style="color: rgba(255,255,255,0.8);">
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
        <g transform="translate(88, 140)" style="color: rgba(255,255,255,0.85);">
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
