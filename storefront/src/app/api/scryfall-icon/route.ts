import { NextRequest, NextResponse } from "next/server";

// Cache for 24 hours - set icons rarely change
const CACHE_MAX_AGE = 86400;

/**
 * Proxy for Scryfall set icons to avoid CORS issues.
 * CSS mask-image triggers CORS requests, but Scryfall doesn't serve CORS headers.
 *
 * Usage: /api/scryfall-icon?set=dsk
 */
export async function GET(request: NextRequest) {
  const setCode = request.nextUrl.searchParams.get("set");

  if (!setCode || !/^[a-zA-Z0-9]{2,6}$/.test(setCode)) {
    return new NextResponse("Invalid set code", { status: 400 });
  }

  const scryfallUrl = `https://svgs.scryfall.io/sets/${setCode.toLowerCase()}.svg`;

  try {
    const response = await fetch(scryfallUrl, {
      next: { revalidate: CACHE_MAX_AGE },
    });

    if (!response.ok) {
      return new NextResponse("Set icon not found", { status: 404 });
    }

    const svg = await response.text();

    return new NextResponse(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": `public, max-age=${CACHE_MAX_AGE}, stale-while-revalidate=${CACHE_MAX_AGE * 2}`,
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error(`Failed to fetch Scryfall icon for set ${setCode}:`, error);
    return new NextResponse("Failed to fetch icon", { status: 502 });
  }
}
