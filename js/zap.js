// zap.js -- zapping wands.
// C ref: zap.c
//
// Ported so far: the #zap command (dozap(), zap_ok(), zappable(),
// backfire()), learnwand(), zapyourself() (the cases sessions reach),
// zapnodir() (subset), zapsetup()/zapwrapup(), weffects() (IMMEDIATE
// wands go through bhit() in dothrow.js; rays and digging aren't ported
// yet).  For enlightenment: adtyp_to_prop(), u_adtyp_resistance_obj(),
// item_what().

import { game } from './gstate.js';
import { You, pline, pline_The, Blind, Hallucination } from './display.js';
import { getobj, useupall } from './invent.js';
import { check_capacity } from './hack.js';
import { rn2, rnd, rn1, d } from './rng.js';
import { getdir } from './cmd.js';
import { exercise } from './attrib.js';
import { losehp, Maybe_Half_Phys } from './trap.js';
import { more_experienced } from './exper.js';
import { observe_object, discover_object } from './o_init.js';
import { The, xname, Tobjnam } from './objnam.js';
import { fall_asleep } from './timeout.js';
import { monstseesu, monstunseesu } from './uhitm.js';
import { bhit } from './dothrow.js';
import { GETOBJ_SUGGEST, GETOBJ_EXCLUDE, GETOBJ_NOFLAGS, ECMD_OK,
         ECMD_CANCEL, ECMD_TIME, WAND_BACKFIRE_CHANCE, WAND_WREST_CHANCE,
         A_STR, A_WIS, KILLED_BY_AN, SLEEP_RES, M_SEEN_SLEEP,
         ZAPPED_WAND } from './const.js';
import { objects, WAND_CLASS, SPBOOK_CLASS, DWARVISH_CLOAK, NODIR, IMMEDIATE,
         WAN_SLEEP, SPE_SLEEP, WAN_NOTHING, WAN_OPENING, WAN_LOCKING,
         WAN_STASIS, WAN_CREATE_MONSTER, WAN_WISHING, WAN_ENLIGHTENMENT,
         WAN_LIGHT, WAN_SECRET_DOOR_DETECTION, WAN_DIGGING, SPE_DIG,
         WAN_MAGIC_MISSILE, WAN_LIGHTNING, SPE_MAGIC_MISSILE,
         SPE_FINGER_OF_DEATH, SPE_FORCE_BOLT, WAN_STRIKING, BOULDER,
         WAN_CANCELLATION, SPE_CANCELLATION, SPE_KNOCK, SPE_WIZARD_LOCK,
         WAN_PROBING } from './objects.js';
import { PIT, SPIKED_PIT, STATUE_TRAP, HEADSTONE, DOOR, DBWALL,
         DB_DIR, DB_NORTH, DB_SOUTH, DB_EAST, DB_WEST, IS_DRAWBRIDGE,
         isok } from './const.js';
import { t_at } from './trap.js';
import { sobj_at } from './makemon.js';
import { engr_at } from './engrave.js';
import { M1_NOHANDS, M1_CONCEAL, AD_COLD, AD_FIRE, AD_ELEC, AD_ACID,
         AD_DISN } from './monsters.js';
import {
    COLD_RES, FIRE_RES, SHOCK_RES, ACID_RES, DISINT_RES, W_ARMOR, W_ACCESSORY,
    W_WEP, W_ART, W_ARMC, W_ARM, W_ARMU, W_ARMH, W_ARMG, W_ARMF, W_ARMS,
    W_AMUL, W_TOOL, W_RING, W_RINGL,
} from './const.js';
import {
    cloak_simple_name, suit_simple_name, shirt_simple_name, helm_simple_name,
    gloves_simple_name, boots_simple_name, shield_simple_name, simpleonames,
} from './iactions.js';

/* C ref: mondata.h nohands() */
function nohands(ptr) { return (ptr.mflags1 & M1_NOHANDS) !== 0; }

