import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware to protect the Singles Builder routes.
 * Only staff users can access /singles-builder/* routes.
 *
 * The actual staff check is done in the layout component since middleware
 * cannot easily access cookies from @saleor/auth-sdk. This middleware
 * handles the initial routing logic.
 */
export function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;

	// Only apply to singles-builder routes
	if (!pathname.startsWith("/singles-builder")) {
		return NextResponse.next();
	}

	// The layout will handle the actual auth check
	// This middleware just ensures the route exists and passes through
	return NextResponse.next();
}

export const config = {
	matcher: ["/singles-builder/:path*"],
};
