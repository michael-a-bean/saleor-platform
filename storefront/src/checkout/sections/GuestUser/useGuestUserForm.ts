import { useCallback, useEffect, useState, useMemo } from "react";
import { useUserRegisterMutation } from "@/checkout/graphql";
import { useCheckout } from "@/checkout/hooks/useCheckout";
import {
	useCheckoutUpdateStateActions,
	useCheckoutUpdateStateChange,
	useUserRegisterState,
} from "@/checkout/state/updateStateStore";
import { useCheckoutFormValidationTrigger } from "@/checkout/hooks/useCheckoutFormValidationTrigger";
import { useFormSubmit } from "@/checkout/hooks/useFormSubmit";
import { type ChangeHandler, hasErrors, useForm } from "@/checkout/hooks/useForm";
import { getCurrentHref } from "@/checkout/lib/utils/locale";
import { useCheckoutEmailUpdate } from "@/checkout/sections/GuestUser/useCheckoutEmailUpdate";
import { useErrorMessages } from "@/checkout/hooks/useErrorMessages";
import { useUser } from "@/checkout/hooks/useUser";
import { EMAIL_REGEX, isValidEmail } from "@/checkout/lib/utils/common";
import { type ValidationFn } from "@/checkout/hooks/useForm/types";

export interface GuestUserFormData {
	email: string;
	password: string;
	createAccount: boolean;
}

interface GuestUserFormProps {
	// shared between sign in form and guest user form
	initialEmail: string;
}

export const useGuestUserForm = ({ initialEmail }: GuestUserFormProps) => {
	const { checkout } = useCheckout();
	const { user } = useUser();
	const shouldUserRegister = useUserRegisterState();
	const { setShouldRegisterUser, setSubmitInProgress } = useCheckoutUpdateStateActions();
	const { errorMessages } = useErrorMessages();
	const { setCheckoutUpdateState: setRegisterState } = useCheckoutUpdateStateChange("userRegister");
	const [, userRegister] = useUserRegisterMutation();
	const [userRegisterDisabled, setUserRegistrationDisabled] = useState(false);
	const { setCheckoutUpdateState } = useCheckoutUpdateStateChange("checkoutEmailUpdate");

	const validationSchema: ValidationFn<GuestUserFormData> = useCallback(
		(values) => {
			const errors: Partial<Record<keyof GuestUserFormData, string>> = {};
			if (!values.email) {
				errors.email = errorMessages.required;
			} else if (!EMAIL_REGEX.test(values.email)) {
				errors.email = errorMessages.invalid;
			}
			if (values.createAccount) {
				if (!values.password) {
					errors.password = errorMessages.required;
				} else if (values.password.length < 8) {
					errors.password = "Password must be at least 8 characters";
				}
			}
			return errors;
		},
		[errorMessages.required, errorMessages.invalid],
	);

	const defaultFormData: GuestUserFormData = {
		email: initialEmail || checkout.email || "",
		password: "",
		createAccount: false,
	};

	const onSubmit = useFormSubmit<GuestUserFormData, typeof userRegister>(
		useMemo(
			() => ({
				scope: "userRegister",
				onSubmit: userRegister,
				onStart: () => setShouldRegisterUser(false),
				shouldAbort: ({ formData, formHelpers: { validateForm } }) => {
					const errors = validateForm(formData);
					return hasErrors(errors);
				},
				parse: ({ email, password, channel }) => ({
					input: {
						email,
						password,
						channel,
						redirectUrl: getCurrentHref(),
					},
				}),
				onError: ({ errors }) => {
					setSubmitInProgress(false);
					const hasAccountForCurrentEmail = errors.some(({ code }) => code === "UNIQUE");

					if (hasAccountForCurrentEmail) {
						setUserRegistrationDisabled(true);
						// @todo this logic will be removed once new register flow is implemented
						setTimeout(() => setRegisterState("success"), 100);
					}
				},
				onSuccess: () => setUserRegistrationDisabled(true),
			}),
			[setRegisterState, setShouldRegisterUser, setSubmitInProgress, userRegister],
		),
	);

	const form = useForm<GuestUserFormData>({
		initialValues: defaultFormData,
		onSubmit,
		validationSchema,
		validateOnChange: true,
		validateOnBlur: false,
		initialTouched: { email: true },
	});

	const {
		values: { email, createAccount },
		handleSubmit,
		handleChange,
	} = form;

	useCheckoutFormValidationTrigger({
		scope: "guestUser",
		form,
	});

	useEffect(() => {
		if (!shouldUserRegister || user || !createAccount || userRegisterDisabled) {
			return;
		}

		void handleSubmit();
	}, [createAccount, handleSubmit, shouldUserRegister, user, userRegisterDisabled]);

	useCheckoutEmailUpdate({ email });

	// since we use debounced submit, set update
	// state as "loading" right away
	const onChange: ChangeHandler = (event) => {
		handleChange(event);

		if (event.target.name === "email") {
			setUserRegistrationDisabled(false);
		}

		if (isValidEmail(event.target.value as string)) {
			setCheckoutUpdateState("loading");
		}
	};

	return { ...form, handleChange: onChange };
};