// C ref: zap.c learnwand()
export function learnwand(obj) {
    /* For a wand (or wand-like tool) zapped by the player, if the
       effect was observable (determined by caller; usually seen, but
       possibly heard or felt if the hero is blinded) then discover the
       object type provided that the object itself is known (as more
       than just "a wand").  If object type is already discovered and
       we observed the effect, mark the individual wand as having been
       seen.  Suppress spells (which use fake spellbook object for `obj')
       so that casting a spell won't re-discover its forgotten book. */
    if (obj.oclass !== SPBOOK_CLASS) {
        /* if type already discovered, treat this item has having been seen
           even if hero is currently blinded (skips redundant makeknown) */
        if (objects[obj.otyp].oc_name_known) {
            observe_object(obj, Hallucination()); /* will usually be dknown already */

        /* otherwise discover it if item itself has been or can be seen */
        } else {
            /* in case it was picked up while blind and then zapped without
               examining inventory after regaining sight (bypassing xname) */
            if (!Blind())
                observe_object(obj, Hallucination());
            /* make the discovery iff we know what we're manipulating */
            if (obj.dknown)
                discover_object(obj.otyp, true, true, true); /* makeknown() */
        }
        /* update_inventory(): no perm_invent */
    }
}

// C ref: zap.c bhitm() -- monster mtmp was hit by the effect of wand or
// spell otmp
export async function bhitm(mtmp, otmp) {
    void mtmp;
    throw new Error(`bhitm(): wand/spell ${otmp.otyp} hitting a monster not ported yet`);
}

// C ref: zap.c bhito() -- object obj was hit by the effect of the wand
// or spell otmp
export async function bhito(obj, otmp) {
    void obj;
    throw new Error(`bhito(): wand/spell ${otmp.otyp} hitting an object not ported yet`);
}

// C ref: zap.c bhitpile()
export async function bhitpile(
    obj,          /* wand or fake spellbook for type of zap */
    fhito,        /* callback for each object being hit */
    tx, ty,       /* target location */
    zz) {         /* direction for up/down zaps */
    const g = game;
    const u = g.u;
    let otmp;
    let first;
    let hitanything = 0;
    /* svl.level.objects[tx][ty] chain, top of the pile first */
    const pile_at = () => (g.level.objects || []).filter(o => o.ox === tx
                                                         && o.oy === ty);

    if (!pile_at().length)
        return 0;

    /* if hiding underneath an object and zapping up or down, the top item
       is either the only thing hit (up) or is skipped (down) */
    const hidingunder = (zz !== 0 && u.uundetected
                         && (g.youmonst.data.mflags1 & M1_CONCEAL) !== 0);
    first = true;

    if (obj.otyp === SPE_FORCE_BOLT || obj.otyp === WAN_STRIKING) {
        const t = t_at(tx, ty);
        if (t && t.ttyp === STATUE_TRAP)
            throw new Error('bhitpile(): activate_statue_trap() not ported yet');
    }

    g.poly_zapped = -1;
    /* next_obj = otmp->nexthere is taken before each call, so iterate
       over a snapshot of the pile */
    for (otmp of pile_at()) {
        if (hidingunder) {
            if (first) {
                first = false; /* reset for next item */
                if (zz > 0) /* down when hiding-under skips first item */
                    continue;
            } else {
                /* !first */
                if (zz < 0) /* up when hiding-under skips rest of pile */
                    continue;
            }
        }
        if (otmp.where !== 'OBJ_FLOOR' || otmp.ox !== tx || otmp.oy !== ty)
            continue;
        hitanything += await fhito(otmp, obj);
    }

    if (g.poly_zapped >= 0)
        throw new Error('bhitpile(): create_polymon() not ported yet');

    /* when boulders are present they're expected to be on top; with
       multiple boulders it's possible for some to have been changed into
       non-boulders (polymorph, stone-to-flesh) while ones beneath resist,
       so re-stack pile if there are any non-boulders above boulders */
    let prevotyp = BOULDER;
    for (otmp of pile_at()) {
        if (otmp.otyp === BOULDER && prevotyp !== BOULDER)
            throw new Error('bhitpile(): recreate_pile_at() not ported yet');
        prevotyp = otmp.otyp;
    }

    if (hidingunder) /* pile might have been destroyed or dispersed */
        throw new Error('bhitpile(): maybe_unhide_at() not ported yet');

    /* fill_pit(tx, ty) */
    {
        const t = t_at(tx, ty);
        if (t && (t.ttyp === PIT || t.ttyp === SPIKED_PIT)
            && sobj_at(BOULDER, tx, ty))
            throw new Error('bhitpile(): fill_pit() not ported yet');
    }

    return hitanything;
}

