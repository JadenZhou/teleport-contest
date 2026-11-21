// options.js — Parse .nethackrc options.
// C ref: options.c — handles OPTIONS=, BIND=, etc.
//
// The role, race, gender, alignment, name and female/male options are
// ported from options.c (optfn_role(), optfn_race(), optfn_gender(),
// optfn_alignment(), parse_role_opt(), optfn_name() and the opt_female
// boolean case), and playmode (optfn_playmode(), set_playmode()); they set
// flags.initrole &c, wizard and discover the way C does. The rest of
// this parser is still the skeleton's simplified version.

import { game } from './gstate.js';
import { ROLE_NONE, ROLE_RANDOM, RS_ROLE, RS_RACE, RS_GENDER, RS_ALGNMNT, PL_NSIZ } from './const.js';

import { strncmpi, strcmpi } from './hacklib.js';
import { authorize_wizard_mode, authorize_explore_mode } from './sys.js';
import { bind_key } from './cmd.js';
import {
    str2role, str2race, str2gend, str2align, setrolefilter, clearrolefilter,
    RS_filter,
} from './role.js';
import {
    NHW_MENU, PICK_ONE, MENU_BEHAVE_STANDARD, MENU_ITEMFLAGS_NONE,
} from './const.js';
import { NO_COLOR, ATR_NONE } from './terminal.js';
import {
    tty_create_nhwindow, tty_start_menu, tty_add_menu, add_menu_str,
    tty_end_menu, tty_select_menu, tty_destroy_nhwindow,
} from './wintty.js';

// C ref: hacklib.c mungspaces() -- collapse runs of whitespace, trim ends
function mungspaces(bp) {
    return bp.replace(/[ \t]+/g, ' ').trim();
}

// C ref: options.c parse_role_opt()
/* parse 'role' or 'race' or 'gender' or 'alignment';
   returns the value to use ("!" for a negated list), or null for failure */
function parse_role_opt(which, negated, fullname, val) {
    /*
     * Accepts multiple forms
     *  role:priest       -- play as priest
     *  race:!orc         -- any race other than orc
     *  role:!cav !mon    -- any role other than caveman/cavewoman or monk
     *  !role:tour        -- any role other than tourist
     *  !role:tou rog wiz -- any role other than tourist or rogue or wizard
     * Rejected:
     *  role:sam !val     -+ invalid; need either positive or negative subset
     *  !role:!sam        +- not a mixture of the two and not dual negation.
     */
    let result = null;

    if (val) { /* string_for_env_opt() != empty_optstr */
        let prev_negated = false, first = true;
        let op = mungspaces(val);

        while (op.length) {
            if (op[0] === ' ')
                op = op.slice(1);
            let val_negated = false;
            while (op[0] === '!' || !strncmpi(op, "no", 2)) {
                val_negated = !val_negated;
                op = op.slice((op[0] === '!') ? 1 : (op[2] !== '-') ? 2 : 3);
            }
            if (!op.length || op[0] === ' ') {
                /* config_error_add("Negated nothing for '%s'", fullname); */
                return null;
            }
            if (!first) {
                if ((val_negated !== prev_negated)
                    || (negated && val_negated)) {
                    /* "Invalid mixed negation for '%s%s'" */
                    return null;
                } else if (!negated && !val_negated) {
                    /* "Multiple role values only allowed when list is negated" */
                    return null;
                }
            }
            first = false;
            prev_negated = val_negated;

            /* hide rest of list, if any */
            const sp = op.indexOf(' ');
            const word = (sp >= 0) ? op.slice(0, sp) : op;

            const preval = game.roleoptstr?.[which];
            if (val_negated || negated) {
                /* for negative value, clear filter if there is a prior
                   value from a different phase; for same phase, duplicates
                   are allowed and setrolefilter() merges them */
                if (!preval || preval[0] !== '!')
                    clearrolefilter(which);
                if (!setrolefilter(word)) {
                    /* config_error_add("Invalid %s '%s'", fullname, op); */
                    return null;
                }
                result = '!';
            } else {
                /* save raw string value; caller will validate it and
                   if it's ok, replace it with canonical form */
                result = word;
            }
            if (!game.roleoptstr) game.roleoptstr = {};
            game.roleoptstr[which] = result;

            op = (sp >= 0) ? op.slice(sp + 1) : '';
        }
        /* '!ok' without config_error_add() implies a valid negation */
        if (result === null) result = '!';
    }
    return result;
}

