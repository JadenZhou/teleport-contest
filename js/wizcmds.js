// wizcmds.js — wizard-mode commands.
// C ref: wizcmds.c
//
// Ported so far: the #levelchange prompt (wiz_level_change()) and the ^W
// wish prompt (wiz_wish(), zap.c makewish()); the level changes
// themselves (losexp(), pluslvl()) and readobjnam() are not ported yet.

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

// C ref: zap.c makewish() -- up to the wish text; readobjnam() and the
// rest are not ported yet
async function makewish() {
    const g = game;
    let buf;
    let tries = 0;

    g.context.resume_wish = 0;
    if (g.flags.verbose)
        await pline("You may wish for an object."); /* You() */
    for (;;) { /* retry: */
        let promptbuf = "For what do you wish";
        if (g.iflags.cmdassist !== false && tries > 0)
            promptbuf += " (enter 'help' for assistance)";
        promptbuf += "?";

        /* iflags.menu_requested && wish_history[0]: wish_history_menu()
           -- not ported yet */
        buf = await tty_getlin(promptbuf);

        buf = buf.replace(/[ \t]+/g, ' ').trim(); /* mungspaces() */
        if (buf[0] === '\x1b') {
            buf = '';
        } else if (buf.toLowerCase() === "help") {
            /* wishcmdassist(MAXWISHTRY - tries) -- not ported yet */
            return;
        }
        break;
    }
    /* otmp = readobjnam(buf, &nothing); ... -- not ported yet */
}

// C ref: wizcmds.c wiz_wish() -- ^W
/* Unlimited wishes for debug mode by Paul Polderman */
export async function wiz_wish() {
    const g = game;
    if (g.flags.debug) {
        const save_verbose = g.flags.verbose;

        g.flags.verbose = false;
        await makewish();
        g.flags.verbose = save_verbose;
        /* encumber_msg() -- not ported yet */
    } else
        await pline("Unavailable command 'wizwish'."); /* unavailcmd */
    return 0; /* ECMD_OK */
}
