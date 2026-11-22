// detect.js — detection and searching.
// C ref: detect.c
//
// Ported so far: dosearch0() (not its feel_location()/unmap_invisible()
// parts), mfind0(), warnreveal() and lock.c cvt_sdoor_to_door().

import { game } from './gstate.js';
import { rnl } from './rng.js';
import { pline, newsym, docrt, flush_screen, glyph_at, glyph_kind, show_glyph,
         back_to_glyph, trap_to_glyph, covers_objects, xy_set_wall_state,
         cmap_to_glyph } from './display.js';
import { cansee } from './vision.js';
import { visible_region_at } from './region.js';
import { getpos } from './getpos.js';
import { COLNO, ROWNO, SVALL, TER_MAP, TER_TRP, TER_OBJ, TER_MON, TER_FULL,
         HALLUC, STUNNED, CONFUSION, Is_waterlevel, M_AP_FURNITURE, IS_WALL } from './const.js';
import { NO_COLOR, CLR_GRAY } from './terminal.js';
import { recalc_block_point } from './vision.js';
import { exercise } from './attrib.js';
import { map_background, map_object, map_trap } from './display.js';
import { sobj_at } from './makemon.js';
import { STONE, W_NONDIGGABLE, W_NONPASSWALL } from './const.js';
import { BOULDER } from './objects.js';
import { m_at } from './makemon.js';
import { canspotmon, sensemon, warning_of, Blind, map_invisible,
         glyph_is_invisible } from './display.js';
import { tty_display_nhwindow } from './wintty.js';
import { seemimic } from './mon.js';
import { y_monnam, a_monnam } from './do_name.js';
import { cmd_safety_prevention } from './hack.js';
import { S_EEL, M1_HIDE, M1_CONCEAL } from './monsters.js';

// C ref: mondata.h is_hider(), hides_under()
function is_hider(ptr) { return (ptr.mflags1 & M1_HIDE) !== 0; }
function hides_under(ptr) { return (ptr.mflags1 & M1_CONCEAL) !== 0; }
import { t_at, STATUE_TRAP } from './trap.js';
import {
    A_WIS, SDOOR, SCORR, DOOR, CORR, WM_MASK, D_NODOOR, D_CLOSED, D_LOCKED,
    BLINDED, isok, Is_rogue_level,
} from './const.js';
import { LENSES } from './objects.js';

// C ref: lock.c cvt_sdoor_to_door()
export function cvt_sdoor_to_door(lev) {
    let newmask = (lev.doormask || 0) & ~WM_MASK;

    if (Is_rogue_level(game.u.uz)) {
        /* rogue didn't have doors, only doorways */
        newmask = D_NODOOR;
    } else {
        /* newly exposed door is closed */
        if (!(newmask & D_LOCKED))
            newmask |= D_CLOSED;
    }
    lev.typ = DOOR;
    lev.doormask = newmask;
    lev.arboreal_sdoor = 0; /* clears 'candig' */
}


/* C ref: hack.c nomul(0) */
function nomul0() {
    const g = game;
    if (g.multi < 0)
        return;
    g.multi = 0;
    /* u.uinvulnerable, usleep, multi_reason, travel/run flags: not
       ported yet */
}

// C ref: detect.c mfind0()
/* used by dosearch0() and warnreveal() */
async function mfind0(mtmp, via_warning) {
    const x = mtmp.mx, y = mtmp.my;
    let found_something = false;

    if (via_warning && !warning_of(mtmp))
        return -1;

    if (mtmp.m_ap_type) { /* M_AP_TYPE(mtmp) */
        seemimic(mtmp);
        found_something = true;
    } else {
        /* this used to only be executed if a !canspotmon() test passed
           but that failed to bring sensed monsters out of hiding */
        found_something = !canspotmon(mtmp);
        if (mtmp.mundetected && (is_hider(mtmp.data)
                                 || hides_under(mtmp.data)
                                 || mtmp.data.mlet === S_EEL)) {
            if (via_warning && found_something) {
                /* set_msg_xy(x, y): accessibility only */
                await pline(`Your danger sense causes you to take a second ${
                    Blind() ? "to check nearby" : "look close by"}.`);
                await tty_display_nhwindow(game.WIN_MESSAGE, false); /* flush messages */
            }
            mtmp.mundetected = 0;
            found_something = true;
        }
        newsym(x, y);
    }

    if (found_something) {
        if (!canspotmon(mtmp)
            && glyph_is_invisible(game.level.at(x, y).remembered_glyph))
            return -1; /* Found invisible monster in square which already has
                        * 'I' in it.  Logically, this should still take time
                        * and lead to `return 1', but if we did that the hero
                        * would keep finding the same monster every turn. */
        exercise(A_WIS, true);
        if (!canspotmon(mtmp)) {
            map_invisible(x, y);
            /* set_msg_xy(x, y) */
            await pline("You feel an unseen monster!");
        } else if (!sensemon(mtmp)) {
            /* set_msg_xy(x, y) */
            await pline(`You find ${mtmp.mtame ? y_monnam(mtmp) : a_monnam(mtmp)}.`);
        }
        return 1;
    }
    return 0;
}

