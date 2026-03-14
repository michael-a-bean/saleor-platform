export function OrderListSkeleton({ count = 5 }: { count?: number }) {
	return (
		<div className="animate-pulse space-y-3">
			{Array.from({ length: count }).map((_, i) => (
				<div key={i} className="flex items-center justify-between rounded-lg border bg-white p-4">
					<div className="flex items-center gap-4">
						<div className="h-12 w-12 rounded bg-neutral-200" />
						<div className="space-y-2">
							<div className="h-4 w-32 rounded bg-neutral-200" />
							<div className="h-3 w-20 rounded bg-neutral-200" />
						</div>
					</div>
					<div className="h-4 w-16 rounded bg-neutral-200" />
				</div>
			))}
		</div>
	);
}
