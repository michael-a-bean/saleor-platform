"use client";

type AttributeValue = {
	slug?: string | null;
	name?: string | null;
};

type SelectedAttribute = {
	attribute: {
		slug?: string | null;
		name?: string | null;
	};
	values: AttributeValue[];
};

interface MTGCardAttributesProps {
	attributes: SelectedAttribute[];
}

// Map attribute slugs to display names and groupings
const ATTRIBUTE_CONFIG: Record<
	string,
	{ label: string; group: "card" | "set" | "stats" | "flags"; order: number }
> = {
	"mtg-rarity": { label: "Rarity", group: "card", order: 1 },
	"mtg-type-line": { label: "Type Line", group: "card", order: 2 },
	"mtg-mana-cost": { label: "Mana Cost", group: "card", order: 3 },
	"mtg-mana-value": { label: "Mana Value", group: "card", order: 4 },
	"mtg-color-identity": { label: "Color Identity", group: "card", order: 5 },
	"mtg-oracle-text": { label: "Oracle Text", group: "card", order: 6 },
	"mtg-flavor-text": { label: "Flavor Text", group: "card", order: 7 },
	"mtg-keywords": { label: "Keywords", group: "card", order: 8 },
	"mtg-set-code": { label: "Set Code", group: "set", order: 1 },
	"mtg-set-name": { label: "Set Name", group: "set", order: 2 },
	"mtg-collector-number": { label: "Collector #", group: "set", order: 3 },
	"mtg-artist": { label: "Artist", group: "set", order: 4 },
	"mtg-power": { label: "Power", group: "stats", order: 1 },
	"mtg-toughness": { label: "Toughness", group: "stats", order: 2 },
	"mtg-loyalty": { label: "Loyalty", group: "stats", order: 3 },
	"mtg-reserved": { label: "Reserved List", group: "flags", order: 1 },
	"mtg-is-reprint": { label: "Reprint", group: "flags", order: 2 },
	"mtg-is-promo": { label: "Promo", group: "flags", order: 3 },
	"mtg-is-full-art": { label: "Full Art", group: "flags", order: 4 },
	"mtg-is-digital": { label: "Digital Only", group: "flags", order: 5 },
};

// Color identity mapping
const COLOR_MAP: Record<string, { name: string; color: string }> = {
	"mtg-color-w": { name: "White", color: "#F9FAF4" },
	"mtg-color-u": { name: "Blue", color: "#0E68AB" },
	"mtg-color-b": { name: "Black", color: "#150B00" },
	"mtg-color-r": { name: "Red", color: "#D3202A" },
	"mtg-color-g": { name: "Green", color: "#00733E" },
};

