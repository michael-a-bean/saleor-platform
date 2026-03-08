import type { MeWithAddressesQuery } from "@/gql/graphql";

export type AccountAddress = NonNullable<MeWithAddressesQuery["me"]>["addresses"][number];
