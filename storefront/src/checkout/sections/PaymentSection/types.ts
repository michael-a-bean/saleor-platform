import { type StripeV2GatewayId } from "./StripeV2DropIn/types";
import { type PaymentGatewayConfig } from "@/checkout/graphql";

export type PaymentGatewayId = StripeV2GatewayId;

export type ParsedStripeGateway = ParsedPaymentGateway<StripeV2GatewayId, { stripePublishableKey?: string }>;

export type ParsedPaymentGateways = ReadonlyArray<ParsedStripeGateway>;

export interface ParsedPaymentGateway<ID extends string, TData extends Record<string, any>>
	extends Omit<PaymentGatewayConfig, "data" | "id"> {
	data: TData;
	id: ID;
}

export type PaymentStatus = "paidInFull" | "overpaid" | "none" | "authorized";
