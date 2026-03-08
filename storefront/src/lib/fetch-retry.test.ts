import { describe, it, expect, vi } from "vitest";
import { withRetry } from "./fetch-retry";

function mockResponse(status: number): Response {
	return new Response(null, { status, statusText: `Status ${status}` });
}

describe("withRetry", () => {
	it("returns response on success", async () => {
		const baseFetch = vi.fn().mockResolvedValue(mockResponse(200));
		const fetch = withRetry(baseFetch);

		const response = await fetch("https://api.example.com");

		expect(response.status).toBe(200);
		expect(baseFetch).toHaveBeenCalledTimes(1);
	});

	it("retries on 500 and succeeds on second attempt", async () => {
		const baseFetch = vi
			.fn()
			.mockResolvedValueOnce(mockResponse(500))
			.mockResolvedValueOnce(mockResponse(200));

		const fetch = withRetry(baseFetch, { baseDelay: 1 });
		const response = await fetch("https://api.example.com");

		expect(response.status).toBe(200);
		expect(baseFetch).toHaveBeenCalledTimes(2);
	});

	it("retries on 429 (rate limit)", async () => {
		const baseFetch = vi
			.fn()
			.mockResolvedValueOnce(mockResponse(429))
			.mockResolvedValueOnce(mockResponse(200));

		const fetch = withRetry(baseFetch, { baseDelay: 1 });
		const response = await fetch("https://api.example.com");

		expect(response.status).toBe(200);
		expect(baseFetch).toHaveBeenCalledTimes(2);
	});

	it("returns error response after exhausting retries", async () => {
		const baseFetch = vi.fn().mockResolvedValue(mockResponse(503));

		const fetch = withRetry(baseFetch, { maxRetries: 2, baseDelay: 1 });
		const response = await fetch("https://api.example.com");

		expect(response.status).toBe(503);
		expect(baseFetch).toHaveBeenCalledTimes(3); // initial + 2 retries
	});

	it("retries on network error and succeeds", async () => {
		const baseFetch = vi
			.fn()
			.mockRejectedValueOnce(new Error("ECONNREFUSED"))
			.mockResolvedValueOnce(mockResponse(200));

		const fetch = withRetry(baseFetch, { baseDelay: 1 });
		const response = await fetch("https://api.example.com");

		expect(response.status).toBe(200);
		expect(baseFetch).toHaveBeenCalledTimes(2);
	});

	it("throws after exhausting retries on network error", async () => {
		const baseFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

		const fetch = withRetry(baseFetch, { maxRetries: 1, baseDelay: 1 });

		await expect(fetch("https://api.example.com")).rejects.toThrow("ECONNREFUSED");
		expect(baseFetch).toHaveBeenCalledTimes(2);
	});

	it("does not retry on 400 (client error)", async () => {
		const baseFetch = vi.fn().mockResolvedValue(mockResponse(400));

		const fetch = withRetry(baseFetch, { baseDelay: 1 });
		const response = await fetch("https://api.example.com");

		expect(response.status).toBe(400);
		expect(baseFetch).toHaveBeenCalledTimes(1);
	});

	it("does not retry on 404", async () => {
		const baseFetch = vi.fn().mockResolvedValue(mockResponse(404));

		const fetch = withRetry(baseFetch, { baseDelay: 1 });
		const response = await fetch("https://api.example.com");

		expect(response.status).toBe(404);
		expect(baseFetch).toHaveBeenCalledTimes(1);
	});
});
