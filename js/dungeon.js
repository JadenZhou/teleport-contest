// dungeon.js — dungeon structure and level bookkeeping.
// C ref: dungeon.c
//
// Only the ledger helpers that o_init.c's setgemprobs() uses are ported so
// far. svd.dungeons[] and svn.n_dgns live on the game object as
// game.dungeons and game.n_dgns; init_dungeons() (not ported yet) fills them.

import { game } from './gstate.js';

// C ref: dungeon.c ledger_no()
/* Return the ledger number for a dungeon level, used as an index for
   save/restore. */
export function ledger_no(lev) {
    return lev.dlevel + game.dungeons[lev.dnum].ledger_start;
}

// C ref: dungeon.c maxledgerno()
/* The last level in the bookkeeping list of levels is the bottom of the
   last dungeon in the svd.dungeons[] array. */
export function maxledgerno() {
    return game.dungeons[game.n_dgns - 1].ledger_start
        + game.dungeons[game.n_dgns - 1].num_dunlevs;
}
