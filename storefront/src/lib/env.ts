/**
 * Environment Detection and Utilities
 *
 * Provides type-safe access to build-time environment configuration.
 * BUILD_ENV is baked into the Docker image at build time via NEXT_PUBLIC_BUILD_ENV.
 *
 * Usage:
 *   import { getEnvironment, isProduction, isStaging, isLocal } from "@/lib/env";
 *
 *   if (isLocal()) {
 *     console.log("Running in local development");
 *   }
 */

export type Environment = "production" | "staging" | "local";

/**
 * Get the current build environment.
 * Defaults to "production" if not set (fail-safe).
 */
export function getEnvironment(): Environment {
	const env = process.env.NEXT_PUBLIC_BUILD_ENV;

	if (env === "staging") return "staging";
	if (env === "local" || env === "development") return "local";

	// Default to production for safety
	return "production";
}

/**
 * Check if running in production environment.
 */
export function isProduction(): boolean {
	return getEnvironment() === "production";
}

/**
 * Check if running in staging environment.
 */
export function isStaging(): boolean {
	return getEnvironment() === "staging";
}

/**
 * Check if running in local development environment.
 */
export function isLocal(): boolean {
	return getEnvironment() === "local";
}

/**
 * Get the current API URL.
 * Useful for debugging which backend the frontend is connected to.
 */
export function getApiUrl(): string {
	return process.env.NEXT_PUBLIC_SALEOR_API_URL || "not configured";
}

/**
 * Get the storefront URL.
 */
export function getStorefrontUrl(): string {
	return process.env.NEXT_PUBLIC_STOREFRONT_URL || "not configured";
}

/**
 * Build metadata for debugging.
 * Only exposed in non-production environments.
 */
export function getBuildMetadata(): Record<string, string> | null {
	if (isProduction()) {
		return null;
	}

	return {
		BUILD_ENV: getEnvironment(),
		API_URL: getApiUrl(),
		STOREFRONT_URL: getStorefrontUrl(),
		NODE_ENV: process.env.NODE_ENV || "unknown",
	};
}
