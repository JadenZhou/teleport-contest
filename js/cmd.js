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
import { tty_clear_nhwindow, tty_get_ext_cmd, tty_yn_function } from './wintty.js';
import { doride } from './steed.js';
import { extcmdlist, CMD_NOT_AVAILABLE, INTERNALCMD, WIZMODECMD, AUTOCOMPLETE,
         ECM_IGNOREAC, ECM_EXACTMATCH, ECM_NO1CHARCMD } from './func_tab.js';
import { strcmpi, strncmpi } from './hacklib.js';
import { dosearch } from './detect.js';
import { level_tele } from './teleport.js';
import { wiz_level_change, wiz_wish } from './wizcmds.js';
import { ddoinv } from './invent.js';
import { cmd_safety_prevention, nomul, domove, DOMOVE_WALK,
         DOMOVE_RUSH, confdir } from './hack.js';
export { domove };
import { IS_DOOR, IS_FURNITURE } from './const.js';

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
    doride: () => doride(),
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
import { COLNO, ROWNO, xdir, ydir, zdir } from './const.js';
import { PM_GRID_BUG } from './monsters.js';

// Direction deltas: y u k
//                   h . l
//                   b j n
const DIR_DX = { h: -1, l: 1, j: 0, k: 0, y: -1, u: 1, b: -1, n: 1 };
const DIR_DY = { h: 0, l: 0, j: 1, k: -1, y: -1, u: -1, b: 1, n: 1 };

function isMovementKey(ch) {
    return 'hjklyubn'.includes(ch);
}

