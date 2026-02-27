"use client";

import { useState } from "react";
import Image from "next/image";
import { Disclosure, Transition } from "@headlessui/react";
import { ChevronDown } from "lucide-react";
import { clsx } from "clsx";

type AttributeValue = {
	slug?: string | null;
	name?: string | null;
	richText?: string | null;
	plainText?: string | null;
};

type SelectedAttribute = {
	attribute: {
		slug?: string | null;
		name?: string | null;
		inputType?: string | null;
	};
	values: AttributeValue[];
};

interface MTGCardAttributesProps {
	attributes: SelectedAttribute[];
}

// Map attribute slugs to display names and order
// Only include attributes for the "More Info" collapsible section
// Essential info (set name, rarity, collector #, reserved) is shown in EssentialCardInfo
// Boolean flags are removed entirely
const ATTRIBUTE_CONFIG: Record<string, { label: string; order: number }> = {
	"mtg-type-line": { label: "Type Line", order: 1 },
	"mtg-mana-cost": { label: "Mana Cost", order: 2 },
	"mtg-mana-value": { label: "Mana Value", order: 3 },
	"mtg-color-identity": { label: "Color Identity", order: 4 },
	"mtg-oracle-text": { label: "Oracle Text", order: 5 },
	"mtg-flavor-text": { label: "Flavor Text", order: 6 },
	"mtg-keywords": { label: "Keywords", order: 7 },
	"mtg-power": { label: "Power", order: 8 },
	"mtg-toughness": { label: "Toughness", order: 9 },
	"mtg-loyalty": { label: "Loyalty", order: 10 },
	"mtg-artist": { label: "Artist", order: 11 },
};

// Color identity slug to mana symbol mapping
const COLOR_TO_SYMBOL: Record<string, string> = {
	"mtg-color-w": "W",
	"mtg-color-u": "U",
	"mtg-color-b": "B",
	"mtg-color-r": "R",
	"mtg-color-g": "G",
};

// Mana symbol component using Scryfall SVGs with graceful fallback
function ManaSymbol({ symbol, size = 16 }: { symbol: string; size?: number }) {
	const [failed, setFailed] = useState(false);

	if (failed) {
		return (
			<span
				className="inline-flex items-center justify-center rounded-full bg-neutral-200 text-xs font-mono font-bold text-neutral-600"
				style={{ width: size, height: size, fontSize: size * 0.6 }}
			>
				{symbol}
			</span>
		);
	}

	return (
		<Image
			src={`https://svgs.scryfall.io/card-symbols/${encodeURIComponent(symbol)}.svg`}
			alt={symbol}
			width={size}
			height={size}
			className="inline-block"
			unoptimized
			onError={() => setFailed(true)}
		/>
	);
}

// Parse mana cost string like "{2}{G}{G}" into array of symbols
function parseManaCost(manaCost: string): string[] {
	const symbols: string[] = [];
	const regex = /\{([^}]+)\}/g;
	let match;
	while ((match = regex.exec(manaCost)) !== null) {
		symbols.push(match[1]);
	}
	return symbols;
}

interface RichTextBlock {
	data?: { text?: string };
}

interface RichTextData {
	blocks?: RichTextBlock[];
}

function extractTextFromRichText(richText: string | null | undefined): string | null {
	if (!richText) return null;
	try {
		const parsed = JSON.parse(richText) as RichTextData;
		// EditorJS format: { blocks: [{ data: { text: "..." } }] }
		if (parsed.blocks && Array.isArray(parsed.blocks)) {
			return parsed.blocks
				.map((block) => block.data?.text || "")
				.filter(Boolean)
				.join("\n");
		}
		return null;
	} catch {
		return null;
	}
}

