"use client";

export function SetIconImage({
	src,
	alt,
	className,
	fetchPriority,
	loading,
}: {
	src: string;
	alt: string;
	className?: string;
	fetchPriority?: "low" | "high" | "auto";
	loading?: "lazy" | "eager";
}) {
	return (
		// eslint-disable-next-line @next/next/no-img-element
		<img
			src={src}
			alt={alt}
			className={className}
			style={{ filter: "brightness(0)" }}
			fetchPriority={fetchPriority}
			loading={loading}
			onError={(e) => {
				e.currentTarget.style.display = "none";
			}}
		/>
	);
}
