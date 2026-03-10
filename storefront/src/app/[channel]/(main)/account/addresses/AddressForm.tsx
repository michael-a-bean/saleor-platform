"use client";

import { CountryCode } from "@/gql/graphql";
import { LinkWithChannel } from "@/ui/atoms/LinkWithChannel";
import { createAddress, updateAddress } from "../actions";
import { inputClassName, labelClassName } from "../styles";
import type { AccountAddress } from "./types";

const countryNames = new Intl.DisplayNames("en-US", { type: "region" });

const countryOptions = Object.values(CountryCode).map((code) => ({
	code,
	name: countryNames.of(code) ?? code,
}));

type Props = {
	channelSlug: string;
	address?: AccountAddress;
};

export function AddressForm({ channelSlug, address }: Props) {
	const isEditing = !!address;

	const handleSubmit = async (formData: FormData) => {
		if (isEditing) {
			await updateAddress(channelSlug, address.id, formData);
		} else {
			await createAddress(channelSlug, formData);
		}
	};

	return (
		<form action={handleSubmit}>
			<div className="grid gap-4 sm:grid-cols-2">
				<div>
					<label htmlFor="firstName" className={labelClassName}>
						First Name
					</label>
					<input
						id="firstName"
						name="firstName"
						type="text"
						required
						defaultValue={address?.firstName ?? ""}
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
						required
						defaultValue={address?.lastName ?? ""}
						className={inputClassName}
					/>
				</div>
				<div className="sm:col-span-2">
					<label htmlFor="companyName" className={labelClassName}>
						Company
					</label>
					<input
						id="companyName"
						name="companyName"
						type="text"
						defaultValue={address?.companyName ?? ""}
						className={inputClassName}
					/>
				</div>
				<div className="sm:col-span-2">
					<label htmlFor="streetAddress1" className={labelClassName}>
						Street Address
					</label>
					<input
						id="streetAddress1"
						name="streetAddress1"
						type="text"
						required
						defaultValue={address?.streetAddress1 ?? ""}
						className={inputClassName}
					/>
				</div>
				<div className="sm:col-span-2">
					<label htmlFor="streetAddress2" className={labelClassName}>
						Apt, Suite, etc.
					</label>
					<input
						id="streetAddress2"
						name="streetAddress2"
						type="text"
						defaultValue={address?.streetAddress2 ?? ""}
						className={inputClassName}
					/>
				</div>
				<div>
					<label htmlFor="city" className={labelClassName}>
						City
					</label>
					<input
						id="city"
						name="city"
						type="text"
						required
						defaultValue={address?.city ?? ""}
						className={inputClassName}
					/>
				</div>
				<div>
					<label htmlFor="countryArea" className={labelClassName}>
						State / Province
					</label>
					<input
						id="countryArea"
						name="countryArea"
						type="text"
						defaultValue={address?.countryArea ?? ""}
						className={inputClassName}
					/>
				</div>
				<div>
					<label htmlFor="postalCode" className={labelClassName}>
						Postal Code
					</label>
					<input
						id="postalCode"
						name="postalCode"
						type="text"
						required
						defaultValue={address?.postalCode ?? ""}
						className={inputClassName}
					/>
				</div>
				<div>
					<label htmlFor="country" className={labelClassName}>
						Country
					</label>
					<select
						id="country"
						name="country"
						defaultValue={address?.country.code ?? "US"}
						className={inputClassName}
					>
						{countryOptions.map(({ code, name }) => (
							<option key={code} value={code}>
								{name}
							</option>
						))}
					</select>
				</div>
				<div className="sm:col-span-2">
					<label htmlFor="phone" className={labelClassName}>
						Phone
					</label>
					<input
						id="phone"
						name="phone"
						type="tel"
						defaultValue={address?.phone ?? ""}
						className={inputClassName}
					/>
				</div>
			</div>
			<div className="mt-6 flex gap-2">
				<button
					type="submit"
					className="rounded bg-neutral-800 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
				>
					{isEditing ? "Update Address" : "Add Address"}
				</button>
				<LinkWithChannel
					href="/account/addresses"
					className="rounded border px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
				>
					Cancel
				</LinkWithChannel>
			</div>
		</form>
	);
}
