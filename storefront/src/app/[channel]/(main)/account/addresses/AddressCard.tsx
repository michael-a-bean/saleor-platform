"use client";

import { useTransition } from "react";
import { LinkWithChannel } from "@/ui/atoms/LinkWithChannel";
import { deleteAddress, setDefaultAddress } from "../actions";
import { AddressTypeEnum } from "@/gql/graphql";
import type { AccountAddress } from "./types";

type Props = {
	address: AccountAddress;
	channelSlug: string;
	isDefaultShipping: boolean;
	isDefaultBilling: boolean;
};

export function AddressCard({ address, channelSlug, isDefaultShipping, isDefaultBilling }: Props) {
	const [isPending, startTransition] = useTransition();

	return (
		<div className="rounded-lg border bg-white p-4">
			<div className="mb-2 flex flex-wrap gap-1">
				{isDefaultShipping && (
					<span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
						Default Shipping
					</span>
				)}
				{isDefaultBilling && (
					<span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
						Default Billing
					</span>
				)}
			</div>

			<p className="font-medium text-neutral-900">
				{address.firstName} {address.lastName}
			</p>
			{address.companyName && <p className="text-sm text-neutral-600">{address.companyName}</p>}
			<p className="text-sm text-neutral-600">{address.streetAddress1}</p>
			{address.streetAddress2 && (
				<p className="text-sm text-neutral-600">{address.streetAddress2}</p>
			)}
			<p className="text-sm text-neutral-600">
				{address.city}
				{address.countryArea ? `, ${address.countryArea}` : ""} {address.postalCode}
			</p>
			<p className="text-sm text-neutral-600">{address.country.country}</p>
			{address.phone && <p className="mt-1 text-sm text-neutral-500">{address.phone}</p>}

			<div className="mt-4 flex flex-wrap gap-2">
				<LinkWithChannel
					href={`/account/addresses?edit=${address.id}`}
					className="text-xs font-medium text-neutral-600 hover:text-neutral-900"
				>
					Edit
				</LinkWithChannel>
				{!isDefaultShipping && (
					<button
						disabled={isPending}
						onClick={() => startTransition(() => setDefaultAddress(channelSlug, address.id, AddressTypeEnum.Shipping))}
						className="text-xs font-medium text-neutral-600 hover:text-neutral-900"
					>
						Set as Shipping
					</button>
				)}
				{!isDefaultBilling && (
					<button
						disabled={isPending}
						onClick={() => startTransition(() => setDefaultAddress(channelSlug, address.id, AddressTypeEnum.Billing))}
						className="text-xs font-medium text-neutral-600 hover:text-neutral-900"
					>
						Set as Billing
					</button>
				)}
				<button
					disabled={isPending}
					onClick={() => {
						if (confirm("Delete this address?")) {
							startTransition(() => deleteAddress(channelSlug, address.id));
						}
					}}
					className="text-xs font-medium text-red-600 hover:text-red-800"
				>
					Delete
				</button>
			</div>
		</div>
	);
}
