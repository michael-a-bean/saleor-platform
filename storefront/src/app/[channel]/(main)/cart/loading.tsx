export default function Loading() {
	return (
		<div className="mx-auto max-w-4xl p-8 animate-pulse">
			<div className="h-7 w-28 rounded bg-neutral-200 mb-6" />
			<div className="grid gap-8 lg:grid-cols-[1fr_300px]">
				{/* Cart items */}
				<div className="space-y-4">
					{Array.from({ length: 3 }).map((_, i) => (
						<div key={i} className="flex gap-4 rounded-lg border bg-white p-4">
							<div className="h-24 w-24 rounded bg-neutral-200" />
							<div className="flex-1 space-y-2">
								<div className="h-4 w-48 rounded bg-neutral-200" />
								<div className="h-3 w-24 rounded bg-neutral-200" />
								<div className="flex items-center gap-2 mt-2">
									<div className="h-8 w-8 rounded bg-neutral-200" />
									<div className="h-4 w-6 rounded bg-neutral-200" />
									<div className="h-8 w-8 rounded bg-neutral-200" />
								</div>
							</div>
							<div className="h-4 w-12 rounded bg-neutral-200" />
						</div>
					))}
				</div>
				{/* Summary */}
				<div className="rounded-lg border bg-white p-6 space-y-3 h-fit">
					<div className="h-5 w-28 rounded bg-neutral-200" />
					<div className="flex justify-between">
						<div className="h-4 w-16 rounded bg-neutral-200" />
						<div className="h-4 w-12 rounded bg-neutral-200" />
					</div>
					<div className="flex justify-between border-t pt-3">
						<div className="h-5 w-12 rounded bg-neutral-200" />
						<div className="h-5 w-16 rounded bg-neutral-200" />
					</div>
					<div className="h-10 w-full rounded bg-neutral-200 mt-4" />
				</div>
			</div>
		</div>
	);
}
