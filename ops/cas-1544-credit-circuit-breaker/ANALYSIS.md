# CAS-1544 — Credit-exhaustion circuit-breaker: root-cause + fix

Investigated the shipped runtime `paperclipai@2026.609.0` → `@paperclipai/server` +
`@paperclipai/adapter-claude-local` (TS reconstructed from installed dist + source maps).

## (a) Exact error signature of credit / usage-quota exhaustion

The Claude CLI does **not** surface a clean HTTP 429 to the runtime — it prints a usage /
credit-limit message to stdout/stderr and exits non-zero. The adapter matches it with a regex
and re-tags it as a transient-upstream failure.

- Detector: `packages/adapters/adapter-claude-local/src/server/parse.ts`
  - `CLAUDE_TRANSIENT_UPSTREAM_RE` (parse.ts:4) matches:
    `rate_limit_error`, `429`, `overloaded`, `503`, `529`, `too many requests`,
    **`claude usage limit reached`**, **`5-hour limit reached`**, **`weekly limit reached`**,
    **`usage limit reached`**, **`usage cap reached`**, **`out of extra usage`**.
  - `CLAUDE_EXTRA_USAGE_RESET_RE` (parse.ts:5) + `extractClaudeRetryNotBefore` (parse.ts:294)
    parse the human "…resets at 11am (America/New_York)" text into a concrete reset instant.
- Result contract (from `.../server/execute.ts:693-728`): a failed run yields
  - `errorCode: "claude_transient_upstream"`
  - `errorFamily: "transient_upstream"`
  - `retryNotBefore: <ISO reset instant>` (when a reset time was present)
  - `provider: "anthropic"`

So the exhaustion signature the runtime sees = **`errorFamily === "transient_upstream"` with a
`retryNotBefore`** (the credit/usage-limit-with-reset case). Pure overload (503/529) also lands
in `transient_upstream` but usually without a `retryNotBefore`.

## (b) Where the failure turns into a re-spawn loop (the zombie source)

There is **no single loop** — the zombies come from a *missing account-level gate*. Credit
exhaustion is an **account-wide** condition, but every retry/spawn decision is made **per-run**:

1. `packages/adapters/.../server/parse.ts:301` + `execute.ts:697` — classify credit-exhaustion
   as **transient** (retryable), not as a hard stop.
2. `server/src/services/recovery/service.ts` (dist recovery/service.js:61-96) —
   `TRANSIENT_INFRA_CONTINUATION_ERROR_CODES` **includes `claude_transient_upstream`** →
   `classifyContinuationFailure` returns `transient_infra` = up to **3 retries** per issue.
3. `server/src/services/heartbeat.ts` — `scheduleBoundedRetryForRun` (dist heartbeat.js:4493)
   re-queues each failed run (honoring `retryNotBefore` for that one run only).
4. **The real amplifier:** every spawn source keeps creating *fresh* runs on the dead account —
   `enqueueWakeup` (dist heartbeat.js:7788) is called by timers, assignment wakeups,
   `recoveryService`, and `productivityReviewService`, and `claimQueuedRun` (dist
   heartbeat.js:5075) promotes them to `running` and invokes the adapter. Nothing consults the
   fact that the account is exhausted. Each doomed run creates an `agent_task_sessions` row and
   stamps the issue execution lock (dist heartbeat.js:5181-5194) → **dozens of zombie sessions +
   orphaned locks** (exactly the CAS-1543/CAS-1542 symptom).

Root cause in one line: **credit-exhaustion is treated as a per-run transient with no
company/provider circuit-breaker, so N issues × M triggers fan out N×M doomed spawns against one
exhausted Anthropic account.**

## (c) Fix — provider credit circuit-breaker

New `server/src/services/credit-breaker.ts` (module-level singleton, keyed by
`companyId::provider`). See `credit-breaker.ts`, `credit-breaker.test.ts`, `integration.patch.md`.

- **Open** on finalize when `errorFamily === "transient_upstream" && retryNotBefore` →
  `openUntil = retryNotBefore` (respect provider reset); if no reset, safe exponential backoff
  (1h → cap 24h). (heartbeat.ts finalize, dist ~7086)
- **Suppress at source** in `enqueueWakeup` next to the budget gate → `writeSkippedRequest`, no
  run/session/lock created. Covers timers, assignments, recovery, productivity fanout.
- **Defensive defer** in `claimQueuedRun` → already-queued runs go to `scheduled_retry` at the
  reset instant (auto-resume via `promoteDueScheduledRetries`); no lock/session leak.
- **Auto-heal / clear** — breaker deletes itself at `openUntil`; any successful run clears it.

Design lenses: *Determinism & state authority* (one owner of "are credits gone?"),
*Blast radius* (breaker only suppresses spawns; never destructive to issues),
*Reversibility* (auto-closes at reset; no schema migration / one-way door),
*Boring where it counts* (mirrors the existing `budgets.getInvocationBlock` gate).

Known tradeoff: in-memory state resets on server restart; the first queued run on a still-dead
account re-opens the breaker after ≤ a couple doomed runs (self-heals). DB-backed persistence +
operator UI is a documented follow-up, not required for the fix.

## Landing
Land only via **platform-operator** (push creds + `npm` pkg upgrade + server restart) — same
constraint as CAS-1542. Neither CEO nor CTO agent has push creds. Declared as a board/operator
blocker; escalate through the CAS-1536 board channel.
