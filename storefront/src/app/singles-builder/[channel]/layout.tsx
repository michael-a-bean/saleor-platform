import { type ReactNode } from "react";
import Link from "next/link";
import { executeGraphQL } from "@/lib/graphql";
import { ChannelsListDocument } from "@/gql/graphql";

export const dynamic = "force-dynamic";

interface LayoutProps {
	children: ReactNode;
	params: Promise<{ channel: string }>;
}

export default async function SinglesBuilderChannelLayout({
	children,
	params,
}: LayoutProps) {
	const { channel } = await params;

	const { channels } = await executeGraphQL(ChannelsListDocument, {
		cache: "no-cache",
	});

	const channelInfo = channels?.find((ch) => ch.slug === channel);
	const locationName = channelInfo?.name ?? channel;

	return (
		<>
			<div className="border-b bg-blue-50 px-4 py-2">
				<div className="mx-auto flex max-w-7xl items-center justify-between">
					<span className="text-sm font-medium text-blue-800">
						Location: {locationName}
					</span>
					<Link
						href="/singles-builder?pick=true"
						className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
					>
						Change Location
					</Link>
				</div>
			</div>
			{children}
		</>
	);
}
