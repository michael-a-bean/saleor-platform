"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { executeGraphQL } from "@/lib/graphql";
import {
	searchProducts as meilisearchProducts,
	isMeilisearchHealthy,
	type MeilisearchProduct,
	type SearchFilters as MeilisearchFilters,
} from "@/lib/meilisearch";
import {
	SinglesBuilderSearchDocument,
	SinglesBuilderCartFindDocument,
	SinglesBuilderCartCreateDocument,
	SinglesBuilderCartAddLinesDocument,
	SinglesBuilderCartUpdateLinesDocument,
	SinglesBuilderCartDeleteLinesDocument,
	SinglesBuilderCartUpdateMetadataDocument,
	type SinglesBuilderSearchQuery,
	type SinglesBuilderCheckoutFragment,
	type ProductFilterInput,
} from "@/gql/graphql";

// Cookie name includes channel for channel-specific carts
const getCheckoutCookieName = (channel: string) => `singles-cart-${channel}`;

// ----- Meilisearch Types -----

export interface MeilisearchSearchResult {
	products: MeilisearchProduct[];
	totalCount: number;
	hasNextPage: boolean;
	processingTimeMs: number;
}

// Transform Meilisearch product to match GraphQL fragment structure
function transformMeilisearchProduct(product: MeilisearchProduct): NonNullable<SinglesBuilderSearchQuery["products"]>["edges"][0]["node"] {
	return {
		// Use original Saleor GraphQL ID for all operations
		id: product.original_id,
		name: product.name,
		slug: product.slug,
		thumbnail: product.thumbnail ? { url: product.thumbnail, alt: product.name } : null,
		attributes: [
			{
				attribute: { slug: "mtg-set-name" },
				values: product.set_name ? [{ name: product.set_name, slug: product.set_name.toLowerCase().replace(/\s+/g, "-") }] : [],
			},
			{
				attribute: { slug: "mtg-set-code" },
				values: product.set_code ? [{ name: product.set_code, slug: product.set_code.toLowerCase() }] : [],
			},
			{
				attribute: { slug: "mtg-collector-number" },
				values: product.collector_number ? [{ name: product.collector_number, slug: product.collector_number }] : [],
			},
			{
				attribute: { slug: "mtg-rarity" },
				values: product.rarity ? [{ name: product.rarity, slug: product.rarity.toLowerCase() }] : [],
			},
		],
		variants: product.variants.map((v) => ({
			// Use original Saleor variant ID for cart operations
			id: v.original_id,
			sku: v.sku,
			name: `${v.condition} - ${v.finish}`,
			quantityAvailable: v.stock,
			attributes: [
				{
					attribute: { slug: "mtg-condition" },
					values: [{ name: v.condition, slug: v.condition.toLowerCase().replace(/\s+/g, "-") }],
				},
				{
					attribute: { slug: "mtg-finish" },
					values: [{ name: v.finish, slug: v.finish.toLowerCase().replace(/\s+/g, "-") }],
				},
			],
			pricing: v.price
				? {
						price: {
							gross: { amount: v.price, currency: "USD" },
						},
					}
				: null,
		})),
	};
}

// ----- Meilisearch Search Action -----