// C ref: dbridge.c find_drawbridge() -- returns the drawbridge location
// (in *pos) for a drawbridge span or its wall, or null
function find_drawbridge(x, y) {
    const lev = (xx, yy) => game.level.at(xx, yy);

    if (IS_DRAWBRIDGE(lev(x, y).typ))
        return { x, y };
    /* is_drawbridge_wall() */
    if (lev(x, y).typ !== DOOR && lev(x, y).typ !== DBWALL)
        return null;
    const dbdir = (xx, yy) => (lev(xx, yy).drawbridgemask ?? 0) & DB_DIR;
    if (isok(x + 1, y) && IS_DRAWBRIDGE(lev(x + 1, y).typ)
        && dbdir(x + 1, y) === DB_WEST)
        return { x: x + 1, y };
    if (isok(x - 1, y) && IS_DRAWBRIDGE(lev(x - 1, y).typ)
        && dbdir(x - 1, y) === DB_EAST)
        return { x: x - 1, y };
    if (isok(x, y - 1) && IS_DRAWBRIDGE(lev(x, y - 1).typ)
        && dbdir(x, y - 1) === DB_SOUTH)
        return { x, y: y - 1 };
    if (isok(x, y + 1) && IS_DRAWBRIDGE(lev(x, y + 1).typ)
        && dbdir(x, y + 1) === DB_NORTH)
        return { x, y: y + 1 };
    return null;
}

// C ref: zap.c zap_map() -- occurs before hitting monsters or objects and
// handles wands or spells that don't dish out 'elemental' damage
export async function zap_map(x, y, obj) { /* zapped wand, or book for cast spell */
    const u = game.u;
    const ttmp = t_at(x, y);

    /* cancellation: maybe_explode_trap(ttmp, obj, &learn_it) */
    if (ttmp && (obj.otyp === WAN_CANCELLATION || obj.otyp === SPE_CANCELLATION))
        throw new Error('zap_map(): maybe_explode_trap() not ported yet');

    if (u.dz > 0) { /* zapping down */
        const e = engr_at(x, y);
        if (e && e.engr_type !== HEADSTONE)
            throw new Error('zap_map(): zapping down at an engraving not ported yet');
    } else if (!u.dz) {
        if (find_drawbridge(x, y)) {
            switch (obj.otyp) {
            case WAN_OPENING:
            case SPE_KNOCK:
            case WAN_LOCKING:
            case SPE_WIZARD_LOCK:
            case WAN_STRIKING:
            case SPE_FORCE_BOLT:
                throw new Error('zap_map(): zapping a drawbridge not ported yet');
            }
        } /* find_drawbridge */
    } /* !u.uz */

    if (obj.otyp === WAN_PROBING)
        throw new Error('zap_map(): probing (show_map_spot()) not ported yet');
    /* learn_it is only set by the unported cases above */
}

// C ref: zap.c zappable()
/*
 * zappable - returns 1 if zap is available, 0 otherwise.
 *            it removes a charge from the wand if zappable.
 * added by GAN 11/03/86
 */
export async function zappable(wand) {
    if (wand.spe < 0 || (wand.spe === 0 && rn2(WAND_WREST_CHANCE)))
        return 0;
    if (wand.spe === 0)
        await You("wrest one last charge from the worn-out wand.");
    wand.spe--;
    return 1;
}

// C ref: zap.c zapnodir()
/*
 * zapnodir - zaps a NODIR wand/spell.
 * Won't get here if wand has no charges (unless wresting 1 last charge).
 */