// C ref: detect.c dosearch0()
export async function dosearch0(aflag) /* intrinsic autosearch vs explicit searching */ {
    const g = game;
    const u = g.u;
    let x, y, trap, mtmp;

    if (u.uswallow) {
        if (!aflag)
            await pline("What are you looking for?  The exit?");
    } else {
        /* uwep->oartifact && spec_ability(uwep, SPFX_SEARCH): artifacts
           aren't ported yet */
        let fund = 0;
        const Blind = u.uprops[BLINDED].intrinsic || u.uprops[BLINDED].extrinsic;

        if (g.ublindf && g.ublindf.otyp === LENSES && !Blind)
            fund += 2; /* JDS: lenses help searching */
        if (fund > 5)
            fund = 5;
        for (x = u.ux - 1; x < u.ux + 2; x++)
            for (y = u.uy - 1; y < u.uy + 2; y++) {
                if (!isok(x, y))
                    continue;
                if (x === u.ux && y === u.uy)
                    continue;

                if (!aflag && (Blind /* || visible_region_at(x, y) */))
                    throw new Error('dosearch0(): feel_location() not ported yet');
                const lev = g.level.at(x, y);
                if (lev.typ === SDOOR) {
                    if (rnl(7 - fund))
                        continue;
                    cvt_sdoor_to_door(lev); /* .typ = DOOR */
                    recalc_block_point(x, y);
                    exercise(A_WIS, true);
                    nomul0();
                    newsym(x, y); /* feel_location(): make sure it shows up */
                    await pline("You find a hidden door.");
                } else if (lev.typ === SCORR) {
                    if (rnl(7 - fund))
                        continue;
                    lev.typ = CORR;
                    recalc_block_point(x, y); /* unblock_point(): vision */
                    exercise(A_WIS, true);
                    nomul0();
                    newsym(x, y); /* feel_newsym(): make sure it shows up */
                    await pline("You find a hidden passage.");
                } else {
                    /* Be careful not to find anything in an SCORR or SDOOR */
                    if ((mtmp = m_at(x, y)) && !aflag) {
                        const mfres = await mfind0(mtmp, false);

                        if (mfres === -1)
                            continue;
                        else if (mfres > 0)
                            return mfres;
                    }

                    /* see if an invisible monster has moved--if Blind,
                     * feel_location() already did it
                     * (!aflag && !mtmp && !Blind): unmap_invisible() --
                     * the JS map has no remembered 'I' glyphs yet */

                    if ((trap = t_at(x, y)) && !trap.tseen && !rnl(8)) {
                        nomul0();
                        if (trap.ttyp === STATUE_TRAP) {
                            /* activate_statue_trap(): statue traps aren't
                               created by the JS port yet */
                            throw new Error('dosearch0(): activate_statue_trap() not ported yet');
                        } else {
                            /* find_trap(): the "You find <trap>." message
                               isn't ported yet */
                            trap.tseen = 1;
                            newsym(x, y);
                        }
                    }
                }
            }
    }
    return 1;
}

// C ref: detect.c dosearch() -- the 's' command
export async function dosearch() {
    if (await cmd_safety_prevention("Searching", "another search",
                                    "You already found a monster.",
                                    "already_found_flag"))
        return 0; /* ECMD_OK */
    return (await dosearch0(0)) ? 1 /* ECMD_TIME */ : 0 /* ECMD_OK */;
}

