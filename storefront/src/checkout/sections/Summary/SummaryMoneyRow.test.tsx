import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SummaryMoneyRow } from "./SummaryMoneyRow";

describe("SummaryMoneyRow component", () => {
	it("renders label and money amount", () => {
		render(<SummaryMoneyRow label="Subtotal" ariaLabel="Subtotal" money={{ amount: 29.99, currency: "USD" }} />);
		expect(screen.getByText("Subtotal")).toBeInTheDocument();
		expect(screen.getByText("$29.99")).toBeInTheDocument();
	});

	it("renders negative money for discounts", () => {
		render(<SummaryMoneyRow label="Discount" ariaLabel="Discount" money={{ amount: 5, currency: "USD" }} negative />);
		expect(screen.getByText("Discount")).toBeInTheDocument();
		expect(screen.getByText("-$5.00")).toBeInTheDocument();
	});

	it("renders children alongside label", () => {
		render(
			<SummaryMoneyRow label="Shipping" ariaLabel="Shipping" money={{ amount: 0, currency: "USD" }}>
				<span data-testid="info-icon">i</span>
			</SummaryMoneyRow>,
		);
		expect(screen.getByText("Shipping")).toBeInTheDocument();
		expect(screen.getByTestId("info-icon")).toBeInTheDocument();
	});

	it("renders nothing for money when undefined", () => {
		const { container } = render(<SummaryMoneyRow label="Tax" ariaLabel="Tax" />);
		expect(screen.getByText("Tax")).toBeInTheDocument();
		// Money component renders nothing when money is undefined
		const moneyElements = container.querySelectorAll("p[aria-label]");
		expect(moneyElements).toHaveLength(0);
	});
});
