// wield.js -- wielding weapons.
// C ref: wield.c
//
// Ported so far: welded() with its will_weld()/erodeable_wep() macros,
// obj.h is_weptool()/bimanual(), and engrave.c freehand().

import { game } from './gstate.js';
import { P_NONE, P_BOW, P_CROSSBOW, P_DART, P_BOOMERANG, P_POLEARMS, P_LANCE,
         W_WEP, W_SWAPWEP, W_QUIVER } from './const.js';
import { objects, WEAPON_CLASS, TOOL_CLASS, GEM_CLASS, TIN_OPENER,
         HEAVY_IRON_BALL, IRON_CHAIN, TOWEL } from './objects.js';

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
