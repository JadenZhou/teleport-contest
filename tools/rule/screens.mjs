// screens.mjs — screen comparison, identical to frozen/ps_test_runner.mjs.
// Copied (not imported) because the runner executes main() on import.
// Keep in sync if the frozen runner changes.

import { decodeScreen, diffCell, ROWS_24, COLS_80 } from '../../frozen/screen-decode.mjs';

const STARTUP_VARIANT_LINES = [/Version\s+\d+\.\d+\.\d+[^\n]*/];

function preDecode(s) {
    let cur = String(s);
    for (const re of STARTUP_VARIANT_LINES) cur = cur.replace(re, '<<VERSION_BANNER>>');
    return cur.replace(/^\d{2}:\d{2}:\d{2}\.$/gm, '<time>.');
}

export function screensVisuallyEqual(a, b) {
    const ga = decodeScreen(preDecode(a));
    const gb = decodeScreen(preDecode(b));
    for (let r = 0; r < ROWS_24; r++)
        for (let c = 0; c < COLS_80; c++)
            if (diffCell(ga[r][c], gb[r][c])) return false;
    return true;
}

export function cursorsEqual(c, j) {
    if (!Array.isArray(c)) return true;
    if (!Array.isArray(j)) return false;
    return c[0] === j[0] && c[1] === j[1] && c[2] === j[2];
}
