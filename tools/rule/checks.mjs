// checks.mjs — static checks on js/ that back up the rule.
//
// Each check returns a list of violations {check, file, line, text}. The gate
// compares per-check counts with the baseline, so legacy violations (e.g. the
// skeleton's fastforward.js) don't block work, but nothing new may be added.
//
//  discarded-roll   A dice call used as a bare statement. NetHack's C never
//                   discards a roll (0 of 2,758 call sites), so a discarded
//                   roll in JS is either an unfinished stub or a fake roll.
//  session-fixture  A run of 16 numbers matching consecutive recorded dice
//                   results, or a string literal equal to a recorded screen
//                   row that doesn't appear in the C/Lua sources.
//  answer-key       js/ code touching session files, the filesystem or env.
//  test-branch      Comparisons of the seed against numeric literals.
//  frozen-modified  js/isaac64.js, js/terminal.js, js/storage.js differ from frozen/.

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const FROZEN = ['isaac64.js', 'terminal.js', 'storage.js'];

function walk(dir, out = []) {
    for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        const st = statSync(p);
        if (st.isDirectory()) walk(p, out);
        else if (/\.(m?js)$/.test(f)) out.push(p);
    }
    return out;
}

const DICE = '(?:rn2|rnd|rn1|rnl|rne|rnz|d|c_d|lua_d)';
const RE_DISCARD = new RegExp(`^\\s*(?:void\\s+)?(?:[\\w$.]+\\.)?${DICE}\\s*\\(.*\\)\\s*;?\\s*(?:\\/\\/.*)?$`);
const RE_DISCARD_INLINE = new RegExp(`;\\s*(?:[\\w$.]+\\.)?${DICE}\\s*\\([^;]*\\)\\s*;`);
const RE_ANSWER = /sessions\/|\.session\.json|readFileSync|require\(['"]fs|from ['"](?:node:)?fs['"]|process\.env/;
const RE_TESTBRANCH = /\b(?:seed|currentSeed|_seed)\s*[!=]==?\s*\d{2,}|\d{2,}\s*[!=]==?\s*(?:game\.)?(?:currentSeed|_seed)\b/;

let _ngrams = null, _rows = null, _srcText = null;
function sessionIndex(sessionsDir) {
    if (_ngrams) return;
    _ngrams = new Set(); _rows = new Set();
    const N = 16;
    for (const f of readdirSync(sessionsDir).filter(f => f.endsWith('.session.json'))) {
        const s = JSON.parse(readFileSync(join(sessionsDir, f), 'utf8'));
        for (const seg of s.segments || []) {
            const vals = [];
            for (const st of seg.steps || []) {
                for (const e of st.rng || []) {
                    const m = /^(?:rn2|rnd|rn1|rnl|rne|rnz|d)\([^)]*\)=(-?\d+)/.exec(e);
                    if (m) vals.push(m[1]);
                }
                for (const row of String(st.screen || '').split('\n')) {
                    const t = row.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/[\x0e\x0f]/g, '').trim();
                    if (t.length >= 40) _rows.add(t);
                }
            }
            for (let i = 0; i + N <= vals.length; i++) {
                const w = vals.slice(i, i + N);
                if (new Set(w).size >= 5) _ngrams.add(w.join(','));
            }
        }
    }
    // C and Lua sources: rows that legitimately appear there are not fixtures.
    // Prefer the patched recorder tree (local build); fall back to the upstream
    // submodule (same sources minus logging patches), e.g. in cloud sessions.
    const base = existsSync(join(ROOT, 'nethack-c/recorder/src')) ? 'nethack-c/recorder' : 'nethack-c/upstream';
    const srcDirs = ['src', 'dat', 'include'].map(d => join(ROOT, base, d)).filter(existsSync);
    if (!srcDirs.length) throw new Error('checks.mjs: no C sources found; run `git submodule update --init nethack-c/upstream`');
    _srcText = srcDirs.flatMap(d => readdirSync(d).map(f => join(d, f)))
        .filter(p => statSync(p).isFile()).map(p => readFileSync(p, 'latin1')).join('\n');
}

export function runChecks({ sessionsDir = join(ROOT, 'sessions') } = {}) {
    const violations = [];
    const jsDir = join(ROOT, 'js');
    sessionIndex(sessionsDir);
    for (const file of walk(jsDir)) {
        const rel = relative(ROOT, file);
        const base = rel.split('/').pop();
        const text = readFileSync(file, 'utf8');
        if (FROZEN.includes(base) && rel === `js/${base}`) {
            const frozen = readFileSync(join(ROOT, 'frozen', base), 'utf8');
            if (frozen !== text) violations.push({ check: 'frozen-modified', file: rel, line: 0, text: '' });
            continue;
        }
        const lines = text.split('\n');
        lines.forEach((ln, i) => {
            if (RE_DISCARD.test(ln) || RE_DISCARD_INLINE.test(ln))
                violations.push({ check: 'discarded-roll', file: rel, line: i + 1, text: ln.trim().slice(0, 120) });
            if (RE_ANSWER.test(ln) && !/^\s*\/\//.test(ln))
                violations.push({ check: 'answer-key', file: rel, line: i + 1, text: ln.trim().slice(0, 120) });
            if (RE_TESTBRANCH.test(ln))
                violations.push({ check: 'test-branch', file: rel, line: i + 1, text: ln.trim().slice(0, 120) });
        });
        // numeric runs
        for (const m of text.matchAll(/-?\d+(?:\s*,\s*-?\d+){15,}/g)) {
            const nums = m[0].split(/\s*,\s*/);
            for (let i = 0; i + 16 <= nums.length; i++) {
                if (_ngrams.has(nums.slice(i, i + 16).join(','))) {
                    const line = text.slice(0, m.index).split('\n').length;
                    violations.push({ check: 'session-fixture', file: rel, line, text: `dice run: ${m[0].slice(0, 80)}` });
                    break;
                }
            }
        }
        // string literals equal to recorded screen rows not present in C/Lua sources
        for (const m of text.matchAll(/(['"`])((?:\\.|(?!\1).){40,}?)\1/g)) {
            const lit = m[2].trim();
            if (_rows.has(lit) && !_srcText.includes(lit)) {
                const line = text.slice(0, m.index).split('\n').length;
                violations.push({ check: 'session-fixture', file: rel, line, text: `screen row: ${lit.slice(0, 80)}` });
            }
        }
    }
    return violations;
}

export function countByCheck(violations) {
    const c = {};
    for (const v of violations) c[v.check] = (c[v.check] || 0) + 1;
    return c;
}
