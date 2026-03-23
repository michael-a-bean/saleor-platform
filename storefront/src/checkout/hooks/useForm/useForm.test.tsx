import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useForm } from "./useForm";

describe("useForm hook", () => {
	const defaultProps = {
		initialValues: { name: "", email: "" },
		onSubmit: vi.fn(),
	};

	it("initializes with provided values", () => {
		const { result } = renderHook(() =>
			useForm({ ...defaultProps, initialValues: { name: "John", email: "john@test.com" } }),
		);
		expect(result.current.values).toEqual({ name: "John", email: "john@test.com" });
	});

	it("starts not dirty", () => {
		const { result } = renderHook(() => useForm(defaultProps));
		expect(result.current.dirty).toBe(false);
	});

	it("starts with initialDirty when set", () => {
		const { result } = renderHook(() => useForm({ ...defaultProps, initialDirty: true }));
		expect(result.current.dirty).toBe(true);
	});

	it("starts with no errors", () => {
		const { result } = renderHook(() => useForm(defaultProps));
		expect(result.current.errors).toEqual({});
		expect(result.current.isValid).toBe(true);
	});

	it("starts not submitting", () => {
		const { result } = renderHook(() => useForm(defaultProps));
		expect(result.current.isSubmitting).toBe(false);
	});

	describe("setFieldValue", () => {
		it("updates a single field", () => {
			const { result } = renderHook(() => useForm(defaultProps));
			act(() => result.current.setFieldValue("name", "Jane"));
			expect(result.current.values.name).toBe("Jane");
		});

		it("marks form as dirty when value differs from initial", () => {
			const { result } = renderHook(() => useForm(defaultProps));
			act(() => result.current.setFieldValue("name", "changed"));
			expect(result.current.dirty).toBe(true);
		});
	});

	describe("setValues", () => {
		it("updates multiple fields", () => {
			const { result } = renderHook(() => useForm(defaultProps));
			act(() => result.current.setValues({ name: "Jane", email: "jane@test.com" }));
			expect(result.current.values).toEqual({ name: "Jane", email: "jane@test.com" });
		});
	});

	describe("setFieldError", () => {
		it("sets an error on a field", () => {
			const { result } = renderHook(() => useForm(defaultProps));
			act(() => result.current.setFieldError("email", "Invalid email"));
			expect(result.current.errors.email).toBe("Invalid email");
			expect(result.current.isValid).toBe(false);
		});

		it("clears an error when undefined", () => {
			const { result } = renderHook(() => useForm(defaultProps));
			act(() => result.current.setFieldError("email", "Invalid"));
			act(() => result.current.setFieldError("email", undefined));
			expect(result.current.errors.email).toBeUndefined();
			expect(result.current.isValid).toBe(true);
		});
	});

	describe("setFieldTouched", () => {
		it("marks a field as touched", () => {
			const { result } = renderHook(() => useForm(defaultProps));
			act(() => result.current.setFieldTouched("name", true));
			expect(result.current.touched.name).toBe(true);
		});
	});

	describe("validation", () => {
		it("runs validation schema on validateForm", () => {
			const schema = vi.fn().mockReturnValue({ email: "Required" });
			const { result } = renderHook(() =>
				useForm({ ...defaultProps, validationSchema: schema }),
			);
			act(() => result.current.validateForm(result.current.values));
			expect(result.current.errors).toEqual({ email: "Required" });
			expect(result.current.isValid).toBe(false);
		});

		it("validates on change when validateOnChange is true", () => {
			const schema = vi.fn().mockReturnValue({});
			const { result } = renderHook(() =>
				useForm({ ...defaultProps, validationSchema: schema, validateOnChange: true }),
			);
			act(() => result.current.setFieldValue("name", "test"));
			expect(schema).toHaveBeenCalled();
		});
	});

	describe("resetForm", () => {
		it("resets to initial values", () => {
			const { result } = renderHook(() => useForm(defaultProps));
			act(() => result.current.setFieldValue("name", "changed"));
			act(() => result.current.setFieldError("name", "error"));
			act(() => result.current.setFieldTouched("name", true));
			act(() => result.current.resetForm());
			expect(result.current.values).toEqual({ name: "", email: "" });
			expect(result.current.errors).toEqual({});
			expect(result.current.touched).toEqual({});
			expect(result.current.dirty).toBe(false);
		});

		it("resets to provided values", () => {
			const { result } = renderHook(() => useForm(defaultProps));
			act(() => result.current.resetForm({ values: { name: "New", email: "new@test.com" } }));
			expect(result.current.values).toEqual({ name: "New", email: "new@test.com" });
		});
	});

	describe("submitForm", () => {
		it("calls onSubmit with current values", async () => {
			const onSubmit = vi.fn();
			const { result } = renderHook(() => useForm({ ...defaultProps, onSubmit }));
			act(() => result.current.setFieldValue("name", "Test"));
			await act(() => result.current.submitForm());
			expect(onSubmit).toHaveBeenCalledWith(
				expect.objectContaining({ name: "Test" }),
				expect.any(Object),
			);
		});

		it("does not call onSubmit if validation fails", async () => {
			const onSubmit = vi.fn();
			const schema = vi.fn().mockReturnValue({ name: "Required" });
			const { result } = renderHook(() =>
				useForm({ ...defaultProps, onSubmit, validationSchema: schema }),
			);
			await act(() => result.current.submitForm());
			expect(onSubmit).not.toHaveBeenCalled();
		});

		it("marks all fields as touched on validation failure", async () => {
			const schema = vi.fn().mockReturnValue({ name: "Required" });
			const { result } = renderHook(() =>
				useForm({ ...defaultProps, validationSchema: schema }),
			);
			await act(() => result.current.submitForm());
			expect(result.current.touched.name).toBe(true);
			expect(result.current.touched.email).toBe(true);
		});
	});
});
