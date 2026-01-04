export const dynamic = "force-dynamic";

/**
 * Singles Builder Main Page
 *
 * This is the main interface for staff to search and build carts
 * of MTG singles for customers.
 *
 * Features (to be implemented):
 * - Fast debounced search
 * - Filter sidebar (set, rarity, foil, condition, price, in-stock)
 * - Virtualized results list
 * - Cart drawer with quantity management
 * - Short code generation for POS handoff
 */
export default async function SinglesBuilderPage(props: {
	params: Promise<{ channel: string }>;
	searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
	const { channel } = await props.params;
	const searchParams = await props.searchParams;
	const searchQuery = typeof searchParams.q === "string" ? searchParams.q : "";

	return (
		<div className="mx-auto max-w-7xl px-4 py-6">
			{/* Search Header */}
			<div className="mb-6">
				<form method="GET" action={`/singles-builder/${channel}`}>
					<div className="relative">
						<input
							type="text"
							name="q"
							defaultValue={searchQuery}
							placeholder="Search cards by name, set, collector number..."
							className="w-full rounded-lg border border-gray-300 px-4 py-3 pl-12 text-lg shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
						<svg
							className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
							/>
						</svg>
					</div>
				</form>
			</div>

			{/* Main Content Area */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
				{/* Filter Sidebar (Placeholder) */}
				<aside className="rounded-lg border bg-white p-4 shadow-sm lg:col-span-1">
					<h2 className="mb-4 font-semibold text-gray-900">Filters</h2>
					<div className="space-y-4 text-sm text-gray-500">
						<div className="rounded border border-dashed border-gray-300 p-4 text-center">
							<p>Filter sidebar</p>
							<p className="text-xs">(Coming in PR3)</p>
						</div>
						<div className="space-y-2">
							<label className="flex items-center gap-2">
								<input type="checkbox" className="rounded" />
								<span>In Stock Only</span>
							</label>
						</div>
					</div>
				</aside>

				{/* Results Area (Placeholder) */}
				<section className="lg:col-span-3">
					<div className="mb-4 flex items-center justify-between">
						<p className="text-sm text-gray-600">
							{searchQuery ? `Searching for "${searchQuery}"...` : "Enter a search term to find cards"}
						</p>
						<select className="rounded border px-2 py-1 text-sm">
							<option>Sort: Relevance</option>
							<option>Sort: Price (Low)</option>
							<option>Sort: Price (High)</option>
							<option>Sort: Name (A-Z)</option>
						</select>
					</div>

					{searchQuery ? (
						<div className="rounded-lg border bg-white p-8 text-center shadow-sm">
							<p className="text-gray-500">Search results will appear here</p>
							<p className="mt-2 text-sm text-gray-400">
								Virtualized list implementation coming in PR2
							</p>
						</div>
					) : (
						<div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
							<svg
								className="mx-auto h-12 w-12 text-gray-400"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={1.5}
									d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
								/>
							</svg>
							<h3 className="mt-4 text-lg font-medium text-gray-900">Search for cards</h3>
							<p className="mt-2 text-gray-500">
								Start typing to search for MTG singles across all printings and variants.
							</p>
						</div>
					)}
				</section>
			</div>

			{/* Cart Drawer Placeholder */}
			<div className="fixed bottom-4 right-4">
				<button
					type="button"
					className="flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-white shadow-lg hover:bg-blue-700"
				>
					<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
						/>
					</svg>
					<span>Cart (0)</span>
				</button>
			</div>
		</div>
	);
}
