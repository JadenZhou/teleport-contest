# Method: match every roll, including who rolls it

The contest checks that the JS port's dice rolls and screens match the C game. This entry adds
one stricter rule: **every dice roll must come from the same function as in C**. For Lua-side
rolls that means the same Lua file and line. The rule targets the shortcuts other agentic
entries fell into, like rolling dice only to keep the count right, special-cased branches and
replayed answers. It also writes the to-do list: the first roll that breaks the rule names the
C function to port next.

Example: on the unmodified skeleton, the contest credits 10,798 matching rolls and 15 screens.
The rule credits **0 rolls and 0 honest screens**, because all of them come from the hard-coded
`fastforward.js` replay.

## Tools (Node 22: `PATH=~/.nvm/versions/node/v22.14.0/bin:$PATH`)

| Command | What it does |
|---|---|
| `node tools/rule/progress.mjs` | Per session: rule prefix, value prefix, honest/official screens, first rule mismatch. Prints the to-do list and static-check counts. |
| `node tools/rule/progress.mjs --gate tools/rule/runs/baseline.json --label "..."` | Merge gate. Appends to `tools/rule/runs/ledger.jsonl`. |
| `node tools/rule/progress.mjs --json tools/rule/runs/baseline.json` | Save a new baseline (only after a merge). |
| `bash frozen/score.sh` | The official public scorer. |
| `node tools/rule/progress.mjs --sessions ~/code/teleport-research/private-sessions/recorded` | Private held-out check. **Coordinator only.** |

**Gate:** pass only if no session loses rule prefix or honest screens, at least one gains
either, and no static check count grows (`tools/rule/checks.mjs`).

## Porting rules (for every agent)

1. **Port the C (or Lua) source faithfully.** Same function names, same structure, same order
   of operations. The C source is `nethack-c/recorder/src/*.c`, the Lua is
   `nethack-c/recorder/dat/*.lua`, headers are in `include/`. Every ported function gets a
   comment like `// C ref: mklev.c makerooms()`.
2. **Roll dice only in the function C rolls them in**, with no anonymous wrappers.
   `rn1`, `ROLL_FROM`, `AC_VALUE`, `rnl`, `rne`, `rnz`, `d` and `shuffle_int_array` come from
   `js/rng.js` and are attributed to their caller, exactly like C.
   **Where C passes `rn2` as a function pointer** (writing `rn2` without calling it, e.g.
   `get_rnd_line(..., rn2, ...)`, `random_object(rn2)`, `random_monster(rn2)`,
   `obj_to_glyph(corpse, rn2)`), pass `rn2_fnptr` from `js/rng.js`. In C those rolls skip
   the recorder's caller macro and inherit the last caller tag; `rn2_fnptr` reproduces that.
3. **Lua:** hand-port the scripts (`themerms.lua`, `nhlib.lua`, `nhcore.lua`, `dungeon.lua`
   data; special-level scripts only when a session reaches them). Every Lua-side roll goes
   through `withRngCaller('<exact C log tag>', () => ...)`, e.g. `nh.rn2(themerms.lua:123)` or
   `random src=nhlib.lua:8 parent=shuffle(nhlib.lua:19)`. Watch Lua semantics: `%` is floored
   modulo, `//` is floor division, arrays are 1-based, and `#` behaves differently on tables with holes.
4. **Never:** discard a roll (C never does: 0 of 2,758 call sites), branch on seed/step/log
   length, copy session data into `js/`, read files/env from `js/`, or edit the frozen files
   (`js/isaac64.js`, `js/terminal.js`, `js/storage.js`). Don't special-case a session.
5. **Delete fakes when you reach them.** `js/fastforward.js` replays recorded rolls. Replace each
   use with the real C port. Removing it will drop the official score from 15 to 0 for a
   while. That's expected: honest screens are the measure.
6. **A task means "advance the rule prefix past roll i."** The first mismatch may be a symptom.
   Check whether the cause is a missing function, a wrong argument (state set wrong earlier) or
   an extra/missing roll earlier in the same step. Port whatever C is needed, faithfully.
7. **Agents may read public `sessions/`** for debugging, but must not see or touch
   `~/code/teleport-research/private-sessions`.

## Loop protocol (coordinator)

Each iteration:
1. `progress.mjs`: read the to-do list and the first mismatch of the top item.
2. Give **one task** to a fresh agent in its own git worktree, with the task ("advance past
   roll i in session S; C says `X @ fn`"), these rules, and the relevant C/Lua source files.
   Early on, work is serial because every session shares the same startup path: `o_init.c` →
   `role.c` → `nhlib.lua` shuffle + `dungeon.c` → `u_init.c` → `mklev.c` + `themerms.lua` +
   `sp_lev.c` → `makemon.c`/`mkobj.c` → vision/display/status line. Run 2–3 agents in parallel
   only once the to-do list fans out to different C functions.
3. Run the gate on the agent's branch. **Pass:** merge to main, save a new baseline, commit.
   **Fail:** the ledger records why. Send the reasons back to the agent at most twice, then park
   the task with a note.
4. Every ~3 merges, run the private sessions and record their totals in the ledger (`--label private`).
5. Every merge must also keep `bash frozen/score.sh` working with no crashes. The official score
   may dip only when fake scaffolding is removed.

Screens: until the first level renders correctly, the screen score stays near zero apart from
the character-selection screens (82 before the first roll). The rule prefix is the daily
progress signal. Display work (tty windows, map, status line, `--More--`, menus) is its own
task stream once rolls get past level creation. Use the scorer's first screen mismatch.

## Measurement (for the writeup)

- `tools/rule/runs/ledger.jsonl` records every gate run: label, to-do item, pass/fail and
  reasons, totals, static counts.
- Rule vs value totals over time: unearned credit should stay at ~0 once the fakes are gone.
- Public vs private honest-screen rates: the port's own generalization gap.
- Rejections by reason: how often the gate stopped shortcuts or regressions.

## Recorder setup notes (local, after `nethack-c/build-recorder.sh`)

`make install` stops at the man pages on macOS (no `tbl`/`nroff`), so `sysconf` is never
installed. Copy `nethack-c/recorder/sys/unix/sysconf` into
`nethack-c/recorder/install/games/lib/nethackdir/` and set `WIZARDS=*` (debug-mode
sessions need it), `GREPPATH=/usr/bin/grep`, `#GDBPATH` and `PANICTRACE_GDB=0`. With
that, `scripts/verify-rerecord.mjs` reproduces 39/44 public sessions exactly. The 5
failures diverge late (step 64+) and look like recorder screen-capture quirks, not
gameplay. The private sessions (`~/code/teleport-research/private-sessions/recorded`: 12
public recipes with new seeds, 1,071 screens) were recorded this way.

## Deferred

- **Messages half of the rule** (every message from the same C function): a recorder patch
  logging the `pline` family's `__func__`, then re-recording. Start after the dice loop has run.
