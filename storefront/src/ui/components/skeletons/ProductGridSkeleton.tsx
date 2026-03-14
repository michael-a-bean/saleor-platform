export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
	return (
		<div className="animate-pulse">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: count }).map((_, i) => (
					<div key={i} className="flex flex-col gap-2">
						<div className="aspect-[488/680] rounded bg-neutral-200" />
						<div className="h-4 w-3/4 rounded bg-neutral-200" />
						<div className="h-4 w-1/3 rounded bg-neutral-200" />
					</div>
				))}
			</div>
		</div>
	);
}