export async function zapnodir(obj) {
    const known = false;

    switch (obj.otyp) {
    case WAN_LIGHT:
        throw new Error('zapnodir(): wand of light (litroom()) not ported yet');
    case WAN_SECRET_DOOR_DETECTION:
        throw new Error('zapnodir(): secret door detection (findit()) not ported yet');
    case WAN_STASIS: {
        const tmp_until = game.moves + rn1(21, 10);

        /* no immediately obvious effect, and no message so that it isn't
           distinguishable from other NODIR wands that produce no message;
           for multiple zaps, keep the longest duration rather than latest */
        if (tmp_until > (game.level.flags.stasis_until || 0))
            game.level.flags.stasis_until = tmp_until;
        break;
    }
    case WAN_CREATE_MONSTER:
        throw new Error('zapnodir(): wand of create monster (create_critters()) not ported yet');
    case WAN_WISHING:
        throw new Error('zapnodir(): wand of wishing (makewish()) not ported yet');
    case WAN_ENLIGHTENMENT:
        throw new Error('zapnodir(): wand of enlightenment not ported yet');
    default:
        break;
    }

    if (known) {
        if (!objects[obj.otyp].oc_name_known)
            more_experienced(0, 10);
        /* effect was observable; discover the wand type provided
           that the wand itself has been seen */
        learnwand(obj);
    }
}

// C ref: zap.c backfire()
async function backfire(otmp) {
    otmp.in_use = 1; /* in case losehp() is fatal */
    await pline(`${The(xname(otmp))} suddenly explodes!`);
    const dmg = d(otmp.spe + 2, 6);
    await losehp(Maybe_Half_Phys(dmg), "exploding wand", KILLED_BY_AN);
    useupall(otmp);
}

// C ref: zap.c zap_ok() -- getobj callback for object to zap
export function zap_ok(obj) {
    if (obj && obj.oclass === WAND_CLASS)
        return GETOBJ_SUGGEST;
    return GETOBJ_EXCLUDE;
}

// C ref: zap.c dozap() -- #zap command, 'z'
export async function dozap() {
    const g = game;
    const u = g.u;
    let obj, damage;

    if (nohands(g.youmonst.data)) {
        await You("aren't able to zap anything in your current form.");
        return ECMD_OK;
    }
    if (await check_capacity(null))
        return ECMD_OK;
    obj = await getobj("zap", zap_ok, GETOBJ_NOFLAGS);
    if (!obj)
        return ECMD_CANCEL;

    check_unpaid(obj);

    const need_dir = objects[obj.otyp].oc_dir !== NODIR;
    if (!(await zappable(obj))) {
        await pline("Nothing happens."); /* pline1(nothing_happens) */
    } else if (obj.cursed && !rn2(WAND_BACKFIRE_CHANCE)) {
        await backfire(obj); /* the wand blows up in your face! */
        exercise(A_STR, false);
        /* 'obj' is gone; skip update_inventory() because
           backfire() -> useupall() -> freeinv() did it */
        return ECMD_TIME;
    } else if (need_dir && !(await getdir(null))) {
        if (!Blind())
            await pline(`${The(xname(obj))} glows and fades.`);
        /* make him pay for knowing !NODIR */
    } else if (need_dir && !u.dx && !u.dy && !u.dz) {
        if ((damage = await zapyourself(obj, true)) !== 0) {
            /* Sprintf(buf, "zapped %sself with %s", uhim(), killer_xname(obj));
               losehp(Maybe_Half_Phys(damage), buf, NO_KILLER_PREFIX); */
            throw new Error('dozap(): self-zap damage (killer_xname()) not ported yet');
        }
    } else {
        /*      Are we having fun yet?
         * weffects -> buzz(obj->otyp) -> zhitm (temple priest) ->
         * attack -> hitum -> known_hitum -> ghod_hitsu ->
         * buzz(AD_ELEC) -> destroy_items(AD_ELEC) ->
         * useup -> obfree -> dealloc_obj -> free(obj)
         */
        g.current_wand = obj;
        await weffects(obj);
        obj = g.current_wand;
        g.current_wand = null;
    }
    if (obj && obj.spe < 0) {
        await pline(`${Tobjnam(obj, "turn")} to dust.`);
        useupall(obj); /* calls freeinv() -> update_inventory() */
    } /* else update_inventory(): no perm_invent; maybe used a charge */
    return ECMD_TIME;
}

