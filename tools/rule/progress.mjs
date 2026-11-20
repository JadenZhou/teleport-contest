#!/usr/bin/env node
// progress.mjs — the method's progress metric and merge gate.
//
// Rule: "Match every roll, including who rolls it."
// A dice roll counts only if its value AND its caller match the C recording.
//   C rolls:   caller = the C function ("fn" from " @ fn(file.c:line)").
//   Lua rolls: caller = the exact Lua tag, line numbers included
//              (e.g. "nh.rn2(themerms.lua:123)").
// JS callers come from js/rng.js caller tracing, enabled only here.
//
// Per session:
//   rulePrefix     rolls matching C by value AND caller (the method's metric)
//   valuePrefix    rolls matching C by value only (what the contest checks)
//   screens        screens matching C (cells + cursor), the official measure
//   honestScreens  matching screens whose step ends inside the rule prefix
//   first          the first rule mismatch and the C function that should roll it
// Plus a to-do list (C functions blocking the most remaining rolls) and static
// checks (tools/rule/checks.mjs).
//
// Usage (Node 22):
//   node tools/rule/progress.mjs [--sessions DIR] [--only substr] [--json out.json]
//   node tools/rule/progress.mjs --gate tools/rule/runs/baseline.json \
//        --label "what changed" [--ledger tools/rule/runs/ledger.jsonl]
//   (internal) node tools/rule/progress.mjs --one <session.json>
//
// Gate passes when: no session loses rule prefix or honest screens, at least
// one gains either, and no static check count grows.

import { readFileSync, readdirSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { spawnSync, execSync } from 'child_process';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const args = process.argv.slice(2);
const opt = (name, dflt = null) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : dflt;
};
const TIMEOUT_MS = Number(opt('--timeout', '180000'));

