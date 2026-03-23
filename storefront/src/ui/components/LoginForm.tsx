import Link from "next/link";
import { loginAction } from "./login-actions";

export async function LoginForm({
	redirectTo = "/",
	channel,
}: {
	redirectTo?: string;
	channel?: string;
}) {
	// Extract channel from redirectTo if not explicitly provided
	const resolvedChannel = channel || extractChannel(redirectTo);

	return (
		<div className="mx-auto mt-8 w-full max-w-lg">
			<form className="rounded border p-8 shadow-md" action={loginAction}>
				<input type="hidden" name="redirectTo" value={redirectTo} />
				<div className="mb-2">
					<label className="sr-only" htmlFor="email">
						Email
					</label>
					<input
						required
						type="email"
						name="email"
						placeholder="Email"
						autoComplete="email"
						className="w-full rounded border bg-neutral-50 px-4 py-2"
					/>
				</div>
				<div className="mb-4">
					<label className="sr-only" htmlFor="password">
						Password
					</label>
					<input
						required
						type="password"
						name="password"
						placeholder="Password"
						autoCapitalize="off"
						autoComplete="current-password"
						className="w-full rounded border bg-neutral-50 px-4 py-2"
					/>
				</div>

				<button
					className="w-full rounded bg-neutral-800 px-4 py-2 text-neutral-200 hover:bg-neutral-700"
					type="submit"
				>
					Log In
				</button>

				{resolvedChannel && (
					<div className="mt-4 flex items-center justify-between text-sm">
						<Link
							href={`/${resolvedChannel}/forgot-password`}
							className="text-blue-600 hover:text-blue-800"
						>
							Forgot password?
						</Link>
						<Link
							href={`/${resolvedChannel}/register`}
							className="text-blue-600 hover:text-blue-800"
						>
							Create an account
						</Link>
					</div>
				)}
			</form>
		</div>
	);
}

function extractChannel(redirectTo: string): string | null {
	// redirectTo format: /{channel}/account or /{channel}/...
	const match = redirectTo.match(/^\/([^/]+)\//);
	return match ? match[1] : null;
}
