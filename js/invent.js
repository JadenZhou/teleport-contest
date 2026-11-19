// invent.js — inventory letters and inventory lines.
// C ref: invent.c assigninvlet(), reorder_invent(), obj_to_let(), prinv(),
//        xprname()

import { game } from './gstate.js';
import { pline } from './display.js';
import { doname } from './objnam.js';
import * as O from './objects.js';

const invlet_basic = 52;
const GOLD_SYM = '$';
const NOINVSYM = '#';
const CONTAINED_SYM = '>';
const HANDS_SYM = '-';

// C ref: flag.h flags.invlet_constant (default on; options are not
// parsed for it yet)
function invlet_constant() {
    return game.flags?.invlet_constant ?? true;
}

// C ref: invent.c assigninvlet()
export function assigninvlet(otmp) {
    const inuse = new Array(invlet_basic).fill(false);
    let i;

    /* there should be at most one of these in inventory... */
    if (otmp.oclass === O.COIN_CLASS) {
        otmp.invlet = GOLD_SYM;
        return;
    }

    for (let obj = game.invent; obj; obj = obj.nobj)
        if (obj !== otmp) {
            const c = obj.invlet || '';
            if (c >= 'a' && c <= 'z')
                inuse[c.charCodeAt(0) - 97] = true;
            else if (c >= 'A' && c <= 'Z')
                inuse[c.charCodeAt(0) - 65 + 26] = true;
            if (c && c === otmp.invlet)
                otmp.invlet = 0;
        }
    const c = otmp.invlet || '';
    if (c && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')))
        return;
    for (i = game.lastinvnr + 1; i !== game.lastinvnr; i++) {
        if (i === invlet_basic) {
            i = -1;
            continue;
        }
        if (!inuse[i])
            break;
    }
    otmp.invlet = inuse[i] ? NOINVSYM
        : (i < 26) ? String.fromCharCode(97 + i)
        : String.fromCharCode(65 + i - 26);
    game.lastinvnr = i;
}

/* note: assumes ASCII; toggling a bit puts lowercase in front of uppercase */
function inv_rank(o) {
    return (o.invlet ? String(o.invlet).charCodeAt(0) : 0) ^ 0o40;
}

// C ref: invent.c reorder_invent()
/* sort the inventory; used by addinv() and doorganize() */
export function reorder_invent() {
    let otmp, prev, next;
    let need_more_sorting;

    do {
        need_more_sorting = false;
        for (otmp = game.invent, prev = null; otmp; ) {
            next = otmp.nobj;
            if (next && inv_rank(next) < inv_rank(otmp)) {
                need_more_sorting = true;
                if (prev)
                    prev.nobj = next;
                else
                    game.invent = next;
                otmp.nobj = next.nobj;
                next.nobj = otmp;
                prev = next;
            } else {
                prev = otmp;
                otmp = next;
            }
        }
    } while (need_more_sorting);
}

// C ref: invent.c obj_to_let()
function obj_to_let(obj) {
    if (!invlet_constant())
        throw new Error('obj_to_let(): reassign() for !fixinv is not ported yet');
    return obj.invlet;
}

// C ref: invent.c prinv()
/*
 * Print the indicated quantity of the given object.  If quan == 0L then use
 * the current quantity.
 */
export async function prinv(prefix, obj, quan) {
    const total_of = (quan && (quan < obj.quan));
    let totalbuf = '';

    if (!prefix)
        prefix = "";

    if (total_of)
        totalbuf = ` (${obj.quan} in total).`;
    await pline(`${prefix}${prefix ? " " : ""}`
                + xprname(obj, null, obj_to_let(obj), !total_of, 0, quan)
                + (game.flags?.verbose ? totalbuf : ""));
}

// C ref: invent.c xprname()
export function xprname(obj, txt, let_, dot, cost, quan) {
    const use_invlet = (invlet_constant() && obj != null
                        && let_ !== CONTAINED_SYM && let_ !== HANDS_SYM);
    let savequan = 0;
    let suffix;

    if (quan && obj) {
        savequan = obj.quan;
        obj.quan = quan;
    }
    if (!txt)
        txt = doname(obj);

    if (cost !== 0 || let_ === '*') {
        throw new Error('xprname(): cost/total lines (currency()) are not ported yet');
    } else {
        /* ordinary inventory display or pickup message */
        if (use_invlet)
            let_ = obj.invlet;
        suffix = dot ? "." : "";
    }
    const li = `${let_} - ${txt}${suffix}`; /* "%c - %.*s%s" */

    if (savequan)
        obj.quan = savequan;

    return li;
}
