// mhitu.js — monster attacks the hero: mattacku(), hitmu(), mdamageu(),
// hitmsg(), missmu(), wildmiss(), getmattk(), magic_negation(),
// passiveum() and could_seduce().
// C ref: mhitu.c.  Paths that aren't ported yet throw a 'not ported yet'
// error instead of skipping their rolls.

import { game } from './gstate.js';
import { rn2, rnd, d, AC_VALUE } from './rng.js';
import { cansee } from './vision.js';
import { pline, bot, mon_visible, sensemon, You_feel } from './display.js';
import { nomul } from './hack.js';
import { Monnam, pronoun_gender, PRONOUN_HALLU } from './do_name.js';
import { monnear } from './mon.js';
import { canseemon, canspotmon, map_invisible } from './display.js';
import { find_offensive, use_offensive } from './muse.js';
import { mhitm_adtyping, mhitm_knockback } from './uhitm.js';
import { is_undead, is_vampshifter, is_demon, is_were, is_swimmer,
         perceives, is_orc, dmgtype, is_neuter } from './mondata.js';
import { midnight, night } from './calendar.js';
import { new_were } from './were.js';
import { In_hell } from './dungeon.js';
import { PROT_FROM_SHAPE_CHANGERS } from './const.js';
import * as M from './monsters.js';
import { mons, AT_NONE, AT_CLAW, AT_KICK, AT_BITE, AT_STNG, AT_TUCH,
         AT_BUTT, AT_TENT, AT_HUGS, AT_GAZE, AT_EXPL, AT_BOOM, AT_ENGL,
         AT_BREA, AT_SPIT, AT_WEAP, AT_MAGC, AD_SSEX, AD_SEDU, AD_SITM,
         AD_DISE, AD_PEST, AD_FAMN, AD_DREN, AD_STCK, AD_POLY, AD_DRIN,
         AD_PHYS, AD_ACID, AD_STON, AD_ENCH, AD_COLD } from './monsters.js';
import { M_ATTK_MISS, M_ATTK_HIT, M_ATTK_AGR_DIED, M_ATTK_AGR_DONE, NATTK,
         NON_PM, INVIS, DISPLACED, SEE_INVIS, BLINDED, CONFLICT,
         HALF_PHDAM, PROTECTION, COLD_RES, W_ARMOR, W_AMUL, TT_PIT, HALLUC,
         NEED_WEAPON, NEED_HTH_WEAPON, P_POLEARMS, P_LANCE, P_WHIP,
         is_pit } from './const.js';
import { t_at } from './trap.js';
import { u_at } from './makemon.js';
import { objects, AMULET_OF_GUARDING, WEAPON_CLASS, TOOL_CLASS, TOWEL,
         PIERCE } from './objects.js';
import { mon_wield_item, hitval } from './weapon.js';
import { thrwmu, spitmu, breamu } from './mthrowu.js';
import { castmu, buzzmu } from './mcastu.js';
import { Is_rogue_level, DIED, DEAF } from './const.js';
import { stop_occupation } from './allmain.js';
import { yyyymmdd } from './calendar.js';
import { PRONOUN_NO_IT, Mgender, mon_nam, noit_mon_nam,
         noit_Monnam } from './do_name.js';
import { ARMOR_CLASS, ARM_GLOVES, RIN_ADORNMENT } from './objects.js';
import { discover_object, observe_object } from './o_init.js';
import { FEMALE, A_CHA, A_INT, A_CON, A_WIS, A_DEX, A_STR, HAND, HAIR,
         RIGHT_RING, LEFT_RING, RLOC_MSG, A_CHAOTIC,
         KILLED_BY } from './const.js';
import { unresponsive, remove_worn_item, mpickobj } from './steal.js';
import { stop_donning, Ring_on } from './do_wear.js';
import { welded } from './wield.js';
import { ACURR, adjattrib, exercise, adjalign } from './attrib.js';
import { safe_qbuf } from './pickup.js';
import { tty_yn_function } from './wintty.js';
import { yname, cloak_simple_name, suit_simple_name,
         helm_simple_name } from './objnam.js';
import { freeinv, prinv } from './invent.js';
import { the } from './iactions.js';
import { body_part } from './insight.js';
import { setworn } from './worn.js';
import { urgent_pline } from './display.js';
import { tele_restrict, rloc } from './teleport.js';
import { rn1 } from './rng.js';
import { resists_drli } from './mondata.js';
import { losexp, pluslvl } from './exper.js';
import { losehp, Maybe_Half_Phys } from './trap.js';
import { money_cnt } from './u_init.js';
import { currency } from './insight.js';
import { money2mon } from './shk.js';

import { FAST, SICK_RES, SICK, NEUTRAL, SICK_NONVOMITABLE } from './const.js';
import { OILSKIN_CLOAK } from './objects.js';
import { make_sick, make_blinded, make_hallucinated } from './potion.js';
import { Hallucination } from './display.js';
import { resists_blnd, defended } from './mondata.js';
import { mondead, wake_nearto } from './mon.js';
import { WATER } from './const.js';

/* C ref: global.h LARGEST_INT */
const LARGEST_INT = 32767;
import { done_in_by } from './end.js';
import { ART_SNICKERSNEE } from './artilist.js';
import { genders } from './role.js';
import { xname } from './objnam.js';

/* C ref: mhitu.c static mon_currwep */
let mon_currwep = null;

/* C ref: youprop.h -- (H* || E*) && !B* */
function uhave(prop) {
    const p = game.u.uprops[prop];
    return !!((p.intrinsic || p.extrinsic) && !p.blocked);
}
function Invis() { return uhave(INVIS); }
function Displaced() { return uhave(DISPLACED); }
function Underwater() { return !!game.u.uinwater; }
function See_invisible() { return uhave(SEE_INVIS); }
function Blind() {
    const p = game.u.uprops[BLINDED];
    return !!((p.intrinsic || p.extrinsic) && !p.blocked);
}
function Conflict() {
    const p = game.u.uprops[CONFLICT];
    return !!(p.intrinsic || p.extrinsic);
}
function Half_physical_damage() { return uhave(HALF_PHDAM); }
function Cold_resistance() { return uhave(COLD_RES); }
function Upolyd() { return game.u.umonnum !== game.u.umonster; }

/* mondata.h */
function is_animal(ptr) { return (ptr.mflags1 & M.M1_ANIMAL) !== 0; }
function thick_skinned(ptr) { return (ptr.mflags1 & M.M1_THICK_HIDE) !== 0; }
function unsolid(ptr) { return (ptr.mflags1 & M.M1_UNSOLID) !== 0; }
function nolimbs(ptr) { return (ptr.mflags1 & M.M1_NOLIMBS) === M.M1_NOLIMBS; }
function hides_under(ptr) { return (ptr.mflags1 & M.M1_CONCEAL) !== 0; }
function touch_petrifies(ptr) {
    return ptr === mons[M.PM_COCKATRICE] || ptr === mons[M.PM_CHICKATRICE];
}
/* C ref: monst.h DEADMONSTER() */
function DEADMONSTER(mon) { return mon.mhp < 1; }
/* C ref: hack.h mdistu() */
function mdistu(mon) {
    const dx = mon.mx - game.u.ux, dy = mon.my - game.u.uy;
    return dx * dx + dy * dy;
}
/* C ref: hack.h m_next2u() */
function m_next2u(mon) {
    return Math.abs(mon.mx - game.u.ux) <= 1 && Math.abs(mon.my - game.u.uy) <= 1;
}
/* C ref: mondata.h gender() / pronoun_gender() subset */
function gender(mon) { return mon.female ? 1 : 0; }
/* C ref: polyself.c poly_gender() */
function poly_gender() {
    if (Upolyd())
        throw new Error('poly_gender(): polymorphed hero not ported yet');
    return game.flags.female ? 1 : 0;
}

