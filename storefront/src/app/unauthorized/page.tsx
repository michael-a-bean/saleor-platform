import Link from "next/link";

/**
 * Unauthorized Access Page
 *
 * Displayed when a non-staff user attempts to access staff-only routes.
 */
export default function UnauthorizedPage() {
	return (
		<div className="flex min-h-screen items-center justify-center bg-gray-50">
			<div className="text-center">
				<div className="mb-6">
					<svg
						className="mx-auto h-16 w-16 text-red-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={1.5}
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						/>
					</svg>
				</div>
				<h1 className="mb-2 text-2xl font-bold text-gray-900">Access Denied</h1>
				<p className="mb-6 text-gray-600">
					You don&apos;t have permission to access this page.
					<br />
					This area is restricted to staff members only.
				</p>
				<div className="flex justify-center gap-4">
					<Link
						href="/webstore"
						className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
					>
						Go to Store
					</Link>
					<Link
						href="/webstore/login"
						className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50"
					>
						Sign In
					</Link>
				</div>
			</div>
		</div>
	);
}
