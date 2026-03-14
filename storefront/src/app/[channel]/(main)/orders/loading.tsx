import { OrderListSkeleton } from "@/ui/components/skeletons/OrderListSkeleton";

export default function Loading() {
	return (
		<div className="mx-auto max-w-4xl p-8">
			<div className="animate-pulse mb-6">
				<div className="h-7 w-32 rounded bg-neutral-200" />
			</div>
			<OrderListSkeleton count={5} />
		</div>
	);
}
