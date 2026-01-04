import { useMemo } from "react";
import { type CheckoutLineFragment } from "@/checkout/graphql";
import { TextInput } from "@/checkout/components/TextInput";

import { IconButton, Skeleton } from "@/checkout/components";
import { MinusIcon, PlusIcon } from "@/checkout/assets/icons";
import { SummaryItemMoneyInfo } from "@/checkout/sections/Summary/SummaryItemMoneyInfo";
import { FormProvider } from "@/checkout/hooks/useForm/FormProvider";
import { useSummaryItemForm } from "@/checkout/sections/Summary/useSummaryItemForm";

interface SummaryItemMoneyEditableSectionProps {
	line: CheckoutLineFragment;
}

export const SummaryItemMoneyEditableSection: React.FC<SummaryItemMoneyEditableSectionProps> = ({ line }) => {
	const { form, onLineDelete } = useSummaryItemForm({ line });

	const {
		handleBlur,
		handleChange,
		setFieldValue,
		handleSubmit,
		isSubmitting,
		values: { quantity: quantityString },
	} = form;

	const quantity = useMemo(() => parseInt(quantityString), [quantityString]);

	const handleDecrement = () => {
		if (quantity > 1) {
			void setFieldValue("quantity", String(quantity - 1));
			void handleSubmit();
		} else if (quantity === 1) {
			void onLineDelete();
		}
	};

	const handleIncrement = () => {
		void setFieldValue("quantity", String(quantity + 1));
		void handleSubmit();
	};

	const handleQuantityInputBlur = (event: React.FocusEvent<any, Element>) => {
		handleBlur(event);

		if (quantity === line.quantity) {
			return;
		}

		const isQuantityValid = !Number.isNaN(quantity) && quantity >= 0;

		if (quantityString === "" || !isQuantityValid) {
			void setFieldValue("quantity", String(line.quantity));
			return;
		}

		if (quantity === 0) {
			void onLineDelete();
			return;
		}

		void handleSubmit();
	};

	return (
		<div className="flex flex-col items-end gap-2">
			<FormProvider form={form}>
				<div className="flex items-center gap-1">
					<IconButton
						icon={<MinusIcon />}
						ariaLabel="Decrease quantity"
						onClick={handleDecrement}
						disabled={isSubmitting}
						className="h-8 w-8 flex items-center justify-center rounded border border-neutral-200 hover:bg-neutral-100 disabled:opacity-50"
					/>
					<TextInput
						required
						onChange={handleChange}
						onBlur={handleQuantityInputBlur}
						name="quantity"
						label="Qty"
						className="max-w-[5ch] text-center"
					/>
					<IconButton
						icon={<PlusIcon />}
						ariaLabel="Increase quantity"
						onClick={handleIncrement}
						disabled={isSubmitting}
						className="h-8 w-8 flex items-center justify-center rounded border border-neutral-200 hover:bg-neutral-100 disabled:opacity-50"
					/>
				</div>
			</FormProvider>
			{isSubmitting ? (
				<div className="flex max-w-[6ch] flex-col">
					<Skeleton />
					<Skeleton />
				</div>
			) : (
				<SummaryItemMoneyInfo {...line} />
			)}
		</div>
	);
};
