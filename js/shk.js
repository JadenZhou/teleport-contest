// shk.js -- shopkeepers: shop entry and exit, shopkeeper movement,
// billing and paying.
// C ref: shk.c
//
// Paths no session reaches yet throw a 'not ported yet' error.

import { game } from './gstate.js';
import { rn2 } from './rng.js';
import {
    SHOPBASE, NO_ROOM, ROOMOFFSET, IS_ROOM, PL_NSIZ, EYE, HAND, BOLT_LIM,
    REPAIR_DELAY, INVIS, DISPLACED, CONFLICT, DEAF, FAST, PASSES_WALLS,
    BLINDED, TELEPAT, DETECT_MONSTERS, M_AP_NOTHING, M_AP_MONSTER, u_at,
} from './const.js';
import { mons, PM_GRID_BUG, PM_ROGUE, MS_ANIMAL, M1_HUMANOID, S_DOG,
         S_FELINE, S_RODENT, S_YETI } from './monsters.js';
import { PICK_AXE, DWARVISH_MATTOCK } from './objects.js';
import { pline, You, Your, pline_The, canseemon, canspotmon,
         sensemon } from './display.js';
import { dist2, s_suffix } from './hacklib.js';
import { in_rooms, check_special_room } from './hack.js';
import { on_level } from './dungeon.js';
import { m_at, sobj_at } from './makemon.js';
import { carrying } from './invent.js';
import { mattacku } from './mhitu.js';
import { dochug, m_canseeu } from './monmove.js';
import { move_special } from './priest.js';
import { holetime } from './dig.js';
import { Hello, genders } from './role.js';
import { Shknam, shkname, shtypes } from './shknam.js';
import { y_monnam, pronoun_gender, PRONOUN_NO_IT,
         PRONOUN_HALLU } from './do_name.js';
import { adjalign, ACURR } from './attrib.js';
import { record_achievement } from './do.js';
import { discover_object } from './o_init.js';
import { t_at } from './trap.js';
import { passes_walls } from './mondata.js';
import { wake_nearto } from './mon.js';
import { A_CHA } from './const.js';
import { rnd } from './rng.js';

// ── small helpers (C ref: youprop.h / monst.h / shk.c macros) ──

