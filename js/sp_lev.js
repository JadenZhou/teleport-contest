// sp_lev.js — the special-level coder and the "des" Lua table.
// C ref: sp_lev.c — create_des_coder, sp_level_coder_init, reset_xystart_size,
// update_croom, spo_endroom, build_room, lspo_room, add_doors_to_room,
// maybe_add_door, shared_with_room, get_table_roomtype_opt,
// get_table_xy_or_coord, l_push_mkroom_table, l_register_des.
//
// check_room() and create_room() (also sp_lev.c) live in mklev.js for now,
// next to the room code they share with makerooms().
//
// Ported so far: what themerms.lua's "default" room needs (des.room). The
// other des.* functions are registered by name but raise a Lua error until
// they are ported (their C counterparts are listed in sp_lev_des_names).

import { game } from './gstate.js';
import { rn2 } from './rng.js';
import {
    COLNO, ROWNO, OROOM, THEMEROOM, COURT, SWAMP, VAULT, BEEHIVE, MORGUE,
    BARRACKS, ZOO, DELPHI, TEMPLE, ANTHOLE, COCKNEST, LEPREHALL, SHOPBASE,
    ARMORSHOP, SCROLLSHOP, POTIONSHOP, WEAPONSHOP, FOODSHOP, RINGSHOP,
    WANDSHOP, TOOLSHOP, BOOKSHOP, FODDERSHOP, CANDLESHOP, ROOMOFFSET,
    IS_DOOR, SDOOR, isok, TRUE, FALSE,
} from './const.js';
import {
    get_table_int_opt, get_table_str_opt, get_table_option, nhl_error,
    luaL_checkoption, luaL_checkinteger, lua_type, LUA_TNIL, LUA_TSTRING,
    LUA_TBOOLEAN, LUA_TNUMBER, LUA_TFUNCTION, lua_error,
} from './nhlua.js';
import { create_room, topologize, add_door } from './mklev.js';

// C's impossible() and panic() (pline.c) are not ported yet.
function impossible(msg) { console.error(`impossible: ${msg}`); }
function panic(msg) { throw new Error(`panic: ${msg}`); }

const MAX_NESTED_ROOMS = 5;

// sp_lev.h alignment codes
const SPLEV_LEFT = 1;
const SPLEV_H_LEFT = 2;
const SPLEV_CENTER = 3;
const SPLEV_H_RIGHT = 4;
const SPLEV_RIGHT = 5;
const TOP = 1;
const BOTTOM = 5;

// C ref: sp_lev.c reset_xystart_size()
export function reset_xystart_size() {
    game.xstart = 1; /* column [0] is off limits */
    game.ystart = 0;
    game.xsize = COLNO - 1; /* 1..COLNO-1 */
    game.ysize = ROWNO; /* 0..ROWNO-1 */
}

// C ref: sp_lev.c sp_level_coder_init()
function sp_level_coder_init() {
    const coder = {
        premapped: FALSE,
        solidify: FALSE,
        check_inaccessibles: FALSE,
        allow_flips: 3, /* allow flipping level horiz/vert */
        croom: null,
        n_subroom: 1,
        lvl_is_joined: FALSE,
        room_stack: 0,
        tmproomlist: new Array(MAX_NESTED_ROOMS + 1).fill(null),
        failed_room: new Array(MAX_NESTED_ROOMS + 1).fill(FALSE),
    };
    game.xstart = 1;
    game.ystart = 0;
    game.xsize = COLNO - 1;
    game.ysize = ROWNO;
    return coder;
}

// C ref: sp_lev.c create_des_coder()
export function create_des_coder() {
    if (!game.coder)
        game.coder = sp_level_coder_init();
}

// C ref: sp_lev.c update_croom()
export function update_croom() {
    const coder = game.coder;
    if (!coder)
        return;

    if (coder.n_subroom)
        coder.croom = coder.tmproomlist[coder.n_subroom - 1];
    else
        coder.croom = null;
}

// C ref: sp_lev.c spo_endroom()
function spo_endroom(coder) {
    if (game.coder.n_subroom > 1) {
        game.coder.n_subroom--;
        game.coder.tmproomlist[game.coder.n_subroom] = null;
        game.coder.failed_room[game.coder.n_subroom] = TRUE;
    } else {
        /* no subroom, get out of top-level room */
        /* Need to ensure xstart/ystart/xsize/ysize have something sensible,
           in case there's some stuff to be created outside the outermost
           room, and there's no MAP. */
        if (game.xsize <= 1 && game.ysize <= 1)
            reset_xystart_size();
    }
    update_croom();
}

