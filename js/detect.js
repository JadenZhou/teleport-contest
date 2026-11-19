// detect.js — detection and searching.
// C ref: detect.c
//
// Ported so far: dosearch0() for intrinsic autosearch (aflag != 0) and
// lock.c cvt_sdoor_to_door().  The explicit-search parts (aflag == 0:
// feel_location(), mfind0(), unmap_invisible()) are not ported yet.

import { game } from './gstate.js';
import { rnl } from './rng.js';
import { pline, newsym } from './display.js';
import { vision_reset } from './vision.js';
import { exercise } from './attrib.js';
import { m_at } from './makemon.js';
import { t_at, STATUE_TRAP } from './trap.js';
import {
    A_WIS, SDOOR, SCORR, DOOR, CORR, WM_MASK, D_NODOOR, D_CLOSED, D_LOCKED,
    BLINDED, isok, Is_rogue_level,
} from './const.js';
import { LENSES } from './objects.js';

// C ref: lock.c cvt_sdoor_to_door()
export function cvt_sdoor_to_door(lev) {
    let newmask = (lev.doormask || 0) & ~WM_MASK;

    if (Is_rogue_level(game.u.uz)) {
        /* rogue didn't have doors, only doorways */
        newmask = D_NODOOR;
    } else {
        /* newly exposed door is closed */
        if (!(newmask & D_LOCKED))
            newmask |= D_CLOSED;
    }
    lev.typ = DOOR;
    lev.doormask = newmask;
    lev.arboreal_sdoor = 0; /* clears 'candig' */
}

/* C ref: vision.c recalc_block_point(), unblock_point() -- the JS
   vision module keeps no incremental block map yet, so rebuild it */
function recalc_block_point(x, y) {
    void x, y;
    vision_reset();
    game.vision_full_recalc = 1;
}

/* C ref: hack.c nomul(0) */
function nomul0() {
    const g = game;
    if (g.multi < 0)
        return;
    g.multi = 0;
    /* u.uinvulnerable, usleep, multi_reason, travel/run flags: not
       ported yet */
}

// C ref: detect.c dosearch0()
export async function dosearch0(aflag) /* intrinsic autosearch vs explicit searching */ {
    const g = game;
    const u = g.u;
    let x, y, trap, mtmp;

    if (u.uswallow) {
        if (!aflag)
            await pline("What are you looking for?  The exit?");
    } else {
        /* uwep->oartifact && spec_ability(uwep, SPFX_SEARCH): artifacts
           aren't ported yet */
        let fund = 0;
        const Blind = u.uprops[BLINDED].intrinsic || u.uprops[BLINDED].extrinsic;

        if (g.ublindf && g.ublindf.otyp === LENSES && !Blind)
            fund += 2; /* JDS: lenses help searching */
        if (fund > 5)
            fund = 5;
        for (x = u.ux - 1; x < u.ux + 2; x++)
            for (y = u.uy - 1; y < u.uy + 2; y++) {
                if (!isok(x, y))
                    continue;
                if (x === u.ux && y === u.uy)
                    continue;

                if (!aflag)
                    throw new Error('dosearch0(): explicit search not ported yet');
                const lev = g.level.at(x, y);
                if (lev.typ === SDOOR) {
                    if (rnl(7 - fund))
                        continue;
                    cvt_sdoor_to_door(lev); /* .typ = DOOR */
                    recalc_block_point(x, y);
                    exercise(A_WIS, true);
                    nomul0();
                    newsym(x, y); /* feel_location(): make sure it shows up */
                    await pline("You find a hidden door.");
                } else if (lev.typ === SCORR) {
                    if (rnl(7 - fund))
                        continue;
                    lev.typ = CORR;
                    recalc_block_point(x, y); /* unblock_point(): vision */
                    exercise(A_WIS, true);
                    nomul0();
                    newsym(x, y); /* feel_newsym(): make sure it shows up */
                    await pline("You find a hidden passage.");
                } else {
                    /* Be careful not to find anything in an SCORR or SDOOR */
                    mtmp = m_at(x, y);
                    /* (mtmp && !aflag): mfind0() -- explicit search only */
                    /* (!aflag && !mtmp && !Blind): unmap_invisible() --
                       explicit search only */

                    if ((trap = t_at(x, y)) && !trap.tseen && !rnl(8)) {
                        nomul0();
                        if (trap.ttyp === STATUE_TRAP) {
                            /* activate_statue_trap(): statue traps aren't
                               created by the JS port yet */
                            throw new Error('dosearch0(): activate_statue_trap() not ported yet');
                        } else {
                            /* find_trap(): the "You find <trap>." message
                               isn't ported yet */
                            trap.tseen = 1;
                            newsym(x, y);
                        }
                    }
                }
            }
    }
    return 1;
}
