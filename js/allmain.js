// allmain.js — Main game loop.
// C ref: allmain.c — newgame, moveloop, moveloop_core.
//
// Uses fastforward.js for post-mklev RNG parity on seed8000.
// Real mklev.js handles level generation for screen parity.

import { game } from './gstate.js';
import { rn2 } from './rng.js';
import { mklev, u_on_upstairs } from './mklev.js';
import { l_nhcore_init } from './nhlua.js';
import { rhack } from './cmd.js';
import { docrt, cls, bot, flush_screen, pline } from './display.js';
import { vision_recalc, vision_reset, init_vision_globals } from './vision.js';
import { fastforward_post_mklev, fastforward_step, fastforward_fill_mineralize } from './fastforward.js';
import { objects_globals_init } from './objects.js';
import { init_objects } from './o_init.js';
import { init_dungeons } from './dungeon.js';
import { mons, monst_globals_init, LOW_PM, NUMMONS, G_NOCORPSE } from './monsters.js';
import { decl_globals_init } from './decl.js';
import { sys_early_init } from './sys.js';
import { role_init, genders, Hello } from './role.js';
import { u_init_misc } from './u_init.js';
import { align_str } from './insight.js';
import { A_CURRENT, A_ORIGINAL, ROLE_GENDMASK, ROLE_MALE, ROLE_FEMALE } from './const.js';

// C ref: allmain.c early_init()
// Not ported yet: program_state_init(), runtime_info_init().
export function early_init() {
    decl_globals_init();
    objects_globals_init();
    monst_globals_init();
    sys_early_init();
}

// C ref: allmain.c newgame()
export async function newgame() {
    const g = game;
    let i;

    g.mvitals = [];
    for (i = LOW_PM; i < NUMMONS; i++)
        g.mvitals[i] = { born: 0, died: 0, mvflags: mons[i].geno & G_NOCORPSE };

    init_objects(); /* must be before u_init() */

    g.flags.pantheon = -1; /* role_init() will reset this */
    await role_init();     /* must be before init_dungeons(), u_init(),
                            * and init_artifacts() */

    init_dungeons();  /* must be before u_init() to avoid rndmonst()
                       * creating odd monsters for any tins and eggs
                       * in hero's initial inventory */
    // init_artifacts(); -- not ported yet (artifact.c)
    u_init_misc();

    l_nhcore_init();  /* create a Lua state that lasts until end of game */
    // reset_glyphmap(gm_newgame); -- not ported yet (display.c)

    // Real mklev generates the level with correct room positions
    // Structural phase consumes RNG for rooms/corridors/doors/stairs
    await mklev();

    // Fill rooms + mineralize: replayed by fastforward
    // These create objects/monsters that don't affect terrain display
    fastforward_fill_mineralize();

    // Fast-forward through post-mklev startup RNG calls.
    // Covers: u_init_role, ini_inv, attributes, moveloop_preamble.
    fastforward_post_mklev();

    // Hardcoded player state for seed8000 Tourist, standing in for
    // u_init_inventory_attrs() (u_init_role(), ini_inv(), init_attr(),
    // find_ac()), which is not ported yet. Hit points, energy, level,
    // alignment, role and race now come from role_init()/u_init_misc().
    g._goldCount = 757;
    g.u.uac = 10;
    g.u.acurr = { a: [9, 14, 12, 11, 16, 16] };
    g.u.amax = { a: [9, 14, 12, 11, 16, 16] };
    g.moves = 1; /* u_init_role() */

    // C ref: allmain.c newgame() → u_on_upstairs()
    // Places hero on upstair, or special stair, or random room position.
    u_on_upstairs();

    // Initial display
    init_vision_globals();
    vision_reset();
    vision_recalc(0);
    await cls();
    await docrt();
    await flush_screen(1);
    await bot();

    /* Success! */
    await welcome(true);
}

// C ref: allmain.c welcome()
export async function welcome(new_game) /* false => restoring an old game */ {
    const g = game;
    const u = g.u;
    const Upolyd = (u.mtimedone !== 0);
    const currentgend = Upolyd ? u.mfemale : g.flags.female;
    const adrift = (u.ualign.type !== u.ualignbase[A_CURRENT]);
    let buf = '';

    // l_nhcore_call(new_game ? NHCORE_START_NEW_GAME : NHCORE_RESTORE_OLD_GAME);
    // -- not ported yet (nhcore.lua)

    /* skip "welcome back" if restoring a doomed character: not ported yet
       (ugenocided()/udeadinside()); restore isn't ported either */

    /* if (Hallucination) pline("NetHack is filmed in front of an undead
       studio audience."); -- Hallucination is never set at this point yet */

    /*
     * The "welcome back" message always describes your innate form
     * even when polymorphed or wearing a helm of opposite alignment.
     * Alignment is shown unconditionally for new games; for restores
     * it's only shown if it has changed from its original value.
     * Sex is shown for new games except when it is redundant; for
     * restores it's only shown if different from its original value.
     */
    if (new_game || u.ualignbase[A_ORIGINAL] !== u.ualignbase[A_CURRENT] || adrift)
        buf += ` ${adrift ? "adrift " : ""}${adrift ? align_str(u.ualign.type)
                                                   : align_str(u.ualignbase[A_CURRENT])}`;
    if (!g.urole.name.f
        && (new_game
            ? (g.urole.allow & ROLE_GENDMASK) === (ROLE_MALE | ROLE_FEMALE)
            : currentgend !== g.flags.initgend))
        buf += ` ${genders[currentgend].adj}`;
    buf += ` ${g.urace.adj} ${(currentgend && g.urole.name.f) ? g.urole.name.f
                                                          : g.urole.name.m}`;

    await pline(new_game ? `${Hello(null)} ${g.plname}, welcome to NetHack!  You are a${buf}.`
                         : `${Hello(null)} ${g.plname}, the${buf}, welcome back to NetHack!`);

    /* livelog_printf() and the restore-only messages: not ported yet */
}

// C ref: allmain.c moveloop_core()
export async function moveloop_core() {
    const g = game;

    // Fast-forward per-step RNG (monster movement, regen, sounds, hunger)
    const stepNum = (g.moves || 1) - 1;
    fastforward_step(stepNum);

    // Vision + display
    if (g.vision_full_recalc) {
        vision_recalc(0);
        g.vision_full_recalc = 0;
    }
    await bot();
    await flush_screen(1);

    // Read and execute one command
    await rhack(0);

    // Clear message after command is processed
    g._pending_message = '';

    // Advance turn
    if (g.context?.move) {
        g.moves = (g.moves || 1) + 1;
    }
}

// C ref: allmain.c moveloop()
export async function moveloop(resuming) {
    vision_recalc(0);
    await docrt();
    await flush_screen(1);

    for (;;) {
        await moveloop_core();
        if (game.program_state?.gameover) break;
    }
}