export async function searchWithMeilisearch(
	query: string,
	channel: string,
	options: {
		limit?: number;
		offset?: number;
		conditions?: string[];
		finishes?: string[];
		rarity?: string[];
		inStockOnly?: boolean;
		priceMin?: number | null;
		priceMax?: number | null;
	} = {},
): Promise<MeilisearchSearchResult> {
	const { limit = 50, offset = 0, conditions, finishes, rarity, inStockOnly, priceMin, priceMax } = options;

	// Check if Meilisearch is healthy
	const isHealthy = await isMeilisearchHealthy();
	if (!isHealthy) {
		console.warn("Meilisearch is not available, returning empty results");
		return {
			products: [],
			totalCount: 0,
			hasNextPage: false,
			processingTimeMs: 0,
		};
	}

	const filters: MeilisearchFilters = {};
	if (conditions && conditions.length > 0) {
		filters.conditions = conditions;
	}
	if (finishes && finishes.length > 0) {
		filters.finishes = finishes;
	}
	if (inStockOnly) {
		filters.inStockOnly = true;
	}
	// Rarity filter - supports multiple values
	if (rarity && rarity.length > 0) {
		filters.rarity = rarity;
	}
	// Price range filter
	if (priceMin !== undefined && priceMin !== null || priceMax !== undefined && priceMax !== null) {
		filters.priceRange = {};
		if (priceMin !== undefined && priceMin !== null) {
			filters.priceRange.min = priceMin;
		}
		if (priceMax !== undefined && priceMax !== null) {
			filters.priceRange.max = priceMax;
		}
	}

	const result = await meilisearchProducts(query, channel, {
		limit,
		offset,
		filters,
		indexPrefix: "singles-builder",
	});

	return {
		products: result.hits,
		totalCount: result.estimatedTotalHits,
		hasNextPage: offset + result.hits.length < result.estimatedTotalHits,
		processingTimeMs: result.processingTimeMs,
	};
}

// Transform Meilisearch results to match SinglesBuilderSearchQuery["products"] structure
// Note: This is a pure transform function, not a server action
export async function transformMeilisearchToGraphQL(
	result: MeilisearchSearchResult,
	currentOffset: number = 0,
): Promise<SinglesBuilderSearchQuery["products"]> {
	if (result.products.length === 0) {
		return null;
	}

	// Use the actual offset for cursor so load-more knows where to continue from
	const nextOffset = currentOffset + result.products.length;

	return {
		edges: result.products.map((product, index) => ({
			cursor: String(currentOffset + index),
			node: transformMeilisearchProduct(product),
		})),
		pageInfo: {
			hasNextPage: result.hasNextPage,
			// endCursor stores the next offset to fetch from
			endCursor: result.hasNextPage ? String(nextOffset) : null,
		},
	};
}

// Fetch more results from Meilisearch using offset pagination
export async function fetchMoreWithMeilisearch(
	query: string,
	channel: string,
	afterCursor: string | null,
	options: {
		conditions?: string[];
		finishes?: string[];
		rarity?: string[];
		inStockOnly?: boolean;
		priceMin?: number | null;
		priceMax?: number | null;
	} = {},
): Promise<SinglesBuilderSearchQuery["products"]> {
	// afterCursor contains the offset to continue from
	const offset = afterCursor ? parseInt(afterCursor, 10) : 0;

	if (isNaN(offset)) {
		console.error("Invalid cursor for Meilisearch pagination:", afterCursor);
		return null;
	}

	const result = await searchWithMeilisearch(query, channel, {
		limit: 50,
		offset,
		...options,
	});

	return transformMeilisearchToGraphQL(result, offset);
}

// ----- Search Actions -----

export async function fetchSinglesBuilderProducts(
	channel: string,
	search: string,
	after: string | null = null,
	filter?: ProductFilterInput,
): Promise<SinglesBuilderSearchQuery["products"]> {
	// Allow empty search if filters are applied
	const hasSearch = search.trim().length > 0;
	const hasFilters = filter && Object.keys(filter).length > 0;

	if (!hasSearch && !hasFilters) {
		return null;
	}

	// Build the filter object
	const productFilter: ProductFilterInput = {
		...filter,
		// If search is provided, add it to the filter
		...(hasSearch && { search: search.trim() }),
	};

	const { products } = await executeGraphQL(SinglesBuilderSearchDocument, {
		variables: {
			channel,
			search: search.trim() || "", // Required by query but may be empty
			first: 50,
			after: after ?? undefined,
			filter: productFilter,
		},
		revalidate: 0, // Don't cache search results
	});

	return products;
}

// ----- Cart Actions -----

export interface CartActionResult {
	success: boolean;
	error?: string;
	checkout?: SinglesBuilderCheckoutFragment;
}

async function getCheckoutIdFromCookie(channel: string): Promise<string | null> {
	const cookieStore = await cookies();
	return cookieStore.get(getCheckoutCookieName(channel))?.value ?? null;
}

