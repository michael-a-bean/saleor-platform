import { ProductGridSkeleton } from "@/ui/components/skeletons/ProductGridSkeleton";

export default function Loading() {
	return (
		<div className="mx-auto max-w-7xl p-8">
			<div className="animate-pulse mb-6">
				<div className="h-7 w-48 rounded bg-neutral-200" />
				<div className="mt-4 flex gap-2">
					{Array.from({ length: 4 }).map((_, i) => (
						<div key={i} className="h-8 w-20 rounded-full bg-neutral-200" />
					))}
				</div>
			</div>
			<ProductGridSkeleton count={24} />
		</div>
	);
}
