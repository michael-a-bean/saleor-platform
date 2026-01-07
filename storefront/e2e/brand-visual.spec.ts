import { test, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

/**
 * Brand Visual Regression Tests
 *
 * These tests capture screenshots of key pages to verify brand styling
 * and run accessibility checks.
 *
 * Run with:
 *   pnpm playwright test e2e/brand-visual.spec.ts
 *   pnpm playwright test e2e/brand-visual.spec.ts --update-snapshots
 */

const CHANNEL = "default-channel"; // Adjust as needed

// Key routes for visual regression
const ROUTES = [
	{ name: "home", path: `/${CHANNEL}` },
	{ name: "search", path: `/${CHANNEL}/search` },
	{ name: "login", path: `/${CHANNEL}/login` },
	// Note: PLP/PDP require actual product data
];

test.describe("Brand Visual Regression", () => {
	for (const route of ROUTES) {
		test(`screenshot: ${route.name}`, async ({ page }) => {
			await page.goto(route.path);

			// Wait for content to load
			await page.waitForLoadState("networkidle");

			// Take full page screenshot
			await expect(page).toHaveScreenshot(`${route.name}.png`, {
				fullPage: true,
				maxDiffPixels: 100, // Allow minor differences
			});
		});
	}
});

test.describe("Accessibility Checks", () => {
	for (const route of ROUTES) {
		test(`a11y: ${route.name}`, async ({ page }) => {
			await page.goto(route.path);
			await page.waitForLoadState("networkidle");

			// Run axe accessibility scan
			const results = await new AxeBuilder({ page })
				.withTags(["wcag2a", "wcag2aa", "wcag21aa"])
				.exclude(".skip-a11y") // Exclude any elements marked to skip
				.analyze();

			// Log violations for debugging
			if (results.violations.length > 0) {
				console.log(`Accessibility violations on ${route.name}:`);
				results.violations.forEach((v) => {
					console.log(`  - ${v.id}: ${v.description}`);
					console.log(`    Impact: ${v.impact}`);
					console.log(`    Nodes: ${v.nodes.length}`);
				});
			}

			// Fail on serious or critical violations
			const seriousViolations = results.violations.filter(
				(v) => v.impact === "serious" || v.impact === "critical",
			);

			expect(seriousViolations).toHaveLength(0);
		});
	}
});

test.describe("MTG Color Preservation", () => {
	test("search page preserves MTG filter colors", async ({ page }) => {
		// Navigate to search with color filter
		await page.goto(`/${CHANNEL}/search?color=mtg-color-u`);
		await page.waitForLoadState("networkidle");

		// Capture screenshot to verify MTG blue is visible
		await expect(page).toHaveScreenshot("mtg-color-filter.png", {
			fullPage: false,
			maxDiffPixels: 100,
		});
	});
});

test.describe("Brand Elements", () => {
	test("header has brand logo", async ({ page }) => {
		await page.goto(`/${CHANNEL}`);

		// Check logo is present
		const logo = page.locator('header img[alt*="Shuffle"]');
		await expect(logo).toBeVisible();

		// Verify logo dimensions are reasonable
		const box = await logo.boundingBox();
		expect(box?.width).toBeGreaterThan(100);
	});

	test("favicon is set", async ({ page }) => {
		await page.goto(`/${CHANNEL}`);

		// Check for favicon link
		const favicon = page.locator('link[rel="icon"]');
		await expect(favicon).toHaveCount(3); // ico, 16x16, 32x32
	});

	test("site title includes brand name", async ({ page }) => {
		await page.goto(`/${CHANNEL}`);

		// Check page title
		const title = await page.title();
		expect(title).toContain("Shuffle and Cut");
	});
});
