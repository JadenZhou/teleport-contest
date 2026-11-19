// mkobj.js — object creation.
// C ref: mkobj.c — mkobjprobs[], rogueprobs[], hellprobs[], next_ident,
// may_generate_eroded, mkobj_erosions, mkobj_at, mksobj_at, mkobj, mksobj,
// mksobj_init, blessorcurse, bless, curse, bcsign, mkgold, is_flammable,
// is_rottable; objnam.c erosion_matters.
//
// Objects are plain JS objects with the struct obj fields that are set
// here. Not ported yet (each is reported with impossible() where C would
// call it): placing objects on the map (place_object), containers
// (mkbox_cnts, add_to_container), monster-type objects that need
// rndmonnum() (corpses, eggs, tins, figurines, statues), mk_artifact,
// candy wrappers, glob timers, novels, weight().

import { game } from './gstate.js';
import { rn2, rnd, rn1, rne } from './rng.js';
import { depth, level_difficulty, In_hell } from './dungeon.js';
import * as O from './objects.js';
import { objects } from './objects.js';
import { P_NONE, P_SHURIKEN, P_BOW, FIRE_RES } from './const.js';

function impossible(msg) { console.error(`impossible: ${msg}`); }

const {
    RANDOM_CLASS, WEAPON_CLASS, ARMOR_CLASS, RING_CLASS, AMULET_CLASS,
    TOOL_CLASS, FOOD_CLASS, POTION_CLASS, SCROLL_CLASS, SPBOOK_CLASS,
    WAND_CLASS, COIN_CLASS, GEM_CLASS, ROCK_CLASS, BALL_CLASS, CHAIN_CLASS,
    VENOM_CLASS,
} = O;

// C ref: mkobj.c SPBOOK_no_NOVEL — mkobj() class code for "spellbook, but
// not a novel"
export const SPBOOK_no_NOVEL = 0;

// C ref: mkobj.c mkobjprobs[]
const mkobjprobs = [
    [10, WEAPON_CLASS], [11, ARMOR_CLASS], [20, FOOD_CLASS],
    [8, TOOL_CLASS], [7, GEM_CLASS], [16, POTION_CLASS],
    [16, SCROLL_CLASS], [4, SPBOOK_CLASS], [4, WAND_CLASS],
    [3, RING_CLASS], [1, AMULET_CLASS],
];

// C ref: mkobj.c rogueprobs[]
const rogueprobs = [
    [12, WEAPON_CLASS], [12, ARMOR_CLASS], [22, FOOD_CLASS],
    [22, POTION_CLASS], [22, SCROLL_CLASS], [5, WAND_CLASS],
    [5, RING_CLASS],
];

// C ref: mkobj.c hellprobs[]
const hellprobs = [
    [20, WEAPON_CLASS], [20, ARMOR_CLASS], [16, FOOD_CLASS],
    [12, TOOL_CLASS], [10, GEM_CLASS], [1, POTION_CLASS],
    [1, SCROLL_CLASS], [8, WAND_CLASS], [8, RING_CLASS],
    [4, AMULET_CLASS],
];

// C ref: dungeon.h Is_rogue_level() — Lcheck(x, &rogue_level)
function Is_rogue_level(lev) {
    const z = game.dungeon_topology.d_rogue_level;
    return !!((z.dlevel || z.dnum) && lev.dnum === z.dnum && lev.dlevel === z.dlevel);
}

// C ref: obj.h is_multigen()
function is_multigen(otmp) {
    return (otmp.oclass === WEAPON_CLASS
            && objects[otmp.otyp].oc_skill >= -P_SHURIKEN
            && objects[otmp.otyp].oc_skill <= -P_BOW);
}

// C ref: artifact.c permapoisoned() — is_art(obj, ART_GRIMTOOTH); no
// artifacts are created yet
function permapoisoned(obj) {
    return !!(obj && obj.oartifact && false);
}

// C ref: obj.h is_poisonable()
function is_poisonable(otmp) {
    return ((otmp.oclass === WEAPON_CLASS
             && objects[otmp.otyp].oc_skill >= -P_SHURIKEN
             && objects[otmp.otyp].oc_skill <= -P_BOW)
            || permapoisoned(otmp));
}