/* C ref: youprop.h -- (H* || E*) && !B* */
function uhave(prop) {
    const p = game.u.uprops[prop];
    return !!(p && (p.intrinsic || p.extrinsic) && !p.blocked);
}
function Invis() { return uhave(INVIS); }
/* C ref: youprop.h Displaced, Conflict, Fast -- (H* || E*) */
function Displaced() {
    const p = game.u.uprops[DISPLACED];
    return !!(p && (p.intrinsic || p.extrinsic));
}
function Conflict() {
    const p = game.u.uprops[CONFLICT];
    return !!(p && (p.intrinsic || p.extrinsic));
}
function Fast() {
    const p = game.u.uprops[FAST];
    return !!(p && (p.intrinsic || p.extrinsic));
}
/* C ref: youprop.h Deaf */
function Deaf() {
    const p = game.u.uprops[DEAF];
    return !!(p && (p.intrinsic || p.extrinsic || game.u.uroleplay?.deaf));
}
/* C ref: youprop.h Blind -- display.js has the full test */
function Blind() {
    const p = game.u.uprops[BLINDED];
    return !!(p && (p.intrinsic || p.extrinsic) && !p.blocked);
}
function Passes_walls() {
    const p = game.u.uprops[PASSES_WALLS];
    return !!(p && (p.intrinsic || p.extrinsic));
}
/* C ref: youprop.h Blind_telepat, Detect_monsters */
function Blind_telepat() {
    const p = game.u.uprops[TELEPAT];
    return !!(p && (p.intrinsic || p.extrinsic));
}
function Detect_monsters() {
    const p = game.u.uprops[DETECT_MONSTERS];
    return !!(p && (p.intrinsic || p.extrinsic));
}
/* C ref: role.h Role_if() */
function Role_if(pm) { return game.urole.mnum === pm; }
/* C ref: monst.h helpless() */
function helpless(mon) { return !!(mon.msleeping || !mon.mcanmove); }
/* C ref: shk.c NOTANGRY(), ANGRY() */
function ANGRY(mon) { return !mon.mpeaceful; }
/* C ref: shk.c muteshk() */
function muteshk(shkp) {
    return helpless(shkp) || shkp.data.msound <= MS_ANIMAL;
}
/* C ref: shk.c IS_SHOP() */
function IS_SHOP(x) { return game.level.rooms[x].rtype >= SHOPBASE; }
/* C ref: hack.h distu() */
function distu(x, y) { return dist2(x, y, game.u.ux, game.u.uy); }
/* C ref: hack.h mdistu() */
function mdistu(mon) { return dist2(mon.mx, mon.my, game.u.ux, game.u.uy); }
/* C ref: hacklib.c online2(); hack.h onlineu() */
function online2(x0, y0, x1, y1) {
    const dx = x0 - x1, dy = y0 - y1;
    return (!dy || !dx || dy === dx || dy === -dx);
}
function onlineu(xx, yy) { return online2(xx, yy, game.u.ux, game.u.uy); }
/* C ref: hacklib.c plur() */
function plur(x) { return (x === 1) ? "" : "s"; }
/* C ref: hacklib.c strncmpi() -- nonzero when the strings differ */
function strncmpi(s1, s2, n) {
    return (s1 || '').slice(0, n).toLowerCase()
           !== (s2 || '').slice(0, n).toLowerCase();
}
/* C ref: you.h noit_mhis(), noit_mhe() */
function noit_mhis(mtmp) {
    return genders[pronoun_gender(mtmp, PRONOUN_NO_IT | PRONOUN_HALLU)].his;
}
function noit_mhe(mtmp) {
    return genders[pronoun_gender(mtmp, PRONOUN_NO_IT | PRONOUN_HALLU)].he;
}
/* C ref: polyself.c mbodypart() -- humanoid monsters (shopkeepers) only */
function mbodypart(mon, part) {
    const mptr = mon.data;
    if (!(mptr.mflags1 & M1_HUMANOID) || mptr.mlet === S_DOG
        || mptr.mlet === S_FELINE || mptr.mlet === S_RODENT
        || mptr.mlet === S_YETI || mptr === mons[PM_GRID_BUG])
        throw new Error('mbodypart(): non-humanoid shopkeeper not ported yet');
    const humanoid_parts = [ "arm",       "eye",  "face",         "finger",
                             "fingertip", "foot", "hand",         "handed",
                             "head",      "leg",  "light headed", "neck",
                             "spine",     "toe",  "hair",         "blood",
                             "lung",      "nose", "stomach" ];
    return humanoid_parts[part];
}
/* C ref: pline.c verbalize() -- SetVoice() only matters for speech
   output, which the tty doesn't do */
async function verbalize(line) {
    if (Deaf())
        return; /* vpline(): PLINE_VERBALIZE is dropped when Deaf */
    await pline(`"${line}"`);
}
/* C ref: mondata.c resist_conflict() */
function resist_conflict(mtmp) {
    /* always a small chance at 19 */
    const resist_chance = Math.min(19, (ACURR(A_CHA) - mtmp.m_lev
                                        + game.u.ulevel));

    return (rnd(20) > resist_chance);
}
/* C ref: hack.h makeknown() */
function makeknown(x) { discover_object(x, true, true, true); }

const angrytexts = [ "quite upset", "ticked off", "furious" ];

// C ref: shk.c next_shkp()
export function next_shkp(shkp, withbill) {
    for (; shkp; shkp = shkp.nmon) {
        if (shkp.mhp < 1) /* DEADMONSTER */
            continue;
        if (shkp.isshk && (shkp.mextra.eshk.billct || !withbill))
            break;
    }

    if (shkp) {
        if (ANGRY(shkp)) {
            if (!shkp.mextra.eshk.surcharge)
                rile_shk(shkp);
        }
    }
    return shkp;
}

// C ref: shk.c addupbill()
function addupbill(shkp) {
    const eshkp = shkp.mextra.eshk;
    let ct = eshkp.billct;
    let total = 0;

    for (let i = 0; ct--; i++)
        total += eshkp.bill[i].price * eshkp.bill[i].bquan;
    return total;
}

