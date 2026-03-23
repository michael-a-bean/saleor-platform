import { getCurrentUser } from "@/lib/currentUser";
import { StatusBanner, type StatusMessage } from "@/ui/components/StatusBanner";
import { inputClassName, labelClassName } from "../account/styles";
import { registerAction } from "./actions";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const registerMessages: Record<string, StatusMessage> = {
	email_taken: { type: "error", text: "An account with that email already exists." },
	registration_error: { type: "error", text: "Registration failed. Please try again." },
	passwords_mismatch: { type: "error", text: "Passwords do not match." },
	password_too_short: { type: "error", text: "Password must be at least 8 characters." },
};

export default async function RegisterPage({
	params,
	searchParams,
}: {
	params: Promise<{ channel: string }>;
	searchParams: Promise<{ status?: string }>;
}) {
	const { channel } = await params;
	const { status } = await searchParams;

	const user = await getCurrentUser();
	if (user) {
		redirect(`/${channel}/account`);
	}

	const message = status ? (registerMessages[status] ?? null) : null;
	const registerWithChannel = registerAction.bind(null, channel);

	return (
		<div className="mx-auto max-w-7xl p-8">
			<h1 className="text-center text-2xl font-bold tracking-tight text-neutral-900">
				Create Account
			</h1>

			<StatusBanner message={message} />

			<div className="mx-auto mt-8 w-full max-w-lg">
				<form action={registerWithChannel} className="rounded border bg-white p-8 shadow-md">
					<div className="space-y-4">
						<div className="grid gap-4 sm:grid-cols-2">
							<div>
								<label htmlFor="firstName" className={labelClassName}>
									First Name
								</label>
								<input
									id="firstName"
									name="firstName"
									type="text"
									autoComplete="given-name"
									className={inputClassName}
								/>
							</div>
							<div>
								<label htmlFor="lastName" className={labelClassName}>
									Last Name
								</label>
								<input
									id="lastName"
									name="lastName"
									type="text"
									autoComplete="family-name"
									className={inputClassName}
								/>
							</div>
						</div>
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
						<div>
							<label htmlFor="password" className={labelClassName}>
								Password
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
								Confirm Password
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
						Create Account
					</button>

					<p className="mt-4 text-center text-sm text-neutral-600">
						Already have an account?{" "}
						<Link
							href={`/${channel}/login`}
							className="text-blue-600 hover:text-blue-800"
						>
							Log in
						</Link>
					</p>
				</form>
			</div>
		</div>
	);
}
