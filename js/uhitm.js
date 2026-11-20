// uhitm.js — the shared attack-damage handlers from uhitm.c, for the
// monster-hits-hero (mhitu) case: mhitm_adtyping(), mhitm_ad_phys(),
// mhitm_ad_elec(), mhitm_ad_stck(), mhitm_mgc_atk_negated() and
// mhitm_knockback().  The hero-attacks (uhitm) and monster-vs-monster
// (mhitm) branches still live in mhitm.js or aren't ported yet; they
// throw a 'not ported yet' error here.

import { game } from './gstate.js';
import { rn2 } from './rng.js';
import { pline } from './display.js';
import { Monnam } from './mhitm.js';
import { hitmsg, magic_negation } from './mhitu.js';
import { exercise } from './attrib.js';
import * as M from './monsters.js';
import { mons, AT_CLAW, AT_KICK, AT_BUTT, AT_WEAP, AT_HUGS, AT_ENGL, AT_TUCH,
         AD_PHYS, AD_ELEC, AD_STCK } from './monsters.js';
import { M_ATTK_HIT, SHOCK_RES, M_SEEN_ELEC, A_STR, INVIS } from './const.js';
import { couldsee } from './vision.js';
import { perceives } from './mondata.js';

function sgn(n) { return n < 0 ? -1 : n > 0 ? 1 : 0; }
/* C ref: mondata.c attacktype() */
function attacktype(ptr, atyp) {
    return ptr.mattk.some((a) => a.aatyp === atyp);
}
/* C ref: mondata.c sticks() */
function sticks(ptr) {
    return attacktype(ptr, AT_ENGL) || attacktype(ptr, AT_HUGS)
        || ptr.mattk.some((a) => a.adtyp === AD_STCK);
}
/* C ref: youprop.h Shock_resistance */
function Shock_resistance() {
    const p = game.u.uprops[SHOCK_RES];
    return !!((p.intrinsic || p.extrinsic) && !p.blocked);
}
/* C ref: hack.h m_next2u() */
function m_next2u(mon) {
    return Math.abs(mon.mx - game.u.ux) <= 1 && Math.abs(mon.my - game.u.uy) <= 1;
}

// C ref: mon.c set_ustuck()
export function set_ustuck(mtmp) {
    const u = game.u;
    game.disp_botl = true;
    u.ustuck = mtmp;
    if (!u.ustuck) {
        u.uswallow = 0;
        u.uswldtim = 0;
    }
}

// C ref: mondata.c monstseesu()
/* Monsters in line of sight learn hero resistance to M_SEEN_foo */
function monstseesu(seenres) {
    if (!seenres || game.u.uswallow)
        return;
    for (let mtmp = game.fmon; mtmp; mtmp = mtmp.nmon)
        if (mtmp.mhp > 0 && m_canseeu_nyi(mtmp))
            mtmp.seen_resistance |= seenres;
}
// C ref: mondata.c monstunseesu()
/* Monsters in line of sight forget hero resistance to M_SEEN_foo */
function monstunseesu(seenres) {
    if (!seenres || game.u.uswallow)
        return;
    for (let mtmp = game.fmon; mtmp; mtmp = mtmp.nmon)
        if (mtmp.mhp > 0 && m_canseeu_nyi(mtmp))
            mtmp.seen_resistance &= ~seenres;
}
/* C ref: monmove.h m_canseeu() -- only the cases that don't need
   invisibility/underwater/burial handling */
function m_canseeu_nyi(m) {
    const u = game.u;
    if (u.uinwater || u.uburied || m.mburied)
        throw new Error('monstunseesu(): m_canseeu() underwater/buried not ported yet');
    return m_canseeu_couldsee(m);
}
function m_canseeu_couldsee(m) {
    const p = game.u.uprops[INVIS];
    const Invis = !!((p.intrinsic || p.extrinsic) && !p.blocked);
    return (!Invis || perceives(m.data)) ? couldsee(m.mx, m.my) : false;
}

// C ref: uhitm.c mhitm_mgc_atk_negated()
function mhitm_mgc_atk_negated(magr, mdef, verbosely) {
    /* mcan doesn't apply to youmonst; hero can't be cancelled */
    if (magr !== game.youmonst && magr.mcan)
        return { negated: true, msg: false }; /* no message if cancelled */

    const armpro = magic_negation(mdef);
    const negated = !(rn2(10) >= 3 * armpro);
    if (negated) {
        /* attack has been thwarted by negation, aka magical cancellation */
        return { negated: true, msg: !!verbosely };
    }
    return { negated: false, msg: false };
}
/* the message half of mhitm_mgc_atk_negated(), which needs to await */
async function mgc_atk_negated(magr, mdef, verbosely) {
    const r = mhitm_mgc_atk_negated(magr, mdef, verbosely);
    if (r.negated && r.msg) {
        if (mdef === game.youmonst)
            await pline('You avoid harm.');
        else
            throw new Error('mhitm_mgc_atk_negated(): monster defender message not ported yet');
    }
    return r.negated;
}

