// makemon.js — monster type selection.
// C ref: makemon.c — uncommon, align_shift, temperature_shift, rndmonst,
// rndmonst_adj, mk_gen_ok, cmp_init_mongen_order, init_mongen_order,
// mkclass, mkclass_aligned, adj_lev.
//
// Not ported yet: makemon() itself and everything that creates monsters
// (newmonhp, m_initinv, m_initweap, ...); qt_montype() for the quest.

import { game } from './gstate.js';
import { rn2, rnd } from './rng.js';
import { level_difficulty, Is_special, In_hell } from './dungeon.js';
import {
    mons, LOW_PM, SPECIAL_PM, NUMMONS, PM_ORC, PM_GIANT, PM_ELF, PM_HUMAN,
    PM_WIZARD_OF_YENDOR, G_FREQ, G_NOGEN, G_UNIQ, G_HELL, G_NOHELL, G_IGNORE,
    S_LICH, MR_FIRE, MR_COLD, MAXMCLASSES,
} from './monsters.js';
import {
    G_GONE, A_NEUTRAL, A_NONE, ALIGNWEIGHT,
    AM_NONE, AM_LAWFUL, AM_NEUTRAL, AM_CHAOTIC,
} from './const.js';

function impossible(msg) { console.error(`impossible: ${msg}`); }

const NON_PM = -1;

// C ref: monst.h monmax_difficulty(), monmin_difficulty(),
// montoostrong(), montooweak()
function monmax_difficulty(levdif) { return Math.trunc((levdif + game.u.ulevel) / 2); }
function monmin_difficulty(levdif) { return Math.trunc(levdif / 6); }
function montoostrong(monindx, lev) { return mons[monindx].difficulty > lev; }
function montooweak(monindx, lev) { return mons[monindx].difficulty < lev; }

// C ref: hacklib.c sgn()
function sgn(n) { return (n < 0) ? -1 : (n !== 0); }

// C ref: mondata.h pm_resistance(), is_placeholder()
function pm_resistance(ptr, typ) { return (ptr.mresists & typ) !== 0; }
function is_placeholder(ptr) {
    return (ptr === mons[PM_ORC] || ptr === mons[PM_GIANT]
            || ptr === mons[PM_ELF] || ptr === mons[PM_HUMAN]);
}

// C ref: dungeon.h Is_rogue_level(); In_endgame()
function Is_rogue_level(lev) {
    const z = game.dungeon_topology.d_rogue_level;
    return !!((z.dlevel || z.dnum) && lev.dnum === z.dnum && lev.dlevel === z.dlevel);
}
function In_endgame(lev) {
    return lev.dnum === game.dungeon_topology.d_astral_level.dnum;
}

// C ref: makemon.c uncommon()
function uncommon(mndx) {
    if (mons[mndx].geno & (G_NOGEN | G_UNIQ))
        return true;
    if (game.mvitals[mndx].mvflags & G_GONE)
        return true;
    if (In_hell(game.u.uz))
        return (mons[mndx].maligntyp > A_NEUTRAL);
    else
        return ((mons[mndx].geno & G_HELL) !== 0);
}

// C ref: makemon.c align_shift()
/*
 *      shift the probability of a monster's generation by
 *      comparing the dungeon alignment and monster alignment.
 *      return an integer in the range of 0-5.
 */
function align_shift(ptr) {
    let alshift;

    /* C caches Is_special(&u.uz) per value of moves */
    const lev = Is_special(game.u.uz);
    switch ((lev) ? lev.flags.align : game.dungeons[game.u.uz.dnum].flags.align) {
    default: /* just in case */
    case AM_NONE:
        alshift = 0;
        break;
    case AM_LAWFUL:
        alshift = Math.trunc((ptr.maligntyp + 20) / (2 * ALIGNWEIGHT));
        break;
    case AM_NEUTRAL:
        alshift = Math.trunc((20 - Math.abs(ptr.maligntyp)) / ALIGNWEIGHT);
        break;
    case AM_CHAOTIC:
        alshift = Math.trunc((-(ptr.maligntyp - 20)) / (2 * ALIGNWEIGHT));
        break;
    }
    return alshift;
}

// C ref: makemon.c temperature_shift()
/* return larger value if monster prefers the level temperature */
function temperature_shift(ptr) {
    if (game.level.flags.temperature
        && pm_resistance(ptr, (game.level.flags.temperature > 0)
                         ? MR_FIRE : MR_COLD))
        return 3;
    return 0;
}

// C ref: makemon.c rndmonst()
/* select a random monster type */
export function rndmonst() {
    return rndmonst_adj(0, 0);
}

