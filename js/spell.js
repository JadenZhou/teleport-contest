// spell.js — spellcasting.
// C ref: spell.c
//
// Ported so far: age_spells().

import { game } from './gstate.js';
import { NO_SPELL } from './const.js';
import { MAXSPELL } from './objects.js';

/* C ref: spell.h spellid(), spellknow(), decrnknow() */
function spellid(spell) { return game.spl_book[spell].sp_id; }
function spellknow(spell) { return game.spl_book[spell].sp_know; }
function decrnknow(spell) { game.spl_book[spell].sp_know--; }

// C ref: spell.c age_spells()
export function age_spells() {
    let i;
    /*
     * The time relative to the hero (a pass through move
     * loop) causes all spell knowledge to be decremented.
     * The hero's speed, rest status, conscious status etc.
     * does not alter the loss of memory.
     */
    for (i = 0; i < MAXSPELL && spellid(i) !== NO_SPELL; i++)
        if (spellknow(i))
            decrnknow(i);
    return;
}