async function setCheckoutCookie(channel: string, checkoutId: string): Promise<void> {
	const cookieStore = await cookies();
	const shouldUseHttps =
		process.env.NEXT_PUBLIC_STOREFRONT_URL?.startsWith("https") || !!process.env.NEXT_PUBLIC_VERCEL_URL;
	cookieStore.set(getCheckoutCookieName(channel), checkoutId, {
		sameSite: "lax",
		secure: shouldUseHttps,
		maxAge: 60 * 60 * 24 * 7, // 7 days
	});
}

export async function fetchSinglesCart(channel: string): Promise<CartActionResult> {
	try {
		const checkoutId = await getCheckoutIdFromCookie(channel);
		if (!checkoutId) {
			return { success: true, checkout: undefined };
		}

		const { checkout } = await executeGraphQL(SinglesBuilderCartFindDocument, {
			variables: { id: checkoutId },
			cache: "no-cache",
		});

		if (!checkout) {
			// Checkout not found (expired or deleted)
			return { success: true, checkout: undefined };
		}

		return { success: true, checkout: checkout as SinglesBuilderCheckoutFragment };
	} catch (error) {
		console.error("Fetch cart error:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to fetch cart",
		};
	}
}

async function getOrCreateCheckout(channel: string): Promise<SinglesBuilderCheckoutFragment | null> {
	const existingId = await getCheckoutIdFromCookie(channel);

	// Try to find existing checkout
	if (existingId) {
		try {
			const { checkout } = await executeGraphQL(SinglesBuilderCartFindDocument, {
				variables: { id: existingId },
				cache: "no-cache",
			});
			if (checkout) {
				return checkout as SinglesBuilderCheckoutFragment;
			}
		} catch {
			// Checkout not found, will create new one
		}
	}

	// Create new checkout for singles-builder channel
	const { checkoutCreate } = await executeGraphQL(SinglesBuilderCartCreateDocument, {
		variables: {
			channel,
			lines: [],
		},
		cache: "no-cache",
	});

	if (checkoutCreate?.checkout) {
		await setCheckoutCookie(channel, checkoutCreate.checkout.id);
		return checkoutCreate.checkout as SinglesBuilderCheckoutFragment;
	}

	return null;
}

export async function addToSinglesCart(
	variantId: string,
	quantity: number,
	channel: string,
): Promise<CartActionResult> {
	try {
		let checkout = await getOrCreateCheckout(channel);
		if (!checkout) {
			return { success: false, error: "Could not create checkout" };
		}

		const { checkoutLinesAdd } = await executeGraphQL(SinglesBuilderCartAddLinesDocument, {
			variables: {
				id: checkout.id,
				lines: [{ variantId, quantity }],
			},
			cache: "no-cache",
		});

		if (checkoutLinesAdd?.errors && checkoutLinesAdd.errors.length > 0) {
			return {
				success: false,
				error: checkoutLinesAdd.errors[0].message || "Failed to add item",
			};
		}

		revalidatePath("/singles-builder");

		return {
			success: true,
			checkout: checkoutLinesAdd?.checkout as SinglesBuilderCheckoutFragment,
		};
	} catch (error) {
		console.error("Add to cart error:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to add to cart",
		};
	}
}

export async function updateCartLineQuantity(
	lineId: string,
	quantity: number,
	channel: string,
): Promise<CartActionResult> {
	try {
		const checkoutId = await getCheckoutIdFromCookie(channel);
		if (!checkoutId) {
			return { success: false, error: "No cart found" };
		}

		const { checkoutLinesUpdate } = await executeGraphQL(SinglesBuilderCartUpdateLinesDocument, {
			variables: {
				id: checkoutId,
				lines: [{ lineId, quantity }],
			},
			cache: "no-cache",
		});

		if (checkoutLinesUpdate?.errors && checkoutLinesUpdate.errors.length > 0) {
			return {
				success: false,
				error: checkoutLinesUpdate.errors[0].message || "Failed to update quantity",
			};
		}

		revalidatePath("/singles-builder");

		return {
			success: true,
			checkout: checkoutLinesUpdate?.checkout as SinglesBuilderCheckoutFragment,
		};
	} catch (error) {
		console.error("Update quantity error:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to update quantity",
		};
	}
}