// C ref: sp_lev.c room_types[]
const room_types = [
    { name: 'ordinary', type: OROOM },
    { name: 'themed', type: THEMEROOM },
    { name: 'throne', type: COURT },
    { name: 'swamp', type: SWAMP },
    { name: 'vault', type: VAULT },
    { name: 'beehive', type: BEEHIVE },
    { name: 'morgue', type: MORGUE },
    { name: 'barracks', type: BARRACKS },
    { name: 'zoo', type: ZOO },
    { name: 'delphi', type: DELPHI },
    { name: 'temple', type: TEMPLE },
    { name: 'anthole', type: ANTHOLE },
    { name: 'cocknest', type: COCKNEST },
    { name: 'leprehall', type: LEPREHALL },
    { name: 'shop', type: SHOPBASE },
    { name: 'armor shop', type: ARMORSHOP },
    { name: 'scroll shop', type: SCROLLSHOP },
    { name: 'potion shop', type: POTIONSHOP },
    { name: 'weapon shop', type: WEAPONSHOP },
    { name: 'food shop', type: FOODSHOP },
    { name: 'ring shop', type: RINGSHOP },
    { name: 'wand shop', type: WANDSHOP },
    { name: 'tool shop', type: TOOLSHOP },
    { name: 'book shop', type: BOOKSHOP },
    { name: 'health food shop', type: FODDERSHOP },
    { name: 'candle shop', type: CANDLESHOP },
];

// C ref: sp_lev.c get_mkroom_name()
function get_mkroom_name(rtype) {
    for (const rt of room_types)
        if (rt.type === rtype)
            return rt.name;

    impossible(`get_mkroom_name unknown rtype ${rtype}`);
    return 'unknown'; /* not NULL */
}

// C ref: sp_lev.c get_table_roomtype_opt()
function get_table_roomtype_opt(tbl, name, defval) {
    const roomstr = get_table_str_opt(tbl, name, '');
    let res = defval;

    if (roomstr) {
        const rt = room_types.find(r => r.name.toLowerCase() === roomstr.toLowerCase());
        if (rt)
            res = rt.type;
        else
            impossible(`Unknown room type '${roomstr}'`);
    }
    return res;
}

// C ref: nhlua.c get_table_boolean()
function get_table_boolean(tbl, name) {
    const boolstr = ['true', 'false', 'yes', 'no'];
    const v = tbl[name];
    const ltyp = lua_type(v);
    let ret = -1;

    if (ltyp === LUA_TSTRING) {
        ret = luaL_checkoption(v, null, boolstr);
    } else if (ltyp === LUA_TBOOLEAN) {
        ret = v ? 1 : 0;
    } else if (ltyp === LUA_TNUMBER) {
        ret = luaL_checkinteger(v);
        if (ret < 0 || ret > 1)
            ret = -1;
    }
    if (ret === -1)
        nhl_error(null, 'Expected a boolean');
    return ret;
}

// C ref: nhlua.c get_table_boolean_opt()
function get_table_boolean_opt(tbl, name, defval) {
    if (lua_type(tbl[name]) !== LUA_TNIL)
        return get_table_boolean(tbl, name);
    return defval;
}

// C ref: sp_lev.c get_coord()
function get_coord(v) {
    if (lua_type(v) === LUA_TNIL || typeof v !== 'object')
        return null;
    if (Array.isArray(v) && v.length === 2)
        return { x: luaL_checkinteger(v[0]), y: luaL_checkinteger(v[1]) };
    if (v.x !== undefined && v.y !== undefined)
        return { x: luaL_checkinteger(v.x), y: luaL_checkinteger(v.y) };
    return null;
}

// C ref: sp_lev.c get_table_xy_or_coord()
function get_table_xy_or_coord(tbl) {
    let mx = get_table_int_opt(tbl, 'x', -1);
    let my = get_table_int_opt(tbl, 'y', -1);

    if (mx === -1 && my === -1) {
        const c = get_coord(tbl.coord);
        if (c) {
            mx = c.x;
            my = c.y;
        }
    }
    return { x: mx, y: my };
}

