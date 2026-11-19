// hack.js — movement and carrying-capacity routines.
// C ref: hack.c
//
// Ported so far: weight_cap(), inv_weight(), calc_capacity(),
// near_capacity().

import { game } from './gstate.js';
import { ACURR, acurrstr } from './attrib.js';
import {
    A_CON, WT_WEIGHTCAP_STRCON, WT_WEIGHTCAP_SPARE, MAX_CARR_CAP, WT_HUMAN,
    WT_WOUNDEDLEG_REDUCT, UNENCUMBERED, OVERLOADED, LEVITATION,
    FLYING, WOUNDED_LEGS, LEFT_SIDE, RIGHT_SIDE, I_SPECIAL, Is_airlevel,
} from './const.js';
import { S_NYMPH, M2_STRONG, M2_ROCKTHROW, MZ_HUMAN } from './monsters.js';
import { COIN_CLASS, BOULDER } from './objects.js';

function strongmonst(ptr) { return (ptr.mflags2 & M2_STRONG) !== 0; }
function throws_rocks(ptr) { return (ptr.mflags2 & M2_ROCKTHROW) !== 0; }

// C ref: hack.c weight_cap()
export function weight_cap() {
    const g = game;
    const u = g.u;
    const lev = u.uprops[LEVITATION];
    const save_BLev = lev.blocked;
    let carrcap;

    /* boots of levitation being put on (afternmv == Boots_on): donning
       armor over several turns isn't ported yet */
    /* levitation is blocked by being trapped in the floor, but it still
       functions enough in that situation to enhance carrying capacity */
    lev.blocked &= ~I_SPECIAL;

    carrcap = (WT_WEIGHTCAP_STRCON * (acurrstr() + ACURR(A_CON)))
              + WT_WEIGHTCAP_SPARE;
    if (u.umonnum !== u.umonster) { /* Upolyd */
        const ptr = g.youmonst.data;
        /* consistent with can_carry() in mon.c */
        if (ptr.mlet === S_NYMPH)
            carrcap = MAX_CARR_CAP;
        else if (!ptr.cwt)
            carrcap = Math.trunc((carrcap * ptr.msize) / MZ_HUMAN);
        else if (!strongmonst(ptr)
                 || (strongmonst(ptr) && (ptr.cwt > WT_HUMAN)))
            carrcap = Math.trunc(carrcap * ptr.cwt / WT_HUMAN);
    }

    /* C ref: youprop.h Levitation, Flying (BFlying: not ported yet) */
    const Levitation = (lev.intrinsic || lev.extrinsic) && !lev.blocked;
    const Flying = !!(u.uprops[FLYING].intrinsic || u.uprops[FLYING].extrinsic);
    if (Levitation || Is_airlevel(u.uz) /* pugh@cornell */
        || (u.usteed && strongmonst(u.usteed.data))) {
        carrcap = MAX_CARR_CAP;
    } else {
        if (carrcap > MAX_CARR_CAP)
            carrcap = MAX_CARR_CAP;
        if (!Flying) {
            const EWounded_legs = u.uprops[WOUNDED_LEGS].extrinsic;
            if (EWounded_legs & LEFT_SIDE)
                carrcap -= WT_WOUNDEDLEG_REDUCT;
            if (EWounded_legs & RIGHT_SIDE)
                carrcap -= WT_WOUNDEDLEG_REDUCT;
        }
    }

    if (lev.blocked !== save_BLev) {
        lev.blocked = save_BLev;
        /* float_vs_flight(): not ported yet */
    }

    return Math.max(carrcap, 1); /* never return 0 */
}

// C ref: hack.c inv_weight()
/* returns how far beyond the normal capacity the hero is carrying */
export function inv_weight() {
    const g = game;
    let otmp = g.invent;
    let wt = 0;

    while (otmp) {
        if (otmp.oclass === COIN_CLASS)
            wt += Math.trunc((otmp.quan + 50) / 100);
        else if (otmp.otyp !== BOULDER || !throws_rocks(g.youmonst.data))
            wt += otmp.owt;
        otmp = otmp.nobj;
    }
    g.wc = weight_cap();
    return (wt - g.wc);
}

// C ref: hack.c calc_capacity()
export function calc_capacity(xtra_wt) {
    const wt = inv_weight() + xtra_wt;
    let cap;

    if (wt <= 0)
        return UNENCUMBERED;
    if (game.wc <= 1)
        return OVERLOADED;
    cap = Math.trunc((wt * 2) / game.wc) + 1;
    return Math.min(cap, OVERLOADED);
}

// C ref: hack.c near_capacity()
export function near_capacity() {
    return calc_capacity(0);
}