function formatAttributeValue(
	slug: string | null | undefined,
	values: AttributeValue[],
	inputType?: string | null,
): React.ReactNode {
	if (!values.length) return null;

	// Handle color identity with mana symbols
	if (slug === "mtg-color-identity") {
		if (values.length === 0 || (values.length === 1 && !values[0]?.slug)) {
			return <ManaSymbol symbol="C" size={18} />;
		}
		return (
			<div className="flex flex-wrap gap-0.5">
				{values.map((v) => {
					const symbol = COLOR_TO_SYMBOL[v.slug || ""];
					if (!symbol) return null;
					return <ManaSymbol key={v.slug} symbol={symbol} size={18} />;
				})}
			</div>
		);
	}

	// Handle mana cost with actual mana symbols
	if (slug === "mtg-mana-cost") {
		const costString = values[0]?.name;
		if (!costString) return <span className="text-neutral-400">—</span>;
		const symbols = parseManaCost(costString);
		if (symbols.length === 0) {
			// Fallback for unparseable format
			return <span className="font-mono text-sm">{costString}</span>;
		}
		return (
			<div className="flex flex-wrap gap-0.5">
				{symbols.map((symbol, i) => (
					<ManaSymbol key={i} symbol={symbol} size={18} />
				))}
			</div>
		);
	}

	// Handle rich text attributes (oracle text, flavor text, legalities)
	if (inputType === "RICH_TEXT") {
		const text = extractTextFromRichText(values[0]?.richText);
		if (text) {
			// Display flavor text in italics
			if (slug === "mtg-flavor-text") {
				return <span className="text-neutral-700 italic whitespace-pre-line">{text}</span>;
			}
			return <span className="text-neutral-900 whitespace-pre-line">{text}</span>;
		}
		return null;
	}

	// Handle plain text attributes
	if (inputType === "PLAIN_TEXT") {
		const text = values[0]?.plainText || values[0]?.name;
		if (!text) return null;
		return <span className="text-neutral-900">{text}</span>;
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
		<div className="flex items-start justify-between gap-4 py-2 border-b border-neutral-50 last:border-0">
			<dt className="text-sm font-medium text-neutral-500">{label}</dt>
			<dd className="text-sm text-right">{children}</dd>
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

	// Get all displayable attributes in order
	const displayableAttrs = Object.entries(ATTRIBUTE_CONFIG)
		.sort((a, b) => a[1].order - b[1].order)
		.map(([slug, config]) => {
			const attr = attrMap.get(slug);
			if (!attr || attr.values.length === 0) return null;
			// Skip empty string values (but not for rich/plain text which use different fields)
			const inputType = attr.attribute.inputType;
			if (inputType !== "RICH_TEXT" && inputType !== "PLAIN_TEXT") {
				if (attr.values.length === 1 && !attr.values[0]?.name) return null;
			}
			return (
				<AttributeRow key={slug} label={config.label}>
					{formatAttributeValue(slug, attr.values, inputType)}
				</AttributeRow>
			);
		})
		.filter(Boolean);

	// Don't render if no attributes
	if (displayableAttrs.length === 0) {
		return null;
	}

	return (
		<Disclosure>
			{({ open }) => (
				<>
					<Disclosure.Button className="flex w-full items-center justify-between py-3 text-left">
						<span className="text-sm font-medium text-neutral-900">More Info</span>
						<ChevronDown
							className={clsx(
								"h-5 w-5 text-neutral-500 transition-transform duration-200",
								open && "rotate-180"
							)}
						/>
					</Disclosure.Button>

					<Transition
						enter="transition duration-100 ease-out"
						enterFrom="opacity-0 -translate-y-1"
						enterTo="opacity-100 translate-y-0"
						leave="transition duration-75 ease-in"
						leaveFrom="opacity-100 translate-y-0"
						leaveTo="opacity-0 -translate-y-1"
					>
						<Disclosure.Panel className="pb-4 pt-2">
							<dl>{displayableAttrs}</dl>
						</Disclosure.Panel>
					</Transition>
				</>
			)}
		</Disclosure>
	);
};
