import { StatusBanner, type StatusMessage } from "@/ui/components/StatusBanner";
import { confirmEmailChangeAction } from "./actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

const confirmMessages: Record<string, StatusMessage> = {
	confirm_error: { type: "error", text: "Email confirmation failed. The link may have expired." },
};

export default async function ConfirmEmailPage({
	params,
	searchParams,
}: {
	params: Promise<{ channel: string }>;
	searchParams: Promise<{ token?: string; status?: string }>;
}) {
	const { channel } = await params;
	const { token, status } = await searchParams;

	const message = status ? (confirmMessages[status] ?? null) : null;

	if (!token) {
		return (
			<div className="mx-auto max-w-7xl p-8">
				<h1 className="text-center text-2xl font-bold tracking-tight text-neutral-900">
					Confirm Email Change
				</h1>
				<StatusBanner
					message={{ type: "error", text: "Invalid or missing confirmation token." }}
				/>
				<p className="mt-4 text-center text-sm text-neutral-600">
					<Link
						href={`/${channel}/account`}
						className="text-blue-600 hover:text-blue-800"
					>
						Back to account
					</Link>
				</p>
			</div>
		);
	}

	const confirmWithChannel = confirmEmailChangeAction.bind(null, channel);

	return (
		<div className="mx-auto max-w-7xl p-8">
			<h1 className="text-center text-2xl font-bold tracking-tight text-neutral-900">
				Confirm Email Change
			</h1>

			<StatusBanner message={message} />

			<div className="mx-auto mt-8 w-full max-w-lg">
				<div className="rounded border bg-white p-8 shadow-md">
					<p className="mb-6 text-sm text-neutral-600">
						Click the button below to confirm your email address change.
					</p>
					<form action={confirmWithChannel}>
						<input type="hidden" name="token" value={token} />
						<button
							type="submit"
							className="w-full rounded bg-neutral-800 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
						>
							Confirm Email Change
						</button>
					</form>
					<p className="mt-4 text-center text-sm text-neutral-600">
						<Link
							href={`/${channel}/account`}
							className="text-blue-600 hover:text-blue-800"
						>
							Back to account
						</Link>
					</p>
				</div>
			</div>
		</div>
	);
}
