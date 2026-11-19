// attrib.js — attribute and intrinsic-ability routines.
// C ref: attrib.c, include/attrib.h
//
// Ported so far: the innate-ability tables, role_abil(), postadjabil(),
// adjabil(), newhp(), acurr().

import { game } from './gstate.js';
import { rnd } from './rng.js';
import {
    A_STR, A_INT, A_WIS, A_DEX, A_CON, A_CHA, MAXULEV, STR19, FROMEXPER,
    FROMRACE, FROMOUTSIDE, INTRINSIC, SEARCHING, STEALTH, FAST,
    POISON_RES, WARNING, SLEEP_RES, SEE_INVIS, FIRE_RES, COLD_RES, SHOCK_RES,
    TELEPORT_CONTROL, INFRAVISION,
} from './const.js';
import {
    PM_ARCHEOLOGIST, PM_BARBARIAN, PM_CAVE_DWELLER, PM_HEALER, PM_KNIGHT,
    PM_MONK, PM_CLERIC, PM_RANGER, PM_ROGUE, PM_SAMURAI, PM_TOURIST,
    PM_VALKYRIE, PM_WIZARD, PM_ELF, PM_ORC, PM_HUMAN, PM_DWARF, PM_GNOME,
    PM_AMOROUS_DEMON, S_NYMPH,
} from './monsters.js';
import { GAUNTLETS_OF_POWER, DUNCE_CAP } from './objects.js';
import { ART_OGRESMASHER } from './artilist.js';
import { aligns } from './role.js';

// C ref: attrib.h ABASE(), ABON(), AMAX(), ATEMP()
export function ABASE(x) { return game.u.acurr.a[x]; }
export function ABON(x) { return game.u.abon.a[x]; }
export function AMAX(x) { return game.u.amax.a[x]; }
export function ATEMP(x) { return game.u.atemp.a[x]; }
// C ref: attrib.h ACURR(x) -- (acurr(x))
export function ACURR(x) { return acurr(x); }

/* The innate-ability tables. In C, 'ability' points at the intrinsic
   field of a hero property (e.g. &(HSearching), which is
   &u.uprops[SEARCHING].intrinsic); here it is that property's index. */