function formatAttributeValue(slug: string | null | undefined, values: AttributeValue[]): React.ReactNode {
	if (!values.length) return null;

	// Handle boolean attributes
	if (slug?.startsWith("mtg-is-") || slug === "mtg-reserved") {
		const value = values[0]?.name?.toLowerCase();
		return value === "true" ? (
			<span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
				Yes
			</span>
		) : (
			<span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
				No
			</span>
		);
	}

	// Handle color identity
	if (slug === "mtg-color-identity") {
		if (values.length === 0 || (values.length === 1 && !values[0]?.slug)) {
			return <span className="text-neutral-500">Colorless</span>;
		}
		return (
			<div className="flex flex-wrap gap-1">
				{values.map((v) => {
					const colorInfo = COLOR_MAP[v.slug || ""];
					if (!colorInfo) return null;
					return (
						<span
							key={v.slug}
							className="inline-flex items-center gap-1 rounded-full border border-neutral-200 px-2 py-0.5 text-xs font-medium"
						>
							<span
								className="h-3 w-3 rounded-full border border-neutral-300"
								style={{ backgroundColor: colorInfo.color }}
							/>
							{colorInfo.name}
						</span>
					);
				})}
			</div>
		);
	}

	// Handle rarity with colored badge
	if (slug === "mtg-rarity") {
		const rarity = values[0]?.name?.toLowerCase();
		const rarityColors: Record<string, string> = {
			common: "bg-neutral-200 text-neutral-800",
			uncommon: "bg-slate-300 text-slate-800",
			rare: "bg-amber-100 text-amber-800",
			mythic: "bg-orange-100 text-orange-800",
		};
		const colorClass = rarityColors[rarity || ""] || "bg-neutral-100 text-neutral-700";
		return (
			<span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${colorClass}`}>
				{values[0]?.name}
			</span>
		);
	}

	// Handle mana cost (display as-is with special formatting)
	if (slug === "mtg-mana-cost") {
		return <span className="font-mono text-sm">{values[0]?.name || "—"}</span>;
	}

	// Handle multi-value attributes (like keywords)
	if (values.length > 1) {
		return (
			<div className="flex flex-wrap gap-1">
				{values.map((v, i) => (
					<span
						key={i}
						className="inline-flex items-center rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-700"
					>
						{v.name}
					</span>
				))}
			</div>
		);
	}

	// Default single value
	return <span className="text-neutral-900">{values[0]?.name || "—"}</span>;
}

function AttributeRow({ label, children }: { label: string; children: React.ReactNode }) {
	if (children === null) return null;
	return (
		<div className="flex items-start justify-between gap-4 py-2">
			<dt className="text-sm font-medium text-neutral-500">{label}</dt>
			<dd className="text-sm text-right">{children}</dd>
		</div>
	);
}

function AttributeGroup({ title, children }: { title: string; children: React.ReactNode }) {
	// Filter out null children
	const validChildren = Array.isArray(children) ? children.filter(Boolean) : children;
	if (!validChildren || (Array.isArray(validChildren) && validChildren.length === 0)) return null;

	return (
		<div className="border-b border-neutral-100 pb-4 last:border-0">
			<h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</h3>
			<dl className="divide-y divide-neutral-50">{children}</dl>
		</div>
	);
}

export const MTGCardAttributes = ({ attributes }: MTGCardAttributesProps) => {
	// Convert attributes array to a map for easier access
	const attrMap = new Map<string, SelectedAttribute>();
	for (const attr of attributes) {
		if (attr.attribute.slug) {
			attrMap.set(attr.attribute.slug, attr);
		}
	}

	// Get attributes by group
	const getGroupAttributes = (group: "card" | "set" | "stats" | "flags") => {
		return Object.entries(ATTRIBUTE_CONFIG)
			.filter(([, config]) => config.group === group)
			.sort((a, b) => a[1].order - b[1].order)
			.map(([slug, config]) => {
				const attr = attrMap.get(slug);
				if (!attr || attr.values.length === 0) return null;
				// Skip empty string values
				if (attr.values.length === 1 && !attr.values[0]?.name) return null;
				return (
					<AttributeRow key={slug} label={config.label}>
						{formatAttributeValue(slug, attr.values)}
					</AttributeRow>
				);
			})
			.filter(Boolean);
	};

	const cardAttrs = getGroupAttributes("card");
	const setAttrs = getGroupAttributes("set");
	const statsAttrs = getGroupAttributes("stats");
	const flagsAttrs = getGroupAttributes("flags");

	// Don't render if no attributes
	if (cardAttrs.length === 0 && setAttrs.length === 0 && statsAttrs.length === 0 && flagsAttrs.length === 0) {
		return null;
	}

	return (
		<div className="mt-8 rounded-lg border border-neutral-200 bg-white p-4">
			<h2 className="mb-4 text-lg font-semibold text-neutral-900">Card Details</h2>
			<div className="space-y-4">
				<AttributeGroup title="Card Information">{cardAttrs}</AttributeGroup>
				{statsAttrs.length > 0 && <AttributeGroup title="Combat Stats">{statsAttrs}</AttributeGroup>}
				<AttributeGroup title="Set Information">{setAttrs}</AttributeGroup>
				<AttributeGroup title="Special Properties">{flagsAttrs}</AttributeGroup>
			</div>
		</div>
	);
};
