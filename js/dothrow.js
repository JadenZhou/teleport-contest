// dothrow.js -- throwing and firing.
// C ref: dothrow.c
//
// Ported so far: the #fire command's fireassist (swap to or wield the
// launcher and requeue #fire), the #throw command (dothrow(), throw_ok())
// and throw_obj() up to the direction prompt.  Throwing itself (throwit()), autoquiver and doquiver_core()
// are not ported yet.

import { game } from './gstate.js';
import { You, You_cant } from './display.js';
import { check_capacity } from './hack.js';
import { getdir } from './cmd.js';
import { is_ammo, is_pole, ammo_and_launcher, doquiver_core, welded } from './wield.js';
import { ECMD_OK, ECMD_TIME, ECMD_CANCEL, W_WEP, P_SLING, A_STR, STR19,
         GETOBJ_EXCLUDE, GETOBJ_DOWNPLAY, GETOBJ_SUGGEST, GETOBJ_PROMPT,
         GETOBJ_ALLOWCNT } from './const.js';
import { BULLWHIP, BOOMERANG, AKLYS, objects, COIN_CLASS, WEAPON_CLASS,
         GEM_CLASS } from './objects.js';
import { M1_NOHANDS, M1_NOTAKE, S_COCKATRICE, PM_CHICKATRICE, PM_COCKATRICE,
         PM_MEDUSA, mons, M2_ROCKTHROW } from './monsters.js';
import { getobj } from './invent.js';
import { ACURR } from './attrib.js';
import { ART_MJOLLNIR } from './artilist.js';
import { pline, newsym, flush_screen, canspotmon, canseemon } from './display.js';
import { vision_recalc } from './vision.js';
import { u_on_newpos } from './mklev.js';
import { check_special_room } from './hack.js';
import { m_at, may_passwall, closed_door, sobj_at, is_pool, is_lava } from './makemon.js';
import { bad_rock, wake_nearto } from './mon.js';
import { t_at, VIBRATING_SQUARE } from './trap.js';
import { x_monnam, ARTICLE_A, SUPPRESS_SADDLE, AUGMENT_IT } from './do_name.js';
import { BOULDER } from './objects.js';
import { isok, IS_DOOR, IS_OBSTRUCTED, D_ISOPEN, IRONBARS, PASSES_WALLS,
         LEVITATION, FLYING, MAGIC_PORTAL, FIRE_TRAP, STRAT_WAITMASK } from './const.js';

/* C ref: mondata.h touch_petrifies() */
function touch_petrifies(ptr) {
    const n = mons.indexOf(ptr);
    return n === PM_COCKATRICE || n === PM_CHICKATRICE;
}

/* C ref: mondata.h nohands(), notake() */
function nohands(ptr) { return (ptr.mflags1 & M1_NOHANDS) !== 0; }
function notake(ptr) { return (ptr.mflags1 & M1_NOTAKE) !== 0; }

/* C ref: cmd.c cmdq_add_ec(CQ_CANNED, fn), cmdq_add_key(CQ_CANNED, key);
   the extended command is kept by its cmd.c function name */
function cmdq_add_ec(fn) {
    if (!game.cmdq) game.cmdq = [];
    game.cmdq.push({ typ: 'ec', fn });
}
function cmdq_add_key(key) {
    if (!game.cmdq) game.cmdq = [];
    game.cmdq.push({ typ: 'key', key });
}

/* C ref: dothrow.c AutoReturn() -- uwep might already be removed from
   inventory so test for W_WEP instead */
function AutoReturn(o, wmsk) {
    if (o.oartifact)
        throw new Error('AutoReturn(): Mjollnir not ported yet');
    return ((wmsk & W_WEP) !== 0 && o.otyp === AKLYS) || o.otyp === BOOMERANG;
}

// C ref: dothrow.c ok_to_throw() -- common to dothrow() and dofire()
async function ok_to_throw() {
    const shotlimit = Math.max(0, game.command_count || 0);
    game.multi = 0; /* reset; it's been used up */

    if (notake(game.youmonst.data)) {
        await You("are physically incapable of throwing or shooting anything.");
        return { ok: false, shotlimit };
    } else if (nohands(game.youmonst.data)) {
        await You_cant("throw or shoot without hands."); /* not body_part(HAND) */
        return { ok: false, shotlimit };
    }
    if (await check_capacity(null))
        return { ok: false, shotlimit };
    return { ok: true, shotlimit };
}

