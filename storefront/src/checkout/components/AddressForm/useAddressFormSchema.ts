import { useMemo, useState } from "react";
import { type AddressField } from "@/checkout/components/AddressForm/types";
import { useAddressFormUtils } from "@/checkout/components/AddressForm/useAddressFormUtils";
import { type CountryCode } from "@/checkout/graphql";
import { useErrorMessages } from "@/checkout/hooks/useErrorMessages";
import { type ValidationFn } from "@/checkout/hooks/useForm/types";
import { isValidPhoneNumber } from "@/checkout/lib/utils/phoneNumber";

export const useAddressFormSchema = (initialCountryCode?: CountryCode) => {
	const { errorMessages } = useErrorMessages();
	const [countryCode, setCountryCode] = useState(initialCountryCode);
	const { allowedFields, requiredFields } = useAddressFormUtils(countryCode);

	const validationSchema: ValidationFn<any> = useMemo(() => {
		return (values: Record<string, any>) => {
			const errors: Record<string, string> = {};

			if (!values.countryCode) {
				errors.countryCode = errorMessages.required;
			}

			for (const field of allowedFields || []) {
				if (field === "countryCode") continue;
				if (requiredFields.includes(field as AddressField) && !values[field]) {
					errors[field] = errorMessages.required;
				}
			}

			if (values.phone && !isValidPhoneNumber(values.phone, values.countryCode)) {
				errors.phone = errorMessages.invalid;
			}

			return errors;
		};
	}, [allowedFields, requiredFields, errorMessages.required]);

	return { validationSchema, setCountryCode };
};
