// nhlobj.js — the Lua "obj" table (object handles for Lua scripts).
// C ref: nhlobj.c — l_obj_check, l_obj_push, nhl_push_obj,
// l_obj_add_to_container, l_obj_objects_to_table, l_obj_new_readobjnam,
// l_obj_register.
//
// An obj handle is a LuaUserdata whose metatable is the registered "obj"
// metatable (struct _lua_obj: { state, obj }). Ported so far: obj.new,
// obj.class and obj.addcontent, which themerms.lua uses. The other methods
// in l_obj_methods[] raise a Lua error until they are ported. Lua's __gc
// (l_obj_gc) has no JS counterpart: JS objects are garbage collected.

import {
    LuaUserdata, luaL_checkudata, lua_type, nhl_error, luaL_checkstring,
    LUA_TSTRING, LUA_TTABLE, LUA_TNUMBER, LUA_TUSERDATA, luaL_checkinteger,
    lua_error,
} from './nhlua.js';
import { objects, OBJ_NAME, OBJ_DESCR, MAXOCLASSES, RANDOM_CLASS } from './objects.js';
import { def_oc_syms, def_char_to_objclass } from './drawing.js';
import { readobjnam } from './objnam.js';
import { mksobj, mkobj, add_to_container, weight } from './mkobj.js';
import { get_table_objtype, get_table_objclass } from './sp_lev.js';

const FIRST_OBJECT = 1; /* objects.h */

// C ref: decl.c materialnm[]
const materialnm = [ "mysterious", "liquid",  "wax",        "organic",
                     "flesh",      "paper",   "cloth",      "leather",
                     "wooden",     "bone",    "dragonhide", "iron",
                     "metal",      "copper",  "silver",     "gold",
                     "platinum",   "mithril", "plastic",    "glass",
                     "gemstone",   "stone" ];

// The "obj" metatable created by l_obj_register() (C: the Lua registry).
let obj_metatable = null;

// C ref: nhlobj.c lobj_is_ok()
function lobj_is_ok(lo) {
    return lo && lo.obj && lo.obj.where !== 'OBJ_LUAFREE';
}

// C ref: nhlobj.c l_obj_check()
function l_obj_check(v) {
    const lo = luaL_checkudata(v, "obj");
    if (!lo)
        nhl_error(null, "Obj error");
    return lo;
}

// C ref: nhlobj.c l_obj_push()
function l_obj_push(otmp) {
    const lo = new LuaUserdata(obj_metatable, { state: 0, obj: otmp });

    if (otmp)
        otmp.lua_ref_cnt = (otmp.lua_ref_cnt || 0) + 1;

    return lo;
}

// C ref: nhlobj.c nhl_push_obj()
export function nhl_push_obj(otmp) {
    return l_obj_push(otmp);
}

// C ref: mkobj.c obj_extract_self() — only the cases the obj handles reach
// so far: free objects need nothing; floor objects are not kept in level
// chains yet, so remove_object() only clears the location.
function obj_extract_self(obj) {
    switch (obj.where) {
    case 'OBJ_FREE':
    case 'OBJ_LUAFREE':
    case 'OBJ_DELETED':
        break;
    case 'OBJ_FLOOR':
        obj.where = 'OBJ_FREE'; /* remove_object() */
        break;
    case 'OBJ_CONTAINED': {
        const box = obj.ocontainer;
        const i = box.cobj ? box.cobj.indexOf(obj) : -1;
        if (i >= 0)
            box.cobj.splice(i, 1); /* extract_nobj() */
        box.owt = weight(box); /* container_weight() */
        obj.ocontainer = null; /* clear stale back-link */
        obj.where = 'OBJ_FREE';
        break;
    }
    default:
        throw new Error(`obj_extract_self: where=${obj.where} is not ported yet`);
    }
}

// C ref: nhlobj.c l_obj_add_to_container()
/* Puts object inside another object. */
/* local box = obj.new("large chest");
   box:addcontent(obj.new("rock"));
*/
function l_obj_add_to_container(box, itm) {
    const lobox = l_obj_check(box);
    const lo = l_obj_check(itm);

    if (!lobj_is_ok(lo) || !lobj_is_ok(lobox))
        return 0;

    const refs = lo.obj.lua_ref_cnt;

    obj_extract_self(lo.obj);
    const otmp = add_to_container(lobox.obj, lo.obj);

    /* was lo->obj merged? */
    if (otmp !== lo.obj) {
        lo.obj = otmp;
        lo.obj.lua_ref_cnt += refs;
    }
    lobox.obj.owt = weight(lobox.obj);

    return 0;
}

