// wield.js -- wielding weapons.
// C ref: wield.c
//
// Ported so far: welded() with its will_weld()/erodeable_wep() macros,
// obj.h is_weptool()/bimanual(), and engrave.c freehand().

import { game } from './gstate.js';
import { P_NONE } from './const.js';
import { objects, WEAPON_CLASS, TOOL_CLASS, TIN_OPENER, HEAVY_IRON_BALL,
         IRON_CHAIN } from './objects.js';

// C ref: obj.h is_weptool()
export function is_weptool(o) {
    return o.oclass === TOOL_CLASS && objects[o.otyp].oc_skill !== P_NONE;
}

// C ref: obj.h bimanual()
export function bimanual(otmp) {
    return ((otmp.oclass === WEAPON_CLASS || otmp.oclass === TOOL_CLASS)
            && !!objects[otmp.otyp].oc_bimanual);
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
