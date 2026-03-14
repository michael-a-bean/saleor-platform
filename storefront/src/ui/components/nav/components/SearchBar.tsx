"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { SearchSuggestions } from "./SearchSuggestions";

export const SearchBar = ({ channel }: { channel: string }) => {
	const router = useRouter();
	const [query, setQuery] = useState("");
	const [showSuggestions, setShowSuggestions] = useState(false);
	const formRef = useRef<HTMLFormElement>(null);

	function onSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const trimmed = query.trim();
		if (trimmed.length > 0) {
			setShowSuggestions(false);
			router.push(`/${encodeURIComponent(channel)}/search?query=${encodeURIComponent(trimmed)}`);
		}
	}

	return (
		<form
			ref={formRef}
			onSubmit={onSubmit}
			className="group relative my-2 flex w-full items-center justify-items-center text-sm lg:w-80"
		>
			<label className="w-full">
				<span className="sr-only">search for products</span>
				<input
					type="text"
					name="search"
					placeholder="Search for products..."
					autoComplete="off"
					required
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						setShowSuggestions(true);
					}}
					onFocus={() => query.length >= 2 && setShowSuggestions(true)}
					onBlur={() => {
						// Delay to allow click on suggestion
						setTimeout(() => setShowSuggestions(false), 200);
					}}
					className="h-10 w-full rounded-md border border-neutral-300 bg-transparent bg-white px-4 py-2 pr-10 text-sm text-black placeholder:text-neutral-500 focus:border-black focus:ring-black"
				/>
			</label>
			<div className="absolute inset-y-0 right-0">
				<button
					type="submit"
					className="inline-flex aspect-square w-10 items-center justify-center text-neutral-500 hover:text-neutral-700 focus:text-neutral-700 group-invalid:pointer-events-none group-invalid:opacity-80"
				>
					<span className="sr-only">search</span>
					<SearchIcon aria-hidden className="h-5 w-5" />
				</button>
			</div>
			{showSuggestions && (
				<SearchSuggestions
					query={query}
					channel={channel}
					onSelect={() => {
						setShowSuggestions(false);
						setQuery("");
					}}
				/>
			)}
		</form>
	);
};
