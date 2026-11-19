// mondata.js — monster-type predicates.
// C ref: include/mondata.h (macros), src/mondata.c (functions).
//
// Only what the ported code needs so far. Each macro takes a permonst
// entry (an element of mons[]), like the C macros take a permonst pointer.

import * as M from './monsters.js';
import { game } from './gstate.js';
import { strncmpi, strcmpi, strstri } from './hacklib.js';
import { NON_PM, MALE, FEMALE, NEUTRAL, NUM_MGENDERS } from './const.js';
import { title_to_mon } from './botl.js';
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

// C ref: mondata.c grownups[][2]
const grownups = [
    [M.PM_CHICKATRICE, M.PM_COCKATRICE],
    [M.PM_LITTLE_DOG, M.PM_DOG],
    [M.PM_DOG, M.PM_LARGE_DOG],
    [M.PM_HELL_HOUND_PUP, M.PM_HELL_HOUND],
    [M.PM_WINTER_WOLF_CUB, M.PM_WINTER_WOLF],
    [M.PM_KITTEN, M.PM_HOUSECAT],
    [M.PM_HOUSECAT, M.PM_LARGE_CAT],
    [M.PM_PONY, M.PM_HORSE],
    [M.PM_HORSE, M.PM_WARHORSE],
    [M.PM_KOBOLD, M.PM_LARGE_KOBOLD],
    [M.PM_LARGE_KOBOLD, M.PM_KOBOLD_LEADER],
    [M.PM_GNOME, M.PM_GNOME_LEADER],
    [M.PM_GNOME_LEADER, M.PM_GNOME_RULER],
    [M.PM_DWARF, M.PM_DWARF_LEADER],
    [M.PM_DWARF_LEADER, M.PM_DWARF_RULER],
    [M.PM_MIND_FLAYER, M.PM_MASTER_MIND_FLAYER],
    [M.PM_ORC, M.PM_ORC_CAPTAIN],
    [M.PM_HILL_ORC, M.PM_ORC_CAPTAIN],
    [M.PM_MORDOR_ORC, M.PM_ORC_CAPTAIN],
    [M.PM_URUK_HAI, M.PM_ORC_CAPTAIN],
    [M.PM_SEWER_RAT, M.PM_GIANT_RAT],
    [M.PM_CAVE_SPIDER, M.PM_GIANT_SPIDER],
    [M.PM_OGRE, M.PM_OGRE_LEADER],
    [M.PM_OGRE_LEADER, M.PM_OGRE_TYRANT],
    [M.PM_ELF, M.PM_ELF_NOBLE],
    [M.PM_WOODLAND_ELF, M.PM_ELF_NOBLE],
    [M.PM_GREEN_ELF, M.PM_ELF_NOBLE],
    [M.PM_GREY_ELF, M.PM_ELF_NOBLE],
    [M.PM_ELF_NOBLE, M.PM_ELVEN_MONARCH],
    [M.PM_LICH, M.PM_DEMILICH],
    [M.PM_DEMILICH, M.PM_MASTER_LICH],
    [M.PM_MASTER_LICH, M.PM_ARCH_LICH],
    [M.PM_VAMPIRE, M.PM_VAMPIRE_LEADER],
    [M.PM_BAT, M.PM_GIANT_BAT],
    [M.PM_BABY_GRAY_DRAGON, M.PM_GRAY_DRAGON],
    [M.PM_BABY_GOLD_DRAGON, M.PM_GOLD_DRAGON],
    [M.PM_BABY_SILVER_DRAGON, M.PM_SILVER_DRAGON],
    [M.PM_BABY_RED_DRAGON, M.PM_RED_DRAGON],
    [M.PM_BABY_WHITE_DRAGON, M.PM_WHITE_DRAGON],
    [M.PM_BABY_ORANGE_DRAGON, M.PM_ORANGE_DRAGON],
    [M.PM_BABY_BLACK_DRAGON, M.PM_BLACK_DRAGON],
    [M.PM_BABY_BLUE_DRAGON, M.PM_BLUE_DRAGON],
    [M.PM_BABY_GREEN_DRAGON, M.PM_GREEN_DRAGON],
    [M.PM_BABY_YELLOW_DRAGON, M.PM_YELLOW_DRAGON],
    [M.PM_RED_NAGA_HATCHLING, M.PM_RED_NAGA],
    [M.PM_BLACK_NAGA_HATCHLING, M.PM_BLACK_NAGA],
    [M.PM_GOLDEN_NAGA_HATCHLING, M.PM_GOLDEN_NAGA],
    [M.PM_GUARDIAN_NAGA_HATCHLING, M.PM_GUARDIAN_NAGA],
    [M.PM_SMALL_MIMIC, M.PM_LARGE_MIMIC],
    [M.PM_LARGE_MIMIC, M.PM_GIANT_MIMIC],
    [M.PM_BABY_LONG_WORM, M.PM_LONG_WORM],
    [M.PM_BABY_PURPLE_WORM, M.PM_PURPLE_WORM],
    [M.PM_BABY_CROCODILE, M.PM_CROCODILE],
    [M.PM_SOLDIER, M.PM_SERGEANT],
    [M.PM_SERGEANT, M.PM_LIEUTENANT],
    [M.PM_LIEUTENANT, M.PM_CAPTAIN],
    [M.PM_WATCHMAN, M.PM_WATCH_CAPTAIN],
    [M.PM_ALIGNED_CLERIC, M.PM_HIGH_CLERIC],
    [M.PM_STUDENT, M.PM_ARCHEOLOGIST],
    [M.PM_ATTENDANT, M.PM_HEALER],
    [M.PM_PAGE, M.PM_KNIGHT],
    [M.PM_ACOLYTE, M.PM_CLERIC],
    [M.PM_APPRENTICE, M.PM_WIZARD],
    [M.PM_MANES, M.PM_LEMURE],
    [M.PM_KEYSTONE_KOP, M.PM_KOP_SERGEANT],
    [M.PM_KOP_SERGEANT, M.PM_KOP_LIEUTENANT],
    [M.PM_KOP_LIEUTENANT, M.PM_KOP_KAPTAIN],
];

