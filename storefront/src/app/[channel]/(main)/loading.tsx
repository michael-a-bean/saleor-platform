import { ProductGridSkeleton } from "@/ui/components/skeletons/ProductGridSkeleton";

export default function Loading() {
	return (
		<div className="mx-auto max-w-7xl p-8">
			<div className="animate-pulse">
				{/* Hero skeleton */}
				<div className="mb-8 h-[400px] w-full rounded-lg bg-neutral-200" />
				{/* Section title */}
				<div className="mb-4 h-7 w-48 rounded bg-neutral-200" />
			</div>
			<ProductGridSkeleton count={8} />
		</div>
	);
}