export async function removeCartLine(
	lineId: string,
	channel: string,
): Promise<CartActionResult> {
	try {
		const checkoutId = await getCheckoutIdFromCookie(channel);
		if (!checkoutId) {
			return { success: false, error: "No cart found" };
		}

		const { checkoutLinesDelete } = await executeGraphQL(SinglesBuilderCartDeleteLinesDocument, {
			variables: {
				id: checkoutId,
				linesIds: [lineId],
			},
			cache: "no-cache",
		});

		if (checkoutLinesDelete?.errors && checkoutLinesDelete.errors.length > 0) {
			return {
				success: false,
				error: checkoutLinesDelete.errors[0].message || "Failed to remove item",
			};
		}

		revalidatePath("/singles-builder");

		return {
			success: true,
			checkout: checkoutLinesDelete?.checkout as SinglesBuilderCheckoutFragment,
		};
	} catch (error) {
		console.error("Remove line error:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to remove item",
		};
	}
}

export async function updateCartMetadata(
	metadata: Array<{ key: string; value: string }>,
	channel: string,
): Promise<CartActionResult> {
	try {
		const checkoutId = await getCheckoutIdFromCookie(channel);
		if (!checkoutId) {
			return { success: false, error: "No cart found" };
		}

		const { updateMetadata } = await executeGraphQL(SinglesBuilderCartUpdateMetadataDocument, {
			variables: {
				id: checkoutId,
				input: metadata,
			},
			cache: "no-cache",
		});

		if (updateMetadata?.errors && updateMetadata.errors.length > 0) {
			return {
				success: false,
				error: updateMetadata.errors[0].message || "Failed to update metadata",
			};
		}

		// The result is wrapped in `item` field for metadata mutations
		const checkout = updateMetadata?.item as SinglesBuilderCheckoutFragment | undefined;

		return {
			success: true,
			checkout,
		};
	} catch (error) {
		console.error("Update metadata error:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to update metadata",
		};
	}
}

// ----- Stable Server Actions for Client Components -----
// These are top-level exports with stable IDs that survive deployments.
// Do NOT use inline "use server" closures in server components — they get
// unique IDs per build and break after redeployment.

export interface FetchMoreFilters {
	conditions?: string[];
	finishes?: string[];
	rarity?: string[];
	inStockOnly?: boolean;
	priceMin?: number | null;
	priceMax?: number | null;
}

export async function fetchMoreProducts(
	channel: string,
	search: string,
	after: string | null,
	filters: FetchMoreFilters,
): Promise<SinglesBuilderSearchQuery["products"]> {
	return fetchMoreWithMeilisearch(search, channel, after, filters);
}

export async function addToCart(
	variantId: string,
	quantity: number,
	channel: string,
): Promise<CartActionResult> {
	return addToSinglesCart(variantId, quantity, channel);
}

// POS handoff: Set customer name, notes, short code, and staff email for auto-import
export async function saveCartForPOS(
	customerName: string,
	notes: string,
	shortCode: string,
	staffEmail: string,
	channel: string,
): Promise<CartActionResult> {
	return updateCartMetadata(
		[
			{ key: "singles_builder_customer", value: customerName },
			{ key: "singles_builder_notes", value: notes },
			{ key: "singles_builder_code", value: shortCode },
			{ key: "singles_builder_staff_email", value: staffEmail },
			{ key: "singles_builder_channel", value: channel },
			{ key: "singles_builder_created", value: new Date().toISOString() },
		],
		channel,
	);
}

// Clear the cart cookie (for starting fresh)
export async function clearSinglesCart(channel: string = "singles-builder"): Promise<void> {
	const cookieStore = await cookies();
	cookieStore.delete(getCheckoutCookieName(channel));
	revalidatePath("/singles-builder");
}
