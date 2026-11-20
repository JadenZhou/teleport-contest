// wield.js -- wielding weapons.
// C ref: wield.c
//
// Ported so far: welded() with its will_weld()/erodeable_wep() macros,
// obj.h is_weptool()/bimanual(), and engrave.c freehand().

import { game } from './gstate.js';
import { P_NONE, P_BOW, P_CROSSBOW, P_DART, P_BOOMERANG, P_POLEARMS, P_LANCE,
         W_WEP, W_SWAPWEP, W_QUIVER } from './const.js';
import { objects, WEAPON_CLASS, TOOL_CLASS, GEM_CLASS, TIN_OPENER,
         HEAVY_IRON_BALL, IRON_CHAIN, TOWEL, CORPSE, AKLYS, SILVER } from './objects.js';
import { ECMD_OK, ECMD_TIME, ECMD_FAIL } from './const.js';
import { M1_NOHANDS, M2_DEMON, M2_WERE, S_IMP, S_VAMPIRE, MZ_SMALL, mons,
         PM_SHADE, PM_TENGU } from './monsters.js';
import { pline, You } from './display.js';
import { prinv } from './invent.js';

// C ref: obj.h is_weptool()
export function is_weptool(o) {
    return o.oclass === TOOL_CLASS && objects[o.otyp].oc_skill !== P_NONE;
}

// C ref: obj.h bimanual()
export function bimanual(otmp) {
    return ((otmp.oclass === WEAPON_CLASS || otmp.oclass === TOOL_CLASS)
            && !!objects[otmp.otyp].oc_bimanual);
}

// C ref: obj.h is_launcher(), is_ammo(), matching_launcher(),
// ammo_and_launcher(), is_missile(), is_pole(), is_wet_towel()
export function is_launcher(otmp) {
    return (otmp.oclass === WEAPON_CLASS && objects[otmp.otyp].oc_skill >= P_BOW
            && objects[otmp.otyp].oc_skill <= P_CROSSBOW);
}
export function is_ammo(otmp) {
    return ((otmp.oclass === WEAPON_CLASS || otmp.oclass === GEM_CLASS)
            && objects[otmp.otyp].oc_skill >= -P_CROSSBOW
            && objects[otmp.otyp].oc_skill <= -P_BOW);
}
export function matching_launcher(a, l) {
    return !!(l && objects[a.otyp].oc_skill === -objects[l.otyp].oc_skill);
}
export function ammo_and_launcher(a, l) {
    return is_ammo(a) && matching_launcher(a, l);
}
export function is_missile(otmp) {
    return ((otmp.oclass === WEAPON_CLASS || otmp.oclass === TOOL_CLASS)
            && objects[otmp.otyp].oc_skill >= -P_BOOMERANG
            && objects[otmp.otyp].oc_skill <= -P_DART);
}
export function is_pole(otmp) {
    /* is_art(otmp, ART_SNICKERSNEE): artifacts aren't ported here yet */
    return ((otmp.oclass === WEAPON_CLASS || otmp.oclass === TOOL_CLASS)
            && (objects[otmp.otyp].oc_skill === P_POLEARMS
                || objects[otmp.otyp].oc_skill === P_LANCE));
}
export function is_wet_towel(o) { return o.otyp === TOWEL && o.spe > 0; }

