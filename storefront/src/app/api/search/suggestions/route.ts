import { NextRequest, NextResponse } from "next/server";

const MEILISEARCH_URL = process.env.MEILISEARCH_URL || "http://localhost:7700";
const MEILISEARCH_API_KEY = process.env.MEILISEARCH_API_KEY;

/**
 * Search suggestions endpoint for typeahead.
 * Returns up to 5 product matches from Meilisearch with minimal fields.
 * Includes a 3-second timeout to handle Meilisearch reindex freezes.
 */
export async function GET(req: NextRequest) {
	const query = req.nextUrl.searchParams.get("q");
	const channel = req.nextUrl.searchParams.get("channel") || "webstore";

	if (!query || query.length < 2) {
		return NextResponse.json({ hits: [] });
	}

	// Validate channel to prevent path traversal in Meilisearch URL
	if (!/^[a-z0-9-]+$/.test(channel)) {
		return NextResponse.json({ hits: [] }, { status: 400 });
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 3000);

	try {
		const headers: Record<string, string> = { "Content-Type": "application/json" };
		if (MEILISEARCH_API_KEY) {
			headers["Authorization"] = `Bearer ${MEILISEARCH_API_KEY}`;
		}

		const response = await fetch(
			`${MEILISEARCH_URL}/indexes/${channel}-products/search`,
			{
				method: "POST",
				headers,
				body: JSON.stringify({
					q: query,
					limit: 5,
					attributesToRetrieve: ["name", "slug", "thumbnail", "min_price", "set_name", "set_code", "rarity"],
					attributesToHighlight: ["name"],
					attributesToCrop: [],
				}),
				signal: controller.signal,
			},
		);

		clearTimeout(timeout);

		if (!response.ok) {
			return NextResponse.json({ hits: [] }, { status: 503 });
		}

		const data = (await response.json()) as { hits?: unknown[]; processingTimeMs?: number };
		return NextResponse.json({
			hits: data.hits || [],
			processingTimeMs: data.processingTimeMs || 0,
		});
	} catch {
		clearTimeout(timeout);
		return NextResponse.json({ hits: [] }, { status: 503 });
	}
}
