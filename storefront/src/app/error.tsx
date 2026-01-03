"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
	// Determine if we should show technical details (only in development)
	const isDevelopment = process.env.NODE_ENV === "development";

	return (
		<div className="bg-white">
			<div className="mx-auto max-w-7xl px-6 py-12">
				<h1 className="text-2xl font-bold leading-10 tracking-tight text-neutral-800">
					Something went wrong
				</h1>
				<p className="mt-6 max-w-2xl text-base leading-7 text-neutral-600">
					{isDevelopment ? (
						<code className="break-words">{error.message}</code>
					) : (
						"We encountered an unexpected error. Please try again or contact support if the problem persists."
					)}
				</p>
				<div className="mt-8 flex gap-4">
					<button
						className="h-10 rounded-md bg-neutral-900 px-6 font-semibold text-white hover:bg-neutral-800"
						onClick={() => reset()}
					>
						Try again
					</button>
					<button
						className="h-10 rounded-md border border-neutral-300 bg-white px-6 font-semibold text-neutral-700 hover:bg-neutral-50"
						onClick={() => (window.location.href = "/")}
					>
						Go to homepage
					</button>
				</div>
			</div>
		</div>
	);
}
