"use server";

import { executeGraphQL } from "@/lib/graphql";
import { RequestPasswordResetDocument } from "@/gql/graphql";
import { redirect } from "next/navigation";

export async function requestPasswordResetAction(channelSlug: string, formData: FormData) {
	const email = formData.get("email")?.toString() ?? "";

	try {
		await executeGraphQL(RequestPasswordResetDocument, {
			variables: {
				email,
				redirectUrl: `${process.env.NEXT_PUBLIC_STOREFRONT_URL || ""}/${channelSlug}/reset-password`,
				channel: channelSlug,
			},
			cache: "no-cache",
			withAuth: false,
		});
	} catch {
		// Silently succeed to prevent email enumeration
	}

	// Always show success regardless of whether email exists
	redirect(`/${channelSlug}/forgot-password?status=email_sent`);
}