/* C ref: obj.h is_pole(), is_art() */
function is_art(o, art) { return !!(o && o.oartifact === art); }
function is_pole(otmp) {
    return (otmp.oclass === WEAPON_CLASS || otmp.oclass === TOOL_CLASS)
           && (objects[otmp.otyp].oc_skill === P_POLEARMS
               || objects[otmp.otyp].oc_skill === P_LANCE
               || is_art(otmp, ART_SNICKERSNEE));
}
/* C ref: obj.h is_wet_towel() */
function is_wet_towel(o) { return o.otyp === TOWEL && (o.spe || 0) > 0; }
/* C ref: you.h mhis() */
export function mhis(mtmp) { return genders[pronoun_gender(mtmp, PRONOUN_HALLU)].his; }

// C ref: mhitu.c mswings_verb()
/* strike types P|S|B: Pierce (pointed: stab) => "thrusts",
   Slash (edged: slice) or whack (blunt: Bash) => "swings" */
export function mswings_verb(
    mwep, /* attacker's weapon */
    bash) /* True: using polearm while too close */
{
    let verb;
    const otyp = mwep.otyp,
        /* (monsters don't actually wield towels, wet or otherwise) */
        lash = (objects[otyp].oc_skill === P_WHIP || is_wet_towel(mwep)),
        /* some weapons can have more than one strike type; for those,
           give a mix of thrust and swing (caller doesn't care either way) */
        thrust = ((objects[otyp].oc_dir & PIERCE) !== 0
                  && ((objects[otyp].oc_dir & ~PIERCE) === 0 || !rn2(2)));

    verb = bash ? "bashes with" /*sigh*/
           : lash ? "lashes"
             : thrust ? "thrusts"
               : "swings";
    /* (might have caller also pass attacker's formatted name so that
       if hallucination makes that be plural, we could use vtense() to
       adjust the result to match) */
    return verb;
}

// C ref: mhitu.c mswings()
/* monster swings obj */
async function mswings(
    mtmp,  /* attacker */
    otemp, /* attacker's weapon */
    bash)  /* True: polearm used at too close range */
{
    if (game.flags.verbose && !Blind() && mon_visible(mtmp)) {
        await pline(`${Monnam(mtmp)} ${mswings_verb(otemp, bash)} ${
            (otemp.quan > 1) ? "one of " : ""}${mhis(mtmp)} ${xname(otemp)}.`); /* pline_mon() */
    }
}

/* C ref: youprop.h Deaf */
function Deaf() { return uhave(DEAF) || !!game.u.uroleplay?.deaf; }

// C ref: mhitu.c u_slow_down()
/* called when your intrinsic speed is taken away */
export async function u_slow_down() {
    game.u.uprops[FAST].intrinsic = 0; /* HFast = 0L */
    if (!uhave(FAST))
        await pline("You slow down."); /* You() */
    else /* speed boots */
        await pline("Your quickness feels less natural."); /* Your() */
    exercise(A_DEX, false);
}

// C ref: mhitu.c diseasemu()
export async function diseasemu(mdat) {
    const u = game.u;
    if (uhave(SICK_RES)) {
        await You_feel("a slight illness.");
        return false;
    } else {
        const Sick = u.uprops[SICK].intrinsic;
        await make_sick(Sick ? Math.trunc(Sick / 3) + 1 : rn1(ACURR(A_CON), 20),
                        mdat.pmnames[NEUTRAL], true, SICK_NONVOMITABLE);
        return true;
    }
}

// C ref: mhitu.c u_slip_free()
/* check whether slippery clothing protects from hug or wrap attack */
export async function u_slip_free(mtmp, mattk) {
    let obj;

    /* greased armor does not protect against AT_ENGL+AD_WRAP */
    if (mattk.aatyp === AT_ENGL)
        return false;

    obj = (game.uarmc ? game.uarmc : game.uarm);
    if (!obj)
        obj = game.uarmu;
    if (mattk.adtyp === AD_DRIN)
        obj = game.uarmh;

    /* if your cloak/armor is greased, monster slips off; this
       protection might fail (33% chance) when the armor is cursed */
    if (obj && (obj.greased || obj.otyp === OILSKIN_CLOAK)
        && (!obj.cursed || rn2(3))) {
        await pline(`${Monnam(mtmp)} ${
            (mattk.adtyp === M.AD_WRAP) ? "slips off of"
                                        : "grabs you, but cannot hold onto"} your ${
            obj.greased ? "greased" : "slippery"} ${
            /* avoid "slippery slippery cloak"
               for undiscovered oilskin cloak */
            (obj.greased || objects[obj.otyp].oc_name_known)
                ? xname(obj)
                : cloak_simple_name(obj)}!`); /* pline_mon() */

        if (obj.greased && !rn2(2)) {
            await pline("The grease wears off."); /* pline_The() */
            obj.greased = 0;
            /* update_inventory() -- no perm_invent window */
        }
        return true;
    }
    return false;
}

// C ref: mhitu.c mpoisons_subj()
/* return how a poison attack was delivered */
export function mpoisons_subj(mtmp, mattk) {
    if (mattk.aatyp === AT_WEAP) {
        const mwep = (mtmp === game.youmonst) ? game.uwep : (mtmp.mw || null);
        /* "Foo's attack was poisoned." is pretty lame, but at least
           it's better than "sting" when not a stinging attack... */
        return (!mwep || !mwep.opoisoned) ? "attack" : "weapon";
    } else {
        return (mattk.aatyp === AT_TUCH) ? "contact"
               : (mattk.aatyp === AT_GAZE) ? "gaze"
                 : (mattk.aatyp === AT_BITE) ? "bite" : "sting";
    }
}

// C ref: mhitu.c hitmsg()
/* monster hits hero */
export async function hitmsg(mtmp, mattk) {
    let compat;
    let verb = null, punct = '!';
    let Monst_name = Monnam(mtmp);

    /* Note: if opposite gender, "seductively";
       if same gender, "engagingly" for nymph, normal msg for others. */
    if ((compat = could_seduce(mtmp, game.youmonst, mattk)) !== 0
        && !mtmp.mcan && !mtmp.mspec_used) {
        await pline(`${Monst_name} ${
            !Blind() ? "smiles at" : !Deaf() ? "talks to" : "touches"} you ${
            (compat === 2) ? "engagingly" : "seductively"}.`); /* pline_mon() */
    } else {
        switch (mattk.aatyp) {
        case AT_BITE:
            verb = 'bites';
            break;
        case AT_KICK:
            if (thick_skinned(game.youmonst.data))
                punct = '.';
            verb = 'kicks';
            break;
        case AT_STNG:
            verb = 'stings';
            break;
        case AT_BUTT:
            verb = 'butts';
            break;
        case AT_TUCH:
            verb = 'touches you';
            break;
        case AT_TENT:
            throw new Error('hitmsg(): s_suffix() for tentacles not ported yet');
        case AT_EXPL:
        case AT_BOOM:
            verb = 'explodes';
            break;
        default:
            verb = 'hits';
        }
        /* if a monster hits more than once with similar attack, say so */
        const prev = game.hitmsg_prev;
        const again = (mtmp.m_id === game.hitmsg_mid
                       && prev != null
                       && mattk === mtmp.data.mattk[prev.idx + 1]
                       && prev.mdat === mtmp.data
                       && mattk.aatyp === prev.attk.aatyp) ? ' again' : '';
        await pline(`${Monst_name} ${verb}${again}${punct}`); /* pline_mon() */
    }
    game.hitmsg_mid = mtmp.m_id;
    game.hitmsg_prev = { attk: mattk, mdat: mtmp.data,
                         idx: mtmp.data.mattk.indexOf(mattk) };
}

