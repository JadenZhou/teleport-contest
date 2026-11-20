// weapon.js — weapon skills.
// C ref: weapon.c
//
// Ported so far: skill_init(), weapon_type(), unrestrict_weapon_skill(),
// the P_SKILL()/P_MAX_SKILL()/P_ADVANCE()/P_RESTRICTED() accessors
// (skills.h) and practice_needed_to_advance().
//
// u.weapon_skills[] (you.h) lives on game.u.weapon_skills.

import { game } from './gstate.js';
import {
    P_NONE, P_NUM_SKILLS, P_ISRESTRICTED, P_UNSKILLED, P_BASIC, P_EXPERT,
    P_HEALING_SPELL, P_CLERIC_SPELL, P_ATTACK_SPELL, P_ENCHANTMENT_SPELL,
    P_BARE_HANDED_COMBAT, P_RIDING, P_CROSSBOW, P_BOW,
} from './const.js';
import { objects, WEAPON_CLASS, TOOL_CLASS, GEM_CLASS } from './objects.js';
import * as O from './objects.js';
import { rnd, d } from './rng.js';
import { P_AXE } from './const.js';
import { is_weptool } from './mkobj.js';
import { mon_hates_silver, mon_hates_blessings } from './mondata.js';
import * as M from './monsters.js';
import { spell_skilltype, skill_based_spellbook_id } from './spell.js';

function impossible(msg) { console.error(`impossible: ${msg}`); }

function weapon_skills() {
    const u = game.u;
    if (!u.weapon_skills) {
        u.weapon_skills = [];
        for (let i = 0; i < P_NUM_SKILLS; i++)
            u.weapon_skills.push({ skill: P_ISRESTRICTED, max_skill: P_ISRESTRICTED,
                                   advance: 0 });
    }
    return u.weapon_skills;
}

/* C ref: skills.h P_SKILL(), P_MAX_SKILL(), P_ADVANCE(), P_RESTRICTED() */
export function P_SKILL(type) { return weapon_skills()[type].skill; }
export function P_MAX_SKILL(type) { return weapon_skills()[type].max_skill; }
export function P_ADVANCE(type) { return weapon_skills()[type].advance; }
export function P_RESTRICTED(type) {
    return weapon_skills()[type].skill === P_ISRESTRICTED;
}
function set_P_SKILL(type, v) { weapon_skills()[type].skill = v; }
function set_P_MAX_SKILL(type, v) { weapon_skills()[type].max_skill = v; }
function set_P_ADVANCE(type, v) { weapon_skills()[type].advance = v; }

/* C ref: skills.h practice_needed_to_advance() */
export function practice_needed_to_advance(level) { return level * level * 20; }

/* C ref: obj.h is_ammo() */
function is_ammo(otmp) {
    return ((otmp.oclass === WEAPON_CLASS || otmp.oclass === GEM_CLASS)
            && objects[otmp.otyp].oc_skill >= -P_CROSSBOW
            && objects[otmp.otyp].oc_skill <= -P_BOW);
}

// C ref: weapon.c unrestrict_weapon_skill()
export function unrestrict_weapon_skill(skill) {
    if (skill < P_NUM_SKILLS && P_RESTRICTED(skill)) {
        set_P_SKILL(skill, P_UNSKILLED);
        set_P_MAX_SKILL(skill, P_BASIC);
        set_P_ADVANCE(skill, 0);
    }
}

// C ref: weapon.c weapon_type()
export function weapon_type(obj) {
    /* KMH -- now uses the object table */
    let type;

    if (!obj)
        return P_BARE_HANDED_COMBAT; /* Not using a weapon */
    if (obj.oclass !== WEAPON_CLASS && obj.oclass !== TOOL_CLASS
        && obj.oclass !== GEM_CLASS)
        return P_NONE; /* Not a weapon, weapon-tool, or ammo */
    type = objects[obj.otyp].oc_skill;
    return (type < 0) ? -type : type;
}

// C ref: weapon.c skill_init()
/*
 * Initialize weapon skill array for the game.  Start by setting all
 * skills to restricted, then set the skill for every weapon the
 * hero is holding, finally reading the given array that sets
 * maximums.
 */
