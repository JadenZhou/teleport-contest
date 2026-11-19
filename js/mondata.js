// mondata.js — monster-type predicates.
// C ref: include/mondata.h (macros), src/mondata.c (functions).
//
// Only what the ported code needs so far. Each macro takes a permonst
// entry (an element of mons[]), like the C macros take a permonst pointer.

import { game } from './gstate.js';
import {
    mons, NATTK, AT_ANY, AD_DRLI, M1_FLY, M1_SWIM, M1_WALLWALK, M1_NOEYES,
    M1_REGEN, M1_SEE_INVIS, M1_TPORT, M1_TPORT_CNTRL, M2_UNDEAD, M2_WERE,
    M2_ELF, M2_DWARF, M2_GNOME, M2_ORC, M2_HUMAN, M2_DEMON, M2_MALE,
    M2_FEMALE, M2_NEUTER, M3_INFRAVISION, S_EYE, S_LIGHT, S_VAMPIRE,
    PM_FLOATING_EYE, PM_MIND_FLAYER, PM_MASTER_MIND_FLAYER, PM_BAT,
    PM_GIANT_BAT, PM_VAMPIRE_BAT, PM_STALKER, PM_BLACK_LIGHT, PM_DEATH,
    PM_VAMPIRE, PM_VAMPIRE_LEADER, PM_VLAD_THE_IMPALER, PM_GRAY_DRAGON,
    PM_YELLOW_DRAGON, LOW_PM,
} from './monsters.js';

// C ref: mondata.h monsndx(ptr) -- ((ptr)->pmidx)
export function monsndx(ptr) { return ptr.pmidx; }

// C ref: mondata.h is_flyer()
export function is_flyer(ptr) { return (ptr.mflags1 & M1_FLY) !== 0; }
// C ref: mondata.h is_floater()
export function is_floater(ptr) { return ptr.mlet === S_EYE || ptr.mlet === S_LIGHT; }
// C ref: mondata.h is_swimmer()
export function is_swimmer(ptr) { return (ptr.mflags1 & M1_SWIM) !== 0; }
// C ref: mondata.h passes_walls()
export function passes_walls(ptr) { return (ptr.mflags1 & M1_WALLWALK) !== 0; }
// C ref: mondata.h haseyes()
export function haseyes(ptr) { return (ptr.mflags1 & M1_NOEYES) === 0; }
// C ref: mondata.h regenerates()
export function regenerates(ptr) { return (ptr.mflags1 & M1_REGEN) !== 0; }
// C ref: mondata.h perceives()
export function perceives(ptr) { return (ptr.mflags1 & M1_SEE_INVIS) !== 0; }
// C ref: mondata.h can_teleport()
export function can_teleport(ptr) { return (ptr.mflags1 & M1_TPORT) !== 0; }
// C ref: mondata.h control_teleport()
export function control_teleport(ptr) { return (ptr.mflags1 & M1_TPORT_CNTRL) !== 0; }
// C ref: mondata.h telepathic()
export function telepathic(ptr) {
    return ptr === mons[PM_FLOATING_EYE] || ptr === mons[PM_MIND_FLAYER]
        || ptr === mons[PM_MASTER_MIND_FLAYER];
}
// C ref: mondata.h is_undead()
export function is_undead(ptr) { return (ptr.mflags2 & M2_UNDEAD) !== 0; }
// C ref: mondata.h is_were()
export function is_were(ptr) { return (ptr.mflags2 & M2_WERE) !== 0; }
// C ref: mondata.h is_elf()
export function is_elf(ptr) { return (ptr.mflags2 & M2_ELF) !== 0; }
// C ref: mondata.h is_dwarf()
export function is_dwarf(ptr) { return (ptr.mflags2 & M2_DWARF) !== 0; }
// C ref: mondata.h is_gnome()
export function is_gnome(ptr) { return (ptr.mflags2 & M2_GNOME) !== 0; }
// C ref: mondata.h is_orc()
export function is_orc(ptr) { return (ptr.mflags2 & M2_ORC) !== 0; }
// C ref: mondata.h is_human()
export function is_human(ptr) { return (ptr.mflags2 & M2_HUMAN) !== 0; }
// C ref: mondata.h your_race()
export function your_race(ptr) { return (ptr.mflags2 & game.urace.selfmask) !== 0; }
// C ref: mondata.h is_bat()
export function is_bat(ptr) {
    return ptr === mons[PM_BAT] || ptr === mons[PM_GIANT_BAT]
        || ptr === mons[PM_VAMPIRE_BAT];
}
// C ref: mondata.h is_demon()
export function is_demon(ptr) { return (ptr.mflags2 & M2_DEMON) !== 0; }
// C ref: mondata.h is_male()
export function is_male(ptr) { return (ptr.mflags2 & M2_MALE) !== 0; }
// C ref: mondata.h is_female()
export function is_female(ptr) { return (ptr.mflags2 & M2_FEMALE) !== 0; }
// C ref: mondata.h is_neuter()
export function is_neuter(ptr) { return (ptr.mflags2 & M2_NEUTER) !== 0; }
// C ref: mondata.h infravision()
export function infravision(ptr) { return (ptr.mflags3 & M3_INFRAVISION); }
// C ref: mondata.h pm_invisible()
export function pm_invisible(ptr) {
    return ptr === mons[PM_STALKER] || ptr === mons[PM_BLACK_LIGHT];
}
// C ref: mondata.h is_vampire()
export function is_vampire(ptr) { return ptr.mlet === S_VAMPIRE; }