// C ref: mhitu.c missmu()
/* monster missed you */
async function missmu(mtmp, nearmiss, mattk) {
    game.hitmsg_mid = 0;
    game.hitmsg_prev = null;

    if (!canspotmon(mtmp))
        map_invisible(mtmp.mx, mtmp.my);

    if (could_seduce(mtmp, game.youmonst, mattk) && !mtmp.mcan)
        await pline(`${Monnam(mtmp)} pretends to be friendly.`);
    else
        await pline(`${Monnam(mtmp)} ${(nearmiss && game.flags.verbose) ? 'just ' : ''}misses!`);

    await stop_occupation();
}

// C ref: mhitu.c wildmiss()
/* monster attacked wrong location due to monster blindness, hero
   invisibility, hero displacement, or hero being underwater */
async function wildmiss(mtmp, mattk) {
    const unotseen = (!mtmp.mcansee || (Invis() && !perceives(mtmp.data))),
          unotthere = Displaced(), usubmerged = Underwater();

    if (!unotseen && !unotthere && !usubmerged)
        return; /* impossible("attacks you without knowing your location?") */

    if (!game.flags.verbose)
        return;
    /* no feedback if hero doesn't see the monster's spot */
    if (!cansee(mtmp.mx, mtmp.my))
        return;
    void mattk;
    throw new Error('wildmiss(): wild miss messages not ported yet');
}

// C ref: mhitu.c getmattk() -- with the hero as defender
/* select a monster's next attack, possibly substituting for its usual one */
export function getmattk(magr, mdef, indx, prev_result) {
    const mptr = magr.data;
    let attk = mptr.mattk[indx];
    const udefend = (mdef === game.youmonst);

    /* honor SEDUCE=0: SYSOPT_SEDUCE is on in the recorded games */

    if (indx > 0 && prev_result[indx - 1] > M_ATTK_MISS
        && (attk.adtyp === AD_DISE || attk.adtyp === AD_PEST
            || attk.adtyp === AD_FAMN)
        && attk.adtyp === mptr.mattk[indx - 1].adtyp) {
        attk = { ...attk, adtyp: M.AD_STUN };
    } else if (attk.adtyp === AD_DREN && udefend) {
        throw new Error('getmattk(): AD_DREN substitution not ported yet');
    } else if (magr.mspec_used && (attk.aatyp === AT_ENGL
                                   || attk.aatyp === AT_HUGS
                                   || attk.adtyp === AD_STCK
                                   || attk.adtyp === AD_POLY)) {
        const wimpy = (attk.damd === 0); /* lichen, violet fungus */

        /* can't re-engulf or re-grab yet; switch to simpler attack */
        attk = { ...attk };
        if (attk.adtyp === AD_ACID || attk.adtyp === M.AD_ELEC
            || attk.adtyp === AD_COLD || attk.adtyp === M.AD_FIRE) {
            attk.aatyp = AT_TUCH;
        } else {
            attk.aatyp = AT_CLAW; /* attack message will be "<foo> hits" */
            attk.adtyp = AD_PHYS;
        }
        attk.damn = 1; /* relatively weak: 1d6 */
        attk.damd = 6;
        if (wimpy && attk.aatyp === AT_CLAW) {
            attk.aatyp = AT_TUCH;
            attk.damn = attk.damd = 0;
        }
    } else if (indx === 0 && magr !== game.youmonst
               && attk.aatyp === AT_WEAP && attk.adtyp !== AD_PHYS
               && !(mptr.mattk[1].aatyp === AT_WEAP
                    && mptr.mattk[1].adtyp === AD_PHYS)
               && (magr.mcan || magr.mw)) {
        throw new Error('getmattk(): non-physical weapon attack substitution not ported yet');
    } else if (indx === 0 && attk.aatyp === AT_TUCH && attk.adtyp === AD_COLD
               && (udefend ? Cold_resistance() : true)) {
        throw new Error('getmattk(): lich cold touch substitution not ported yet');
    }

    /* elementals on their home plane do double damage:
       is_home_elemental() needs the elemental planes */
    return attk;
}

// C ref: mhitu.c calc_mattacku_vars()
function calc_mattacku_vars(mtmp, v) {
    v.ranged = (mdistu(mtmp) > 3);
    v.range2 = !monnear(mtmp, mtmp.mux, mtmp.muy);
    v.foundyou = u_at(mtmp.mux, mtmp.muy);
    v.youseeit = canseemon(mtmp);

    /* do_attack() uses bhitpos to set/clear notonhead; do likewise here */
    game.bhitpos = { x: game.u.ux, y: game.u.uy };
    game.notonhead = false;
}

// C ref: mhitu.c mtrapped_in_pit()
/* return TRUE iff monster or hero is trapped in a (spiked) pit */
export function mtrapped_in_pit(mtmp) {
    let ttmp = null;

    if (mtmp === game.youmonst)
        ttmp = (game.u.utrap && game.u.utraptype === TT_PIT)
               ? t_at(game.u.ux, game.u.uy) : null;
    else
        ttmp = mtmp.mtrapped ? t_at(mtmp.mx, mtmp.my) : null;

    if (ttmp && is_pit(ttmp.ttyp))
        return true;
    return false;
}

// C ref: mhitu.c mattacku()
/*
 * mattacku: monster attacks you
 *      returns 1 if monster dies (e.g. "yellow light"), 0 otherwise
 */
// C ref: mhitu.c summonmu() -- demons summoning demons, were creatures
// changing form and summoning critters; extracted from mattacku()
async function summonmu(mtmp, youseeit) {
    let mdat = mtmp.data;

    /*
     * Extracted from mattacku() to reduce clutter there.
     * Caller has verified that 'mtmp' hasn't been cancelled
     * and isn't a shapechanger.
     */

    if (is_demon(mdat)) {
        if (mdat !== mons[M.PM_BALROG] && mdat !== mons[M.PM_AMOROUS_DEMON]) {
            if (!rn2(In_hell(game.u.uz) ? 10 : 16))
                throw new Error('summonmu(): msummon() not ported yet');
        }
        return; /* no such thing as a demon were creature, so we're done */
    }

    if (is_were(mdat)) {
        const Prot_shape = !!(game.u.uprops[PROT_FROM_SHAPE_CHANGERS].intrinsic
                              || game.u.uprops[PROT_FROM_SHAPE_CHANGERS].extrinsic);
        /* if hero has Protection_from_shape_changers, new_were() will work
           in the critter-to-human direction but be a no-op the other way;
           we repeat the criteria here for clarity */
        if ((mdat.mflags2 & M.M2_HUMAN) !== 0) { /* is_human(): maybe switch to animal form */
            if (!Prot_shape && !rn2(5 - (night() * 2)))
                await new_were(mtmp);
        } else { /* maybe switch to back human form */
            if (Prot_shape || !rn2(30))
                await new_were(mtmp);
        }
        mdat = mtmp.data; /* form change invalidates cached value */

        /* maybe summon compatible critters;
           not blocked by Protection_from_shape_changers */
        if (!rn2(10)) {
            void youseeit;
            throw new Error('summonmu(): were_summon() not ported yet');
        }
        return;
    } /* were creature */
}

