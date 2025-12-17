import { AdyenDropIn } from "./AdyenDropIn/AdyenDropIn";
import { adyenGatewayId } from "./AdyenDropIn/types";
import { DummyComponent } from "./DummyDropIn/dummyComponent";
import { dummyGatewayId } from "./DummyDropIn/types";
import { LegacyDummyComponent } from "./LegacyDummyDropIn/legacyDummyComponent";
import { legacyDummyGatewayId } from "./LegacyDummyDropIn/types";
import { StripeComponent } from "./StripeV2DropIn/stripeComponent";
import { stripeV2GatewayId } from "./StripeV2DropIn/types";

export const paymentMethodToComponent = {
	[adyenGatewayId]: AdyenDropIn,
	[stripeV2GatewayId]: StripeComponent,
	[dummyGatewayId]: DummyComponent,
	[legacyDummyGatewayId]: LegacyDummyComponent,
};
