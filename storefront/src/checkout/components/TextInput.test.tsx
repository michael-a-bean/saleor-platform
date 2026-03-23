import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextInput } from "./TextInput";
import { renderWithForm } from "@/test/helpers";

describe("TextInput component", () => {
	it("renders label text", () => {
		renderWithForm(<TextInput name="email" label="Email" />);
		expect(screen.getByText("Email")).toBeInTheDocument();
	});

	it("renders required asterisk when required", () => {
		renderWithForm(<TextInput name="email" label="Email" required />);
		expect(screen.getByText("*")).toBeInTheDocument();
	});

	it("does not render asterisk when not required", () => {
		renderWithForm(<TextInput name="email" label="Email" />);
		expect(screen.queryByText("*")).not.toBeInTheDocument();
	});

	it("displays value from form context", () => {
		renderWithForm(
			<TextInput name="email" label="Email" />,
			{ values: { email: "test@example.com" } },
		);
		expect(screen.getByDisplayValue("test@example.com")).toBeInTheDocument();
	});

	it("calls handleChange on input", async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		renderWithForm(
			<TextInput name="email" label="Email" />,
			{ values: { email: "" }, handleChange },
		);
		await user.type(screen.getByRole("textbox"), "a");
		expect(handleChange).toHaveBeenCalled();
	});

	it("calls handleBlur on blur", async () => {
		const user = userEvent.setup();
		const handleBlur = vi.fn();
		renderWithForm(
			<TextInput name="email" label="Email" />,
			{ values: { email: "" }, handleBlur },
		);
		const input = screen.getByRole("textbox");
		await user.click(input);
		await user.tab();
		expect(handleBlur).toHaveBeenCalled();
	});

	it("shows error message when touched and has error", () => {
		renderWithForm(
			<TextInput name="email" label="Email" />,
			{ values: { email: "" }, touched: { email: true }, errors: { email: "Email is required" } },
		);
		expect(screen.getByText("Email is required")).toBeInTheDocument();
	});

	it("does not show error when not touched", () => {
		renderWithForm(
			<TextInput name="email" label="Email" />,
			{ values: { email: "" }, touched: {}, errors: { email: "Email is required" } },
		);
		expect(screen.queryByText("Email is required")).not.toBeInTheDocument();
	});

	it("applies error styling when has error", () => {
		renderWithForm(
			<TextInput name="email" label="Email" />,
			{ values: { email: "" }, touched: { email: true }, errors: { email: "Required" } },
		);
		const input = screen.getByRole("textbox");
		expect(input).toHaveClass("border-red-300");
	});
});
