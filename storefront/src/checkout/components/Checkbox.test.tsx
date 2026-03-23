import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checkbox } from "./Checkbox";
import { renderWithForm } from "@/test/helpers";

describe("Checkbox component", () => {
	it("renders label text", () => {
		renderWithForm(
			<Checkbox name="saveAddress" label="Save this address" />,
			{ values: { saveAddress: false } },
		);
		expect(screen.getByText("Save this address")).toBeInTheDocument();
	});

	it("renders unchecked when value is false", () => {
		renderWithForm(
			<Checkbox name="saveAddress" label="Save" />,
			{ values: { saveAddress: false } },
		);
		expect(screen.getByRole("checkbox")).not.toBeChecked();
	});

	it("renders checked when value is true", () => {
		renderWithForm(
			<Checkbox name="saveAddress" label="Save" />,
			{ values: { saveAddress: true } },
		);
		expect(screen.getByRole("checkbox")).toBeChecked();
	});

	it("calls setFieldValue with toggled value on click", async () => {
		const user = userEvent.setup();
		const setFieldValue = vi.fn();
		renderWithForm(
			<Checkbox name="saveAddress" label="Save" />,
			{ values: { saveAddress: false }, setFieldValue },
		);
		await user.click(screen.getByRole("checkbox"));
		expect(setFieldValue).toHaveBeenCalledWith("saveAddress", true);
	});

	it("toggles from true to false on click", async () => {
		const user = userEvent.setup();
		const setFieldValue = vi.fn();
		renderWithForm(
			<Checkbox name="terms" label="Accept terms" />,
			{ values: { terms: true }, setFieldValue },
		);
		await user.click(screen.getByRole("checkbox"));
		expect(setFieldValue).toHaveBeenCalledWith("terms", false);
	});
});
