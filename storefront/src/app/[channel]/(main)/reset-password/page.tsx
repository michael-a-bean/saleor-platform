import { StatusBanner, type StatusMessage } from "@/ui/components/StatusBanner";
import { inputClassName, labelClassName } from "../account/styles";
import { resetPasswordAction } from "./actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

const resetMessages: Record<string, StatusMessage> = {
	passwords_mismatch: { type: "error", text: "Passwords do not match." },
	password_too_short: { type: "error", text: "Password must be at least 8 characters." },
	reset_error: { type: "error", text: "Password reset failed. The link may have expired." },
	invalid_token: { type: "error", text: "Invalid or missing reset token. Please request a new link." },
};

export default async function ResetPasswordPage({
	params,
	searchParams,
}: {
	params: Promise<{ channel: string }>;
	searchParams: Promise<{ email?: string; token?: string; status?: string }>;
}) {
	const { channel } = await params;
	const { email, token, status } = await searchParams;

	const message = status ? (resetMessages[status] ?? null) : null;

	if (!token) {
		return (
			<div className="mx-auto max-w-7xl p-8">
				<h1 className="text-center text-2xl font-bold tracking-tight text-neutral-900">
					Reset Password
				</h1>
				<StatusBanner message={resetMessages.invalid_token} />
				<p className="mt-4 text-center text-sm text-neutral-600">
					<Link
						href={`/${channel}/forgot-password`}
						className="text-blue-600 hover:text-blue-800"
					>
						Request a new reset link
					</Link>
				</p>
			</div>
		);
	}

	const resetWithChannel = resetPasswordAction.bind(null, channel);

	return (
		<div className="mx-auto max-w-7xl p-8">
			<h1 className="text-center text-2xl font-bold tracking-tight text-neutral-900">
				Reset Password
			</h1>

			<StatusBanner message={message} />

			<div className="mx-auto mt-8 w-full max-w-lg">
				<form action={resetWithChannel} className="rounded border bg-white p-8 shadow-md">
					<input type="hidden" name="email" value={email ?? ""} />
					<input type="hidden" name="token" value={token} />

					<div className="space-y-4">
						<div>
							<label htmlFor="password" className={labelClassName}>
								New Password
							</label>
							<input
								id="password"
								name="password"
								type="password"
								required
								minLength={8}
								autoComplete="new-password"
								className={inputClassName}
							/>
						</div>
						<div>
							<label htmlFor="confirmPassword" className={labelClassName}>
								Confirm New Password
							</label>
							<input
								id="confirmPassword"
								name="confirmPassword"
								type="password"
								required
								minLength={8}
								autoComplete="new-password"
								className={inputClassName}
							/>
						</div>
					</div>

					<button
						type="submit"
						className="mt-6 w-full rounded bg-neutral-800 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
					>
						Reset Password
					</button>

					<p className="mt-4 text-center text-sm text-neutral-600">
						<Link
							href={`/${channel}/login`}
							className="text-blue-600 hover:text-blue-800"
						>
							Back to login
						</Link>
					</p>
				</form>
			</div>
		</div>
	);
}
