import { useFormik, useFormikContext } from "formik";
import { type ValidationError } from "yup";
import { type FormDataBase, type FormProps, type UseFormReturn } from "@/checkout/hooks/useForm/types";

/**
 * Custom useForm hook that wraps Formik with stricter typing.
 *
 * Type Safety Note:
 * We use @ts-expect-error here because our FormProps type has intentional differences
 * from FormikConfig to provide stricter type safety (e.g., field-specific setFieldValue).
 * The runtime behavior is correct; this is purely a compile-time type mismatch.
 *
 * See types.ts for the full type definitions and rationale.
 */
export const useForm = <TData extends FormDataBase>(formProps: FormProps<TData>) => {
	const { validationSchema } = formProps;
	// @ts-expect-error - FormProps has stricter types than FormikConfig (see JSDoc above)
	const form = useFormik<TData>(formProps);

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