// C ref: worn.c setworn() -- the weapon slots (W_WEP, W_SWAPWEP,
// W_QUIVER); armor and accessories aren't handled here yet
const weapon_slots = [
    { w_mask: W_WEP, w_obj: 'uwep' },
    { w_mask: W_SWAPWEP, w_obj: 'uswapwep' },
    { w_mask: W_QUIVER, w_obj: 'uquiver' },
];
export function setworn(obj, mask) {
    if (mask & ~(W_WEP | W_SWAPWEP | W_QUIVER))
        throw new Error('setworn(): armor/accessory slots not ported yet');
    for (const wp of weapon_slots) {
        if (wp.w_mask & mask) {
            const oobj = game[wp.w_obj];
            if (oobj) {
                if (game.u.twoweap && (oobj.owornmask & (W_WEP | W_SWAPWEP)))
                    game.u.twoweap = false; /* set_twoweap(FALSE) */
                oobj.owornmask &= ~wp.w_mask;
                if (wp.w_mask & ~(W_SWAPWEP | W_QUIVER)) {
                    const p = objects[oobj.otyp].oc_oprop;
                    if (p)
                        throw new Error('setworn(): extrinsic-granting weapon not ported yet');
                    if (oobj.oartifact)
                        throw new Error('setworn(): set_artifact_intrinsic() not ported yet');
                }
                /* cancel_doff(): no armor removal in progress for weapons */
            }
            game[wp.w_obj] = obj;
            if (obj) {
                obj.owornmask = (obj.owornmask || 0) | wp.w_mask;
                if (wp.w_mask & ~(W_SWAPWEP | W_QUIVER)) {
                    if (obj.oclass === WEAPON_CLASS || is_weptool(obj)
                        || mask !== W_WEP) {
                        const p = objects[obj.otyp].oc_oprop;
                        if (p)
                            throw new Error('setworn(): extrinsic-granting weapon not ported yet');
                    }
                    if (obj.oartifact)
                        throw new Error('setworn(): set_artifact_intrinsic() not ported yet');
                }
            }
        }
    }
    /* update_inventory(): no perm_invent */
}

// C ref: wield.c setuwep()
export function setuwep(obj) {
    const olduwep = game.uwep;

    if (obj === game.uwep)
        return; /* necessary to not set gu.unweapon */
    setworn(obj, W_WEP);
    /* Ogresmasher/Sunsword handling: setworn() refuses artifacts so far */
    void olduwep;
    if (obj) {
        game.unweapon = (obj.oclass === WEAPON_CLASS)
            ? is_launcher(obj) || is_ammo(obj) || is_missile(obj)
              || (is_pole(obj) && !game.u.usteed)
            : !is_weptool(obj) && !is_wet_towel(obj);
    } else
        game.unweapon = true; /* for "bare hands" message */
}

// C ref: wield.c setuqwep()
export function setuqwep(obj) {
    setworn(obj, W_QUIVER);
}

// C ref: wield.c setuswapwep()
export function setuswapwep(obj) {
    setworn(obj, W_SWAPWEP);
}

/* C ref: mondata.h cantwield() */
function cantwield(ptr) {
    return (nohands(ptr) || verysmall(ptr));
}
function nohands(ptr) { return (ptr.mflags1 & M1_NOHANDS) !== 0; }
function verysmall(ptr) { return ptr.msize < MZ_SMALL; }

// C ref: artifact.c retouch_object() -- only the hero-can-handle-it case
function retouch_object(wep) {
    if (wep.oartifact)
        throw new Error('retouch_object(): touch_artifact() not ported yet');
    if (objects[wep.otyp].oc_material === SILVER && Hate_silver())
        throw new Error('retouch_object(): silver damage not ported yet');
    return true;
}
/* C ref: you.h Hate_silver; mondata.h hates_silver() */
function Hate_silver() {
    const ptr = game.youmonst?.data;
    return ((game.u.ulycn ?? -1) >= 0
            || !!(ptr && ((ptr.mflags2 & M2_WERE) || ptr.mlet === S_VAMPIRE
                          || (ptr.mflags2 & M2_DEMON) || ptr === mons[PM_SHADE]
                          || (ptr.mlet === S_IMP && ptr !== mons[PM_TENGU]))));
}

