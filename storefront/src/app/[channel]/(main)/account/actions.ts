"use server";

import { executeGraphQL } from "@/lib/graphql";
import {
	AccountUpdateDocument,
	PasswordChangeDocument,
	AccountSetDefaultAddressDocument,
	AccountAddressDeleteDocument,
	AccountAddressCreateDocument,
	AccountAddressUpdateDocument,
	RequestEmailChangeDocument,
	CountryCode,
	type AddressTypeEnum,
} from "@/gql/graphql";
import { redirect } from "next/navigation";

export async function updateProfile(channelSlug: string, formData: FormData) {
	const firstName = formData.get("firstName")?.toString() ?? "";
	const lastName = formData.get("lastName")?.toString() ?? "";

	let result;
	try {
		result = await executeGraphQL(AccountUpdateDocument, {
			variables: { input: { firstName, lastName } },
			cache: "no-cache",
		});
	} catch {
		redirect(`/${channelSlug}/account?status=profile_error`);
	}

	const errors = result.accountUpdate?.errors ?? [];
	if (errors.length > 0) {
		redirect(`/${channelSlug}/account?status=profile_error`);
	}

	redirect(`/${channelSlug}/account?status=profile_updated`);
}

export async function changePassword(channelSlug: string, formData: FormData) {
	const oldPassword = formData.get("oldPassword")?.toString() ?? "";
	const newPassword = formData.get("newPassword")?.toString() ?? "";
	const confirmPassword = formData.get("confirmPassword")?.toString() ?? "";

	if (!oldPassword) {
		redirect(`/${channelSlug}/account?status=password_required`);
	}

	if (newPassword !== confirmPassword) {
		redirect(`/${channelSlug}/account?status=passwords_mismatch`);
	}

	if (newPassword.length < 8) {
		redirect(`/${channelSlug}/account?status=password_too_short`);
	}

	let result;
	try {
		result = await executeGraphQL(PasswordChangeDocument, {
			variables: { newPassword, oldPassword },
			cache: "no-cache",
		});
	} catch {
		redirect(`/${channelSlug}/account?status=password_error`);
	}

	const errors = result.passwordChange?.errors ?? [];
	if (errors.length > 0) {
		redirect(`/${channelSlug}/account?status=password_error`);
	}

	redirect(`/${channelSlug}/account?status=password_changed`);
}

export async function deleteAddress(channelSlug: string, addressId: string) {
	if (!addressId || addressId.length > 256) {
		redirect(`/${channelSlug}/account/addresses?status=invalid_address`);
	}

	let result;
	try {
		result = await executeGraphQL(AccountAddressDeleteDocument, {
			variables: { id: addressId },
			cache: "no-cache",
		});
	} catch {
		redirect(`/${channelSlug}/account/addresses?status=delete_error`);
	}

	const errors = result.accountAddressDelete?.errors ?? [];
	if (errors.length > 0) {
		redirect(`/${channelSlug}/account/addresses?status=delete_error`);
	}

	redirect(`/${channelSlug}/account/addresses?status=address_deleted`);
}

export async function setDefaultAddress(channelSlug: string, addressId: string, type: AddressTypeEnum) {
	if (!addressId || addressId.length > 256) {
		redirect(`/${channelSlug}/account/addresses?status=invalid_address`);
	}

	let result;
	try {
		result = await executeGraphQL(AccountSetDefaultAddressDocument, {
			variables: { id: addressId, type },
			cache: "no-cache",
		});
	} catch {
		redirect(`/${channelSlug}/account/addresses?status=default_error`);
	}

	const errors = result.accountSetDefaultAddress?.errors ?? [];
	if (errors.length > 0) {
		redirect(`/${channelSlug}/account/addresses?status=default_error`);
	}

	redirect(`/${channelSlug}/account/addresses?status=default_updated`);
}

export async function createAddress(channelSlug: string, formData: FormData) {
	const address = extractAddressFromForm(formData);

	let result;
	try {
		result = await executeGraphQL(AccountAddressCreateDocument, {
			variables: { address },
			cache: "no-cache",
		});
	} catch {
		redirect(`/${channelSlug}/account/addresses?status=create_error`);
	}

	const errors = result.accountAddressCreate?.errors ?? [];
	if (errors.length > 0) {
		redirect(`/${channelSlug}/account/addresses?status=create_error`);
	}

	redirect(`/${channelSlug}/account/addresses?status=address_added`);
}

export async function updateAddress(channelSlug: string, addressId: string, formData: FormData) {
	if (!addressId || addressId.length > 256) {
		redirect(`/${channelSlug}/account/addresses?status=invalid_address`);
	}

	const address = extractAddressFromForm(formData);

	let result;
	try {
		result = await executeGraphQL(AccountAddressUpdateDocument, {
			variables: { id: addressId, address },
			cache: "no-cache",
		});
	} catch {
		redirect(`/${channelSlug}/account/addresses?status=update_error`);
	}

	const errors = result.accountAddressUpdate?.errors ?? [];
	if (errors.length > 0) {
		redirect(`/${channelSlug}/account/addresses?status=update_error`);
	}

	redirect(`/${channelSlug}/account/addresses?status=address_updated`);
}

export async function requestEmailChange(channelSlug: string, formData: FormData) {
	const newEmail = formData.get("newEmail")?.toString() ?? "";
	const password = formData.get("password")?.toString() ?? "";

	let result;
	try {
		result = await executeGraphQL(RequestEmailChangeDocument, {
			variables: {
				channel: channelSlug,
				newEmail,
				password,
				redirectUrl: `${process.env.NEXT_PUBLIC_STOREFRONT_URL || ""}/${channelSlug}/account/confirm-email`,
			},
			cache: "no-cache",
		});
	} catch {
		redirect(`/${channelSlug}/account?status=email_change_error`);
	}

	const errors = result.requestEmailChange?.errors ?? [];
	if (errors.length > 0) {
		redirect(`/${channelSlug}/account?status=email_change_error`);
	}

	redirect(`/${channelSlug}/account?status=email_change_requested`);
}

function extractAddressFromForm(formData: FormData) {
	const countryStr = formData.get("country")?.toString() ?? "US";
	const country = (Object.values(CountryCode).includes(countryStr as CountryCode) ? countryStr : "US") as CountryCode;

	return {
		firstName: formData.get("firstName")?.toString() ?? "",
		lastName: formData.get("lastName")?.toString() ?? "",
		companyName: formData.get("companyName")?.toString() ?? "",
		streetAddress1: formData.get("streetAddress1")?.toString() ?? "",
		streetAddress2: formData.get("streetAddress2")?.toString() ?? "",
		city: formData.get("city")?.toString() ?? "",
		postalCode: formData.get("postalCode")?.toString() ?? "",
		countryArea: formData.get("countryArea")?.toString() ?? "",
		country,
		phone: formData.get("phone")?.toString() ?? "",
	};
}
