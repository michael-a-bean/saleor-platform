import { cache } from "react";
import { executeGraphQL } from "@/lib/graphql";
import { CurrentUserDocument } from "@/gql/graphql";

/**
 * Cached current user fetch — deduplicates within a single React render pass.
 * Multiple pages/components calling getCurrentUser() in the same request
 * result in a single API call.
 */
export const getCurrentUser = cache(async () => {
	const { me } = await executeGraphQL(CurrentUserDocument, {
		cache: "no-cache",
	});
	return me;
});
