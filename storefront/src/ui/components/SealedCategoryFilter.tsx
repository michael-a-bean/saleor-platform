"use client";

import { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { ProductList } from "./ProductList";
import type { ProductListItemFragment } from "@/gql/graphql";

// Regex to trim leading/trailing special chars - extracted to avoid Tailwind scanner false positives
const TRIM_SPECIAL_CHARS = new RegExp(`^[\\-\\:\\s]+|[\\-\\:\\s]+$`, "g");

interface SealedCategoryFilterProps {
	products: readonly ProductListItemFragment[];
}

export function SealedCategoryFilter({ products }: SealedCategoryFilterProps) {
	const [selectedSet, setSelectedSet] = useState<string>("");
	const [isOpen, setIsOpen] = useState(false);

	// Extract unique sets from product names (set names usually appear in product names)
	const availableSets = useMemo(() => {
		const setMap = new Map<string, number>();

		products.forEach((product) => {
			// Extract set name from product name (e.g., "Aetherdrift Play Booster Box" -> "Aetherdrift")
			// Common patterns: "SetName Product Type" or "Product Type - SetName"
			const name = product.name;

			// Try to extract set name - this is a heuristic based on common naming patterns
			// Most sealed products follow: "[Set Name] [Product Type]"
			const productTypes = [
				"Play Booster Box",
				"Collector Booster Box",
				"Draft Booster Box",
				"Set Booster Box",
				"Play Booster Pack",
				"Collector Booster Pack",
				"Booster Box",
				"Booster Pack",
				"Bundle",
				"Gift Bundle",
				"Commander Deck",
				"Challenger Deck",
				"Starter Kit",
				"Prerelease Kit",
				"Prerelease Pack",
			];

			let setName = name;
			for (const type of productTypes) {
				if (name.includes(type)) {
					setName = name.replace(type, "").trim();
					// Remove trailing/leading special chars (hyphens, colons, whitespace)
					setName = setName.replace(TRIM_SPECIAL_CHARS, "").trim();
					break;
				}
			}

			// Only add if we extracted something meaningful
			if (setName && setName.length > 2 && setName !== name) {
				const count = setMap.get(setName) || 0;
				setMap.set(setName, count + 1);
			}
		});

		// Convert to array and sort by name
		return Array.from(setMap.entries())
			.map(([name, count]) => ({ name, count }))
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [products]);

	// Filter products based on selected set
	const filteredProducts = useMemo(() => {
		if (!selectedSet) return products;

		return products.filter((product) => {
			return product.name.toLowerCase().includes(selectedSet.toLowerCase());
		});
	}, [products, selectedSet]);

	const handleSelect = (setName: string) => {
		setSelectedSet(setName);
		setIsOpen(false);
	};

	const handleClear = () => {
		setSelectedSet("");
		setIsOpen(false);
	};

	return (
		<div>
			{/* Filter Controls */}
			{availableSets.length > 0 && (
				<div className="mb-6 flex flex-wrap items-center gap-4">
					<div className="relative">
						<label className="mb-1 block text-xs font-medium text-neutral-500">Filter by Set</label>
						<button
							type="button"
							onClick={() => setIsOpen(!isOpen)}
							className="flex min-w-[200px] items-center justify-between rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:border-neutral-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
						>
							<span className={selectedSet ? "text-neutral-900" : "text-neutral-500"}>
								{selectedSet || "All sets"}
							</span>
							<ChevronDown
								className={`h-4 w-4 text-neutral-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
							/>
						</button>

						{isOpen && (
							<>
								<div className="absolute z-20 mt-1 max-h-60 w-full min-w-[250px] overflow-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
									<button
										type="button"
										onClick={handleClear}
										className={`w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 ${
											!selectedSet ? "bg-purple-50 font-medium text-purple-700" : "text-neutral-600"
										}`}
									>
										All sets ({products.length})
									</button>
									{availableSets.map((set) => (
										<button
											key={set.name}
											type="button"
											onClick={() => handleSelect(set.name)}
											className={`w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 ${
												selectedSet === set.name
													? "bg-purple-50 font-medium text-purple-700"
													: "text-neutral-700"
											}`}
										>
											{set.name} ({set.count})
										</button>
									))}
								</div>
								<div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
							</>
						)}
					</div>

					{selectedSet && (
						<button
							type="button"
							onClick={handleClear}
							className="mt-5 text-sm text-purple-600 hover:text-purple-700"
						>
							Clear filter
						</button>
					)}
				</div>
			)}

			{/* Results Info */}
			{selectedSet && (
				<div className="mb-4 rounded-lg bg-purple-50 px-4 py-2 text-sm text-purple-800">
					Showing {filteredProducts.length} of {products.length} products for &quot;{selectedSet}&quot;
				</div>
			)}

			{/* Product List */}
			{filteredProducts.length > 0 ? (
				<ProductList products={filteredProducts} />
			) : (
				<div className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center">
					<p className="text-neutral-500">No products match the selected filter.</p>
					<button
						type="button"
						onClick={handleClear}
						className="mt-4 text-purple-600 hover:text-purple-700"
					>
						Clear filter
					</button>
				</div>
			)}
		</div>
	);
}