// C ref: makemon.c rndmonst_adj()
/* select a random monster type, with adjusted difficulty */
export function rndmonst_adj(minadj, maxadj) {
    let ptr;
    let mndx;
    let weight, totalweight, selected_mndx;

    if (game.u.uz.dnum === game.dungeon_topology.d_quest_dnum && rn2(7)) {
        /* qt_montype() is not ported yet */
        impossible('rndmonst_adj: qt_montype() is not ported yet');
    }

    const zlevel = level_difficulty();
    const minmlev = monmin_difficulty(zlevel) + minadj;
    const maxmlev = monmax_difficulty(zlevel) + maxadj;
    const upper = Is_rogue_level(game.u.uz); /* prefer uppercase only on rogue level */
    const elemlevel = In_endgame(game.u.uz)
        && !(game.u.uz.dnum === game.dungeon_topology.d_astral_level.dnum
             && game.u.uz.dlevel === game.dungeon_topology.d_astral_level.dlevel);

    /* amount processed so far */
    totalweight = 0;
    selected_mndx = NON_PM;

    for (mndx = LOW_PM; mndx < SPECIAL_PM; ++mndx) {
        ptr = mons[mndx];

        if (montooweak(mndx, minmlev) || montoostrong(mndx, maxmlev))
            continue;
        if (upper) {
            /* !isupper(monsym(ptr)): monster symbols are not ported yet */
            impossible('rndmonst_adj: rogue level monster symbols are not ported yet');
        }
        if (elemlevel) {
            /* wrong_elem_type() is not ported yet */
            impossible('rndmonst_adj: wrong_elem_type() is not ported yet');
        }
        if (uncommon(mndx))
            continue;
        if (In_hell(game.u.uz) && (ptr.geno & G_NOHELL))
            continue;

        /*
         * Weighted reservoir sampling:  select ptr with a
         * (ptr weight)/(total of all weights so far including ptr's)
         * probability.
         */
        weight = (ptr.geno & G_FREQ) + align_shift(ptr);
        weight += temperature_shift(ptr);
        if (weight < 0 || weight > 127) {
            impossible(`bad weight in rndmonst for mndx ${mndx}`);
            weight = 0;
        }
        /* was unconditional, but if weight==0, rn2() < 0 will always fail;
           also need to avoid rn2(0) if totalweight is still 0 so far */
        if (weight > 0) {
            totalweight += weight; /* totalweight now guaranteed to be > 0 */
            if (rn2(totalweight) < weight)
                selected_mndx = mndx;
        }
    }
    /*
     * Possible modification:  if totalweight is "too low" or nothing
     * viable was picked, expand minmlev..maxmlev range and try again.
     */
    if (selected_mndx === NON_PM || uncommon(selected_mndx)) {
        /* maybe no common monsters left, or all are too weak or too strong */
        return null;
    }
    return mons[selected_mndx];
}

// C ref: makemon.c mk_gen_ok()
/* decide whether it's ok to generate a candidate monster by mkclass() */
function mk_gen_ok(mndx, mvflagsmask, genomask) {
    const ptr = mons[mndx];

    if (game.mvitals[mndx].mvflags & mvflagsmask)
        return false;
    if (ptr.geno & genomask)
        return false;
    if (is_placeholder(ptr))
        return false;
    /* PM_MAIL_DAEMON exists only with MAIL_STRUCTURES */
    return true;
}

/* monsters in order by mlet & difficulty for mkclass() */
const mongen_order = new Array(NUMMONS).fill(0);
const mclass_maxf = new Array(MAXMCLASSES).fill(0);
let mongen_order_init = false;

// C ref: makemon.c cmp_init_mongen_order()
function cmp_init_mongen_order(i1, i2) {
    const offset1 = 0, offset2 = 0;

    /* incorporate the mlet into the sort values for comparison */
    const difficulty1 = ((mons[i1].difficulty + offset1) | (mons[i1].mlet << 8));
    const difficulty2 = ((mons[i2].difficulty + offset2) | (mons[i2].mlet << 8));
    return difficulty1 - difficulty2;
}

// C ref: makemon.c init_mongen_order()
/* initialize monster order for mkclass */
function init_mongen_order() {
    let i, mlet;

    if (mongen_order_init)
        return;

    mongen_order_init = true;
    for (i = LOW_PM; i < NUMMONS; i++) {
        mongen_order[i] = i;
        mlet = mons[i].mlet;
        if ((mons[i].geno & G_FREQ) > mclass_maxf[mlet])
            mclass_maxf[mlet] = (mons[i].geno & G_FREQ);
    }
    /* qsort(mongen_order, SPECIAL_PM, ...): the C library qsort is not
       stable; ties (same mlet and difficulty) keep mons[] order here,
       which matches glibc's merge sort for this input */
    const head = mongen_order.slice(0, SPECIAL_PM).sort(cmp_init_mongen_order);
    for (i = 0; i < SPECIAL_PM; i++)
        mongen_order[i] = head[i];
}

