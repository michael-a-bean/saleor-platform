"use client";

import clsx from "clsx";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";

export function OffsetPagination({
	totalCount,
	pageSize,
	currentPage,
}: {
	totalCount: number;
	pageSize: number;
	currentPage: number;
}) {
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const totalPages = Math.ceil(totalCount / pageSize);
	const hasPrevious = currentPage > 1;
	const hasNext = currentPage < totalPages;

	function buildPageUrl(page: number) {
		const params = new URLSearchParams(searchParams);
		if (page <= 1) {
			params.delete("page");
		} else {
			params.set("page", String(page));
		}
		const qs = params.toString();
		return qs ? `${pathname}?${qs}` : pathname;
	}

	return (
		<nav className="flex items-center justify-center gap-x-4 border-neutral-200 px-4 pt-12">
			<Link
				href={hasPrevious ? buildPageUrl(currentPage - 1) : "#"}
				className={clsx("px-4 py-2 text-sm font-medium", {
					"rounded bg-neutral-900 text-white hover:bg-neutral-800": hasPrevious,
					"cursor-not-allowed border text-neutral-400": !hasPrevious,
					"pointer-events-none": !hasPrevious,
				})}
				aria-disabled={!hasPrevious}
			>
				Previous
			</Link>

			<span className="text-sm text-neutral-500">
				Page {currentPage} of {totalPages.toLocaleString()}
			</span>

			<Link
				href={hasNext ? buildPageUrl(currentPage + 1) : "#"}
				className={clsx("px-4 py-2 text-sm font-medium", {
					"rounded bg-neutral-900 text-white hover:bg-neutral-800": hasNext,
					"cursor-not-allowed border text-neutral-400": !hasNext,
					"pointer-events-none": !hasNext,
				})}
				aria-disabled={!hasNext}
			>
				Next
			</Link>
		</nav>
	);
}