export function skill_init(class_skill) {
    let obj;
    let skmax, skill;

    /* initialize skill array; by default, everything is restricted */
    for (skill = 0; skill < P_NUM_SKILLS; skill++) {
        set_P_SKILL(skill, P_ISRESTRICTED);
        set_P_MAX_SKILL(skill, P_ISRESTRICTED);
        set_P_ADVANCE(skill, 0);
    }

    /* Set skill for all weapons in inventory to be basic */
    for (obj = game.invent; obj; obj = obj.nobj) {
        /* don't give skill just because of carried ammo, wait until
           we see the relevant launcher (prevents an archeologist's
           touchstone from inadvertently providing skill in sling) */
        if (is_ammo(obj))
            continue;

        skill = weapon_type(obj);
        if (skill !== P_NONE)
            set_P_SKILL(skill, P_BASIC);
    }

    /* set skills for magic */
    const role = game.urole.mnum;
    if (role === M.PM_HEALER || role === M.PM_MONK) {
        set_P_SKILL(P_HEALING_SPELL, P_BASIC);
    } else if (role === M.PM_CLERIC) {
        set_P_SKILL(P_CLERIC_SPELL, P_BASIC);
    } else if (role === M.PM_WIZARD) {
        set_P_SKILL(P_ATTACK_SPELL, P_BASIC);
        set_P_SKILL(P_ENCHANTMENT_SPELL, P_BASIC);
    }

    /* walk through array to set skill maximums */
    for (let i = 0; class_skill[i].skill !== P_NONE; i++) {
        skmax = class_skill[i].skmax;
        skill = class_skill[i].skill;

        set_P_MAX_SKILL(skill, skmax);
        if (P_SKILL(skill) === P_ISRESTRICTED) /* skill pre-set */
            set_P_SKILL(skill, P_UNSKILLED);
    }

    /* High potential fighters already know how to use their hands. */
    if (P_MAX_SKILL(P_BARE_HANDED_COMBAT) > P_EXPERT)
        set_P_SKILL(P_BARE_HANDED_COMBAT, P_BASIC);

    /* Roles that start with a horse know how to ride it */
    if (game.urole.petnum === M.PM_PONY)
        set_P_SKILL(P_RIDING, P_BASIC);

    /*
     * Make sure we haven't missed setting the max on a skill
     * & set advance
     */
    for (skill = 0; skill < P_NUM_SKILLS; skill++) {
        if (!P_RESTRICTED(skill)) {
            if (P_MAX_SKILL(skill) < P_SKILL(skill)) {
                impossible(`skill_init: curr > max: ${skill}`);
                set_P_MAX_SKILL(skill, P_SKILL(skill));
            }
            set_P_ADVANCE(skill, practice_needed_to_advance(P_SKILL(skill) - 1));
        }
    }

    /* each role has a special spell; allow at least basic for its type
       (despite the function name, this works for spell skills too) */
    unrestrict_weapon_skill(spell_skilltype(game.urole.spelspec));

    if (!game.u.uroleplay?.pauper) /* paupers lack advanced access to books */
        skill_based_spellbook_id();
}

/* C ref: mondata.h bigmonst(), thick_skinned(), is_wooden(); obj.h is_axe(),
   greatest_erosion() */
function bigmonst(ptr) { return ptr.msize >= M.MZ_LARGE; }
function thick_skinned(ptr) { return (ptr.mflags1 & M.M1_THICK_HIDE) !== 0; }
function is_wooden(ptr) { return ptr === M.mons[M.PM_WOOD_GOLEM]; }
function is_axe(otmp) {
    return ((otmp.oclass === WEAPON_CLASS || otmp.oclass === TOOL_CLASS)
            && objects[otmp.otyp].oc_skill === P_AXE);
}
function greatest_erosion(otmp) {
    return Math.max(otmp.oeroded || 0, otmp.oeroded2 || 0);
}

