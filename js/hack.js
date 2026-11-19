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
    isok, IS_ALTAR, In_endgame, HEADSTONE, DISPLACED, HALLUC, STONED, SLIMED, STRANGLED, SICK, M_AP_FURNITURE, M_AP_OBJECT,
} from './const.js';
import { S_NYMPH, M2_STRONG, M2_ROCKTHROW, MZ_HUMAN, AT_BOOM, M1_HIDE } from './monsters.js';
import { m_at } from './makemon.js';
import { pline, canspotmon } from './display.js';
import { engr_at } from './engrave.js';
import { mons, M2_MINION, PM_DEATH, PM_FAMINE, PM_PESTILENCE, PM_VAMPIRE,
         PM_VAMPIRE_LEADER, PM_VLAD_THE_IMPALER, PM_ANGEL, S_HUMAN, S_VAMPIRE,
         G_UNIQ, PM_MINOTAUR } from './monsters.js';
import { In_hell } from './dungeon.js';

import { SCR_SCARE_MONSTER } from './objects.js';
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

// C ref: monmove.c onscary() -- kept here until monmove.js has it
/* The monster avoids a particular type of trap? */
function onscary(x, y, mtmp) {
    /* <0,0> is used by musical scaring;
     * it doesn't care about scrolls or engravings or dungeon branch */
    const auditory_scare = (x === 0 && y === 0),
          magical_scare = !auditory_scare;
    const ptr = mtmp.data, pm = mons.indexOf(ptr);
    /* C ref: mondata.h is_minion(), mon_aligntyp(); is_lminion() */
    const is_lminion = (ptr.mflags2 & M2_MINION) !== 0 && ptr.maligntyp > 0;
    const is_rider = (pm === PM_DEATH || pm === PM_FAMINE || pm === PM_PESTILENCE);
    /* C ref: mondata.h is_vampshifter() */
    const is_vampshifter = (mtmp.cham === PM_VAMPIRE || mtmp.cham === PM_VAMPIRE_LEADER
                            || mtmp.cham === PM_VLAD_THE_IMPALER);

    /* creatures who are directly resistant to any type of scaring:
     * Rodney, lawful minions, Angels, the Riders */
    if (mtmp.iswiz || is_lminion || pm === PM_ANGEL || is_rider)
        return false;

    /* creatures who are directly resistant to magical scaring
     * based on the mere presence of something at a location:
     * humans etc.
     * uniques have ascended their base monster instincts */
    if (magical_scare
        && (ptr.mlet === S_HUMAN || (ptr.geno & G_UNIQ)))
        return false;

    /* creatues who resist scaring under particular circumstances:
     * shopkeepers inside their own shop
     * priests inside their own temple */
    if (mtmp.isshk || mtmp.ispriest)
        throw new Error('onscary(): inhishop()/inhistemple() not ported yet');

    if (auditory_scare)
        return true;

    /* should this still be true for defiled/molochian altars? */
    if (IS_ALTAR(game.level.at(x, y).typ)
        && (ptr.mlet === S_VAMPIRE || is_vampshifter))
        return true;

    /* the scare monster scroll doesn't have any of the below
     * restrictions, being its own source of power */
    for (const o of game.level.objects || []) /* sobj_at() */
        if (o.otyp === SCR_SCARE_MONSTER && o.ox === x && o.oy === y)
            return true;

    /*
     * Creatures who don't (or can't) fear a written Elbereth:
     * all the above plus shopkeepers (even if poly'd into non-human),
     * vault guards (also even if poly'd), blind or peaceful monsters,
     * humans and elves, and minotaurs.
     */
    const u = game.u;
    /* C ref: engrave.c sengr_at("Elbereth", x, y, TRUE) */
    let ep = engr_at(x, y);
    if (ep && !(ep.engr_type !== HEADSTONE && ep.engr_time <= game.moves
                && String(ep.engr_txt?.actual_text ?? '').toLowerCase()
                   === "elbereth"))
        ep = null;
    const Displaced = !!(u.uprops[DISPLACED]?.intrinsic || u.uprops[DISPLACED]?.extrinsic);
    return (!!ep
            && ((x === u.ux && y === u.uy)
                || (Displaced && mtmp.mux === x && mtmp.muy === y)
                /* || (ep->guardobjects && vobj_at(x, y)): floor objects
                   aren't listed yet */)
            && !(mtmp.isshk || mtmp.isgd || !mtmp.mcansee
                 || mtmp.mpeaceful
                 || pm === PM_MINOTAUR
                 || In_hell(u.uz) || In_endgame(u.uz)));
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
