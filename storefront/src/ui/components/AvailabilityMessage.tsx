import { XIcon, CheckIcon } from "lucide-react";

type Props = {
	isAvailable: boolean;
	quantity?: number | null;
};

const pClasses = "ml-1 text-sm font-semibold";

function formatQuantity(quantity: number): string {
	return quantity > 12 ? "12+" : String(quantity);
}

export const AvailabilityMessage = ({ isAvailable, quantity }: Props) => {
	if (!isAvailable) {
		return (
			<div className="mt-6 flex items-center">
				<XIcon className="h-5 w-5 flex-shrink-0 text-red-500" aria-hidden="true" />
				<p className={`${pClasses} text-red-600`}>Out of stock</p>
			</div>
		);
	}

	if (quantity != null && quantity > 0) {
		return (
			<div className="mt-6 flex items-center">
				<CheckIcon className="h-5 w-5 flex-shrink-0 text-green-500" aria-hidden="true" />
				<p className={`${pClasses} text-green-600`}>{formatQuantity(quantity)} in stock</p>
			</div>
		);
	}

	return null;
};
