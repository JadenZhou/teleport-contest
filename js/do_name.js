// do_name.js -- monster naming (C ref: do_name.c).
//
// Ported so far: christen_monst(), rndghostname(), noveltitle().

import { game } from './gstate.js';
import { rn2, ROLL_FROM } from './rng.js';

const PL_PSIZ = 63; /* global.h */

// C ref: do_name.c christen_monst()
export function christen_monst(mtmp, name) {
    let lth;

    /* dogname & catname are PL_PSIZ arrays; object names have same limit */
    lth = (name && name.length) ? (name.length + 1) : 0;
    if (lth > PL_PSIZ) {
        lth = PL_PSIZ;
        name = name.slice(0, PL_PSIZ - 1);
    }
    /* new_mgivenname(mtmp, lth): removes old name if one is present */
    mtmp.mgivenname = lth ? name : '';
    /* if 'mtmp' is leashed, persistent inventory window needs updating:
       update_inventory() -- leashes aren't ported yet */
    return mtmp;
}

import { exist_artifact, artifact_exists } from './artifact.js';
import { ONAME_VIA_NAMING, ONAME_SKIP_INVUPD } from './const.js';

// C ref: do_name.c oname()
export function oname(
    obj,   /* item to assign name to */
    name,  /* name to assign */
    oflgs) /* flags, mostly for artifact creation */
{
    let lth;
    const via_naming = (oflgs & ONAME_VIA_NAMING) !== 0,
          skip_inv_update = (oflgs & ONAME_SKIP_INVUPD) !== 0;

    lth = name ? (name.length + 1) : 0;
    if (lth > PL_PSIZ) {
        lth = PL_PSIZ;
        name = name.slice(0, PL_PSIZ - 1);
    }
    /* If named artifact exists in the game, do not create another.
       Also trying to create an artifact shouldn't de-artifact
       it (e.g. Excalibur from prayer). In this case the object
       will retain its current name. */
    if (obj.oartifact || (lth && exist_artifact(obj.otyp, name)))
        return obj;

    /* new_oname(obj, lth): removes old name if one is present */
    if (!obj.oextra)
        obj.oextra = {};
    obj.oextra.oname = lth ? name : '';

    if (lth)
        artifact_exists(obj, name, true, oflgs);
    if (obj.oartifact) {
        /* can't dual-wield with artifact as secondary weapon */
        if (obj === game.uswapwep)
            throw new Error('oname(): untwoweapon() is not ported yet');
        /* activate warning if you've just named your weapon "Sting" */
        if (obj === game.uwep)
            throw new Error('oname(): set_artifact_intrinsic() is not ported yet');
        /* if obj is owned by a shop, increase your bill */
        if (obj.unpaid)
            throw new Error('oname(): alter_cost() is not ported yet');
        if (via_naming) {
            /* violate illiteracy conduct since successfully wrote arti-name */
            const literate = game.u.uconduct.literate || 0;
            game.u.uconduct.literate = literate + 1;
            if (!literate) {
                /* livelog_printf(): no livelog */
            }
        }
    }
    /* if (carried(obj) && !skip_inv_update) update_inventory():
       no persistent inventory window */
    void skip_inv_update;
    return obj;
}

const ghostnames = [
    /* these names should have length < PL_NSIZ */
    /* Capitalize the names for aesthetics -dgk */
    "Adri",    "Andries",       "Andreas",     "Bert",    "David",  "Dirk",
    "Emile",   "Frans",         "Fred",        "Greg",    "Hether", "Jay",
    "John",    "Jon",           "Karnov",      "Kay",     "Kenny",  "Kevin",
    "Maud",    "Michiel",       "Mike",        "Peter",   "Robert", "Ron",
    "Tom",     "Wilmar",        "Nick Danger", "Phoenix", "Jiro",   "Mizue",
    "Stephan", "Lance Braccus", "Shadowhawk",  "Murphy",
];

// C ref: do_name.c rndghostname()
/* ghost names formerly set by x_monnam(), now by makemon() instead */
export function rndghostname() {
    return rn2(7) ? ROLL_FROM(ghostnames)
                  : game.plname;
}

// C ref: do_name.c sir_Terry_novels[]
/* Discworld novel titles, in the order that they were published; a subset
   of them have index macros used for variant spellings; if the titles are
   reordered for some reason, make sure that those get renumbered to match */
const sir_Terry_novels = [
    "The Colour of Magic", "The Light Fantastic", "Equal Rites", "Mort",
    "Sourcery", "Wyrd Sisters", "Pyramids", "Guards! Guards!", "Eric",
    "Moving Pictures", "Reaper Man", "Witches Abroad", "Small Gods",
    "Lords and Ladies", "Men at Arms", "Soul Music", "Interesting Times",
    "Maskerade", "Feet of Clay", "Hogfather", "Jingo", "The Last Continent",
    "Carpe Jugulum", "The Fifth Elephant", "The Truth", "Thief of Time",
    "The Last Hero", "The Amazing Maurice and His Educated Rodents",
    "Night Watch", "The Wee Free Men", "Monstrous Regiment",
    "A Hat Full of Sky", "Going Postal", "Thud!", "Wintersmith",
    "Making Money", "Unseen Academicals", "I Shall Wear Midnight", "Snuff",
    "Raising Steam", "The Shepherd's Crown"
];

// C ref: do_name.c noveltitle()
/* 'novidx' is the C int *novidx: an object { v } (or null); a -1 index is
   set to the title picked */
export function noveltitle(novidx) {
    let j;
    const k = sir_Terry_novels.length;

    j = rn2(k);
    if (novidx) {
        if (novidx.v === -1)
            novidx.v = j;
        else if (novidx.v >= 0 && novidx.v < k)
            j = novidx.v;
    }
    return sir_Terry_novels[j];
}