// C ref: options.c optfn_role() (req == do_set)
function optfn_role(result, negated, val) {
    /* role:string */
    const op = parse_role_opt(RS_ROLE, negated, 'role', val);
    if (op === null)
        return false; /* optn_silenterr */

    if (op[0] !== '!') {
        if ((result.flags.initrole = str2role(op)) === ROLE_NONE) {
            /* config_error_add("Unknown %s '%s'", allopt[optidx].name, op); */
            return false;
        }
        result.pl_character = op.slice(0, PL_NSIZ - 1); /* Backwards compat */
    }
    return true;
}

// C ref: options.c optfn_race() (req == do_set)
function optfn_race(result, negated, val) {
    /* race:string */
    const op = parse_role_opt(RS_RACE, negated, 'race', val);
    if (op === null)
        return false;

    if (op[0] !== '!') {
        if ((result.flags.initrace = str2race(op)) === ROLE_NONE) {
            return false;
        }
        result.pl_race = op[0]; /* Backwards compatibility */
    }
    return true;
}

// C ref: options.c optfn_gender() (req == do_set)
function optfn_gender(result, negated, val) {
    /* gender:string */
    const op = parse_role_opt(RS_GENDER, negated, 'gender', val);
    if (op === null)
        return false;

    if (op[0] !== '!') {
        if ((result.flags.initgend = str2gend(op)) === ROLE_NONE) {
            return false;
        }
        result.flags.female = result.flags.initgend;
    }
    return true;
}

// C ref: options.c optfn_alignment() (req == do_set)
function optfn_alignment(result, negated, val) {
    /* alignment:string */
    const op = parse_role_opt(RS_ALGNMNT, negated, 'alignment', val);
    if (op === null)
        return false;

    if (op[0] !== '!') {
        if ((result.flags.initalign = str2align(op)) === ROLE_NONE) {
            return false;
        }
    }
    return true;
}

/* C ref: options.c unlocktypes[][2] (names only) */
const unlocktypes = ["untrap", "apply-key", "kick", "force"];

// C ref: options.c optfn_autounlock() (req == do_set; do_init sets
// AUTOUNLOCK_APPLY_KEY, which lock.js uses when the option is unset)
function optfn_autounlock(result, negated, op) {
    /* autounlock:none or autounlock:untrap+apply-key+kick+force;
       autounlock without a value is same as autounlock:apply-key and
       !autounlock is same as autounlock:none */
    if (!op) {
        result.flags.autounlock = negated ? 0 : 2; /* AUTOUNLOCK_APPLY_KEY */
        return true;
    }
    let newflags = 0;
    const sep = op.includes('+') ? '+' : ' ';
    for (let part of op.split(sep)) {
        let matched = false;
        part = part.trim();
        if ("none".startsWith(part.toLowerCase()) && part.length)
            negated = true, matched = true;
        for (let i = 0; i < unlocktypes.length && !matched; ++i) {
            /* str_start_is() or fuzzymatch(op, unlocktypes[i], " -_") */
            const fuzzy = (s) => s.toLowerCase().replace(/[ \-_]/g, '');
            if ((part.length && unlocktypes[i].startsWith(part.toLowerCase()))
                || fuzzy(part) === fuzzy(unlocktypes[i])) {
                matched = true;
                switch (part[0].toLowerCase()) {
                case 'u': newflags |= 1; break; /* AUTOUNLOCK_UNTRAP */
                case 'a': newflags |= 2; break; /* AUTOUNLOCK_APPLY_KEY */
                case 'k': newflags |= 4; break; /* AUTOUNLOCK_KICK */
                case 'f': newflags |= 8; break; /* AUTOUNLOCK_FORCE */
                default: matched = false; break;
                }
            }
        }
        if (!matched)
            return false; /* config_error_add("Invalid value ...") */
    }
    if (negated && newflags !== 0)
        return false; /* 'none' with some */
    result.flags.autounlock = negated ? 0 : newflags;
    return true;
}