export async function mattacku(mtmp) {
    const u = game.u;
    let mattk;
    let i, j = 0, tmp;
    const sum = new Array(NATTK).fill(M_ATTK_MISS);
    let mdat = mtmp.data;
    const v = { ranged: false, range2: false, foundyou: false, youseeit: false };
    let skipnonmagc = false;

    calc_mattacku_vars(mtmp, v);

    if (!v.ranged)
        nomul(0);
    if (DEADMONSTER(mtmp))
        return 1;
    if (Underwater() && !is_swimmer(mtmp.data))
        return 0;

    /* If swallowed, can only be affected by u.ustuck */
    if (u.uswallow) {
        throw new Error('mattacku(): swallowed hero not ported yet');
    } else if (u.usteed) {
        if (mtmp === u.usteed)
            /* Your steed won't attack you */
            return 0;
        /* Orcs like to steal and eat horses and the like */
        if (!rn2(is_orc(mtmp.data) ? 2 : 4) && m_next2u(mtmp))
            throw new Error('mattacku(): attacking hero\'s steed not ported yet');
    }

    if (u.uundetected && !v.range2 && v.foundyou && !u.uswallow)
        throw new Error('mattacku(): hidden hero not ported yet');

    /* hero might be a mimic, concealed via #monster */
    if (game.youmonst.data.mlet === M.S_MIMIC && game.youmonst.m_ap_type
        && !v.range2 && v.foundyou && !u.uswallow)
        throw new Error('mattacku(): mimicking hero not ported yet');

    /* non-mimic hero might be mimicking an object after eating m corpse */
    if (game.youmonst.m_ap_type && !v.range2 && v.foundyou && !u.uswallow)
        throw new Error('mattacku(): hero mimicking an object not ported yet');

    /*  Work out the armor class differential   */
    tmp = AC_VALUE(u.uac) + 10; /* tmp ~= 0 - 20 */
    tmp += mtmp.m_lev;
    if (game.multi < 0)
        tmp += 4;
    if ((Invis() && !perceives(mdat)) || !mtmp.mcansee)
        tmp -= 2;
    if (mtmp.mtrapped)
        tmp -= 2;
    if (tmp <= 0)
        tmp = 1;

    /* make eels visible the moment they hit/miss us */
    if (mdat.mlet === M.S_EEL && mtmp.minvis && cansee(mtmp.mx, mtmp.my))
        throw new Error('mattacku(): eel visibility not ported yet');

    /* when not cancelled and not in current form due to shapechange, many
       demons can summon more demons and were creatures can summon critters;
       also, were creature might change from human to animal or vice versa */
    if (mtmp.cham === NON_PM && !mtmp.mcan && !v.range2
        && (is_demon(mdat) || is_were(mdat))) {
        const already_fleeing = mtmp.mflee !== 0 && !!mtmp.mflee;

        await summonmu(mtmp, v.youseeit);
        /* were-creature might have changed to beast form; if that has
           caused it to become afraid (due to non-human reacting to scroll
           of scare monster or engraved "Elbereth" which was being ignored
           while in human form), don't continue this attack */
        if (mtmp.mflee && !already_fleeing)
            return 0;
        mdat = mtmp.data; /* update cached value in case of were change */
    }

    if (u.uinvulnerable) { /* in the midst of successful prayer */
        /* monsters won't attack you */
        if (mtmp === u.ustuck) {
            await pline(`${Monnam(mtmp)} loosens its grip slightly.`); /* pline_mon() */
        } else if (!v.range2) {
            if (v.youseeit || sensemon(mtmp))
                await pline(`${Monnam(mtmp)} starts to attack you, but pulls back.`);
            else
                await You_feel("something move nearby."); /* something */
        }
        return 0;
    }

    /* Unlike defensive stuff, don't let them use item _and_ attack. */
    if (find_offensive(mtmp)) {
        const offended = await use_offensive(mtmp);

        if (offended !== 0)
            return (offended === 1) ? 1 : 0;
    }

    game.skipdrin = false; /* [see mattackm(mhitm.c)] */
    const firstfoundyou = v.foundyou;

    for (i = 0; i < NATTK; i++) {
        sum[i] = M_ATTK_MISS;
        /* counterattack against attack [i-1] might have been fatal */
        if (DEADMONSTER(mtmp))
            return 1;
        if (i > 0) {
            /* recalc in case prior attack moved hero */
            calc_mattacku_vars(mtmp, v);
            /* if hero was found but isn't anymore, avoid wildmiss now */
            if (firstfoundyou && !v.foundyou)
                continue; /* set sum[i] to 'miss' but skip other actions */
            if (!u_at(game.bhitpos.x, game.bhitpos.y))
                continue;
        }
        mon_currwep = null;
        mattk = getmattk(mtmp, game.youmonst, i, sum);
        if ((u.uswallow && mattk.aatyp !== AT_ENGL)
            || (skipnonmagc && mattk.aatyp !== AT_MAGC)
            || (game.skipdrin && mattk.aatyp === AT_TENT
                && mattk.adtyp === AD_DRIN))
            continue;

        switch (mattk.aatyp) {
        case AT_CLAW: /* "hand to hand" attacks */
        case AT_KICK:
        case AT_BITE:
        case AT_STNG:
        case AT_TUCH:
        case AT_BUTT:
        case AT_TENT:
            if (mattk.aatyp === AT_KICK && mtrapped_in_pit(mtmp))
                continue;
            if (!v.range2 && (!mtmp.mw || mtmp.mconf || Conflict()
                              || !touch_petrifies(game.youmonst.data))) {
                if (v.foundyou) {
                    if (tmp > (j = rnd(20 + i))) {
                        if (unsolid(game.youmonst.data))
                            throw new Error('mattacku(): failed_grab() not ported yet');
                        if (mattk.aatyp !== AT_KICK
                            || !thick_skinned(game.youmonst.data))
                            sum[i] = await hitmu(mtmp, mattk);
                    } else
                        await missmu(mtmp, (tmp === j), mattk);
                } else {
                    await wildmiss(mtmp, mattk);
                    /* skip any remaining non-spell attacks */
                    skipnonmagc = true;
                }
            }
            break;

        case AT_HUGS: /* automatic if prev two attacks succeed */
            /* Note: if displaced, prev attacks never succeeded */
            if ((!v.range2 && i >= 2 && sum[i - 1] && sum[i - 2])
                || mtmp === u.ustuck)
                throw new Error('mattacku(): AT_HUGS (failed_grab()) not ported yet');
            break;

        case AT_GAZE: /* can affect you either ranged or not */
            /* Medusa gaze already operated through m_respond in
               dochug(); don't gaze more than once per round. */
            if (mdat !== mons[M.PM_MEDUSA])
                throw new Error('mattacku(): gazemu() not ported yet');
            break;

        case AT_EXPL: /* automatic hit if next to, and aimed at you */
            if (!v.range2)
                sum[i] = await explmu(mtmp, mattk, v.foundyou);
            break;

        case AT_ENGL:
            if (!v.range2)
                throw new Error('mattacku(): gulpmu() not ported yet');
            break;
        case AT_BREA:
            if (v.range2)
                sum[i] = await breamu(mtmp, mattk);
            /* Note: breamu takes care of displacement */
            break;
        case AT_SPIT:
            if (v.range2)
                sum[i] = await spitmu(mtmp, mattk);
            /* Note: spitmu takes care of displacement */
            break;
        case AT_WEAP:
            if (v.range2) {
                if (!Is_rogue_level(u.uz))
                    await thrwmu(mtmp);
            } else {
                let hittmp = 0;

                /* Rare but not impossible.  Normally the monster
                 * wields when 2 spaces away, but it can be
                 * teleported or whatever....
                 */
                if (mtmp.weapon_check === NEED_WEAPON || !mtmp.mw) {
                    mtmp.weapon_check = NEED_HTH_WEAPON;
                    /* mon_wield_item resets weapon_check as appropriate */
                    if (await mon_wield_item(mtmp) !== 0)
                        break;
                }
                if (v.foundyou) {
                    mon_currwep = mtmp.mw || null; /* MON_WEP(mtmp) */
                    if (mon_currwep) {
                        const bash = (is_pole(mon_currwep)
                                      && !is_art(mon_currwep, ART_SNICKERSNEE)
                                      && m_next2u(mtmp));

                        hittmp = hitval(mon_currwep, game.youmonst);
                        tmp += hittmp;
                        await mswings(mtmp, mon_currwep, bash);
                    }
                    if (tmp > (j = game.mhitu_dieroll = rnd(20 + i)))
                        sum[i] = await hitmu(mtmp, mattk);
                    else
                        await missmu(mtmp, (tmp === j), mattk);
                    /* KMH -- Don't accumulate to-hit bonuses */
                    if (mon_currwep)
                        tmp -= hittmp;
                } else {
                    await wildmiss(mtmp, mattk);
                    /* skip any remaining non-spell attacks */
                    skipnonmagc = true;
                }
            }
            break;
        case AT_MAGC:
            if (v.range2)
                sum[i] = await buzzmu(mtmp, mattk);
            else
                sum[i] = await castmu(mtmp, mattk, true, v.foundyou);
            break;

        default: /* no attack */
            break;
        }
        if (game.disp_botl)
            bot();
        /* give player a chance of waking up before dying -kaa */
        if (sum[i] === M_ATTK_HIT) { /* successful attack */
            if (u.usleep && u.usleep < game.moves && !rn2(10)) {
                game.multi = -1;
                game.nomovemsg = 'The combat suddenly awakens you.';
            }
        }
        if ((sum[i] & M_ATTK_AGR_DIED))
            return 1; /* attacker dead */
        if ((sum[i] & M_ATTK_AGR_DONE))
            break; /* attacker teleported, no more attacks */
        /* sum[i] == 0: unsuccessful attack */
    }
    return 0;
}

