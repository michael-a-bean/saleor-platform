import { CurrentUserDocument } from "@/gql/graphql";
import { executeGraphQL } from "@/lib/graphql";
import { LoginForm } from "@/ui/components/LoginForm";
import { StatusBanner } from "@/ui/components/StatusBanner";
import { StoreCreditBadge } from "@/ui/components/StoreCreditBadge";
import { LinkWithChannel } from "@/ui/atoms/LinkWithChannel";
import { updateProfile, changePassword } from "./actions";
import { getAccountMessage } from "./messages";
import { inputClassName, labelClassName } from "./styles";

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
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold tracking-tight text-neutral-900">My Account</h1>
				<StoreCreditBadge />
			</div>

			<StatusBanner message={message} />

			<div className="mt-8 grid gap-8 md:grid-cols-2">
				{/* Profile Section */}
				<div className="rounded-lg border bg-white">
					<div className="border-b px-6 py-4">
						<h2 className="text-lg font-semibold text-neutral-900">Profile</h2>
					</div>
					<form action={updateProfileWithChannel} className="px-6 py-4">
						<div className="space-y-4">
							<div>
								<label htmlFor="firstName" className={labelClassName}>
									First Name
								</label>
								<input
									id="firstName"
									name="firstName"
									type="text"
									defaultValue={user.firstName ?? ""}
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
									defaultValue={user.lastName ?? ""}
									className={inputClassName}
								/>
							</div>
							<div>
								<label className={labelClassName}>Email</label>
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
								<label htmlFor="oldPassword" className={labelClassName}>
									Current Password
								</label>
								<input
									id="oldPassword"
									name="oldPassword"
									type="password"
									required
									autoComplete="current-password"
									className={inputClassName}
								/>
							</div>
							<div>
								<label htmlFor="newPassword" className={labelClassName}>
									New Password
								</label>
								<input
									id="newPassword"
									name="newPassword"
									type="password"
									required
									minLength={8}
									autoComplete="new-password"
									className={inputClassName}
								/>
							</div>
							<div>
								<label
									htmlFor="confirmPassword"
									className={labelClassName}
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
									className={inputClassName}
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
			<div className="mt-8 flex flex-wrap gap-4">
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
				<LinkWithChannel
					href="/account/credit"
					className="rounded border px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
				>
					Store Credit
				</LinkWithChannel>
			</div>
		</div>
	);
}
