import { useCallback, useEffect, useRef, useState } from "react";
import { useSaleorAuthContext } from "@saleor/auth-sdk/react";

import { useCheckout } from "./useCheckout";
import { useUser } from "./useUser";
import {
	useCheckoutAddPromoCodeMutation,
	useCheckoutRemovePromoCodeMutation,
} from "@/checkout/graphql";

interface GroupVoucherInfo {
	voucherCode: string;
	groupName: string;
	discountPercent: number;
}

const INVENTORY_OPS_URL = process.env.NEXT_PUBLIC_INVENTORY_OPS_URL ?? "";
const GROUP_VOUCHER_PREFIX = "CUSTGRP-";

/**
 * Auto-applies the best customer group discount to the checkout.
 *
 * Business rules:
 * - Best discount wins — no stacking with manual voucher codes
 * - If manual code gives a better discount, group voucher is not applied
 * - Discount is visible to the customer with the group name
 */
export function useGroupDiscount() {
	const { checkout } = useCheckout();
	const { authenticated } = useUser();
	const saleorAuth = useSaleorAuthContext();
	const [, addPromoCode] = useCheckoutAddPromoCodeMutation();
	const [, removePromoCode] = useCheckoutRemovePromoCodeMutation();

	const [groupInfo, setGroupInfo] = useState<GroupVoucherInfo | null>(null);
	const [isApplying, setIsApplying] = useState(false);
	const appliedRef = useRef(false);
	const fetchedRef = useRef(false);

	const fetchGroupVoucher = useCallback(async (
		signal: AbortSignal,
	): Promise<GroupVoucherInfo | null> => {
		if (!INVENTORY_OPS_URL) return null;

		try {
			const response = await saleorAuth.fetchWithAuth(
				`${INVENTORY_OPS_URL}/api/customer/groups/ensure-voucher`,
				{ method: "POST", headers: { "Content-Type": "application/json" }, signal },
				{ allowPassingTokenToThirdPartyDomains: true },
			);

			if (!response.ok) return null;

			const data = (await response.json()) as {
				voucherCode: string | null;
				groupName: string | null;
				discountPercent: number;
			};

			if (!data.voucherCode || data.discountPercent <= 0) return null;

			return {
				voucherCode: data.voucherCode,
				groupName: data.groupName ?? "Group",
				discountPercent: data.discountPercent,
			};
		} catch {
			return null;
		}
	}, [saleorAuth]);

	// Run once when checkout and auth are ready
	useEffect(() => {
		if (!authenticated || !checkout?.id || fetchedRef.current) return;
		fetchedRef.current = true;

		const controller = new AbortController();

		void (async () => {
			const info = await fetchGroupVoucher(controller.signal);
			if (!info || controller.signal.aborted) return;

			setGroupInfo(info);

			const currentVoucher = checkout.voucherCode;
			if (currentVoucher?.startsWith(GROUP_VOUCHER_PREFIX)) {
				appliedRef.current = true;
				return;
			}

			if (!currentVoucher) {
				if (controller.signal.aborted) return;
				setIsApplying(true);
				try {
					await addPromoCode({
						checkoutId: checkout.id,
						promoCode: info.voucherCode,
						languageCode: "EN_US",
					});
					appliedRef.current = true;
				} catch {
					// Checkout works without discount
				} finally {
					if (!controller.signal.aborted) setIsApplying(false);
				}
				return;
			}

			// Compare discounts — is group better than current voucher?
			const subtotal = checkout.subtotalPrice?.gross?.amount ?? 0;
			const currentDiscountAmount = checkout.discount?.amount ?? 0;
			const groupDiscountAmount = subtotal * (info.discountPercent / 100);

			if (groupDiscountAmount > currentDiscountAmount) {
				if (controller.signal.aborted) return;
				setIsApplying(true);
				try {
					await removePromoCode({
						checkoutId: checkout.id,
						promoCode: currentVoucher,
						languageCode: "EN_US",
					});
					await addPromoCode({
						checkoutId: checkout.id,
						promoCode: info.voucherCode,
						languageCode: "EN_US",
					});
					appliedRef.current = true;
				} catch {
					// Silently fail
				} finally {
					if (!controller.signal.aborted) setIsApplying(false);
				}
			}
		})();

		return () => controller.abort();
	}, [authenticated, checkout?.id]); // eslint-disable-line react-hooks/exhaustive-deps

	return {
		groupInfo,
		isApplying,
		isGroupVoucherApplied: appliedRef.current && !!checkout?.voucherCode?.startsWith(GROUP_VOUCHER_PREFIX),
	};
}
