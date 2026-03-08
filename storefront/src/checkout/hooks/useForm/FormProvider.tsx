import { type PropsWithChildren, type FormEvent, useCallback } from "react";
import { type FormDataBase, type UseFormReturn } from "@/checkout/hooks/useForm";
import { FormContext } from "@/checkout/hooks/useForm/useForm";

export const FormProvider = <TData extends FormDataBase>({
	form,
	children,
}: PropsWithChildren<{
	form: UseFormReturn<TData>;
}>) => {
	const onSubmit = useCallback(
		(e: FormEvent) => {
			e.preventDefault();
			form.handleSubmit();
		},
		[form.handleSubmit],
	);

	return (
		<FormContext.Provider value={form as UseFormReturn<any>}>
			<form action="post" noValidate={true} onSubmit={onSubmit}>
				{children}
			</form>
		</FormContext.Provider>
	);
};
