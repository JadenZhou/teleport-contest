// mines_lua.js — hand port of the Gnomish Mines level scripts sessions
// reach: dat/minefill.lua (the filler levels), the Minetown variants
// (dat/minetn-*.lua) and the Mines' End variants (dat/minend-*.lua).
// makemaz() loads them through load_special() (sp_lev.c).
// C ref: dat/minefill.lua, dat/minetn-*.lua, dat/minend-*.lua
//
// Lua-side rolls (math.random, percent, shuffle, d) go through
// withRngCaller() with the tag the C recorder writes.

import { withRngCaller } from './rng.js';

// math.random called from a script's main chunk: the recorder tags the
// roll with nhlib's math.random line (8 for one argument, 10 for two) and
// the chunk, which Lua cannot name ("lua"), at the calling line.
function chunk_random(G, file, line, ...args) {
    return withRngCaller(
        `random src=nhlib.lua:${args.length === 1 ? 8 : 10} parent=lua(${file}:${line})`,
        () => G.math.random(...args));
}

// C ref: dat/minefill.lua
//	The "fill" level for the mines.
//
//	This level is used to fill out any levels not occupied by
//	specific levels.
function minefill_lua(L) {
    const G = L.globals, des = G.des;
    const F = 'minefill.lua';

    des.level_init({ style: 'solidfill', fg: ' ' });

    des.level_flags('mazelevel', 'noflip');

    des.level_init({ style: 'mines', fg: '.', bg: ' ', smoothed: true, joined: true, walled: true });

    //
    des.stair('up');
    des.stair('down');
    //
    // for i = 1,math.random(2, 5) do
    for (let i = 1, n = chunk_random(G, F, 23, 2, 5); i <= n; i++) {
        des.object('*');
    }
    des.object('(');
    for (let i = 1, n = chunk_random(G, F, 27, 2, 4); i <= n; i++) {
        des.object();
    }
    if (G.percent(75)) {
        for (let i = 1, n = chunk_random(G, F, 31, 1, 2); i <= n; i++) {
            des.object('boulder');
        }
    }
    //
    for (let i = 1, n = chunk_random(G, F, 36, 6, 8); i <= n; i++) {
        des.monster('gnome');
    }
    des.monster('gnome lord');
    des.monster('dwarf');
    des.monster('dwarf');
    des.monster('G');
    des.monster('G');
    des.monster(G.percent(50) ? 'h' : 'G');
    //
    des.trap();
    des.trap();
    des.trap();
    des.trap();
    des.trap();
    des.trap();
}

// The hand-ported Mines level scripts by file name, for nhl_loadlua().
export const mines_lua_files = {
    'minefill.lua': minefill_lua,
};