// C ref: weapon.c dmgval()
/* Return the damage value of the object otmp when used against monster mon */
export function dmgval(otmp, mon) {
    let tmp = 0;
    const otyp = otmp.otyp;
    const ptr = mon.data;
    const Is_weapon = (otmp.oclass === WEAPON_CLASS || is_weptool(otmp));

    if (otyp === O.CREAM_PIE)
        return 0;

    if (bigmonst(ptr)) {
        if (objects[otyp].oc_wldam)
            tmp = rnd(objects[otyp].oc_wldam);
        switch (otyp) {
        case O.IRON_CHAIN:
        case O.CROSSBOW_BOLT:
        case O.MORNING_STAR:
        case O.PARTISAN:
        case O.RUNESWORD:
        case O.ELVEN_BROADSWORD:
        case O.BROADSWORD:
            tmp++;
            break;

        case O.FLAIL:
        case O.RANSEUR:
        case O.VOULGE:
            tmp += rnd(4);
            break;

        case O.ACID_VENOM:
        case O.HALBERD:
        case O.SPETUM:
            tmp += rnd(6);
            break;

        case O.BATTLE_AXE:
        case O.BARDICHE:
        case O.TRIDENT:
            tmp += d(2, 4);
            break;

        case O.TSURUGI:
        case O.DWARVISH_MATTOCK:
        case O.TWO_HANDED_SWORD:
            tmp += d(2, 6);
            break;
        }
    } else {
        if (objects[otyp].oc_wsdam)
            tmp = rnd(objects[otyp].oc_wsdam);
        switch (otyp) {
        case O.IRON_CHAIN:
        case O.CROSSBOW_BOLT:
        case O.MACE:
        case O.SILVER_MACE:
        case O.WAR_HAMMER:
        case O.FLAIL:
        case O.SPETUM:
        case O.TRIDENT:
            tmp++;
            break;

        case O.BATTLE_AXE:
        case O.BARDICHE:
        case O.BILL_GUISARME:
        case O.GUISARME:
        case O.LUCERN_HAMMER:
        case O.MORNING_STAR:
        case O.RANSEUR:
        case O.BROADSWORD:
        case O.ELVEN_BROADSWORD:
        case O.RUNESWORD:
        case O.VOULGE:
            tmp += rnd(4);
            break;

        case O.ACID_VENOM:
            tmp += rnd(6);
            break;
        }
    }
    if (Is_weapon) {
        tmp += otmp.spe;
        /* negative enchantment mustn't produce negative damage */
        if (tmp < 0)
            tmp = 0;
    }

    if (objects[otyp].oc_material <= O.LEATHER && thick_skinned(ptr))
        /* thick-skinned or scaled creatures don't feel it */
        tmp = 0;
    if (ptr === M.mons[M.PM_SHADE])
        throw new Error('dmgval(): shade_glare() not ported yet');

    /* "very heavy iron ball"; weight increase is in increments */
    if (otyp === O.HEAVY_IRON_BALL && tmp > 0)
        throw new Error('dmgval(): heavy iron ball weight bonus not ported yet');

    /* Put weapon vs. monster type damage bonuses in below: */
    if (Is_weapon || otmp.oclass === GEM_CLASS || otmp.oclass === O.BALL_CLASS
        || otmp.oclass === O.CHAIN_CLASS) {
        let bonus = 0;

        if (otmp.blessed && mon_hates_blessings(mon))
            bonus += rnd(4);
        if (is_axe(otmp) && is_wooden(ptr))
            bonus += rnd(4);
        if (objects[otyp].oc_material === O.SILVER && mon_hates_silver(mon))
            bonus += rnd(20);
        if (otmp.oartifact)
            throw new Error('dmgval(): artifact_light()/spec_dbon() not ported yet');

        tmp += bonus;
    }

    if (tmp > 0) {
        /* It's debatable whether a rusted blunt instrument
           should do less damage than a pristine one, since
           it will hit with essentially the same impact, but
           there ought to some penalty for using damaged gear
           so always subtract erosion even for blunt weapons. */
        tmp -= greatest_erosion(otmp);
        if (tmp < 1)
            tmp = 1;
    }

    return tmp;
}