// C ref: attrib.c arc_abil[] .. hum_abil[]
const arc_abil = [ { ulevel: 1, ability: SEARCHING, gainstr: "", losestr: "" },
                   { ulevel: 5, ability: STEALTH, gainstr: "stealthy", losestr: "" },
                   { ulevel: 10, ability: FAST, gainstr: "quick", losestr: "slow" },
                   { ulevel: 0, ability: 0, gainstr: 0, losestr: 0 } ],

  bar_abil = [ { ulevel: 1, ability: POISON_RES, gainstr: "", losestr: "" },
               { ulevel: 7, ability: FAST, gainstr: "quick", losestr: "slow" },
               { ulevel: 15, ability: STEALTH, gainstr: "stealthy", losestr: "" },
               { ulevel: 0, ability: 0, gainstr: 0, losestr: 0 } ],

  cav_abil = [ { ulevel: 7, ability: FAST, gainstr: "quick", losestr: "slow" },
               { ulevel: 15, ability: WARNING, gainstr: "sensitive", losestr: "" },
               { ulevel: 0, ability: 0, gainstr: 0, losestr: 0 } ],

  hea_abil = [ { ulevel: 1, ability: POISON_RES, gainstr: "", losestr: "" },
               { ulevel: 15, ability: WARNING, gainstr: "sensitive", losestr: "" },
               { ulevel: 0, ability: 0, gainstr: 0, losestr: 0 } ],

  kni_abil = [ { ulevel: 7, ability: FAST, gainstr: "quick", losestr: "slow" },
               { ulevel: 0, ability: 0, gainstr: 0, losestr: 0 } ],

  mon_abil = [ { ulevel: 1, ability: FAST, gainstr: "", losestr: "" },
               { ulevel: 1, ability: SLEEP_RES, gainstr: "", losestr: "" },
               { ulevel: 1, ability: SEE_INVIS, gainstr: "", losestr: "" },
               { ulevel: 3, ability: POISON_RES, gainstr: "healthy", losestr: "" },
               { ulevel: 5, ability: STEALTH, gainstr: "stealthy", losestr: "" },
               { ulevel: 7, ability: WARNING, gainstr: "sensitive", losestr: "" },
               { ulevel: 9, ability: SEARCHING, gainstr: "perceptive", losestr: "unaware" },
               { ulevel: 11, ability: FIRE_RES, gainstr: "cool", losestr: "warmer" },
               { ulevel: 13, ability: COLD_RES, gainstr: "warm", losestr: "cooler" },
               { ulevel: 15, ability: SHOCK_RES, gainstr: "insulated", losestr: "conductive" },
               { ulevel: 17, ability: TELEPORT_CONTROL, gainstr: "controlled", losestr: "uncontrolled" },
               { ulevel: 0, ability: 0, gainstr: 0, losestr: 0 } ],

  pri_abil = [ { ulevel: 15, ability: WARNING, gainstr: "sensitive", losestr: "" },
               { ulevel: 20, ability: FIRE_RES, gainstr: "cool", losestr: "warmer" },
               { ulevel: 0, ability: 0, gainstr: 0, losestr: 0 } ],

  ran_abil = [ { ulevel: 1, ability: SEARCHING, gainstr: "", losestr: "" },
               { ulevel: 7, ability: STEALTH, gainstr: "stealthy", losestr: "" },
               { ulevel: 15, ability: SEE_INVIS, gainstr: "", losestr: "" },
               { ulevel: 0, ability: 0, gainstr: 0, losestr: 0 } ],

  rog_abil = [ { ulevel: 1, ability: STEALTH, gainstr: "", losestr: "" },
               { ulevel: 10, ability: SEARCHING, gainstr: "perceptive", losestr: "" },
               { ulevel: 0, ability: 0, gainstr: 0, losestr: 0 } ],

  sam_abil = [ { ulevel: 1, ability: FAST, gainstr: "", losestr: "" },
               { ulevel: 15, ability: STEALTH, gainstr: "stealthy", losestr: "" },
               { ulevel: 0, ability: 0, gainstr: 0, losestr: 0 } ],

  tou_abil = [ { ulevel: 10, ability: SEARCHING, gainstr: "perceptive", losestr: "" },
               { ulevel: 20, ability: POISON_RES, gainstr: "hardy", losestr: "" },
               { ulevel: 0, ability: 0, gainstr: 0, losestr: 0 } ],

  val_abil = [ { ulevel: 1, ability: COLD_RES, gainstr: "", losestr: "" },
               { ulevel: 3, ability: STEALTH, gainstr: "stealthy", losestr: "" },
               { ulevel: 7, ability: FAST, gainstr: "quick", losestr: "slow" },
               { ulevel: 0, ability: 0, gainstr: 0, losestr: 0 } ],

  wiz_abil = [ { ulevel: 15, ability: WARNING, gainstr: "sensitive", losestr: "" },
               { ulevel: 17, ability: TELEPORT_CONTROL, gainstr: "controlled", losestr: "uncontrolled" },
               { ulevel: 0, ability: 0, gainstr: 0, losestr: 0 } ],

  /* Intrinsics conferred by race */
  dwa_abil = [ { ulevel: 1, ability: INFRAVISION, gainstr: "", losestr: "" },
               { ulevel: 0, ability: 0, gainstr: 0, losestr: 0 } ],

  elf_abil = [ { ulevel: 1, ability: INFRAVISION, gainstr: "", losestr: "" },
               { ulevel: 4, ability: SLEEP_RES, gainstr: "awake", losestr: "tired" },
               { ulevel: 0, ability: 0, gainstr: 0, losestr: 0 } ],

  gno_abil = [ { ulevel: 1, ability: INFRAVISION, gainstr: "", losestr: "" },
               { ulevel: 0, ability: 0, gainstr: 0, losestr: 0 } ],

  orc_abil = [ { ulevel: 1, ability: INFRAVISION, gainstr: "", losestr: "" },
               { ulevel: 1, ability: POISON_RES, gainstr: "", losestr: "" },
               { ulevel: 0, ability: 0, gainstr: 0, losestr: 0 } ],

  hum_abil = [ { ulevel: 0, ability: 0, gainstr: 0, losestr: 0 } ];