// C ref: obj.h is_weptool()
function is_weptool(o) {
    return (o.oclass === TOOL_CLASS && objects[o.otyp].oc_skill !== P_NONE);
}

// C ref: obj.h Is_candle()
function Is_candle(otmp) {
    return (otmp.otyp === O.TALLOW_CANDLE || otmp.otyp === O.WAX_CANDLE);
}

// C ref: obj.h Is_pudding()
function Is_pudding(o) {
    return (o.otyp === O.GLOB_OF_GRAY_OOZE || o.otyp === O.GLOB_OF_BROWN_PUDDING
            || o.otyp === O.GLOB_OF_GREEN_SLIME || o.otyp === O.GLOB_OF_BLACK_PUDDING);
}

// C ref: mkobj.c is_flammable()
export function is_flammable(otmp) {
    const otyp = otmp.otyp;
    const omat = objects[otyp].oc_material;

    /* Candles can be burned, but they're not flammable in the sense that
     * they can't get fire damage and it makes no sense for them to be
     * fireproofed.
     */
    if (Is_candle(otmp))
        return false;

    if (objects[otyp].oc_oprop === FIRE_RES || otyp === O.WAN_FIRE)
        return false;

    return ((omat <= O.WOOD && omat !== O.LIQUID) || omat === O.PLASTIC);
}

// C ref: mkobj.c is_rottable()
export function is_rottable(otmp) {
    const otyp = otmp.otyp;

    return ((objects[otyp].oc_material <= O.WOOD
             && objects[otyp].oc_material !== O.LIQUID)
            || objects[otyp].oc_material === O.DRAGON_HIDE);
}

// C ref: objclass.h is_rustprone(), is_crackable(), is_corrodeable(),
// is_damageable()
function is_rustprone(otmp) { return objects[otmp.otyp].oc_material === O.IRON; }
function is_crackable(otmp) {
    return (objects[otmp.otyp].oc_material === O.GLASS
            && otmp.oclass === ARMOR_CLASS); /* erosion_matters() */
}
function is_corrodeable(otmp) {
    return (objects[otmp.otyp].oc_material === O.COPPER
            || objects[otmp.otyp].oc_material === O.IRON);
}
function is_damageable(otmp) {
    return (is_rustprone(otmp) || is_flammable(otmp)
            || is_rottable(otmp) || is_corrodeable(otmp)
            || is_crackable(otmp));
}

// C ref: objnam.c erosion_matters()
function erosion_matters(obj) {
    switch (obj.oclass) {
    case TOOL_CLASS:
        return is_weptool(obj) ? true : false;
    case WEAPON_CLASS:
    case ARMOR_CLASS:
    case BALL_CLASS:
    case CHAIN_CLASS:
        return true;
    default:
        break;
    }
    return false;
}

// C ref: mkobj.c next_ident()
export function next_ident() {
    if (!game.context) game.context = {};
    if (game.context.ident === undefined)
        game.context.ident = 2; /* allmain.c: id 1 is reserved for gy.youmonst */
    const res = game.context.ident;

    /* +rnd(2): originally just +1; changed to rnd() to avoid potential
       exploit of player using #adjust to split an object stack in a manner
       that makes most recent ident%2 known */
    game.context.ident += rnd(2); /* ready for next new object or monster */

    /* if ident has wrapped to 0, force it to be non-zero */
    if (!game.context.ident)
        game.context.ident = rnd(2) + 1; /* id 1 is reserved */

    return res;
}

// C ref: mkobj.c may_generate_eroded()
/* can object be generated eroded? */
function may_generate_eroded(otmp) {
    /* initial hero inventory */
    if ((game.moves || 0) <= 1 && !game.in_mklev)
        return false;
    /* already erodeproof or cannot be eroded */
    if (otmp.oerodeproof || !erosion_matters(otmp) || !is_damageable(otmp))
        return false;
    /* part of a monster's body and produced when it dies */
    if (otmp.otyp === O.WORM_TOOTH || otmp.otyp === O.UNICORN_HORN)
        return false;
    /* artifacts cannot be generated eroded  */
    if (otmp.oartifact)
        return false;
    return true;
}

