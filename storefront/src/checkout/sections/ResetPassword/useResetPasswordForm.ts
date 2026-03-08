import { useCallback } from "react";
import { useSaleorAuthContext } from "@saleor/auth-sdk/react";
import { useErrorMessages } from "@/checkout/hooks/useErrorMessages";
import { useForm } from "@/checkout/hooks/useForm";
import { useFormSubmit } from "@/checkout/hooks/useFormSubmit";
import { clearQueryParams, getQueryParams } from "@/checkout/lib/utils/url";
import { type ValidationFn } from "@/checkout/hooks/useForm/types";

interface ResetPasswordFormData {
	password: string;
}

export const useResetPasswordForm = ({ onSuccess }: { onSuccess: () => void }) => {
	const { errorMessages } = useErrorMessages();
	const { resetPassword } = useSaleorAuthContext();

	const validationSchema: ValidationFn<ResetPasswordFormData> = useCallback(
		(values) => {
			const errors: Partial<Record<keyof ResetPasswordFormData, string>> = {};
			if (!values.password) {
				errors.password = errorMessages.required;
			}
			return errors;
		},
		[errorMessages.required],
	);

	const onSubmit = useFormSubmit<ResetPasswordFormData, typeof resetPassword>({
		onSubmit: resetPassword,
		scope: "resetPassword",
		parse: ({ password }) => {
			const { passwordResetEmail, passwordResetToken } = getQueryParams();
			return { password, email: passwordResetEmail || "", token: passwordResetToken || "" };
		},
		onSuccess: () => {
			clearQueryParams("passwordResetToken", "passwordResetEmail");
			onSuccess();
		},
	});

	const initialValues: ResetPasswordFormData = { password: "" };

	const form = useForm<ResetPasswordFormData>({
		initialValues,
		onSubmit,
		validationSchema,
	});

	return form;
};
