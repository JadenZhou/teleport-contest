// cmd.js — Command dispatch and movement.
// C ref: cmd.c rhack(), hack.c domove().
//
// Minimal skeleton: only hjklyubn movement is implemented.
// Contestants should add: search, kick, eat, drink, read, zap,
// wear, wield, drop, throw, pray, cast, and all other commands.

import { game } from './gstate.js';
import { nhgetch } from './input.js';
import { newsym, flush_screen, pline } from './display.js';
import { vision_recalc } from './vision.js';
import { tty_clear_nhwindow, tty_get_ext_cmd } from './wintty.js';
import { extcmdlist, CMD_NOT_AVAILABLE, INTERNALCMD, WIZMODECMD, AUTOCOMPLETE,
         ECM_IGNOREAC, ECM_EXACTMATCH, ECM_NO1CHARCMD } from './func_tab.js';
import { strcmpi, strncmpi } from './hacklib.js';
import { dosearch } from './detect.js';
import { level_tele } from './teleport.js';
import { wiz_level_change, wiz_wish } from './wizcmds.js';
import { cmd_safety_prevention } from './hack.js';

// C ref: cmd.c extcmds_match() -- the indices of the extcmdlist[]
// entries matching findstr
export function extcmds_match(findstr, ecmflags) {
    const retmatchlist = [];
    const fslen = findstr ? findstr.length : 0;
    const ignoreac = (ecmflags & ECM_IGNOREAC) !== 0;
    const exactmatch = (ecmflags & ECM_EXACTMATCH) !== 0;
    const no1charcmd = (ecmflags & ECM_NO1CHARCMD) !== 0;
    const wizard = !!game.flags?.debug;

    for (let i = 0; i < extcmdlist.length; i++) {
        const ec = extcmdlist[i];
        if (ec.flags & (CMD_NOT_AVAILABLE | INTERNALCMD))
            continue;
        if (!wizard && (ec.flags & WIZMODECMD))
            continue;
        if (!ignoreac && !(ec.flags & AUTOCOMPLETE))
            continue;
        if (no1charcmd && (ec.ef_txt.length === 1))
            continue;
        if (!findstr) {
            retmatchlist.push(i);
        } else if (exactmatch) {
            if (!strcmpi(findstr, ec.ef_txt))
                retmatchlist.push(i);
        } else {
            if (!strncmpi(findstr, ec.ef_txt, fslen))
                retmatchlist.push(i);
        }
    }
    return retmatchlist;
}

// the extended commands ported so far, by their cmd.c function name
const ext_funcs = {
    dosearch: () => dosearch(),
    donull: () => donull(),
    wiz_level_change: () => wiz_level_change(),
    wiz_wish: () => wiz_wish(),
};

// C ref: cmd.c doextcmd() -- here is the main command dispatcher for
// the extended commands (not bound to '#' in rhack() yet)
async function doextcmd() {
    let idx, retval, func;

    /* keep repeating until we don't run help or quit */
    do {
        idx = await tty_get_ext_cmd();
        if (idx < 0)
            return 0; /* ECMD_OK: quit */

        func = extcmdlist[idx].ef_funct;
        /* can_do_extcmd(), iflags.menu_requested -- not ported yet */
        if (!ext_funcs[func]) {
            /* the command itself is not ported yet; no time passes */
            return 0;
        }
        retval = await ext_funcs[func]();
    } while (func === "doextlist");

    return retval;
}

// C ref: do.c donull() -- '.' command: do nothing == rest
async function donull() {
    if (await cmd_safety_prevention("Waiting", "a no-op (to rest)",
                                    "Are you waiting to get hit?",
                                    "did_nothing_flag"))
        return 0; /* ECMD_OK */
    return 1; /* ECMD_TIME: Do nothing, but let other things happen */
}
import { COLNO, ROWNO, STONE, DOOR, D_CLOSED, D_LOCKED,
         IS_WALL, IS_OBSTRUCTED } from './const.js';

// Direction deltas: y u k
//                   h . l
//                   b j n
const DIR_DX = { h: -1, l: 1, j: 0, k: 0, y: -1, u: 1, b: -1, n: 1 };
const DIR_DY = { h: 0, l: 0, j: 1, k: -1, y: -1, u: -1, b: 1, n: 1 };

function isMovementKey(ch) {
    return 'hjklyubn'.includes(ch);
}

// C ref: hack.c — check if a cell blocks movement
function blocksMove(x, y) {
    const loc = game.level?.at(x, y);
    if (!loc) return true;
    if (loc.typ === STONE) return true;
    if (IS_WALL(loc.typ)) return true;
    if (loc.typ === DOOR && (loc.doormask & (D_CLOSED | D_LOCKED))) return true;
    return false;
}

// C ref: cmd.c rhack — main command dispatcher
export async function rhack(key) {
    if (key === 0) {
        // Read key from input
        await flush_screen(1);
        key = await nhgetch();
        /* C ref: cmd.c parse() -- the message window is cleared once the
           command key has been read */
        tty_clear_nhwindow(game.WIN_MESSAGE);
    }

    const ch = String.fromCharCode(key);

    /* if there's no command, there's nothing to do except reset */
    if (!key || key === 0o377 || ch === '\x1b') {
        game.context.move = 0; /* reset_cmd_vars(TRUE) */
        return;
    }

    if (isMovementKey(ch)) {
        await domove(DIR_DX[ch], DIR_DY[ch]);
        game.context.move = 1;
    } else if (ch === '\x17' && game.flags?.debug) {
        /* C ref: cmd.c Cmd ^W (wizard mode) -> wizcmds.c wiz_wish() */
        game.context.move = (await wiz_wish()) ? 1 : 0;
    } else if (ch === '\x16' && game.flags?.debug) {
        /* C ref: cmd.c Cmd ^V (wizard mode) -> wizcmds.c wiz_level_tele() */
        await level_tele();
        game.context.move = 0; /* ECMD_OK */
    } else if (ch === '.') {
        /* C ref: cmd.c Cmd '.' -> donull(); ECMD_TIME takes a move */
        game.context.move = (await donull()) ? 1 : 0;
    } else if (ch === 's') {
        /* C ref: cmd.c Cmd 's' -> detect.c dosearch() */
        game.context.move = (await dosearch()) ? 1 : 0;
    } else if (ch === '#') {
        /* C ref: cmd.c Cmd '#' -> doextcmd() */
        game.context.move = (await doextcmd()) ? 1 : 0;
    } else {
        /* every other command is not ported yet, and neither are the
           prompts and windows whose keys would otherwise arrive here.
           C's "Unknown command '%s'." for keys missing from cmdlist[] is
           left out until the key bindings (cmd.c reset_commands()) are
           ported -- nothing happens */
        game.context.move = 0;
    }
}

// C ref: hack.c domove — execute a movement
async function domove(dx, dy) {
    const u = game.u;
    const newx = u.ux + dx;
    const newy = u.uy + dy;

    if (blocksMove(newx, newy)) {
        // Can't move there
        game.context.move = 0;
        return;
    }

    // Move the hero
    const oldx = u.ux, oldy = u.uy;
    u.ux0 = oldx;
    u.uy0 = oldy;
    u.ux = newx;
    u.uy = newy;

    // Update display
    newsym(oldx, oldy);
    vision_recalc(1);
    newsym(newx, newy);
}
