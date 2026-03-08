import { StripeComponent } from "./StripeV2DropIn/stripeComponent";
import { stripeV2GatewayId } from "./StripeV2DropIn/types";
import { StoreCreditPayment } from "./StoreCreditPayment/StoreCreditPayment";
import { storeCreditGatewayId } from "./StoreCreditPayment/types";

export const paymentMethodToComponent = {
	[stripeV2GatewayId]: StripeComponent,
	[storeCreditGatewayId]: StoreCreditPayment,
};
