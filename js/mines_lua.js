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

// C ref: dat/minetn-6.lua
// "Bustling Town" by Kelly Bailey
function minetn_6_lua(L) {
    const G = L.globals, des = G.des, selection = G.selection;

    des.level_init({ style: 'solidfill', fg: ' ' });

    des.level_flags('mazelevel', 'inaccessibles');

    des.level_init({ style: 'mines', fg: '.', bg: '-', smoothed: true, joined: true, lit: 1, walled: true });

    // -- Map extends the full height of the playable area in order to prevent any of
    // -- the cavern fill from getting cut off by walls of the town buildings and
    // -- creating inaccessible spaces. The inaccessibles flag does compensate for
    // -- this, but it does so by doing things like creating backdoors into adjacent
    // -- shops which we don't want.
    des.map({ halign: 'center', valign: 'top', map: [
        'x--------xxxxxxxxxxx-------------------x',
        'x------xxxxxxxxxxxxxx-----------------xx',
        '.-----................----------------.x',
        '.|...|................|...|..|...|...|..',
        '.|...+..--+--.........|...|..|...|...|..',
        '.|...|..|...|..-----..|...|..|-+---+--..',
        '.-----..|...|--|...|..--+---+-.........x',
        '........|...|..|...+.............-----.x',
        '........-----..|...|......--+-...|...|..',
        'x----...|...|+------..{...|..|...+...|..',
        'x|..+...|...|.............|..|...|...|..',
        '.|..|...|...|-+-.....---+-------------.x',
        '.----...--+--..|..-+-|..................',
        '...|........|..|..|..|----....--------.x',
        '...|..T.....----..|..|...+....|......|..',
        '...|-....{........|..|...|....+......|x.',
        '...--..-....T.....--------....|......|x.',
        '.......--.....................----------',
        '.xxxx-----xxxxxxxxxxxxxxxxxx------------',
        'xxxx-------xxxxxxxxxxxxxxx--------------',
    ].join('\n') + '\n' });

    des.region(selection.area(0, 0, 39, 19), 'lit');

    // -- stairs can generate 1 column left or right inside the map,
    // -- in case the randomly generated mines layout doesn't extend outside the map
    des.levregion({ type: 'stair-up', region: [1, 3, 21, 19], region_islev: 1, exclude: [1, 0, 39, 18] });
    des.levregion({ type: 'stair-down', region: [60, 3, 75, 19], region_islev: 1, exclude: [0, 0, 38, 18] });

    des.region(selection.area(13, 7, 14, 8), 'unlit');
    des.region({ region: [9, 9, 11, 11], lit: 1, type: 'candle shop', filled: 1 });
    des.region({ region: [16, 6, 18, 8], lit: 1, type: 'tool shop', filled: 1 });
    des.region({ region: [23, 3, 25, 5], lit: 1, type: 'shop', filled: 1 });
    des.region({ region: [22, 14, 24, 15], lit: 1, type: G.monkfoodshop(), filled: 1 });
    des.region({ region: [31, 14, 36, 16], lit: 1, type: 'temple', filled: 1 });
    des.altar({ x: 35, y: 15, align: G.align[0], type: 'shrine' });

    des.door('closed', 5, 4);
    des.door('locked', 4, 10);
    des.door('closed', 10, 4);
    des.door('closed', 10, 12);
    des.door('locked', 13, 9);
    des.door('locked', 14, 11);
    des.door('closed', 19, 7);
    des.door('closed', 19, 12);
    des.door('closed', 24, 6);
    des.door('closed', 24, 11);
    des.door('closed', 25, 14);
    des.door('closed', 28, 6);
    des.door('locked', 28, 8);
    des.door('closed', 30, 15);
    des.door('closed', 31, 5);
    des.door('closed', 35, 5);
    des.door('closed', 33, 9);

    des.monster('gnome');
    des.monster('gnome');
    des.monster('gnome');
    des.monster('gnome');
    des.monster('gnome');
    des.monster('gnome');
    des.monster('gnome', 14, 8);
    des.monster('gnome lord', 14, 7);
    des.monster('gnome', 27, 10);
    des.monster('gnome lord');
    des.monster('gnome lord');
    des.monster('dwarf');
    des.monster('dwarf');
    des.monster('dwarf');
    des.monster({ id: 'dwarf', peaceful: 1 });
    des.monster({ id: 'dwarf', peaceful: 1 });
    des.monster({ id: 'gnome', peaceful: 1 });
    des.monster({ id: 'gnome', peaceful: 1 });
    des.monster({ id: 'hobbit', peaceful: 1 });
    des.monster({ id: 'goblin', peaceful: 1 });
    des.monster({ id: 'kobold', peaceful: 1 });
    des.monster({ id: 'dog', peaceful: 1 });
    des.monster({ id: 'watchman', peaceful: 1 });
    des.monster({ id: 'watchman', peaceful: 1 });
    des.monster({ id: 'watchman', peaceful: 1 });
    des.monster({ id: 'watch captain', peaceful: 1 });
    des.monster({ id: 'watch captain', peaceful: 1 });
}

// The hand-ported Mines level scripts by file name, for nhl_loadlua().
export const mines_lua_files = {
    'minefill.lua': minefill_lua,
    'minetn-6.lua': minetn_6_lua,
};
