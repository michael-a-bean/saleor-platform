export default function Loading() {
	return (
		<div className="mx-auto max-w-4xl p-8 animate-pulse">
			{/* Back link */}
			<div className="mb-4 h-4 w-28 rounded bg-neutral-200" />
			{/* Order header */}
			<div className="mb-8">
				<div className="h-7 w-40 rounded bg-neutral-200" />
				<div className="mt-2 h-4 w-32 rounded bg-neutral-200" />
			</div>
			<div className="grid gap-8 lg:grid-cols-3">
				{/* Line items */}
				<div className="lg:col-span-2 space-y-4">
					{Array.from({ length: 3 }).map((_, i) => (
						<div key={i} className="flex gap-4 rounded-lg border bg-white p-4">
							<div className="h-20 w-20 rounded bg-neutral-200" />
							<div className="flex-1 space-y-2">
								<div className="h-4 w-48 rounded bg-neutral-200" />
								<div className="h-3 w-24 rounded bg-neutral-200" />
								<div className="h-3 w-16 rounded bg-neutral-200" />
							</div>
						</div>
					))}
				</div>
				{/* Summary sidebar */}
				<div className="space-y-3 rounded-lg border bg-white p-6">
					<div className="h-5 w-28 rounded bg-neutral-200" />
					{Array.from({ length: 4 }).map((_, i) => (
						<div key={i} className="flex justify-between">
							<div className="h-4 w-16 rounded bg-neutral-200" />
							<div className="h-4 w-12 rounded bg-neutral-200" />
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