// C ref: sp_lev.c l_push_mkroom_table()
function l_push_mkroom_table(tmpr) {
    return {
        width: 1 + (tmpr.hx - tmpr.lx),
        height: 1 + (tmpr.hy - tmpr.ly),
        region: { x1: tmpr.lx, y1: tmpr.ly, x2: tmpr.hx, y2: tmpr.hy },
        lit: !!tmpr.rlit,
        irregular: !!tmpr.irregular,
        needjoining: !!tmpr.needjoining,
        type: get_mkroom_name(tmpr.rtype),
    };
}

// C ref: sp_lev.c shared_with_room()
function shared_with_room(x, y, droom) {
    const levl = game.level;
    const rmno = droom.roomnoidx + ROOMOFFSET;

    if (!isok(x, y))
        return FALSE;
    if (levl.at(x, y).roomno === rmno && !levl.at(x, y).edge)
        return FALSE;
    if (isok(x - 1, y) && levl.at(x - 1, y).roomno === rmno && x - 1 <= droom.hx)
        return TRUE;
    if (isok(x + 1, y) && levl.at(x + 1, y).roomno === rmno && x + 1 >= droom.lx)
        return TRUE;
    if (isok(x, y - 1) && levl.at(x, y - 1).roomno === rmno && y - 1 <= droom.hy)
        return TRUE;
    if (isok(x, y + 1) && levl.at(x, y + 1).roomno === rmno && y + 1 >= droom.ly)
        return TRUE;
    return FALSE;
}

// C ref: mkroom.c inside_room()
function inside_room(croom, x, y) {
    if (croom.irregular) {
        const i = croom.roomnoidx + ROOMOFFSET;
        return (!game.level.at(x, y).edge && game.level.at(x, y).roomno === i);
    }

    return (x >= croom.lx - 1 && x <= croom.hx + 1
            && y >= croom.ly - 1 && y <= croom.hy + 1);
}

// C ref: sp_lev.c maybe_add_door()
function maybe_add_door(x, y, droom) {
    if (droom.hx >= 0
        && ((!droom.irregular && inside_room(droom, x, y))
            || game.level.at(x, y).roomno === droom.roomnoidx + ROOMOFFSET
            || shared_with_room(x, y, droom))) {
        add_door(x, y, droom);
    }
}

// C ref: sp_lev.c add_doors_to_room()
/* Add to the room any doors within/bordering it */
function add_doors_to_room(croom) {
    for (let x = croom.lx - 1; x <= croom.hx + 1; x++)
        for (let y = croom.ly - 1; y <= croom.hy + 1; y++) {
            const loc = game.level.at(x, y);
            if (loc && (IS_DOOR(loc.typ) || loc.typ === SDOOR))
                maybe_add_door(x, y, croom);
        }
    for (let i = 0; i < croom.nsubrooms; i++)
        add_doors_to_room(croom.sbrooms[i]);
}

// C ref: sp_lev.c build_room()
function build_room(r, mkr) {
    let okroom;
    let aroom;
    const rtype = (!r.chance || rn2(100) < r.chance) ? r.rtype : OROOM;

    if (mkr) {
        /* create_subroom() is not ported yet */
        nhl_error(null, 'des.room: subrooms are not ported yet');
    } else {
        okroom = create_room(r.x, r.y, r.w, r.h, r.xalign, r.yalign,
                             rtype, r.rlit);
        aroom = okroom ? game.level.rooms[game.level.nroom - 1] : null;
    }

    if (okroom) {
        topologize(aroom); /* set roomno */
        aroom.needfill = r.needfill;
        aroom.needjoining = r.joined;
        return aroom;
    }
    return null;
}

// C ref: sp_lev.c lspo_room()
/* room({ type="ordinary", lit=1, x=3,y=3, xalign="center",yalign="center",
 *        w=11,h=9 }); */
