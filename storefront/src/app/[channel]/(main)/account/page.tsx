import { CurrentUserDocument } from "@/gql/graphql";
import { executeGraphQL } from "@/lib/graphql";
import { LoginForm } from "@/ui/components/LoginForm";
import { LinkWithChannel } from "@/ui/atoms/LinkWithChannel";
import { updateProfile, changePassword } from "./actions";
import { getAccountMessage } from "./messages";

export const dynamic = "force-dynamic";

export default async function AccountPage({
	params,
	searchParams,
}: {
	params: Promise<{ channel: string }>;
	searchParams: Promise<{ status?: string }>;
}) {
	const { channel } = await params;
	const { status } = await searchParams;

	const { me: user } = await executeGraphQL(CurrentUserDocument, {
		cache: "no-cache",
	});

	if (!user) {
		return <LoginForm />;
	}

	const message = getAccountMessage(status);
	const updateProfileWithChannel = updateProfile.bind(null, channel);
	const changePasswordWithChannel = changePassword.bind(null, channel);

	return (
		<div className="mx-auto max-w-7xl p-8">
			<h1 className="text-2xl font-bold tracking-tight text-neutral-900">My Account</h1>

			{message && (
				<div
					className={`mt-4 rounded-md p-4 text-sm ${
						message.type === "success"
							? "bg-green-50 text-green-800"
							: "bg-red-50 text-red-800"
					}`}
				>
					{message.text}
				</div>
			)}

			<div className="mt-8 grid gap-8 md:grid-cols-2">
				{/* Profile Section */}
				<div className="rounded-lg border bg-white">
					<div className="border-b px-6 py-4">
						<h2 className="text-lg font-semibold text-neutral-900">Profile</h2>
					</div>
					<form action={updateProfileWithChannel} className="px-6 py-4">
						<div className="space-y-4">
							<div>
								<label htmlFor="firstName" className="block text-sm font-medium text-neutral-700">
									First Name
								</label>
								<input
									id="firstName"
									name="firstName"
									type="text"
									defaultValue={user.firstName ?? ""}
									className="mt-1 w-full rounded border bg-neutral-50 px-4 py-2"
								/>
							</div>
							<div>
								<label htmlFor="lastName" className="block text-sm font-medium text-neutral-700">
									Last Name
								</label>
								<input
									id="lastName"
									name="lastName"
									type="text"
									defaultValue={user.lastName ?? ""}
									className="mt-1 w-full rounded border bg-neutral-50 px-4 py-2"
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-neutral-700">Email</label>
								<p className="mt-1 text-sm text-neutral-600">{user.email}</p>
							</div>
						</div>
						<button
							type="submit"
							className="mt-6 rounded bg-neutral-800 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
						>
							Save Changes
						</button>
					</form>
				</div>

				{/* Password Section */}
				<div className="rounded-lg border bg-white">
					<div className="border-b px-6 py-4">
						<h2 className="text-lg font-semibold text-neutral-900">Change Password</h2>
					</div>
					<form action={changePasswordWithChannel} className="px-6 py-4">
						<div className="space-y-4">
							<div>
								<label htmlFor="oldPassword" className="block text-sm font-medium text-neutral-700">
									Current Password
								</label>
								<input
									id="oldPassword"
									name="oldPassword"
									type="password"
									required
									autoComplete="current-password"
									className="mt-1 w-full rounded border bg-neutral-50 px-4 py-2"
								/>
							</div>
							<div>
								<label htmlFor="newPassword" className="block text-sm font-medium text-neutral-700">
									New Password
								</label>
								<input
									id="newPassword"
									name="newPassword"
									type="password"
									required
									minLength={8}
									autoComplete="new-password"
									className="mt-1 w-full rounded border bg-neutral-50 px-4 py-2"
								/>
							</div>
							<div>
								<label
									htmlFor="confirmPassword"
									className="block text-sm font-medium text-neutral-700"
								>
									Confirm New Password
								</label>
								<input
									id="confirmPassword"
									name="confirmPassword"
									type="password"
									required
									minLength={8}
									autoComplete="new-password"
									className="mt-1 w-full rounded border bg-neutral-50 px-4 py-2"
								/>
							</div>
						</div>
						<button
							type="submit"
							className="mt-6 rounded bg-neutral-800 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
						>
							Change Password
						</button>
					</form>
				</div>
			</div>

			{/* Quick Links */}
			<div className="mt-8 flex gap-4">
				<LinkWithChannel
					href="/account/addresses"
					className="rounded border px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
				>
					Manage Addresses
				</LinkWithChannel>
				<LinkWithChannel
					href="/orders"
					className="rounded border px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
				>
					View Orders
				</LinkWithChannel>
			</div>
		</div>
	);
}
