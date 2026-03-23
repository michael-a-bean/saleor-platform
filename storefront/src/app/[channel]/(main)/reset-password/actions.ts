"use server";

import { executeGraphQL } from "@/lib/graphql";
import { SetPasswordDocument } from "@/gql/graphql";
import { redirect } from "next/navigation";

export async function resetPasswordAction(channelSlug: string, formData: FormData) {
	const email = formData.get("email")?.toString() ?? "";
	const token = formData.get("token")?.toString() ?? "";
	const password = formData.get("password")?.toString() ?? "";
	const confirmPassword = formData.get("confirmPassword")?.toString() ?? "";

	if (password !== confirmPassword) {
		redirect(
			`/${channelSlug}/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}&status=passwords_mismatch`,
		);
	}

	if (password.length < 8) {
		redirect(
			`/${channelSlug}/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}&status=password_too_short`,
		);
	}

	let result;
	try {
		result = await executeGraphQL(SetPasswordDocument, {
			variables: { email, password, token },
			cache: "no-cache",
			withAuth: false,
		});
	} catch {
		redirect(`/${channelSlug}/reset-password?status=reset_error`);
	}

	const errors = result.setPassword?.errors ?? [];
	if (errors.length > 0) {
		redirect(`/${channelSlug}/reset-password?status=reset_error`);
	}

	redirect(`/${channelSlug}/login?status=password_reset`);
}
