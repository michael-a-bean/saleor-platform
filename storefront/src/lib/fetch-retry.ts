/**
 * Retry wrapper for fetch requests with exponential backoff.
 * Retries on network errors and transient server failures (408, 429, 5xx).
 *
 * Adapted from upstream saleor/storefront.
 */
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

interface RetryOptions {
	/** Maximum number of retries (default: 2) */
	maxRetries?: number;
	/** Base delay in ms, doubles on each retry (default: 500) */
	baseDelay?: number;
}

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Check if a GraphQL request body contains a mutation (not safe to retry). */
function isMutation(init?: RequestInit): boolean {
	if (!init?.body || typeof init.body !== "string") return false;
	try {
		const parsed = JSON.parse(init.body) as { query?: string };
		return typeof parsed.query === "string" && parsed.query.trimStart().startsWith("mutation");
	} catch {
		return false;
	}
}

/** Wrap fetch with automatic retry for transient failures (network errors, 5xx).
 *  Mutations are never retried to prevent duplicate side effects. */
export function withRetry(
	baseFetch: FetchFn,
	{ maxRetries = 2, baseDelay = 500 }: RetryOptions = {},
): FetchFn {
	return async (input, init) => {
		// Never retry mutations — they may have already been applied server-side
		const effectiveRetries = isMutation(init) ? 0 : maxRetries;
		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= effectiveRetries; attempt++) {
			try {
				const response = await baseFetch(input, init);

				if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < effectiveRetries) {
					await sleep(baseDelay * Math.pow(2, attempt));
					continue;
				}

				return response;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				if (attempt < effectiveRetries) {
					await sleep(baseDelay * Math.pow(2, attempt));
					continue;
				}
			}
		}

		throw lastError ?? new Error("Fetch failed after retries");
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
