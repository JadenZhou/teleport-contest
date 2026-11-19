# Loop log, 2026-11-19 midday (cloud session, 12:30–14:30 ET)

Coordinator ran tools/rule/METHOD.md with two streams (A = dice frontier, B = display), one fresh agent per task in its own worktree, and every merge gated on public AND dev. Private sessions were skipped (cloud session), so the owner should run them on the Mac.

## Totals (progress.mjs)

| | Before (58d9939) | After | Δ |
|---|---|---|---|
| Public rule prefix | 118,506 / 792,838 (14.95%) | 127,817 (16.12%) | +9,311 |
| Public honest screens | 121 (official 135) | 240 (official 249) | +119 |
| Public unearned (value−rule) | 129 | 2 | −127 |
| Dev rule prefix | 110,296 / 504,996 (21.84%) | 121,145 (23.99%) | +10,849 |
| Dev honest screens | 120 (official 120) | 234 (official 246) | +114 |
| Dev unearned | 3 | 0 | −3 |
| Static checks | discarded-roll 10 | none (all 0) | −10 |

`bash frozen/score.sh`: no crashes after any merge; 0/44 sessions pass, before and after. **`js/fastforward.js` is gone**: no replayed rolls remain.

## Merges (11, in order; each had no regression on either set and a gain on at least one)

1. **selvar/nhlsel selection port + des.trap**: fixes the dev82107 `selection_filter_percent` divergence (the Spider nest themeroom's `selection.*` were stubs). dev82107 597→3166.
2. **Display: legacy intro window** (com_pager/deliver_by_window, tty text windows, docorner), status lines (showexp/time), monsters on map, ASCII unless DECgraphics. Public honest 121→144, dev 120→138.
3. **moveloop_core once-per-turn block** (nh_timeout, regen, dosounds, gethungry, age_spells, exerchk, u_wipe_engr, seer_turn); FF_NEWTURN replay removed. 22 public / 21 dev sessions improved.
4. **Lua `obj` module (nhlobj.js), readobjnam, des.object/monster/exclusion**: fixes the dev81287 crash in the Water-surrounded vault themeroom (`G.obj.new`; the crash was `obj.new`, not `selection.new`). dev81287 0→3012. This was a dev-only improvement plus seed0015; it needed a rebase after merge 1.
5. **movemon/monmove/dogmove port**; FF_MOVEMON replay and fastforward.js deleted; floor object lists (`level.objects`). Discarded-roll check 9→0. Public honest 145→158. Also accepted: `runSegment` now stops cleanly on a "not ported yet" error and keeps the log so far, like the existing "Input queue empty" handling. It only truncates and can't add matches.
6. **Display retry subset**: back_to_glyph/doormask, topl update_topl/more, pline via the message window, calendar.js (moon/Friday 13th), getlin prompts for ^V/^W. Public honest 158→195, dev 139→192.
7. **Level creation**: Buried zombies/treasure (montype, bury_an_obj), subrooms, des.door, mk_trap_statue, rndghostname/christen_monst. Fixes `somex`, `rndmonst_adj` and `rndghostname`. Public rule +8.8k (seed0013 ×2 528→3837, seed0015 363→2553).
8. **Display: floor objects on the map** (newsym/map_object/obj_to_glyph, observe_object), wd_message. Public honest 204→238, dev 193→233.
9. **makewish/hold_another_object** (^W wish). seed0398 2764→2803.
10. **Starting Pw**: initialspell/num_spells and the SPELL_LEV_PW floor. Public honest +2. Dev showed 0 improved / 0 regressed, which is acceptable under the either-set rule.
11. **mfndpos trap avoidance** (m_harmless_trap, mon_knows_traps, resists_*). Removes the most common "not ported yet" stop (17 sessions).

## Rejections and near-misses, by reason

Coordinator ledger (tools/rule/runs/ledger.jsonl): 4 FAIL runs out of 26. Agent ledger: 11 FAIL runs out of 39.

- **Regression (rule prefix lost), 4 coordinator rejections (2 tasks × public/dev):**
  - Stream B r1 (topl/tutorial/getline/glyphs): public −2, dev −5. Retried as a subset without the tutorial and `#`/`s` bindings, then passed (merge 6). The subset gave up about 90 public / 120 dev honest screens that the full version had.
  - Stream A newhp r1 (tutorial + #extcmd + wiz_level_change/pluslvl/newhp): public −12, dev −21 against the then-current main. The salvage retry passed public (+4) but failed dev (−6) because of the rhack `context.move` fix. **Parked.**
- **Regression in agent self-gates:** stream B objects r1/r2 (tutorial query re-added): public −2, dev −5. Resubmitted without it and merged (merge 8).
- **Static check grew (`session-fixture` 0→1):** stream B objects r1 had a literal message string that matched a recorded screen row. Rewritten as `You("are in …")` the way C does it.
- **No session improved:** nhlobj on public (vault not reached in public; merged on its dev gain), and starting Pw on dev.
- **Root cause of every regression:** the **tutorial query** ("Do you want a tutorial?"). Without it, the keys typed at it run as game moves, and some later rolls line up by coincidence. With it, keys land correctly but sessions then reach unported commands, losing those coincidental matches. METHOD's gate allows no exceptions, so it stays out until those commands are ported.

## Stuck items / next tasks

1. **Tutorial query (`ask_do_tutorial`/`maybe_do_tutorial`) + `#`/`s` key bindings**: blocks `newhp` (6 public / 6 dev), the welcome `--More--` (the first screen miss in ~23 public / 24 dev sessions; C's tty flushes the message window when the menu is drawn), seed0004 and seed0108 `#wizwish`. Prerequisites: port `#loot`, `#name`, `#chat`, `#pray`, `#jump`, `#ride`, rush `H`/`L`, and the pet-AI / domove-into-monster gaps. Ported code sits unhooked in branch history: `worktree-agent-af985312d5014c71f` (dd5e936) and stream B's reverted commits.
2. **Pet starting square**: C's `enexto_core` (NEW_ENEXTO) reads an uninitialised `cc`, so the pet's start square depends on stack garbage. JS uses the fixed version. Likely behind several `distfleeck`/`dog_move`/`obj_resists` mismatches (seed0002, seed0030, seed0060, seed0105). Needs an owner decision.
3. **Most common "not ported yet" stops now:** `pet_ranged_attk(): mattacku/mattackm` (13), `dochug(): mattacku` (8), `dog_move(): pet attacking` (7).
4. **To-do head:** distfleeck (7), newhp (6), do_attack (6), getbones (4, needs level change/goto_level), obj_resists (3).
5. dev82189 @918 `select_newcham_form` (newcham); `des.engraving` not ported.
6. "Unknown command" message is suppressed until cmd.c key bindings are ported (comment in js/cmd.js rhack), a known deviation from C.
7. Lua timers (`has_timer`/`start_timer`) use a single `obj.timer` placeholder until timeout.c timers are ported.

## Process notes

- **Push:** this clone has no `origin` remote and no GitHub account is linked to the session, so none of the merges could be pushed. Everything is committed on local `main`.
- Private held-out sessions were not run (cloud session); the owner should run `--label private` on the Mac.
- Starting stream A and stream B in parallel with the two dev-set fixes (rather than strictly after them) saved about 30 min. The fixes still merged first.
