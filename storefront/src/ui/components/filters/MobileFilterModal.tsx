"use client";

import { Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { X, SlidersHorizontal } from "lucide-react";
import { FilterSection } from "./FilterSection";
import { MultiSelectFilter } from "./MultiSelectFilter";
import { RangeFilter } from "./RangeFilter";
import { BooleanFilter } from "./BooleanFilter";
import { useFilters } from "./useFilters";
import { useMobileFilters } from "./useMobileFilters";
import { RARITY_OPTIONS } from "@/lib/filters";

export const MobileFilterModal = () => {
	const { isOpen, openFilters, closeFilters } = useMobileFilters();
	const { filters, updateFilter, clearAllFilters, activeCount } = useFilters();

	return (
		<>
			<button
				onClick={openFilters}
				className="flex items-center gap-2 rounded border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 lg:hidden"
			>
				<SlidersHorizontal className="h-4 w-4" />
				<span>Filters</span>
				{activeCount > 0 && (
					<span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-xs text-white">
						{activeCount}
					</span>
				)}
			</button>

			<Transition show={isOpen}>
				<Dialog onClose={closeFilters}>
					<Transition.Child
						as={Fragment}
						enter="ease-out duration-300"
						enterFrom="opacity-0"
						enterTo="opacity-100"
						leave="ease-in duration-200"
						leaveFrom="opacity-100"
						leaveTo="opacity-0"
					>
						<div className="fixed inset-0 z-30 bg-black/30" />
					</Transition.Child>

					<Transition.Child
						as={Fragment}
						enter="ease-out duration-300"
						enterFrom="translate-x-full"
						enterTo="translate-x-0"
						leave="ease-in duration-200"
						leaveFrom="translate-x-0"
						leaveTo="translate-x-full"
					>
						<Dialog.Panel className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col bg-white shadow-xl">
							{/* Header */}
							<div className="flex items-center justify-between border-b border-neutral-200 px-4 py-4">
								<Dialog.Title className="text-lg font-semibold">Filters</Dialog.Title>
								<button
									onClick={closeFilters}
									className="rounded p-1 hover:bg-neutral-100"
								>
									<X className="h-5 w-5" />
								</button>
							</div>

							{/* Filter content */}
							<div className="flex-1 overflow-y-auto px-4">
								<FilterSection title="Rarity">
									<MultiSelectFilter
										options={RARITY_OPTIONS}
										value={filters.rarity}
										onChange={(v) => updateFilter("rarity", v)}
									/>
								</FilterSection>

								<FilterSection title="Price Range">
									<RangeFilter
										value={filters.price}
										onChange={(v) => updateFilter("price", v)}
										prefix="$"
									/>
								</FilterSection>

								<FilterSection title="Mana Value (CMC)">
									<RangeFilter
										value={filters.manaValue}
										onChange={(v) => updateFilter("manaValue", v)}
									/>
								</FilterSection>

								<FilterSection title="Special">
									<div className="space-y-3">
										<BooleanFilter
											label="Reserved List"
											value={filters.reservedList}
											onChange={(v) => updateFilter("reservedList", v)}
										/>
										<BooleanFilter
											label="Promo"
											value={filters.isPromo}
											onChange={(v) => updateFilter("isPromo", v)}
										/>
										<BooleanFilter
											label="Full Art"
											value={filters.isFullArt}
											onChange={(v) => updateFilter("isFullArt", v)}
										/>
									</div>
								</FilterSection>
							</div>

							{/* Footer */}
							<div className="border-t border-neutral-200 px-4 py-4">
								<div className="flex gap-3">
									{activeCount > 0 && (
										<button
											onClick={clearAllFilters}
											className="flex-1 rounded border border-neutral-300 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
										>
											Clear all
										</button>
									)}
									<button
										onClick={closeFilters}
										className="flex-1 rounded bg-neutral-900 py-2 text-sm font-medium text-white hover:bg-neutral-800"
									>
										Show results
									</button>
								</div>
							</div>
						</Dialog.Panel>
					</Transition.Child>
				</Dialog>
			</Transition>
		</>
	);
};