const isRng = e => typeof e === 'string' && /^(?:rn2|rnd|rn1|rnl|rne|rnz|d)\(/.test(e);
const valueOf = e => e.replace(/\s*@\s.*$/, '').trim();

export function callerKey(entry) {
    const at = entry.indexOf(' @ ');
    if (at < 0) return null;
    const tail = entry.slice(at + 3).trim();
    if (/\.lua\b|\[C\]/.test(tail)) return 'lua:' + tail;          // exact, lines kept
    const m = /^([A-Za-z_$][\w$]*)/.exec(tail);
    return m ? m[1] : tail;
}

// ---------- child mode: run one session, print JSON ----------
async function runOne(sessionPath) {
    globalThis.__TELEPORT_CALLER_TRACE = true;
    const { normalizeSession } = await import(join(ROOT, 'frozen/session_loader.mjs'));
    const { screensVisuallyEqual, cursorsEqual } = await import('./screens.mjs');
    const { runSegment } = await import(join(ROOT, 'js/jsmain.js'));
    const segments = normalizeSession(JSON.parse(readFileSync(sessionPath, 'utf8'))).segments;

    const cRng = [], cStepOf = [], cScreens = [], cCursors = [], cScreenRollEnd = [];
    let step = 0;
    for (const seg of segments) for (const st of seg.steps || []) {
        for (const e of st.rng || []) if (isRng(e)) { cRng.push(e); cStepOf.push(step); }
        if (st.screen) {
            cScreens.push(st.screen);
            cCursors.push(Array.isArray(st.cursor) ? st.cursor : null);
            cScreenRollEnd.push(cRng.length);          // rolls needed up to this screen
        }
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
    const jsRng = [], jsScreens = [], jsCursors = [];
    let error = null;
    try {
        for (const seg of segments) {
            const g = await runSegment({ seed: seg.seed, datetime: seg.datetime,
                nethackrc: seg.nethackrc, moves: seg.moves, storage: store });
            for (const e of g.getRngLog?.() || []) {
                const s = typeof e === 'string' ? e.replace(/^\d+\s+/, '') : String(e);
                if (isRng(s)) jsRng.push(s);
            }
            jsScreens.push(...(g.getScreens?.() || []));
            jsCursors.push(...(g.getCursors?.() || []));
            // runSegment stops cleanly on errors; still report them here
            if (g.stopError && !error)
                error = String(g.stopError?.stack || g.stopError).split('\n').slice(0, 4).join(' | ');
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

    let screens = 0, honestScreens = 0, firstScreenMiss = null;
    for (let k = 0; k < cScreens.length; k++) {
        const ok = screensVisuallyEqual(jsScreens[k] || '', cScreens[k]) &&
                   cursorsEqual(cCursors[k], jsCursors[k]);
        if (ok) {
            screens++;
            if (cScreenRollEnd[k] <= rulePrefix) honestScreens++;
        } else if (firstScreenMiss === null) firstScreenMiss = k;
    }

    const i = rulePrefix;
    const first = i < cRng.length ? {
        index: i, step: cStepOf[i], c: cRng[i],
        js: jsRng[i] ?? '(none: JS log ended)',
        kind: i < valuePrefix ? 'caller' : 'value',
        cCaller: callerKey(cRng[i]),
        jsCaller: jsRng[i] ? callerKey(jsRng[i]) : null,
        context: cRng.slice(Math.max(0, i - 3), i + 3),
    } : null;
    return { session: basename(sessionPath), total: cRng.length, jsTotal: jsRng.length,
             totalScreens: cScreens.length, valuePrefix, rulePrefix, screens, honestScreens,
             firstScreenMiss, first, error };
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
            { encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 256 << 20 });
        let res;
        try { res = JSON.parse(r.stdout.trim().split('\n').pop()); }
        catch {
            res = { session: basename(s), total: null, valuePrefix: 0, rulePrefix: 0,
                    screens: 0, honestScreens: 0, first: null,
                    error: r.error ? `timeout/spawn: ${r.error.code || r.error}` :
                           `crash: ${(r.stderr || '').split('\n').slice(0, 3).join(' | ')}` };
        }
        results.push(res);
    }
    return results;
}

function report(results, violations) {
    const pad = (s, n) => String(s).padEnd(n);
    let sumC = 0, sumV = 0, sumR = 0, sumS = 0, sumH = 0, sumT = 0;
    console.log(pad('session', 48) + pad('rule', 15) + pad('value', 8) + pad('screens h/all', 15) +
                'first rule mismatch (C function that should roll)');
    for (const r of results) {
        sumC += r.total || 0; sumV += r.valuePrefix; sumR += r.rulePrefix;
        sumS += r.screens || 0; sumH += r.honestScreens || 0; sumT += r.totalScreens || 0;
        const where = r.error && !r.first ? `ERROR ${r.error.slice(0, 60)}`
            : r.first ? `${r.first.kind}@${r.first.index} step ${r.first.step}: ${r.first.cCaller}` +
                        (r.first.kind === 'caller' ? ` (JS: ${r.first.jsCaller})` : '') +
                        (r.error ? '  [JS threw]' : '')
            : 'all rolls match';
        console.log(pad(r.session.replace('.session.json', ''), 48) +
            pad(`${r.rulePrefix}/${r.total ?? '?'}`, 15) + pad(`${r.valuePrefix}`, 8) +
            pad(`${r.honestScreens ?? 0}/${r.screens ?? 0}/${r.totalScreens ?? '?'}`, 15) + where);
    }
    const pct = (a, b) => (100 * a / (b || 1)).toFixed(2) + '%';
    console.log(`\nRULE ${sumR}/${sumC} rolls (${pct(sumR, sumC)})   value-only ${sumV}  ` +
                `(unearned: ${sumV - sumR})`);
    console.log(`SCREENS honest ${sumH} / official ${sumS} / ${sumT} (${pct(sumH, sumT)} honest)`);

    const { countByCheck } = checksModule;
    const counts = countByCheck(violations);
    // Real crashes (any JS error other than an explicit "not ported yet" stop,
    // plus timeouts) count as a check: the gate fails if their number grows.
    const crashed = results.filter(r => r.error && !/not ported yet/.test(r.error));
    if (crashed.length) counts.crash = crashed.length;
    console.log(`STATIC ${JSON.stringify(counts)}`);
    for (const r of crashed) console.log(`  CRASH ${r.session.replace('.session.json', '')}: ${r.error.slice(0, 140)}`);

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
    console.log('\nTO-DO (advance past the first rule mismatch; C function shown):');
    for (const t of ranked.slice(0, 15)) {
        console.log(`  ${pad(t.fn, 44)} blocks ${pad(t.sessions + ' sessions', 13)} ${t.blockedRolls} rolls`);
        for (const e of t.examples) console.log(`      e.g. ${e.slice(0, 160)}`);
    }
    return { totals: { rule: sumR, value: sumV, rolls: sumC, honestScreens: sumH, screens: sumS,
                       totalScreens: sumT }, staticCounts: counts, ranked };
}

function gate(results, staticCounts, baselinePath) {
    const base = JSON.parse(readFileSync(baselinePath, 'utf8'));
    const prev = new Map(base.results.map(r => [r.session, r]));
    const regress = [], improve = [], reasons = [];
    for (const r of results) {
        const p = prev.get(r.session) || { rulePrefix: 0, honestScreens: 0 };
        const dR = r.rulePrefix - (p.rulePrefix || 0);
        const dH = (r.honestScreens || 0) - (p.honestScreens || 0);
        const tag = `${r.session.replace('.session.json', '')}: rule ${p.rulePrefix || 0}->${r.rulePrefix}, honest screens ${p.honestScreens || 0}->${r.honestScreens || 0}`;
        if (dR < 0 || dH < 0) regress.push(tag);
        else if (dR > 0 || dH > 0) improve.push(tag);
    }
    const baseStatic = base.staticCounts || {};
    for (const [k, v] of Object.entries(staticCounts))
        if (v > (baseStatic[k] || 0)) reasons.push(`static check '${k}' grew ${baseStatic[k] || 0} -> ${v}`);
    if (regress.length) reasons.push(`${regress.length} session(s) regressed`);
    if (!improve.length) reasons.push('no session improved');
    console.log(`\nGATE vs ${baselinePath}: ${improve.length} improved, ${regress.length} regressed`);
    regress.forEach(x => console.log('  REGRESSED ' + x));
    improve.slice(0, 20).forEach(x => console.log('  improved  ' + x));
    const pass = reasons.length === 0;
    console.log(pass ? 'GATE: PASS' : `GATE: FAIL — ${reasons.join('; ')}`);
    return { pass, reasons, improved: improve.length, regressed: regress.length };
}

let checksModule;
if (args[0] === '--one') {
    runOne(args[1]).then(r => console.log(JSON.stringify(r)))
        .catch(e => { console.log(JSON.stringify({ session: basename(args[1]), total: null,
            valuePrefix: 0, rulePrefix: 0, screens: 0, honestScreens: 0, first: null,
            error: String(e) })); });
} else {
    checksModule = await import('./checks.mjs');
    const results = runAll();
    const violations = checksModule.runChecks();
    const summary = report(results, violations);
    const out = opt('--json');
    const snapshot = { when: new Date().toISOString(), results, staticCounts: summary.staticCounts,
                       totals: summary.totals, todo: summary.ranked.slice(0, 30), violations };
    if (out) writeFileSync(out, JSON.stringify(snapshot, null, 1));
    const base = opt('--gate');
    if (base) {
        const g = gate(results, summary.staticCounts, base);
        const ledger = opt('--ledger', join(ROOT, 'tools/rule/runs/ledger.jsonl'));
        let commit = '';
        try { commit = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch {}
        appendFileSync(ledger, JSON.stringify({
            when: snapshot.when, commit, label: opt('--label', ''),
            todo: summary.ranked[0]?.fn ?? null, pass: g.pass, reasons: g.reasons,
            improved: g.improved, regressed: g.regressed, totals: summary.totals,
            staticCounts: summary.staticCounts,
        }) + '\n');
        process.exitCode = g.pass ? 0 : 1;
    }
}
