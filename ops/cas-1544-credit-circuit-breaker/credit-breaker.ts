// server/src/services/credit-breaker.ts
//
// CAS-1544 — Provider credit / usage-quota circuit-breaker.
//
// When the Anthropic (or any provider) account runs OUT OF CREDITS / hits a usage
// cap, every Claude CLI run fails fast with an `errorFamily: "transient_upstream"`
// result (see packages/adapters/adapter-claude-local/src/server/parse.ts —
// CLAUDE_TRANSIENT_UPSTREAM_RE). The per-run bounded retry in heartbeat.ts
// (scheduleBoundedRetryForRun) handles a *single* run correctly, but nothing at the
// company/provider scope stops the *fan-out*: timers, assignment wakeups, recovery
// scans and productivity fanout each keep spawning fresh runs that immediately die
// on the same exhausted account — producing the "decenas de sesiones zombie" and the
// orphaned agent_task_sessions / execution locks reported in CAS-1543 / CAS-1542.
//
// This module holds a process-wide breaker keyed by (companyId, provider). It is a
// module-level singleton on purpose: heartbeatService() is constructed many times
// (once per route handler), so per-instance state would fragment. The breaker must be
// shared across every construction in the process. It is intentionally in-memory:
// on a server restart the first queued run on a still-exhausted account re-opens the
// breaker after at most a couple of doomed runs, so the state self-heals. A DB-backed
// table is a documented follow-up (operator visibility / cross-restart durability).
//
// Design lenses: Determinism & state authority (single owner of "are credits gone?"),
// Blast radius (breaker only *suppresses* spawns — it never mutates issues destructively),
// Reversibility (auto-closes at reset; no migration / one-way door).

export interface CreditBreakerState {
  companyId: string;
  provider: string;
  /** ISO — when the breaker first opened for this outage window. */
  openedAt: string;
  /** ISO — do NOT spawn new runs for (companyId, provider) before this instant. */
  openUntil: string;
  /** ISO reset time parsed from the adapter's retryNotBefore, when known. */
  resetAt: string | null;
  reason: string;
  evidence: string | null;
  /** Consecutive exhaustion hits within one open window (drives backoff when no reset). */
  consecutiveHits: number;
}

export interface RecordCreditExhaustionInput {
  companyId: string;
  provider: string;
  /** Parsed adapterResult.retryNotBefore (the credit/usage-limit reset instant). */
  resetAt?: Date | null;
  reason?: string;
  evidence?: string | null;
  now?: Date;
}

// Backoff used only when the provider gave us NO reset time (raw "credit balance too
// low" billing errors have no hourly reset). Exponential on repeated hits, capped, so
// we never hammer nor sleep forever.
const DEFAULT_BACKOFF_MS = 60 * 60 * 1000; // 1h
const MIN_BACKOFF_MS = 5 * 60 * 1000; // 5m
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000; // 24h cap

// Module-level singleton — shared across all heartbeatService() constructions.
const store = new Map<string, CreditBreakerState>();

function key(companyId: string, provider: string): string {
  return `${companyId}::${provider}`;
}

/** Map an adapterType to the provider/account slug the breaker is keyed on. */
export function providerSlugForAdapterType(adapterType: string | null | undefined): string {
  switch (adapterType) {
    case "claude_local":
      return "anthropic";
    case "codex_local":
      return "openai";
    default:
      return adapterType ?? "unknown";
  }
}

/**
 * Open (or extend) the breaker for (companyId, provider). Called from run
 * finalization when a run fails with errorFamily === "transient_upstream" AND a
 * credit/usage-limit reset was detected (retryNotBefore present). Overload-only
 * transients (503/529, no reset) deliberately do NOT open the account breaker —
 * those stay on the existing bounded per-run retry.
 */
export function recordCreditExhaustion(input: RecordCreditExhaustionInput): CreditBreakerState {
  const now = input.now ?? new Date();
  const k = key(input.companyId, input.provider);
  const prev = store.get(k);
  const stillOpen = prev != null && new Date(prev.openUntil).getTime() > now.getTime();
  const consecutiveHits = (stillOpen ? prev!.consecutiveHits : 0) + 1;

  let openUntilMs: number;
  if (input.resetAt && input.resetAt.getTime() > now.getTime()) {
    // Respect the provider-supplied reset instant.
    openUntilMs = input.resetAt.getTime();
  } else {
    // No usable reset → safe exponential backoff, capped.
    const backoff = Math.min(
      MAX_BACKOFF_MS,
      Math.max(MIN_BACKOFF_MS, DEFAULT_BACKOFF_MS * 2 ** (consecutiveHits - 1)),
    );
    openUntilMs = now.getTime() + backoff;
  }

  const state: CreditBreakerState = {
    companyId: input.companyId,
    provider: input.provider,
    openedAt: stillOpen ? prev!.openedAt : now.toISOString(),
    openUntil: new Date(openUntilMs).toISOString(),
    resetAt: input.resetAt ? input.resetAt.toISOString() : (prev?.resetAt ?? null),
    reason: input.reason ?? "provider_credits_exhausted",
    evidence: input.evidence ?? prev?.evidence ?? null,
    consecutiveHits,
  };
  store.set(k, state);
  return state;
}

/**
 * Return the OPEN breaker for (companyId, provider), or null if none / already
 * elapsed. Auto-heals: an elapsed breaker is deleted on read so normal spawning
 * resumes at the reset instant with no external trigger.
 */
export function getOpenCreditBreaker(
  companyId: string,
  provider: string,
  now: Date = new Date(),
): CreditBreakerState | null {
  const k = key(companyId, provider);
  const state = store.get(k);
  if (!state) return null;
  if (new Date(state.openUntil).getTime() <= now.getTime()) {
    store.delete(k);
    return null;
  }
  return state;
}

/** Explicitly clear the breaker — called on any successful run for the account. */
export function clearCreditBreaker(companyId: string, provider: string): void {
  store.delete(key(companyId, provider));
}

/** Test-only: inspect / reset the singleton store. */
export function __creditBreakerStoreForTests(): Map<string, CreditBreakerState> {
  return store;
}