// C ref: mondata.c little_to_big()
export function little_to_big(montype) {
    for (let i = 0; i < grownups.length; i++)
        if (montype === grownups[i][0]) {
            montype = grownups[i][1];
            break;
        }
    return montype;
}

// C ref: mondata.c big_to_little()
export function big_to_little(montype) {
    for (let i = 0; i < grownups.length; i++)
        if (montype === grownups[i][1]) {
            montype = grownups[i][0];
            break;
        }
    return montype;
}

// C ref: mondata.c name_to_mon()
/* figure out what type of monster a user-supplied string is specifying;
   ignore anything past the monster name */
export function name_to_mon(in_str, gender_name_var) {
    return name_to_monplus(in_str, null, gender_name_var);
}

// C ref: mondata.c name_to_monplus() names[] (struct alt_spl)
const alt_spl_names = [
    /* Alternate spellings */
    ['grey dragon', M.PM_GRAY_DRAGON, NEUTRAL],
    ['baby grey dragon', M.PM_BABY_GRAY_DRAGON, NEUTRAL],
    ['grey unicorn', M.PM_GRAY_UNICORN, NEUTRAL],
    ['grey ooze', M.PM_GRAY_OOZE, NEUTRAL],
    ['gray-elf', M.PM_GREY_ELF, NEUTRAL],
    ['mindflayer', M.PM_MIND_FLAYER, NEUTRAL],
    ['master mindflayer', M.PM_MASTER_MIND_FLAYER, NEUTRAL],
    /* More alternates; priest and priestess are separate monster
       types but that isn't the case for {aligned,high} priests */
    ['aligned priest', M.PM_ALIGNED_CLERIC, MALE],
    ['aligned priestess', M.PM_ALIGNED_CLERIC, FEMALE],
    ['high priest', M.PM_HIGH_CLERIC, MALE],
    ['high priestess', M.PM_HIGH_CLERIC, FEMALE],
    /* Inappropriate singularization by -ves check above */
    ['master of thief', M.PM_MASTER_OF_THIEVES, NEUTRAL],
    /* Potential misspellings where we want to avoid falling back
       to the rank title prefix (input has been singularized) */
    ['master thief', M.PM_MASTER_OF_THIEVES, NEUTRAL],
    ['master of assassin', M.PM_MASTER_ASSASSIN, NEUTRAL],
    ['master-lich', M.PM_MASTER_LICH, NEUTRAL], /* cf arch-lich */
    ['masterlich', M.PM_MASTER_LICH, NEUTRAL], /* cf demilich */
    /* Outdated names */
    ['invisible stalker', M.PM_STALKER, NEUTRAL],
    ['high-elf', M.PM_ELVEN_MONARCH, NEUTRAL], /* PM_HIGH_ELF is obsolete */
    /* other misspellings or incorrect words */
    ['wood-elf', M.PM_WOODLAND_ELF, NEUTRAL],
    ['wood elf', M.PM_WOODLAND_ELF, NEUTRAL],
    ['woodland nymph', M.PM_WOOD_NYMPH, NEUTRAL],
    ['halfling', M.PM_HOBBIT, NEUTRAL], /* potential guess for polyself */
    ['genie', M.PM_DJINNI, NEUTRAL], /* potential guess for ^G/#wizgenesis */
    /* prefix used to workaround duplicate monster names for
       monsters with alternate forms */
    ['human wererat', M.PM_HUMAN_WERERAT, NEUTRAL],
    ['human werejackal', M.PM_HUMAN_WEREJACKAL, NEUTRAL],
    ['human werewolf', M.PM_HUMAN_WEREWOLF, NEUTRAL],
    /* for completeness */
    ['rat wererat', M.PM_WERERAT, NEUTRAL],
    ['jackal werejackal', M.PM_WEREJACKAL, NEUTRAL],
    ['wolf werewolf', M.PM_WEREWOLF, NEUTRAL],
    /* Hyphenated names -- it would be nice to handle these via
       fuzzymatch() but it isn't able to ignore trailing stuff */
    ['ki rin', M.PM_KI_RIN, NEUTRAL],
    ['kirin', M.PM_KI_RIN, NEUTRAL],
    ['uruk hai', M.PM_URUK_HAI, NEUTRAL],
    ['orc captain', M.PM_ORC_CAPTAIN, NEUTRAL],
    ['woodland elf', M.PM_WOODLAND_ELF, NEUTRAL],
    ['green elf', M.PM_GREEN_ELF, NEUTRAL],
    ['grey elf', M.PM_GREY_ELF, NEUTRAL],
    ['gray elf', M.PM_GREY_ELF, NEUTRAL],
    ['elf lady', M.PM_ELF_NOBLE, FEMALE],
    ['elf lord', M.PM_ELF_NOBLE, MALE],
    ['elf noble', M.PM_ELF_NOBLE, NEUTRAL],
    ['olog hai', M.PM_OLOG_HAI, NEUTRAL],
    ['arch lich', M.PM_ARCH_LICH, NEUTRAL],
    ['archlich', M.PM_ARCH_LICH, NEUTRAL],
    /* Some irregular plurals */
    ['incubi', M.PM_AMOROUS_DEMON, MALE],
    ['succubi', M.PM_AMOROUS_DEMON, FEMALE],
    ['violet fungi', M.PM_VIOLET_FUNGUS, NEUTRAL],
    ['homunculi', M.PM_HOMUNCULUS, NEUTRAL],
    ['baluchitheria', M.PM_BALUCHITHERIUM, NEUTRAL],
    ['lurkers above', M.PM_LURKER_ABOVE, NEUTRAL],
    ['cavemen', M.PM_CAVE_DWELLER, MALE],
    ['cavewomen', M.PM_CAVE_DWELLER, FEMALE],
    ['watchmen', M.PM_WATCHMAN, NEUTRAL],
    ['djinn', M.PM_DJINNI, NEUTRAL],
    ['mumakil', M.PM_MUMAK, NEUTRAL],
    ['erinyes', M.PM_ERINYS, NEUTRAL],
];

