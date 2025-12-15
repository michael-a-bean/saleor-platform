"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";

interface FilterSectionProps {
	title: string;
	children: ReactNode;
	defaultOpen?: boolean;
}

export const FilterSection = ({ title, children, defaultOpen = true }: FilterSectionProps) => {
	const [isOpen, setIsOpen] = useState(defaultOpen);

	return (
		<div className="border-b border-neutral-200 py-4">
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="flex w-full items-center justify-between text-left"
			>
				<span className="text-sm font-medium text-neutral-900">{title}</span>
				<ChevronDown
					className={clsx("h-4 w-4 text-neutral-500 transition-transform", isOpen && "rotate-180")}
				/>
			</button>
			{isOpen && <div className="mt-3">{children}</div>}
		</div>
	);
};