// C ref: options.c optfn_playmode() (req == do_set)
/* play mode: normal, explore/discovery, or debug/wizard;
   'wizard' is flags.debug and 'discover' is flags.explore (flag.h) */
function optfn_playmode(result, negated, op) {
    const flags = result.flags;

    if (negated) /* duplicate || negated */
        return false;
    if (!op)
        return false;
    if (!strncmpi(op, "normal", 6) || !strcmpi(op, "play")) {
        flags.debug = flags.explore = false;
    } else if (!strncmpi(op, "explore", 6)
               || !strncmpi(op, "discovery", 6)) {
        flags.debug = false, flags.explore = true;
    } else if (!strncmpi(op, "debug", 5) || !strncmpi(op, "wizard", 6)) {
        flags.debug = true, flags.explore = false;
    } else {
        /* config_error_add("Invalid value for \"%s\":%s", "playmode", op); */
        return false;
    }
    return true;
}

// C ref: options.c set_playmode()
/* wizard mode access is deferred until here (after the options are read) */
export function set_playmode() {
    const g = game;
    const flags = g.flags;

    if (flags.debug) {
        if (authorize_wizard_mode()) {
            g.plname = "wizard";
            g.plnamelen = g.plname.length;
        } else
            flags.debug = false; /* not allowed or not available */
        /* try explore mode if we didn't make it into wizard mode */
        /* if requesting wizard mode when restoring a normal game, this will
           set iflags.deferred_X and prompt to activate explore mode after the
           save file has already been deleted */
        flags.explore = !flags.debug;
        g.iflags.deferred_X = false;
    }
    if (flags.explore && !authorize_explore_mode()) {
        flags.explore = g.iflags.deferred_X = false;
    }
    /* don't need to do anything special for normal play */
}