// C ref: mkobj.c mkobj_erosions()
/* random chance of applying erosions/grease to object */
function mkobj_erosions(otmp) {
    if (may_generate_eroded(otmp)) {
        /* A small fraction of non-artifact items will generate eroded or
         * possibly erodeproof. An item that generates eroded will never be
         * erodeproof, and vice versa. */
        if (!rn2(100)) {
            otmp.oerodeproof = 1;
        } else {
            if (!rn2(80) && (is_flammable(otmp) || is_rustprone(otmp)
                             || is_crackable(otmp))) {
                do {
                    otmp.oeroded++;
                } while (otmp.oeroded < 3 && !rn2(9));
            }
            if (!rn2(80) && (is_rottable(otmp) || is_corrodeable(otmp))) {
                do {
                    otmp.oeroded2++;
                } while (otmp.oeroded2 < 3 && !rn2(9));
            }
        }
        /* and an extremely small fraction of the time, erodable items
         * will generate greased */
        if (!rn2(1000))
            otmp.greased = 1;
    }
}

// C ref: mkobj.c mkobj_at()
/* make a random object of class 'let' at a specific location;
   'let' might be random class; place_object() will validate <x,y> */
export function mkobj_at(let_, x, y, artif) {
    const otmp = mkobj(let_, artif);
    place_object(otmp, x, y);
    return otmp;
}

// C ref: mkobj.c mksobj_at()
export function mksobj_at(otyp, x, y, init, artif) {
    const otmp = mksobj(otyp, init, artif);
    place_object(otmp, x, y);
    return otmp;
}

// C ref: mkobj.c place_object() — the floor object lists are not ported
// yet; the location is recorded on the object.
function place_object(otmp, x, y) {
    otmp.ox = x;
    otmp.oy = y;
    otmp.where = 'OBJ_FLOOR';
}

// C ref: o_init.c rnd_class() — not ported yet (spellbooks only)
function rnd_class(first, last) {
    let i, x, sum = 0;

    if (last > first) {
        for (i = first; i <= last; i++)
            sum += objects[i].oc_prob;
        if (!sum) /* all zero, so equal probability */
            return rn1(last - first + 1, first);

        x = rnd(sum);
        for (i = first; i <= last; i++)
            if ((x -= objects[i].oc_prob) <= 0)
                return i;
    }
    return (first === last) ? first : O.STRANGE_OBJECT;
}

// C ref: mkobj.c mkobj()
/* mkobj(): select a type of item from a class, use mksobj() to create it;
   result is always non-Null */
export function mkobj(oclass, artif) {
    let tprob, i, prob;

    if (oclass === RANDOM_CLASS) {
        const iprobs = Is_rogue_level(game.u.uz) ? rogueprobs
                       : In_hell(game.u.uz) ? hellprobs : mkobjprobs;
        let k = 0;

        for (tprob = rnd(100); (tprob -= iprobs[k][0]) > 0; k++)
            continue;
        oclass = iprobs[k][1];
    }

    if (oclass === SPBOOK_no_NOVEL) {
        i = rnd_class(game.bases[SPBOOK_CLASS], O.SPE_BLANK_PAPER);
        oclass = SPBOOK_CLASS; /* for sanity check below */
    } else {
        prob = rnd(game.oclass_prob_totals[oclass]);
        i = game.bases[oclass];
        while ((prob -= objects[i].oc_prob) > 0)
            ++i;
    }

    if (objects[i].oc_class !== oclass || !O.OBJ_NAME(objects[i])) {
        impossible(`probtype error, oclass=${oclass} i=${i}`);
        i = game.bases[oclass];
    }

    return mksobj(i, true, artif);
}

// C ref: mkobj.c bless() — the light-source and inventory updates are not
// needed during level creation
export function bless(otmp) {
    otmp.cursed = 0;
    otmp.blessed = 1;
}

// C ref: mkobj.c curse()
export function curse(otmp) {
    otmp.blessed = 0;
    otmp.cursed = 1;
}

// C ref: mkobj.c blessorcurse()
export function blessorcurse(otmp, chance) {
    if (otmp.blessed || otmp.cursed)
        return;

    if (!rn2(chance)) {
        if (!rn2(2)) {
            curse(otmp);
        } else {
            bless(otmp);
        }
    }
}