// C ref: detect.c warnreveal()
export async function warnreveal() {
    const u = game.u;
    let x, y, mtmp;

    for (x = u.ux - 1; x <= u.ux + 1; x++)
        for (y = u.uy - 1; y <= u.uy + 1; y++) {
            if (!isok(x, y) || (x === u.ux && y === u.uy)) /* u_at(x, y) */
                continue;
            if ((mtmp = m_at(x, y)) != null
                && warning_of(mtmp) && mtmp.mundetected)
                await mfind0(mtmp, true); /* via_warning */
        }
}

// C ref: detect.c unconstrain_map()
/* bring hero out from underwater or underground or being engulfed;
   return True iff any change occurred */
function unconstrain_map() {
    const u = game.u, iflags = game.iflags;
    const res = !!(u.uinwater || u.uburied || u.uswallow);

    /* bring Underwater, buried, or swallowed hero to normal map;
       bypass set_uinwater() */
    iflags.save_uinwater = u.uinwater, u.uinwater = 0;
    iflags.save_uburied = u.uburied, u.uburied = 0;
    iflags.save_uswallow = u.uswallow, u.uswallow = 0;

    return res;
}

// C ref: detect.c reconstrain_map()
/* put hero back underwater or underground or engulfed */
function reconstrain_map() {
    const u = game.u, iflags = game.iflags;
    /* if was in water and taken out, put back; bypass set_uinwater() */
    u.uinwater = iflags.save_uinwater || 0, iflags.save_uinwater = 0;
    u.uburied = iflags.save_uburied || 0, iflags.save_uburied = 0;
    u.uswallow = iflags.save_uswallow || 0, iflags.save_uswallow = 0;
}

// C ref: detect.c map_redisplay()
async function map_redisplay() {
    reconstrain_map();
    await docrt(); /* redraw the screen to remove unseen traps from the map */
    if (game.u.uinwater && !Is_waterlevel(game.u.uz)) /* Underwater */
        throw new Error('map_redisplay(): under_water() not ported yet');
    if (game.u.uburied)
        throw new Error('map_redisplay(): under_ground() not ported yet');
}

// C ref: detect.c browse_map()
async function browse_map(ter_typ, ter_explain) {
    /* don't care whether player actually picks a spot */
    const dummy_pos = { x: game.u.ux, y: game.u.uy }; /* starting spot for getpos() */
    const save_autodescribe = game.iflags.autodescribe;
    game.iflags.autodescribe = true;
    game.iflags.terrainmode = ter_typ;
    await getpos(dummy_pos, false, ter_explain);
    game.iflags.terrainmode = 0;
    game.iflags.autodescribe = save_autodescribe;
}

/* C ref: display.h glyph_is_*() for the glyph_at()/lev->glyph forms */
function g_kind(glyph) { return glyph.kind ?? glyph_kind(glyph); }

