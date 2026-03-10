import { pick } from "lodash-es";
import { useCallback, useEffect, useRef } from "react";
import { type AddressFormData } from "@/checkout/components/AddressForm/types";
import { useAddressFormSchema } from "@/checkout/components/AddressForm/useAddressFormSchema";
import { type CountryCode } from "@/checkout/graphql";
import { useDebouncedSubmit } from "@/checkout/hooks/useDebouncedSubmit";
import {
	type BlurHandler,
	type ChangeHandler,
	type FormHelpers,
	type FormProps,
	hasErrors,
	useForm,
	type UseFormReturn,
} from "@/checkout/hooks/useForm";
import {
	type CheckoutUpdateStateScope,
	useCheckoutUpdateStateChange,
} from "@/checkout/state/updateStateStore";

export type AutoSaveAddressFormData = Partial<AddressFormData>;

export const useAutoSaveAddressForm = ({
	scope,
	...formProps
}: FormProps<AutoSaveAddressFormData> & {
	scope: CheckoutUpdateStateScope;
}): UseFormReturn<AutoSaveAddressFormData> & { handleSubmit: (event: any) => Promise<void> } => {
	const { setCheckoutUpdateState } = useCheckoutUpdateStateChange(scope);
	const { initialValues, onSubmit } = formProps;
	const { setCountryCode, validationSchema } = useAddressFormSchema(initialValues.countryCode);

	const form = useForm<AutoSaveAddressFormData>({ ...formProps, validationSchema });
	const { values, validateForm, dirty, handleBlur, handleChange } = form;

	// Keep a ref to latest values so partialSubmit always reads current state
	const valuesRef = useRef(values);
	useEffect(() => {
		valuesRef.current = values;
	}, [values]);

	const debouncedSubmit = useDebouncedSubmit(onSubmit);

	const formHelpers = pick(form, [
		"setErrors",
		"setTouched",
		"setValues",
		"setSubmitting",
		"setFieldValue",
		"setFieldTouched",
		"setFieldError",
		"validateForm",
		"resetForm",
		"submitForm",
	]) as FormHelpers<AutoSaveAddressFormData>;

	// partial submit for guest address form — validates before submitting
	// Uses valuesRef to always read the latest values, even when called
	// immediately after handleChange (before React re-renders with new state)
	const partialSubmit = useCallback(async () => {
		const currentValues = valuesRef.current;
		const formErrors = validateForm(currentValues);

		if (!hasErrors(formErrors) && dirty) {
			setCheckoutUpdateState("loading");
			void debouncedSubmit({ ...initialValues, countryCode: currentValues.countryCode, ...currentValues }, formHelpers);
		}
	}, [validateForm, dirty, setCheckoutUpdateState, debouncedSubmit, initialValues, formHelpers]);

	const onChange: ChangeHandler = (event) => {
		const { name, value } = event.target;

		if (name === "countryCode") {
			setCountryCode(value as CountryCode);
		}

		handleChange(event);
		void partialSubmit();
	};

	const onBlur: BlurHandler = (event) => {
		handleBlur(event);
		void partialSubmit();
	};

	return { ...form, handleChange: onChange, handleBlur: onBlur, handleSubmit: partialSubmit };
};