// C ref: cmd.c rhack — main command dispatcher
export async function rhack(key) {
    const firsttime = (key === 0);
    if (key === 0 && game.cmdq?.length) {
        /* C ref: cmd.c rhack() -- a queued (CQ_CANNED) command from
           itemactions_pushkeys() runs before reading the keyboard */
        const cmdq = game.cmdq.shift();
        if (cmdq.typ === 'ec') {
            const fn = ext_funcs[cmdq.fn];
            if (!fn) {
                /* the queued command is not ported yet: nothing happens,
                   and the keys queued for it go with it (cmdq_clear()) */
                game.cmdq = [];
                game.context.move = 0;
                return;
            }
            game.context.move = (await fn()) ? 1 : 0;
            return;
        }
        key = cmdq.key.charCodeAt(0);
    } else if (key === 0) {
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
        set_move_cmd(ch, 0); /* do_move_<dir>() */
        /* C ref: cmd.c rhack() -- for DOMOVE_WALK rhack() calls domove()
           and returns straight away; context.move stays TRUE as parse()
           set it ("assume next command will take game time") unless
           domove_core() clears it, e.g. hack.c test_move() failing:
           "context.move = 0; nomul(0);" */
        game.context.move = 1;
        if (game.multi)
            game.context.mv = 1;
        await domove();
        game.context.forcefight = 0;
        game.iflags.menu_requested = false;
    } else if (isMovementKey(ch.toLowerCase())) {
        /* C ref: cmd.c do_run_<dir>() -- shift+dir is MV_RUN */
        set_move_cmd(ch.toLowerCase(), 1);
        /* rhack(): (gd.domove_attempting & DOMOVE_RUSH) != 0 */
        if (firsttime) {
            if (!game.multi)
                game.multi = Math.max(COLNO, ROWNO);
            game.u.last_str_turn = 0;
        }
        game.context.mv = 1;
        await domove();
        game.iflags.menu_requested = false;
        return;
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
    } else if (ch === 'i') {
        /* C ref: cmd.c Cmd 'i' -> invent.c ddoinv(); ECMD_OK, no time */
        await ddoinv();
        game.context.move = 0;
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

// C ref: cmd.c set_move_cmd() -- dir is the direction key, run the
// context.run mode (0 walk, 1 shift-run, 3 rush)
function set_move_cmd(dir, run) {
    const u = game.u;
    u.dz = 0;
    u.dx = DIR_DX[dir];
    u.dy = DIR_DY[dir];
    /* #reqmenu -prefix disables autopickup during movement */
    if (game.iflags.menu_requested)
        game.context.nopick = 1;
    game.context.travel = game.context.travel1 = 0;
    if (!game.domove_attempting && !u.dz) {
        game.context.run = run;
        game.domove_attempting |= (!run ? DOMOVE_WALK : DOMOVE_RUSH);
    }
}

/* C ref: cmd.c quitchars[] */
const quitchars = " \r\n\x1b";
/* C ref: cmd.c Cmd.dirchars[] (number_pad off): DIR_W .. DIR_SW, then
   DIR_DOWN '>' and DIR_UP '<' */
const dirchars = "hykulnjb><";

// C ref: cmd.c movecmd() -- mode MV_ANY: a walk, run or rush key
// (move_funcs[][]) sets u.dx, u.dy, u.dz; returns !u.dz for a move
function movecmd(sym) {
    const u = game.u;
    let d = -1; /* DIR_ERR */
    const c = String.fromCharCode(sym);
    const lc = c.toLowerCase();

    if (dirchars.includes(c))
        d = dirchars.indexOf(c);                 /* MV_WALK, '>' and '<' */
    else if ('hykulnjb'.includes(lc))
        d = dirchars.indexOf(lc);                /* MV_RUN: shifted */
    else if (sym >= 1 && sym <= 26
             && 'hykulnjb'.includes(String.fromCharCode(sym + 96)))
        d = dirchars.indexOf(String.fromCharCode(sym + 96)); /* MV_RUSH: ^dir */

    if (d !== -1) {
        u.dx = xdir[d];
        u.dy = ydir[d];
        u.dz = zdir[d];
        return !u.dz;
    }
    u.dz = 0;
    return 0;
}

// C ref: cmd.c dxdy_moveok()
function dxdy_moveok() {
    const u = game.u;
    if (u.dx && u.dy && u.umonnum === PM_GRID_BUG) /* NODIAG(u.umonnum) */
        return false;
    return true;
}

// C ref: cmd.c getdir() -- the direction prompt; the command queue,
// the mouse ('_') and the cmdassist help window aren't ported yet
export async function getdir(s) {
    const u = game.u;
    let dirsym, is_mov;

    /* cmdq_pop(): queued directions aren't ported */
    dirsym = await tty_yn_function((s && s[0] !== '^') ? s : "In what direction?",
                                   null, '\0');
    if (typeof dirsym === 'string')
        dirsym = dirsym.charCodeAt(0);
    /* remove the prompt string so caller won't have to */
    tty_clear_nhwindow(game.WIN_MESSAGE);

    if (dirsym === 0x12) /* redraw_cmd(): ^R */
        throw new Error('getdir(): ^R redraw not ported yet');
    /* cmdq_add_key(CQ_REPEAT, dirsym): ^A repeat isn't ported */

    const ch = String.fromCharCode(dirsym);
    if (ch === '.' || ch === 's') { /* NHKF_GETDIR_SELF, NHKF_GETDIR_SELF2 */
        u.dx = u.dy = u.dz = 0;
    } else if (ch === '_') { /* NHKF_GETDIR_MOUSE */
        throw new Error('getdir(): getpos() not ported yet');
    } else if (!(is_mov = movecmd(dirsym)) && !u.dz) {
        if (!quitchars.includes(ch)) {
            /* help_dir() for '?' or iflags.cmdassist (default on):
               "Invalid direction key!" */
            throw new Error('getdir(): help_dir() not ported yet');
        }
        return 0;
    } else if (is_mov && !dxdy_moveok()) {
        await pline("You can't orient yourself that direction."); /* You_cant() */
        return 0;
    }
    if (!u.dz)
        confdir(false);
    return 1;
}
