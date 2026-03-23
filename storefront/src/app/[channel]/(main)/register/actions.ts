"use server";

import { executeGraphQL } from "@/lib/graphql";
import { AccountRegisterDocument } from "@/gql/graphql";
import { redirect } from "next/navigation";

export async function registerAction(channelSlug: string, formData: FormData) {
	const email = formData.get("email")?.toString() ?? "";
	const password = formData.get("password")?.toString() ?? "";
	const confirmPassword = formData.get("confirmPassword")?.toString() ?? "";
	const firstName = formData.get("firstName")?.toString() ?? "";
	const lastName = formData.get("lastName")?.toString() ?? "";

	if (password !== confirmPassword) {
		redirect(`/${channelSlug}/register?status=passwords_mismatch`);
	}

	if (password.length < 8) {
		redirect(`/${channelSlug}/register?status=password_too_short`);
	}

	let result;
	try {
		result = await executeGraphQL(AccountRegisterDocument, {
			variables: {
				input: {
					email,
					password,
					firstName,
					lastName,
					channel: channelSlug,
					redirectUrl: `${process.env.NEXT_PUBLIC_STOREFRONT_URL || ""}/${channelSlug}/account`,
				},
			},
			cache: "no-cache",
			withAuth: false,
		});
	} catch {
		redirect(`/${channelSlug}/register?status=registration_error`);
	}

	const errors = result.accountRegister?.errors ?? [];
	if (errors.length > 0) {
		const code = errors.some((e) => e.code === "UNIQUE") ? "email_taken" : "registration_error";
		redirect(`/${channelSlug}/register?status=${code}`);
	}

	redirect(`/${channelSlug}/login?status=registration_success`);
}
