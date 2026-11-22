// ball.js — ball and chain (punishment).
// C ref: ball.c
//
// Ported so far: placebc(), unplacebc(), placebc_core(),
// unplacebc_core(), check_restriction(), bc_order() and set_bc().
// Dragging the ball (move_bc(), drag_ball(), drop_ball(), drag_down(),
// ballfall(), litter()) is not ported yet.

import { game } from './gstate.js';
import { newsym } from './display.js';
import { flooreffects } from './do.js';
import { place_object, obj_extract_self } from './mkobj.js';
import { maybe_unhide_at } from './mon.js';
import { Is_waterlevel, BLINDED } from './const.js';

/* C ref: you.h bc_order values, bc_felt bits */
export const BCPOS_DIFFER = 0, BCPOS_CHAIN = 1, BCPOS_BALL = 2;
export const BC_BALL = 0x01, BC_CHAIN = 0x02;

/* C ref: ball.c static int bcrestriction */
function bcrestriction() { return game.bcrestriction || 0; }

/* C ref: obj.h carried() */
function carried(o) { return o.where === 'OBJ_INVENT'; }
/* C ref: youprop.h Blind */
function Blind() {
    const p = game.u.uprops[BLINDED];
    return !!((p.intrinsic || p.extrinsic) && !p.blocked);
}

// C ref: ball.c placebc_core()
async function placebc_core() {
    const g = game, u = g.u;

    if (!g.uchain || !g.uball) {
        console.error('impossible: Where are your ball and chain?');
        return;
    }

    await flooreffects(g.uchain, u.ux, u.uy, ""); /* chain might rust */

    if (carried(g.uball)) { /* the ball is carried */
        u.bc_order = BCPOS_DIFFER;
    } else {
        /* ball might rust -- already checked when carried */
        await flooreffects(g.uball, u.ux, u.uy, "");
        place_object(g.uball, u.ux, u.uy);
        u.bc_order = BCPOS_CHAIN;
    }

    place_object(g.uchain, u.ux, u.uy);

    u.bglyph = u.cglyph = g.level.at(u.ux, u.uy).remembered_glyph; /* pick up glyph */

    newsym(u.ux, u.uy);
    g.bcrestriction = 0;
}

// C ref: ball.c unplacebc_core()
function unplacebc_core() {
    const g = game, u = g.u;

    if (u.uswallow) {
        if (Is_waterlevel(u.uz)) {
            /* we need to proceed with the removal from the floor
             * so that movebubbles() processing will disregard it as
             * intended. Ignore all the vision stuff.
             */
            if (!carried(g.uball))
                obj_extract_self(g.uball);
            obj_extract_self(g.uchain);
        }
        /* ball&chain not unplaced while swallowed */
        return;
    }

    if (!carried(g.uball)) {
        obj_extract_self(g.uball);
        if (Blind() && (u.bc_felt & BC_BALL)) /* drop glyph */
            g.level.at(g.uball.ox, g.uball.oy).remembered_glyph = u.bglyph;
        maybe_unhide_at(g.uball.ox, g.uball.oy);
        newsym(g.uball.ox, g.uball.oy);
    }
    obj_extract_self(g.uchain);
    if (Blind() && (u.bc_felt & BC_CHAIN)) /* drop glyph */
        g.level.at(g.uchain.ox, g.uchain.oy).remembered_glyph = u.cglyph;
    maybe_unhide_at(g.uchain.ox, g.uchain.oy);

    newsym(g.uchain.ox, g.uchain.oy);
    u.bc_felt = 0; /* feel nothing */
}

// C ref: ball.c check_restriction()
function check_restriction(restriction) {
    let ret = false;

    if (!bcrestriction() || (restriction === game.override_restriction))
        ret = true;
    else
        ret = (bcrestriction() === restriction);
    return ret;
}

// C ref: ball.c placebc()
export async function placebc() {
    if (!check_restriction(0)) {
        /* paniclog("placebc", "placebc denied, restriction in effect") */
        return;
    }
    if (game.uchain && game.uchain.where !== 'OBJ_FREE' && game.uchain.where) {
        console.error('impossible: bc already placed?');
        return;
    }
    await placebc_core();
}

// C ref: ball.c unplacebc()
export function unplacebc() {
    if (bcrestriction()) {
        console.error('impossible: unplacebc denied, restriction in place');
        return;
    }
    unplacebc_core();
}

// C ref: ball.c bc_order()
/* Return the stacking of the hero's ball & chain.  This assumes that the
 * hero is being punished.
 */
function bc_order() {
    const g = game;

    if (g.uchain.ox !== g.uball.ox || g.uchain.oy !== g.uball.oy
        || carried(g.uball) || g.u.uswallow)
        return BCPOS_DIFFER;

    /* level.objects[x][y] is newest first: the first of the two found
       on the floor chain at that spot is the one on top */
    for (const obj of g.level.objects || []) {
        if (obj.ox !== g.uball.ox || obj.oy !== g.uball.oy
            || obj.where !== 'OBJ_FLOOR')
            continue;
        if (obj === g.uchain)
            return BCPOS_CHAIN;
        if (obj === g.uball)
            return BCPOS_BALL;
    }
    console.error('impossible: bc_order:  ball&chain not in same location!');
    return BCPOS_DIFFER;
}

// C ref: ball.c set_bc()
/*
 *  The hero is either about to go blind or already blind and just punished.
 *  Set up the ball and chain variables so that the ball and chain are "felt".
 */
export function set_bc(already_blind) {
    const g = game, u = g.u;
    const ball_on_floor = !carried(g.uball);

    u.bc_order = bc_order(); /* get the order */
    u.bc_felt = ball_on_floor ? BC_BALL | BC_CHAIN : BC_CHAIN; /* felt */

    if (already_blind || u.uswallow) {
        u.cglyph = u.bglyph = g.level.at(u.ux, u.uy).remembered_glyph;
        return;
    }
    throw new Error('set_bc(): remembering the glyphs under the ball and chain not ported yet');
}
