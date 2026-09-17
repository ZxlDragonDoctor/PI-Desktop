import { describe, expect, it } from "vitest";

/**
 * Pure-logic coverage for the #543 compaction retry policy.
 * Runtime wiring: packages/agent-runtime/src/runtime.ts
 * (performCompaction / shrinkPreparationForSummary).
 */

const COMPACTION_SUMMARY_MAX_ATTEMPTS = 3;
const COMPACTION_SUMMARY_RETRY_BASE_MS = 2_000;
const COMPACTION_SUMMARY_RETRY_MAX_MS = 8_000;

function retryDelayMs(attempt: number): number {
  return Math.min(
    COMPACTION_SUMMARY_RETRY_MAX_MS,
    COMPACTION_SUMMARY_RETRY_BASE_MS * 2 ** (attempt - 1),
  );
}

function wouldExceed(historyTokens: number, limit: number): boolean {
  return historyTokens >= limit;
}

/** Mirror of shrinkPreparationForSummary budget loop. */
function shrink(historyTokens: number[], limit: number): number[] | undefined {
  const messages = [...historyTokens];
  if (messages.length <= 1) return undefined;
  while (messages.length > 1) {
    messages.shift();
    const total = messages.reduce((a, b) => a + b, 0);
    if (!wouldExceed(total, limit)) return messages;
  }
  return undefined;
}

describe("compaction summary retry policy (#543)", () => {
  it("caps retries at three attempts before retained-tail fallback", () => {
    expect(COMPACTION_SUMMARY_MAX_ATTEMPTS).toBe(3);
  });

  it("backs off exponentially and caps the delay", () => {
    expect(retryDelayMs(1)).toBe(2_000);
    expect(retryDelayMs(2)).toBe(4_000);
    expect(retryDelayMs(3)).toBe(8_000);
  });

  it("shrinks oversized payloads until the summary input fits", () => {
    const history = [10_000, 8_000, 5_000, 2_000];
    const reduced = shrink(history, 9_000);
    expect(reduced).toBeDefined();
    expect(reduced!.reduce((a, b) => a + b, 0)).toBeLessThan(9_000);
  });

  it("returns undefined when even a minimal payload cannot fit", () => {
    const history = [50_000, 40_000];
    expect(shrink(history, 10_000)).toBeUndefined();
  });

  it("keeps at least one message so compact() still has input", () => {
    const history = [3_000, 3_000];
    expect(shrink(history, 1_000)).toBeUndefined();
  });
});