// C ref: attrib.c postadjabil()
function postadjabil(ability) {
    if (!game.u.ulevel) /* initializing hero; don't attempt screen update yet */
        return;
    if (ability === WARNING || ability === SEE_INVIS)
        throw new Error('postadjabil(): see_monsters() not ported yet');
}

// C ref: attrib.c role_abil()
function role_abil(r) {
    const roleabils = [
        { role: PM_ARCHEOLOGIST, abil: arc_abil },
        { role: PM_BARBARIAN, abil: bar_abil },
        { role: PM_CAVE_DWELLER, abil: cav_abil },
        { role: PM_HEALER, abil: hea_abil },
        { role: PM_KNIGHT, abil: kni_abil },
        { role: PM_MONK, abil: mon_abil },
        { role: PM_CLERIC, abil: pri_abil },
        { role: PM_RANGER, abil: ran_abil },
        { role: PM_ROGUE, abil: rog_abil },
        { role: PM_SAMURAI, abil: sam_abil },
        { role: PM_TOURIST, abil: tou_abil },
        { role: PM_VALKYRIE, abil: val_abil },
        { role: PM_WIZARD, abil: wiz_abil },
        { role: 0, abil: null },
    ];
    let i;

    for (i = 0; roleabils[i].abil && roleabils[i].role !== r; i++)
        continue;
    return roleabils[i].abil;
}

// C ref: attrib.c adjabil()
export function adjabil(oldlevel, newlevel) {
    const u = game.u;
    let abil, rabil;
    let ai = 0; /* index into abil[], standing in for the C pointer */
    let prevabil, mask = FROMEXPER;

    abil = role_abil(game.urole.mnum); /* Role_switch */

    switch (game.urace.mnum) { /* Race_switch */
    case PM_ELF:
        rabil = elf_abil;
        break;
    case PM_ORC:
        rabil = orc_abil;
        break;
    case PM_HUMAN:
    case PM_DWARF:
    case PM_GNOME:
    default:
        rabil = null;
        break;
    }

    while (abil || rabil) {
        /* Have we finished with the intrinsics list? */
        if (!abil || !abil[ai].ability) {
            /* Try the race intrinsics */
            if (!rabil || !rabil[0].ability)
                break;
            abil = rabil;
            ai = 0;
            rabil = null;
            mask = FROMRACE;
        }
        const a = abil[ai];
        const prop = u.uprops[a.ability];
        prevabil = prop.intrinsic;
        if (oldlevel < a.ulevel && newlevel >= a.ulevel) {
            /* Abilities gained at level 1 can never be lost
             * via level loss, only via means that remove _any_
             * sort of ability.  A "gain" of such an ability from
             * an outside source is devoid of meaning, so we set
             * FROMOUTSIDE to avoid such gains.
             */
            if (a.ulevel === 1)
                prop.intrinsic |= (mask | FROMOUTSIDE);
            else
                prop.intrinsic |= mask;
            if (!(prop.intrinsic & INTRINSIC & ~mask)) {
                if (a.gainstr)
                    throw new Error('adjabil(): You_feel() not ported yet');
            }
        } else if (oldlevel >= a.ulevel && newlevel < a.ulevel) {
            prop.intrinsic &= ~mask;
            if (!(prop.intrinsic & INTRINSIC)) {
                if (a.losestr || a.gainstr)
                    throw new Error('adjabil(): You_feel() not ported yet');
            }
        }
        if (prevabil !== prop.intrinsic) /* it changed */
            postadjabil(a.ability);
        ai++;
    }

    if (oldlevel > 0) {
        throw new Error('adjabil(): add_weapon_skill()/lose_weapon_skill() not ported yet');
    }
}

// C ref: attrib.c newhp()
/* called when gaining a level (before u.ulevel gets incremented);
   also called with u.ulevel==0 during hero initialization or for
   re-init if hero turns into a "new man/woman/elf/&c" */
