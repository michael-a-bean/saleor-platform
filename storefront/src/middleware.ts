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
  "https://cards.scryfall.io",
  "https://c2.scryfall.com",
  process.env.NEXT_PUBLIC_SALEOR_API_URL?.replace('/graphql/', '') || "http://localhost:8000",
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

/**
 * Middleware for security headers and route protection.
 *
 * - Applies CSP and security headers to all routes
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

  // Singles-builder routes require staff auth (handled in layout)
  if (pathname.startsWith("/singles-builder")) {
    // The layout will handle the actual auth check
    // This middleware just ensures the route exists and passes through
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
