// mines_lua.js — hand port of the Gnomish Mines level scripts sessions
// reach: dat/minefill.lua (the filler levels), the Minetown variants
// (dat/minetn-*.lua) and the Mines' End variants (dat/minend-*.lua).
// makemaz() loads them through load_special() (sp_lev.c).
// C ref: dat/minefill.lua, dat/minetn-*.lua, dat/minend-*.lua
//
// Lua-side rolls (math.random, percent, shuffle, d) go through
// withRngCaller() with the tag the C recorder writes.

import { withRngCaller } from './rng.js';
import { lua_band } from './nhlua.js';

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

// C ref: dat/minetn-1.lua
// -- A tragic accident has occurred in Frontier Town....
//
// -- Minetown variant 1
// -- Orcish Town - a variant of Frontier Town that has been
// -- overrun by orcs.  Note the barricades (iron bars).
function minetn_1_lua(L) {
    const G = L.globals, des = G.des, selection = G.selection;
    const F = 'minetn-1.lua';

    des.level_flags('mazelevel');

    des.level_init({ style: 'mines', fg: '.', bg: ' ', smoothed: true, joined: true, walled: true });

    des.map([
        '.....................................',
        '.----------------F------------------.',
        '.|.................................|.',
        '.|.-------------......------------.|.',
        '.|.|...|...|...|......|..|...|...|.|.',
        '.F.|...|...|...|......|..|...|...|.|.',
        '.|.|...|...|...|......|..|...|...|.F.',
        '.|.|...|...|----......------------.|.',
        '.|.---------.......................|.',
        '.|.................................|.',
        '.|.---------.....--...--...........|.',
        '.|.|...|...|----.|.....|.---------.|.',
        '.|.|...|...|...|.|.....|.|..|....|.|.',
        '.|.|...|...|...|.|.....|.|..|....|.|.',
        '.|.|...|...|...|.|.....|.|..|....|.|.',
        '.|.-------------.-------.---------.|.',
        '.|.................................F.',
        '.-----------F------------F----------.',
        '.....................................',
    ].join('\n') + '\n');

    // -- Don't let the player fall into his likely death; used to explicitly exclude
    // -- the town, but that meant that you couldn't teleport out as well as not in.
    des.teleport_region({ region: [1, 1, 75, 19], exclude: [1, 0, 35, 21], region_islev: 1 });
    des.region(selection.area(1, 1, 35, 17), 'lit');
    des.levregion({ type: 'stair-up', region: [1, 3, 21, 19], region_islev: 1,
                    exclude: [0, 1, 36, 17] });
    des.levregion({ type: 'stair-down', region: [57, 3, 75, 19], region_islev: 1,
                    exclude: [0, 1, 36, 17] });

    // -- shame we can't make polluted fountains
    des.feature('fountain', 16, 9);
    des.feature('fountain', 25, 9);

    // -- the altar's defiled; useful for BUC but never coaligned
    des.altar({ x: 20, y: 13, align: 'noalign', type: 'shrine' });

    // -- set up the shop doors; could be broken down
    des.door('random', 5, 8);
    des.door('random', 9, 8);
    des.door('random', 13, 7);
    des.door('random', 22, 5);
    des.door('random', 27, 7);
    des.door('random', 31, 7);
    des.door('random', 5, 10);
    des.door('random', 9, 10);
    des.door('random', 15, 13);
    des.door('random', 25, 13);
    des.door('random', 31, 11);

    // -- knock a few holes in the shop interior walls
    des.replace_terrain({ region: [7, 4, 11, 6], fromterrain: '|', toterrain: '.', chance: 18 });
    des.replace_terrain({ region: [25, 4, 29, 6], fromterrain: '|', toterrain: '.', chance: 18 });
    des.replace_terrain({ region: [7, 12, 11, 14], fromterrain: '|', toterrain: '.', chance: 18 });
    des.replace_terrain({ region: [28, 12, 28, 14], fromterrain: '|', toterrain: '.', chance: 33 });

    // -- One spot each in most shops...   (Lua place[k] is JS place[k - 1])
    const place = [ [5, 4], [9, 5], [13, 4], [26, 4], [31, 5], [30, 14], [5, 14], [10, 13], [26, 14], [27, 13] ];
    G.shuffle(place);

    // -- scatter some bodies
    des.object({ id: 'corpse', x: 20, y: 12, montype: 'aligned cleric' });
    des.object({ id: 'corpse', coord: place[0], montype: 'shopkeeper' });
    des.object({ id: 'corpse', coord: place[1], montype: 'shopkeeper' });
    des.object({ id: 'corpse', coord: place[2], montype: 'shopkeeper' });
    des.object({ id: 'corpse', coord: place[3], montype: 'shopkeeper' });
    des.object({ id: 'corpse', coord: place[4], montype: 'shopkeeper' });
    des.object({ id: 'corpse', montype: 'watchman' });
    des.object({ id: 'corpse', montype: 'watchman' });
    des.object({ id: 'corpse', montype: 'watchman' });
    des.object({ id: 'corpse', montype: 'watchman' });
    des.object({ id: 'corpse', montype: 'watch captain' });

    // -- Rubble!
    for (let i = 1, n = chunk_random(G, F, 91, 10, 19); i <= n; i++) {
        if (G.percent(90)) {
            des.object('boulder');
        }
        des.object('rock');
    }

    // -- Guarantee 7 candles since we won't have Izchak available
    des.object({ id: 'wax candle', coord: place[3], quantity: chunk_random(G, F, 99, 1, 2) });

    des.object({ id: 'wax candle', coord: place[0], quantity: chunk_random(G, F, 101, 2, 4) });
    des.object({ id: 'wax candle', coord: place[1], quantity: chunk_random(G, F, 102, 1, 2) });
    des.object({ id: 'tallow candle', coord: place[2], quantity: chunk_random(G, F, 103, 1, 3) });
    des.object({ id: 'tallow candle', coord: place[1], quantity: chunk_random(G, F, 104, 1, 2) });
    des.object({ id: 'tallow candle', coord: place[3], quantity: chunk_random(G, F, 105, 1, 2) });

    // -- go ahead and leave a lamp next to one corpse to be suggestive
    // -- and some empty wands...
    des.object('oil lamp', place[1]);
    des.object({ id: 'wand of striking', coord: place[0], buc: 'uncursed', spe: 0 });
    des.object({ id: 'wand of striking', coord: place[2], buc: 'uncursed', spe: 0 });
    des.object({ id: 'wand of striking', coord: place[3], buc: 'uncursed', spe: 0 });
    des.object({ id: 'wand of magic missile', coord: place[3], buc: 'uncursed', spe: 0 });
    des.object({ id: 'wand of magic missile', coord: place[4], buc: 'uncursed', spe: 0 });

    // -- the Orcish Army

    const inside = selection.floodfill(18, 8);
    const near_temple = lua_band(selection.area(17, 8, 23, 14), inside);

    for (let i = 1, n = chunk_random(G, F, 121, 5, 15); i <= n; i++) {
        if (G.percent(50)) {
            des.monster({ id: 'orc-captain', coord: inside.rndcoord(1), peaceful: 0 });
        } else {
            if (G.percent(80)) {
                des.monster({ id: 'Uruk-hai', coord: inside.rndcoord(1), peaceful: 0 });
            } else {
                des.monster({ id: 'Mordor orc', coord: inside.rndcoord(1), peaceful: 0 });
            }
        }
    }
    // -- shamans can be hanging out in/near the temple
    // -- one of the shamans is higher level
    for (let i = 1, n = chunk_random(G, F, 134, 1, 6); i <= n; i++) {
        des.monster({ id: 'orc shaman', coord: near_temple.rndcoord(0), peaceful: 0,
                      m_lev_adj: (i === 1) ? 3 : 0 });
    }
    // -- these are not such a big deal
    // -- to run into outside the bars
    for (let i = 1, n = chunk_random(G, F, 140, 10, 19); i <= n; i++) {
        if (G.percent(90)) {
            des.monster({ id: 'hill orc', peaceful: 0 });
        } else {
            des.monster({ id: 'goblin', peaceful: 0 });
        }
    }

    // -- Hack to force full-level wallification

    des.wallify();
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

// C ref: dat/minend-1.lua
// Mine end level variant 1
// "Mimic of the Mines"
function minend_1_lua(L) {
    const G = L.globals, des = G.des, selection = G.selection;

    des.level_init({ style: 'solidfill', fg: ' ' });

    des.level_flags('mazelevel');

    des.map([
        '------------------------------------------------------------------   ------',
        '|                        |.......|     |.......-...|       |.....|.       |',
        '|    ---------        ----.......-------...........|       ---...-S-      |',
        '|    |.......|        |..........................-S-      --.......|      |',
        '|    |......-------   ---........................|.       |.......--      |',
        '|    |..--........-----..........................|.       -.-..----       |',
        '|    --..--.-----........-.....................---        --..--          |',
        '|     --..--..| -----------..................---.----------..--           |',
        '|      |...--.|    |..S...S..............---................--            |',
        '|     ----..-----  ------------........--- ------------...---             |',
        '|     |.........--            ----------              ---...-- -----      |',
        '|    --.....---..--                           --------  --...---...--     |',
        '| ----..-..-- --..---------------------      --......--  ---........|     |',
        '|--....-----   --..-..................---    |........|    |.......--     |',
        '|.......|       --......................S..  --......--    ---..----      |',
        '|--.--.--        ----.................---     ------..------...--         |',
        '| |....S..          |...............-..|         ..S...........|          |',
        '--------            --------------------           ------------------------',
    ].join('\n') + '\n');

    // -- Dungeon Description
    const place = [ [8, 16], [13, 7], [21, 8], [41, 14], [50, 4], [50, 16], [66, 1] ];
    G.shuffle(place);

    // -- make the entry chamber a real room; it affects monster arrival
    des.region({ region: [26, 1, 32, 1], lit: 0, type: 'ordinary', irregular: 1, arrival_room: true });
    des.region(selection.area(20, 8, 21, 8), 'unlit');
    des.region(selection.area(23, 8, 25, 8), 'unlit');
    // -- Secret doors
    des.door('locked', 7, 16);
    des.door('locked', 22, 8);
    des.door('locked', 26, 8);
    des.door('locked', 40, 14);
    des.door('locked', 50, 3);
    des.door('locked', 51, 16);
    des.door('locked', 66, 2);
    // -- Stairs
    des.stair('up', 36, 4);
    // -- Non diggable walls
    des.non_diggable(selection.area(0, 0, 74, 17));
    // -- Niches
    // -- Note: place[6] empty   (Lua place[k] is JS place[k - 1])
    des.object('diamond', place[6]);
    des.object('emerald', place[6]);
    des.object('worthless piece of violet glass', place[6]);
    des.monster({ class: 'm', coord: place[6], appear_as: 'obj:luckstone' });
    des.object('worthless piece of white glass', place[0]);
    des.object('emerald', place[0]);
    des.object('amethyst', place[0]);
    des.monster({ class: 'm', coord: place[0], appear_as: 'obj:loadstone' });
    des.object('diamond', place[1]);
    des.object('worthless piece of green glass', place[1]);
    des.object('amethyst', place[1]);
    des.monster({ class: 'm', coord: place[1], appear_as: 'obj:flint' });
    des.object('worthless piece of white glass', place[2]);
    des.object('emerald', place[2]);
    des.object('worthless piece of violet glass', place[2]);
    des.monster({ class: 'm', coord: place[2], appear_as: 'obj:touchstone' });
    des.object('worthless piece of red glass', place[3]);
    des.object('ruby', place[3]);
    des.object('loadstone', place[3]);
    des.object('ruby', place[4]);
    des.object('worthless piece of red glass', place[4]);
    des.object({ id: 'luckstone', coord: place[4], buc: 'not-cursed', achievement: 1 });
    // -- Random objects
    des.object('*');
    des.object('*');
    des.object('*');
    des.object('*');
    des.object('*');
    des.object('*');
    des.object('*');
    des.object('(');
    des.object('(');
    des.object();
    des.object();
    des.object();
    // -- Random traps
    des.trap();
    des.trap();
    des.trap();
    des.trap();
    des.trap();
    des.trap();
    // -- Random monsters
    des.monster('gnome king');
    des.monster('gnome lord');
    des.monster('gnome lord');
    des.monster('gnome lord');
    des.monster('gnomish wizard');
    des.monster('gnomish wizard');
    des.monster('gnome');
    des.monster('gnome');
    des.monster('gnome');
    des.monster('gnome');
    des.monster('gnome');
    des.monster('gnome');
    des.monster('gnome');
    des.monster('gnome');
    des.monster('gnome');
    des.monster('hobbit');
    des.monster('hobbit');
    des.monster('dwarf');
    des.monster('dwarf');
    des.monster('dwarf');
    des.monster('h');
}

// The hand-ported Mines level scripts by file name, for nhl_loadlua().
export const mines_lua_files = {
    'minefill.lua': minefill_lua,
    'minetn-1.lua': minetn_1_lua,
    'minetn-6.lua': minetn_6_lua,
    'minend-1.lua': minend_1_lua,
};
