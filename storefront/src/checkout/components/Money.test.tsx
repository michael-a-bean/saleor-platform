import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Money } from "./Money";

describe("Money component", () => {
	it("renders formatted money", () => {
		render(<Money ariaLabel="Price" money={{ amount: 9.99, currency: "USD" }} />);
		expect(screen.getByText("$9.99")).toBeInTheDocument();
	});

	it("renders nothing when money is undefined", () => {
		const { container } = render(<Money ariaLabel="Price" />);
		expect(container.innerHTML).toBe("");
	});

	it("renders nothing when money is null", () => {
		const { container } = render(<Money ariaLabel="Price" money={null} />);
		expect(container.innerHTML).toBe("");
	});

	it("renders negative amount when negative prop is true", () => {
		render(<Money ariaLabel="Discount" money={{ amount: 5.0, currency: "USD" }} negative />);
		expect(screen.getByText("-$5.00")).toBeInTheDocument();
	});

	it("applies aria-label when provided", () => {
		render(<Money money={{ amount: 10, currency: "USD" }} ariaLabel="Total price" />);
		expect(screen.getByLabelText("Total price")).toBeInTheDocument();
	});

	it("applies custom className", () => {
		render(<Money ariaLabel="Price" money={{ amount: 10, currency: "USD" }} className="text-bold" />);
		const element = screen.getByText("$10.00");
		expect(element).toHaveClass("text-bold");
	});

	it("handles large amounts with formatting", () => {
		render(<Money ariaLabel="Price" money={{ amount: 1234.56, currency: "USD" }} />);
		expect(screen.getByText("$1,234.56")).toBeInTheDocument();
	});

	it("handles zero amount", () => {
		render(<Money ariaLabel="Price" money={{ amount: 0, currency: "USD" }} />);
		expect(screen.getByText("$0.00")).toBeInTheDocument();
	});
});