// C ref: shk.c inside_shop()
/* x,y is strictly inside shop */
export function inside_shop(x, y) {
    const loc = game.level.at(x, y);
    let rno = loc.roomno;
    if ((rno < ROOMOFFSET) || loc.edge || !IS_SHOP(rno - ROOMOFFSET))
        rno = NO_ROOM;
    return rno;
}

// C ref: shk.c u_left_shop()
export async function u_left_shop(leavestring, newlev) {
    const u = game.u;
    const levl = (x, y) => game.level.at(x, y);

    /*
     * IF player
     * ((didn't leave outright) AND
     *  ((he is now strictly-inside the shop) OR
     *   (he wasn't strictly-inside last turn anyway)))
     * THEN (there's nothing to do, so just return)
     */
    if (!leavestring && (!levl(u.ux, u.uy).edge || levl(u.ux0, u.uy0).edge))
        return;

    const shkp = shop_keeper(leavestring ? leavestring.charCodeAt(0)
                                         : u.ushops0.charCodeAt(0));
    if (!shkp || !inhishop(shkp))
        return; /* shk died, teleported, changed levels... */

    const eshkp = shkp.mextra.eshk;
    if (!eshkp.billct && !eshkp.debit) /* bill is settled */
        return;

    if (!leavestring && !muteshk(shkp)) {
        /*
         * Player just stepped onto shop-boundary (known from above logic).
         * Try to intimidate him into paying his bill
         */
        const not_upset = !eshkp.surcharge;
        if (!Deaf() && !muteshk(shkp)) {
            await verbalize(not_upset
                            ? `${game.plname}!  Please pay before leaving.`
                            : `${game.plname}!  Don't you leave without paying!`);
        } else {
            await pline(`${Shknam(shkp)} ${not_upset ? "points out"
                                                     : "makes it clear"
                         } that you need to pay before leaving${
                         not_upset ? "." : "!"}`);
        }
        return;
    }

    if (await rob_shop(shkp)) {
        throw new Error('u_left_shop(): call_kops() not ported yet');
    }
}

// C ref: shk.c rob_shop()
/* shop merchandise has been taken; pay for it with any credit available;
   return false if the debt is fully covered by credit, true otherwise */
async function rob_shop(shkp) {
    const eshkp = shkp.mextra.eshk;

    await rouse_shk(shkp, true);
    let total = (addupbill(shkp) + eshkp.debit);
    if (eshkp.credit >= total) {
        throw new Error('rob_shop(): credit covering the bill not ported yet');
    } else {
        throw new Error('rob_shop(): escaping without paying not ported yet');
    }
}

// C ref: shk.c deserted_shop()
/* give a message when entering an untended shop (caller has verified that) */
async function deserted_shop(enterstring) {
    const r = game.level.rooms[enterstring.charCodeAt(0) - ROOMOFFSET];
    let m = 0, n = 0;

    for (let x = r.lx; x <= r.hx; ++x)
        for (let y = r.ly; y <= r.hy; ++y) {
            if (u_at(x, y))
                continue;
            const mtmp = m_at(x, y);
            if (mtmp) {
                ++n;
                if (sensemon(mtmp)
                    || (((mtmp.m_ap_type || M_AP_NOTHING) === M_AP_NOTHING
                         || mtmp.m_ap_type === M_AP_MONSTER)
                        && canseemon(mtmp)))
                    ++m;
            }
        }

    if (Blind() && !(Blind_telepat() || Detect_monsters()))
        ++n; /* force feedback to be less specific */

    await pline(`This shop ${(m < n) ? "seems to be" : "is"} ${
                 !n ? "deserted" : "untended"}.`);
}

