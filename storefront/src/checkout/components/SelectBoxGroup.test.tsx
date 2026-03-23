import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SelectBoxGroup } from "./SelectBoxGroup";

describe("SelectBoxGroup component", () => {
	it("renders with radiogroup role", () => {
		render(<SelectBoxGroup label="Shipping methods"><div>Option 1</div></SelectBoxGroup>);
		expect(screen.getByRole("radiogroup")).toBeInTheDocument();
	});

	it("applies aria-label", () => {
		render(<SelectBoxGroup label="Payment options"><div>Option</div></SelectBoxGroup>);
		expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-label", "Payment options");
	});

	it("renders children", () => {
		render(
			<SelectBoxGroup label="Methods">
				<div>Standard Shipping</div>
				<div>Express Shipping</div>
			</SelectBoxGroup>,
		);
		expect(screen.getByText("Standard Shipping")).toBeInTheDocument();
		expect(screen.getByText("Express Shipping")).toBeInTheDocument();
	});

	it("applies custom className", () => {
		render(<SelectBoxGroup label="Test" className="custom-class"><div>Child</div></SelectBoxGroup>);
		expect(screen.getByRole("radiogroup")).toHaveClass("custom-class");
	});
});
