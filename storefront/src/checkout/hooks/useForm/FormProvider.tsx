import { FormikProvider, Form, type FormikContextType } from "formik";
import { type PropsWithChildren } from "react";
import { type FormDataBase, type UseFormReturn } from "@/checkout/hooks/useForm";

/**
 * Form provider that wraps Formik's FormikProvider with our custom form type.
 *
 * UseFormReturn has stricter types than FormikContextType (e.g., field-specific setFieldValue),
 * but at runtime the form object is fully compatible with FormikProvider.
 */
export const FormProvider = <TData extends FormDataBase>({
	form,
	children,
}: PropsWithChildren<{
	form: UseFormReturn<TData>;
}>) => (
	<FormikProvider value={form as unknown as FormikContextType<TData>}>
		<Form action="post" noValidate={true} onSubmit={form.handleSubmit}>
			{children}
		</Form>
	</FormikProvider>
);
