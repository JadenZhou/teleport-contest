#!/usr/bin/env node
// progress.mjs — the method's progress metric and merge gate.
//
// Rule: "Match every roll, including who rolls it."
// A dice roll counts as matching only if its value AND its caller match the
// C recording. C callers come from the recorder's " @ fn(file:line)" tail;
// JS callers come from js/rng.js caller tracing (enabled here only).
//
// For each session it reports:
//   valuePrefix  — rolls matching C by value (what the contest checks)
//   rulePrefix   — rolls matching C by value AND caller (our metric)
//   first rule mismatch: index, step, C entry, JS entry, and the C function
//   that should have rolled it.
// Then a to-do list: C functions ranked by how much session progress is
// blocked behind them.
//
// Usage:
//   node tools/rule/progress.mjs [--sessions DIR] [--only substr] [--json out.json]
//   node tools/rule/progress.mjs --gate baseline.json   # merge gate vs baseline
//   (internal) node tools/rule/progress.mjs --one <session.json>
//
// Each session runs in a child process with a timeout, so a hang or crash
// in one session doesn't take down the report.

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { spawnSync } from 'child_process';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const args = process.argv.slice(2);
const opt = (name, dflt = null) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : dflt;
};
const TIMEOUT_MS = Number(opt('--timeout', '120000'));

