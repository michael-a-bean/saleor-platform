"use client";

import { SaleorAuthProvider, useAuthChange } from "@saleor/auth-sdk/react";
import { invariant } from "ts-invariant";
import { createSaleorAuthClient } from "@saleor/auth-sdk";
import { useState, type ReactNode } from "react";
import {
	type Client,
	Provider as UrqlProvider,
	cacheExchange,
	createClient,
	dedupExchange,
	fetchExchange,
} from "urql";

const saleorApiUrl = process.env.NEXT_PUBLIC_SALEOR_API_URL;
invariant(saleorApiUrl, "Missing NEXT_PUBLIC_SALEOR_API_URL env variable");

export const saleorAuthClient = createSaleorAuthClient({
	saleorApiUrl,
});

/**
 * Wrapper around fetchWithAuth that gracefully handles the Next.js cookie error.
 * The @saleor/auth-sdk tries to clear cookies when token refresh fails, but this
 * can only be done in Server Actions. We catch this error and proceed with an
 * unauthenticated request instead of crashing.
 */
const safeFetchWithAuth = async (
	input: RequestInfo,
	init?: RequestInit,
): Promise<Response> => {
	try {
		return await saleorAuthClient.fetchWithAuth(input, init);
	} catch (error) {
		// Handle the Next.js cookie modification error gracefully
		if (
			error instanceof Error &&
			error.message.includes("Cookies can only be modified in a Server Action")
		) {
			console.warn(
				"[AuthProvider] Token refresh failed - proceeding without auth. User may need to sign in again.",
			);
			// Fall back to unauthenticated fetch
			return fetch(input, init);
		}
		throw error;
	}
};

const makeUrqlClient = () => {
	return createClient({
		url: saleorApiUrl,
		suspense: true,
		fetch: (input, init) => safeFetchWithAuth(input as RequestInfo, init),
		exchanges: [dedupExchange, cacheExchange, fetchExchange],
	});
};

export function AuthProvider({ children }: { children: ReactNode }) {
	invariant(saleorApiUrl, "Missing NEXT_PUBLIC_SALEOR_API_URL env variable");

	const [urqlClient, setUrqlClient] = useState<Client>(() => makeUrqlClient());
	useAuthChange({
		saleorApiUrl,
		onSignedOut: () => {
			setUrqlClient(makeUrqlClient());
		},
		onSignedIn: () => {
			setUrqlClient(makeUrqlClient());
		},
	});

	return (
		<SaleorAuthProvider client={saleorAuthClient}>
			<UrqlProvider value={urqlClient}>{children}</UrqlProvider>
		</SaleorAuthProvider>
	);
}