// C ref: detect.c reveal_terrain_getglyph()
function reveal_terrain_getglyph(x, y, swallowed, default_glyph, which_subset) {
    const g = game;
    const lev = g.level.at(x, y);
    let t;
    let glyph, levl_glyph;
    const keep_traps = (which_subset & TER_TRP) !== 0,
        keep_objs = (which_subset & TER_OBJ) !== 0,
        keep_mons = (which_subset & TER_MON) !== 0,
        full = (which_subset & TER_FULL) !== 0;

    /* for 'full', show the actual terrain for the entire level,
       otherwise what the hero remembers for seen locations with
       monsters, objects, and/or traps removed as caller dictates */
    const seenv = (full || g.level.flags.hero_memory)
                  ? lev.seenv : cansee(x, y) ? SVALL : 0;
    if (full) {
        const save = lev.seenv;
        lev.seenv = SVALL;
        glyph = back_to_glyph(x, y);
        lev.seenv = save;
    } else {
        const reg = visible_region_at(x, y);
        let was_mon = false;

        levl_glyph = g.level.flags.hero_memory
                     ? (lev.remembered_glyph || GLYPH_UNEXPLORED)
                     : seenv ? back_to_glyph(x, y)
                       : default_glyph;
        /* glyph_at() returns the displayed glyph, which might
           be a monster.  levl[][].glyph contains the remembered
           glyph, which will never be a monster (unless it is
           the invisible monster glyph, which is handled like
           an object, replacing any object or trap at its spot) */
        glyph = !swallowed ? glyph_at(x, y) : levl_glyph;
        if (keep_mons && x === g.u.ux && y === g.u.uy && swallowed) {
            throw new Error('reveal_terrain_getglyph(): engulfer glyph not ported yet');
        } else if ((!keep_mons && (g_kind(glyph) === 'mon'
                                   || g_kind(glyph) === 'warning'))
                   || g_kind(glyph) === 'swallow') {
            glyph = levl_glyph;
            was_mon = true;
        }
        if (((!keep_objs && g_kind(glyph) === 'obj')
             || g_kind(glyph) === 'invisible')
            && keep_traps && !covers_objects(x, y) /* covers_traps() */) {
            if ((t = t_at(x, y)) && t.tseen)
                glyph = trap_to_glyph(t);
        }
        if ((!keep_objs && g_kind(glyph) === 'obj')
            /* we either show both traps and visible regions (trap if both
               are present at the same spot) or neither traps nor regions */
            || (!keep_traps && (g_kind(glyph) === 'trap'
                                || (reg && g_kind(glyph) === 'gascloud')))
            || (reg && was_mon)
            || g_kind(glyph) === 'invisible') {
            if (!seenv) {
                /* it's possible to have a visible region shown at an
                   otherwise unexplored location */
                glyph = !reg ? default_glyph : GLYPH_UNEXPLORED;
            } else if (keep_traps && reg
                       && (g_kind(glyph) === 'gascloud' || was_mon)) {
                throw new Error('reveal_terrain_getglyph(): region glyphs not ported yet');
            } else if ((g.level.lastseentyp?.[x]?.[y] ?? 0) === lev.typ) {
                glyph = back_to_glyph(x, y);
            } else {
                /* look for a mimic here posing as furniture;
                   if we don't find one, we'll have to fake it */
                const mtmp = m_at(x, y);
                if (mtmp && mtmp.m_ap_type === M_AP_FURNITURE) {
                    glyph = cmap_to_glyph(mtmp.mappearance);
                } else {
                    /*
                     * We have a topology type but we want a screen symbol
                     * in order to derive a glyph.  Some screen symbols need
                     * the flags field of levl[][] in addition to the type.
                     * An exception is wall_info which can be recalculated and
                     * needs to be.
                     */
                    const save_spot = { ...lev };
                    delete save_spot.doormask;
                    delete save_spot.drawbridgemask;
                    lev.typ = g.level.lastseentyp?.[x]?.[y] ?? 0;
                    if (IS_WALL(lev.typ) || lev.typ === SDOOR)
                        xy_set_wall_state(x, y); /* levl[x][y].wall_info */
                    glyph = back_to_glyph(x, y);
                    Object.assign(lev, save_spot);
                }
            }
        }
    }
    /* FIXME: dirty hack */
    if (glyph.cmap === 'S_darkroom')
        glyph = { ...glyph, cmap: 'S_room' };
    else if (glyph.cmap === 'S_litcorr')
        glyph = back_to_glyph_cmap_corr();
    return glyph;
}

/* cmap_to_glyph(S_corr) in the remembered-glyph form */
function back_to_glyph_cmap_corr() {
    return { ch: '#', color: CLR_GRAY, decgfx: false, cmap: 'S_corr' };
}

/* GLYPH_UNEXPLORED, shown as blank */
const GLYPH_UNEXPLORED = { ch: ' ', color: NO_COLOR, decgfx: false, cmap: 'unexplored' };

// C ref: detect.c reveal_terrain()
/* idea from crawl; show known portion of map without any monsters,
   objects, or traps occluding the view of the underlying terrain;
   in explore or wizard modes, can also display unexplored portion */
