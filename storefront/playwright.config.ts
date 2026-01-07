import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for brand visual regression testing.
 *
 * Usage:
 *   pnpm playwright test --project=desktop
 *   pnpm playwright test --project=mobile
 *   pnpm playwright test --update-snapshots
 */
export default defineConfig({
	testDir: "./e2e",
	outputDir: "../artifacts/visual",
	snapshotDir: "./e2e/snapshots",

	// Run tests in parallel
	fullyParallel: true,

	// Fail build on CI if you accidentally left test.only
	forbidOnly: !!process.env.CI,

	// Retry failed tests
	retries: process.env.CI ? 2 : 0,

	// Reporter
	reporter: [["html", { outputFolder: "../artifacts/visual/report" }]],

	use: {
		// Base URL for tests
		baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",

		// Collect trace on failure
		trace: "on-first-retry",

		// Screenshot on failure
		screenshot: "only-on-failure",
	},

	projects: [
		{
			name: "desktop",
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 1440, height: 900 },
			},
		},
		{
			name: "mobile",
			use: {
				...devices["iPhone 13"],
				viewport: { width: 375, height: 812 },
			},
		},
	],

	// Start local dev server before running tests
	webServer: process.env.CI
		? undefined
		: {
				command: "pnpm dev",
				url: "http://localhost:3000",
				reuseExistingServer: !process.env.CI,
				timeout: 120000,
		  },
});