export function parseNethackrc(rc) {
    const result = {
        name: '', role: -1, race: -1, gender: -1, align: -1,
        flags: {}, iflags: {},
    };
    // C ref: options.c initoptions_init()
    /* hero's role, race, &c haven't been chosen yet */
    result.flags.initrole = result.flags.initrace = result.flags.initgend
        = result.flags.initalign = ROLE_NONE;
    result.flags.female = 0; /* boolopt 'female' defaults to off */
    result.flags.bones = true; /* boolopt 'bones' defaults to on */
    if (!rc) return result;

    for (const rawLine of rc.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        /* C ref: cfgfiles.c parse_config_line() -- BIND= (match_varname()
           of "BINDINGS", at least 4 letters) goes to cnf_line_BINDINGS(),
           i.e. parsebindings(), which the game start-up applies after
           reset_commands(TRUE) */
        const stmt = mungspaces(line).match(/^([A-Za-z_]+) ?[=:] ?(.*)$/);
        if (stmt && stmt[1].length >= 4
            && !strncmpi(stmt[1], "BINDINGS", stmt[1].length)) {
            result.bindings = result.bindings || [];
            result.bindings.push(stmt[2]);
            continue;
        }

        const optMatch = line.match(/^OPTIONS=(.+)/i);
        if (!optMatch) continue;

        for (const opt of optMatch[1].split(',')) {
            const trimmed = opt.trim();
            if (!trimmed) continue;

            const negated = trimmed.startsWith('!');
            const stripped = negated ? trimmed.slice(1) : trimmed;

            const colonIdx = stripped.indexOf(':');
            if (colonIdx >= 0) {
                const key = stripped.slice(0, colonIdx).trim().toLowerCase();
                const val = stripped.slice(colonIdx + 1).trim();

                // C ref: options.c optfn_name() -- nmcpy(svp.plname, op, PL_NSIZ)
                if (key === 'name') result.name = val.slice(0, PL_NSIZ - 1);
                else if (key === 'role' || key === 'character') {
                    if (optfn_role(result, negated, val)) result.role = result.flags.initrole;
                }
                else if (key === 'race') {
                    if (optfn_race(result, negated, val)) result.race = result.flags.initrace;
                }
                else if (key === 'gender') {
                    if (optfn_gender(result, negated, val)) result.gender = result.flags.initgend;
                }
                else if (key === 'align' || key === 'alignment') {
                    if (optfn_alignment(result, negated, val)) result.align = result.flags.initalign;
                }
                else if (key === 'playmode') optfn_playmode(result, negated, val);
                else if (key === 'pettype' || key === 'pet') {
                    result.flags.pettype = val;
                    if (val === 'none' || val === 'n') result.preferred_pet = 'n';
                    else if (val === 'dog' || val === 'd') result.preferred_pet = 'd';
                    else if (val === 'cat' || val === 'c') result.preferred_pet = 'c';
                }
                else if (key === 'symset') result.symset = val;
                else if (key === 'autounlock') optfn_autounlock(result, negated, val);
                else if (key === 'suppress_alert') result.flags.suppress_alert = val;
                else if (key === 'msg_window') result.iflags.prevmsg_window = val;
                else result.flags[key] = val;
            } else {
                // Boolean flag
                const lname = stripped.toLowerCase();
                const value = !negated;

                if (lname === 'autopickup') result.flags.pickup = value;
                else if (lname === 'color') result.flags.color = value;
                else if (lname === 'legacy') result.flags.legacy = value;
                else if (lname === 'tutorial') { result.flags.tutorial = value; result.tutorial_set = true; }
                else if (lname === 'splash_screen') result.iflags.wc_splash_screen = value;
                else if (lname === 'pushweapon') result.flags.pushweapon = value;
                else if (lname === 'showexp') result.flags.showexp = value;
                else if (lname === 'time') result.flags.time = value;
                else if (lname === 'verbose') result.flags.verbose = value;
                /* C ref: optlist.h safe_pet -> flags.safe_dog */
                else if (lname === 'safe_pet') result.flags.safe_dog = value;
                else if (lname === 'autoopen') result.flags.autoopen = value;
                else if (lname === 'mention_walls') result.flags.mention_walls = value;
                else if (lname === 'autounlock') optfn_autounlock(result, negated, '');
                // C ref: options.c boolean option case opt_female ("female",
                // alias "male"); go.opt_initial is TRUE while reading the rc
                else if (lname.length >= 3 && !strncmpi(lname, "female", Math.max(lname.length, 3)))
                    result.flags.initgend = result.flags.female = negated ? 0 : 1;
                else if (lname.length >= 3 && !strncmpi(lname, "male", Math.max(lname.length, 3)))
                    result.flags.initgend = result.flags.female = negated ? 1 : 0;
                else result.flags[lname] = value;
            }
        }
    }
    return result;
}

