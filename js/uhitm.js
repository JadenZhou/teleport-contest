// uhitm.js -- hero attacks a monster (C ref: uhitm.c).
//
// Ported so far: do_attack() up to the safemon (pet/peaceful
// displacement) branch.  attack_checks(), find_roll_to_hit(), hitum(),
// hmon() and the rest of the melee attack are not ported yet.

import { game } from './gstate.js';
import { rn2, rnd } from './rng.js';
import { pline } from './display.js';
import { canspotmon } from './display.js';
import { IS_OBSTRUCTED, CONFUSION, STUNNED, HALLUC } from './const.js';
import { mons, PM_LONG_WORM, PM_LONG_WORM_TAIL } from './monsters.js';
import { passes_walls } from './mondata.js';
import { ART_STORMBRINGER } from './artilist.js';
import { Monnam, y_monnam } from './do_name.js';
import { highc } from './hacklib.js';
import { monflee } from './monmove.js';

function uhave(prop) {
    const p = game.u?.uprops?.[prop];
    return !!(p && (p.intrinsic || p.extrinsic));
}
/* C ref: youprop.h Punished */
function Punished() { return !!game.uball; }
/* C ref: obj.h u_wield_art(), is_art() */
function u_wield_art(art) { return !!(game.uwep && game.uwep.oartifact === art); }
/* C ref: mondata.h is_longworm() */
function is_longworm(ptr) {
    return ptr === mons[PM_LONG_WORM] || ptr === mons[PM_LONG_WORM_TAIL];
}
/* C ref: monst.h helpless() */
function helpless(mon) { return !!(mon.msleeping || !mon.mcanmove); }

// C ref: display.h is_safemon() (_is_safemon)
export function is_safemon(mon) {
    return !!(game.flags.safe_dog && mon && mon.mpeaceful && canspotmon(mon)
              && !uhave(CONFUSION) && !uhave(HALLUC) && !uhave(STUNNED));
}

/* C ref: pline.c You() -- pline() with "You " prepended */
async function You(line) {
    await pline(`You ${line}`);
}

// C ref: hack.c end_running() -- the run/travel/multi-turn state it
// clears isn't ported yet (context.run is never set)
function end_running(and_travel) {
    const ctx = game.context;
    ctx.run = 0;
    if (and_travel) { ctx.travel = ctx.travel1 = 0; ctx.mv = false; }
    if (game.multi > 0)
        game.multi = 0;
}

// C ref: uhitm.c do_attack()
/* try to attack; return False if monster evaded;
   u.dx and u.dy must be set */
export async function do_attack(mtmp) {
    const u = game.u;
    const ctx = game.context;

    /* This section of code provides protection against accidentally
     * hitting peaceful (like '@') and tame (like 'd') monsters.
     * ... if its tame and safepet, (and protected 07/92) then we assume
     * that you're not trying to attack. Instead, you'll usually just
     * swap places if this is a movement command
     */
    /* Intelligent chaotic weapons (Stormbringer) want blood */
    if (is_safemon(mtmp) && !ctx.forcefight) {
        if (!u_wield_art(ART_STORMBRINGER)) {
            /* There are some additional considerations: this won't work
             * if in a shop or Punished or you miss a random roll or
             * if you can walk thru walls and your pet cannot (KAA) or
             * if your pet is a long worm with a tail.
             * There's also a chance of displacing a "frozen" monster:
             * sleeping monsters might magically walk in their sleep.
             */
            const foo = (Punished() || !rn2(7)
                         || (is_longworm(mtmp.data) && mtmp.wormno)
                         || (IS_OBSTRUCTED(game.level.at(u.ux, u.uy).typ)
                             && !passes_walls(mtmp.data)));
            let inshop = false;

            /* only check for in-shop if don't already have reason to stop */
            if (!foo) {
                /* in_rooms(mtmp->mx, mtmp->my, SHOPBASE) and
                   tended_shop(): shops aren't ported yet */
                if (game.level.flags?.has_shop)
                    throw new Error('do_attack(): in_rooms(SHOPBASE) not ported yet');
            }
            if (inshop || foo) {
                if (!ctx.travel && !ctx.run)
                    if (canspotmon(mtmp) && mtmp.isshk)
                        throw new Error('do_attack(): dopay() not ported yet');

                if (mtmp.mtame) /* see 'additional considerations' above */
                    monflee(mtmp, rnd(6), false, false);
                let buf = y_monnam(mtmp);
                buf = highc(buf[0]) + buf.slice(1);
                await You(`stop.  ${buf} is in the way!`);
                end_running(true);
                return true;
            } else if (mtmp.mfrozen || helpless(mtmp)
                       || (mtmp.data.mmove === 0 && rn2(6))) {
                await pline(`${Monnam(mtmp)} doesn't seem to move!`);
                end_running(true);
                return true;
            } else
                return false;
        }
    }

    /* possibly set in attack_checks;
       examined in known_hitum, called via hitum or hmonas below */
    game.override_confirmation = false;
    /* attack_checks() used to use <u.ux+u.dx,u.uy+u.dy> directly, now
       it uses gb.bhitpos instead; it might map an invisible monster there */
    game.bhitpos = { x: u.ux + u.dx, y: u.uy + u.dy };
    game.notonhead = (game.bhitpos.x !== mtmp.mx || game.bhitpos.y !== mtmp.my);
    throw new Error('do_attack(): attack_checks() not ported yet');
}