export async function reveal_terrain(which_subset) {
    const u = game.u;
    /* 'full' overrides impairment and implies no-traps, no-objs, no-mons */
    const full = (which_subset & TER_FULL) !== 0; /* show whole map */
    const uprop = (p) => !!(u.uprops?.[p]?.intrinsic || u.uprops?.[p]?.extrinsic);

    if ((uprop(HALLUC) || uprop(STUNNED) || uprop(CONFUSION)) && !full) {
        await pline("You are too disoriented for this."); /* You() */
    } else {
        let glyph;
        /* there is a TER_MAP bit too; we always show map regardless of it */
        const keep_traps = (which_subset & TER_TRP) !== 0,
            keep_objs = (which_subset & TER_OBJ) !== 0,
            keep_mons = (which_subset & TER_MON) !== 0; /* not used */
        const swallowed = u.uswallow; /* before unconstrain_map() */
        /* default_sym = arboreal ? S_tree : S_stone */
        if (game.level.flags.arboreal)
            throw new Error('reveal_terrain(): arboreal default glyph not ported yet');
        const default_glyph = { ch: ' ', color: NO_COLOR, decgfx: false, cmap: 'S_stone' };

        if (unconstrain_map())
            await docrt();

        for (let x = 1; x < COLNO; x++)
            for (let y = 0; y < ROWNO; y++) {
                glyph = reveal_terrain_getglyph(x, y, swallowed,
                                                default_glyph, which_subset);
                show_glyph(x, y, glyph);
            }

        /* hero's location is not highlighted, but getpos() starts with
           cursor there, and after moving it anywhere '@' moves it back */
        await flush_screen(1);
        let buf;
        if (full) {
            buf = "underlying terrain";
        } else {
            buf = "known terrain";
            if (keep_traps)
                buf += `${(keep_objs || keep_mons) ? "," : " and"} traps`;
            if (keep_objs)
                buf += `${(keep_traps || keep_mons) ? "," : ""}${keep_mons ? "" : " and"} objects`;
            if (keep_mons)
                buf += `${(keep_traps || keep_objs) ? "," : ""} and monsters`;
        }
        await pline(`Showing ${buf} only...`);

        /* allow player to move cursor around and get autodescribe feedback
           based on what is visible now rather than what is on 'real' map */
        which_subset |= TER_MAP; /* guarantee non-zero */
        await browse_map(which_subset, "anything of interest");

        await map_redisplay();
    }
}

// C ref: detect.c skip_premap_detect()
function skip_premap_detect(x, y) {
    const lev = game.level.at(x, y);

    if ((lev.typ === STONE)
        && ((lev.wall_info || 0) & (W_NONDIGGABLE | W_NONPASSWALL)) !== 0)
        return true;
    return false;
}

// C ref: detect.c premap_detect()
/* Pre-map (the sokoban) levels */
export function premap_detect() {
    let obj;

    /* Map the background and boulders */
    for (let x = 1; x < COLNO; x++)
        for (let y = 0; y < ROWNO; y++) {
            if (skip_premap_detect(x, y))
                continue;
            const lev = game.level.at(x, y);
            lev.seenv = SVALL;
            lev.waslit = true;
            if (lev.typ === SDOOR) {
                /* see rm.h for explanation: wall_info and doormask are
                   the same field (flags) in C */
                lev.wall_info = 0;
                lev.flags = 0;
            }
            map_background(x, y, 1);
            if ((obj = sobj_at(BOULDER, x, y)) !== null)
                map_object(obj, 1);
        }

    /* Map the traps */
    for (const ttmp of (game.level.traps || [])) {
        ttmp.tseen = 1;
        map_trap(ttmp, 1);
    }
}

/* C ref: obj.h Has_contents(), SchroedingersBox() */
function Has_contents(o) { return !!o.cobj; }
function SchroedingersBox(o) { return o.otyp === LARGE_BOX_DT && o.spe === 1; }

// C ref: detect.c o_in()
/* Recursively search obj for an object in class oclass and return 1st found */
export function o_in(obj, oclass) {
    let otmp, temp;

    if (obj.oclass === oclass)
        return obj;
    /*
     * Note:  we exclude SchroedingersBox because the corpse it contains
     * isn't necessarily a corpse yet.  Resolving the status would lead
     * to complications if it turns out to be a live cat.  We know that
     * that Box can't contain anything else because putting something in
     * would resolve the cat/corpse situation and convert to ordinary box.
     */
    if (Has_contents(obj) && !SchroedingersBox(obj)) {
        for (otmp = obj.cobj; otmp; otmp = otmp.nobj)
            if (otmp.oclass === oclass)
                return otmp;
            else if (Has_contents(otmp) && (temp = o_in(otmp, oclass)) != null)
                return temp;
    }
    return null;
}