// C ref: options.c txt2key()
function txt2key(txt) {
    let uc;
    let makemeta = false;
    const C = (c) => (0x1f & c);
    const M = (c) => (0x80 | c);

    txt = txt.trim(); /* trimspaces() */
    if (!txt)
        return 0;

    /* simple character */
    if (txt.length === 1)
        return txt.charCodeAt(0) & 0xff;

    /* a few special entries */
    if (txt === "<enter>")
        return 0x0a;
    if (txt === "<space>")
        return 0x20;
    if (txt === "<esc>")
        return 0x1b;

    /* handle things like \b and \7 and \mX */
    if (txt[0] === '\\')
        throw new Error('txt2key(): escapes() not ported yet');

    /* control and meta keys */
    if (txt[0].toUpperCase() === 'M') { /* highc() */
        /*
         * M <nothing>             return 'M'
         * M - <nothing>           return M-'-'
         * M <other><nothing>      return M-<other>
         * otherwise M is pending until after ^/C- processing.
         * Since trailing spaces are discarded, the only way to
         * specify M-' ' is via "160".
         */
        if (txt.length === 1)
            return txt.charCodeAt(0);
        /* skip past 'M' or 'm' and maybe '-' */
        txt = txt.slice(1);
        if (txt[0] === '-' && txt.length > 1)
            txt = txt.slice(1);
        if (txt.length === 1)
            return M(txt.charCodeAt(0)) & 0xff;
        makemeta = true;
    }
    if (txt[0] === '^' || txt[0].toUpperCase() === 'C') {
        /*
         * C <nothing>             return 'C' or M-'C'
         * C - <nothing>           return '-' or M-'-'
         * C [-] <other><nothing>  return C-<other> or M-C-<other>
         * C [-] ?                 return <rubout>
         * otherwise return C-<other> or M-C-<other>
         */
        uc = txt.charCodeAt(0) & 0xff;
        if (txt.length === 1)
            return makemeta ? M(uc) : uc;
        txt = txt.slice(1);
        /* unlike M-x, lots of values of x are invalid for C-x;
           checking and rejecting them is not worthwhile; GIGO;
           we do accept "^-x" as synonym for "^x" or "C-x" */
        if (txt[0] === '-' && txt.length > 1)
            txt = txt.slice(1);
        /* and accept ^?, which gets used despite not being a control char */
        if (txt[0] === '?')
            return makemeta ? 0o377 : 0o177; /* rubout/delete */
        uc = C(txt.charCodeAt(0) & 0xff);
        return makemeta ? M(uc) : uc;
    }
    if (makemeta && txt)
        return M(txt.charCodeAt(0)) & 0xff;

    /* ascii codes: must be three-digit decimal */
    if (txt[0] >= '0' && txt[0] <= '9') {
        let key = 0;

        for (let i = 0; i < 3; i++) {
            if (!(txt[i] >= '0' && txt[i] <= '9'))
                return 0;
            key = 10 * key + txt.charCodeAt(i) - 0x30;
        }
        return key & 0xff;
    }

    return 0;
}

// C ref: options.c parsebindings()
/* parse key:command[,key2:command2,...] after BINDINGS= prefix has been
   stripped; returns False if any problem seen, True if every binding in
   the comma-separated list is successful */
export function parsebindings(bindings) {
    let bind;
    let key;
    let ret = true; /* assume success */
    const mousebtn_names = [ "mouse1", "mouse2" ];

    /* look for first comma, then decide whether it is the key being bound
       or a list element separator; if it's a key, find separator beyond it */
    if ((bind = bindings.indexOf(',')) >= 0) {
        /* at start so it represents a key */
        if (bind === 0)
            bind = bindings.indexOf(',', bind + 1);

        /* to get here, bind is not at the start, so bind[-1] is valid;
           check whether current comma happens to be for "\,:cmd" or
           "',':cmd" (":cmd" part is assumed if the comma has expected
           quoting) */
        else if (bindings[bind - 1] === '\\'
                 || (bindings[bind - 1] === '\'' && bindings[bind + 1] === '\''))
            bind = bindings.indexOf(',', bind + 2);
    }
    /* if a comma separator has been found, break off first binding from rest;
       parse the rest and then handle this first one when recursion returns */
    if (bind >= 0) {
        const rest = bindings.slice(bind + 1);
        bindings = bindings.slice(0, bind);
        if (!parsebindings(rest))
            ret = false;
    }

    /* parse a single binding: first split around : */
    if ((bind = bindings.indexOf(':')) < 0)
        return false; /* it's not a binding */
    const cmd = bindings.slice(bind + 1).trim(); /* trimspaces() */
    bindings = bindings.slice(0, bind);

    for (let i = 0; i < mousebtn_names.length; i++)
        if (bindings === mousebtn_names[i])
            throw new Error('parsebindings(): bind_mousebtn() not ported yet');

    /* read the key to be bound */
    key = txt2key(bindings);
    if (!key)
        throw new Error('parsebindings(): config_error_add() not ported yet');

    /* is it a special key? */
    if (bind_specialkey(key, cmd))
        throw new Error('parsebindings(): Cmd.spkeys[] not ported yet');

    /* is it a menu command? */
    if (default_menu_cmd_names.includes(cmd))
        throw new Error('parsebindings(): add_menu_cmd_alias() not ported yet');

    /* extended command? */
    if (!bind_key(key, cmd, true))
        throw new Error('parsebindings(): config_error_add() not ported yet');
    return ret;
}

