import { createSaleorAuthClient } from "@saleor/auth-sdk";
import { getNextServerCookiesStorageAsync } from "@saleor/auth-sdk/next/server";
import { invariant } from "ts-invariant";

export const ProductsPerPage = 12;

const saleorApiUrl = process.env.NEXT_PUBLIC_SALEOR_API_URL;
invariant(saleorApiUrl, "Missing NEXT_PUBLIC_SALEOR_API_URL env variable");

// Server-side URL for Docker networking (server actions use this)
// Must use http://api:8000/graphql/ to match JWT issuer claim
const serverSaleorApiUrl = process.env.SALEOR_API_URL || saleorApiUrl;

export const DefaultChannelSlug =
	process.env.NEXT_PUBLIC_DEFAULT_CHANNEL ?? "webstore";

export const getServerAuthClient = async () => {
	// Use secure cookies only in production (HTTPS)
	// HTTP localhost requires secure: false for cookies to be sent
	const isSecure = process.env.NODE_ENV === "production" ||
		serverSaleorApiUrl.startsWith("https://");
	const nextServerCookiesStorage = await getNextServerCookiesStorageAsync({
		secure: isSecure,
	});
	return createSaleorAuthClient({
		saleorApiUrl: serverSaleorApiUrl,
		refreshTokenStorage: nextServerCookiesStorage,
		accessTokenStorage: nextServerCookiesStorage,
	});
};