// C ref: mkobj.c bcsign()
export function bcsign(otmp) {
    return (!!otmp.blessed - !!otmp.cursed);
}

// C ref: artifact.c nartifact_exist() — no artifacts exist yet
function nartifact_exist() {
    return game.nartifacts_made || 0;
}

function not_ported(what) {
    impossible(`mksobj_init: ${what} is not ported yet`);
}

// C ref: mkobj.c mksobj_init()
function mksobj_init(otmp, artif) {
    const let_ = objects[otmp.otyp].oc_class;

    switch (let_) {
    case WEAPON_CLASS:
        otmp.quan = is_multigen(otmp) ? rn1(6, 6) : 1;
        if (!rn2(11)) {
            otmp.spe = rne(3);
            otmp.blessed = rn2(2);
        } else if (!rn2(10)) {
            curse(otmp);
            otmp.spe = -rne(3);
        } else
            blessorcurse(otmp, 10);
        if (is_poisonable(otmp) && !rn2(100))
            otmp.opoisoned = 1;

        if (artif && !rn2(20 + (10 * nartifact_exist()))) {
            /* mk_artifact() with otmp and A_NONE will never return NULL */
            not_ported('mk_artifact()');
        }
        break;
    case FOOD_CLASS:
        otmp.oeaten = 0;
        switch (otmp.otyp) {
        case O.CORPSE:
            not_ported('corpse monster type (rndmonnum)');
            break;
        case O.EGG:
            otmp.corpsenm = -1; /* NON_PM: generic egg */
            if (!rn2(3))
                not_ported('egg monster type (rndmonnum)');
            break;
        case O.TIN:
            otmp.corpsenm = -1; /* empty (so far) */
            if (!rn2(6))
                otmp.spe = 1; /* set_tin_variety(otmp, SPINACH_TIN) */
            else
                not_ported('tin monster type (rndmonnum)');
            blessorcurse(otmp, 10);
            break;
        case O.SLIME_MOLD:
            otmp.spe = game.context?.current_fruit || 0;
            break;
        case O.KELP_FROND:
            otmp.quan = rnd(2);
            break;
        case O.CANDY_BAR:
            not_ported('assign_candy_wrapper()');
            break;
        default:
            break;
        }
        if (Is_pudding(otmp)) {
            otmp.globby = 1;
            otmp.quan = 1;
            otmp.owt = objects[otmp.otyp].oc_weight;
            otmp.known = otmp.dknown = 1;
            /* start_glob_timeout(): no timers yet */
        } else {
            if (otmp.otyp !== O.CORPSE && otmp.otyp !== O.MEAT_RING
                && otmp.otyp !== O.KELP_FROND && !rn2(6)) {
                otmp.quan = 2;
            }
        }
        break;
    case GEM_CLASS:
        otmp.corpsenm = 0; /* LOADSTONE hack */
        if (otmp.otyp === O.LOADSTONE)
            curse(otmp);
        else if (otmp.otyp === O.ROCK)
            otmp.quan = rn1(6, 6);
        else if (otmp.otyp !== O.LUCKSTONE && !rn2(6))
            otmp.quan = 2;
        else
            otmp.quan = 1;
        break;
    case TOOL_CLASS:
        switch (otmp.otyp) {
        case O.TALLOW_CANDLE:
        case O.WAX_CANDLE:
            otmp.spe = 1;
            otmp.age = 20 * objects[otmp.otyp].oc_cost; /* 400 or 200 */
            otmp.lamplit = 0;
            otmp.quan = 1 + (rn2(2) ? rn2(7) : 0);
            blessorcurse(otmp, 5);
            break;
        case O.BRASS_LANTERN:
        case O.OIL_LAMP:
            otmp.spe = 1;
            otmp.age = rn1(500, 1000);
            otmp.lamplit = 0;
            blessorcurse(otmp, 5);
            break;
        case O.MAGIC_LAMP:
            otmp.spe = 1;
            otmp.lamplit = 0;
            blessorcurse(otmp, 2);
            break;
        case O.CHEST:
        case O.LARGE_BOX:
            otmp.olocked = !!(rn2(5));
            otmp.otrapped = !(rn2(10));
            otmp.tknown = otmp.otrapped && !rn2(100); /* obvious trap */
            not_ported('mkbox_cnts()');
            break;
        case O.ICE_BOX:
        case O.SACK:
        case O.OILSKIN_SACK:
        case O.BAG_OF_HOLDING:
            not_ported('mkbox_cnts()');
            break;
        case O.EXPENSIVE_CAMERA:
        case O.TINNING_KIT:
        case O.MAGIC_MARKER:
            otmp.spe = rn1(70, 30);
            break;
        case O.CAN_OF_GREASE:
            otmp.spe = rn1(21, 5); /* 0..20 + 5 => 5..25 */
            blessorcurse(otmp, 10);
            break;
        case O.CRYSTAL_BALL:
            otmp.spe = rn1(5, 3); /* 0..4 + 3 => 3..7 */
            blessorcurse(otmp, 2);
            break;
        case O.HORN_OF_PLENTY:
        case O.BAG_OF_TRICKS:
            otmp.spe = rn1(18, 3); /* 0..17 + 3 => 3..20 */
            break;
        case O.FIGURINE:
            not_ported('figurine monster type (rndmonnum_adj)');
            blessorcurse(otmp, 4);
            break;
        case O.BELL_OF_OPENING:
            otmp.spe = 3;
            break;
        case O.MAGIC_FLUTE:
        case O.MAGIC_HARP:
        case O.FROST_HORN:
        case O.FIRE_HORN:
        case O.DRUM_OF_EARTHQUAKE:
            otmp.spe = rn1(5, 4);
            break;
        }
        break;
    case AMULET_CLASS:
        if (otmp.otyp === O.AMULET_OF_YENDOR)
            game.context.made_amulet = true;
        if (rn2(10) && (otmp.otyp === O.AMULET_OF_STRANGULATION
                        || otmp.otyp === O.AMULET_OF_CHANGE
                        || otmp.otyp === O.AMULET_OF_RESTFUL_SLEEP)) {
            curse(otmp);
        } else
            blessorcurse(otmp, 10);
        break;
    case VENOM_CLASS:
    case CHAIN_CLASS:
    case BALL_CLASS:
        break;
    case POTION_CLASS: /* note: potions get some additional init below */
    case SCROLL_CLASS:
        /* SCR_MAIL exists only with MAIL_STRUCTURES, which this build
           does not define */
        blessorcurse(otmp, 4);
        break;
    case SPBOOK_CLASS:
        otmp.spestudied = 0;
        blessorcurse(otmp, 17);
        break;
    case ARMOR_CLASS:
        if (rn2(10)
            && (otmp.otyp === O.FUMBLE_BOOTS
                || otmp.otyp === O.LEVITATION_BOOTS
                || otmp.otyp === O.HELM_OF_OPPOSITE_ALIGNMENT
                || otmp.otyp === O.GAUNTLETS_OF_FUMBLING || !rn2(11))) {
            curse(otmp);
            otmp.spe = -rne(3);
        } else if (!rn2(10)) {
            otmp.blessed = rn2(2);
            otmp.spe = rne(3);
        } else
            blessorcurse(otmp, 10);
        if (artif && !rn2(40 + (10 * nartifact_exist()))) {
            /* mk_artifact() with otmp and A_NONE will never return NULL */
            not_ported('mk_artifact()');
        }
        /* simulate lacquered armor for samurai: Role_if(PM_SAMURAI) is
           checked by role code that is not wired here yet */
        break;
    case WAND_CLASS:
        if (otmp.otyp === O.WAN_WISHING)
            otmp.spe = 1;
        else if (otmp.otyp === O.WAN_STASIS)
            /* just as easy to recharge as other NODIR wands, but starts with
               fewer charges */
            otmp.spe = rn1(4, 3);
        else
            otmp.spe = rn1(5,
                           (objects[otmp.otyp].oc_dir === O.NODIR) ? 11 : 4);
        blessorcurse(otmp, 17);
        otmp.recharged = 0; /* used to control recharging */
        break;
    case RING_CLASS:
        if (objects[otmp.otyp].oc_charged) {
            blessorcurse(otmp, 3);
            if (rn2(10)) {
                if (rn2(10) && bcsign(otmp))
                    otmp.spe = bcsign(otmp) * rne(3);
                else
                    otmp.spe = rn2(2) ? rne(3) : -rne(3);
            }
            /* make useless +0 rings much less common */
            if (otmp.spe === 0)
                otmp.spe = rn2(4) - rn2(3);
            /* negative rings are usually cursed */
            if (otmp.spe < 0 && rn2(5))
                curse(otmp);
        } else if (rn2(10) && (otmp.otyp === O.RIN_TELEPORTATION
                               || otmp.otyp === O.RIN_POLYMORPH
                               || otmp.otyp === O.RIN_AGGRAVATE_MONSTER
                               || otmp.otyp === O.RIN_HUNGER || !rn2(9))) {
            curse(otmp);
        }
        break;
    case ROCK_CLASS:
        if (otmp.otyp === O.STATUE) {
            not_ported('statue monster type (rndmonnum)');
        }
        /* boulder init'd below in the 'regardless of !init' code */
        break;
    case COIN_CLASS:
        break; /* do nothing */
    default:
        impossible(`mksobj tried to make type ${otmp.otyp}, class ${objects[otmp.otyp].oc_class}.`);
    }

    mkobj_erosions(otmp);
    if (permapoisoned(otmp))
        otmp.opoisoned = 1;
}