/* C ref: display.h glyph_is_object(), glyph_to_obj() for the JS glyph
   form: obj_to_glyph() keeps the objects[] index in 'otyp' */
function glyph_is_object_dt(glyph) { return !!glyph && g_kind(glyph) === 'obj'; }

/* C ref: level.objects[x][y] -- the floor objects at a spot */
function objects_at_dt(x, y) {
    return (game.level.objects || []).filter(o => o.ox === x && o.oy === y
                                               && o.where === 'OBJ_FLOOR');
}

// C ref: detect.c check_map_spot() -- the material (gold) case isn't
// ported yet
/* Check whether the location has an outdated object displayed on it. */
function check_map_spot(x, y, oclass, material) {
    let mtmp;

    const glyph = glyph_at(x, y);
    if (glyph_is_object_dt(glyph)) {
        /* there's some object shown here */
        if (oclass === ALL_CLASSES_DT) {
            return !(objects_at_dt(x, y).length /* stale if nothing here */
                     || ((mtmp = m_at(x, y)) != null && mtmp.minvent));
        } else {
            if (material)
                throw new Error('check_map_spot(): o_material() not ported yet');
            if (oclass && objects_dt[glyph.otyp].oc_class === oclass) {
                /* obj shown here is of interest because its class matches */
                for (const otmp of objects_at_dt(x, y))
                    if (o_in(otmp, oclass))
                        return false;
                /* didn't find it; perhaps a monster is carrying it */
                if ((mtmp = m_at(x, y)) != null) {
                    for (let otmp = mtmp.minvent; otmp; otmp = otmp.nobj)
                        if (o_in(otmp, oclass))
                            return false;
                }
                /* detection indicates removal of this object from the map */
                return true;
            }
        }
    }
    return false;
}

// C ref: detect.c clear_stale_map()
/*
 * When doing detection, remove stale data from the map display (corpses
 * rotted away, objects carried away by monsters, etc) so that it won't
 * reappear after the detection has completed.  Return true if noticeable
 * change occurs.
 */
function clear_stale_map(oclass, material) {
    let zx, zy;
    let change_made = false;

    for (zx = 1; zx < COLNO; zx++)
        for (zy = 0; zy < ROWNO; zy++)
            if (check_map_spot(zx, zy, oclass, material)) {
                unmap_object(zx, zy);
                change_made = true;
            }

    return change_made;
}

// C ref: detect.c gold_detect() -- not ported yet
export async function gold_detect(sobj) {
    void sobj;
    throw new Error('gold_detect() not ported yet');
}

