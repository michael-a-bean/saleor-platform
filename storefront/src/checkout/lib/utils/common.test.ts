import { describe, it, expect } from "vitest";
import { getById, getByUnmatchingId, isValidEmail } from "./common";

describe("getById", () => {
	const items = [{ id: "1", name: "Item 1" }, { id: "2", name: "Item 2" }, { id: "3", name: "Item 3" }];

	it("returns function that matches by id", () => {
		const matcher = getById("2");
		const result = items.find(matcher);
		expect(result).toEqual({ id: "2", name: "Item 2" });
	});

	it("returns undefined when id not found", () => {
		const matcher = getById("999");
		const result = items.find(matcher);
		expect(result).toBeUndefined();
	});

	it("handles undefined id to compare", () => {
		const matcher = getById(undefined);
		const result = items.find(matcher);
		expect(result).toBeUndefined();
	});

	it("filters array correctly", () => {
		const matcher = getById("1");
		const result = items.filter(matcher);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({ id: "1", name: "Item 1" });
	});

	it("works with custom id types", () => {
		type CustomId = "a" | "b" | "c";
		const customItems: { id: CustomId; value: number }[] = [
			{ id: "a", value: 1 },
			{ id: "b", value: 2 },
			{ id: "c", value: 3 },
		];
		const matcher = getById<CustomId>("b");
		const result = customItems.find(matcher);
		expect(result).toEqual({ id: "b", value: 2 });
	});
});

describe("getByUnmatchingId", () => {
	const items = [{ id: "1", name: "Item 1" }, { id: "2", name: "Item 2" }, { id: "3", name: "Item 3" }];

	it("returns items that do not match id", () => {
		const matcher = getByUnmatchingId("2");
		const result = items.filter(matcher);
		expect(result).toHaveLength(2);
		expect(result).toEqual([
			{ id: "1", name: "Item 1" },
			{ id: "3", name: "Item 3" },
		]);
	});

	it("returns all items when id not found", () => {
		const matcher = getByUnmatchingId("999");
		const result = items.filter(matcher);
		expect(result).toHaveLength(3);
	});

	it("handles undefined id - returns all items", () => {
		const matcher = getByUnmatchingId(undefined);
		const result = items.filter(matcher);
		expect(result).toHaveLength(3);
	});

	it("returns empty array when all items match", () => {
		const singleItem = [{ id: "1", name: "Only" }];
		const matcher = getByUnmatchingId("1");
		const result = singleItem.filter(matcher);
		expect(result).toHaveLength(0);
	});
});

describe("isValidEmail", () => {
	describe("valid emails", () => {
		it("validates standard email", () => {
			expect(isValidEmail("user@example.com")).toBe(true);
		});

		it("validates email with subdomain", () => {
			expect(isValidEmail("user@mail.example.com")).toBe(true);
		});

		it("validates email with dots in local part", () => {
			expect(isValidEmail("first.last@example.com")).toBe(true);
		});

		it("validates email with plus sign", () => {
			expect(isValidEmail("user+tag@example.com")).toBe(true);
		});

		it("validates email with numbers", () => {
			expect(isValidEmail("user123@example.com")).toBe(true);
		});

		it("validates email with hyphens in domain", () => {
			expect(isValidEmail("user@my-domain.com")).toBe(true);
		});
	});

	describe("invalid emails", () => {
		it("rejects empty string", () => {
			expect(isValidEmail("")).toBe(false);
		});

		it("rejects email without @", () => {
			expect(isValidEmail("userexample.com")).toBe(false);
		});

		it("rejects email without domain", () => {
			expect(isValidEmail("user@")).toBe(false);
		});

		it("rejects email without local part", () => {
			expect(isValidEmail("@example.com")).toBe(false);
		});

		it("rejects email with spaces", () => {
			expect(isValidEmail("user @example.com")).toBe(false);
		});

		it("rejects email with multiple @", () => {
			expect(isValidEmail("user@@example.com")).toBe(false);
		});

		it("rejects plain text", () => {
			expect(isValidEmail("not an email")).toBe(false);
		});

		it("rejects email without TLD", () => {
			expect(isValidEmail("user@localhost")).toBe(false);
		});
	});
});
