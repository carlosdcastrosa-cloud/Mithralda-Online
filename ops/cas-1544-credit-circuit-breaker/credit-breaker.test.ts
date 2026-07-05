// server/src/services/credit-breaker.test.ts
//
// CAS-1544 — unit test for the provider credit / usage-quota circuit-breaker.
// Runs under vitest. Uses the project convention (describe/it/expect + beforeEach).
// Pure logic, no DB harness required.

import { beforeEach, describe, expect, it } from "vitest";
import {
  __creditBreakerStoreForTests,
  clearCreditBreaker,
  getOpenCreditBreaker,
  providerSlugForAdapterType,
  recordCreditExhaustion,
} from "./credit-breaker.js";

const COMPANY = "company-1";
const PROVIDER = "anthropic";

beforeEach(() => {
  __creditBreakerStoreForTests().clear();
});

describe("credit circuit-breaker", () => {
  it("is closed by default", () => {
    expect(getOpenCreditBreaker(COMPANY, PROVIDER)).toBeNull();
  });

  it("opens until the provider-supplied reset instant when one is known", () => {
    const now = new Date("2026-07-05T12:00:00.000Z");
    const resetAt = new Date("2026-07-05T15:00:00.000Z");
    const state = recordCreditExhaustion({ companyId: COMPANY, provider: PROVIDER, resetAt, now });
    expect(state.openUntil).toBe(resetAt.toISOString());
    expect(state.resetAt).toBe(resetAt.toISOString());

    // Still open one minute before reset...
    const beforeReset = new Date("2026-07-05T14:59:00.000Z");
    expect(getOpenCreditBreaker(COMPANY, PROVIDER, beforeReset)).not.toBeNull();
    // ...and auto-heals exactly at/after reset.
    const afterReset = new Date("2026-07-05T15:00:00.000Z");
    expect(getOpenCreditBreaker(COMPANY, PROVIDER, afterReset)).toBeNull();
  });

  it("falls back to a safe capped backoff when no reset time is available", () => {
    const now = new Date("2026-07-05T12:00:00.000Z");
    const state = recordCreditExhaustion({ companyId: COMPANY, provider: PROVIDER, resetAt: null, now });
    const openMs = new Date(state.openUntil).getTime() - now.getTime();
    // First hit → 1h default backoff.
    expect(openMs).toBe(60 * 60 * 1000);
    expect(state.resetAt).toBeNull();
  });

  it("backs off exponentially (capped) on repeated hits within one window", () => {
    const now = new Date("2026-07-05T12:00:00.000Z");
    const first = recordCreditExhaustion({ companyId: COMPANY, provider: PROVIDER, resetAt: null, now });
    // Second hit while still open → 2h.
    const t2 = new Date("2026-07-05T12:30:00.000Z");
    const second = recordCreditExhaustion({ companyId: COMPANY, provider: PROVIDER, resetAt: null, now: t2 });
    expect(second.consecutiveHits).toBe(2);
    expect(new Date(second.openUntil).getTime() - t2.getTime()).toBe(2 * 60 * 60 * 1000);
    // openedAt is preserved across the same window.
    expect(second.openedAt).toBe(first.openedAt);

    // A late hit is capped at 24h.
    let last = second;
    let clock = t2;
    for (let i = 0; i < 10; i += 1) {
      clock = new Date(clock.getTime() + 60_000);
      last = recordCreditExhaustion({ companyId: COMPANY, provider: PROVIDER, resetAt: null, now: clock });
    }
    expect(new Date(last.openUntil).getTime() - clock.getTime()).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  it("a provider reset instant always wins over backoff even on repeated hits", () => {
    const now = new Date("2026-07-05T12:00:00.000Z");
    recordCreditExhaustion({ companyId: COMPANY, provider: PROVIDER, resetAt: null, now });
    const resetAt = new Date("2026-07-05T13:10:00.000Z");
    const state = recordCreditExhaustion({ companyId: COMPANY, provider: PROVIDER, resetAt, now });
    expect(state.openUntil).toBe(resetAt.toISOString());
  });

  it("clears explicitly on a successful run", () => {
    const now = new Date("2026-07-05T12:00:00.000Z");
    recordCreditExhaustion({ companyId: COMPANY, provider: PROVIDER, resetAt: null, now });
    expect(getOpenCreditBreaker(COMPANY, PROVIDER, now)).not.toBeNull();
    clearCreditBreaker(COMPANY, PROVIDER);
    expect(getOpenCreditBreaker(COMPANY, PROVIDER, now)).toBeNull();
  });

  it("is isolated per (company, provider)", () => {
    const now = new Date("2026-07-05T12:00:00.000Z");
    recordCreditExhaustion({ companyId: COMPANY, provider: PROVIDER, resetAt: null, now });
    // Different company is unaffected.
    expect(getOpenCreditBreaker("company-2", PROVIDER, now)).toBeNull();
    // Different provider on same company is unaffected.
    expect(getOpenCreditBreaker(COMPANY, "openai", now)).toBeNull();
  });

  it("maps adapter types to provider slugs", () => {
    expect(providerSlugForAdapterType("claude_local")).toBe("anthropic");
    expect(providerSlugForAdapterType("codex_local")).toBe("openai");
    expect(providerSlugForAdapterType("http")).toBe("http");
    expect(providerSlugForAdapterType(null)).toBe("unknown");
  });
});