// C ref: detect.c food_detect()
/* returns 1 if nothing was detected, 0 if something was detected */
export async function food_detect(sobj) {
    const g = game, u = g.u;
    let ct = 0, ctu = 0;
    const confused = !!(Confusion_dt() || (sobj && sobj.cursed));
    const oclass = confused ? POTION_CLASS_DT : FOOD_CLASS_DT;
    const what = confused ? "something" : "food";

    const stale = clear_stale_map(oclass, 0);
    if (u.usteed) /* some situations leave steed with stale coordinates */
        u.usteed.mx = u.ux, u.usteed.my = u.uy;

    for (const obj of g.level.objects || [])
        if (obj.where === 'OBJ_FLOOR' && o_in(obj, oclass)) {
            if (obj.ox === u.ux && obj.oy === u.uy)
                ctu++;
            else
                ct++;
        }
    for (let mtmp = g.fmon; mtmp && (!ct || !ctu); mtmp = mtmp.nmon) {
        if (mtmp.mhp < 1 || (mtmp.isgd && !mtmp.mx))
            continue;
        for (let obj = mtmp.minvent; obj; obj = obj.nobj)
            if (o_in(obj, oclass)) {
                if (mtmp.mx === u.ux && mtmp.my === u.uy)
                    ctu++; /* steed or an engulfer with inventory */
                else
                    ct++;
                break;
            }
    }

    if (!ct && !ctu) {
        g.known = stale && !confused;
        if (stale) {
            await docrt();
            await pline(`You sense a lack of ${what} nearby.`);
            if (sobj && sobj.blessed) {
                if (!u.uedibility)
                    await pline(`Your ${body_part_dt(NOSE_DT)} starts to tingle.`);
                u.uedibility = 1;
            }
        } else if (sobj) {
            const buf = `Your ${body_part_dt(NOSE_DT)} twitches${
                (sobj.blessed && !u.uedibility) ? " then starts to tingle" : ""}.`;
            if (sobj.blessed && !u.uedibility) {
                const savebeginner = g.flags.beginner;

                g.flags.beginner = false; /* prevent non-delivery of message */
                await strange_feeling_dt(sobj, buf);
                g.flags.beginner = savebeginner;
                u.uedibility = 1;
            } else
                await strange_feeling_dt(sobj, buf);
        }
        return !stale ? 1 : 0;
    } else if (!ct) {
        g.known = true;
        await pline(`You ${sobj ? "smell" : "sense"} ${what} nearby.`);
        if (sobj && sobj.blessed) {
            if (!u.uedibility)
                await pline(`Your ${body_part_dt(NOSE_DT)} starts to tingle.`);
            u.uedibility = 1;
        }
    } else {
        let temp;
        let ter_typ = TER_DETECT_DT | TER_OBJ;

        g.known = true;
        await cls_dt();
        unconstrain_map();
        for (const obj of g.level.objects || [])
            if (obj.where === 'OBJ_FLOOR' && (temp = o_in(obj, oclass)) != null) {
                if (temp !== obj) {
                    temp.ox = obj.ox;
                    temp.oy = obj.oy;
                }
                map_object(temp, 1);
            }
        for (let mtmp = g.fmon; mtmp; mtmp = mtmp.nmon) {
            if (mtmp.mhp < 1 || (mtmp.isgd && !mtmp.mx))
                continue;
            for (let obj = mtmp.minvent; obj; obj = obj.nobj)
                if ((temp = o_in(obj, oclass)) != null) {
                    temp.ox = mtmp.mx;
                    temp.oy = mtmp.my;
                    map_object(temp, 1);
                    break; /* skip rest of this monster's inventory */
                }
        }
        if (!ctu) {
            newsym(u.ux, u.uy);
            ter_typ |= TER_MON; /* for autodescribe of self */
        }
        if (sobj) {
            if (sobj.blessed) {
                await pline(`Your ${body_part_dt(NOSE_DT)} ${
                    u.uedibility ? "continues" : "starts"} to tingle and you smell ${what}.`);
                u.uedibility = 1;
            } else
                await pline(`Your ${body_part_dt(NOSE_DT)} tingles and you smell ${what}.`);
        } else
            await pline(`You sense ${what}.`);
        exercise(A_WIS_DT, true);

        await browse_map(ter_typ, "food");

        await map_redisplay();
    }
    return 0;
}

// C ref: detect.c map_monst()
/* show a monster on the map (for detection) */
function map_monst(mtmp, showtail) {
    const g = game;
    if (def_monsyms_dt[mtmp.data.mlet] === ' ')
        throw new Error('map_monst(): detected_mon_to_glyph() not ported yet');
    /* mtmp->mtame ? pet_to_glyph(mtmp, newsym_rn2)
                   : mon_to_glyph(mtmp, newsym_rn2) */
    const ptr = Hallucination_dt() ? mons_dt[rn2_on_display_rng_dt(NUMMONS_DT)]
                                   : mtmp.data;
    const attr = (mtmp.mtame && !Hallucination_dt() && g.iflags?.wc_hilite_pet)
                 ? g.iflags.wc2_petattr : 0;
    show_glyph_cell_dt(mtmp.mx, mtmp.my, def_monsyms_dt[ptr.mlet] ?? '?',
                       ptr.mcolor ?? NO_COLOR, false, attr, 'mon', false,
                       { mndx: ptr.pmidx });

    if (showtail && mtmp.data === mons_dt[PM_LONG_WORM_DT] && mtmp.wormno)
        throw new Error('map_monst(): detect_wsegs() not ported yet');
}

// C ref: detect.c monster_detect()
/*
 * Used by: crystal balls, potions, fountains
 *
 * Returns 1 if nothing was detected.
 * Returns 0 if something was detected.
 */
