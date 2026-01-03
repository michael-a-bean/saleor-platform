import NextImage, { type ImageProps } from "next/image";

export const ProductImageWrapper = (props: ImageProps) => {
	return (
		<div className="aspect-square overflow-hidden rounded-lg border border-neutral-100 bg-neutral-50 shadow-sm">
			<NextImage {...props} className="h-full w-full object-contain object-center p-4" />
		</div>
	);
};