// C ref: mhitu.c magic_negation()
/* armor that sufficiently covers the body might be able to block magic */
export function magic_negation(mon) {
    const is_you = (mon === game.youmonst);
    let via_amul = false;
    let mc = 0;
    let gotprot = is_you ? !!game.u.uprops[PROTECTION].extrinsic
                         /* high priests have innate protection */
                         : (mon.data === mons[M.PM_HIGH_CLERIC]);

    if (!is_you)
        throw new Error('magic_negation(): monster defender not ported yet');
    for (let o = game.invent; o; o = o.nobj) {
        /* a_can field is only applicable for armor (which must be worn) */
        if ((o.owornmask & W_ARMOR) !== 0) {
            const armpro = objects[o.otyp].a_can;
            if (armpro > mc)
                mc = armpro;
        } else if ((o.owornmask & W_AMUL) !== 0) {
            via_amul = (o.otyp === AMULET_OF_GUARDING);
        }
        /* if we've already confirmed Protection, skip additional checks */
        if (is_you || gotprot)
            continue;
    }

    if (gotprot) {
        /* extrinsic Protection increases mc by 1 (2 for amulet of guarding);
           multiple sources don't provide multiple increments */
        mc += via_amul ? 2 : 1;
        if (mc > 3)
            mc = 3;
    } else if (mc < 1) {
        /* intrinsic Protection is weaker (play balance; obtaining divine
           protection is too easy); it confers minimum mc 1 instead of 0 */
        if ((is_you && ((game.u.uprops[PROTECTION].intrinsic
                         && game.u.ublessed > 0) || game.u.uspellprot))
            /* aligned priests and angels have innate intrinsic Protection */
            || (mon.data === mons[M.PM_ALIGNED_CLERIC]
                || (mon.data.mflags2 & M.M2_MINION) !== 0))
            mc = 1;
    }
    return mc;
}

// C ref: mhitu.c hitmu()
/*
 * hitmu: monster hits you
 * returns MM_ flags
 */
async function hitmu(mtmp, mattk) {
    const u = game.u;
    const mdat = mtmp.data;
    const olduasmon = game.youmonst.data;
    let res;
    const mhm = {
        hitflags: M_ATTK_MISS,
        permdmg: 0,
        specialdmg: 0,
        done: false,
        damage: 0,
    };

    if (!canspotmon(mtmp))
        map_invisible(mtmp.mx, mtmp.my);

    /*  If the monster is undetected & hits you, you should know where
     *  the attack came from.
     */
    if (mtmp.mundetected && (hides_under(mdat) || mdat.mlet === M.S_EEL))
        throw new Error('hitmu(): undetected attacker reveal not ported yet');

    /*  First determine the base damage done */
    mhm.damage = d(mattk.damn, mattk.damd);
    if ((is_undead(mdat) || is_vampshifter(mtmp)) && midnight())
        mhm.damage += d(mattk.damn, mattk.damd); /* extra dmg */

    await mhitm_adtyping(mtmp, mattk, game.youmonst, mhm);

    await mhitm_knockback(mtmp, game.youmonst, mattk, mhm, !!mtmp.mw);

    if (mhm.done)
        return mhm.hitflags;

    if ((Upolyd() ? u.mh : u.uhp) < 1) {
        /* already dead? call rehumanize() or done_in_by() as appropriate */
        await mdamageu(mtmp, 1);
        mhm.damage = 0;
    }

    /*  Negative armor class reduces damage done instead of fully protecting
     *  against hits.
     */
    if (mhm.damage && u.uac < 0) {
        mhm.damage -= rnd(-u.uac);
        if (mhm.damage < 1)
            mhm.damage = 1;
    }

    if (mhm.damage > 0) {
        /* [Half_physical_damage isn't applied to mhm.permdmg] */
        if (Half_physical_damage())
            mhm.damage = Math.trunc((mhm.damage + 1) / 2);
        /* Mitre of Holiness: is_quest_artifact() isn't ported yet */

        if (mhm.permdmg) /* Death's life force drain */
            throw new Error('hitmu(): permanent damage (Death) not ported yet');

        await mdamageu(mtmp, mhm.damage);
    }

    if (mhm.damage)
        res = await passiveum(olduasmon, mtmp, mattk);
    else
        res = M_ATTK_HIT;
    await stop_occupation();
    return res;
}

// C ref: hack.c showdamage()
async function showdamage(dmg) {
    if (!game.iflags?.showdamage || !dmg)
        return;

    await pline(`[HP ${-dmg}, ${Upolyd() ? game.u.mh : game.u.uhp} left]`);
}

// C ref: mhitu.c mdamageu()
/* mtmp hits you for n points damage */
export async function mdamageu(mtmp, n) {
    const u = game.u;
    if (n < 0)
        n = 0; /* impossible("mdamageu for negative damage?") */

    game.disp_botl = true;
    if (Upolyd()) {
        u.mh -= n;
        await showdamage(n);
        /* caller might have reduced mhmax before calling mdamageu() */
        if (u.mh > u.mhmax)
            u.mh = u.mhmax;
        if (u.mh < 1)
            throw new Error('mdamageu(): rehumanize() not ported yet');
    } else {
        u.uhp -= n;
        await showdamage(n);
        /* caller might have reduced uhpmax before calling mdamageu() */
        if (u.uhp > u.uhpmax)
            u.uhp = u.uhpmax;
        if (u.uhp < 1)
            await done_in_by(mtmp, DIED);
    }
}

