"use server";

import { executeGraphQL } from "@/lib/graphql";
import { ConfirmEmailChangeDocument } from "@/gql/graphql";
import { redirect } from "next/navigation";

export async function confirmEmailChangeAction(channelSlug: string, formData: FormData) {
	const token = formData.get("token")?.toString() ?? "";

	let result;
	try {
		result = await executeGraphQL(ConfirmEmailChangeDocument, {
			variables: {
				channel: channelSlug,
				token,
			},
			cache: "no-cache",
		});
	} catch {
		redirect(`/${channelSlug}/account?status=email_confirm_error`);
	}

	const errors = result.confirmEmailChange?.errors ?? [];
	if (errors.length > 0) {
		redirect(`/${channelSlug}/account?status=email_confirm_error`);
	}

	redirect(`/${channelSlug}/account?status=email_changed`);
}