const isRng = e => typeof e === 'string' && /^(?:rn2|rnd|rn1|rnl|rne|rnz|d)\(/.test(e);
const valueOf = e => e.replace(/\s*@\s.*$/, '').trim();

// Caller key. C entries: "fn(file.c:line)" -> "fn". Lua entries (anything
// mentioning a .lua file) keep their text with line numbers stripped, e.g.
// "random src=nhlib.lua parent=shuffle(nhlib.lua)", so a JS Lua engine must
// reproduce the same Lua function/file attribution. Missing tag -> null.
export function callerKey(entry) {
    const at = entry.indexOf(' @ ');
    if (at < 0) return null;
    const tail = entry.slice(at + 3).trim();
    if (/\.lua\b|\[C\]/.test(tail)) return 'lua:' + tail.replace(/:-?\d+/g, '');
    const m = /^([A-Za-z_$][\w$]*)/.exec(tail);
    return m ? m[1] : tail;
}

// ---------- child mode: run one session, print JSON ----------
async function runOne(sessionPath) {
    globalThis.__TELEPORT_CALLER_TRACE = true;
    const { normalizeSession } = await import(join(ROOT, 'frozen/session_loader.mjs'));
    const { runSegment } = await import(join(ROOT, 'js/jsmain.js'));
    const segments = normalizeSession(JSON.parse(readFileSync(sessionPath, 'utf8'))).segments;

    const cRng = [], cStepOf = [];
    let step = 0;
    for (const seg of segments) for (const st of seg.steps || []) {
        for (const e of st.rng || []) if (isRng(e)) { cRng.push(e); cStepOf.push(step); }
        step++;
    }
    const storage = new Map();
    const store = {
        getItem: k => (storage.has(k) ? storage.get(k) : null),
        setItem: (k, v) => storage.set(k, String(v)),
        removeItem: k => storage.delete(k),
        get length() { return storage.size; },
        key: i => [...storage.keys()][i] ?? null,
    };
    const jsRng = [];
    let error = null;
    try {
        for (const seg of segments) {
            const g = await runSegment({ seed: seg.seed, datetime: seg.datetime,
                nethackrc: seg.nethackrc, moves: seg.moves, storage: store });
            for (const e of g.getRngLog?.() || []) {
                const s = typeof e === 'string' ? e.replace(/^\d+\s+/, '') : String(e);
                if (isRng(s)) jsRng.push(s);
            }
        }
    } catch (e) {
        error = String(e?.stack || e).split('\n').slice(0, 4).join(' | ');
    }

    let valuePrefix = 0;
    while (valuePrefix < cRng.length && valuePrefix < jsRng.length &&
           valueOf(cRng[valuePrefix]) === valueOf(jsRng[valuePrefix])) valuePrefix++;
    let rulePrefix = 0;
    while (rulePrefix < valuePrefix &&
           callerKey(cRng[rulePrefix]) === callerKey(jsRng[rulePrefix])) rulePrefix++;

    const i = rulePrefix;
    const first = i < cRng.length ? {
        index: i,
        step: cStepOf[i],
        c: cRng[i],
        js: jsRng[i] ?? '(none: JS log ended)',
        kind: i < valuePrefix ? 'caller' : 'value',
        cCaller: callerKey(cRng[i]),
        jsCaller: jsRng[i] ? callerKey(jsRng[i]) : null,
        context: cRng.slice(Math.max(0, i - 3), i + 3),
    } : null;
    return { session: basename(sessionPath), total: cRng.length, jsTotal: jsRng.length,
             totalSteps: step, valuePrefix, rulePrefix, first, error };
}

// ---------- parent mode ----------
function listSessions() {
    const dir = opt('--sessions', join(ROOT, 'sessions'));
    const only = opt('--only');
    return readdirSync(dir).filter(f => f.endsWith('.session.json'))
        .filter(f => !only || f.includes(only)).sort().map(f => join(dir, f));
}

function runAll() {
    const results = [];
    for (const s of listSessions()) {
        const r = spawnSync(process.execPath, [new URL(import.meta.url).pathname, '--one', s],
            { encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 64 << 20 });
        let res;
        try { res = JSON.parse(r.stdout.trim().split('\n').pop()); }
        catch {
            res = { session: basename(s), total: null, valuePrefix: 0, rulePrefix: 0, first: null,
                    error: r.error ? `timeout/spawn: ${r.error.code || r.error}` :
                           `crash: ${(r.stderr || '').split('\n').slice(0, 3).join(' | ')}` };
        }
        results.push(res);
    }
    return results;
}

function report(results) {
    const pad = (s, n) => String(s).padEnd(n);
    let sumC = 0, sumV = 0, sumR = 0;
    console.log(pad('session', 52) + pad('rule', 16) + pad('value', 16) + 'first mismatch (C should roll from)');
    for (const r of results) {
        sumC += r.total || 0; sumV += r.valuePrefix; sumR += r.rulePrefix;
        const where = r.error && !r.first ? `ERROR ${r.error.slice(0, 60)}`
            : r.first ? `${r.first.kind}@${r.first.index} step ${r.first.step}: ${r.first.cCaller}` +
                        (r.first.kind === 'caller' ? ` (JS: ${r.first.jsCaller})` : '')
            : 'all rolls match';
        console.log(pad(r.session.replace('.session.json', ''), 52) +
            pad(`${r.rulePrefix}/${r.total ?? '?'}`, 16) + pad(`${r.valuePrefix}`, 16) + where);
    }
    console.log(`\nTOTAL rule ${sumR}/${sumC} (${(100 * sumR / (sumC || 1)).toFixed(2)}%)  ` +
                `value ${sumV}/${sumC}  — value-but-not-rule: ${sumV - sumR}`);

    // To-do list: which C function blocks the most remaining rolls.
    const todo = new Map();
    for (const r of results) {
        if (!r.first || r.total == null) continue;
        const k = r.first.cCaller || '?';
        const t = todo.get(k) || { fn: k, sessions: 0, blockedRolls: 0, examples: [] };
        t.sessions++; t.blockedRolls += r.total - r.rulePrefix;
        if (t.examples.length < 2) t.examples.push(`${r.session.replace('.session.json', '')} @${r.first.index}: C "${r.first.c}" / JS "${r.first.js}"`);
        todo.set(k, t);
    }
    const ranked = [...todo.values()].sort((a, b) => b.sessions - a.sessions || b.blockedRolls - a.blockedRolls);
    console.log('\nTO-DO (port next — C function at each session\'s first rule mismatch):');
    for (const t of ranked.slice(0, 15)) {
        console.log(`  ${pad(t.fn, 44)} blocks ${pad(t.sessions + ' sessions', 13)} ${t.blockedRolls} rolls behind it`);
        for (const e of t.examples) console.log(`      e.g. ${e.slice(0, 150)}`);
    }
    return { sumC, sumV, sumR, ranked };
}

function gate(results, baselinePath) {
    const base = JSON.parse(readFileSync(baselinePath, 'utf8'));
    const prev = new Map(base.results.map(r => [r.session, r.rulePrefix]));
    const regress = [], improve = [];
    for (const r of results) {
        const p = prev.get(r.session) ?? 0;
        if (r.rulePrefix < p) regress.push(`${r.session}: ${p} -> ${r.rulePrefix}`);
        else if (r.rulePrefix > p) improve.push(`${r.session}: ${p} -> ${r.rulePrefix}`);
    }
    console.log(`\nGATE vs ${baselinePath}: ${improve.length} improved, ${regress.length} regressed`);
    regress.forEach(x => console.log('  REGRESSED ' + x));
    improve.forEach(x => console.log('  improved  ' + x));
    const pass = regress.length === 0 && improve.length > 0;
    console.log(pass ? 'GATE: PASS' : 'GATE: FAIL');
    return pass;
}

if (args[0] === '--one') {
    runOne(args[1]).then(r => console.log(JSON.stringify(r)))
        .catch(e => { console.log(JSON.stringify({ session: basename(args[1]), total: null,
            valuePrefix: 0, rulePrefix: 0, first: null, error: String(e) })); });
} else {
    const results = runAll();
    const summary = report(results);
    const out = opt('--json');
    if (out) writeFileSync(out, JSON.stringify({ when: new Date().toISOString(), results,
        todo: summary.ranked }, null, 1));
    const base = opt('--gate');
    if (base) process.exitCode = gate(results, base) ? 0 : 1;
}
