// u_init.js — hero initialization.
// C ref: u_init.c
//
// Ported so far: u_init_misc(). u_init_inventory_attrs() and
// u_init_skills_discoveries() are not ported yet.

import { game } from './gstate.js';
import { rn2 } from './rng.js';
import {
    NON_PM, LAST_PROP, MAXULEV, A_MAX, A_CURRENT, A_ORIGINAL, NO_SPELL,
    FROMOUTSIDE, BLINDED, RIGHT_HANDED, LEFT_HANDED,
} from './const.js';
import { MAXSPELL } from './objects.js';
import { aligns } from './role.js';
import { set_uasmon } from './polyself.js';
import { newhp, adjabil } from './attrib.js';
import { newpw } from './exper.js';
import { init_uhunger } from './eat.js';
import { max_rank_sz } from './botl.js';

// C ref: you.h struct you -- the JS equivalent of memset(&u, 0, sizeof u).
// Every numeric field reads as 0, nested structs are zero-filled objects.
function zero_you() {
    const attribs = () => ({ a: new Array(A_MAX).fill(0) });
    const d_level = () => ({ dnum: 0, dlevel: 0 });
    return {
        ux: 0, uy: 0, dx: 0, dy: 0, dz: 0, tx: 0, ty: 0, ux0: 0, uy0: 0,
        uz: d_level(), uz0: d_level(), utolev: d_level(), utotype: 0,
        ucamefrom: d_level(), umoved: false, last_str_turn: 0,
        ulevel: 0, ulevelmax: 0, ulevelpeak: 0, utrap: 0, utraptype: 0,
        urooms: '', urooms0: '', uentered: '', ushops: '', ushops0: '',
        ushops_entered: '', ushops_left: '',
        uhunger: 0, uhs: 0,
        uprops: Array.from({ length: LAST_PROP + 1 },
                           () => ({ extrinsic: 0, intrinsic: 0, blocked: 0 })),
        umconf: 0, usick_type: 0,
        nv_range: 0, xray_range: 0, unblind_telepat_range: 0,
        bglyph: 0, cglyph: 0, bc_order: 0, bc_felt: 0,
        umonster: 0, umonnum: 0, mh: 0, mhmax: 0, mtimedone: 0,
        macurr: attribs(), mamax: attribs(), ulycn: 0,
        ucreamed: 0, uswldtim: 0, uswallow: 0, uinwater: 0, uundetected: 0,
        mfemale: 0, uinvulnerable: 0, uburied: 0, uedibility: 0,
        uhandedness: 0, udg_cnt: 0,
        uevent: {}, uhave: {}, uconduct: {}, uroleplay: {},
        acurr: attribs(), aexe: attribs(), abon: attribs(), amax: attribs(),
        atemp: attribs(), atime: attribs(),
        ualign: { type: 0, record: 0 }, ualignbase: [0, 0],
        uluck: 0, moreluck: 0, uhitinc: 0, udaminc: 0, uac: 0,
        uspellprot: 0, usptime: 0, uspmtime: 0,
        uhp: 0, uhpmax: 0, uhppeak: 0, uen: 0, uenmax: 0, uenpeak: 0,
        uhpinc: new Array(MAXULEV).fill(0), ueninc: new Array(MAXULEV).fill(0),
        ugangr: 0, ugifts: 0, ublessed: 0, ublesscnt: 0, umoney0: 0,
        uexp: 0, urexp: 0, ucleansed: 0, usleep: 0, uinvault: 0,
        ustuck: null, usteed: null, ustuck_mid: 0,
        umortality: 0, ugrave_arise: 0, umovement: 0, mcham: 0,
    };
}

// C ref: u_init.c u_init_misc()
export function u_init_misc() {
    const g = game;
    const flags = g.flags;
    let i;
    const tmpuroleplay = g.u?.uroleplay || {}; /* set by rcfile options */

    flags.female = flags.initgend;
    flags.beginner = true;

    /* zero u, including pointer values --
     * necessary when aborting from a failed restore */
    g.u = zero_you();
    const u = g.u;
    u.ustuck = null;
    g.ubirthday = 0; /* memset(&ubirthday, 0, ...) */
    g.urealtime = { realtime: 0, start_timing: 0, finish_time: 0 };

    u.uroleplay = tmpuroleplay; /* restore options set via rcfile */

    u.uz.dlevel = 1;
    u.uz0.dlevel = 0;
    u.utolev = { ...u.uz };

    u.umoved = false;
    u.umortality = 0;
    u.ugrave_arise = NON_PM;

    u.umonnum = u.umonster = g.urole.mnum;
    u.ulycn = NON_PM;
    set_uasmon();

    u.ulevel = 0; /* set up some of the initial attributes */
    u.uhp = u.uhpmax = u.uhppeak = newhp();
    u.uen = u.uenmax = u.uenpeak = newpw();
    u.uspellprot = 0;
    adjabil(0, 1);
    u.ulevel = u.ulevelmax = 1;

    init_uhunger();
    g.spl_book = [];
    for (i = 0; i <= MAXSPELL; i++)
        g.spl_book[i] = { sp_id: NO_SPELL, sp_lev: 0, sp_know: 0 };
    u.ublesscnt = 300; /* no prayers just yet */
    u.ualignbase[A_CURRENT] = u.ualignbase[A_ORIGINAL] = u.ualign.type =
        aligns[flags.initalign].value;

    /* Route through getnow() so fixed datetime also controls ubirthday. */
    /* ubirthday = getnow(); -- calendar.c not ported yet */

    /*
     *  For now, everyone starts out with a night vision range of 1 and
     *  their xray_range disabled.
     */
    u.nv_range = 1;
    u.xray_range = -1;
    u.unblind_telepat_range = -1;

    /* OPTIONS:blind results in permanent blindness (unless overridden
       by the Eyes of the Overworld, which will clear 'u.uroleplay.blind'
       to void the conduct, but will leave the PermaBlind bit set so that
       blindness resumes when the Eyes are removed). */
    if (u.uroleplay.blind)
        u.uprops[BLINDED].intrinsic |= FROMOUTSIDE; /* set PermaBlind */

    /* roughly based on distribution in human population */
    u.uhandedness = rn2(10) ? RIGHT_HANDED : LEFT_HANDED;

    max_rank_sz(); /* set max str size for class ranks */

    return;
}
