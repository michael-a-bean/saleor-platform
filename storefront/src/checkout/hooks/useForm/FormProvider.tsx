import { FormikProvider, Form } from "formik";
import { type PropsWithChildren } from "react";
import { type FormDataBase, type UseFormReturn } from "@/checkout/hooks/useForm";

/**
 * Form provider that wraps Formik's FormikProvider with our custom form type.
 *
 * Type Safety Note:
 * The @ts-expect-error is needed because UseFormReturn has enhanced types
 * (stricter setFieldValue, validateForm) that don't match FormikContextType exactly.
 * The runtime behavior is correct; FormikProvider accepts our form object.
 */
export const FormProvider = <TData extends FormDataBase>({
	form,
	children,
}: PropsWithChildren<{
	form: UseFormReturn<TData>;
}>) => (
	// @ts-expect-error - UseFormReturn extends FormikContextType with stricter types (see JSDoc)
	<FormikProvider value={form}>
		<Form action="post" noValidate={true} onSubmit={form.handleSubmit}>
			{children}
		</Form>
	</FormikProvider>
);