// C ref: mhitu.c could_seduce()
/* returns 0 if seduction impossible,
 *         1 if fine,
 *         2 if wrong gender for nymph
 */
export function could_seduce(magr, mdef, mattk) {
    let pagr;
    let agrinvis, defperc;
    let genagr, gendef;
    let adtyp;

    if (is_animal(magr.data))
        return 0;
    if (magr === game.youmonst) {
        pagr = game.youmonst.data;
        agrinvis = Invis();
        genagr = poly_gender();
    } else {
        pagr = magr.data;
        agrinvis = magr.minvis;
        genagr = gender(magr);
    }
    adtyp = mattk ? mattk.adtyp
            : dmgtype(pagr, AD_SSEX) ? AD_SSEX
              : dmgtype(pagr, AD_SEDU) ? AD_SEDU
                : AD_PHYS;
    /* SYSOPT_SEDUCE is on in the recorded games */

    /* nymphs have two attacks, one for steal-item damage and the other
       for seduction, both pass the could_seduce() test;
       incubi/succubi have three attacks, their claw attacks for damage
       don't pass the test */
    if ((pagr.mlet !== M.S_NYMPH && pagr !== mons[M.PM_AMOROUS_DEMON])
        || (adtyp !== AD_SEDU && adtyp !== AD_SSEX && adtyp !== AD_SITM))
        return 0;

    if (mdef === game.youmonst) {
        defperc = See_invisible();
        gendef = poly_gender();
    } else {
        defperc = perceives(mdef.data);
        gendef = gender(mdef);
    }
    if (agrinvis && !defperc && adtyp === AD_SEDU)
        return 0;

    return (genagr === 1 - gendef) ? 1 : (pagr.mlet === M.S_NYMPH) ? 2 : 0;
}

// C ref: polyself.c ugolemeffects()
export async function ugolemeffects(damtype, dam) {
    const u = game.u;
    let heal = 0;

    /* We won't bother with "slow"/"haste" since players do not
     * have a monster-specific slow/haste so there is no way to
     * restore the old velocity once they are back to human.
     */
    if (u.umonnum !== M.PM_FLESH_GOLEM && u.umonnum !== M.PM_IRON_GOLEM)
        return;
    switch (damtype) {
    case M.AD_ELEC:
        if (u.umonnum === M.PM_FLESH_GOLEM)
            heal = Math.trunc((dam + 5) / 6); /* Approx 1 per die */
        break;
    case M.AD_FIRE:
        if (u.umonnum === M.PM_IRON_GOLEM)
            heal = dam;
        break;
    }
    if (heal && (u.mh < u.mhmax)) {
        u.mh += heal;
        if (u.mh > u.mhmax)
            u.mh = u.mhmax;
        game.disp_botl = true;
        await pline("Strangely, you feel better than before.");
        exercise(A_STR, true);
    }
}

// C ref: mhitu.c explmu()
/* monster explodes in your face */
async function explmu(mtmp, mattk, ufound) {
    const u = game.u;
    let kill_agr = true;
    let not_affected;
    let tmp;

    if (mtmp.mcan)
        return M_ATTK_MISS;

    tmp = d(mattk.damn, mattk.damd);
    not_affected = defended(mtmp, mattk.adtyp);
    if (!ufound) {
        await pline(`${canseemon(mtmp) ? Monnam(mtmp) : "It"} explodes at a spot in ${
            (game.level.at(mtmp.mux, mtmp.muy).typ === WATER) /* is_waterwall() */
                ? "empty water" : "thin air"}!`);
    } else {
        await hitmsg(mtmp, mattk);
    }

    switch (mattk.adtyp) {
    case AD_COLD:
    case M.AD_FIRE:
    case M.AD_ELEC:
        throw new Error('explmu(): mon_explodes() (explode()) not ported yet');
    case M.AD_BLND:
        not_affected = resists_blnd(game.youmonst);
        if (ufound && !not_affected) {
            /* sometimes you're affected even if it's invisible */
            if (mon_visible(mtmp) || (rnd(tmp = Math.trunc(tmp / 2)) > u.ulevel)) {
                await pline("You are blinded by a blast of light!"); /* You() */
                await make_blinded(tmp, false);
                if (!Blind())
                    await pline("Your vision quickly clears."); /* Your1(vision_clears) */
            } else if (game.flags.verbose)
                await pline("You get the impression it was not terribly bright."); /* You() */
        }
        break;
    case M.AD_HALU:
        not_affected = not_affected
                       || Blind() || (u.umonnum === M.PM_BLACK_LIGHT
                                      || u.umonnum === M.PM_VIOLET_FUNGUS
                                      || dmgtype(game.youmonst.data, M.AD_STUN));
        if (ufound && !not_affected) {
            let chg;
            if (!Hallucination())
                await pline("You are caught in a blast of kaleidoscopic light!"); /* You() */
            /* avoid hallucinating the black light as it dies */
            await mondead(mtmp);    /* remove it from map now */
            kill_agr = false; /* already killed (maybe lifesaved) */
            chg = await make_hallucinated(game.u.uprops[HALLUC].intrinsic + tmp, false, 0);
            await pline(`You ${chg ? "are freaked out" : "seem unaffected"}.`); /* You() */
        }
        break;
    default:
        /* impossible("unknown exploder damage type %d", mattk->adtyp) */
        break;
    }
    if (not_affected) {
        await pline("You seem unaffected by it."); /* You() */
        await ugolemeffects(mattk.adtyp, tmp);
    }
    if (kill_agr && !DEADMONSTER(mtmp))
        await mondead(mtmp);
    await wake_nearto(mtmp.mx, mtmp.my, 7 * 7);
    return (!DEADMONSTER(mtmp)) ? M_ATTK_MISS : M_ATTK_AGR_DIED;
}

/* C ref: mhitu.c ld() -- leap day */
function ld() { return (yyyymmdd(0) - (getyear() * 10000)) === 0xe5; }
/* C ref: calendar.c getyear() */
function getyear() { return Math.trunc(yyyymmdd(0) / 10000); }
/* C ref: you.h mhe(), noit_mhim() */
function mhe(mtmp) { return genders[pronoun_gender(mtmp, PRONOUN_HALLU)].he; }
function noit_mhim(mtmp) {
    return genders[pronoun_gender(mtmp, PRONOUN_NO_IT | PRONOUN_HALLU)].him;
}
/* C ref: pline.c verbalize() */
async function verbalize(line) {
    if (Deaf())
        return; /* vpline(): PLINE_VERBALIZE is dropped when Deaf */
    await pline(`"${line}"`);
}
/* C ref: invent.c u_carried_gloves() */
function u_carried_gloves() {
    let otmp, gloves = null;

    if (game.uarmg) {
        gloves = game.uarmg;
    } else {
        for (otmp = game.invent; otmp; otmp = otmp.nobj)
            if (otmp.oclass === ARMOR_CLASS
                && objects[otmp.otyp].oc_armcat === ARM_GLOVES) { /* is_gloves() */
                gloves = otmp;
                break;
            }
    }
    return gloves;
}
/* C ref: hack.h makeknown() */
function makeknown(x) { discover_object(x, true, true, true); }