// C ref: mkobj.c mksobj()
/* mksobj(): create a specific type of object; result is always non-Null */
export function mksobj(otyp, init, artif) {
    const let_ = objects[otyp].oc_class;
    const otmp = {
        age: Math.max(game.moves || 0, 1),
        o_id: next_ident(),
        quan: 1,
        oclass: let_,
        otyp,
        where: 'OBJ_FREE',
        corpsenm: -1, /* NON_PM */
        spe: 0, blessed: 0, cursed: 0, oeroded: 0, oeroded2: 0,
        oerodeproof: 0, greased: 0, oartifact: 0, owt: 0,
    };

    if (init)
        mksobj_init(otmp, artif);

    /* some things must get done (corpsenm, timers) even if init = 0 */
    switch ((otmp.oclass === POTION_CLASS && otmp.otyp !== O.POT_OIL)
            ? O.POT_WATER : otmp.otyp) {
    case O.CORPSE:
    case O.STATUE:
    case O.FIGURINE:
        if (otmp.corpsenm === -1)
            not_ported('rndmonnum() for corpses, statues and figurines');
        break;
    case O.BOULDER:
        otmp.next_boulder = 0;
        break;
    case O.POT_OIL:
        otmp.age = 400; /* MAX_OIL_IN_FLASK: amount of oil */
        otmp.fromsink = 0;
        break;
    case O.POT_WATER: /* POTION_CLASS */
        otmp.fromsink = 0; /* overloads corpsenm, which was set to NON_PM */
        break;
    case O.LEASH:
        otmp.leashmon = 0; /* overloads corpsenm, which was set to NON_PM */
        break;
    case O.SPE_NOVEL:
        otmp.novelidx = -1;
        not_ported('noveltitle()');
        break;
    }

    /* unique objects may have an associated artifact entry */
    if (objects[otyp].oc_unique && !otmp.oartifact) {
        not_ported('mk_artifact() for unique objects');
    }
    otmp.owt = objects[otyp].oc_weight; /* weight(otmp) */
    return otmp;
}

// C ref: mkobj.c mkgold()
export function mkgold(amount, x, y) {
    /* g_at(x, y): floor objects are not tracked yet; mklev.js recorded
       gold amounts per location in game.level.gold_at */
    if (!game.level.gold_at) game.level.gold_at = new Map();
    const key = `${x},${y}`;
    let gold = game.level.gold_at.get(key) || null;

    if (amount <= 0) {
        const mul = rnd(Math.trunc(30 / Math.max(12 - depth(game.u.uz), 2)));

        amount = 1 + rnd(level_difficulty() + 2) * mul;
    }
    if (gold) {
        gold.quan += amount;
    } else {
        gold = mksobj_at(O.GOLD_PIECE, x, y, true, false);
        gold.quan = amount;
        game.level.gold_at.set(key, gold);
    }
    gold.owt = objects[O.GOLD_PIECE].oc_weight; /* weight(gold) */
    return gold;
}
