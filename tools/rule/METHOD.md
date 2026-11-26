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
7. **Agents may read public `sessions/` and the dev set `sessions-dev/`** (the 44 public
   recipes re-recorded with new seeds) for debugging, but must not see or touch
   `~/code/teleport-research/private-sessions`. That folder exists only on the owner's Mac.
8. **Agents self-gate into the agent ledger**, so near-misses are measured:
   `node tools/rule/progress.mjs --gate tools/rule/runs/baseline.json --label "..." --ledger /tmp/teleport-agent-ledger.jsonl`
   At the end of each loop the coordinator appends `/tmp/teleport-agent-ledger.jsonl` to
   `tools/rule/runs/agent-ledger.jsonl` and commits it.
9. **Environment:** Node ≥ 22 (`node --version`). C sources are in `nethack-c/recorder/` on
   the owner's Mac (patched build), or in `nethack-c/upstream/` otherwise
   (`git submodule update --init nethack-c/upstream`). It's the same code minus the logging
   patches.

## Loop protocol (coordinator)

Each iteration:
1. `progress.mjs`: read the to-do list (ranked by **screens blocked**, since screens are the score) and the first mismatch of the top item. Prefer items that unblock the most screens over items that touch the most sessions.
2. Give **one task** to a fresh agent in its own git worktree, with the task ("advance past
   roll i in session S; C says `X @ fn`"), these rules, and the relevant C/Lua source files.
   Early on, work is serial because every session shares the same startup path: `o_init.c` →
   `role.c` → `nhlib.lua` shuffle + `dungeon.c` → `u_init.c` → `mklev.c` + `themerms.lua` +
   `sp_lev.c` → `makemon.c`/`mkobj.c` → vision/display/status line. Run 2–3 agents in parallel
   only once the to-do list fans out to different C functions.
3. Run the gate on the agent's branch, **on both public and dev**:
   - `node tools/rule/progress.mjs --gate tools/rule/runs/baseline.json --label "..."`
   - `node tools/rule/progress.mjs --sessions sessions-dev --gate tools/rule/runs/dev-baseline.json --label "dev: ..."`

   A merge needs **no regression on either**, and improvement on at least one. (A dev-only
   improvement is fine: it means a generalization fix.)
   - **Pass:** merge to main, save new baselines for both (`--json`), and commit.
   - **Fail:** the ledger records why. Send the reasons back to the agent at most twice, then
     park the task with a note.
4. Every ~3 merges, run the private sessions and record their totals in the ledger (`--label private`). **Only on the owner's Mac**, where `~/code/teleport-research/private-sessions/recorded` exists. In cloud sessions, skip this step; the owner runs it afterwards.
5. Every merge must also keep `bash frozen/score.sh` working with no crashes. The official score
   may dip only when fake scaffolding is removed.

### Two streams (from 2026-11-19 evening)

Run two agents in parallel, each in its own worktree. Merge one at a time; re-run the gate
after rebasing the second one.

- **Stream A, dice frontier:** the top to-do item from `progress.mjs` that isn't owned by
  stream B. As of 11-19 that's `dosounds` (11 sessions), then `gethungry`, `newhp`,
  `do_attack`, the remaining per-turn replay in `moveloop_core()`, and `movemon()`.
- **Stream B, display:** make the screens after character selection match C, starting with
  the first one. Work in order: the legacy intro text window (com_pager text + tty window +
  key flow), then tty map rendering (`display.c`/`wintty.c`, glyphs, DECgraphics symset),
  the status lines (`botl.c`), the message line and `--More--`, the cursor position, and
  menus/inventory. Use `progress.mjs` honest screens (and `firstScreenMiss` in `--json`) as
  the progress signal, and the session viewer in `tools/session-viewer` to diff screens.
  Port the C display code faithfully; no hard-coded screen text.
- If the dice-frontier item and the display work collide in the same files, finish one first.

Screens: until the first level renders correctly, the screen score stays near zero apart from
the character-selection screens (82 before the first roll). The rule prefix is the daily
progress signal. Display work (tty windows, map, status line, `--More--`, menus) is its own
task stream once rolls get past level creation. Use the scorer's first screen mismatch.

## Owner decisions (2026-11-19)

**A. Approved regressions: the tutorial question.** C asks "Do you want a tutorial?" at
startup. Without it, the keys typed there run as game moves, and some later rolls match only by
coincidence. Porting the question faithfully loses that coincidental credit, so the owner
allows a merge that regresses **only when**:
- the change ports C faithfully (`ask_do_tutorial`/`maybe_do_tutorial`, plus the `#`/`s` key
  bindings);
- for every regressed session, the coordinator shows the lost credit came after the step where
  JS's prompt/key flow first differed from C's (e.g. the screen at that step already
  mismatched before the change); and
- the merge also ports the commands sessions reach next, so as little as possible stays lost:
  `#loot`, `#name`, `#chat`, `#pray`, `#jump`, `#ride`, rush `H`/`L`, and pet AI/domove-into-monster.

Label such gate runs `approved-regression: tutorial …` so the ledger shows them. Ported code
from the 11-19 midday run is in branch history (`worktree-agent-af985312d5014c71f`
dd5e936, and stream B's reverted commits).

**B. Pet starting square: CLOSED (2026-11-19).** The premise was false. With NEW_ENEXTO,
`enexto_core` sets `*cc` before every `goodpos()` call, and makemon.c reads `cc` only after a
TRUE return. lldb on the recorder (seed 2: hero (51,12) → pet (51,13); seed 4: (69,8) →
(68,9)) matches JS. Pet-code stalls come from unported hero commands, not from this.

**C. Crash fixes may merge without a gate gain (2026-11-19).** A crash in a secret session
cuts off every screen after it. A faithful port that removes a crash or panic may merge when
it causes **no regression on public or dev**, even if neither improves. The coordinator must
verify that the crash is gone and that no private session regresses. Label these gate runs
`crash-fix: …`. Agents get the task only as the C/Lua function to port (e.g. "port
`des.gas_cloud`/`lspo_gas_cloud` and region.c `create_gas_cloud_selection`"), never details
of a private session.

**D. Unported commands stop explicitly (2026-11-20).** `rhack` must not treat an unported
command (e.g. `O`/doset) as a silent no-op. If it does, the following keys are read as other
commands and earn coincidental credit. An unported command throws a "not ported yet" stop,
the same way the rest of the port does. Merges that lose credit this way follow decision A's
rule: per-session proof that the lost credit came after the step where JS's key flow first
differed from C's. Label them `approved-regression: unported-command …`. Then port the
commands sessions actually use, starting with `O` (doset/options menu).

**E. option_help() is ported as C reads it, path not modelled (2026-11-24).** The owner
approved A60's port (978fe12, re-applied in a6c3beb). Its "List of game options." intro shows
the config file as `.nethackrc`; C shows the recording machine's temp path. Don't model that
path. The 8 screens per wizard-quaff-zap-read session that differ only on that line stay lost.
The other two owner decisions stand: don't model `u.ubirthday`/shopkeeper names, or runs of 5+
blanks inside inverse video in menu headings.

**F. compress_str() is ported as C has it (2026-11-26).** The owner approved A95's faithful
port of wintty.c `compress_str()` (c7419f2, reverted by 943f514, re-applied in 9b48aa2).
`tty_putstr()` squeezes runs of spaces out of every line of `CO` or more characters in a
non-message window, so long `#chronicle` and discoveries lines wrap as C wraps them. Each
wizard-quaff-zap-read session loses 2 screens (222→220) that matched only by coincidence: C's
option_help() shows the recorder's temp config path (decision E, not modelled), and JS's
uncompressed `glyph` line used to wrap and offset it. Those screens stay lost; don't add code
to win them back.

**Gate: browser playability (2026-11-24).** The leaderboard's "Playable" column runs
`bash frozen/play.sh`: every public session in one Node process, one `moveloop_core()` per key.
It fails if any session throws (a "not ported yet" stop included), not only when it is slower
than 5 ms/move. After each merge it should print `PLAYABLE`. Keep per-game state in `game`, not
in module-level variables, because a second game in the same process must start clean.

**Run hygiene (learned 2026-11-20).**
- Each agent task uses about 0.3–0.5M tokens. Budget about 3M per 5-hour usage window.
- If a usage limit hits, resume stopped agents with SendMessage (no work is lost), and run
  at most 2 agents at a time after that.
- Commit the ledger and write the summary **before the last hour** of the window, not at
  the end.
- Generalization checks beyond dev: the coordinator's probe sets
  (`~/code/teleport-research/probe-sessions` (320 short) and `probe-sessions-full` (120))
  and tools (`~/code/teleport-research/tools/coordinator/`: `proof.mjs` for the decision-A/D
  proofs, `sessdetail.mjs`, `scorecheck.sh`). Agents may be given probe sessions; never
  private ones.

**Gate: crash count.** `progress.mjs` counts real crashes (any error other than an explicit
"not ported yet" stop, plus timeouts) in `STATIC` as `crash`, and the gate fails if it grows.

**Crashes.** `runSegment` stops cleanly on any error and keeps the output so far (it can only
truncate). `progress.mjs` still reports the error, so a panic shows up as an `ERROR`/`[JS
threw]` stop in the to-do list. Treat a crash in any set as a top-priority divergence: in a
secret session it would cut off every screen after that point.

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

**Don't rebuild the recorder with the updated patch 006 (checked 2026-11-21).** Upstream
`6ee30e6` changed `nethack-c/patches/006-nomux-capture.patch`: a bigger capture buffer and a
raw-mode reset on exit. A build with it, tested from `/tmp/nhbuild`:
- reproduces only 38/44 public sessions instead of 39/44;
- deterministically changes the save/exit cursor in `seed0013-friday13-save-then-fullmoon-restore`
  (steps 48 and 98: official [0,1,1], new [0,0,1]), which the current build reproduces exactly.

The official public sessions therefore match the *old* capture behaviour. The overflow half of
the fix changes none of our dev or private recordings. Keep the current build in
`nethack-c/recorder`. `build-recorder.sh` would now apply the new patch, so restore patch 006
from before `6ee30e6` if you ever need to rebuild.

**Meta keys (stream A, next).** Held-out sessions contain keys above 0x7f (issue #23): meta
keys, where `M-e` is the single char U+00E5. Public sessions never do, so neither do dev or
probe. Port all of C's meta-key bindings faithfully (cmd.c, `M(...)`), and record a meta-key
probe set. The merged `scripts/record-session.mjs` writes one byte per key (latin1), so the
current recorder handles such recipes. Build recipes from public ones by replacing
extended commands with their meta-key forms (e.g. `#pray` → `M-p`).

## Deferred

- **Messages half of the rule** (every message from the same C function): a recorder patch
  logging the `pline` family's `__func__`, then re-recording. Start after the dice loop has run.
