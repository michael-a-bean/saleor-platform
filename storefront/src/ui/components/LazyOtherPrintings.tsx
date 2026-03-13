"use client";

import { useEffect, useState } from "react";
import { OtherPrintings } from "./OtherPrintings";
import type { OtherPrintingsQuery } from "@/gql/graphql";

type PrintingProduct = NonNullable<OtherPrintingsQuery["products"]>["edges"][number]["node"];

interface LazyOtherPrintingsProps {
	productName: string;
	currentProductId: string;
	channel: string;
}

export function LazyOtherPrintings({
	productName,
	currentProductId,
	channel,
}: LazyOtherPrintingsProps) {
	const [printings, setPrintings] = useState<PrintingProduct[] | null>(null);

	useEffect(() => {
		const controller = new AbortController();
		const params = new URLSearchParams({
			channel,
			productName,
		});

		fetch(`/api/products/other-printings?${params}`, { signal: controller.signal })
			.then((res) => {
				if (!res.ok) throw new Error(res.statusText);
				return res.json() as Promise<{ printings?: PrintingProduct[] }>;
			})
			.then((data) => setPrintings(data.printings ?? []))
			.catch((err) => {
				if (err.name !== "AbortError") setPrintings([]);
			});

		return () => controller.abort();
	}, [channel, productName, currentProductId]);

	if (printings === null) {
		// Skeleton placeholder matching OtherPrintings layout
		return (
			<div className="mt-8 border-t border-neutral-100 pt-6">
				<div className="mb-3 h-4 w-32 animate-pulse rounded bg-neutral-200" />
				<div className="flex flex-wrap gap-2">
					{Array.from({ length: 4 }).map((_, i) => (
						<div
							key={i}
							className="h-12 w-24 animate-pulse rounded-lg bg-neutral-200"
						/>
					))}
				</div>
			</div>
		);
	}

	if (printings.length <= 1) {
		return null;
	}

	return (
		<OtherPrintings
			printings={printings}
			currentProductId={currentProductId}
			channel={channel}
		/>
	);
}