// C ref: mondata.c name_to_monplus()
/* figure out what type of monster a user-supplied string is specifying;
   remainder_p.p gets whatever is past the monster name (C: a pointer into
   in_str); gender_name_var.v gets the gender of the matched name */
export function name_to_monplus(in_str, remainder_p, gender_name_var) {
    let i;
    let mntmp = NON_PM;
    let str, off = 0; /* C: str == buf + off */
    let len, mgend, matchgend = -1;
    let slen;
    let exact_match = false;
    let s;

    if (remainder_p)
        remainder_p.p = null;

    if (in_str.startsWith('a '))
        off = 2;
    else if (in_str.startsWith('an '))
        off = 3;
    else if (in_str.startsWith('the '))
        off = 4;
    str = in_str.slice(off);

    slen = str.length;

    if ((s = strstri(str, 'vortices')) >= 0)
        str = str.slice(0, s + 4) + 'ex';
    /* be careful with "ies"; "priest", "zombies" */
    else if (slen > 3 && !strcmpi(str.slice(slen - 3), 'ies')
             && (slen < 7 || strcmpi(str.slice(slen - 7), 'zombies')))
        str = str.slice(0, slen - 3) + 'y';
    /* luckily no monster names end in fe or ve with ves plurals */
    else if (slen > 3 && !strcmpi(str.slice(slen - 3), 'ves'))
        str = str.slice(0, slen - 3) + 'f';

    slen = str.length; /* length possibly needs recomputing */

    for (const [name, pm_val, genderhint] of alt_spl_names) {
        len = name.length;
        if (!strncmpi(str, name, len)
            /* force full word (which could conceivably be possessive) */
            && (len >= str.length || str[len] === ' ' || str[len] === '\'')) {
            if (remainder_p)
                remainder_p.p = in_str.slice(off + len);
            if (gender_name_var)
                gender_name_var.v = genderhint;
            return pm_val;
        }
    }

    for (len = 0, i = LOW_PM; i < M.NUMMONS; i++) {
        for (mgend = MALE; mgend < NUM_MGENDERS; mgend++) {
            const pmname = mons[i].pmnames[mgend];

            if (!pmname)
                continue;

            const m_i_len = pmname.length;
            if (m_i_len > len && !strncmpi(pmname, str, m_i_len)) {
                const rest = str.slice(m_i_len);
                if (m_i_len === slen) {
                    mntmp = i;
                    len = m_i_len;
                    matchgend = mgend;
                    exact_match = true;
                    break; /* exact match */
                } else if (slen > m_i_len
                           && (str[m_i_len] === ' '
                               || !strcmpi(rest, 's')
                               || !strncmpi(rest, 's ', 2)
                               || !strcmpi(rest, '\'')
                               || !strncmpi(rest, '\' ', 2)
                               || !strcmpi(rest, '\'s')
                               || !strncmpi(rest, '\'s ', 3)
                               || !strcmpi(rest, 'es')
                               || !strncmpi(rest, 'es ', 3))) {
                    mntmp = i;
                    len = m_i_len;
                    matchgend = mgend;
                }
            }
        }
        if (exact_match)
            break;
    }
    /* FIXME: some titles have gender; title_to_mon() doesn't propagate it */
    if (mntmp === NON_PM) {
        const tout = {};
        mntmp = title_to_mon(str, tout);
        len = tout.title_length;
    }
    if (len && remainder_p)
        remainder_p.p = in_str.slice(off + len);
    if (gender_name_var && matchgend !== -1) {
        /* don't override with neuter if caller has already specified male
           or female and we've matched the neuter name */
        if (gender_name_var.v === -1 || matchgend !== NEUTRAL)
            gender_name_var.v = matchgend;
    }
    return mntmp;
}