// C ref: mhitu.c doseduce()
/* Returns 1 if monster teleported (or hero leaves monster's vicinity) */
export async function doseduce(mon) {
    const u = game.u;
    let ring, nring;
    const fem = (mon.data === mons[M.PM_AMOROUS_DEMON]
                 && Mgender(mon) === FEMALE); /* otherwise incubus */
    let seewho, naked; /* True iff no armor */
    let attr_tot, tried_gloves = 0;
    let qbuf, Who;

    if (mon.mcan || mon.mspec_used) {
        await pline(`${Monnam(mon)} acts as though ${mhe(mon)} has got a ${
            mon.mcan ? "severe " : ""}headache.`); /* pline_mon() */
        return 0;
    }
    if (unresponsive()) {
        await pline(`${Monnam(mon)} seems dismayed at your lack of response.`);
        return 0;
    }

    seewho = canseemon(mon);
    if (!seewho)
        await pline("Someone caresses you...");
    else
        await You_feel(`very attracted to ${mon_nam(mon)}.`);
    /* cache the seducer's name in a local buffer */
    Who = (!seewho ? (fem ? "She" : "He") : Monnam(mon));

    /* if in the process of putting armor on or taking armor off,
       interrupt that activity now */
    await stop_donning(null);
    /* don't try to take off gloves if cursed weapon blocks them */
    if (welded(game.uwep))
        tried_gloves = 1;

    for (ring = game.invent; ring; ring = nring) {
        nring = ring.nobj;
        if (ring.otyp !== RIN_ADORNMENT)
            continue;
        if (fem) {
            if (ring.owornmask && game.uarmg) {
                /* don't take off worn ring if gloves are in the way */
                if (!tried_gloves++)
                    await mayberem(mon, Who, game.uarmg, "gloves");
                if (game.uarmg)
                    continue; /* next ring might not be worn */
            }
            /* confirmation prompt when charisma is high bypassed if deaf */
            if (!Deaf() && rn2(20) < ACURR(A_CHA)) {
                qbuf = safe_qbuf("\"That ", " looks pretty.  May I have it?\"",
                                 ring, xname, "ring");
                makeknown(RIN_ADORNMENT);
                /* SetVoice(mon, 0, 80, 0); */
                if (await tty_yn_function(qbuf, "yn", 'n') === 'n') /* y_n() */
                    continue;
            } else
                await pline(`${Who} decides she'd like ${yname(ring)}, and takes it.`);
            makeknown(RIN_ADORNMENT);
            /* might be in left or right ring slot or weapon/alt-wep/quiver */
            if (ring.owornmask)
                await remove_worn_item(ring, false);
            freeinv(ring);
            mpickobj(mon, ring);
        } else {
            if (game.uleft && game.uright && game.uleft.otyp === RIN_ADORNMENT
                && game.uright.otyp === RIN_ADORNMENT)
                break;
            if (ring === game.uleft || ring === game.uright)
                continue;
            if (game.uarmg) {
                /* don't put on ring if gloves are in the way */
                if (!tried_gloves++)
                    await mayberem(mon, Who, game.uarmg, "gloves");
                if (game.uarmg)
                    break; /* no point trying further rings */
            }
            /* confirmation prompt when charisma is high bypassed if deaf */
            if (!Deaf() && rn2(20) < ACURR(A_CHA)) {
                qbuf = safe_qbuf("\"That ",
                                 " looks pretty.  Would you wear it for me?\"",
                                 ring, xname, "ring");
                makeknown(RIN_ADORNMENT);
                /* SetVoice(mon, 0, 80, 0); */
                if (await tty_yn_function(qbuf, "yn", 'n') === 'n') /* y_n() */
                    continue;
            } else {
                await pline(`${Who} decides you'd look prettier wearing ${yname(ring)},`);
                await pline("and puts it on your finger.");
            }
            makeknown(RIN_ADORNMENT);
            if (!game.uright) {
                await pline(`${Who} puts ${the(xname(ring))} on your right ${body_part(HAND)}.`);
                setworn(ring, RIGHT_RING);
            } else if (!game.uleft) {
                await pline(`${Who} puts ${the(xname(ring))} on your left ${body_part(HAND)}.`);
                setworn(ring, LEFT_RING);
            } else if (game.uright && game.uright.otyp !== RIN_ADORNMENT) {
                /* note: the "replaces" message might be inaccurate if
                   hero's location changes and the process gets interrupted,
                   but trying to figure that out in advance in order to use
                   alternate wording is not worth the effort */
                await pline(`${Who} replaces ${yname(game.uright)} with ${yname(ring)}.`);
                throw new Error('doseduce(): Ring_gone() not ported yet');
            } else if (game.uleft && game.uleft.otyp !== RIN_ADORNMENT) {
                /* see "replaces" note above */
                await pline(`${Who} replaces ${yname(game.uleft)} with ${yname(ring)}.`);
                throw new Error('doseduce(): Ring_gone() not ported yet');
            } else {
                /* impossible("ring replacement") */
            }
            await Ring_on(ring);
            await prinv(null, ring, 0);
        }
    }

    naked = (!game.uarmc && !game.uarmf && !game.uarmg && !game.uarms
             && !game.uarmh && !game.uarmu);
    await urgent_pline(`${Who} ${
        Deaf() ? "seems to murmur into your ear"
        : naked ? "murmurs sweet nothings into your ear"
          : "murmurs in your ear"}${
        naked ? "" : ", while helping you undress"}.`);
    await mayberem(mon, Who, game.uarmc, cloak_simple_name(game.uarmc));
    if (!game.uarmc)
        await mayberem(mon, Who, game.uarm, suit_simple_name(game.uarm));
    await mayberem(mon, Who, game.uarmf, "boots");
    if (!tried_gloves)
        await mayberem(mon, Who, game.uarmg, "gloves");
    await mayberem(mon, Who, game.uarms, "shield");
    await mayberem(mon, Who, game.uarmh, helm_simple_name(game.uarmh));
    if (!game.uarmc && !game.uarm)
        await mayberem(mon, Who, game.uarmu, "shirt");

    /* removing armor (levitation boots, or levitation ring to make
       room for adornment ring with incubus case) might result in the
       hero falling through a trap door or landing on a teleport trap
       and changing location, so hero might not be adjacent to seducer
       any more (mayberem() has its own adjacency test so we don't need
       to check after each potential removal) */
    if (u.utotype || !m_next2u(mon))
        return 1;

    if (game.uarm || game.uarmc) {
        if (!Deaf()) {
            if (!(ld() && mon.female)) {
                /* SetVoice(mon, 0, 80, 0); */
                await verbalize(`You're such a ${
                    game.flags.female ? "sweet lady" : "nice guy"}; I wish...`);
            } else {
                const yourgloves = u_carried_gloves();

                /* have her call your gloves by their correct
                   name, possibly revealing them to you */
                if (yourgloves)
                    observe_object(yourgloves);
                await verbalize(`Well, then you owe me ${
                    yourgloves ? yname(yourgloves) : "twelve pairs of gloves"}${
                    yourgloves ? " and eleven more pairs of gloves" : ""}!`);
            }
        } else if (seewho)
            await pline(`${Monnam(mon)} appears to sigh.`); /* pline_mon() */
        /* else no regret message if can't see or hear seducer */

        if (!await tele_restrict(mon))
            await rloc(mon, RLOC_MSG);
        return 1;
    }
    if (u.ualign.type === A_CHAOTIC)
        adjalign(1);

    /* by this point you have discovered mon's identity, blind or not... */
    await urgent_pline(
        `Time stands still while you and ${noit_mon_nam(mon)} lie in each other's arms...`);
    /* 3.6.1: a combined total for charisma plus intelligence of 35-1
       used to guarantee successful outcome; now total maxes out at 32
       as far as deciding what will happen; chance for bad outcome when
       Cha+Int is 32 or more is 2/35, a bit over 5.7% */
    attr_tot = ACURR(A_CHA) + ACURR(A_INT);
    if (rn2(35) > Math.min(attr_tot, 32)) {
        /* Don't bother with mspec_used here... it didn't get tired! */
        await pline(`${noit_Monnam(mon)} seems to have enjoyed it more than you...`);
        switch (rn2(5)) {
        case 0:
            await You_feel("drained of energy.");
            u.uen = 0;
            u.uenmax -= rnd(Half_physical_damage() ? 5 : 10);
            exercise(A_CON, false);
            if (u.uenmax < 0)
                u.uenmax = 0;
            break;
        case 1:
            await pline("You are down in the dumps."); /* You() */
            await adjattrib(A_CON, -1, true);
            exercise(A_CON, false);
            game.disp_botl = true;
            break;
        case 2:
            await pline("Your senses are dulled."); /* Your() */
            await adjattrib(A_WIS, -1, true);
            exercise(A_WIS, false);
            game.disp_botl = true;
            break;
        case 3:
            if (!resists_drli(game.youmonst)) {
                await You_feel("out of shape.");
                await losexp("overexertion");
            } else {
                await pline("You have a curious feeling..."); /* You() */
            }
            exercise(A_CON, false);
            exercise(A_DEX, false);
            exercise(A_WIS, false);
            break;
        case 4: {
            let tmp;

            await You_feel("exhausted.");
            exercise(A_STR, false);
            tmp = rn1(10, 6);
            await losehp(Maybe_Half_Phys(tmp), "exhaustion", KILLED_BY);
            break;
        } /* case 4 */
        } /* switch */
    } else {
        mon.mspec_used = rnd(100); /* monster is worn out */
        await pline(`You seem to have enjoyed it more than ${noit_mon_nam(mon)}...`); /* You() */
        switch (rn2(5)) {
        case 0:
            await You_feel("raised to your full potential.");
            exercise(A_CON, true);
            u.uen = (u.uenmax += rnd(5));
            if (u.uenmax > (u.uenpeak || 0))
                u.uenpeak = u.uenmax;
            break;
        case 1:
            await You_feel("good enough to do it again.");
            await adjattrib(A_CON, 1, true);
            exercise(A_CON, true);
            game.disp_botl = true;
            break;
        case 2:
            await pline(`You will always remember ${noit_mon_nam(mon)}...`); /* You() */
            await adjattrib(A_WIS, 1, true);
            exercise(A_WIS, true);
            game.disp_botl = true;
            break;
        case 3:
            await pline("That was a very educational experience.");
            await pluslvl(false);
            exercise(A_WIS, true);
            break;
        case 4:
            await You_feel("restored to health!");
            u.uhp = u.uhpmax;
            if (Upolyd())
                u.mh = u.mhmax;
            exercise(A_STR, true);
            game.disp_botl = true;
            break;
        }
    }

    if (mon.mtame) { /* don't charge */
        ;
    } else if (rn2(20) < ACURR(A_CHA)) {
        await pline(`${noit_Monnam(mon)} demands that you pay ${
            noit_mhim(mon)}, but you refuse...`);
    } else if (u.umonnum === M.PM_LEPRECHAUN) {
        await pline(`${noit_Monnam(mon)} tries to take your gold, but fails...`);
    } else {
        let cost;
        const umoney = money_cnt(game.invent);

        if (umoney > LARGEST_INT - 10)
            cost = rnd(LARGEST_INT) + 500;
        else
            cost = rnd(umoney + 10) + 500;
        if (mon.mpeaceful) {
            cost = Math.trunc(cost / 5);
            if (!cost)
                cost = 1;
        }
        if (cost > umoney)
            cost = umoney;
        if (!cost) {
            if (!Deaf()) {
                /* SetVoice(mon, 0, 80, 0); */
                await verbalize("It's on the house!");
            } else {
                await pline("No charge.");
            }
        } else {
            await pline(`${noit_Monnam(mon)} takes ${cost} ${
                currency(cost)} for services rendered!`); /* pline_mon() */
            money2mon(mon, cost);
            game.disp_botl = true;
        }
    }
    if (!rn2(25))
        mon.mcan = 1; /* monster is worn out */
    if (!await tele_restrict(mon))
        await rloc(mon, RLOC_MSG);
    return 1;
}

