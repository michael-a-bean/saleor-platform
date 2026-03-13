import { NextRequest, NextResponse } from "next/server";

// Cache for 24 hours - set icons rarely change
const CACHE_MAX_AGE = 86400;

// In-memory stale cache for serving icons when Scryfall is down
const staleCache = new Map<string, string>();

/**
 * Proxy for Scryfall set icons to avoid CORS issues.
 * CSS mask-image triggers CORS requests, but Scryfall doesn't serve CORS headers.
 *
 * On Scryfall failure, serves stale cached version if available (survives outages).
 *
 * Usage: /api/scryfall-icon?set=dsk
 */
export async function GET(request: NextRequest) {
  const setCode = request.nextUrl.searchParams.get("set");

  if (!setCode || !/^[a-zA-Z0-9]{2,6}$/.test(setCode)) {
    return new NextResponse("Invalid set code", { status: 400 });
  }

  const cacheKey = setCode.toLowerCase();
  const scryfallUrl = `https://svgs.scryfall.io/sets/${cacheKey}.svg`;

  try {
    const response = await fetch(scryfallUrl, {
      next: { revalidate: CACHE_MAX_AGE },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      // Scryfall returned an error — try stale cache
      const stale = staleCache.get(cacheKey);
      if (stale) {
        return new NextResponse(stale, {
          status: 200,
          headers: {
            "Content-Type": "image/svg+xml",
            "Cache-Control": `public, max-age=60, stale-while-revalidate=${CACHE_MAX_AGE}`,
            "X-Stale-Cache": "true",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
      return new NextResponse("Set icon not found", { status: 404 });
    }

    const svg = await response.text();

    // Cache successful response for stale serving during outages
    staleCache.set(cacheKey, svg);

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

    // Serve stale cached version if available during network failures
    const stale = staleCache.get(cacheKey);
    if (stale) {
      return new NextResponse(stale, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": `public, max-age=60, stale-while-revalidate=${CACHE_MAX_AGE}`,
          "X-Stale-Cache": "true",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    return new NextResponse("Failed to fetch icon", { status: 502 });
  }
}
