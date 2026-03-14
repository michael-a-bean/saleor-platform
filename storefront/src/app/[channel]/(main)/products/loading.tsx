import { ProductGridSkeleton } from "@/ui/components/skeletons/ProductGridSkeleton";

export default function Loading() {
	return (
		<div className="mx-auto max-w-7xl p-8">
			<div className="animate-pulse mb-6">
				<div className="h-7 w-36 rounded bg-neutral-200" />
				<div className="mt-2 h-4 w-24 rounded bg-neutral-200" />
			</div>
			<ProductGridSkeleton count={12} />
		</div>
	);
}