// C ref: shk.c u_entered_shop()
/* called from check_special_room(hack.c) */
export async function u_entered_shop(enterstring) {
    const u = game.u;
    if (game.empty_shops === undefined)
        game.empty_shops = ''; /* static char empty_shops[5] */
    let rt;

    if (!enterstring)
        return;

    const shkp = shop_keeper(enterstring.charCodeAt(0));
    if (!shkp) {
        if (!game.empty_shops.includes(enterstring[0])
            && (in_rooms(u.ux, u.uy, SHOPBASE)
                !== in_rooms(u.ux0, u.uy0, SHOPBASE)))
            await deserted_shop(enterstring);
        game.empty_shops = u.ushops;
        u.ushops = '';
        return;
    }

    const eshkp = shkp.mextra.eshk;

    if (!inhishop(shkp)) {
        /* dump core when referenced */
        eshkp.bill_p = -1000;
        if (!game.empty_shops.includes(enterstring[0]))
            await deserted_shop(enterstring);
        game.empty_shops = u.ushops;
        u.ushops = '';
        return;
    }
    record_achievement('ACH_SHOP');

    eshkp.bill_p = eshkp.bill || (eshkp.bill = []); /* &(eshkp->bill[0]) */

    if ((!eshkp.visitct || eshkp.customer)
        && strncmpi(eshkp.customer, game.plname, PL_NSIZ)) {
        /* You seem to be new here */
        eshkp.visitct = 0;
        eshkp.following = 0;
        eshkp.customer = (game.plname || '').slice(0, PL_NSIZ);
        pacify_shk(shkp, true);
    }

    if (muteshk(shkp) || eshkp.following)
        return; /* no dialog */

    if (Invis()) {
        await pline(`${Shknam(shkp)} senses your presence.`);
        if (!Deaf() && !muteshk(shkp)) {
            await verbalize("Invisible customers are not welcome!");
        } else {
            await pline(`${Shknam(shkp)} stands firm as if ${noit_mhe(shkp)
                         } knows you are there.`);
        }
        return;
    }

    rt = game.level.rooms[enterstring.charCodeAt(0) - ROOMOFFSET].rtype;

    if (ANGRY(shkp)) {
        if (!Deaf() && !muteshk(shkp)) {
            await verbalize(`So, ${game.plname}, you dare return to ${
                             s_suffix(shkname(shkp))} ${
                             shtypes[rt - SHOPBASE].name}?!`);
        } else {
            throw new Error('u_entered_shop(): ROLL_FROM(angrytexts) not ported yet');
        }
    } else if (eshkp.surcharge) {
        if (!Deaf() && !muteshk(shkp)) {
            await verbalize(`Back again, ${game.plname}?  I've got my ${
                             mbodypart(shkp, EYE)} on you.`);
        } else {
            await pline_The(`atmosphere at ${s_suffix(shkname(shkp))} ${
                             shtypes[rt - SHOPBASE].name} seems unwelcoming.`);
        }
    } else if (eshkp.robbed) {
        if (!Deaf()) {
            await pline(`${Shknam(shkp)} mutters imprecations against shoplifters.`);
        } else {
            await pline(`${Shknam(shkp)} is combing through ${noit_mhis(shkp)
                         } inventory list.`);
        }
    } else {
        if (!Deaf() && !muteshk(shkp)) {
            await verbalize(`${Hello(shkp)}, ${game.plname}!  Welcome${
                             eshkp.visitct++ ? " again" : ""} to ${
                             s_suffix(shkname(shkp))} ${
                             shtypes[rt - SHOPBASE].name}!`);
        } else {
            await You(`enter ${s_suffix(shkname(shkp))} ${
                       shtypes[rt - SHOPBASE].name}${
                       eshkp.visitct++ ? " again" : ""}!`);
        }
    }
    /* can't do anything about blocking if teleported in */
    if (!inside_shop(u.ux, u.uy)) {
        let should_block;
        const not_upset = !eshkp.surcharge;
        let cnt;
        let tool;
        let pick = carrying(PICK_AXE),
            mattock = carrying(DWARVISH_MATTOCK);

        if (pick || mattock) {
            cnt = 1;               /* so far */
            if (pick && mattock) { /* carrying both types */
                tool = "digging tool";
                cnt = 2; /* `more than 1' is all that matters */
            } else if (pick) {
                tool = "pick-axe";
                /* hack: `pick' already points somewhere into inventory */
                while ((pick = pick.nobj) != null)
                    if (pick.otyp === PICK_AXE)
                        ++cnt;
            } else { /* assert(mattock != 0) */
                tool = "mattock";
                while ((mattock = mattock.nobj) != null)
                    if (mattock.otyp === DWARVISH_MATTOCK)
                        ++cnt;
                /* [ALI] Shopkeeper identifies mattock(s) */
                if (!Blind())
                    makeknown(DWARVISH_MATTOCK);
            }
            if (!Deaf() && !muteshk(shkp)) {
                await verbalize(not_upset
                                ? `Will you please leave your ${tool}${plur(cnt)} outside?`
                                : `Leave the ${tool}${plur(cnt)} outside.`);
            } else {
                await pline(`${Shknam(shkp)} ${not_upset ? "is hesitant"
                                                         : "refuses"
                             } to let you in with your ${tool}${plur(cnt)}.`);
            }
            should_block = true;
        } else if (u.usteed) {
            if (!Deaf() && !muteshk(shkp)) {
                await verbalize(not_upset
                                ? `Will you please leave ${y_monnam(u.usteed)} outside?`
                                : `Leave ${y_monnam(u.usteed)} outside.`);
            } else {
                await pline(`${Shknam(shkp)} ${not_upset ? "doesn't want"
                                                         : "refuses"
                             } to let you in while you're riding ${
                             y_monnam(u.usteed)}.`);
            }
            should_block = true;
        } else {
            should_block =
                (Fast() && (sobj_at(PICK_AXE, u.ux, u.uy)
                            || sobj_at(DWARVISH_MATTOCK, u.ux, u.uy)));
        }
        if (should_block)
            await dochug(shkp); /* shk gets extra move */
    }
    return;
}

