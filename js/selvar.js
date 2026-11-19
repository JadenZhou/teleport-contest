// selvar.js — selections: sets of map locations, and the Lua "selection"
// table.
// C ref: selvar.c — l_selection_register.
//
// Not ported yet: the selection functions themselves. l_selection_register()
// registers the selection table so ported Lua can reference it; each
// function raises a Lua error until it is ported.

import { lua_error } from './nhlua.js';

// C ref: selvar.c l_selection_methods[] — the names only.
const l_selection_names = [
    'new', 'clone', 'get', 'set', 'numpoints', 'negate', 'percentage',
    'rndcoord', 'room', 'line', 'randline', 'rect', 'fillrect', 'area',
    'grow', 'filter_mapchar', 'match', 'floodfill', 'circle', 'ellipse',
    'gradient', 'iterate', 'bounds',
];

function selection_not_ported(name) {
    return function selection_not_ported_yet() {
        lua_error(`selection.${name} is not ported yet`);
    };
}

// C ref: selvar.c l_selection_register()
export function l_selection_register(L) {
    const selection = {};
    for (const name of l_selection_names)
        selection[name] = selection_not_ported(name);
    L.globals.selection = selection;
}
