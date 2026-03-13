import { executeGraphQL } from "@/lib/graphql";
import { ChannelsListDocument } from "@/gql/graphql";
import Link from "next/link";

export const dynamic = "force-dynamic";

const EXCLUDED_CHANNELS = ["webstore", "default-channel"];

interface PageProps {
	searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function SinglesBuilderLocationPage({ searchParams }: PageProps) {
	const resolvedSearchParams = await searchParams;
	const forcePicker = resolvedSearchParams.pick === "true";

	const { channels } = await executeGraphQL(ChannelsListDocument, {
		cache: "no-cache",
	});

	const locations = (channels ?? []).filter(
		(ch) => ch.isActive && !EXCLUDED_CHANNELS.includes(ch.slug),
	);

	if (locations.length === 1 && !forcePicker) {
		// Single location — redirect directly (unless user explicitly wants the picker)
		const { redirect } = await import("next/navigation");
		redirect(`/singles-builder/${locations[0].slug}`);
	}

	return (
		<div className="mx-auto max-w-3xl px-4 py-12">
			<div className="mb-8 text-center">
				<h2 className="text-2xl font-bold text-gray-900">Select Location</h2>
				<p className="mt-2 text-gray-600">
					Choose which location you&apos;re building singles from.
				</p>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				{locations.map((channel) => (
					<Link
						key={channel.id}
						href={`/singles-builder/${channel.slug}`}
						className="group rounded-lg border-2 border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-blue-500 hover:shadow-md"
					>
						<h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600">
							{channel.name}
						</h3>
						<p className="mt-1 text-sm text-gray-500">{channel.currencyCode}</p>
					</Link>
				))}
			</div>

			{locations.length === 0 && (
				<div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
					<p className="text-gray-600">
						No active Singles Builder locations configured. Create a channel in the Saleor Dashboard.
					</p>
				</div>
			)}
		</div>
	);
}
