import { NextRequest, NextResponse } from "next/server";

const TRUSTED_SCRIPT_DOMAINS = [
  "https://js.stripe.com",
  "https://www.googletagmanager.com",
];

const TRUSTED_FRAME_DOMAINS = [
  "https://js.stripe.com",
  "https://hooks.stripe.com",
];

const TRUSTED_CONNECT_DOMAINS = [
  "https://api.stripe.com",
  "https://api.scryfall.com",
  process.env.NEXT_PUBLIC_SALEOR_API_URL?.replace('/graphql/', '') || "http://localhost:8000",
];

const TRUSTED_IMAGE_DOMAINS = [
  // Scryfall card images - main CDN and all subdomains (c1, c2, etc.)
  "https://cards.scryfall.io",
  "https://c1.scryfall.com",
  "https://c2.scryfall.com",
  // Scryfall SVGs - set icons and mana symbols
  "https://svgs.scryfall.io",
  // Saleor API for uploaded media (thumbnail endpoint)
  process.env.NEXT_PUBLIC_SALEOR_API_URL?.replace('/graphql/', '') || "http://localhost:8000",
  // CloudFront CDN for product media and thumbnails (all S3 access goes through CloudFront)
  "https://d30pbahsk8hi4i.cloudfront.net",
];

function buildCSP(): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${TRUSTED_SCRIPT_DOMAINS.join(' ')} 'unsafe-inline'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `img-src 'self' data: blob: ${TRUSTED_IMAGE_DOMAINS.join(' ')}`,
    "font-src 'self' https://fonts.gstatic.com data:",
    `connect-src 'self' ${TRUSTED_CONNECT_DOMAINS.join(' ')} wss://*.saleor.cloud`,
    `frame-src 'self' ${TRUSTED_FRAME_DOMAINS.join(' ')}`,
    "frame-ancestors 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    process.env.NODE_ENV === 'production' && process.env.ENABLE_HTTPS !== 'false' ? "upgrade-insecure-requests" : "",
  ].filter(Boolean).join('; ');
}

function getSecurityHeaders(): Record<string, string> {
  return {
    "Content-Security-Policy": buildCSP(),
    "X-Content-Type-Options": "nosniff",
    "X-XSS-Protection": "1; mode=block",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(self)",
  };
}

// Paths that must not be browser-cached (auth, transactional, interactive)
const DYNAMIC_PATHS = ["/checkout", "/login", "/orders", "/cart", "/singles-builder"];

/**
 * Middleware for security headers, caching, and route protection.
 *
 * - Applies CSP and security headers to all routes
 * - Sets Cache-Control on cacheable catalog pages
 * - Protects /singles-builder/* routes (staff check in layout)
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // Apply security headers to all routes
  const securityHeaders = getSecurityHeaders();
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  // Cache-Control: cache catalog pages, skip auth/transactional routes
  const isDynamic = DYNAMIC_PATHS.some((p) => pathname.startsWith(p));
  if (!isDynamic && !pathname.startsWith("/api")) {
    response.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
