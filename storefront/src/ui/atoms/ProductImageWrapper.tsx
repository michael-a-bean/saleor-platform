"use client";

import NextImage, { type ImageProps } from "next/image";
import { ImageIcon } from "lucide-react";
import { useImageFallback } from "@/ui/hooks/useImageFallback";

/**
 * Map MTG color identity values to subtle background tints for loading placeholders.
 * Shows a hint of the card's color while the image loads, improving perceived performance.
 */
const COLOR_IDENTITY_BG: Record<string, string> = {
	"mtg-color-w": "#f5f0e1", // White — warm cream
	"mtg-color-u": "#dce6f0", // Blue — light sky
	"mtg-color-b": "#d8d4d0", // Black — warm gray
	"mtg-color-r": "#f0dbd4", // Red — light salmon
	"mtg-color-g": "#d6e6d4", // Green — light sage
};

function getPlaceholderColor(colorIdentity?: string[]): string {
	if (!colorIdentity || colorIdentity.length === 0) return "#f5f5f5";
	if (colorIdentity.length > 1) return "#ede4d0"; // Multicolor — gold tint
	return COLOR_IDENTITY_BG[colorIdentity[0]] || "#f5f5f5";
}

type ProductImageWrapperProps = Omit<ImageProps, "src"> & {
	src: string;
	fallbackSrc?: string;
	colorIdentity?: string[];
};

export const ProductImageWrapper = ({ src, fallbackSrc, colorIdentity, ...props }: ProductImageWrapperProps) => {
	const { src: resolvedSrc, onError, hasError } = useImageFallback(src, fallbackSrc);
	const placeholderBg = getPlaceholderColor(colorIdentity);

	return (
		<div className="aspect-square overflow-hidden rounded-lg border border-neutral-100 bg-neutral-50 shadow-sm">
			<div className="relative h-full w-full animate-pulse" style={{ backgroundColor: placeholderBg }}>
				{hasError || !resolvedSrc ? (
					<div className="flex h-full w-full items-center justify-center">
						<ImageIcon className="h-16 w-16 text-neutral-300" />
					</div>
				) : (
					<NextImage
						{...props}
						src={resolvedSrc}
						unoptimized
						className="h-full w-full object-contain object-center p-4"
						onLoad={(e) => {
							const target = e.currentTarget;
							const parent = target.parentElement;
							if (parent) {
								parent.classList.remove("animate-pulse", "bg-neutral-100");
							}
						}}
						onError={onError}
					/>
				)}
			</div>
		</div>
	);
};