/* C ref: options.c default_menu_cmd_info[].name */
const default_menu_cmd_names = [
    "menu_next_page", "menu_previous_page", "menu_first_page",
    "menu_last_page", "menu_select_all", "menu_invert_all",
    "menu_deselect_all", "menu_select_page", "menu_invert_page",
    "menu_deselect_page", "menu_search", "menu_shift_right",
    "menu_shift_left",
];

/* C ref: cmd.c spkeys_binds[].name, bind_specialkey() -- whether the
   command names a special key */
function bind_specialkey(key, command) {
    const spkeys_names = [
        "getdir.self", "getdir.self2", "getdir.help", "getdir.mouse",
        "count", "getpos.self", "getpos.pick", "getpos.pick.quick",
        "getpos.pick.once", "getpos.pick.verbose", "getpos.valid",
        "getpos.autodescribe", "getpos.mon.next", "getpos.mon.prev",
        "getpos.obj.next", "getpos.obj.prev", "getpos.door.next",
        "getpos.door.prev", "getpos.unexplored.next",
        "getpos.unexplored.prev", "getpos.valid.next", "getpos.valid.prev",
        "getpos.all.next", "getpos.all.prev", "getpos.help",
        "getpos.filter", "getpos.moveskip", "getpos.menu",
    ];
    void key;
    return spkeys_names.includes(command);
}

// C ref: files.c nh_basename()
function nh_basename(fname, keep_suffix) {
    let p;
    if ((p = fname.lastIndexOf('/')) >= 0)
        fname = fname.slice(p + 1);
    if ((p = fname.lastIndexOf('.')) >= 0 && !keep_suffix)
        fname = fname.slice(0, p);
    return fname;
}

// C ref: files.c get_configfile() -- the name of the configuration file
// that was read (game.configfile, set at game start-up)
function get_configfile() {
    return game.configfile || '';
}

// C ref: options.c ask_do_tutorial()
export async function ask_do_tutorial() {
    let dotut = game.flags.tutorial;

    if (!game.tutorial_set_in_config) {
        let win, n, pass = 0, selected;
        const rc = nh_basename(get_configfile(), true);
        const norc = get_configfile() === '/dev/null';
        const buf = `Put "OPTIONS=!tutorial" in ${(rc && !norc)
                     ? rc : 'your configuration file'} to skip this query.`;
        do {
            win = tty_create_nhwindow(NHW_MENU);
            tty_start_menu(win, MENU_BEHAVE_STANDARD);
            tty_add_menu(win, null, 'y', 'y', 0, ATR_NONE, NO_COLOR,
                         "Yes, do a tutorial", MENU_ITEMFLAGS_NONE);
            tty_add_menu(win, null, 'n', 'n', 0, ATR_NONE, NO_COLOR,
                         "No, just start play", MENU_ITEMFLAGS_NONE);

            add_menu_str(win, "");
            add_menu_str(win, buf);
            if (pass++) /* we'll get here after <space> or <return> */
                add_menu_str(win, "(Please choose 'y' or 'n'.)");

            tty_end_menu(win, "Do you want a tutorial?");

            ({ n, selected } = await tty_select_menu(win, PICK_ONE));
            tty_destroy_nhwindow(win);
        } while (!n);
        if (n > 0) {
            dotut = (selected[0].item === 'y');
        } else { /* ESC */
            dotut = false;
        }
    }
    return dotut;
}