// C ref: shk.c inhishop()
/* 1: shopkeeper is currently in her shop or its boundary; 0: not */
export function inhishop(shkp) {
    const eshkp = shkp.mextra.eshk;

    if (!on_level(eshkp.shoplevel, game.u.uz))
        return false;
    const shkrooms = in_rooms(shkp.mx, shkp.my, SHOPBASE);
    return shkrooms.includes(String.fromCharCode(eshkp.shoproom));
}

// C ref: shk.c shop_keeper()
/* return the shopkeeper for rooms[rmno-2]; returns Null if there isn't one */
export function shop_keeper(rmno) {
    const shkp = (rmno >= ROOMOFFSET)
        ? (game.level.rooms?.[rmno - ROOMOFFSET]?.resident || null) : null;
    if (shkp) {
        if (shkp.mextra?.eshk) {
            if (ANGRY(shkp)) {
                if (!shkp.mextra.eshk.surcharge)
                    rile_shk(shkp);
            }
        } else {
            /* impossible("shop resident not shopkeeper") */
            return null;
        }
    }
    return shkp;
}

// C ref: shk.c tended_shop()
export function tended_shop(sroom) {
    const mtmp = sroom.resident;

    return !mtmp ? false : inhishop(mtmp);
}

// C ref: shk.c noisy_shop()
export async function noisy_shop(sroom) {
    const mtmp = sroom.resident;

    if (mtmp && inhishop(mtmp)) {
        await wake_nearto(mtmp.mx, mtmp.my, 11 * 11);
    }
}

// C ref: shk.c pacify_shk()
/* remove previously applied surcharge from all billed items */
function pacify_shk(shkp, clear_surcharge) {
    const eshkp = shkp.mextra.eshk;
    shkp.mpeaceful = 1; /* NOTANGRY(shkp) = TRUE: make peaceful */
    if (clear_surcharge && eshkp.surcharge) {
        let ct = eshkp.billct;

        eshkp.surcharge = false;
        for (let i = 0; ct-- > 0; i++) {
            const bp = eshkp.bill_p[i];
            const reduction = Math.trunc((bp.price + 3) / 4);
            bp.price -= reduction; /* undo 33% increase */
        }
    }
}

// C ref: shk.c rile_shk()
/* add aggravation surcharge to all billed items */
export function rile_shk(shkp) {
    const eshkp = shkp.mextra.eshk;
    shkp.mpeaceful = 0; /* NOTANGRY(shkp) = FALSE: make angry */
    if (!eshkp.surcharge) {
        let ct = eshkp.billct;

        eshkp.surcharge = true;
        for (let i = 0; ct-- > 0; i++) {
            const bp = eshkp.bill_p[i];
            const surcharge = Math.trunc((bp.price + 2) / 3);
            bp.price += surcharge;
        }
    }
}