// C ref: dothrow.c throw_obj() -- up to the direction prompt
async function throw_obj(obj, shotlimit) {
    void shotlimit;
    let res = ECMD_TIME;

    /* ask "in what direction?" */
    if (!(await getdir(null))) {
        /* No direction specified, so cancel the throw */
        res = ECMD_CANCEL; /* no time passes */
        /* unsplit_stack: no partial stack was split off by fire */
        return res;
    }
    throw new Error('throw_obj(): throwing (throwit()) not ported yet');
}

/* C ref: hack.h uslinging(); mondata.h throws_rocks() */
function uslinging() {
    return !!game.uwep && objects[game.uwep.otyp].oc_skill === P_SLING;
}
function throws_rocks(ptr) { return (ptr.mflags2 & M2_ROCKTHROW) !== 0; }

// C ref: dothrow.c throw_ok()
/* getobj callback for object to be thrown */
function throw_ok(obj) {
    if (!obj)
        return GETOBJ_EXCLUDE;

    if (obj.bknown && welded(obj)) /* not a candidate if known to be stuck */
        return GETOBJ_DOWNPLAY;

    if (AutoReturn(obj, obj.owornmask)
        /* to get here, obj is boomerang or is uwep and (alkys or Mjollnir) */
        && (obj.oartifact !== ART_MJOLLNIR || ACURR(A_STR) >= STR19(25)))
        return GETOBJ_SUGGEST;

    if (obj.quan === 1 && (obj === game.uwep
                           || (obj === game.uswapwep && game.u.twoweap)))
        return GETOBJ_DOWNPLAY;

    if (obj.oclass === COIN_CLASS)
        return GETOBJ_SUGGEST;

    if (!uslinging() && obj.oclass === WEAPON_CLASS)
        return GETOBJ_SUGGEST;
    /* Possible extension: exclude weapons that make no sense to throw,
       such as whips, bows, slings, rubber hoses. */

    if (uslinging() && obj.oclass === GEM_CLASS)
        return GETOBJ_SUGGEST;

    if (throws_rocks(game.youmonst.data) && obj.otyp === BOULDER)
        return GETOBJ_SUGGEST;

    return GETOBJ_DOWNPLAY;
}

// C ref: dothrow.c dothrow() -- the #throw command
export async function dothrow() {
    let obj;

    /*
     * Since some characters shoot multiple missiles at one time,
     * allow user to specify a count prefix for 'f' or 't' to limit
     * number of items thrown (to avoid possibly hitting something
     * behind target after killing it, or perhaps to conserve ammo).
     *
     * [3.6.0:  shot count setup has been moved into ok_to_throw().]
     */
    const otr = await ok_to_throw();
    if (!otr.ok)
        return ECMD_OK;
    const shotlimit = otr.shotlimit;

    obj = await getobj("throw", throw_ok, GETOBJ_PROMPT | GETOBJ_ALLOWCNT);
    /* it is also possible to throw food */
    /* (or jewels, or iron balls... ) */

    return obj ? await throw_obj(obj, shotlimit) : ECMD_CANCEL;
}

// C ref: dothrow.c find_launcher()
function find_launcher(ammo) {
    let otmp, oX;

    if (!ammo)
        return null;

    for (oX = null, otmp = game.invent; otmp; otmp = otmp.nobj) {
        if (otmp.cursed && otmp.bknown)
            continue; /* known to be cursed, so skip */
        if (ammo_and_launcher(ammo, otmp)) {
            if (otmp.bknown)
                return otmp; /* known-B or known-U (known-C won't get here) */
            if (!oX)
                oX = otmp; /* unknown-BUC; used if no known-BU item found */
        }
    }
    return oX;
}

