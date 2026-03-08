import { useState, useCallback, useRef, createContext, useContext } from "react";
import {
	type FormDataBase,
	type FormProps,
	type UseFormReturn,
	type FormErrors,
	type FormHelpers,
} from "@/checkout/hooks/useForm/types";

export const useForm = <TData extends FormDataBase>(formProps: FormProps<TData>): UseFormReturn<TData> => {
	const {
		initialValues,
		onSubmit,
		validationSchema,
		initialDirty = false,
		validateOnChange = false,
		validateOnBlur = true,
		initialTouched = {},
	} = formProps;

	const [values, setValuesState] = useState<TData>(initialValues);
	const [errors, setErrorsState] = useState<FormErrors<TData>>({});
	const [touched, setTouchedState] = useState<Partial<Record<keyof TData, boolean>>>(
		initialTouched as Partial<Record<keyof TData, boolean>>,
	);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const initialValuesRef = useRef(initialValues);
	const [dirty, setDirty] = useState(initialDirty);

	// Keep a ref to latest values for use in submitForm callback
	const valuesRef = useRef(values);
	valuesRef.current = values;

	const validateForm = useCallback(
		(vals: TData): FormErrors<TData> => {
			if (!validationSchema) {
				return {};
			}
			const formErrors = validationSchema(vals);
			setErrorsState(formErrors);
			return formErrors;
		},
		[validationSchema],
	);

	const setFieldValue = useCallback(
		<TFieldName extends string>(field: TFieldName, value: any) => {
			setValuesState((prev) => {
				const next = { ...prev, [field]: value };
				setDirty(true);
				if (validateOnChange && validationSchema) {
					const formErrors = validationSchema(next);
					setErrorsState(formErrors);
				}
				return next;
			});
		},
		[validateOnChange, validationSchema],
	);

	const setValues = useCallback(
		(newValues: Partial<TData>, _shouldValidate?: boolean) => {
			setValuesState((prev) => {
				const next = { ...prev, ...newValues };
				setDirty(true);
				return next;
			});
		},
		[],
	);

	const setErrors = useCallback((newErrors: FormErrors<TData>) => {
		setErrorsState(newErrors);
	}, []);

	const setTouched = useCallback(async (newTouched: Partial<Record<keyof TData, boolean>>) => {
		setTouchedState((prev) => ({ ...prev, ...newTouched }));
	}, []);

	const setFieldTouched = useCallback((field: string, isTouched: boolean = true) => {
		setTouchedState((prev) => ({ ...prev, [field]: isTouched }));
	}, []);

	const setFieldError = useCallback((field: string, error: string | undefined) => {
		setErrorsState((prev) => {
			if (error) {
				return { ...prev, [field]: error };
			}
			const { [field]: _, ...rest } = prev;
			return rest as FormErrors<TData>;
		});
	}, []);

	const setSubmitting = useCallback((val: boolean) => {
		setIsSubmitting(val);
	}, []);

	const resetForm = useCallback((nextState?: { values?: TData }) => {
		const resetValues = nextState?.values ?? initialValuesRef.current;
		setValuesState(resetValues);
		setErrorsState({});
		setTouchedState({});
		setDirty(false);
		setIsSubmitting(false);
	}, []);

	const handleChange = useCallback(
		(e: React.ChangeEvent<any>) => {
			const { name, value, type, checked } = e.target;
			const fieldValue = type === "checkbox" ? checked : value;
			setValuesState((prev) => {
				const next = { ...prev, [name]: fieldValue };
				setDirty(true);
				if (validateOnChange && validationSchema) {
					const formErrors = validationSchema(next);
					setErrorsState(formErrors);
				}
				return next;
			});
		},
		[validateOnChange, validationSchema],
	);

	const handleBlur = useCallback(
		(e: React.FocusEvent<any>) => {
			const { name } = e.target;
			setTouchedState((prev) => ({ ...prev, [name]: true }));
			if (validateOnBlur && validationSchema) {
				const formErrors = validationSchema(valuesRef.current);
				setErrorsState(formErrors);
			}
		},
		[validateOnBlur, validationSchema],
	);

	const submitFormRef = useRef<() => Promise<void>>(async () => {});

	const buildHelpers = useCallback((): FormHelpers<TData> => {
		return {
			setErrors,
			setTouched,
			setValues,
			setSubmitting,
			setFieldValue: setFieldValue as UseFormReturn<TData>["setFieldValue"],
			setFieldTouched,
			setFieldError,
			validateForm,
			resetForm,
			submitForm: () => submitFormRef.current(),
		};
	}, [
		setErrors,
		setTouched,
		setValues,
		setSubmitting,
		setFieldValue,
		setFieldTouched,
		setFieldError,
		validateForm,
		resetForm,
	]);

	const submitForm = useCallback(async () => {
		setIsSubmitting(true);
		try {
			const helpers = buildHelpers();
			await onSubmit(valuesRef.current, helpers);
		} finally {
			setIsSubmitting(false);
		}
	}, [onSubmit, buildHelpers]);

	submitFormRef.current = submitForm;

	const handleSubmit = useCallback(
		(e?: React.FormEvent) => {
			e?.preventDefault?.();
			void submitForm();
		},
		[submitForm],
	);

	return {
		values,
		errors,
		touched,
		dirty,
		isSubmitting,
		isValid: Object.keys(errors).length === 0,
		handleChange,
		handleBlur,
		handleSubmit,
		setFieldValue: setFieldValue as UseFormReturn<TData>["setFieldValue"],
		setFieldTouched,
		setFieldError,
		setValues,
		setErrors,
		setTouched,
		setSubmitting,
		validateForm,
		resetForm,
		submitForm,
	};
};

// Context-based form context (replaces FormikProvider/useFormikContext)
export const FormContext = createContext<UseFormReturn<any> | null>(null);

export const useFormContext = <T extends FormDataBase>(): UseFormReturn<T> => {
	const ctx = useContext(FormContext);
	if (!ctx) {
		throw new Error("useFormContext must be used within a FormProvider");
	}
	return ctx as UseFormReturn<T>;
};
