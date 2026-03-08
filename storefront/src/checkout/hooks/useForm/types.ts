import { type DebouncedFunc } from "lodash-es";
import { type FocusEventHandler } from "react";
import { type FormSubmitFn } from "@/checkout/hooks/useFormSubmit";

export type FormDataBase = Record<string, any>;

export type FormErrors<TData extends FormDataBase> = Partial<Record<keyof TData, string>>;

export type FormDataField<TData extends FormDataBase> = Extract<keyof TData, string>;

export type UseFormReturn<TData extends FormDataBase> = {
	values: TData;
	errors: FormErrors<TData>;
	touched: Partial<Record<keyof TData, boolean>>;
	dirty: boolean;
	isSubmitting: boolean;
	isValid: boolean;
	handleChange: (e: React.ChangeEvent<any>) => void;
	handleBlur: (e: React.FocusEvent<any>) => void;
	handleSubmit: (e?: React.FormEvent) => void;
	setFieldValue: <TFieldName extends FormDataField<TData>>(
		field: TFieldName,
		value: TData[TFieldName],
	) => void;
	setFieldTouched: (field: string, touched?: boolean) => void;
	setFieldError: (field: string, error: string | undefined) => void;
	setValues: (values: Partial<TData>, shouldValidate?: boolean) => void;
	setErrors: (errors: FormErrors<TData>) => void;
	setTouched: (touched: Partial<Record<keyof TData, boolean>>) => Promise<void>;
	setSubmitting: (isSubmitting: boolean) => void;
	validateForm: (values: TData) => FormErrors<TData>;
	resetForm: (nextState?: { values?: TData }) => void;
	submitForm: () => Promise<void>;
};

export type ValidationFn<TData extends FormDataBase> = (values: TData) => FormErrors<TData>;

export type FormProps<TData extends FormDataBase> = {
	initialValues: TData;
	onSubmit:
		| FormSubmitFn<TData>
		| ((data: TData, helpers: FormHelpers<TData>) => Promise<void>)
		| DebouncedFunc<(data: TData, helpers: FormHelpers<TData>) => Promise<void>>;
	validationSchema?: ValidationFn<TData>;
	initialDirty?: boolean;
	validateOnChange?: boolean;
	validateOnBlur?: boolean;
	initialTouched?: Partial<Record<keyof TData, boolean>>;
};

export type FormHelpers<TData extends FormDataBase> = Pick<
	UseFormReturn<TData>,
	| "setErrors"
	| "setTouched"
	| "setValues"
	| "setSubmitting"
	| "setFieldValue"
	| "setFieldTouched"
	| "setFieldError"
	| "validateForm"
	| "resetForm"
	| "submitForm"
>;

export type ChangeHandler<TElement = any> = (e: React.ChangeEvent<TElement>) => void;
export type BlurHandler = FocusEventHandler<HTMLSelectElement | HTMLInputElement>;
