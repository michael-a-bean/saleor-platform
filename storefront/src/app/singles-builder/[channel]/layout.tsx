import { type ReactNode } from "react";

/**
 * Channel-specific layout for Singles Builder.
 * The parent layout handles auth, this just passes through.
 */
export default function SinglesBuilderChannelLayout({
	children,
}: {
	children: ReactNode;
}) {
	return children;
}