// C ref: shk.c check_unpaid() -> check_unpaid_usage(otmp, FALSE)
function check_unpaid(otmp) {
    if (!otmp.unpaid || !game.u.ushops || !game.u.ushops[0]
        || (otmp.spe <= 0 && objects[otmp.otyp].oc_charged))
        return;
    throw new Error('check_unpaid(): usage fee for unpaid item not ported yet');
}

/* C ref: youprop.h Sleep_resistance */
function Sleep_resistance() {
    const p = game.u.uprops[SLEEP_RES];
    return !!(p.intrinsic || p.extrinsic);
}

// C ref: zap.c zapyourself() -- the cases sessions reach so far
export async function zapyourself(obj, ordinary) {
    let learn_it = false;
    const damage = 0;

    switch (obj.otyp) {
    case WAN_SLEEP:
    case SPE_SLEEP:
        learn_it = true;
        if (Sleep_resistance()) {
            /* shieldeff(u.ux, u.uy): transient display only */
            await You("don't feel sleepy!");
            monstseesu(M_SEEN_SLEEP);
        } else {
            if (ordinary)
                await pline_The("sleep ray hits you!");
            else
                await You("fall asleep!");
            monstunseesu(M_SEEN_SLEEP);
            await fall_asleep(-rnd(50), true);
        }
        break;

    case WAN_NOTHING:
        break;

    case WAN_OPENING:
    case WAN_LOCKING:
    default:
        throw new Error(`zapyourself(): object ${obj.otyp} self-zap not ported yet`);
    }
    /* if effect was observable then discover the wand type provided
       that the wand itself has been seen */
    if (learn_it)
        learnwand(obj);
    return damage;
}

// C ref: zap.c zapsetup() -- used by do_break_wand() was well as by weffects()
export function zapsetup() {
    game.obj_zapped = false;
}

// C ref: zap.c zapwrapup()
export async function zapwrapup() {
    /* if do_osshock() set obj_zapped while polying, give a message now */
    if (game.obj_zapped)
        await You("feel shuddering vibrations."); /* You_feel() */
    game.obj_zapped = false;
}

// C ref: zap.c weffects() -- called for various wand and spell effects
export async function weffects(obj) {
    const g = game;
    const u = g.u;
    const otyp = obj.otyp;
    const disclose = false;
    const was_unkn = !objects[otyp].oc_name_known;

    exercise(A_WIS, true);
    if (u.usteed && (objects[otyp].oc_dir !== NODIR) && !u.dx && !u.dy
        && (u.dz > 0)) {
        throw new Error('weffects(): zap_steed() not ported yet');
    } else if (objects[otyp].oc_dir === IMMEDIATE) {
        zapsetup(); /* reset obj_zapped */
        if (u.uswallow) {
            throw new Error('weffects(): bhitm() on engulfer not ported yet');
        } else if (u.dz) {
            throw new Error('weffects(): zap_updown() not ported yet');
        } else {
            const pobj = { obj };
            await bhit(u.dx, u.dy, rn1(8, 6), ZAPPED_WAND, bhitm, bhito, pobj);
            obj = pobj.obj;
        }
        await zapwrapup(); /* give feedback for obj_zapped */

    } else if (objects[otyp].oc_dir === NODIR) {
        await zapnodir(obj);

    } else {
        /* neither immediate nor directionless */

        if (otyp === WAN_DIGGING || otyp === SPE_DIG)
            throw new Error('weffects(): zap_dig() not ported yet');
        else if (otyp >= SPE_MAGIC_MISSILE && otyp <= SPE_FINGER_OF_DEATH)
            throw new Error('weffects(): ubuzz() for spells not ported yet');
        else if (otyp >= WAN_MAGIC_MISSILE && otyp <= WAN_LIGHTNING)
            throw new Error('weffects(): ubuzz() (rays: buzz()/dobuzz()) not ported yet');
        else
            throw new Error('weffects: unexpected spell or wand'); /* impossible() */
    }
    if (disclose) {
        learnwand(obj);
        if (was_unkn)
            more_experienced(0, 10);
    }
}

