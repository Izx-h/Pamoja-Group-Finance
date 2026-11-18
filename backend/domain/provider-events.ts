const RETRYABLE_PROVIDER_EVENT_STATES = new Set(["received", "verification_failed"]);

export function isRetryableProviderEvent(status: string): boolean {
  return RETRYABLE_PROVIDER_EVENT_STATES.has(status);
}
