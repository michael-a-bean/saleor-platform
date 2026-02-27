"use client";

import { useParams } from "next/navigation";
import { FilterSection } from "./FilterSection";
import { MultiSelectFilter } from "./MultiSelectFilter";
import { RangeFilter } from "./RangeFilter";
import { BooleanFilter } from "./BooleanFilter";
import { SetFilterDropdown } from "./SetFilterDropdown";
import { useFilters } from "./useFilters";
import { RARITY_OPTIONS, CARD_TYPE_OPTIONS, COLOR_IDENTITY_OPTIONS, FINISH_OPTIONS } from "@/lib/filters";

export const FilterSidebar = () => {
	const params = useParams<{ channel: string }>();
	const { filters, updateFilter, clearAllFilters, activeCount } = useFilters();

	return (
		<aside className="w-64 shrink-0">
			<div className="flex items-center justify-between border-b border-neutral-200 pb-4">
				<h2 className="text-lg font-semibold text-neutral-900">Filters</h2>
				{activeCount > 0 && (
					<button
						onClick={clearAllFilters}
						className="text-sm text-neutral-500 hover:text-neutral-700"
					>
						Clear all ({activeCount})
					</button>
				)}
			</div>

			<FilterSection title="Card Type">
				<MultiSelectFilter
					options={CARD_TYPE_OPTIONS}
					value={filters.cardType}
					onChange={(v) => updateFilter("cardType", v)}
				/>
			</FilterSection>

			<FilterSection title="Rarity">
				<MultiSelectFilter
					options={RARITY_OPTIONS}
					value={filters.rarity}
					onChange={(v) => updateFilter("rarity", v)}
				/>
			</FilterSection>

			<FilterSection title="Color Identity">
				<MultiSelectFilter
					options={COLOR_IDENTITY_OPTIONS}
					value={filters.colorIdentity}
					onChange={(v) => updateFilter("colorIdentity", v)}
				/>
			</FilterSection>

			<FilterSection title="Finish">
				<MultiSelectFilter
					options={FINISH_OPTIONS}
					value={filters.finish}
					onChange={(v) => updateFilter("finish", v)}
				/>
			</FilterSection>

			<FilterSection title="Set">
				<SetFilterDropdown
					value={filters.setName}
					onChange={(v) => updateFilter("setName", v)}
					channel={params.channel}
				/>
			</FilterSection>

			<FilterSection title="Price Range">
				<RangeFilter
					value={filters.price}
					onChange={(v) => updateFilter("price", v)}
					prefix="$"
				/>
			</FilterSection>

			<FilterSection title="Mana Value (CMC)" defaultOpen={false}>
				<RangeFilter
					value={filters.manaValue}
					onChange={(v) => updateFilter("manaValue", v)}
				/>
			</FilterSection>

			<FilterSection title="Special" defaultOpen={false}>
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
		</aside>
	);
};
