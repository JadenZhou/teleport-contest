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
    isok, HALLUC, STONED, SLIMED, STRANGLED, SICK, M_AP_FURNITURE, M_AP_OBJECT,
} from './const.js';
import { S_NYMPH, M2_STRONG, M2_ROCKTHROW, MZ_HUMAN, AT_BOOM, M1_HIDE } from './monsters.js';
import { m_at } from './makemon.js';
import { pline, canspotmon } from './display.js';
import { onscary } from './monmove.js';
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

// C ref: mondata.c noattacks()
function noattacks(ptr) {
    for (const mattk of ptr.mattk || []) {
        /* AT_BOOM "passive attack" (gas spore's explosion upon death)
           isn't an attack as far as our callers are concerned */
        if (mattk.aatyp === AT_BOOM)
            continue;

        if (mattk.aatyp)
            return false;
    }
    return true;
}

// C ref: hack.c monster_nearby()
export function monster_nearby() {
    const u = game.u;
    const Hallucination = !!(u.uprops[HALLUC]?.intrinsic || u.uprops[HALLUC]?.extrinsic);

    /* Also see the similar check in dochugw() in monmove.c */
    for (let x = u.ux - 1; x <= u.ux + 1; x++)
        for (let y = u.uy - 1; y <= u.uy + 1; y++) {
            if (!isok(x, y) || (x === u.ux && y === u.uy))
                continue;
            const mtmp = m_at(x, y);
            if (mtmp
                && mtmp.m_ap_type !== M_AP_FURNITURE
                && mtmp.m_ap_type !== M_AP_OBJECT
                && (Hallucination
                    || (!mtmp.mpeaceful && !noattacks(mtmp.data)))
                && (!(mtmp.data.mflags1 & M1_HIDE) || !mtmp.mundetected)
                && !(mtmp.msleeping || !mtmp.mcanmove) /* !helpless() */
                && !onscary(u.ux, u.uy, mtmp) && canspotmon(mtmp))
                return 1;
        }
    return 0;
}

// C ref: do.c danger_uprops()
function danger_uprops() {
    const p = game.u.uprops;
    const on = (i) => !!(p[i]?.intrinsic || p[i]?.extrinsic);
    return (on(STONED) || on(SLIMED) || on(STRANGLED) || on(SICK));
}

// C ref: do.c cmd_safety_prevention() -- flagcounter names the game
// field C passes by address
export async function cmd_safety_prevention(ucverb, cmddesc, act, flagcounter) {
    const g = game;
    if (g.flags.safe_wait !== false && !g.iflags.menu_requested && !g.multi) {
        let buf = '';
        /* iflags.cmdassist (default on) || !(*flagcounter)++ */
        let assist = (g.iflags.cmdassist !== false);
        if (!assist) {
            const prev = g[flagcounter] || 0;
            g[flagcounter] = prev + 1;
            assist = !prev;
        }
        if (assist) /* visctrl(cmd_from_func(do_reqmenu)): the default 'm' */
            buf = `  Use 'm' prefix to force ${cmddesc}.`;
        if (monster_nearby()) {
            await pline(`${act}${buf}`); /* Norep() */
            return true;
        } else if (danger_uprops()) {
            await pline(`${ucverb} doesn't feel like a good idea right now.`);
            return true;
        }
    }
    g[flagcounter] = 0;
    return false;
}
