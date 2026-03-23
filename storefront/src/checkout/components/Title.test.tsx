import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Title } from "./Title";

describe("Title component", () => {
	it("renders children text", () => {
		render(<Title>Shipping Address</Title>);
		expect(screen.getByText("Shipping Address")).toBeInTheDocument();
	});

	it("applies font-bold class", () => {
		render(<Title>Test</Title>);
		expect(screen.getByText("Test")).toHaveClass("font-bold");
	});

	it("applies custom className", () => {
		render(<Title className="text-lg">Test</Title>);
		const el = screen.getByText("Test");
		expect(el).toHaveClass("text-lg");
		expect(el).toHaveClass("font-bold");
	});

	it("renders as a p element", () => {
		render(<Title>Test</Title>);
		expect(screen.getByText("Test").tagName).toBe("P");
	});
});