function MONSi(i) { return mongen_order[i]; }

// C ref: makemon.c mkclass()
/* Make one of the multiple types of a given monster class.
   Returns Null if no monsters in that class can be made. */
export function mkclass(class_, spc) {
    return mkclass_aligned(class_, spc, A_NONE);
}

// C ref: makemon.c mkclass_aligned()
/* mkclass() with alignment restrictions; used by ndemon() */
export function mkclass_aligned(class_, spc, atyp) {
    let first, last, num = 0;
    let k;
    const nums = new Array(SPECIAL_PM + 1).fill(0);
    const gehennom = In_hell(game.u.uz) ? 1 : 0;
    let mv_mask, gn_mask;

    const maxmlev = level_difficulty() >> 1;
    if (class_ < 1 || class_ >= MAXMCLASSES) {
        impossible('mkclass called with bad class!');
        return null;
    }

    init_mongen_order();
    /* the following must come after init_mongen_order() */
    const zero_freq_for_entire_class = (mclass_maxf[class_] === 0);

    for (first = LOW_PM; first < SPECIAL_PM; first++)
        if (mons[MONSi(first)].mlet === class_)
            break;
    if (first === SPECIAL_PM) {
        impossible(`mkclass found no class ${class_} monsters`);
        return null;
    }

    mv_mask = G_GONE; /* G_GENOD | G_EXTINCT */
    if ((spc & G_IGNORE) !== 0) {
        mv_mask = 0; /* mv_mask &= ~G_GONE; */
        /* G_IGNORE is not a mons[].geno mask so get rid of it now */
        spc &= ~G_IGNORE;
    }

    for (last = first; last < SPECIAL_PM && mons[MONSi(last)].mlet === class_;
         last++) {
        if (atyp !== A_NONE && sgn(mons[MONSi(last)].maligntyp) !== sgn(atyp))
            continue;
        gn_mask = (G_NOGEN | G_UNIQ);
        if (rn2(9) || class_ === S_LICH)
            gn_mask |= (gehennom ? G_NOHELL : G_HELL);
        gn_mask &= ~spc;

        if (mk_gen_ok(MONSi(last), mv_mask, gn_mask)) {
            if (num && montoostrong(MONSi(last), maxmlev)
                && mons[MONSi(last)].difficulty > mons[MONSi(last - 1)].difficulty
                && rn2(2))
                break;
            if ((k = (mons[MONSi(last)].geno & G_FREQ)) > 0
                || (k = (zero_freq_for_entire_class ? 1 : 0)) > 0) {
                nums[MONSi(last)] = k + 1
                    - (adj_lev(mons[MONSi(last)]) > (game.u.ulevel * 2) ? 1 : 0);
                num += nums[MONSi(last)];
            }
        }
    }
    if (!num)
        return null;

    /* the hard work has already been done; 'num' should hit 0 before
       first reaches last (which is actually one past our last candidate) */
    for (num = rnd(num); first < last; first++)
        if ((num -= nums[MONSi(first)]) <= 0)
            break;

    return nums[MONSi(first)] ? mons[MONSi(first)] : null;
}

// C ref: makemon.c adj_lev()
/* adjust strength of monsters based on u.uz and u.ulevel */
export function adj_lev(ptr) {
    let tmp, tmp2;

    if (ptr === mons[PM_WIZARD_OF_YENDOR]) {
        /* does not depend on other strengths, but does get stronger
         * every time he is killed
         */
        tmp = ptr.mlevel + game.mvitals[PM_WIZARD_OF_YENDOR].died;
        if (tmp > 49)
            tmp = 49;
        return tmp;
    }

    if ((tmp = ptr.mlevel) > 49)
        return 50; /* "special" demons/devils */
    tmp2 = (level_difficulty() - tmp);
    if (tmp2 < 0)
        tmp--; /* if mlevel > u.uz decrement tmp */
    else
        tmp += Math.trunc(tmp2 / 5); /* else increment 1 per five diff */

    tmp2 = (game.u.ulevel - ptr.mlevel); /* adjust vs. the player */
    if (tmp2 > 0)
        tmp += Math.trunc(tmp2 / 4); /* level as well */

    tmp2 = Math.trunc((3 * ptr.mlevel) / 2); /* crude upper limit */
    if (tmp2 > 49)
        tmp2 = 49;                                      /* hard upper limit */
    return ((tmp > tmp2) ? tmp2 : (tmp > 0 ? tmp : 0)); /* 0 lower limit */
}