// C ref: monst.h is_vampshifter(mon)
export function is_vampshifter(mon) {
    return mon.cham === PM_VAMPIRE || mon.cham === PM_VAMPIRE_LEADER
        || mon.cham === PM_VLAD_THE_IMPALER;
}

// C ref: mondata.c set_mon_data()
export function set_mon_data(mon, ptr) {
    const g = game;
    const old_speed = mon.data ? mon.data.mmove : 0;
    const is_you = (mon === g.youmonst);
    const movement = is_you ? (g.u.umovement || 0) : (mon.movement || 0);
    let newmove = movement;

    mon.data = ptr;
    mon.mnum = monsndx(ptr);

    if (movement) { /* used to adjust poly'd hero as well as monsters */
        const new_speed = ptr.mmove;
        /* prorate unused movement if new form is slower so that
           it doesn't get extra moves leftover from previous form;
           if new form is faster, leave unused movement as is */
        if (new_speed < old_speed) {
            newmove *= new_speed;
            if (old_speed > 0) /* old > new and new >= 0, so always True */
                newmove = Math.trunc(newmove / old_speed);
        }
        if (is_you) g.u.umovement = newmove;
        else mon.movement = newmove;
    }
    return;
}

// C ref: mondata.c defended()
/* is 'mon' (possibly youmonst) protected against damage type 'adtype' via
   wielded weapon or worn dragon scales? [or by virtue of being a dragon?] */
export function defended(mon, adtyp) {
    const g = game;
    const is_you = (mon === g.youmonst);

    /* is 'mon' wielding an artifact that protects against 'adtyp'? */
    let o = is_you ? g.uwep : mon.mw;
    if (o && o.oartifact)
        throw new Error('defended(): artifact defends() not ported yet');

    /* if 'mon' is an adult dragon, treat it as if it was wearing scales
       so that it has the same benefit as a hero wearing dragon scales */
    const mndx = monsndx(mon.data);
    if (mndx >= PM_GRAY_DRAGON && mndx <= PM_YELLOW_DRAGON) {
        throw new Error('defended(): dragon scales (defends()) not ported yet');
    } else {
        /* ordinary case: not an adult dragon */
        if (!is_you)
            throw new Error('defended(): which_armor() not ported yet');
        o = g.uarm;
    }
    /* is 'mon' wearing dragon scales that protect against 'adtyp'? */
    if (o)
        throw new Error('defended(): Is_dragon_armor()/defends() not ported yet');

    return false;
}

// C ref: mondata.c resists_drli()
export function resists_drli(mon) {
    const ptr = mon.data;

    if (is_undead(ptr) || is_demon(ptr) || is_were(ptr)
        /* is_were() doesn't handle hero in human form */
        || (mon === game.youmonst && game.u.ulycn >= LOW_PM)
        || ptr === mons[PM_DEATH] || is_vampshifter(mon))
        return true;
    return defended(mon, AD_DRLI);
}

// C ref: mondata.c dmgtype_fromattack()
export function dmgtype_fromattack(ptr, dtyp, atyp) {
    for (let i = 0; i < NATTK; i++) {
        const a = ptr.mattk[i];
        if (a.adtyp === dtyp && (atyp === AT_ANY || a.aatyp === atyp))
            return a;
    }
    return null;
}

// C ref: mondata.c dmgtype()
/* does monster-type deal out a particular type of damage from any attack */
export function dmgtype(ptr, dtyp) {
    return dmgtype_fromattack(ptr, dtyp, AT_ANY) ? true : false;
}
