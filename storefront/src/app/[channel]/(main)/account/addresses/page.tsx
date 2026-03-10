import { MeWithAddressesDocument } from "@/gql/graphql";
import { executeGraphQL } from "@/lib/graphql";
import { LoginForm } from "@/ui/components/LoginForm";
import { StatusBanner } from "@/ui/components/StatusBanner";
import { LinkWithChannel } from "@/ui/atoms/LinkWithChannel";
import { AddressCard } from "./AddressCard";
import { AddressForm } from "./AddressForm";
import { getAddressMessage } from "../messages";

export const dynamic = "force-dynamic";

export default async function AddressesPage({
	params,
	searchParams,
}: {
	params: Promise<{ channel: string }>;
	searchParams: Promise<{ status?: string; add?: string; edit?: string }>;
}) {
	const { channel } = await params;
	const { status, add, edit } = await searchParams;

	const { me: user } = await executeGraphQL(MeWithAddressesDocument, {
		cache: "no-cache",
	});

	if (!user) {
		return <LoginForm redirectTo={`/${channel}/account/addresses`} />;
	}

	const addresses = user.addresses ?? [];
	const defaultShippingId = user.defaultShippingAddress?.id;
	const defaultBillingId = user.defaultBillingAddress?.id;
	const editingAddress = edit ? addresses.find((a) => a.id === edit) : null;
	const message = getAddressMessage(status);

	return (
		<div className="mx-auto max-w-7xl p-8">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold tracking-tight text-neutral-900">Addresses</h1>
				<LinkWithChannel
					href="/account"
					className="text-sm font-medium text-neutral-500 hover:text-neutral-700"
				>
					Back to Account
				</LinkWithChannel>
			</div>

			<StatusBanner message={message} />

			{/* Add/Edit Form */}
			{(add !== undefined || editingAddress) && (
				<div className="mt-6 rounded-lg border bg-white p-6">
					<h2 className="mb-4 text-lg font-semibold text-neutral-900">
						{editingAddress ? "Edit Address" : "Add New Address"}
					</h2>
					<AddressForm channelSlug={channel} address={editingAddress ?? undefined} />
				</div>
			)}

			{/* Address List */}
			{addresses.length === 0 ? (
				<div className="mt-8 rounded border border-neutral-100 bg-white p-8 text-center">
					<p className="text-neutral-500">No addresses saved yet.</p>
					<LinkWithChannel
						href="/account/addresses?add"
						className="mt-4 inline-block rounded bg-neutral-800 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
					>
						Add Address
					</LinkWithChannel>
				</div>
			) : (
				<>
					<div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{addresses.map((address) => (
							<AddressCard
								key={address.id}
								address={address}
								channelSlug={channel}
								isDefaultShipping={address.id === defaultShippingId}
								isDefaultBilling={address.id === defaultBillingId}
							/>
						))}
					</div>
					{add === undefined && !editingAddress && (
						<div className="mt-6">
							<LinkWithChannel
								href="/account/addresses?add"
								className="rounded bg-neutral-800 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
							>
								Add Address
							</LinkWithChannel>
						</div>
					)}
				</>
			)}
		</div>
	);
}
