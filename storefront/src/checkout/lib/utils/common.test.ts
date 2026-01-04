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
		it("validates standard email", async () => {
			expect(await isValidEmail("user@example.com")).toBe(true);
		});

		it("validates email with subdomain", async () => {
			expect(await isValidEmail("user@mail.example.com")).toBe(true);
		});

		it("validates email with dots in local part", async () => {
			expect(await isValidEmail("first.last@example.com")).toBe(true);
		});

		it("validates email with plus sign", async () => {
			expect(await isValidEmail("user+tag@example.com")).toBe(true);
		});

		it("validates email with numbers", async () => {
			expect(await isValidEmail("user123@example.com")).toBe(true);
		});

		it("validates email with hyphens in domain", async () => {
			expect(await isValidEmail("user@my-domain.com")).toBe(true);
		});
	});

	describe("invalid emails", () => {
		it("rejects empty string", async () => {
			expect(await isValidEmail("")).toBe(false);
		});

		it("rejects email without @", async () => {
			expect(await isValidEmail("userexample.com")).toBe(false);
		});

		it("rejects email without domain", async () => {
			expect(await isValidEmail("user@")).toBe(false);
		});

		it("rejects email without local part", async () => {
			expect(await isValidEmail("@example.com")).toBe(false);
		});

		it("rejects email with spaces", async () => {
			expect(await isValidEmail("user @example.com")).toBe(false);
		});

		it("rejects email with multiple @", async () => {
			expect(await isValidEmail("user@@example.com")).toBe(false);
		});

		it("rejects plain text", async () => {
			expect(await isValidEmail("not an email")).toBe(false);
		});

		it("rejects email without TLD", async () => {
			expect(await isValidEmail("user@localhost")).toBe(false);
		});
	});
});
