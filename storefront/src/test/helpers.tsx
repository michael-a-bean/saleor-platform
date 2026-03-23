import { type ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { vi } from "vitest";
import { FormContext } from "@/checkout/hooks/useForm/useForm";
import { type UseFormReturn, type FormDataBase } from "@/checkout/hooks/useForm/types";

/**
 * Create a mock form context for testing components that use useFormContext.
 */
export function createMockFormContext<T extends FormDataBase>(
	overrides: Partial<UseFormReturn<T>> = {},
): UseFormReturn<T> {
	return {
		values: {} as T,
		errors: {},
		touched: {},
		dirty: false,
		isSubmitting: false,
		isValid: true,
		handleChange: vi.fn(),
		handleBlur: vi.fn(),
		handleSubmit: vi.fn(),
		setFieldValue: vi.fn(),
		setFieldTouched: vi.fn(),
		setFieldError: vi.fn(),
		setValues: vi.fn(),
		setErrors: vi.fn(),
		setTouched: vi.fn(),
		setSubmitting: vi.fn(),
		validateForm: vi.fn().mockReturnValue({}),
		resetForm: vi.fn(),
		submitForm: vi.fn().mockResolvedValue(undefined),
		...overrides,
	} as UseFormReturn<T>;
}

/**
 * Render a component wrapped in FormContext.Provider.
 */
export function renderWithForm<T extends FormDataBase>(
	ui: ReactNode,
	formOverrides: Partial<UseFormReturn<T>> = {},
	options?: RenderOptions,
) {
	const formContext = createMockFormContext<T>(formOverrides);
	return {
		...render(
			<FormContext.Provider value={formContext}>{ui}</FormContext.Provider>,
			options,
		),
		formContext,
	};
}
