import { useFormik, useFormikContext, type FormikConfig } from "formik";
import { type ValidationError } from "yup";
import { type FormDataBase, type FormProps, type UseFormReturn } from "@/checkout/hooks/useForm/types";

/**
 * Custom useForm hook that wraps Formik with stricter typing.
 *
 * FormProps has stricter types than FormikConfig (e.g., onSubmit signature),
 * but at runtime the form props are fully compatible with useFormik.
 * See types.ts for the full type definitions and rationale.
 */
export const useForm = <TData extends FormDataBase>(formProps: FormProps<TData>) => {
	const { validationSchema } = formProps;
	const form = useFormik<TData>(formProps as unknown as FormikConfig<TData>);

	const { setErrors: setFormikErrors } = form;

	const validateForm = (values: TData) => {
		if (!validationSchema) {
			return {};
		}

		try {
			//  formik also has this types to "any"
			// will be fixed along with adding proper type to schema

			validationSchema.validateSync(values, { abortEarly: false });
			return {};
		} catch (e) {
			const errors: ValidationError = { ...(e as ValidationError) };

			if (!errors?.inner) {
				return {};
			}

			const parsedErrors = errors.inner.reduce(
				(result, { path, message }) => (path ? { ...result, [path]: message } : result),
				{},
			);
			setFormikErrors(parsedErrors);
			return parsedErrors;
		}
	};

	return {
		...form,
		validateForm,
	} as unknown as UseFormReturn<TData>;
};

export const useFormContext = useFormikContext;