// C ref: shk.c rouse_shk()
/* wakeup and/or unparalyze shopkeeper */
async function rouse_shk(shkp, verbosely) {
    if (helpless(shkp)) {
        /* greed induced recovery... */
        if (verbosely && canspotmon(shkp))
            await pline(`${Shknam(shkp)} ${shkp.msleeping ? "wakes up"
                                                          : "can move again"}.`);
        shkp.msleeping = 0;
        shkp.mfrozen = 0;
        shkp.mcanmove = 1;
    }
}

// C ref: shk.c shk_impaired()
/* is shk unable to repair damage? */
function shk_impaired(shkp) {
    if (!shkp || !shkp.isshk || !inhishop(shkp))
        return true;
    if (helpless(shkp) || shkp.mextra.eshk.following)
        return true;
    return false;
}

// C ref: shk.c repairable_damage()
/* is damage dam repairable by shopkeeper shkp? */
function repairable_damage(dam, shkp) {
    let mtmp;

    if (!dam || shk_impaired(shkp))
        return false;

    const x = dam.place.x;
    const y = dam.place.y;

    /* too soon to fix it? */
    if ((game.moves - dam.when) < REPAIR_DELAY)
        return false;
    /* is it a wall? don't fix if anyone is in the way */
    if (!IS_ROOM(dam.typ)) {
        if ((u_at(x, y) && !Passes_walls())
            || (x === shkp.mx && y === shkp.my)
            || ((mtmp = m_at(x, y)) && !passes_walls(mtmp.data)))
            return false;
    }
    /* is it a trap? don't fix if hero or monster is in it */
    const ttmp = t_at(x, y);
    if (ttmp) {
        if (u_at(x, y))
            return false;
        if ((mtmp = m_at(x, y)) && mtmp.mtrapped)
            return false;
    }
    /* does it belong to shkp? */
    if (!in_rooms(x, y, SHOPBASE).includes(
            String.fromCharCode(shkp.mextra.eshk.shoproom)))
        return false;

    return true;
}

// C ref: shk.c find_damage()
/* find any damage shopkeeper shkp could repair. returns NULL is none found */
function find_damage(shkp) {
    let dam = game.level.damagelist;

    if (shk_impaired(shkp))
        return null;

    while (dam) {
        if (repairable_damage(dam, shkp))
            return dam;

        dam = dam.next;
    }

    return null;
}

// C ref: shk.c shk_fixes_damage()
/* Shopkeeper tries to repair damage belonging to them */
function shk_fixes_damage(shkp) {
    const dam = find_damage(shkp);

    if (!dam)
        return;

    throw new Error('shk_fixes_damage(): repair_damage() not ported yet');
}

// C ref: shk.c shk_move()
/*
 * shk_move: return 1: moved  0: didn't  -1: let m_move do it  -2: died
 */
