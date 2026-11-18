import { describe, expect, it } from "vitest";
import { isRetryableProviderEvent } from "./provider-events";

describe("provider event retry states", () => {
  it("allows retry for newly received and temporarily unverifiable events", () => {
    expect(isRetryableProviderEvent("received")).toBe(true);
    expect(isRetryableProviderEvent("verification_failed")).toBe(true);
  });

  it("does not retry terminal outcomes as new work", () => {
    for (const state of ["unmatched", "provider_failed", "review_required", "unknown_event", "verified_and_reconciled", "verified_unmatched", "duplicate_success", "duplicate_provider_transaction", "test_only_verified"]) {
      expect(isRetryableProviderEvent(state)).toBe(false);
    }
  });
});
