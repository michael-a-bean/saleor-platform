import { describe, it, expect } from "vitest";
import { extractMutationData, extractMutationErrors } from "./utils";

describe("extractMutationData", () => {
	it("extracts data from successful mutation result", () => {
		const result = {
			data: {
				checkoutCreate: { id: "checkout-1", lines: [] },
			},
		};
		const extracted = extractMutationData(result as any);
		expect(extracted.success).toBe(true);
		expect(extracted.data).toEqual({ id: "checkout-1", lines: [] });
	});

	it("returns failure for null data", () => {
		const result = { data: null };
		const extracted = extractMutationData(result as any);
		expect(extracted.success).toBe(false);
		expect(extracted.data).toBeNull();
	});

	it("returns failure for undefined data", () => {
		const result = { data: undefined };
		const extracted = extractMutationData(result as any);
		expect(extracted.success).toBe(false);
		expect(extracted.data).toBeNull();
	});

	it("ignores __typename key and extracts first real key", () => {
		const result = {
			data: {
				__typename: "Mutation",
				checkoutLinesAdd: { checkout: { id: "c1" } },
			},
		};
		const extracted = extractMutationData(result as any);
		expect(extracted.success).toBe(true);
		expect(extracted.data).toEqual({ checkout: { id: "c1" } });
	});

	it("returns failure when mutation key value is null", () => {
		const result = {
			data: {
				checkoutCreate: null,
			},
		};
		const extracted = extractMutationData(result as any);
		expect(extracted.success).toBe(false);
		expect(extracted.data).toBeNull();
	});
});

describe("extractMutationErrors", () => {
	it("returns no errors for clean result", () => {
		const result = {
			data: {
				checkoutCreate: { errors: [] },
			},
			error: undefined,
		};
		const errors = extractMutationErrors(result as any);
		expect(errors.hasErrors).toBe(false);
		expect(errors.apiErrors).toEqual([]);
		expect(errors.graphqlErrors).toEqual([]);
	});

	it("extracts API errors from mutation result", () => {
		const apiError = { field: "email", code: "INVALID", message: "Invalid email" };
		const result = {
			data: {
				checkoutEmailUpdate: { errors: [apiError] },
			},
			error: undefined,
		};
		const errors = extractMutationErrors(result as any);
		expect(errors.hasErrors).toBe(true);
		expect(errors.apiErrors).toEqual([apiError]);
	});

	it("extracts GraphQL errors from result.error", () => {
		const graphqlError = { message: "Network error" };
		const result = {
			data: null,
			error: graphqlError,
		};
		const errors = extractMutationErrors(result as any);
		expect(errors.hasErrors).toBe(true);
		expect(errors.graphqlErrors).toEqual([graphqlError]);
	});

	it("handles custom error extractor", () => {
		const result = {
			data: {
				checkoutCreate: { errors: [] },
			},
			error: undefined,
		};
		const customExtractor = () => [{ message: "Custom validation failed" }];
		const errors = extractMutationErrors(result as any, customExtractor);
		expect(errors.hasErrors).toBe(true);
		expect(errors.customErrors).toEqual([{ message: "Custom validation failed" }]);
	});

	it("handles null data gracefully", () => {
		const result = { data: null, error: undefined };
		const errors = extractMutationErrors(result as any);
		expect(errors.hasErrors).toBe(false);
		expect(errors.apiErrors).toEqual([]);
	});

	it("combines API and GraphQL errors", () => {
		const apiError = { field: "email", code: "REQUIRED", message: "Required" };
		const graphqlError = { message: "Unauthorized" };
		const result = {
			data: {
				checkoutEmailUpdate: { errors: [apiError] },
			},
			error: graphqlError,
		};
		const errors = extractMutationErrors(result as any);
		expect(errors.hasErrors).toBe(true);
		expect(errors.apiErrors).toEqual([apiError]);
		expect(errors.graphqlErrors).toEqual([graphqlError]);
	});
});
