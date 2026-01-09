"use server";

interface ScryfallSet {
	code: string;
	name: string;
	released_at: string;
	set_type: string;
	icon_svg_uri: string;
	card_count: number;
}

interface ScryfallSetsResponse {
	data: ScryfallSet[];
}

export interface MtgSet {
	name: string;
	code: string;
	releasedAt: string;
	iconUri: string;
	cardCount: number;
}

/**
 * Fetches all MTG sets from Scryfall API that are valid product sets.
 * Filters out tokens, art series, promos, and unreleased sets.
 */
export async function getAllSets(): Promise<MtgSet[]> {
	try {
		const response = await fetch("https://api.scryfall.com/sets", {
			next: { revalidate: 3600 }, // Cache for 1 hour
		});

		if (!response.ok) {
			return [];
		}

		const data = (await response.json()) as ScryfallSetsResponse;
		const today = new Date().toISOString().split("T")[0];

		// Filter to valid set types that have been released
		const validTypes = [
			"core",
			"expansion",
			"masters",
			"draft_innovation",
			"commander",
			"funny",
			"starter",
			"box",
			"duel_deck",
			"premium_deck",
			"from_the_vault",
			"spellbook",
			"arsenal",
			"masterpiece",
		];

		const sets = data.data
			.filter(
				(s) =>
					s.released_at &&
					s.released_at <= today &&
					validTypes.includes(s.set_type) &&
					!s.name.endsWith("Tokens") &&
					!s.name.includes("Art Series") &&
					!s.name.includes("Promos"),
			)
			.map((s) => ({
				name: s.name,
				code: s.code,
				releasedAt: s.released_at,
				iconUri: s.icon_svg_uri,
				cardCount: s.card_count,
			}))
			.sort((a, b) => a.name.localeCompare(b.name));

		return sets;
	} catch {
		return [];
	}
}
