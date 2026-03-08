/**
 * Concurrency-limited request queue with rate limiting.
 * Prevents overwhelming the Saleor API during SSR page generation.
 *
 * Configurable via environment variables:
 * - SALEOR_MAX_CONCURRENT_REQUESTS (default: 3)
 * - SALEOR_MIN_REQUEST_DELAY_MS (default: 200)
 *
 * Adapted from upstream saleor/storefront.
 */

type QueueEntry = {
	execute: () => void;
};

export class RequestQueue {
	private queue: QueueEntry[] = [];
	private activeCount = 0;
	private lastRequestTime = 0;

	constructor(
		private readonly maxConcurrent: number = 3,
		private readonly minDelayMs: number = 200,
	) {}

	async enqueue<T>(fn: () => Promise<T>): Promise<T> {
		// Reserve slot synchronously or wait for one
		await this.acquireSlot();

		try {
			// Enforce minimum delay between requests
			const now = Date.now();
			const elapsed = now - this.lastRequestTime;
			if (elapsed < this.minDelayMs) {
				await sleep(this.minDelayMs - elapsed);
			}
			this.lastRequestTime = Date.now();

			return await fn();
		} finally {
			this.activeCount--;
			this.processQueue();
		}
	}

	private acquireSlot(): Promise<void> {
		if (this.activeCount < this.maxConcurrent) {
			// Reserve synchronously — prevents race between concurrent callers
			this.activeCount++;
			return Promise.resolve();
		}

		return new Promise<void>((resolve) => {
			this.queue.push({
				execute: () => {
					this.activeCount++;
					resolve();
				},
			});
		});
	}

	private processQueue(): void {
		if (this.queue.length > 0 && this.activeCount < this.maxConcurrent) {
			const next = this.queue.shift();
			next?.execute();
		}
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Module-level singleton — shared across all server-side GraphQL calls
const maxConcurrent = parseInt(process.env.SALEOR_MAX_CONCURRENT_REQUESTS || "3", 10);
const minDelay = parseInt(process.env.SALEOR_MIN_REQUEST_DELAY_MS || "200", 10);

export const requestQueue = new RequestQueue(maxConcurrent, minDelay);
