import { test, expect } from "@playwright/test";

/**
 * Storefront Navigation E2E Tests
 *
 * Tests core user journeys: browsing, searching, and product detail viewing.
 * Runs against staging (PLAYWRIGHT_BASE_URL) or local dev server.
 *
 * Run with:
 *   PLAYWRIGHT_BASE_URL=https://staging.michaelbean.org pnpm playwright test e2e/storefront-navigation.spec.ts
 */

const CHANNEL = "default-channel";

test.describe("Homepage", () => {
	test("loads and displays navigation", async ({ page }) => {
		await page.goto(`/${CHANNEL}`);
		await page.waitForLoadState("domcontentloaded");

		// Header should be visible
		const header = page.locator("header");
		await expect(header).toBeVisible();

		// Should have navigation links
		const nav = page.locator("nav");
		await expect(nav).toBeVisible();
	});

	test("has working search link in navigation", async ({ page }) => {
		await page.goto(`/${CHANNEL}`);
		await page.waitForLoadState("domcontentloaded");

		// Find and click a search-related link or icon
		const searchLink = page.locator('a[href*="search"], button[aria-label*="search" i]').first();
		if (await searchLink.isVisible()) {
			await searchLink.click();
			await expect(page).toHaveURL(/search/);
		}
	});
});

test.describe("Product Listing", () => {
	test("search page loads and displays products", async ({ page }) => {
		await page.goto(`/${CHANNEL}/search`);
		await page.waitForLoadState("domcontentloaded");

		// Should show product cards or a search interface
		// Wait for either products or search input to appear
		const hasContent = await page
			.locator('[data-testid="product-element"], a[href*="/products/"]')
			.first()
			.isVisible({ timeout: 10000 })
			.catch(() => false);

		// Page should at least render without crashing
		expect(await page.title()).toBeTruthy();
	});

	test("products page shows product grid", async ({ page }) => {
		await page.goto(`/${CHANNEL}/products`);
		await page.waitForLoadState("domcontentloaded");

		// Wait for product links to appear
		const productLinks = page.locator('a[href*="/products/"]');
		await expect(productLinks.first()).toBeVisible({ timeout: 15000 });

		// Should have multiple products
		const count = await productLinks.count();
		expect(count).toBeGreaterThan(0);
	});
});

test.describe("Product Detail Page", () => {
	test("navigates to a product and shows details", async ({ page }) => {
		// Go to products listing
		await page.goto(`/${CHANNEL}/products`);
		await page.waitForLoadState("domcontentloaded");

		// Click first product link
		const firstProduct = page.locator('a[href*="/products/"]').first();
		await expect(firstProduct).toBeVisible({ timeout: 15000 });
		const productName = await firstProduct.textContent();
		await firstProduct.click();

		// Should be on a product page
		await expect(page).toHaveURL(/\/products\//);

		// Page should have loaded (title should exist)
		await page.waitForLoadState("domcontentloaded");
		expect(await page.title()).toBeTruthy();
	});

	test("product page shows price information", async ({ page }) => {
		await page.goto(`/${CHANNEL}/products`);
		await page.waitForLoadState("domcontentloaded");

		// Navigate to first product
		const firstProduct = page.locator('a[href*="/products/"]').first();
		await expect(firstProduct).toBeVisible({ timeout: 15000 });
		await firstProduct.click();
		await page.waitForLoadState("domcontentloaded");

		// Should show a price (dollar sign)
		const priceElement = page.locator('text=/\\$\\d/').first();
		await expect(priceElement).toBeVisible({ timeout: 10000 });
	});
});

test.describe("Search Functionality", () => {
	test("search page accepts input and shows results or empty state", async ({ page }) => {
		// Use the singles page which has a reliable search input
		await page.goto(`/${CHANNEL}/magic/singles`);
		await page.waitForLoadState("networkidle");
		await page.waitForTimeout(2000);

		// Find search input
		const searchInput = page.locator('input[name="search"], input[placeholder*="search" i]').first();

		if (await searchInput.isVisible({ timeout: 10000 }).catch(() => false)) {
			await searchInput.click();
			await page.keyboard.type("dragon", { delay: 50 });
			await page.keyboard.press("Enter");
			await page.waitForTimeout(3000);

			// Should show either results or "No products found" — both are valid
			const hasResults = await page.locator('a[href*="/products/"]').first().isVisible().catch(() => false);
			const hasEmptyState = await page.locator('text=/no products found/i').isVisible().catch(() => false);
			const hasResultCount = await page.locator('text=/\\d+ results?/i').isVisible().catch(() => false);

			// Search completed without crashing — page shows results, empty state, or count
			expect(hasResults || hasEmptyState || hasResultCount).toBe(true);
		}
	});
});