// C ref: wield.c ready_weapon()
export async function ready_weapon(wep) {
    /* Separated function so swapping works easily */
    let res = ECMD_OK;
    const was_twoweap = game.u.twoweap, had_wep = (game.uwep != null);

    if (!wep) {
        /* No weapon */
        throw new Error('ready_weapon(): empty_handed() not ported yet');
    } else if (wep.otyp === CORPSE) {
        throw new Error('ready_weapon(): cant_wield_corpse() not ported yet');
    } else if (game.uarms && bimanual(wep)) {
        throw new Error('ready_weapon(): two-handed weapon with a shield not ported yet');
    } else if (!retouch_object(wep)) {
        res = ECMD_TIME; /* takes a turn even though it doesn't get wielded */
    } else {
        /* Weapon WILL be wielded after this point */
        res = ECMD_TIME;
        if (will_weld(wep)) {
            throw new Error('ready_weapon(): welding message not ported yet');
        } else {
            /* The message must be printed before setuwep (since
             * you might die and be revived from changing weapons),
             * and the message must be before the death message and
             * Lifesaved rewielding.  Yet we want the message to
             * say "weapon in hand", thus this kludge. */
            const dummy = wep.owornmask;

            wep.owornmask |= W_WEP;
            if (wep.otyp === AKLYS && (wep.owornmask & W_WEP) !== 0)
                await You("secure the tether.");
            await prinv(null, wep, 0);
            wep.owornmask = dummy;
        }

        setuwep(wep);
        if (was_twoweap && !game.u.twoweap && (game.flags?.verbose ?? true))
            throw new Error('ready_weapon(): no-longer-twoweapon message not ported yet');

        if (wep.oartifact)
            throw new Error('ready_weapon(): arti_speak() not ported yet');
        if (wep.unpaid)
            throw new Error('ready_weapon(): shopkeeper warning not ported yet');
    }
    if ((had_wep !== (game.uwep != null)))
        game.disp_botl = true; /* condtests[bl_bareh].enabled */
    return res;
}

// C ref: wield.c doswapweapon() -- the #swap command
export async function doswapweapon() {
    let result = 0;

    /* May we attempt this? */
    game.multi = 0;
    if (cantwield(game.youmonst.data)) {
        await pline("Don't be ridiculous!");
        return ECMD_FAIL;
    }
    if (welded(game.uwep))
        throw new Error('doswapweapon(): weldmsg() not ported yet');

    /* Unwield your current secondary weapon */
    const oldwep = game.uwep;
    const oldswap = game.uswapwep;
    setuswapwep(null);

    /* Set your new primary weapon */
    result = await ready_weapon(oldswap);

    /* Set your new secondary weapon */
    if (game.uwep === oldwep) {
        /* Wield failed for some reason */
        setuswapwep(oldswap);
    } else {
        setuswapwep(oldwep);
        if (game.uswapwep)
            await prinv(null, game.uswapwep, 0);
        else
            await You("have no secondary weapon readied.");
    }

    if (game.u.twoweap)
        throw new Error('doswapweapon(): can_twoweapon() not ported yet');

    return result;
}

// C ref: wield.c erodeable_wep() -- used by will_weld()
function erodeable_wep(optr) {
    return (optr.oclass === WEAPON_CLASS || is_weptool(optr)
            || optr.otyp === HEAVY_IRON_BALL || optr.otyp === IRON_CHAIN);
}

// C ref: wield.c will_weld() -- used by welded(), and also while wielding
export function will_weld(optr) {
    return !!(optr.cursed && (erodeable_wep(optr) || optr.otyp === TIN_OPENER));
}

// C ref: wield.c welded()
export function welded(obj) {
    if (obj && obj === game.uwep && will_weld(obj)) {
        obj.bknown = 1; /* set_bknown(obj, 1): no perm_invent update needed */
        return 1;
    }
    return 0;
}

// C ref: engrave.c freehand()
export function freehand() {
    const uwep = game.uwep, uarms = game.uarms;
    return (!uwep || !welded(uwep)
            || (!bimanual(uwep) && (!uarms || !uarms.cursed)));
}
