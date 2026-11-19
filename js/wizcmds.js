// wizcmds.js — wizard-mode commands.
// C ref: wizcmds.c
//
// Ported so far: the #levelchange prompt (wiz_level_change()); the
// level changes themselves (losexp(), pluslvl()) are not ported yet.

import { game } from './gstate.js';
import { pline } from './display.js';
import { tty_getlin } from './wintty.js';
import { MAXULEV } from './const.js';

// C ref: wizcmds.c wiz_level_change() -- #levelchange
export async function wiz_level_change() {
    const u = game.u;
    let newlevel = 0;
    let ret;

    let buf = await tty_getlin("To what experience level do you want to be set?");
    buf = buf.replace(/[ \t]+/g, ' ').trim(); /* mungspaces() */
    if (buf[0] === '\x1b' || buf === '')
        ret = 0;
    else {
        /* sscanf(buf, "%d%c", &newlevel, &dummy) */
        const m = /^([+-]?\d+)(.?)/.exec(buf);
        ret = m ? (m[2] ? 2 : 1) : 0;
        if (m) newlevel = parseInt(m[1], 10);
    }

    if (ret !== 1) {
        await pline("Never mind.");
        return 0; /* ECMD_OK */
    }
    if (newlevel === u.ulevel) {
        await pline("You are already that experienced."); /* You() */
    } else if (newlevel < u.ulevel) {
        if (u.ulevel === 1) {
            await pline("You are already as inexperienced as you can get.");
            return 0;
        }
        /* while (u.ulevel > newlevel) losexp("#levelchange");
           -- not ported yet */
        return 0;
    } else {
        if (u.ulevel >= MAXULEV) {
            await pline("You are already as experienced as you can get.");
            return 0;
        }
        /* while (u.ulevel < newlevel) pluslvl(FALSE); -- not ported yet */
        return 0;
    }
    /* blessed full healing or restore ability won't fix any lost levels */
    u.ulevelmax = u.ulevel;
    return 0; /* ECMD_OK */
}
