"use server";

import { executeGraphQL } from "@/lib/graphql";
import {
	AccountUpdateDocument,
	PasswordChangeDocument,
	AccountSetDefaultAddressDocument,
	AccountAddressDeleteDocument,
	AccountAddressCreateDocument,
	AccountAddressUpdateDocument,
	CountryCode,
	type AddressTypeEnum,
} from "@/gql/graphql";
import { redirect } from "next/navigation";

export async function updateProfile(channelSlug: string, formData: FormData) {
	const firstName = formData.get("firstName")?.toString() ?? "";
	const lastName = formData.get("lastName")?.toString() ?? "";

	const { accountUpdate } = await executeGraphQL(AccountUpdateDocument, {
		variables: { input: { firstName, lastName } },
		cache: "no-cache",
	});

	const errors = accountUpdate?.errors ?? [];
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

	const { passwordChange } = await executeGraphQL(PasswordChangeDocument, {
		variables: { newPassword, oldPassword },
		cache: "no-cache",
	});

	const errors = passwordChange?.errors ?? [];
	if (errors.length > 0) {
		redirect(`/${channelSlug}/account?status=password_error`);
	}

	redirect(`/${channelSlug}/account?status=password_changed`);
}

export async function deleteAddress(channelSlug: string, addressId: string) {
	if (!addressId || addressId.length > 256) {
		redirect(`/${channelSlug}/account/addresses?status=invalid_address`);
	}

	const { accountAddressDelete } = await executeGraphQL(AccountAddressDeleteDocument, {
		variables: { id: addressId },
		cache: "no-cache",
	});

	const errors = accountAddressDelete?.errors ?? [];
	if (errors.length > 0) {
		redirect(`/${channelSlug}/account/addresses?status=delete_error`);
	}

	redirect(`/${channelSlug}/account/addresses?status=address_deleted`);
}

export async function setDefaultAddress(channelSlug: string, addressId: string, type: AddressTypeEnum) {
	if (!addressId || addressId.length > 256) {
		redirect(`/${channelSlug}/account/addresses?status=invalid_address`);
	}

	const { accountSetDefaultAddress } = await executeGraphQL(AccountSetDefaultAddressDocument, {
		variables: { id: addressId, type },
		cache: "no-cache",
	});

	const errors = accountSetDefaultAddress?.errors ?? [];
	if (errors.length > 0) {
		redirect(`/${channelSlug}/account/addresses?status=default_error`);
	}

	redirect(`/${channelSlug}/account/addresses?status=default_updated`);
}

export async function createAddress(channelSlug: string, formData: FormData) {
	const address = extractAddressFromForm(formData);

	const { accountAddressCreate } = await executeGraphQL(AccountAddressCreateDocument, {
		variables: { address },
		cache: "no-cache",
	});

	const errors = accountAddressCreate?.errors ?? [];
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

	const { accountAddressUpdate } = await executeGraphQL(AccountAddressUpdateDocument, {
		variables: { id: addressId, address },
		cache: "no-cache",
	});

	const errors = accountAddressUpdate?.errors ?? [];
	if (errors.length > 0) {
		redirect(`/${channelSlug}/account/addresses?status=update_error`);
	}

	redirect(`/${channelSlug}/account/addresses?status=address_updated`);
}

function extractAddressFromForm(formData: FormData) {
	const countryStr = formData.get("country")?.toString() ?? "US";
	const country = (countryStr in CountryCode ? countryStr : "US") as CountryCode;

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