export async function monster_detect(otmp, /* detecting object (if any) */
                                     mclass) { /* monster class, 0 for all */
    const g = game, u = g.u;
    let mtmp;
    let mcnt = 0;

    /* Note: This used to just check fmon for a non-zero value
     * but in versions since 3.3.0 fmon can test TRUE due to the
     * presence of dmons, so we have to find at least one
     * with positive hit-points to know for sure.
     */
    for (mtmp = g.fmon; mtmp; mtmp = mtmp.nmon) {
        if (mtmp.mhp < 1 || (mtmp.isgd && !mtmp.mx))
            continue;
        ++mcnt;
        break; /* no need for full count, just 1 or more vs 0 */
    }

    if (!mcnt) {
        if (otmp)
            await strange_feeling_dt(otmp, Hallucination_dt()
                                           ? "You get the heebie jeebies."
                                           : "You feel threatened.");
        return 1;
    } else {
        let woken = false;
        const swallowed = u.uswallow; /* before unconstrain_map() */

        await cls_dt();
        const unconstrained = unconstrain_map();
        for (mtmp = g.fmon; mtmp; mtmp = mtmp.nmon) {
            if (mtmp.mhp < 1 || (mtmp.isgd && !mtmp.mx))
                continue;
            if (!mclass || mtmp.data.mlet === mclass
                || (mtmp.data === mons_dt[PM_LONG_WORM_DT]
                    && mclass === S_WORM_TAIL_DT))
                map_monst(mtmp, true);

            if (otmp && otmp.cursed
                && (mtmp.msleeping || !mtmp.mcanmove)) { /* helpless() */
                mtmp.msleeping = mtmp.mfrozen = 0;
                mtmp.mcanmove = 1;
                woken = true;
            }
        }
        if (!swallowed) /* display_self() */
            show_glyph_cell_dt(u.ux, u.uy, '@', CLR_WHITE_DT, false, 0, 'mon');
        await pline("You sense the presence of monsters.");
        if (woken)
            await pline("Monsters sense the presence of you.");

        if ((otmp && otmp.blessed) && !unconstrained) {
            /* persistent detection--just show updated map */
            throw new Error('monster_detect(): display_nhwindow(WIN_MAP, TRUE) not ported yet');
        } else {
            /* one-shot detection--allow player to move cursor around and
               get autodescribe feedback */
            const p = u.uprops[DETECT_MONSTERS_DT];
            p.extrinsic |= I_SPECIAL_DT;
            await browse_map(TER_DETECT_DT | TER_MON, "monster of interest");
            p.extrinsic &= ~I_SPECIAL_DT;
        }

        await map_redisplay();
    }
    return 0;
}

import { show_glyph_cell as show_glyph_cell_dt,
         Hallucination as Hallucination_dt } from './display.js';
import { rn2_on_display_rng as rn2_on_display_rng_dt } from './rng.js';
import { mons as mons_dt, NUMMONS as NUMMONS_DT, PM_LONG_WORM as PM_LONG_WORM_DT,
         S_WORM_TAIL as S_WORM_TAIL_DT } from './monsters.js';
import { def_monsyms as def_monsyms_dt } from './drawing.js';
import { CLR_WHITE as CLR_WHITE_DT } from './terminal.js';
import { DETECT_MONSTERS as DETECT_MONSTERS_DT,
         I_SPECIAL as I_SPECIAL_DT } from './const.js';

// C ref: detect.c trap_detect() -- not ported yet
export async function trap_detect(sobj) {
    void sobj;
    throw new Error('trap_detect() not ported yet');
}

// C ref: detect.c do_mapping() -- magic_map_background() isn't ported yet
export async function do_mapping() {
    throw new Error('do_mapping(): show_map_spot()/magic_map_background() not ported yet');
}

import { unmap_object, cls as cls_dt } from './display.js';
import { objects as objects_dt, POTION_CLASS as POTION_CLASS_DT,
         FOOD_CLASS as FOOD_CLASS_DT, LARGE_BOX as LARGE_BOX_DT } from './objects.js';
const ALL_CLASSES_DT = 0; /* C ref: objclass.h ALL_CLASSES */
import { CONFUSION as CONFUSION_DT,
         NOSE as NOSE_DT, A_WIS as A_WIS_DT, TER_DETECT as TER_DETECT_DT } from './const.js';
import { body_part as body_part_dt } from './insight.js';
import { strange_feeling as strange_feeling_dt } from './potion.js';
function Confusion_dt() {
    const p = game.u.uprops[CONFUSION_DT];
    return !!(p.intrinsic || p.extrinsic);
}
