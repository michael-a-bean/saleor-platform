import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";

describe("Button component", () => {
	it("renders label text", () => {
		render(<Button label="Pay now" />);
		expect(screen.getByText("Pay now")).toBeInTheDocument();
	});

	it("renders label as ReactNode", () => {
		render(<Button label={<span data-testid="custom">Custom</span>} />);
		expect(screen.getByTestId("custom")).toBeInTheDocument();
	});

	it("calls onClick when clicked", async () => {
		const user = userEvent.setup();
		const onClick = vi.fn();
		render(<Button label="Click me" onClick={onClick} />);
		await user.click(screen.getByRole("button"));
		expect(onClick).toHaveBeenCalledOnce();
	});

	it("does not fire onClick when disabled", async () => {
		const user = userEvent.setup();
		const onClick = vi.fn();
		render(<Button label="Click me" disabled onClick={onClick} />);
		await user.click(screen.getByRole("button"));
		expect(onClick).not.toHaveBeenCalled();
	});

	it("defaults to type button", () => {
		render(<Button label="Test" />);
		expect(screen.getByRole("button")).toHaveAttribute("type", "button");
	});

	it("supports type submit", () => {
		render(<Button label="Submit" type="submit" />);
		expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
	});

	it("applies aria-label", () => {
		render(<Button label="X" ariaLabel="Close dialog" />);
		expect(screen.getByLabelText("Close dialog")).toBeInTheDocument();
	});

	it("applies aria-disabled", () => {
		render(<Button label="Pay" ariaDisabled />);
		expect(screen.getByRole("button")).toHaveAttribute("aria-disabled", "true");
	});

	it("wraps string label in span with font-semibold", () => {
		render(<Button label="Pay now" />);
		const span = screen.getByText("Pay now");
		expect(span.tagName).toBe("SPAN");
		expect(span).toHaveClass("font-semibold");
	});
});
