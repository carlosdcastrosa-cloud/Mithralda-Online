# CAS-1544 — Credit circuit-breaker integration hunks

Target repo: **paperclip monorepo** (`@paperclipai/server`), pkg `paperclipai@2026.609.0`.
Anchors are the exported TS symbols; dist line numbers cite the shipped build for evidence.
Lands via **platform-operator** only (same as CAS-1542): push creds + `npm` pkg upgrade + server restart.

New file: `server/src/services/credit-breaker.ts` (see `credit-breaker.ts` in this dir).
New test: `server/src/services/credit-breaker.test.ts` (see `credit-breaker.test.ts`).

All four hunks below live in `server/src/services/heartbeat.ts` and mirror the existing
`budgets.getInvocationBlock(...)` gate pattern already used at the same call sites.

---

## Hunk 0 — import the breaker (top of heartbeat.ts, next to `import { budgetService } from "./budgets.js";`, dist heartbeat.js:20)

```ts
import {
  clearCreditBreaker,
  getOpenCreditBreaker,
  providerSlugForAdapterType,
  recordCreditExhaustion,
} from "./credit-breaker.js";
```

---

## Hunk 1 — OPEN the breaker at run finalization
Function: run finalization block (dist heartbeat.js ~7086–7112), right after `persistedRun`/`finalizedRun`
is computed and `errorFamily`/`retryNotBefore` are persisted from `adapterResult`.

```ts
// After: const finalizedRun = persistedRun ?? (await getRun(run.id));
if (finalizedRun && outcome !== "succeeded") {
  const provider = providerSlugForAdapterType(agent.adapterType);
  const family = adapterResult.errorFamily ?? null;
  const retryNotBefore = adapterResult.retryNotBefore
    ? new Date(adapterResult.retryNotBefore)
    : null;
  // Only credit / usage-quota exhaustion (transient_upstream WITH a reset instant)
  // opens the account breaker. Pure overload (503/529, no reset) keeps the existing
  // bounded per-run retry and must NOT open a company-wide breaker.
  if (family === "transient_upstream" && retryNotBefore) {
    recordCreditExhaustion({
      companyId: finalizedRun.companyId,
      provider,
      resetAt: retryNotBefore,
      reason: "provider_credits_exhausted",
      evidence: readNonEmptyString(finalizedRun.error) ?? readNonEmptyString(finalizedRun.errorCode),
    });
  }
}
if (finalizedRun && outcome === "succeeded") {
  clearCreditBreaker(finalizedRun.companyId, providerSlugForAdapterType(agent.adapterType));
}
```

---

## Hunk 2 — SUPPRESS spawn at the source (`enqueueWakeup`, dist heartbeat.js ~7890)
Add right after the existing `budgetBlock` gate. Covers ALL fan-out sources — timers,
assignment wakeups, `recoveryService`, and `productivityReviewService` all route through
`enqueueWakeup`. No wakeup request / queued run / session is created while open, which is
exactly what stops the `agent_task_sessions` + lock accumulation (CAS-1542 items 1 & 2).

```ts
const creditBreaker = getOpenCreditBreaker(agent.companyId, providerSlugForAdapterType(agent.adapterType));
if (creditBreaker) {
  if (opts.requestedByActorType === "user") {
    // A human explicitly poking the agent still gets a clear, actionable error.
    throw conflict("Provider credits are exhausted; runs are paused until reset", {
      provider: creditBreaker.provider,
      openUntil: creditBreaker.openUntil,
      resetAt: creditBreaker.resetAt,
    });
  }
  await writeSkippedRequest("provider.credits_exhausted", {
    error: `Wake suppressed until ${creditBreaker.openUntil}: ${creditBreaker.provider} credits exhausted`,
  });
  return null;
}
```

---

## Hunk 3 — DEFENSIVE choke at claim time (`claimQueuedRun`, dist heartbeat.js ~5091)
Any run already queued before the breaker opened is deferred cleanly instead of spawning a
doomed session. Add right after the existing `budgetBlock` gate. `executionRunId`/locks are
only stamped AFTER a successful claim (dist heartbeat.js ~5181), so deferring here leaks no
lock or session. We re-queue to `scheduled_retry` at the reset instant so it auto-resumes via
`promoteDueScheduledRetries` — no external re-trigger needed.

```ts
const claimBreaker = getOpenCreditBreaker(run.companyId, providerSlugForAdapterType(agent.adapterType));
if (claimBreaker) {
  const now = new Date();
  const dueAt = new Date(Math.max(new Date(claimBreaker.openUntil).getTime(), now.getTime()));
  await setRunStatus(run.id, "scheduled_retry", {
    scheduledRetryAt: dueAt,
    scheduledRetryAttempt: (run.scheduledRetryAttempt ?? 0) + 1,
    error: `Deferred until ${dueAt.toISOString()}: ${claimBreaker.provider} credits exhausted`,
    errorCode: "provider_credits_exhausted",
  });
  await appendRunEvent(run, await nextRunEventSeq(run.id), {
    eventType: "lifecycle",
    stream: "system",
    level: "warn",
    message: `Run deferred by credit circuit-breaker until ${dueAt.toISOString()}`,
    payload: { provider: claimBreaker.provider, openUntil: claimBreaker.openUntil, resetAt: claimBreaker.resetAt },
  });
  return null;
}
```

> Note: if `setRunStatus` does not accept `scheduledRetryAt`/`scheduledRetryAttempt` in the
> target build, use the same update shape as `scheduleBoundedRetryForRun` (dist ~4749) which
> already writes `status: "scheduled_retry"` with those columns. The breaker value here is the
> *gate*; the deferral mechanism can reuse whatever `scheduled_retry` writer exists.

---

## Non-retryable classification (recovery service) — optional hardening
`server/src/services/recovery/service.ts` (dist recovery/service.js:67-96) classifies
`claude_transient_upstream` as `transient_infra` (3 retries). With Hunks 2 & 3 the account-level
breaker already suppresses these before they spawn, so this is optional. If desired, add a
dedicated `provider_credits_exhausted` errorCode to `NON_RETRYABLE_CONTINUATION_ERROR_CODES`
so a credit-exhausted continuation is not counted as a per-issue transient retry either.

## Verification path
- `credit-breaker.test.ts` (vitest) covers open/heal/backoff/cap/reset-wins/clear/isolation.
- Proven locally against pkg-shipped `tsx`: 8/8 assertion groups pass.
- Integration hunks are compile-checkable once applied; QA can then confirm behavior with a
  forced usage-limit stub (adapter returns errorFamily transient_upstream + retryNotBefore).
