// fastforward.js — Auto-generated RNG replay for seed8000 starter session.
// All of game start (through u_init_inventory_attrs, makedog and
// moveloop_preamble) is real now; what is left is the per-turn replay.
// The turn structure (allmain.c moveloop_core()), mon.c mcalcmove() and
// the once-per-turn / once-per-hero-took-time blocks (nh_timeout,
// regen, dosounds, gethungry, exerchk, u_wipe_engr, seer_turn, ...) are
// real now too.  What is left of each step is the rolls made by
// movemon() (before the new-turn block).
//
// Generated from: seed8000-tourist-starter.session.json

import { rn2 } from "./rng.js";

export const FF_MOVEMON = 0;

// Per-step leaf RNG calls for the parts of the turn cycle not ported yet
export function fastforward_step(stepNum, part) {
    const steps = [
        [() => {}], // step 1
        [() => { rn2(5); rn2(5); rn2(5); rn2(5); }], // step 2
        [() => { rn2(5); rn2(32); rn2(5); rn2(5); rn2(32); rn2(5); }], // step 3
        [() => { rn2(5); rn2(24); rn2(5); rn2(5); rn2(24); rn2(5); }], // step 4
        [() => { rn2(5); rn2(16); rn2(5); }], // step 5
        [() => { rn2(5); rn2(12); rn2(5); rn2(5); rn2(5); }], // step 6
        [() => { rn2(5); rn2(16); rn2(5); rn2(5); rn2(16); rn2(5); }], // step 7
        [() => { rn2(5); rn2(12); rn2(5); }], // step 8
        [() => { rn2(5); rn2(20); rn2(5); rn2(5); rn2(8); rn2(5); }], // step 9
        [() => { rn2(5); rn2(12); rn2(5); rn2(5); rn2(20); rn2(5); }], // step 10
    ];
    if (stepNum > 0 && stepNum <= steps.length) steps[stepNum - 1][part]();
}