// C ref: mhitu.c mayberem()
/* 'mon' tries to remove a piece of hero's armor */
async function mayberem(mon,
                        seducer, /* only used for alternate message */
                        obj, str) {
    let qbuf;

    if (!obj || !obj.owornmask)
        return;
    /* removal of a previous item might have sent the hero elsewhere
       (loss of levitation that leads to landing on a transport trap) */
    if (game.u.utotype || !m_next2u(mon))
        return;

    /* being deaf overrides confirmation prompt for high charisma */
    if (Deaf()) {
        await pline(`${seducer} takes off your ${str}.`);
    } else if (rn2(20) < ACURR(A_CHA)) {
        /* SetVoice(mon, 0, 80, 0); -- y_n aka yn_function is set up for this */
        qbuf = `"Shall I remove your ${str}, ${
            (!rn2(2) ? "lover" : !rn2(2) ? "dear" : "sweetheart")}?"`;
        if (await tty_yn_function(qbuf, "yn", 'n') === 'n') /* y_n() */
            return;
    } else {
        const hairbuf = `let me run my fingers through your ${body_part(HAIR)}`;

        /* SetVoice(mon, 0, 80, 0); */
        await verbalize(`Take off your ${str}; ${
            (obj === game.uarm)
               ? "let's get a little closer"
               : (obj === game.uarmc || obj === game.uarms)
                  ? "it's in the way"
                  : (obj === game.uarmf)
                     ? "let me rub your feet"
                     : (obj === game.uarmg)
                        ? "they're too clumsy"
                        : (obj === game.uarmu)
                           ? "let me massage you"
                           /* obj == uarmh */
                           : hairbuf}.`);
    }
    await remove_worn_item(obj, true);
}

// C ref: mhitu.c passiveum()
async function passiveum(olduasmon, mtmp, mattk) {
    let i, tmp;
    let oldu_mattk = null;

    void mattk; void mtmp;
    for (i = 0; !oldu_mattk; i++) {
        if (i >= NATTK)
            return M_ATTK_HIT;
        if ((olduasmon.mattk[i]?.aatyp ?? AT_NONE) === AT_NONE
            || olduasmon.mattk[i].aatyp === AT_BOOM)
            oldu_mattk = olduasmon.mattk[i] || { aatyp: AT_NONE, adtyp: AD_PHYS,
                                                  damn: 0, damd: 0 };
    }
    if (oldu_mattk.damn)
        tmp = d(oldu_mattk.damn, oldu_mattk.damd);
    else if (oldu_mattk.damd)
        tmp = d(olduasmon.mlevel + 1, oldu_mattk.damd);
    else
        tmp = 0;
    void tmp;

    /* These affect the enemy even if you were "killed" (rehumanized) */
    switch (oldu_mattk.adtyp) {
    case AD_ACID:
    case AD_STON:
    case AD_ENCH:
        throw new Error('passiveum(): acid/stoning/disenchant passives not ported yet');
    default:
        break;
    }
    if (!Upolyd())
        return M_ATTK_HIT;
    throw new Error('passiveum(): polymorphed hero passives not ported yet');
}

void mon_currwep; void Blind; void AT_GAZE;
