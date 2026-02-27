"use client";

import NextImage, { type ImageProps } from "next/image";
import { ImageIcon } from "lucide-react";
import { useImageFallback } from "@/ui/hooks/useImageFallback";

type ProductImageWrapperProps = Omit<ImageProps, "src"> & {
	src: string;
	fallbackSrc?: string;
};

export const ProductImageWrapper = ({ src, fallbackSrc, ...props }: ProductImageWrapperProps) => {
	const { src: resolvedSrc, onError, hasError } = useImageFallback(src, fallbackSrc);

	return (
		<div className="aspect-square overflow-hidden rounded-lg border border-neutral-100 bg-neutral-50 shadow-sm">
			<div className="relative h-full w-full animate-pulse bg-neutral-100">
				{hasError || !resolvedSrc ? (
					<div className="flex h-full w-full items-center justify-center">
						<ImageIcon className="h-16 w-16 text-neutral-300" />
					</div>
				) : (
					<NextImage
						{...props}
						src={resolvedSrc}
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