export function newhp() {
    const g = game;
    const u = g.u, urole = g.urole, urace = g.urace;
    let hp, conplus;

    if (u.ulevel === 0) {
        /* Initialize hit points */
        hp = urole.hpadv.infix + urace.hpadv.infix;
        if (urole.hpadv.inrnd > 0)
            hp += rnd(urole.hpadv.inrnd);
        if (urace.hpadv.inrnd > 0)
            hp += rnd(urace.hpadv.inrnd);
        if (g.moves === 0) { /* initial hero; skip for polyself to new man */
            /* Initialize alignment stuff */
            u.ualign.type = aligns[g.flags.initalign].value;
            u.ualign.record = urole.initrecord;
        }
        /* no Con adjustment for initial hit points */
    } else {
        if (u.ulevel < urole.xlev) {
            hp = urole.hpadv.lofix + urace.hpadv.lofix;
            if (urole.hpadv.lornd > 0)
                hp += rnd(urole.hpadv.lornd);
            if (urace.hpadv.lornd > 0)
                hp += rnd(urace.hpadv.lornd);
        } else {
            hp = urole.hpadv.hifix + urace.hpadv.hifix;
            if (urole.hpadv.hirnd > 0)
                hp += rnd(urole.hpadv.hirnd);
            if (urace.hpadv.hirnd > 0)
                hp += rnd(urace.hpadv.hirnd);
        }
        if (ACURR(A_CON) <= 3)
            conplus = -2;
        else if (ACURR(A_CON) <= 6)
            conplus = -1;
        else if (ACURR(A_CON) <= 14)
            conplus = 0;
        else if (ACURR(A_CON) <= 16)
            conplus = 1;
        else if (ACURR(A_CON) === 17)
            conplus = 2;
        else if (ACURR(A_CON) === 18)
            conplus = 3;
        else
            conplus = 4;
        hp += conplus;
    }
    if (hp <= 0)
        hp = 1;
    if (u.ulevel < MAXULEV) {
        /* remember increment; future level drain could take it away again */
        u.uhpinc[u.ulevel] = hp;
    } else {
        /* after level 30, throttle hit point gains from extra experience;
           once max reaches 1200, further increments will be just 1 more */
        let lim = 5 - Math.trunc(u.uhpmax / 300);

        lim = Math.max(lim, 1);
        if (hp > lim)
            hp = lim;
    }
    return hp;
}

// C ref: attrib.c acurr()
/* return the current effective value of a specific characteristic */
export function acurr(chridx) {
    const g = game;
    const u = g.u;
    let tmp, result = 0; /* 'result' will always be reset to positive value */

    tmp = u.abon.a[chridx] + u.atemp.a[chridx] + u.acurr.a[chridx];

    /* for Strength:  3 <= result <= 125;
       for all others:  3 <= result <= 25 */
    if (chridx === A_STR) {
        if (tmp >= STR19(25) || (g.uarmg && g.uarmg.otyp === GAUNTLETS_OF_POWER))
            result = STR19(25); /* 125 */
        else
            /* need non-zero here to avoid 'if(result==0)' below because
               that doesn't deal with Str encoding; the cap of 25 applied
               there would limit Str to 18/07 [18 + 7] */
            result = Math.max(tmp, 3);
    } else if (chridx === A_CHA) {
        if (tmp < 18 && (g.youmonst.data.mlet === S_NYMPH
                         || u.umonnum === PM_AMOROUS_DEMON))
            result = 18;
    } else if (chridx === A_CON) {
        /* u_wield_art(ART_OGRESMASHER) */
        if (g.uwep && g.uwep.oartifact === ART_OGRESMASHER)
            result = 25;
    } else if (chridx === A_INT || chridx === A_WIS) {
        /* Yes, this may raise Int and/or Wis if hero is sufficiently
           stupid.  There are lower levels of cognition than "dunce". */
        if (g.uarmh && g.uarmh.otyp === DUNCE_CAP)
            result = 6;
    } else if (chridx === A_DEX) {
        ; /* there aren't any special cases for dexterity */
    }

    if (result === 0) /* none of the special cases applied */
        result = (tmp >= 25) ? 25 : (tmp <= 3) ? 3 : tmp;

    return result;
}
