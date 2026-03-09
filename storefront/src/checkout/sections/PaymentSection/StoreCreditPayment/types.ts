// The gateway ID must match the inventory-ops app ID in Saleor
// This is the MANIFEST_APP_ID env var from inventory-ops
export const storeCreditGatewayId = "saleor.app.inventory-ops";
export type StoreCreditGatewayId = typeof storeCreditGatewayId;
