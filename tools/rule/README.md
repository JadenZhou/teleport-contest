# The rule: match every roll, including who rolls it

The contest checks that the JS port's dice rolls match C's **values**. This method also
requires each roll to come from **the same C function** (from the C recorder's
`@ fn(file:line)` tags). Lua-side rolls must match their Lua function and file.

- `js/rng.js`: opt-in caller tracing (`globalThis.__TELEPORT_CALLER_TRACE`). It's off during
  official scoring, and the scorer strips ` @ …` anyway.
- `progress.mjs`: per-session rule prefix vs value prefix, the first mismatch, and a ranked
  to-do list of C functions to port next.
- Merge gate: `node tools/rule/progress.mjs --gate tools/rule/runs/baseline.json` passes only
  if some session's rule prefix grows and none shrinks.

Run with Node 22: `PATH=~/.nvm/versions/node/v22.14.0/bin:$PATH node tools/rule/progress.mjs`