export function lspo_room(tbl) {
    create_des_coder();
    const coder = game.coder;

    if (game.in_mk_themerooms && game.themeroom_failed)
        return 0;

    if (lua_type(tbl) !== 5 /* LUA_TTABLE */)
        nhl_error(null, 'Wrong parameters'); /* lcheck_param_table() */

    if (coder.n_subroom > MAX_NESTED_ROOMS) {
        panic('Too deeply nested rooms?!');
    } else {
        const left_or_right = [
            'left', 'half-left', 'center', 'half-right', 'right',
            'none', 'random',
        ];
        const l_or_r2i = [
            SPLEV_LEFT, SPLEV_H_LEFT, SPLEV_CENTER, SPLEV_H_RIGHT,
            SPLEV_RIGHT, -1, -1, -1,
        ];
        const top_or_bot = ['top', 'center', 'bottom', 'none', 'random'];
        const t_or_b2i = [TOP, SPLEV_CENTER, BOTTOM, -1, -1, -1];
        const tmproom = {};

        const { x: rx, y: ry } = get_table_xy_or_coord(tbl);
        tmproom.x = rx; tmproom.y = ry;
        if ((tmproom.x === -1 || tmproom.y === -1) && tmproom.x !== tmproom.y)
            nhl_error(null, 'Room must have both x and y');

        tmproom.w = get_table_int_opt(tbl, 'w', -1);
        tmproom.h = get_table_int_opt(tbl, 'h', -1);

        if ((tmproom.w === -1 || tmproom.h === -1) && tmproom.w !== tmproom.h)
            nhl_error(null, 'Room must have both w and h');

        tmproom.xalign = l_or_r2i[get_table_option(tbl, 'xalign', 'random',
                                                   left_or_right)];
        tmproom.yalign = t_or_b2i[get_table_option(tbl, 'yalign', 'random',
                                                   top_or_bot)];
        tmproom.rtype = get_table_roomtype_opt(tbl, 'type', OROOM);
        tmproom.chance = get_table_int_opt(tbl, 'chance', 100);
        tmproom.rlit = get_table_int_opt(tbl, 'lit', -1);
        /* theme rooms default to unfilled */
        tmproom.needfill = get_table_int_opt(tbl, 'filled',
                                             game.in_mk_themerooms ? 0 : 1);
        tmproom.joined = get_table_boolean_opt(tbl, 'joined', TRUE);

        if (!coder.failed_room[coder.n_subroom - 1]) {
            const tmpcr = build_room(tmproom, coder.croom);
            if (tmpcr) {
                const n = coder.n_subroom;

                coder.tmproomlist[n] = tmpcr; /* TRUE to get here... */
                coder.failed_room[n] = FALSE;
                /* added a subroom, make parent room irregular */
                if (coder.tmproomlist[n - 1])
                    coder.tmproomlist[n - 1].irregular = TRUE;
                coder.n_subroom++;
                update_croom();
                const contents = tbl.contents;
                if (lua_type(contents) === LUA_TFUNCTION) {
                    /* nhl_pcall_handle(L, 1, 0, "lspo_room", NHLpa_panic);
                       game.lua_des_caller is the Lua stack frame the
                       recorder sees for this C function: des.room */
                    const saved = game.lua_des_caller;
                    game.lua_des_caller = 'room';
                    try {
                        contents(l_push_mkroom_table(tmpcr));
                    } finally {
                        game.lua_des_caller = saved;
                    }
                }
                spo_endroom(coder);
                add_doors_to_room(tmpcr);
                return 0;
            }
            if (game.in_mk_themerooms)
                game.themeroom_failed = TRUE;
        } /* failed to create parent room, so fail this too */
    }
    coder.tmproomlist[coder.n_subroom] = null;
    coder.failed_room[coder.n_subroom] = TRUE;
    coder.n_subroom++;
    update_croom();
    spo_endroom(coder);
    if (game.in_mk_themerooms)
        game.themeroom_failed = TRUE;

    return 0;
}

// C ref: sp_lev.c l_register_des() — the des_functions[] names. Only
// des.room is ported; the others raise a Lua error when called.
const sp_lev_des_names = [
    'message', 'monster', 'object', 'level_flags', 'level_init',
    'engraving', 'mineralize', 'door', 'stair', 'ladder', 'grave', 'altar',
    'map', 'feature', 'terrain', 'replace_terrain', 'room', 'corridor',
    'random_corridors', 'gold', 'trap', 'mazewalk', 'drawbridge', 'region',
    'levregion', 'exclusion', 'wallify', 'wall_property', 'non_diggable',
    'non_passwall', 'teleport_region', 'reset_level', 'finalize_level',
    'gas_cloud',
];

function des_not_ported(name) {
    return function des_not_ported_yet() {
        lua_error(`des.${name}: lspo_${name}() is not ported yet`);
    };
}

// C ref: sp_lev.c l_register_des()
export function l_register_des(L) {
    const des = {};
    for (const name of sp_lev_des_names)
        des[name] = des_not_ported(name);
    des.room = lspo_room;
    L.globals.des = des;
}
