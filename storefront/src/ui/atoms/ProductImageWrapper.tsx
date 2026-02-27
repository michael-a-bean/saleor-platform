import NextImage, { type ImageProps } from "next/image";

export const ProductImageWrapper = (props: ImageProps) => {
	return (
		<div className="aspect-square overflow-hidden rounded-lg border border-neutral-100 bg-neutral-50 shadow-sm">
			<div className="relative h-full w-full animate-pulse bg-neutral-100">
				<NextImage
					{...props}
					className="h-full w-full object-contain object-center p-4"
					onLoad={(e) => {
						// Remove shimmer once image loads
						const target = e.currentTarget;
						const parent = target.parentElement;
						if (parent) {
							parent.classList.remove("animate-pulse", "bg-neutral-100");
						}
					}}
				/>
			</div>
		</div>
	);
};