// C ref: nhlobj.c l_obj_objects_to_table()
/* Get a table of object class data. */
/* local odata = obj.class(otbl.otyp); */
/* local odata = obj.class(obj.new("rock")); */
/* local odata = o:class(); */
function l_obj_objects_to_table(...args) {
    const argc = args.length;
    let otyp = -1;

    if (argc !== 1) {
        nhl_error(null, "l_obj_objects_to_table: Wrong args");
        /*NOTREACHED*/
        return 0;
    }

    if (lua_type(args[0]) === LUA_TNUMBER) {
        otyp = luaL_checkinteger(args[0]);
    } else if (lua_type(args[0]) === LUA_TUSERDATA) {
        const lo = l_obj_check(args[0]);
        if (lo && lo.obj)
            otyp = lo.obj.otyp;
    }

    if (otyp === -1) {
        nhl_error(null, "l_obj_objects_to_table: Wrong args");
        /*NOTREACHED*/
        return 0;
    }

    const o = objects[otyp];
    const tbl = {};

    if (OBJ_NAME(objects[otyp]))
        tbl.name = OBJ_NAME(objects[otyp]);
    if (OBJ_DESCR(objects[otyp]))
        tbl.descr = OBJ_DESCR(objects[otyp]);
    if (o.oc_uname)
        tbl.uname = o.oc_uname;

    tbl.name_known = o.oc_name_known;
    tbl.merge = o.oc_merge;
    tbl.uses_known = o.oc_uses_known;
    tbl.encountered = o.oc_encountered;
    tbl.magic = o.oc_magic;
    tbl.charged = o.oc_charged;
    tbl.unique = o.oc_unique;
    tbl.nowish = o.oc_nowish;
    tbl.big = o.oc_big;
    /* TODO: oc_bimanual, oc_bulky */
    tbl.tough = o.oc_tough;
    tbl.dir = o.oc_dir; /* TODO: convert to text */
    tbl.material = materialnm[o.oc_material];
    /* TODO: oc_subtyp, oc_skill, oc_armcat */
    tbl.oprop = o.oc_oprop;
    tbl.class = def_oc_syms[o.oc_class];
    tbl.delay = o.oc_delay;
    tbl.color = o.oc_color; /* TODO: text? */
    tbl.prob = o.oc_prob;
    tbl.weight = o.oc_weight;
    tbl.cost = o.oc_cost;
    tbl.damage_small = o.oc_wsdam;
    tbl.damage_large = o.oc_wldam;
    /* TODO: oc_oc1, oc_oc2, oc_hitbon, a_ac, a_can, oc_level */
    tbl.nutrition = o.oc_nutrition;

    return tbl;
}

// C ref: nhlobj.c l_obj_new_readobjnam()
/* create a new object via wishing routine */
/* local o = obj.new("rock"); */
/* local o = obj.new({ id = "food ration", class = "%" }); */
function l_obj_new_readobjnam(...args) {
    const argc = args.length;

    if (argc === 1 && lua_type(args[0]) === LUA_TSTRING) {
        const buf = luaL_checkstring(args[0]);
        let otmp;

        if ((otmp = readobjnam(buf, null)) === 'hands_obj')
            otmp = null;
        return l_obj_push(otmp);
    } else if (argc === 1 && lua_type(args[0]) === LUA_TTABLE) {
        const id = get_table_objtype(args[0]);
        let oclass = get_table_objclass(args[0]);
        let otmp;

        if (id >= FIRST_OBJECT) {
            otmp = mksobj(id, true, false);
        } else {
            oclass = def_char_to_objclass(oclass);
            if (oclass >= MAXOCLASSES)
                oclass = RANDOM_CLASS;
            otmp = mkobj(oclass, false);
        }
        return l_obj_push(otmp);
    } else
        nhl_error(null, "l_obj_new_readobjname: Wrong args");
    /*NOTREACHED*/
    return 0;
}

function l_obj_not_ported(name) {
    return function l_obj_not_ported_yet() {
        lua_error(`obj.${name}: not ported yet`);
    };
}

// C ref: nhlobj.c l_obj_register()
export function l_obj_register(L) {
    /* Table of instance methods (e.g. an_object:isnull())
       and static methods (e.g. obj.new("dagger")).
       C: luaL_newlib(L, l_obj_methods) */
    const l_obj_methods = {
        new: l_obj_new_readobjnam,
        isnull: l_obj_not_ported('isnull'),
        at: l_obj_not_ported('at'),
        next: l_obj_not_ported('next'),
        totable: l_obj_not_ported('totable'),
        class: l_obj_objects_to_table,
        placeobj: l_obj_not_ported('placeobj'),
        container: l_obj_not_ported('container'),
        contents: l_obj_not_ported('contents'),
        addcontent: l_obj_add_to_container,
        has_timer: l_obj_not_ported('has_timer'),
        peek_timer: l_obj_not_ported('peek_timer'),
        stop_timer: l_obj_not_ported('stop_timer'),
        start_timer: l_obj_not_ported('start_timer'),
        bury: l_obj_not_ported('bury'),
    };

    /* metatable = { __name = "obj", __gc = l_obj_gc } */
    obj_metatable = { __name: "obj" };
    /* metatable.__index points at the object method table. */
    obj_metatable.__index = l_obj_methods;

    /* global obj = the method table we created at the start */
    L.globals.obj = l_obj_methods;
    return 0;
}