// C ref: dothrow.c dofire() -- the #fire command
export async function dofire() {
    let obj;
    const uwep = game.uwep;
    /* AutoReturn() verifies Valkyrie if weapon is Mjollnir, but it relies
       on its caller to make sure hero is strong enough to throw that */
    const uwep_Throw_and_Return = !!(uwep && AutoReturn(uwep, uwep.owornmask));
    let skip_fireassist = false;
    let altres, res = ECMD_OK;

    const otr = await ok_to_throw();
    if (!otr.ok)
        return ECMD_OK;
    const shotlimit = otr.shotlimit;

    obj = game.uquiver;
    /* if wielding a throw-and-return weapon, throw it if quiver is empty
       or has ammo rather than missiles */
    if (uwep_Throw_and_Return && (!obj || is_ammo(obj))) {
        obj = uwep;
        skip_fireassist = true;
    } else if (!obj) {
        if (!game.flags?.autoquiver) {
            /* if we're wielding a polearm, apply it */
            if (uwep && is_pole(uwep)) {
                throw new Error('dofire(): use_pole() not ported yet');
            /* if we're wielding a bullwhip, apply it */
            } else if (uwep && uwep.otyp === BULLWHIP) {
                throw new Error('dofire(): use_whip() not ported yet');
            } else if ((game.iflags?.fireassist ?? true)
                       && game.uswapwep && is_pole(game.uswapwep)
                       && !(game.uswapwep.cursed && game.uswapwep.bknown)) {
                /* we have a known not-cursed polearm as swap weapon.
                   swap to it and retry */
                cmdq_add_ec("doswapweapon");
                cmdq_add_ec("dofire");
                return ECMD_OK; /* haven't taken any time yet */
            } else {
                await You("have no ammunition readied.");
            }
        } else {
            throw new Error('dofire(): autoquiver() not ported yet');
        }
    }

    /* if autoquiver is disabled or has failed, prompt for missile */
    if (!obj) {
        /* in case we're using ^A to repeat prior 'f' command, don't
           use direction of previous throw as getobj()'s choice here */
        game.in_doagain = 0;

        /* this gives its own feedback about populating the quiver slot */
        res = await doquiver_core("fire");
        if (res !== ECMD_OK && res !== ECMD_TIME)
            return res;

        obj = game.uquiver;
    }

    if (game.uquiver && is_ammo(game.uquiver) && (game.iflags?.fireassist ?? true)
        && !skip_fireassist) {
        if (uwep && is_pole(uwep))
            throw new Error('dofire(): could_pole_mon() not ported yet');
        /* Try to find a launcher */
        if (ammo_and_launcher(game.uquiver, uwep)) {
            obj = game.uquiver;
        } else if (ammo_and_launcher(game.uquiver, game.uswapwep)) {
            /* swap weapons and retry fire */
            cmdq_add_ec("doswapweapon");
            cmdq_add_ec("dofire");
            return res;
        } else {
            const olauncher = find_launcher(game.uquiver);
            if (olauncher) {
                /* wield launcher, retry fire */
                if (uwep && !game.flags?.pushweapon)
                    cmdq_add_ec("doswapweapon");
                cmdq_add_ec("dowield");
                cmdq_add_key(olauncher.invlet);
                cmdq_add_ec("dofire");
                return res;
            }
        }
    }

    altres = obj ? await throw_obj(obj, shotlimit) : ECMD_CANCEL;
    /* fire can take time by filling quiver (if that causes something which
       was wielded to be unwielded) even if the throw itself gets cancelled */
    return (res === ECMD_TIME) ? res : altres;
}

// C ref: dothrow.c walk_path()
/*
 * Walk a path from src_cc to dest_cc, calling a proc for each location
 * except the starting one.  If the proc returns FALSE, stop walking
 * and return FALSE.  If stopped early, dest_cc will be the location
 * before the failed callback.
 */
export async function walk_path(src_cc, dest_cc, check_proc, arg) {
    let err;
    let x, y, dx, dy, x_change, y_change, i, prev_x, prev_y;
    let keep_going = true;

    /* Use Bresenham's Line Algorithm to walk from src to dest. */
    dx = dest_cc.x - src_cc.x;
    dy = dest_cc.y - src_cc.y;
    prev_x = x = src_cc.x;
    prev_y = y = src_cc.y;

    if (dx < 0) {
        x_change = -1;
        dx = -dx;
    } else {
        x_change = 1;
    }
    if (dy < 0) {
        y_change = -1;
        dy = -dy;
    } else {
        y_change = 1;
    }
    i = err = 0;
    if (dx < dy) {
        while (i++ < dy) {
            prev_x = x;
            prev_y = y;
            y += y_change;
            err += dx << 1;
            if (err > dy) {
                x += x_change;
                err -= dy << 1;
            }
            /* check for early exit condition */
            if (!(keep_going = await check_proc(arg, x, y)))
                break;
        }
    } else {
        while (i++ < dx) {
            prev_x = x;
            prev_y = y;
            x += x_change;
            err += dy << 1;
            if (err > dx) {
                y += y_change;
                err -= dx << 1;
            }
            /* check for early exit condition */
            if (!(keep_going = await check_proc(arg, x, y)))
                break;
        }
    }

    if (keep_going)
        return true; /* successful */

    dest_cc.x = prev_x;
    dest_cc.y = prev_y;
    return false;
}

