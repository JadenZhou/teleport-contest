// dbridge.js — drawbridges.
// C ref: dbridge.c — create_drawbridge.
//
// Not ported yet: opening, closing and destroying drawbridges (the
// entity code: e_at, e_died, do_entity, open_drawbridge,
// close_drawbridge, destroy_drawbridge). zap.js has find_drawbridge(),
// dig.js is_ice(), hack.js is_pool_or_lava().

import { game } from './gstate.js';
import {
    IS_WALL, DRAWBRIDGE_UP, DRAWBRIDGE_DOWN, DBWALL, DOOR, LAVAPOOL,
    D_NODOOR, W_NONDIGGABLE, DB_NORTH, DB_SOUTH, DB_EAST, DB_WEST, DB_LAVA,
} from './const.js';

// C's impossible() (pline.c) is not ported yet.
function impossible(msg) { console.error(`impossible: ${msg}`); }

// C ref: dbridge.c create_drawbridge()
/*
 * Creation of a drawbridge at pos x,y.
 *     dir is the direction.
 *     flag must be put to TRUE if we want the drawbridge to be opened.
 */
export function create_drawbridge(x, y, dir, flag) {
    let x2, y2;
    let horiz;
    const levl = (xx, yy) => game.level.at(xx, yy);
    const lava = levl(x, y).typ === LAVAPOOL; /* assume initialized map */

    x2 = x;
    y2 = y;
    switch (dir) {
    case DB_NORTH:
        horiz = true;
        y2--;
        break;
    case DB_SOUTH:
        horiz = true;
        y2++;
        break;
    case DB_EAST:
        horiz = false;
        x2++;
        break;
    default:
        impossible('bad direction in create_drawbridge');
        /*FALLTHRU*/
    case DB_WEST:
        horiz = false;
        x2--;
        break;
    }
    if (!IS_WALL(levl(x2, y2).typ))
        return false;
    if (flag) { /* We want the bridge open */
        levl(x, y).typ = DRAWBRIDGE_DOWN;
        levl(x2, y2).typ = DOOR;
        levl(x2, y2).doormask = D_NODOOR;
    } else {
        levl(x, y).typ = DRAWBRIDGE_UP;
        levl(x2, y2).typ = DBWALL;
        /* Drawbridges are non-diggable. */
        levl(x2, y2).wall_info = W_NONDIGGABLE;
    }
    levl(x, y).horizontal = !horiz;
    levl(x2, y2).horizontal = horiz;
    levl(x, y).drawbridgemask = dir;
    if (lava)
        levl(x, y).drawbridgemask |= DB_LAVA;
    return true;
}
