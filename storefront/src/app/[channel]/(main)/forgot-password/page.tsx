import { StatusBanner, type StatusMessage } from "@/ui/components/StatusBanner";
import { inputClassName, labelClassName } from "../account/styles";
import { requestPasswordResetAction } from "./actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

const forgotPasswordMessages: Record<string, StatusMessage> = {
	email_sent: {
		type: "success",
		text: "If an account with that email exists, we've sent a password reset link.",
	},
};

export default async function ForgotPasswordPage({
	params,
	searchParams,
}: {
	params: Promise<{ channel: string }>;
	searchParams: Promise<{ status?: string }>;
}) {
	const { channel } = await params;
	const { status } = await searchParams;

	const message = status ? (forgotPasswordMessages[status] ?? null) : null;
	const requestResetWithChannel = requestPasswordResetAction.bind(null, channel);

	return (
		<div className="mx-auto max-w-7xl p-8">
			<h1 className="text-center text-2xl font-bold tracking-tight text-neutral-900">
				Forgot Password
			</h1>

			<StatusBanner message={message} />

			<div className="mx-auto mt-8 w-full max-w-lg">
				<form action={requestResetWithChannel} className="rounded border bg-white p-8 shadow-md">
					<p className="mb-4 text-sm text-neutral-600">
						Enter your email address and we'll send you a link to reset your password.
					</p>
					<div>
						<label htmlFor="email" className={labelClassName}>
							Email
						</label>
						<input
							id="email"
							name="email"
							type="email"
							required
							autoComplete="email"
							className={inputClassName}
						/>
					</div>

					<button
						type="submit"
						className="mt-6 w-full rounded bg-neutral-800 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
					>
						Send Reset Link
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