// C ref: dothrow.c hurtle_jump() -- hurtle_step() for jumping, with water
// walking forced on so a jump over water doesn't land in that water
export async function hurtle_jump(arg, x, y) {
    /* EWwalking |= I_SPECIAL: hurtle_step() is told it's a jump */
    const save_via_jumping = game.hurtle_via_jumping;
    game.hurtle_via_jumping = true;
    try {
        return await hurtle_step(arg, x, y);
    } finally {
        game.hurtle_via_jumping = save_via_jumping;
    }
}

// C ref: mon.c wake_msg()
async function wake_msg(mtmp, interesting) {
    if (mtmp.msleeping && canseemon(mtmp))
        throw new Error('wake_msg(): "<mon> wakes up" not ported yet');
}

// C ref: mon.c wakeup() -- wake up a monster, possibly making it angry
async function wakeup(mtmp, via_attack) {
    await wake_msg(mtmp, via_attack);
    mtmp.msleeping = 0;
    if (mtmp.m_ap_type) /* M_AP_TYPE(mtmp) != M_AP_NOTHING */
        throw new Error('wakeup(): seemimic() not ported yet');
    else if (game.context.forcefight && !game.context.mon_moving
             && mtmp.mundetected) {
        mtmp.mundetected = 0;
        newsym(mtmp.mx, mtmp.my);
    }
    /* finish_meating(mtmp) */
    mtmp.meating = 0;
    if (via_attack)
        throw new Error('wakeup(): via_attack not ported yet');
}

// C ref: mon.c setmangry() -- the via_attack FALSE start
function setmangry(mtmp, via_attack) {
    mtmp.mstrategy &= ~STRAT_WAITMASK;
    if (!mtmp.mpeaceful)
        return;
    if (mtmp.mtame)
        return;
    throw new Error('setmangry(): angering a peaceful monster not ported yet');
}

// C ref: dothrow.c hurtle_step()
/*
 * Single step for the hero flying through the air from jumping, flying,
 * etc.  Called from hurtle() and jump() via walk_path().  We expect the
 * argument to be a pointer to an integer -- the range -- which is
 * used in the calculation of points off if we hit something.
 *
 * Bumping into monsters won't cause damage but will wake them and make
 * them angry.  Auto-pickup isn't done, since you don't have control over
 * your movements at the time.
 */
