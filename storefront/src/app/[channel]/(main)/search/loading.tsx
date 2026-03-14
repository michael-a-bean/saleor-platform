import { ProductGridSkeleton } from "@/ui/components/skeletons/ProductGridSkeleton";

export default function Loading() {
	return (
		<div className="mx-auto max-w-7xl p-8">
			<div className="animate-pulse mb-6">
				<div className="h-7 w-40 rounded bg-neutral-200" />
			</div>
			<div className="grid gap-8 lg:grid-cols-[240px_1fr]">
				{/* Filter sidebar skeleton */}
				<div className="hidden animate-pulse space-y-4 lg:block">
					{Array.from({ length: 5 }).map((_, i) => (
						<div key={i}>
							<div className="mb-2 h-4 w-24 rounded bg-neutral-200" />
							<div className="space-y-2">
								<div className="h-3 w-full rounded bg-neutral-200" />
								<div className="h-3 w-3/4 rounded bg-neutral-200" />
								<div className="h-3 w-1/2 rounded bg-neutral-200" />
							</div>
						</div>
					))}
				</div>
				{/* Product grid */}
				<ProductGridSkeleton count={24} />
			</div>
		</div>
	);
}
