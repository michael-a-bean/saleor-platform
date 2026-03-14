export default function Loading() {
	return (
		<div className="mx-auto max-w-7xl p-8 animate-pulse">
			<div className="h-7 w-32 rounded bg-neutral-200" />
			<div className="mt-8 grid gap-8 md:grid-cols-2">
				{/* Profile card */}
				<div className="rounded-lg border bg-white p-6 space-y-4">
					<div className="h-5 w-20 rounded bg-neutral-200" />
					<div className="h-10 w-full rounded bg-neutral-200" />
					<div className="h-10 w-full rounded bg-neutral-200" />
					<div className="h-4 w-40 rounded bg-neutral-200" />
				</div>
				{/* Password card */}
				<div className="rounded-lg border bg-white p-6 space-y-4">
					<div className="h-5 w-32 rounded bg-neutral-200" />
					<div className="h-10 w-full rounded bg-neutral-200" />
					<div className="h-10 w-full rounded bg-neutral-200" />
					<div className="h-10 w-full rounded bg-neutral-200" />
				</div>
			</div>
		</div>
	);
}
