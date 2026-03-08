import { describe, it, expect } from "vitest";
import { RequestQueue } from "./request-queue";

describe("RequestQueue", () => {
	it("executes a single request immediately", async () => {
		const queue = new RequestQueue(3, 0);
		const result = await queue.enqueue(() => Promise.resolve("ok"));
		expect(result).toBe("ok");
	});

	it("limits concurrent requests to maxConcurrent", async () => {
		const queue = new RequestQueue(2, 0);
		let activeConcurrent = 0;
		let maxObserved = 0;

		const makeRequest = () =>
			queue.enqueue(async () => {
				activeConcurrent++;
				maxObserved = Math.max(maxObserved, activeConcurrent);
				await new Promise((r) => setTimeout(r, 50));
				activeConcurrent--;
				return "done";
			});

		await Promise.all([makeRequest(), makeRequest(), makeRequest(), makeRequest()]);

		expect(maxObserved).toBeLessThanOrEqual(2);
	});

	it("propagates errors from enqueued functions", async () => {
		const queue = new RequestQueue(3, 0);

		await expect(
			queue.enqueue(() => Promise.reject(new Error("boom"))),
		).rejects.toThrow("boom");
	});

	it("continues processing after an error", async () => {
		const queue = new RequestQueue(1, 0);

		await expect(
			queue.enqueue(() => Promise.reject(new Error("fail"))),
		).rejects.toThrow("fail");

		const result = await queue.enqueue(() => Promise.resolve("recovered"));
		expect(result).toBe("recovered");
	});

	it("enforces minimum delay between requests", async () => {
		const minDelay = 100;
		const queue = new RequestQueue(3, minDelay);
		const timestamps: number[] = [];

		const makeRequest = () =>
			queue.enqueue(async () => {
				timestamps.push(Date.now());
				return "done";
			});

		// Run sequentially to measure delay
		await makeRequest();
		await makeRequest();
		await makeRequest();

		for (let i = 1; i < timestamps.length; i++) {
			const gap = timestamps[i] - timestamps[i - 1];
			// Allow 20ms tolerance for timer imprecision
			expect(gap).toBeGreaterThanOrEqual(minDelay - 20);
		}
	});
});