export async function hurtle_step(arg, x, y) {
    const u = game.u;
    let ox, oy;
    let mon;
    let may_pass = true;
    let ttmp;

    if (!isok(x, y)) {
        await pline("You feel the spirits holding you back."); /* You_feel() */
        return false;
    } else if (game.regions && game.regions.length) {
        throw new Error('hurtle_step(): in_out_region() not ported yet');
    } else if (arg.range === 0) {
        return false; /* previous step wants to stop now */
    }
    const via_jumping = !!game.hurtle_via_jumping; /* EWwalking & I_SPECIAL */
    const stopping_short = (via_jumping && arg.range < 2);
    const lev = game.level.at(x, y);
    const ltyp = lev.typ;

    const Passes_walls = !!(u.uprops?.[PASSES_WALLS]?.intrinsic
                            || u.uprops?.[PASSES_WALLS]?.extrinsic);
    if (!Passes_walls || !(may_pass = may_passwall(x, y))) {
        let why = null;
        const diagonal = (u.ux - x) !== 0 && (u.uy - y) !== 0,
            open_door = IS_DOOR(ltyp) && (lev.doormask & D_ISOPEN) !== 0,
            odoor_diag = open_door && diagonal;

        if (IS_OBSTRUCTED(lev.typ) || closed_door(x, y) || odoor_diag) {
            why = "bumping";
        } else if (ltyp === IRONBARS) {
            why = "crashing into iron bars";
        } else if (sobj_at(BOULDER, x, y)) {
            why = "bumping into a boulder";
        } else if (!may_pass) {
            why = "touching the edge of the universe";
        } else if (diagonal
                   && bad_rock(game.youmonst.data, u.ux, y)
                   && bad_rock(game.youmonst.data, x, u.uy)) {
            throw new Error('hurtle_step(): squeezing diagonally not ported yet');
        }
        if (why)
            throw new Error(`hurtle_step(): ${why} (losehp()) not ported yet`);
    }

    if ((mon = m_at(x, y)) !== null && mon !== undefined) {
        const seen = canspotmon(mon); /* glyph_is_monster(glyph_at(x, y)) */

        mon.mundetected = 0; /* wakeup() will handle mimic */
        if (!seen)
            throw new Error('hurtle_step(): bumping into an unseen monster not ported yet');
        /* after unhiding; combination of a_monnam() and some_mon_nam() */
        const mnam = x_monnam(mon, ARTICLE_A, null,
                              ((mon.mgivenname ? SUPPRESS_SADDLE : 0)
                               | AUGMENT_IT), false);
        await You(`bump into ${mnam}.`);
        await wakeup(mon, false);
        /* if (!canspotmon(mon)) map_invisible(mon->mx, mon->my): seen */
        setmangry(mon, false);
        if (touch_petrifies(mon.data) && !game.uarmu && !game.uarm && !game.uarmc)
            throw new Error('hurtle_step(): instapetrify() not ported yet');
        if (touch_petrifies(game.youmonst.data))
            throw new Error('hurtle_step(): minstapetrify() not ported yet');
        await wake_nearto(x, y, 10);
        return false;
    }

    if ((u.ux - x) && (u.uy - y)
        && bad_rock(game.youmonst.data, u.ux, y)
        && bad_rock(game.youmonst.data, x, u.uy)) {
        /* Move at a diagonal. */
        /* Sokoban: "You come to an abrupt halt!" -- Sokoban isn't ported */
    }

    /* caller has already determined that dragging the ball is allowed */
    if (game.uball)
        throw new Error('hurtle_step(): drag_ball() not ported yet');

    ox = u.ux;
    oy = u.uy;
    u_on_newpos(x, y); /* set u.<ux,uy>, u.usteed-><mx,my>; cliparound(); */
    newsym(ox, oy);    /* update old position */
    vision_recalc(1);  /* update for new position */
    await flush_screen(1);
    /* if terrain type changes, levitation or flying might become blocked
       or unblocked; switch_terrain() might issue a message */
    if (ltyp !== game.level.at(ox, oy).typ
        && (u.uprops?.[LEVITATION]?.intrinsic || u.uprops?.[LEVITATION]?.extrinsic
            || u.uprops?.[FLYING]?.intrinsic || u.uprops?.[FLYING]?.extrinsic))
        throw new Error('hurtle_step(): switch_terrain() not ported yet');

    /* might be entering a special room (treasure zoo, thrown room, &c) that
       has a first-time entry message, or leaving shop with unpaid goods */
    await check_special_room(false);

    if (is_pool(x, y) && !u.uinwater) {
        throw new Error('hurtle_step(): moving over water not ported yet');
    } else if (is_lava(x, y) && !stopping_short) {
        throw new Error('hurtle_step(): moving over lava not ported yet');
    }

    if ((ttmp = t_at(x, y)) !== null && ttmp !== undefined) {
        if (stopping_short) {
            ; /* see the comment above hurtle_jump() */
        } else if (ttmp.ttyp === MAGIC_PORTAL || ttmp.ttyp === VIBRATING_SQUARE
                   || ttmp.ttyp === FIRE_TRAP) {
            throw new Error('hurtle_step(): dotrap() not ported yet');
        } else {
            /* (is_pit() || is_hole()) && Sokoban: Sokoban isn't ported */
            if (ttmp.tseen)
                throw new Error('hurtle_step(): "You pass right over" trapname() not ported yet');
        }
    }
    if (--arg.range < 0) /* make sure our range never goes negative */
        arg.range = 0;
    /* if (*range != 0) nh_delay_output(): display timing only */
    return true;
}