export async function shk_move(shkp) {
    const u = game.u;
    let gtx, gty;
    let udist;
    let appr;
    const eshkp = shkp.mextra.eshk;
    let z;
    let uondoor = false, satdoor, avoid = false, badinv;

    const omx = shkp.mx;
    const omy = shkp.my;

    if (inhishop(shkp))
        shk_fixes_damage(shkp);

    if ((udist = distu(omx, omy)) < 3 && (shkp.data !== mons[PM_GRID_BUG]
                                          || (omx === u.ux || omy === u.uy))) {
        if (ANGRY(shkp) || (Conflict() && !resist_conflict(shkp))) {
            if (Displaced())
                await Your(`displaced image doesn't fool ${shkname(shkp)}!`);
            await mattacku(shkp);
            return 0;
        }
        if (eshkp.following) {
            if (eshkp.customer.slice(0, PL_NSIZ)
                !== (game.plname || '').slice(0, PL_NSIZ)) { /* strncmp() */
                if (!Deaf() && !muteshk(shkp)) {
                    await verbalize(`${Hello(shkp)}, ${game.plname}!  I was looking for ${
                                     eshkp.customer}.`);
                }
                eshkp.following = 0;
                return 0;
            }
            if (game.moves > (game.followmsg || 0) + 4) {
                if (!Deaf() && !muteshk(shkp)) {
                    await verbalize(`${Hello(shkp)}, ${game.plname}!  Didn't you forget to pay?`);
                } else {
                    await pline(`${Shknam(shkp)} holds out ${noit_mhis(shkp)
                                 } upturned ${mbodypart(shkp, HAND)}.`);
                }
                game.followmsg = game.moves;
                if (!rn2(9)) {
                    await pline(`${Shknam(shkp)} doesn't like customers who don't pay.`);
                    rile_shk(shkp);
                }
            }
            if (udist < 2)
                return 0;
        }
    }

    appr = 1;
    gtx = eshkp.shk.x;
    gty = eshkp.shk.y;
    satdoor = (gtx === omx && gty === omy);
    if (eshkp.following || ((z = holetime()) >= 0 && z * z <= udist)) {
        /* [This distance check used to apply regardless of
            whether the shk was following, but that resulted in
            m_move() sometimes taking the shk out of the shop if
            the player had fenced him in with boulders or traps.
            Such voluntary abandonment left unpaid objects in
            invent, triggering billing impossibilities on the
            next level once the character fell through the hole.] */
        if (udist > 4 && eshkp.following && !eshkp.billct)
            return -1; /* leave it to m_move */
        gtx = u.ux;
        gty = u.uy;
    } else if (ANGRY(shkp)) {
        /* Move towards the hero if the shopkeeper can see him. */
        if (shkp.mcansee && m_canseeu(shkp)) {
            gtx = u.ux;
            gty = u.uy;
        }
        avoid = false;
    } else {
        const GDIST = (x, y) => dist2(x, y, gtx, gty);
        if (Invis() || u.usteed) {
            avoid = false;
        } else {
            uondoor = u_at(eshkp.shd.x, eshkp.shd.y);
            if (uondoor) {
                badinv = (carrying(PICK_AXE) || carrying(DWARVISH_MATTOCK)
                          || (Fast() && (sobj_at(PICK_AXE, u.ux, u.uy)
                                         || sobj_at(DWARVISH_MATTOCK, u.ux, u.uy))));
                if (satdoor && badinv)
                    return 0;
                avoid = !badinv;
            } else {
                avoid = (!!u.ushops && distu(gtx, gty) > 8);
                badinv = false;
            }

            if (((!eshkp.robbed && !eshkp.billct && !eshkp.debit) || avoid)
                && GDIST(omx, omy) < 3) {
                if (!badinv && !onlineu(omx, omy))
                    return 0;
                if (satdoor)
                    appr = gtx = gty = 0;
            }
        }
    }

    z = await move_special(shkp, inhishop(shkp), appr, uondoor, avoid, omx, omy,
                           gtx, gty);
    if (z > 0)
        await after_shk_move(shkp);

    return z;
}

// C ref: shk.c after_shk_move()
/* called after shopkeeper moves, in case move causes re-entry into shop */
export async function after_shk_move(shkp) {
    const eshkp = shkp.mextra.eshk;

    if (eshkp.bill_p === -1000 && inhishop(shkp)) {
        /* reset bill_p, need to re-calc player's occupancy too */
        eshkp.bill_p = eshkp.bill || (eshkp.bill = []);
        /* only re-check occupancy if game hasn't just ended */
        if (!game.program_state?.gameover)
            await check_special_room(false);
    }
}

// C ref: shk.c is_fshk()
/* for use in levl_follower (mondata.c) */
export function is_fshk(mtmp) {
    return !!(mtmp.isshk && mtmp.mextra.eshk.following);
}

// C ref: shk.c costly_spot()
/* is <x,y> a spot inside a tended shop where items cost money? */
export function costly_spot(x, y) {
    if (!game.level.flags?.has_shop)
        return false;
    const shkrooms = in_rooms(x, y, SHOPBASE);
    const shkp = shop_keeper(shkrooms.length ? shkrooms.charCodeAt(0) : 0);
    if (!shkp || !inhishop(shkp))
        return false;
    const eshkp = shkp.mextra.eshk;
    return (inside_shop(x, y) !== NO_ROOM
            && !(x === eshkp.shk.x && y === eshkp.shk.y));
}
