"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

type Suggestion = {
	name: string;
	slug: string;
	thumbnail?: string | null;
	min_price?: number | null;
	set_name?: string | null;
	set_code?: string | null;
	rarity?: string | null;
};

export function SearchSuggestions({
	query,
	channel,
	onSelect,
}: {
	query: string;
	channel: string;
	onSelect: () => void;
}) {
	const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
	const [loading, setLoading] = useState(false);
	const controllerRef = useRef<AbortController | null>(null);

	useEffect(() => {
		if (query.length < 2) {
			setSuggestions([]);
			return;
		}

		// Cancel previous request
		controllerRef.current?.abort();
		const controller = new AbortController();
		controllerRef.current = controller;

		setLoading(true);

		const timer = setTimeout(async () => {
			try {
				const res = await fetch(
					`/api/search/suggestions?q=${encodeURIComponent(query)}&channel=${encodeURIComponent(channel)}`,
					{ signal: controller.signal },
				);
				if (!res.ok) {
					setSuggestions([]);
					return;
				}
				const data = (await res.json()) as { hits?: Suggestion[] };
				if (!controller.signal.aborted) {
					setSuggestions(data.hits || []);
				}
			} catch {
				if (!controller.signal.aborted) {
					setSuggestions([]);
				}
			} finally {
				if (!controller.signal.aborted) {
					setLoading(false);
				}
			}
		}, 200); // 200ms debounce

		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	}, [query, channel]);

	if (query.length < 2 || (!loading && suggestions.length === 0)) {
		return null;
	}

	return (
		<div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-neutral-200 bg-white shadow-lg">
			{loading && suggestions.length === 0 ? (
				<div className="px-4 py-3 text-sm text-neutral-400">Searching...</div>
			) : (
				<ul className="divide-y divide-neutral-100">
					{suggestions.map((hit, i) => (
						<li key={`${hit.slug}-${i}`}>
							<Link
								href={`/${encodeURIComponent(channel)}/products/${hit.slug}`}
								onClick={onSelect}
								className="flex items-center gap-3 px-4 py-2 hover:bg-neutral-50"
							>
								{hit.thumbnail ? (
									<Image
										src={hit.thumbnail}
										alt=""
										width={32}
										height={32}
										className="h-8 w-8 rounded object-contain"
										unoptimized
									/>
								) : (
									<div className="h-8 w-8 rounded bg-neutral-100" />
								)}
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium text-neutral-900">
										{hit.name}
									</p>
									<p className="truncate text-xs text-neutral-500">
										{hit.set_name}
										{hit.min_price != null && ` · $${Number(hit.min_price).toFixed(2)}`}
									</p>
								</div>
							</Link>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