// C ref: uhitm.c mhitm_ad_phys()
async function mhitm_ad_phys(magr, mattk, mdef, mhm) {
    const u = game.u;
    const pa = magr.data;
    const pd = mdef.data;

    if (magr === game.youmonst) {
        throw new Error('mhitm_ad_phys(): uhitm branch not ported yet');
    } else if (mdef === game.youmonst) {
        /* mhitu */
        if (mattk.aatyp === AT_HUGS && !sticks(pd)) {
            if (!u.ustuck && rn2(2)) {
                throw new Error('mhitm_ad_phys(): u_slip_free()/grab not ported yet');
            } else if (u.ustuck === magr) {
                exercise(A_STR, false);
                await pline(`You are being ${(pa === mons[M.PM_ROPE_GOLEM]) ? 'choked' : 'crushed'}.`);
            }
        } else { /* hand to hand weapon */
            const otmp = magr.mw || null; /* MON_WEP(magr) */

            if (mattk.aatyp === AT_WEAP && otmp) {
                throw new Error('mhitm_ad_phys(): monster weapon hit on hero (dmgval()) not ported yet');
            } else if (mattk.aatyp !== AT_TUCH || mhm.damage !== 0
                       || magr !== u.ustuck) {
                await hitmsg(magr, mattk);
                mhm.hitflags |= M_ATTK_HIT;
            }
        }
    } else {
        throw new Error('mhitm_ad_phys(): mhitm branch is in mhitm.js');
    }
}

// C ref: uhitm.c mhitm_ad_elec()
async function mhitm_ad_elec(magr, mattk, mdef, mhm) {
    if (magr === game.youmonst) {
        throw new Error('mhitm_ad_elec(): uhitm branch not ported yet');
    } else if (mdef === game.youmonst) {
        /* mhitu */
        await hitmsg(magr, mattk);
        if (!await mgc_atk_negated(magr, mdef, true)) {
            await pline('You get zapped!');
            if (Shock_resistance()) {
                await pline('The zap doesn\'t shock you!');
                monstseesu(M_SEEN_ELEC);
                mhm.damage = 0;
            } else {
                monstunseesu(M_SEEN_ELEC);
            }
            if (magr.m_lev > rn2(20))
                throw new Error('mhitm_ad_elec(): destroy_items() not ported yet');
        } else
            mhm.damage = 0;
    } else {
        throw new Error('mhitm_ad_elec(): mhitm branch not ported yet');
    }
}

// C ref: uhitm.c mhitm_ad_stck()
async function mhitm_ad_stck(magr, mattk, mdef, mhm) {
    const negated = await mgc_atk_negated(magr, mdef, false);
    const pd = mdef.data;
    const barbs = (magr.data === mons[M.PM_BARBED_DEVIL]);

    void mhm;
    if (magr === game.youmonst) {
        throw new Error('mhitm_ad_stck(): uhitm branch not ported yet');
    } else if (mdef === game.youmonst) {
        /* mhitu */
        await hitmsg(magr, mattk);
        if (!negated && !game.u.ustuck && !sticks(pd)) {
            set_ustuck(magr);
            if (barbs)
                await pline('The barbs stick to you!');
        }
    } else {
        throw new Error('mhitm_ad_stck(): mhitm branch not ported yet');
    }
}

// C ref: uhitm.c mhitm_adtyping()
export async function mhitm_adtyping(magr, mattk, mdef, mhm) {
    switch (mattk.adtyp) {
    case AD_PHYS: await mhitm_ad_phys(magr, mattk, mdef, mhm); break;
    case AD_ELEC: await mhitm_ad_elec(magr, mattk, mdef, mhm); break;
    case AD_STCK: await mhitm_ad_stck(magr, mattk, mdef, mhm); break;
    default:
        throw new Error(`mhitm_adtyping(): damage type ${mattk.adtyp} vs hero not ported yet`);
    }
}

// C ref: uhitm.c mhitm_knockback() -- the hero-as-defender case
export function mhitm_knockback(magr, mdef, mattk, mhm, weapon_used) {
    const knockdistance = rn2(3) ? 1 : 2; /* 67%: 1 step, 33%: 2 steps */
    let chance = 6; /* 1/6 chance of attack knocking back a monster */
    const u_agr = (magr === game.youmonst);
    const u_def = (mdef === game.youmonst);
    const wep = weapon_used ? (u_agr ? game.uwep : magr.mw) : null;

    if (wep && wep.oartifact)
        throw new Error('mhitm_knockback(): artifact weapons not ported yet');
    void chance;

    if (rn2(chance))
        return false;

    /* only certain attacks qualify for knockback */
    if (!((mattk.adtyp === AD_PHYS)
          && (mattk.aatyp === AT_CLAW
              || mattk.aatyp === AT_KICK
              || mattk.aatyp === AT_BUTT
              || mattk.aatyp === AT_WEAP)))
        return false;

    /* don't knockback if attacker also wants to grab or engulf */
    if (attacktype(magr.data, AT_ENGL)
        || attacktype(magr.data, AT_HUGS)
        || sticks(magr.data))
        return false;

    if (!u_def || u_agr)
        throw new Error('mhitm_knockback(): non-hero defender is in mhitm.js');
    const dx = sgn(game.u.ux - magr.mx);
    const dy = sgn(game.u.uy - magr.my);
    void dx; void dy; void knockdistance; void mhm; void m_next2u;
    /* can't move most targets into or out of a doorway diagonally */
    throw new Error('mhitm_knockback(): test_move() for hero not ported yet');
}