// C ref: zap.c adtyp_to_prop()
/* convert attack damage AD_foo to property resistance */
function adtyp_to_prop(dmgtyp) {
    switch (dmgtyp) {
    case AD_COLD:
        return COLD_RES;
    case AD_FIRE:
        return FIRE_RES;
    case AD_ELEC:
        return SHOCK_RES;
    case AD_ACID:
        return ACID_RES;
    case AD_DISN:
        return DISINT_RES;
    default:
        break;
    }
    return 0; /* prop_types start at 1 */
}

// C ref: zap.c u_adtyp_resistance_obj()
/* Is hero wearing or wielding an object with resistance to attack
   damage type? Returns the percentage protection that the object gives. */
export function u_adtyp_resistance_obj(dmgtyp) {
    const prop = adtyp_to_prop(dmgtyp);

    if (!prop)
        return 0;

    /* FIXME? these percentages (99 and 90) seem too high... */

    /* items that give an extrinsic resistance when worn or wielded or
       carried give 99% protection to your items */
    if ((game.u.uprops[prop].extrinsic & (W_ARMOR | W_ACCESSORY | W_WEP | W_ART))
        !== 0)
        return 99;

    /* worn dwarvish cloaks give 90% protection against heat and cold to
       carried items */
    if (game.uarmc && game.uarmc.otyp === DWARVISH_CLOAK
        && (dmgtyp === AD_COLD || dmgtyp === AD_FIRE))
        return 90;

    return 0;
}

// C ref: zap.c item_what()
/* for enlightenment; currently only useful in wizard mode; cf from_what() */
export function item_what(dmgtyp) {
    let whatbuf = "";
    let what = null;
    const prop = adtyp_to_prop(dmgtyp);
    const xtrinsic = game.u.uprops[prop].extrinsic;

    if (game.flags.debug) { /* wizard */
        if (!prop || !xtrinsic) {
            ; /* 'what' stays Null */
        } else if (xtrinsic & W_ARMC) {
            what = cloak_simple_name(game.uarmc);
        } else if (xtrinsic & W_ARM) {
            what = suit_simple_name(game.uarm); /* "dragon {scales,mail}" */
        } else if (xtrinsic & W_ARMU) {
            what = shirt_simple_name(game.uarmu);
        } else if (xtrinsic & W_ARMH) {
            what = helm_simple_name(game.uarmh);
        } else if (xtrinsic & W_ARMG) {
            what = gloves_simple_name(game.uarmg);
        } else if (xtrinsic & W_ARMF) {
            what = boots_simple_name(game.uarmf);
        } else if (xtrinsic & W_ARMS) {
            what = shield_simple_name(game.uarms);
        } else if (xtrinsic & (W_AMUL | W_TOOL)) {
            what = simpleonames((xtrinsic & W_AMUL) ? game.uamul : game.ublindf);
        } else if (xtrinsic & W_RING) {
            if ((xtrinsic & W_RING) === W_RING) /* both */
                what = "rings";
            else
                what = simpleonames((xtrinsic & W_RINGL) ? game.uleft : game.uright);
        } else if (xtrinsic & W_WEP) {
            what = simpleonames(game.uwep);
        }
        /* format the output to be ready for enl_msg() to append it to
           "Your items {are,were} protected against <damage-type>" */
        if (what) /* strlen(what) will be less than 30 */
            whatbuf = ` by your ${what.slice(0, 40)}`;
    }
    return whatbuf;
}

// C ref: zap.c exclam()
export function exclam(force) {
    /* force == 0 occurs e.g. with sleep ray */
    /* note that large force is usual with wands so that !! would
            require information about hand/weapon/wand */
    return (force < 0) ? "?" : (force <= 4) ? "." : "!";
}
